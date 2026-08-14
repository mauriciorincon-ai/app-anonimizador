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
  colisionesDeBoveda,
  construirBoveda,
  huellaDeBoveda,
  paresDeBoveda,
  type Boveda,
  type EntradaDeBoveda,
} from "@/engine/boveda";
import { clasificar, type Diagnostico } from "@/engine/clasificador";
import { ConstructorColumnar, type TablaColumnar } from "@/engine/columnar";
import { filasDeCsv, nombreDelArchivoAnonimizado } from "@/engine/csv";
import { medirDiversidad } from "@/engine/diversidad";
import { muestraDeColumna } from "@/engine/muestra";
import { hashDePolitica, type Politica } from "@/engine/politica";
import {
  construirInformeDeRestauracion,
  nombreDelInforme,
} from "@/engine/reporte";
import { restaurar, type Restauracion } from "@/engine/restaurar";
import { evaluarRiesgo } from "@/engine/riesgo";
import { aplicarPolitica } from "@/engine/tecnicas";
import { medirUtilidad } from "@/engine/utilidad";
import { formatoDeArchivo } from "@/lib/archivo";
import {
  abrirBoveda,
  sellarBoveda,
  EXTENSION_DE_BOVEDA,
} from "@/lib/boveda-archivo";
import { derivarLlave } from "@/lib/llave";
import { Sha256 } from "@/lib/sha256";

