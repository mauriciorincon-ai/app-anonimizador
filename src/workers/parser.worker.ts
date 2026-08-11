/// <reference lib="webworker" />
// El worker es LA FRONTERA de Velo.
//
// Los datos crudos del usuario viven aquí y solo aquí. Hacia la UI viajan agregados, metadatos y
// muestras ya enmascaradas — jamás el dataset. Dos razones, y ninguna es de estilo:
//   1. Privacidad: si el hilo principal nunca ve el contenido, ningún componente, ninguna
//      librería de UI y ningún reporte de error puede filtrarlo por accidente.
//   2. Rendimiento: parsear 130 MB en el hilo principal congela la pestaña; aquí no toca un frame.
//
// Por eso el diagnóstico COMPLETO se calcula aquí dentro: leer el archivo en el worker y luego
// mandar la tabla a la página para clasificarla habría tirado la frontera por la ventana. Lo que
// cruza es el informe; la tabla se queda, y muere cuando el worker se termina.
//
// El archivo se lee por chunks (PapaParse en modo streaming): nunca existe una copia completa del
// CSV en memoria, solo la tabla columnar que se va construyendo.
import Papa from "papaparse";

import { balanceDelTratamiento } from "@/engine/balance";
import {
  clasificar,
  posicionesDeMuestra,
  type Diagnostico,
} from "@/engine/clasificador";
import {
  ConstructorColumnar,
  type ColumnaColumnar,
  type TablaColumnar,
} from "@/engine/columnar";
import { filasDeCsv, nombreDelArchivoAnonimizado } from "@/engine/csv";
import { medirDiversidad } from "@/engine/diversidad";
import { enmascarar } from "@/engine/mascara";
import { hashDePolitica, tecnicaDe, type Politica } from "@/engine/politica";
import { evaluarRiesgo } from "@/engine/riesgo";
import { aplicarPolitica } from "@/engine/tecnicas";
import { medirUtilidad } from "@/engine/utilidad";
import { formatoDeArchivo } from "@/lib/archivo";
import { derivarLlave } from "@/lib/llave";
import { Sha256 } from "@/lib/sha256";

import type {
  EtapaDelWorker,
  Informe,
  MensajeAlWorker,
  MensajeDelWorker,
  MuestraDeTransformacion,
} from "./contrato";

const alcance = self as unknown as DedicatedWorkerGlobalScope;

/** La tabla vive en el worker entre mensajes: la UI la consulta, nunca la recibe. */
let tabla: TablaColumnar | null = null;

/** El diagnóstico se guarda porque la transformación lo necesita: qué es cada columna. */
let diagnosticoActual: Diagnostico | null = null;

/** Cada cuántas filas se avisa del avance. Suficiente para una barra fluida, sin inundar. */
const FILAS_POR_AVISO = 25_000;

/** Trozo con el que se recorre el archivo para la huella. Ninguno sobrevive al siguiente. */
const TROZO_DE_HUELLA = 4 * 1024 * 1024;

/** Huella del archivo, tal cual está en el disco. Ver `src/lib/sha256.ts` para el por qué. */
let huella = "";

/**
 * SHA-256 del archivo, leyéndolo por partes.
 *
 * Va PRIMERO, antes de parsear: la huella tiene que ser la de los bytes que el usuario tiene,
 * sin pasar por ninguna interpretación de Velo. Y como se lee por trozos, en ningún momento
 * existe una copia completa del archivo en memoria.
 */
async function tomarHuella(archivo: File): Promise<string> {
  const acumulador = new Sha256();
  for (let desde = 0; desde < archivo.size; desde += TROZO_DE_HUELLA) {
    const trozo = await archivo
      .slice(desde, desde + TROZO_DE_HUELLA)
      .arrayBuffer();
    acumulador.actualizar(new Uint8Array(trozo));
    avisar(
      "huella",
      0,
      Math.min(desde + TROZO_DE_HUELLA, archivo.size),
      archivo.size,
    );
  }
  return acumulador.terminar();
}

async function analizar(archivo: File): Promise<void> {
  try {
    huella = await tomarHuella(archivo);
  } catch {
    enviar({ tipo: "error", motivo: "lectura-fallida" });
    return;
  }

  if (formatoDeArchivo(archivo.name) === "excel") {
    void leerExcel(archivo);
    return;
  }
  leerCsv(archivo);
}

