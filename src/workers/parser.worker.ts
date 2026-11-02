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
  anadirEntrada,
  bitacoraVacia,
  huellaDeBitacora,
  type Bitacora,
  type EntradaDeBitacora,
} from "@/engine/bitacora";
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
import { escribirJson } from "@/engine/json/escritor";
import {
  columnasNumericas,
  leerJson,
  type LecturaJson,
} from "@/engine/json/lector";
import { ErrorDeJson } from "@/engine/json/tipos";
import type { EstructuraJson } from "@/engine/json/tipos";
import {
  EXTENSION_DEL_FORMATO,
  MIME_DEL_FORMATO,
} from "@/engine/metadatos/deteccion";
import {
  ErrorDeMetadatos,
  type FormatoBinario,
} from "@/engine/metadatos/tipos";
import { muestraDeColumna } from "@/engine/muestra";
import {
  generalizarOptimo,
  TOPE_DE_NODOS,
  type ResultadoOptimo,
} from "@/engine/optima";
import { anonimizarConMondrian } from "@/engine/mondrian";
import { nombresDeNiveles } from "@/engine/jerarquias";
import {
  columnasDeMondrian,
  hashDePolitica,
  type GeneralizacionOptima,
  type JerarquiaDeLaPolitica,
  type Politica,
} from "@/engine/politica";
import {
  construirInformeDeRestauracion,
  nombreDelInforme,
} from "@/engine/reporte";
import { restaurar, type Restauracion } from "@/engine/restaurar";
import { DOMINIO_MAXIMO, informeDePrivacidad } from "@/engine/ruido";
import {
  clasesDeEquivalencia,
  evaluarRiesgo,
  riesgoProsecutor,
  type ClasesDeEquivalencia,
} from "@/engine/riesgo";
import { estimarRiesgo } from "@/engine/riesgo-estimado";
import { entropiaEnBits } from "@/engine/utilidad";
import { aplicarPolitica } from "@/engine/tecnicas";
import { medirUtilidad } from "@/engine/utilidad";
import { esDeMetadatos, formatoDeArchivo, motivoDelTope } from "@/lib/archivo";
import {
  abrirBitacora,
  sellarBitacora,
  NOMBRE_DE_BITACORA,
} from "@/lib/bitacora-archivo";
import {
  abrirBoveda,
  sellarBoveda,
  EXTENSION_DE_BOVEDA,
} from "@/lib/boveda-archivo";
import { mensaje as mensajeDeMotor, type Idioma } from "@/lib/idioma";
import { derivarLlave } from "@/lib/llave";
import { Sha256 } from "@/lib/sha256";

import type {
  ComparacionDeGeneralizacion,
  EtapaDelWorker,
  FormatoDeArchivo,
  GeneralizacionAplicada,
  Informe,
  LadoDeLaComparacion,
  MensajeAlWorker,
  MensajeDelWorker,
} from "./contrato";
import { ArchivoCambio, fuenteDeArchivo } from "./json";
import { FormatoNoCoincide, leerBinario, limpiarBinario } from "./metadatos";

const alcance = self as unknown as DedicatedWorkerGlobalScope;

/** La tabla vive en el worker entre mensajes: la UI la consulta, nunca la recibe. */
let tabla: TablaColumnar | null = null;

/** Qué formato tenía el archivo que entró: decide cómo se escribe el de salida. */
let formatoOriginal: FormatoDeArchivo = "csv";

/**
 * Solo en un JSON: la lectura (con las clases de cada celda) y el archivo, que se vuelve a leer
 * UNA vez más para escribir la salida con la estructura y el orden de claves del original. El
 * archivo no se guarda en memoria: se guarda la referencia, y se lee por trozos.
 */
let lecturaJson: LecturaJson | null = null;
let archivoDeEntrada: File | null = null;

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

  const formato = formatoDeArchivo(archivo.name);
  if (formato !== null && esDeMetadatos(formato)) {
    void leerMetadatos(archivo, formato);
    return;
  }
  if (formato === "excel") {
    void leerExcel(archivo);
    return;
  }
  if (formato === "json") {
    void leerJsonDelArchivo(archivo);
    return;
  }
  leerCsv(archivo);
}

