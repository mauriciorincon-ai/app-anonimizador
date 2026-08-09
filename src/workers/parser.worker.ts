/// <reference lib="webworker" />
// El worker es LA FRONTERA de Velo.
//
// Los datos crudos del usuario viven aquí y solo aquí. Hacia la UI viajan agregados, metadatos y
// (más adelante) muestras enmascaradas — jamás el dataset. Dos razones, y ninguna es de estilo:
//   1. Privacidad: si el hilo principal nunca ve el contenido, ningún componente, ninguna
//      librería de UI y ningún reporte de error puede filtrarlo por accidente.
//   2. Rendimiento: parsear 130 MB en el hilo principal congela la pestaña; aquí no toca un frame.
//
// El archivo se lee por chunks (PapaParse en modo streaming): nunca existe una copia completa del
// CSV en memoria, solo la tabla columnar que se va construyendo.
import Papa from "papaparse";

import { ConstructorColumnar, type TablaColumnar } from "@/engine/columnar";

export type MensajeAlWorker = { tipo: "parsear"; archivo: File };

export type ResumenDeColumna = {
  nombre: string;
  cardinalidad: number;
  noVacios: number;
};

export type MensajeDelWorker =
  | {
      tipo: "progreso";
      filas: number;
      bytesLeidos: number;
      bytesTotales: number;
    }
  | {
      tipo: "listo";
      filas: number;
      columnas: ResumenDeColumna[];
      msParseo: number;
      bytes: number;
      /** Heap usado DENTRO del worker (MB). Desde el hilo principal es invisible: la tabla vive
       *  aquí, así que este es el único número honesto sobre cuánta memoria cuesta el archivo. */
      heapMb: number | null;
    }
  | { tipo: "error"; motivo: string };

const alcance = self as unknown as DedicatedWorkerGlobalScope;

/** La tabla vive en el worker entre mensajes: la UI la consulta, nunca la recibe. */
let tabla: TablaColumnar | null = null;

/** Cada cuántas filas se avisa del avance. Suficiente para una barra fluida, sin inundar. */
const FILAS_POR_AVISO = 25_000;

function parsear(archivo: File): void {
  if (/\.xlsx?$/i.test(archivo.name)) {
    void parsearExcel(archivo);
    return;
  }
  parsearCsv(archivo);
}

/**
 * Excel es el eslabón débil y se trata como tal. SheetJS no tiene lectura en streaming en el
 * navegador (issue #2757): el libro entero se carga en memoria y de ahí sale una matriz completa
 * — dos copias del archivo vivas a la vez. Por eso Velo declara un TOPE para .xlsx y no para CSV
 * (medido en el spike B; ver decisions/003-excel-tope-y-suministro.md).
 *
 * El `import()` es dinámico a propósito: SheetJS pesa ~900 KB y jamás debe entrar al bundle
 * inicial de una página que quizá solo reciba CSV.
 */
async function parsearExcel(archivo: File): Promise<void> {
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
    enviarListo(inicio, archivo.size);
  } catch {
    // El mensaje de la excepción NUNCA se reenvía: puede citar contenido de la hoja.
    enviar({ tipo: "error", motivo: "excel-excede-memoria" });
  }
}

function parsearCsv(archivo: File): void {
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
        enviar({
          tipo: "progreso",
          filas,
          bytesLeidos: resultados.meta.cursor,
          bytesTotales: archivo.size,
        });
      }
    },
    complete() {
      if (!constructor) {
        enviar({ tipo: "error", motivo: "archivo-vacio" });
        return;
      }
      tabla = constructor.finalizar();
      enviarListo(inicio, archivo.size);
    },
    error() {
      // El motivo del parser NUNCA se reenvía: puede citar el contenido de la línea que falló.
      enviar({ tipo: "error", motivo: "lectura-fallida" });
    },
  });
}

function enviar(mensaje: MensajeDelWorker): void {
  alcance.postMessage(mensaje);
}

/** Lo único que cruza la frontera al terminar: conteos y nombres de columna. Ni un valor. */
function enviarListo(inicio: number, bytes: number): void {
  if (!tabla) return;
  enviar({
    tipo: "listo",
    filas: tabla.filas,
    columnas: tabla.columnas.map((c) => ({
      nombre: c.nombre,
      cardinalidad: c.valores.length - 1,
      noVacios: c.noVacios,
    })),
    msParseo: Math.round(performance.now() - inicio),
    bytes,
    heapMb: heapUsadoMb(),
  });
}

/** Heap usado por ESTE worker, en MB. Solo Chromium lo expone; en el resto devuelve null. */
function heapUsadoMb(): number | null {
  const memoria = (
    performance as Performance & { memory?: { usedJSHeapSize: number } }
  ).memory;
  return memoria ? Math.round(memoria.usedJSHeapSize / 1_048_576) : null;
}

alcance.addEventListener("message", (evento: MessageEvent<MensajeAlWorker>) => {
  if (evento.data?.tipo === "parsear") parsear(evento.data.archivo);
});