/**
 * Excel es el eslabón débil y se trata como tal. SheetJS no tiene lectura en streaming en el
 * navegador (issue #2757): el libro entero se carga en memoria y de ahí sale una matriz completa
 * — dos copias del archivo vivas a la vez. Por eso Velo declara un TOPE para .xlsx y no para CSV
 * (medido en el spike B; ver decisions/003-excel-suministro-y-tope.md).
 *
 * El `import()` es dinámico a propósito: SheetJS pesa ~900 KB y jamás debe entrar al bundle
 * inicial de una página que quizá solo reciba CSV.
 */
async function leerExcel(archivo: File): Promise<void> {
  const inicio = performance.now();
  try {
    const XLSX = await import("xlsx");
    const buffer = await archivo.arrayBuffer();
    const libro = XLSX.read(buffer, {
      dense: true,
      cellDates: false,
      cellNF: false,
    });
    const hoja = libro.Sheets[libro.SheetNames[0]];
    const matriz = XLSX.utils.sheet_to_json<string[]>(hoja, {
      header: 1,
      raw: false,
      defval: "",
    });

    if (matriz.length === 0) {
      enviar({ tipo: "error", motivo: "archivo-vacio" });
      return;
    }
    const constructor = new ConstructorColumnar(matriz[0], matriz.length);
    for (let i = 1; i < matriz.length; i++) constructor.agregarFila(matriz[i]);
    tabla = constructor.finalizar();
    diagnosticar(archivo, "excel", performance.now() - inicio);
  } catch {
    // El mensaje de la excepción NUNCA se reenvía: puede citar contenido de la hoja.
    enviar({ tipo: "error", motivo: "excel-excede-memoria" });
  }
}

function leerCsv(archivo: File): void {
  const inicio = performance.now();
  let constructor: ConstructorColumnar | null = null;
  let filas = 0;
  let proximoAviso = FILAS_POR_AVISO;

  Papa.parse<string[]>(archivo, {
    // header: false a propósito. Con `header: true` PapaParse construye un objeto por fila —
    // 500.000 objetos de 24 propiedades que nacen para morir. Leemos el encabezado nosotros.
    header: false,
    skipEmptyLines: "greedy",
    worker: false, // ya estamos DENTRO de un worker; anidar otro no aporta nada
    chunk(resultados) {
      const datos = resultados.data;
      let desde = 0;
      if (!constructor) {
        const encabezado = datos[0] ?? [];
        constructor = new ConstructorColumnar(encabezado, 1 << 16);
        desde = 1;
      }
      for (let i = desde; i < datos.length; i++)
        constructor.agregarFila(datos[i]);
      filas += datos.length - desde;

      if (filas >= proximoAviso) {
        proximoAviso = filas + FILAS_POR_AVISO;
        avisar("leyendo", filas, resultados.meta.cursor, archivo.size);
      }
    },
    complete() {
      if (!constructor) {
        enviar({ tipo: "error", motivo: "archivo-vacio" });
        return;
      }
      tabla = constructor.finalizar();
      diagnosticar(archivo, "csv", performance.now() - inicio);
    },
    error() {
      // El motivo del parser NUNCA se reenvía: puede citar el contenido de la línea que falló.
      enviar({ tipo: "error", motivo: "lectura-fallida" });
    },
  });
}

/**
 * Clasificación + riesgo, dentro del worker. Los dos avisos de etapa se envían ANTES de empezar
 * cada cálculo: el trabajo es síncrono y bloquea este hilo, pero el mensaje ya está encolado hacia
 * la página, que sigue respondiendo y puede pintar el avance.
 */
function diagnosticar(
  archivo: File,
  formato: "csv" | "excel",
  msLectura: number,
): void {
  if (!tabla) return;
  if (tabla.filas === 0) {
    enviar({ tipo: "error", motivo: "archivo-vacio" });
    return;
  }

  const inicio = performance.now();
  avisar("clasificando", tabla.filas, archivo.size, archivo.size);
  const diagnostico = clasificar(tabla);
  diagnosticoActual = diagnostico;

  avisar("midiendo-riesgo", tabla.filas, archivo.size, archivo.size);
  const { riesgo, advisor } = evaluarRiesgo(tabla, diagnostico);

  const informe: Informe = {
    archivo: {
      nombre: archivo.name,
      bytes: archivo.size,
      formato,
      sha256: huella,
    },
    diagnostico,
    riesgo,
    advisor,
    medicion: {
      msLectura: Math.round(msLectura),
      msDiagnostico: Math.round(performance.now() - inicio),
      heapMb: heapUsadoMb(),
    },
  };
  enviar({ tipo: "listo", informe });
}