/**
 * JSON y JSON Lines. El lector es PROPIO (ver `src/engine/json/`): `JSON.parse` reordena las claves
 * enteras, pierde los números que no caben en un double y, cuando falla, cita el contenido. Aquí
 * solo se le da el archivo como texto y se traduce su único error a un mensaje que NO cita nada:
 * la clave del motivo y, si la hay, la línea.
 */
async function leerJsonDelArchivo(archivo: File): Promise<void> {
  const inicio = performance.now();
  if (archivo.size === 0) {
    enviar({ tipo: "error", motivo: "archivo-vacio" });
    return;
  }
  try {
    const lectura = await leerJson(
      fuenteDeArchivo(archivo, {
        alAvanzar: (leidos) => avisar("leyendo", 0, leidos, archivo.size),
      }),
    );
    tabla = lectura.tabla;
    lecturaJson = lectura;
    archivoDeEntrada = archivo;
    formatoOriginal = "json";
    diagnosticar(
      archivo,
      "json",
      performance.now() - inicio,
      lectura.estructura,
    );
  } catch (error) {
    // El mensaje de la excepción NUNCA se reenvía: solo la clave del motivo y el número de línea.
    if (error instanceof ErrorDeJson)
      enviar({
        tipo: "error",
        motivo: error.motivo,
        ...(error.linea === null ? {} : { linea: error.linea }),
      });
    else enviar({ tipo: "error", motivo: "lectura-fallida" });
  }
}

// ── PDF e imágenes (S6): metadatos, no tablas ─────────────────────────────────────────────────
//
// El archivo entero entra a la memoria del worker —un PDF no se reescribe por trozos— y por eso
// tiene tope por bytes, comprobado aquí otra vez aunque la página ya lo hizo: la frontera no se fía
// de lo que diga el otro lado. Lo que cruza son nombres de campo, valores enmascarados y tamaños.

/** El archivo que se diagnosticó, para limpiarlo sin volver a pedirlo. Muere con el worker. */
let binario: {
  readonly bytes: Uint8Array;
  readonly formato: FormatoBinario;
  readonly campos: number;
  readonly revisiones: number | null;
} | null = null;

async function leerMetadatos(
  archivo: File,
  formato: "pdf" | "imagen",
): Promise<void> {
  const inicio = performance.now();
  if (archivo.size === 0) {
    enviar({ tipo: "error", motivo: "archivo-vacio" });
    return;
  }
  const tope = motivoDelTope(formato, archivo.size);
  if (tope) {
    enviar({ tipo: "error", motivo: tope });
    return;
  }
  try {
    avisar("leyendo-metadatos", 0, 0, archivo.size);
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const msLectura = performance.now() - inicio;
    const lectura = await leerBinario(bytes, archivo.name);
    binario = {
      bytes,
      formato: lectura.formato,
      campos: lectura.diagnostico.campos.length,
      revisiones: lectura.analisis.revisiones?.revisiones ?? null,
    };
    enviar({
      tipo: "metadatos-listos",
      informe: {
        archivo: {
          nombre: archivo.name,
          bytes: archivo.size,
          formato: lectura.formato,
          sha256: huella,
        },
        metadatos: lectura.diagnostico,
        medicion: {
          msLectura: Math.round(msLectura),
          msDiagnostico: Math.round(performance.now() - inicio - msLectura),
          heapMb: heapUsadoMb(),
        },
      },
    });
  } catch (error) {
    // El mensaje de la excepción NUNCA se reenvía: un lector de PDF cita lo que no entendió.
    enviar({ tipo: "error", motivo: motivoDeMetadatos(error, formato) });
  }
}

function motivoDeMetadatos(
  error: unknown,
  formato: "pdf" | "imagen",
): ErrorDeMetadatos["motivo"] | "formato-no-coincide" {
  if (error instanceof ErrorDeMetadatos) return error.motivo;
  if (error instanceof FormatoNoCoincide) return "formato-no-coincide";
  return formato === "pdf" ? "pdf-ilegible" : "imagen-ilegible";
}

