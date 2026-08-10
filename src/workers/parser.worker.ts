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

import { clasificar } from "@/engine/clasificador";
import { ConstructorColumnar, type TablaColumnar } from "@/engine/columnar";
import { evaluarRiesgo } from "@/engine/riesgo";
import { formatoDeArchivo } from "@/lib/archivo";

import type {
  EtapaDelWorker,
  Informe,
  MensajeAlWorker,
  MensajeDelWorker,
} from "./contrato";

const alcance = self as unknown as DedicatedWorkerGlobalScope;

/** La tabla vive en el worker entre mensajes: la UI la consulta, nunca la recibe. */
let tabla: TablaColumnar | null = null;

/** Cada cuántas filas se avisa del avance. Suficiente para una barra fluida, sin inundar. */
const FILAS_POR_AVISO = 25_000;

function analizar(archivo: File): void {
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

  avisar("midiendo-riesgo", tabla.filas, archivo.size, archivo.size);
  const { riesgo, advisor } = evaluarRiesgo(tabla, diagnostico);

  const informe: Informe = {
    archivo: { nombre: archivo.name, bytes: archivo.size, formato },
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

alcance.addEventListener("message", (evento: MessageEvent<MensajeAlWorker>) => {
  if (evento.data?.tipo === "analizar") analizar(evento.data.archivo);
});