function enviar(mensaje: MensajeDelWorker): void {
  alcance.postMessage(mensaje);
}

function avisar(
  etapa: EtapaDelWorker,
  filas: number,
  bytesLeidos: number,
  bytesTotales: number,
): void {
  enviar({ tipo: "progreso", etapa, filas, bytesLeidos, bytesTotales });
}

/** Heap usado por ESTE worker, en MB. Solo Chromium lo expone; en el resto devuelve null. */
function heapUsadoMb(): number | null {
  const memoria = (
    performance as Performance & { memory?: { usedJSHeapSize: number } }
  ).memory;
  return memoria ? Math.round(memoria.usedJSHeapSize / 1_048_576) : null;
}

// ── La transformación, del mismo lado de la frontera ──────────────────────────────────────────
//
// Todo esto vive aquí por la misma razón que el diagnóstico: transformar exige leer cada celda, y
// leer cada celda en el hilo principal significaría que la tabla cruzó. Hacia la página viajan el
// balance, la utilidad, unas muestras y —al final— un `Blob`, que es un asa, no un contenido.

/** La llave del proyecto. Nace aquí, se queda aquí, y muere con el worker. */
let llave: CryptoKey | null = null;
/** La tabla ya transformada, para poder escribir el archivo sin rehacer el trabajo. */
let transformada: TablaColumnar | null = null;
let hashDeLaPolitica = "";

async function derivar(frase: string, sal: string): Promise<void> {
  avisar("derivando-llave", tabla?.filas ?? 0, 0, 0);
  const proyecto = await derivarLlave(frase, sal);
  llave = proyecto.clave;
  // Solo la huella cruza. La `CryptoKey` es no extraíble y ni siquiera podría serializarse con
  // sus bytes: lo que se evita mandando solo esto es que exista en la página, punto.
  enviar({ tipo: "llave-lista", huella: proyecto.huella });
}

/** Hasta cuántas filas se enseñan en la vista previa. Suficiente para reconocer el cambio. */
const FILAS_DE_MUESTRA = 6;

function muestraDeColumna(
  original: ColumnaColumnar,
  nueva: ColumnaColumnar | undefined,
  politica: Politica,
  categoria: string,
  filas: number,
): MuestraDeTransformacion {
  const tecnica = tecnicaDe(politica, original.nombre).tipo;
  if (nueva === undefined) {
    return {
      nombre: original.nombre,
      tecnica,
      filas: [],
      despuesEnmascarado: false,
      omitida: false,
      suprimida: true,
    };
  }

  const posiciones = posicionesDeMuestra(filas, FILAS_DE_MUESTRA);
  const pares = posiciones.map((p) => ({
    antes: original.valores[original.codigos[p]],
    despues: nueva.valores[nueva.codigos[p]],
  }));
  const cambio = pares.some((par) => par.antes !== par.despues);

  // Una columna sensible que NO cambió no tiene nada que enseñar: su «después» es su «antes», y
  // enseñarlo aquí sería sacar un dato del art. 5 a una pantalla que no lo necesita.
  if (categoria === "dato-sensible" && !cambio) {
    return {
      nombre: original.nombre,
      tecnica,
      filas: [],
      despuesEnmascarado: true,
      omitida: true,
      suprimida: false,
    };
  }

  return {
    nombre: original.nombre,
    tecnica,
    filas: pares.map((par) => ({
      antes: enmascarar(par.antes),
      // Completo solo si cambió: un seudónimo o un intervalo no son el dato de nadie, y
      // enmascararlos volvería inútil la única pantalla que responde «¿qué recibe el otro?».
      despues: cambio ? par.despues : enmascarar(par.despues),
    })),
    despuesEnmascarado: !cambio,
    omitida: false,
    suprimida: false,
  };
}