import type {
  EtapaDelWorker,
  Informe,
  MensajeAlWorker,
  MensajeDelWorker,
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
/** El material de la bóveda: pares (original, seudónimo) de las columnas reversibles. */
let correspondencias: readonly EntradaDeBoveda[] = [];

/** Identidad de la llave, para poder atarle la bóveda. La `CryptoKey` no sale de aquí; esto sí. */
let huellaDeLlave = "";
let salDeLlave = "";

async function derivar(frase: string, sal: string): Promise<void> {
  avisar("derivando-llave", tabla?.filas ?? 0, 0, 0);
  const proyecto = await derivarLlave(frase, sal);
  llave = proyecto.clave;
  huellaDeLlave = proyecto.huella;
  salDeLlave = proyecto.sal;
  // Solo la huella cruza. La `CryptoKey` es no extraíble y ni siquiera podría serializarse con
  // sus bytes: lo que se evita mandando solo esto es que exista en la página, punto.
  enviar({ tipo: "llave-lista", huella: proyecto.huella });
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
      pendientesDeMondrian: resultado.pendientesDeMondrian,
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
    // El material de la bóveda se guarda AQUÍ, del lado de la frontera donde están los originales.
    // Sellarlo es un mensaje aparte porque exige la frase de paso del usuario, que se pide después.
    correspondencias = resultado.correspondencias;

    // Aquí vivía la proyección campo a campo del reparto de Mondrian, para que su tabla —el archivo
    // entero— no cruzara la frontera dentro de `ResultadoDeMondrian`. **Ya no hace falta porque el
    // reparto no cruza en absoluto** (deuda B2, pagada arriba): lo consume `balanceDelTratamiento`
    // en este mismo lado. La defensa más barata contra que un dato cruce sigue siendo que no cruce.
    enviar({
      tipo: "transformado",
      // Las cuatro estructuras crudas —`mondrian`, `diversidad`, `colisiones` y
      // `pendientesDeMondrian`— **ya no cruzan** (deuda B2, pagada en el S4). Se consumen arriba,
      // en `balanceDelTratamiento`, y lo que la pantalla necesita es la conclusión: las salvedades
      // del balance, ya ordenadas y con su gravedad decidida.
      resultado: {
        hashDePolitica: hashDeLaPolitica,
        balance,
        utilidad: medirUtilidad(original, resultado.tabla),
        suprimidas: resultado.suprimidas,
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
  // **La huella de SALIDA se calcula AQUÍ, sobre los mismos trozos que forman el `Blob`** — es lo
  // que convierte el documento del S2 en un certificado verificable (S4).
  //
  // Tres cosas que hacen que esto sea correcto y no una conveniencia:
  //
  //   1. **Son exactamente los bytes del archivo.** `new Blob([...cadenas])` codifica cada cadena
  //      como UTF-8, así que hashear `TextEncoder().encode(trozo)` en el mismo orden da el mismo
  //      flujo de bytes que el navegador va a escribir en el disco. No es una aproximación.
  //   2. **No hay segunda pasada.** Volver a leer el `Blob` para hashearlo costaría recorrer otra
  //      vez los ~130 MB del peor caso; aquí el costo es el del hash y nada más.
  //   3. **Los bytes no cruzan.** A la página va la huella —64 hex—, igual que ya cruza la del
  //      archivo de entrada desde el S1. La frontera del ADR-005 no se toca: el `Blob` sigue
  //      saliendo como asa opaca.
  const huellaDeSalida = new Sha256();
  const codificador = new TextEncoder();
  const trozos: string[] = [];
  let acumulado = "";
  let filas = 0;
  for (const fila of filasDeCsv(transformada)) {
    acumulado += fila;
    if (++filas % FILAS_POR_TROZO === 0) {
      trozos.push(acumulado);
      huellaDeSalida.actualizar(codificador.encode(acumulado));
      acumulado = "";
    }
  }
  if (acumulado) {
    trozos.push(acumulado);
    huellaDeSalida.actualizar(codificador.encode(acumulado));
  }

  const blob = new Blob(trozos, { type: "text/csv;charset=utf-8" });
  enviar({
    tipo: "archivo",
    blob,
    nombre: nombreDelArchivoAnonimizado(hashDeLaPolitica),
    bytes: blob.size,
    proposito: "anonimizado",
    sha256: huellaDeSalida.terminar(),
  });
}

// ── El regreso (S3) ───────────────────────────────────────────────────────────────────────────
//
// Mismo worker, otro flujo. Se reutiliza el parser —leer un CSV es leer un CSV— y **no** se
// reutiliza el pipeline de diagnóstico: el archivo que devolvió el tercero no necesita saber qué
// columna es un cuasi-identificador, necesita saber cuáles salieron de la bóveda.
//
// La bóveda entra por aquí como `File` y sale como conteos. Ni un par de la correspondencia cruza a
// la página: son los valores ORIGINALES del usuario, el material más sensible que Velo maneja.

/** La bóveda abierta. Vive aquí, como la llave y la tabla, y muere con el worker. */
let bovedaActual: Boveda | null = null;
/** El archivo que devolvió el tercero, ya parseado. */
let devuelta: TablaColumnar | null = null;
let restaurada: Restauracion | null = null;
let datosDelDevuelto = { nombre: "", bytes: 0, sha256: "" };

/** Sella la bóveda del tratamiento recién hecho y la entrega como asa (ADR-005). */
async function sellar(frase: string): Promise<void> {
  if (correspondencias.length === 0 || huellaDeLlave === "") {
    enviar({ tipo: "error", motivo: "sin-boveda" });
    return;
  }
  avisar("sellando-boveda", transformada?.filas ?? 0, 0, 0);
  try {
    const boveda = construirBoveda(
      { huellaDeLlave, salDeLlave, hashDePolitica: hashDeLaPolitica },
      correspondencias,
    );
    const bytes = await sellarBoveda(boveda, frase);
    // El `Blob` se construye aquí y viaja como asa, igual que el CSV anonimizado: la página recibe
    // una referencia opaca, jamás bytes que pudiera leer.
    const blob = new Blob([bytes], { type: "application/octet-stream" });
    enviar({
      tipo: "archivo",
      blob,
      nombre: `velo-boveda-${hashDeLaPolitica.slice(0, 8)}${EXTENSION_DE_BOVEDA}`,
      bytes: blob.size,
      proposito: "boveda",
    });
  } catch {
    enviar({ tipo: "error", motivo: "sin-boveda" });
  }
}

async function abrir(archivo: File, frase: string): Promise<void> {
  avisar("abriendo-boveda", 0, 0, archivo.size);
  let bytes: Uint8Array;
  try {
    // `arrayBuffer()` solo puede llamarse aquí: el gate de privacidad lo veta fuera de este
    // directorio, que es lo que impide que un componente abra una bóveda.
    bytes = new Uint8Array(await archivo.arrayBuffer());
  } catch {
    enviar({
      tipo: "boveda-rechazada",
      motivo: "lectura-fallida",
      detalle: "No se pudo leer el archivo.",
    });
    return;
  }

  const resultado = await abrirBoveda(bytes, frase);
  if (!resultado.ok) {
    enviar({
      tipo: "boveda-rechazada",
      motivo: resultado.motivo,
      detalle: resultado.detalle,
    });
    return;
  }

  bovedaActual = resultado.boveda;
  enviar({
    tipo: "boveda-abierta",
    resumen: {
      huella: huellaDeBoveda(resultado.boveda),
      huellaDeLlave: resultado.boveda.huellaDeLlave,
      hashDePolitica: resultado.boveda.hashDePolitica,
      columnas: resultado.boveda.columnas.map((c) => c.columna),
      pares: paresDeBoveda(resultado.boveda),
      colisiones: colisionesDeBoveda(resultado.boveda),
    },
  });
}

/** Parsea el archivo devuelto. Sin clasificar y sin medir riesgo: es otro flujo. */
async function analizarDevuelto(archivo: File): Promise<void> {
  try {
    datosDelDevuelto = {
      nombre: archivo.name,
      bytes: archivo.size,
      sha256: await tomarHuella(archivo),
    };
  } catch {
    enviar({ tipo: "error", motivo: "lectura-fallida" });
    return;
  }

  let constructor: ConstructorColumnar | null = null;
  let filas = 0;
  let proximoAviso = FILAS_POR_AVISO;

  Papa.parse<string[]>(archivo, {
    header: false,
    skipEmptyLines: "greedy",
    worker: false,
    chunk(resultados) {
      const datos = resultados.data;
      let desde = 0;
      if (!constructor) {
        constructor = new ConstructorColumnar(datos[0] ?? [], 1 << 16);
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
      devuelta = (constructor as ConstructorColumnar).finalizar();
      if (devuelta.filas === 0) {
        enviar({ tipo: "error", motivo: "archivo-vacio" });
        return;
      }
      enviar({
        tipo: "devuelto-listo",
        nombre: datosDelDevuelto.nombre,
        bytes: datosDelDevuelto.bytes,
        filas: devuelta.filas,
        columnas: devuelta.columnas.length,
        sha256: datosDelDevuelto.sha256,
      });
    },
    error() {
      enviar({ tipo: "error", motivo: "lectura-fallida" });
    },
  });
}

function restaurarDevuelto(): void {
  if (!devuelta || !bovedaActual) {
    enviar({ tipo: "error", motivo: devuelta ? "sin-boveda" : "sin-devuelto" });
    return;
  }
  avisar("restaurando", devuelta.filas, 0, 0);
  try {
    const resultado = restaurar(devuelta, bovedaActual);
    restaurada = resultado;
    // Campos UNO A UNO, sin `Omit`: la tabla restaurada lleva los valores originales del usuario y
    // reenviarla habría tirado la frontera por la ventana sin que la pantalla cambiara.
    enviar({
      tipo: "restaurado",
      resumen: {
        columnas: resultado.columnas,
        reconocimiento: resultado.reconocimiento,
        totales: resultado.totales,
        proporcionRestaurada: resultado.proporcionRestaurada,
        salvedades: resultado.salvedades,
        esTitular: resultado.esTitular,
        filas: resultado.tabla.filas,
      },
    });
  } catch {
    enviar({ tipo: "error", motivo: "restauracion-fallida" });
  }
}

function construirRestaurado(): void {
  if (!restaurada) {
    enviar({ tipo: "error", motivo: "sin-devuelto" });
    return;
  }
  avisar("escribiendo", restaurada.tabla.filas, 0, 0);
  const trozos: string[] = [];
  let acumulado = "";
  let filas = 0;
  for (const fila of filasDeCsv(restaurada.tabla)) {
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
    nombre: `velo-restaurado-${datosDelDevuelto.sha256.slice(0, 8)}.csv`,
    bytes: blob.size,
    proposito: "restaurado",
  });
}

function construirInformeDelRegreso(fecha: string): void {
  if (!restaurada || !bovedaActual) {
    enviar({ tipo: "error", motivo: "sin-devuelto" });
    return;
  }
  const html = construirInformeDeRestauracion({
    archivo: {
      nombre: datosDelDevuelto.nombre,
      bytes: datosDelDevuelto.bytes,
      sha256: datosDelDevuelto.sha256,
    },
    restauracion: restaurada,
    huellaDeBoveda: huellaDeBoveda(bovedaActual),
    hashDePolitica: bovedaActual.hashDePolitica,
    fecha,
  });
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  enviar({
    tipo: "archivo",
    blob,
    nombre: nombreDelInforme(datosDelDevuelto.nombre),
    bytes: blob.size,
    proposito: "informe-del-regreso",
  });
}

alcance.addEventListener("message", (evento: MessageEvent<MensajeAlWorker>) => {
  const mensaje = evento.data;
  if (mensaje?.tipo === "analizar") void analizar(mensaje.archivo);
  if (mensaje?.tipo === "derivar-llave")
    void derivar(mensaje.frase, mensaje.sal);
  if (mensaje?.tipo === "transformar") void transformar(mensaje.politica);
  if (mensaje?.tipo === "construir-archivo") construirArchivo();
  if (mensaje?.tipo === "sellar-boveda") void sellar(mensaje.frase);
  if (mensaje?.tipo === "abrir-boveda")
    void abrir(mensaje.archivo, mensaje.frase);
  if (mensaje?.tipo === "analizar-devuelto")
    void analizarDevuelto(mensaje.archivo);
  if (mensaje?.tipo === "restaurar") restaurarDevuelto();
  if (mensaje?.tipo === "construir-restaurado") construirRestaurado();
  if (mensaje?.tipo === "construir-informe-del-regreso")
    construirInformeDelRegreso(mensaje.fecha);
});