async function limpiar(): Promise<void> {
  if (!binario) {
    enviar({ tipo: "error", motivo: "lectura-fallida" });
    return;
  }
  const inicio = performance.now();
  const { bytes, formato, campos, revisiones } = binario;
  try {
    avisar("limpiando", 0, 0, bytes.length);
    const { limpieza, poscomprobacion } = await limpiarBinario(bytes, formato);
    avisar("comprobando", 0, 0, limpieza.bytes.length);
    // La huella de SALIDA se toma sobre los mismos bytes que forman el `Blob`, como en una tabla.
    const sha256 = new Sha256().actualizar(limpieza.bytes).terminar();
    // Los bytes nacen en un `ArrayBuffer` corriente (Velo no usa memoria compartida): el tipo
    // amplio es de la firma de pdf-lib, no del dato.
    const blob = new Blob([limpieza.bytes as Uint8Array<ArrayBuffer>], {
      type: MIME_DEL_FORMATO[formato],
    });
    enviar({
      tipo: "limpiado",
      resumen: {
        formato,
        quitados: limpieza.quitados,
        conservados: limpieza.conservados,
        campos,
        revisionesQuitadas: revisiones === null ? 0 : revisiones - 1,
        idNuevo: limpieza.idNuevo,
        poscomprobacion,
        sha256,
        bytes: blob.size,
        ms: Math.round(performance.now() - inicio),
      },
      blob,
      // El nombre sale de la huella del ORIGINAL, no de su nombre (que puede ser lo más sensible de
      // todo) ni del idioma: el mismo archivo da siempre el mismo nombre.
      nombre: `velo-limpio-${huella.slice(0, 8)}.${EXTENSION_DEL_FORMATO[formato]}`,
    });
  } catch (error) {
    enviar({
      tipo: "error",
      motivo: motivoDeMetadatos(error, formato === "pdf" ? "pdf" : "imagen"),
    });
  }
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
    formatoOriginal = "excel";
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
      formatoOriginal = "csv";
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
  formato: FormatoDeArchivo,
  msLectura: number,
  estructura?: EstructuraJson,
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
    ...(estructura ? { estructura } : {}),
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
/** Las clases de equivalencia del DESPUÉS, para estimar sin recorrer el archivo otra vez. */
let clasesDespues: ClasesDeEquivalencia | null = null;
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

async function transformar(politica: Politica, idioma: Idioma): Promise<void> {
  if (!tabla || !diagnosticoActual) {
    enviar({ tipo: "error", motivo: "sin-tabla" });
    return;
  }

  const inicio = performance.now();
  const original = tabla;
  const diagnostico = diagnosticoActual;

  try {
    avisar("transformando", original.filas, 0, 0);
    // El idioma del trabajo llega como dato (la pantalla al pulsar «transformar») y se queda en el
    // resultado: el certificado lo lee de ahí, no del idioma que tenga la pantalla al descargarlo.
    // `construirArchivo` no lee ningún idioma: la tabla que escribe ya nació en el del trabajo.
    // La huella del archivo de entrada entra a la semilla del ruido (S7, `ruido/azar.ts`).
    const resultado = await aplicarPolitica(
      original,
      politica,
      llave,
      idioma,
      huella,
    );

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
    // Una retícula que pasó del tope no se recorrió: no hay nada aplicado que contar.
    const optimaAplicada =
      resultado.optima?.motivo === "excede-tope" ? null : resultado.optima;

    const balance = balanceDelTratamiento({
      tablaOriginal: original,
      tablaTransformada: resultado.tabla,
      diagnostico,
      politica,
      suprimidas: resultado.suprimidas,
      colisiones: resultado.colisiones,
      // La salvedad del k habla del k: una óptima que llegó al k y no a la ℓ pedida no es un «k no
      // alcanzado». La ℓ la cuenta el certificado, en la sección de la generalización.
      mondrian:
        resultado.mondrian ??
        (optimaAplicada
          ? {
              ...optimaAplicada,
              alcanzado: optimaAplicada.kAlcanzado >= optimaAplicada.kObjetivo,
            }
          : null),
      diversidad,
      pendientesDeMondrian: resultado.pendientesDeMondrian,
      ruidoNoAplicado: {
        columnas: resultado.ruido
          .filter((r) => !r.aplicado)
          .map((r) => r.columna),
        maximo: DOMINIO_MAXIMO,
      },
      reticulaExcedida:
        resultado.optima?.motivo === "excede-tope"
          ? {
              dimensiones: resultado.optima.dimensiones,
              nodos: resultado.optima.nodosEnLaReticula,
              tope: TOPE_DE_NODOS,
            }
          : null,
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
    // Las clases del DESPUÉS se guardan aquí porque el estimador poblacional las necesita y el
    // usuario puede declarar su población varias veces —tanteando la cifra— sin que valga la pena
    // recorrer el archivo entero en cada intento. Son los mismos cuasi-identificadores con los que
    // `balanceDelTratamiento` midió `despues`: si fueran otros, el estimado y el exacto estarían
    // hablando de tablas distintas.
    clasesDespues = clasesDeEquivalencia(
      qis
        .map((nombre) =>
          resultado.tabla.columnas.find((c) => c.nombre === nombre),
        )
        .filter((c) => c !== undefined),
      resultado.tabla.filas,
    );
    hashDeLaPolitica = hashDePolitica(politica);
    // El material de la bóveda se guarda AQUÍ, del lado de la frontera donde están los originales.
    // Sellarlo es un mensaje aparte porque exige la frase de paso del usuario, que se pide después.
    correspondencias =
      formatoOriginal === "json" && lecturaJson !== null
        ? conNumericas(
            resultado.correspondencias,
            columnasNumericas(lecturaJson),
          )
        : resultado.correspondencias;

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
        idioma,
        balance,
        utilidad: medirUtilidad(original, resultado.tabla),
        suprimidas: resultado.suprimidas,
        muestras,
        ms: Math.round(performance.now() - inicio),
        generalizacion:
          optimaAplicada && politica.generalizacion
            ? generalizacionAplicada(optimaAplicada, politica.generalizacion)
            : null,
        privacidad: informeDePrivacidad(resultado.ruido),
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

/**
 * La óptima tal como se aplicó, para el certificado: cada columna con su escalera y el nivel
 * elegido. Las columnas sin escalera en la política subieron por la de solo supresión.
 */
function generalizacionAplicada(
  optima: ResultadoOptimo,
  pedida: GeneralizacionOptima,
): GeneralizacionAplicada {
  return {
    kObjetivo: optima.kObjetivo,
    kAlcanzado: optima.kAlcanzado,
    lObjetivo: optima.lObjetivo,
    lAlcanzado: optima.lAlcanzado,
    columnasSensibles: pedida.diversidad?.columnas ?? [],
    columnas: optima.dimensiones.map((nombre, i) => {
      const jerarquia = pedida.jerarquias[nombre] ?? { tipo: "supresion" };
      return {
        nombre,
        jerarquia,
        nivel: nombresDeNiveles(jerarquia)[optima.niveles[i]],
      };
    }),
    nodosRevisados: optima.nodosRevisados,
    nodosEnLaReticula: optima.nodosEnLaReticula,
  };
}

/** Un lado de la comparación, medido sobre las columnas del reparto de la tabla ya generalizada. */
function medirLado(
  generalizada: TablaColumnar,
  dimensiones: readonly string[],
  sensibles: readonly string[],
  niveles: readonly (string | null)[],
  extra: Pick<
    LadoDeLaComparacion,
    | "disponible"
    | "motivo"
    | "alcanzado"
    | "nodosRevisados"
    | "nodosEnLaReticula"
    | "ms"
  >,
): LadoDeLaComparacion {
  const porNombre = new Map(generalizada.columnas.map((c) => [c.nombre, c]));
  const originales = new Map((tabla?.columnas ?? []).map((c) => [c.nombre, c]));
  const columnas = dimensiones.map((n) => porNombre.get(n)!);
  const riesgo = riesgoProsecutor(
    clasesDeEquivalencia(columnas, generalizada.filas),
    dimensiones,
    generalizada.filas,
  );
  const diversidad =
    sensibles.length > 0
      ? medirDiversidad(generalizada, dimensiones, sensibles)
      : [];
  return {
    ...extra,
    kAlcanzado: riesgo.kMinimo,
    lAlcanzado:
      diversidad.length > 0 ? Math.min(...diversidad.map((d) => d.l)) : null,
    clases: riesgo.clases,
    unicos: riesgo.unicos,
    riesgoMaximo: riesgo.riesgoMaximo,
    riesgoPromedio: riesgo.riesgoPromedio,
    bitsAntes: dimensiones.reduce(
      (s, n) => s + entropiaEnBits(originales.get(n)!, generalizada.filas),
      0,
    ),
    bitsDespues: columnas.reduce(
      (s, c) => s + entropiaEnBits(c, generalizada.filas),
      0,
    ),
    columnas: columnas.map((c, i) => ({
      nombre: c.nombre,
      nivel: niveles[i],
      distintos: c.valores.length - 1,
    })),
  };
}

/**
 * Mondrian y la óptima, lado a lado, sobre las columnas del reparto. Se mide sobre la tabla
 * ORIGINAL: las columnas del reparto no llevan técnica por columna, así que es lo mismo que verá
 * `aplicarPolitica`, y no hace falta la llave.
 */
function compararGeneralizacion(
  politica: Politica,
  jerarquias: Readonly<Record<string, JerarquiaDeLaPolitica>>,
  idioma: Idioma,
): void {
  // Un fallo aquí NO es un error de la sesión (eso tumbaría el diagnóstico en pantalla): la
  // comparación vuelve vacía y la pantalla dice que no se pudo hacer.
  if (!tabla || !diagnosticoActual) {
    enviar({ tipo: "comparacion", comparacion: null });
    return;
  }
  try {
    compararSobre(tabla, politica, jerarquias, idioma);
  } catch {
    enviar({ tipo: "comparacion", comparacion: null });
  }
}

function compararSobre(
  tabla: TablaColumnar,
  politica: Politica,
  jerarquias: Readonly<Record<string, JerarquiaDeLaPolitica>>,
  idioma: Idioma,
): void {
  const k = politica.kObjetivo;
  const existentes = new Set(tabla.columnas.map((c) => c.nombre));
  const dimensiones = tabla.columnas
    .map((c) => c.nombre)
    .filter((n) => columnasDeMondrian(politica).includes(n));
  if (k === null || dimensiones.length === 0) {
    enviar({ tipo: "comparacion", comparacion: null });
    return;
  }
  avisar("comparando", tabla.filas, 0, 0);
  const diversidad = politica.generalizacion?.diversidad ?? null;
  const sensibles = (diversidad?.columnas ?? []).filter(
    (n) => existentes.has(n) && !dimensiones.includes(n),
  );

  let inicio = performance.now();
  const mondrian = anonimizarConMondrian(tabla, dimensiones, k, idioma);
  const ladoMondrian = medirLado(
    mondrian.tabla,
    dimensiones,
    sensibles,
    dimensiones.map(() => null),
    {
      disponible: true,
      motivo: mondrian.alcanzado ? null : "no-alcanzable",
      alcanzado: mondrian.alcanzado,
      nodosRevisados: null,
      nodosEnLaReticula: null,
      ms: Math.round(performance.now() - inicio),
    },
  );

  inicio = performance.now();
  const optima = generalizarOptimo(
    tabla,
    dimensiones,
    jerarquias,
    k,
    diversidad && sensibles.length > 0
      ? { l: diversidad.l, columnas: sensibles }
      : null,
  );
  const disponible = optima.motivo !== "excede-tope";
  const ladoOptima = medirLado(
    optima.tabla,
    dimensiones,
    sensibles,
    optima.dimensiones.map((n, i) =>
      disponible
        ? nombresDeNiveles(jerarquias[n] ?? { tipo: "supresion" })[
            optima.niveles[i]
          ]
        : null,
    ),
    {
      disponible,
      motivo: optima.motivo,
      alcanzado: optima.alcanzado,
      nodosRevisados: optima.nodosRevisados,
      nodosEnLaReticula: optima.nodosEnLaReticula,
      ms: Math.round(performance.now() - inicio),
    },
  );

  const comparacion: ComparacionDeGeneralizacion = {
    kObjetivo: k,
    lObjetivo: diversidad && sensibles.length > 0 ? diversidad.l : null,
    dimensiones,
    mondrian: ladoMondrian,
    optima: ladoOptima,
  };
  enviar({ tipo: "comparacion", comparacion });
}

/** Cuántas filas se juntan antes de cerrar un trozo del Blob. */
const FILAS_POR_TROZO = 20_000;

async function construirArchivo(): Promise<void> {
  if (!transformada) {
    enviar({ tipo: "error", motivo: "sin-tabla" });
    return;
  }
  avisar("escribiendo", transformada.filas, 0, 0);
  if (formatoOriginal === "json") {
    await construirArchivoJson(transformada);
    return;
  }

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

/**
 * La salida de un JSON: se vuelve a leer el archivo original y se reescribe registro a registro,
 * poniendo en cada hoja lo que dice la tabla TRANSFORMADA. La huella de salida se calcula sobre los
 * mismos trozos que forman el `Blob`, como en el CSV, y la de ENTRADA se vuelve a comprobar al
 * terminar de leer: si el archivo cambió en el disco entre el diagnóstico y ahora, no se escribe
 * nada, porque el certificado habría atado la huella de otro archivo.
 */
async function construirArchivoJson(
  tablaTransformada: TablaColumnar,
): Promise<void> {
  if (!lecturaJson || !archivoDeEntrada) {
    enviar({ tipo: "error", motivo: "sin-tabla" });
    return;
  }
  const huellaDeSalida = new Sha256();
  const codificador = new TextEncoder();
  const trozos: string[] = [];
  try {
    const fuente = fuenteDeArchivo(archivoDeEntrada, {
      huellaEsperada: huella,
    });
    for await (const trozo of escribirJson(
      fuente,
      lecturaJson,
      tablaTransformada,
    )) {
      trozos.push(trozo);
      huellaDeSalida.actualizar(codificador.encode(trozo));
    }
  } catch (error) {
    // Nada del mensaje se reenvía: ni el de un parser ni el de un archivo que cambió.
    enviar({
      tipo: "error",
      motivo:
        error instanceof ArchivoCambio || !(error instanceof ErrorDeJson)
          ? "lectura-fallida"
          : error.motivo,
    });
    return;
  }

  const forma = lecturaJson.estructura.forma;
  const blob = new Blob(trozos, {
    type:
      forma === "arreglo"
        ? "application/json;charset=utf-8"
        : "application/x-ndjson;charset=utf-8",
  });
  enviar({
    tipo: "archivo",
    blob,
    nombre: nombreDelArchivoAnonimizado(
      hashDeLaPolitica,
      forma === "arreglo" ? "json" : "jsonl",
    ),
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
/**
 * Solo si lo devuelto es un JSON (S7): su lectura y el archivo, para escribir lo restaurado con SU
 * estructura y el orden de SUS claves —los del archivo que volvió, no los del que salió—.
 */
let lecturaDevuelta: LecturaJson | null = null;
let archivoDevuelto: File | null = null;

/** En un JSON, las columnas reversibles que eran todas números vuelven sin comillas (ADR-011). */
function conNumericas(
  entradas: readonly EntradaDeBoveda[],
  numericas: ReadonlySet<string>,
): EntradaDeBoveda[] {
  return entradas.map((e) =>
    numericas.has(e.columna) ? { ...e, numerica: true } : e,
  );
}

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
      detalle: mensajeDeMotor("boveda.lecturaFallida"),
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

/**
 * Estima el riesgo poblacional del archivo que va a salir.
 *
 * `poblacion` puede ser `null` —el caso normal, porque el usuario no siempre la sabe— y entonces el
 * motor devuelve su «no calculable» con la razón. **No se inventa un valor por defecto**: sin
 * fracción de muestreo no hay estimador poblacional que valga, y suponerla sería la mentira que
 * `engine/riesgo-estimado.ts` existe para no cometer.
 */
function estimar(poblacion: number | null): void {
  if (!transformada || !clasesDespues) {
    enviar({ tipo: "error", motivo: "sin-tabla" });
    return;
  }
  enviar({
    tipo: "riesgo-estimado",
    estimacion: estimarRiesgo({
      clases: clasesDespues,
      filas: transformada.filas,
      poblacion,
    }),
  });
}

// ── La bitácora ───────────────────────────────────────────────────────────────────────────────
//
// La bitácora abierta vive aquí, como la bóveda y la llave, y muere con el worker. La frase de paso
// NO se guarda: entra con cada mensaje y se va con él.

let bitacoraActual: Bitacora | null = null;

function anunciarBitacora(bitacora: Bitacora): void {
  enviar({
    tipo: "bitacora-abierta",
    contenido: {
      version: bitacora.version,
      entradas: bitacora.entradas,
      huella: huellaDeBitacora(bitacora),
    },
  });
}

async function abrirLaBitacora(archivo: File, frase: string): Promise<void> {
  avisar("abriendo-bitacora", 0, 0, archivo.size);
  let bytes: Uint8Array;
  try {
    // Igual que la bóveda: `arrayBuffer()` solo puede llamarse dentro de este directorio.
    bytes = new Uint8Array(await archivo.arrayBuffer());
  } catch {
    enviar({
      tipo: "bitacora-rechazada",
      motivo: "lectura-fallida",
      detalle: mensajeDeMotor("bitacora.lecturaFallida"),
    });
    return;
  }

  const resultado = await abrirBitacora(bytes, frase);
  if (!resultado.ok) {
    enviar({
      tipo: "bitacora-rechazada",
      motivo: resultado.motivo,
      detalle: resultado.detalle,
    });
    return;
  }

  bitacoraActual = resultado.bitacora;
  anunciarBitacora(resultado.bitacora);
}

/**
 * Sella la bitácora, con una entrada nueva al final si viene alguna.
 *
 * Si no hay ninguna abierta, empieza una — es el caso de la primera vez, y no necesita una pantalla
 * aparte: una bitácora nueva es una bitácora vacía a la que se le añade la primera entrada.
 */
async function sellarLaBitacora(
  frase: string,
  entrada: EntradaDeBitacora | null,
): Promise<void> {
  const base = bitacoraActual ?? bitacoraVacia();
  const bitacora = entrada ? anadirEntrada(base, entrada) : base;
  if (bitacora.entradas.length === 0) {
    enviar({ tipo: "error", motivo: "sin-bitacora" });
    return;
  }

  avisar("sellando-bitacora", bitacora.entradas.length, 0, 0);
  try {
    const bytes = await sellarBitacora(bitacora, frase);
    bitacoraActual = bitacora;
    const blob = new Blob([bytes], { type: "application/octet-stream" });
    enviar({
      tipo: "archivo",
      blob,
      nombre: NOMBRE_DE_BITACORA,
      bytes: blob.size,
      proposito: "bitacora",
    });
    anunciarBitacora(bitacora);
  } catch {
    enviar({ tipo: "error", motivo: "sin-bitacora" });
  }
}

/** El devuelto está listo: lo que la página puede saber de él son conteos. */
function anunciarDevuelto(tabla: TablaColumnar): void {
  enviar({
    tipo: "devuelto-listo",
    nombre: datosDelDevuelto.nombre,
    bytes: datosDelDevuelto.bytes,
    filas: tabla.filas,
    columnas: tabla.columnas.length,
    sha256: datosDelDevuelto.sha256,
  });
}

/** Un JSON devuelto: el mismo lector propio de la ida, con la misma regla de no citar nada. */
async function analizarJsonDevuelto(archivo: File): Promise<void> {
  try {
    const lectura = await leerJson(
      fuenteDeArchivo(archivo, {
        alAvanzar: (leidos) => avisar("leyendo", 0, leidos, archivo.size),
      }),
    );
    if (lectura.tabla.filas === 0) {
      enviar({ tipo: "error", motivo: "archivo-vacio" });
      return;
    }
    devuelta = lectura.tabla;
    lecturaDevuelta = lectura;
    archivoDevuelto = archivo;
    anunciarDevuelto(lectura.tabla);
  } catch (error) {
    enviar({
      tipo: "error",
      motivo: error instanceof ErrorDeJson ? error.motivo : "lectura-fallida",
    });
  }
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
  devuelta = null;
  restaurada = null;
  lecturaDevuelta = null;
  archivoDevuelto = null;

  // El regreso lee CSV y JSON. Un Excel, un PDF o una imagen se vetan aquí y no se leen «como
  // texto»: la página filtra por extensión, pero la frontera no se fía de lo que diga el otro lado.
  const formato = formatoDeArchivo(archivo.name);
  if (formato === "json") {
    await analizarJsonDevuelto(archivo);
    return;
  }
  if (formato !== null && formato !== "csv") {
    enviar({ tipo: "error", motivo: "formato-no-soportado" });
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
      anunciarDevuelto(devuelta);
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

/**
 * Un JSON restaurado: la segunda pasada del escritor sobre el archivo DEVUELTO, con la tabla
 * restaurada mandando. Las columnas que en el original eran todas números (la bóveda lo dice)
 * vuelven a escribirse como números. Si el archivo cambió en el disco desde que se leyó, no se
 * escribe nada.
 */
async function construirRestauradoJson(
  restauracion: Restauracion,
  lectura: LecturaJson,
  archivo: File,
): Promise<void> {
  const numericas = new Set<string>();
  const deLaBoveda = new Map(
    (bovedaActual?.columnas ?? []).map((c) => [c.columna, c]),
  );
  for (const columna of restauracion.columnas)
    if (
      columna.deLaBoveda !== null &&
      deLaBoveda.get(columna.deLaBoveda)?.numerica === true
    )
      numericas.add(columna.columna);

  const trozos: string[] = [];
  try {
    for await (const trozo of escribirJson(
      fuenteDeArchivo(archivo, { huellaEsperada: datosDelDevuelto.sha256 }),
      lectura,
      restauracion.tabla,
      numericas,
    ))
      trozos.push(trozo);
  } catch {
    enviar({ tipo: "error", motivo: "lectura-fallida" });
    return;
  }
  const arreglo = lectura.estructura.forma === "arreglo";
  const blob = new Blob(trozos, {
    type: arreglo
      ? "application/json;charset=utf-8"
      : "application/x-ndjson;charset=utf-8",
  });
  enviar({
    tipo: "archivo",
    blob,
    nombre: `velo-restaurado-${datosDelDevuelto.sha256.slice(0, 8)}.${arreglo ? "json" : "jsonl"}`,
    bytes: blob.size,
    proposito: "restaurado",
  });
}

async function construirRestaurado(): Promise<void> {
  if (!restaurada) {
    enviar({ tipo: "error", motivo: "sin-devuelto" });
    return;
  }
  avisar("escribiendo", restaurada.tabla.filas, 0, 0);
  if (lecturaDevuelta !== null && archivoDevuelto !== null) {
    await construirRestauradoJson(restaurada, lecturaDevuelta, archivoDevuelto);
    return;
  }
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

function construirInformeDelRegreso(fecha: string, idioma: Idioma): void {
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
    idioma,
  });
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  enviar({
    tipo: "archivo",
    blob,
    nombre: nombreDelInforme(datosDelDevuelto.nombre, idioma),
    bytes: blob.size,
    proposito: "informe-del-regreso",
  });
}

alcance.addEventListener("message", (evento: MessageEvent<MensajeAlWorker>) => {
  const mensaje = evento.data;
  if (mensaje?.tipo === "analizar") void analizar(mensaje.archivo);
  if (mensaje?.tipo === "derivar-llave")
    void derivar(mensaje.frase, mensaje.sal);
  if (mensaje?.tipo === "transformar")
    void transformar(mensaje.politica, mensaje.idioma);
  if (mensaje?.tipo === "comparar-generalizacion")
    compararGeneralizacion(
      mensaje.politica,
      mensaje.jerarquias,
      mensaje.idioma,
    );
  if (mensaje?.tipo === "construir-archivo") void construirArchivo();
  if (mensaje?.tipo === "sellar-boveda") void sellar(mensaje.frase);
  if (mensaje?.tipo === "abrir-boveda")
    void abrir(mensaje.archivo, mensaje.frase);
  if (mensaje?.tipo === "analizar-devuelto")
    void analizarDevuelto(mensaje.archivo);
  if (mensaje?.tipo === "restaurar") restaurarDevuelto();
  if (mensaje?.tipo === "construir-restaurado") void construirRestaurado();
  if (mensaje?.tipo === "construir-informe-del-regreso")
    construirInformeDelRegreso(mensaje.fecha, mensaje.idioma);
  if (mensaje?.tipo === "estimar-riesgo") estimar(mensaje.poblacion);
  if (mensaje?.tipo === "abrir-bitacora")
    void abrirLaBitacora(mensaje.archivo, mensaje.frase);
  if (mensaje?.tipo === "sellar-bitacora")
    void sellarLaBitacora(mensaje.frase, mensaje.entrada);
  if (mensaje?.tipo === "limpiar") void limpiar();
});