async function transformar(politica: Politica): Promise<void> {
  if (!tabla || !diagnosticoActual) {
    enviar({ tipo: "error", motivo: "sin-tabla" });
    return;
  }

  const inicio = performance.now();
  const original = tabla;
  const diagnostico = diagnosticoActual;

  try {
    avisar("transformando", original.filas, 0, 0);
    const resultado = await aplicarPolitica(original, politica, llave);

    avisar("midiendo-el-despues", original.filas, 0, 0);
    const sensibles = diagnostico.columnas
      .filter((c) => c.categoria === "dato-sensible")
      .map((c) => c.nombre)
      .filter((n) => !resultado.suprimidas.includes(n));
    const qis = diagnostico.columnas
      .filter((c) => c.categoria === "cuasi-identificador")
      .map((c) => c.nombre)
      .filter((n) => !resultado.suprimidas.includes(n));
    const diversidad = medirDiversidad(resultado.tabla, qis, sensibles);

    const balance = balanceDelTratamiento({
      tablaOriginal: original,
      tablaTransformada: resultado.tabla,
      diagnostico,
      politica,
      suprimidas: resultado.suprimidas,
      colisiones: resultado.colisiones,
      mondrian: resultado.mondrian,
      diversidad,
    });

    const porNombre = new Map(
      resultado.tabla.columnas.map((c) => [c.nombre, c]),
    );
    const categorias = new Map(
      diagnostico.columnas.map((c) => [c.nombre, c.categoria as string]),
    );
    const muestras = original.columnas.map((columna) =>
      muestraDeColumna(
        columna,
        porNombre.get(columna.nombre),
        politica,
        categorias.get(columna.nombre) ?? "no-personal",
        original.filas,
      ),
    );

    transformada = resultado.tabla;
    hashDeLaPolitica = hashDePolitica(politica);

    // `mondrian` viaja SIN su tabla: `ResultadoDeMondrian` la lleva dentro, y reenviarlo entero
    // habría mandado el archivo a la página sin que se notara en pantalla. Se copian los campos
    // UNO A UNO en vez de con un `Omit`: así la frontera es literal, y el día que el reparto gane
    // un campo nuevo no cruza solo — hay que escribirlo aquí y mirarlo.
    const m = resultado.mondrian;
    const mondrian = m
      ? {
          kObjetivo: m.kObjetivo,
          kAlcanzado: m.kAlcanzado,
          alcanzado: m.alcanzado,
          motivo: m.motivo,
          dimensiones: m.dimensiones,
          sinCortes: m.sinCortes,
          particiones: m.particiones,
        }
      : null;

    enviar({
      tipo: "transformado",
      resultado: {
        hashDePolitica: hashDeLaPolitica,
        balance,
        utilidad: medirUtilidad(original, resultado.tabla),
        mondrian,
        diversidad,
        suprimidas: resultado.suprimidas,
        colisiones: resultado.colisiones,
        pendientesDeMondrian: resultado.pendientesDeMondrian,
        muestras,
        ms: Math.round(performance.now() - inicio),
      },
    });
  } catch {
    // El mensaje de la excepción NUNCA se reenvía: puede citar el valor de la celda que falló.
    enviar({
      tipo: "error",
      motivo: llave === null ? "sin-llave" : "transformacion-fallida",
    });
  }
}

/** Cuántas filas se juntan antes de cerrar un trozo del Blob. */
const FILAS_POR_TROZO = 20_000;

function construirArchivo(): void {
  if (!transformada) {
    enviar({ tipo: "error", motivo: "sin-tabla" });
    return;
  }
  avisar("escribiendo", transformada.filas, 0, 0);

  // El CSV se acumula en trozos y no en una sola cadena: 500.000 filas × 24 columnas son ~130 MB
  // de texto, y concatenarlos en un solo string obligaría a tener dos copias vivas al duplicar el
  // buffer. `Blob` acepta la lista y la junta él, una sola vez.
  const trozos: string[] = [];
  let acumulado = "";
  let filas = 0;
  for (const fila of filasDeCsv(transformada)) {
    acumulado += fila;
    if (++filas % FILAS_POR_TROZO === 0) {
      trozos.push(acumulado);
      acumulado = "";
    }
  }
  if (acumulado) trozos.push(acumulado);

  const blob = new Blob(trozos, { type: "text/csv;charset=utf-8" });
  enviar({
    tipo: "archivo",
    blob,
    nombre: nombreDelArchivoAnonimizado(hashDeLaPolitica),
    bytes: blob.size,
  });
}

alcance.addEventListener("message", (evento: MessageEvent<MensajeAlWorker>) => {
  const mensaje = evento.data;
  if (mensaje?.tipo === "analizar") void analizar(mensaje.archivo);
  if (mensaje?.tipo === "derivar-llave")
    void derivar(mensaje.frase, mensaje.sal);
  if (mensaje?.tipo === "transformar") void transformar(mensaje.politica);
  if (mensaje?.tipo === "construir-archivo") construirArchivo();
});
