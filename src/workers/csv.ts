// La única puerta de entrada de un CSV (S8): por trozos de BYTES, en memoria y en alto volumen.
//
// Hasta el S7 el worker le daba el `File` a PapaParse, y PapaParse lo lee en trozos de 10 MB con
// `FileReader.readAsText`, que decodifica CADA trozo por su cuenta: un carácter UTF-8 de dos o tres
// bytes que caía partido en la frontera salía como «�» (o dos), en silencio, en cualquier CSV de más
// de 10 MB con tildes. Aquí los bytes se cortan igual, pero se decodifican con UN `TextDecoder` en
// modo `stream`, que guarda los bytes de un carácter a medias hasta el trozo siguiente. Lo demás no
// cambia: PapaParse sigue siendo el que parte las filas, con la misma configuración, y adivina el
// separador y el fin de línea sobre un primer trozo del mismo tamaño que antes.
//
// PapaParse recibe el texto como si fuera un flujo de Node (`readable`, `on`, `read`): así se le
// entrega un trozo cuando el que lee pide el siguiente, y el que lee puede esperar (una HMAC, una
// escritura en disco) entre trozo y trozo sin que nada se acumule.
//
// La huella del archivo se vuelve a comprobar al terminar: si el archivo cambió en el disco entre el
// diagnóstico y esta pasada, lo leído describe otro archivo y la pasada falla (`ArchivoCambio`).

import Papa from "papaparse";

import { Sha256 } from "@/lib/sha256";

import { ArchivoCambio } from "./json";

/**
 * El trozo de bytes. El mismo de PapaParse (`Papa.LocalChunkSize`, 10 MB) a propósito: el separador
 * y el fin de línea se adivinan sobre el primer trozo, y con el mismo tamaño se adivinan igual.
 */
export const TROZO_CSV = Papa.LocalChunkSize;

/** La configuración de PapaParse, UNA, para todo CSV que entra a Velo. */
export const CONFIGURACION_CSV = {
  // header: false a propósito. Con `header: true` PapaParse construye un objeto por fila —
  // 500.000 objetos de 24 propiedades que nacen para morir. El encabezado lo lee quien llama.
  header: false,
  skipEmptyLines: "greedy",
} as const;

export interface OpcionesDeLectura {
  /** El tamaño del trozo de bytes. Solo las pruebas lo cambian. */
  readonly trozo?: number;
  /** Si se da, la huella SHA-256 del archivo leído tiene que coincidir, o la lectura falla. */
  readonly huellaEsperada?: string;
  readonly alAvanzar?: (bytesLeidos: number, bytesTotales: number) => void;
}

/** Un flujo «de Node» de mentira: lo justo para que PapaParse elija su `ReadableStreamStreamer`. */
function flujoParaPapa() {
  const oyentes = new Map<string, (dato?: string) => void>();
  const flujo = {
    readable: true as const,
    read() {},
    pause() {},
    resume() {},
    on(evento: string, oyente: (dato?: string) => void) {
      oyentes.set(evento, oyente);
      return flujo;
    },
    removeListener(evento: string) {
      oyentes.delete(evento);
      return flujo;
    },
  };
  return {
    flujo,
    datos: (texto: string) => oyentes.get("data")?.(texto),
    fin: () => oyentes.get("end")?.(),
  };
}

/**
 * Las filas del CSV, en lotes (las de cada trozo), tal como PapaParse las parte. La primera fila del
 * primer lote es el encabezado. Las filas vacías ya vienen fuera (`skipEmptyLines: "greedy"`).
 */
export async function* lotesDeCsv(
  archivo: Blob,
  opciones: OpcionesDeLectura = {},
): AsyncGenerator<string[][]> {
  const trozo = opciones.trozo ?? TROZO_CSV;
  const { flujo, datos, fin } = flujoParaPapa();
  const listas: string[][] = [];
  let fallo: unknown = null;

  Papa.parse<string[]>(flujo as unknown as NodeJS.ReadableStream, {
    ...CONFIGURACION_CSV,
    chunk(resultados) {
      for (const fila of resultados.data) listas.push(fila);
    },
    error(error) {
      fallo = error;
    },
    // El fin se sabe por el bucle de abajo, que es el que alimenta: aquí no hay nada que hacer.
    complete() {},
  });

  // `fatal: false`, como `readAsText`: un byte que no es UTF-8 sale como «�», igual que antes. La
  // marca de orden de bytes (BOM) del principio se quita, igual que antes.
  const decodificador = new TextDecoder("utf-8");
  const acumulador = opciones.huellaEsperada ? new Sha256() : null;

  for (let desde = 0; desde < archivo.size; desde += trozo) {
    const bytes = new Uint8Array(
      await archivo.slice(desde, desde + trozo).arrayBuffer(),
    );
    acumulador?.actualizar(bytes);
    const texto = decodificador.decode(bytes, { stream: true });
    if (texto) datos(texto);
    if (fallo) throw fallo;
    opciones.alAvanzar?.(Math.min(desde + trozo, archivo.size), archivo.size);
    if (listas.length > 0) yield listas.splice(0);
  }
  const resto = decodificador.decode();
  if (resto) datos(resto);
  fin();
  if (fallo) throw fallo;
  if (listas.length > 0) yield listas.splice(0);

  if (acumulador && acumulador.terminar() !== opciones.huellaEsperada)
    throw new ArchivoCambio();
}
