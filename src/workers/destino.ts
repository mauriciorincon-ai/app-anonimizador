// S8/S10: adonde va el archivo que se escribe por trozos, y qué se dice cuando escribir falla.
//
// Vive aparte del worker para poder probarse en Node: no conoce `self` ni manda mensajes. El worker
// lo usa para el anonimizado y para el restaurado de alto volumen.

import { TRANSFORMAR } from "@/lib/idioma/textos/transformar";
import { Sha256 } from "@/lib/sha256";

import type { Destino } from "./alto-volumen";

/**
 * S10: lo que falló al escribir, y no al leer. Envuelve el error del destino para que la pasada
 * diga «escritura-fallida» y no «lectura-fallida»: son dos cosas que el usuario arregla distinto.
 */
export class FalloAlEscribir extends Error {
  constructor() {
    super("escritura-fallida");
    this.name = "FalloAlEscribir";
  }
}

/** Lo que sale de una escritura por trozos que no terminó. El mensaje de la excepción no cruza. */
export function motivoDeLaEscritura(error: unknown) {
  return error instanceof FalloAlEscribir
    ? ("escritura-fallida" as const)
    : ("lectura-fallida" as const);
}

/** Corre `hacer`; si falla, el fallo es del destino. */
async function alDestino<T>(hacer: () => Promise<T>): Promise<T> {
  try {
    return await hacer();
  } catch {
    throw new FalloAlEscribir();
  }
}

/** Cuánto pesa, como máximo, cada parte cuando el archivo sale por partes (S11). */
export const PARTE_DE_SALIDA_BYTES = 256 * 1024 * 1024;

/** Una parte de un archivo que salió cortado en límites de fila, con su huella propia. */
export interface ParteDeSalida {
  readonly blob: Blob;
  readonly nombre: string;
  readonly bytes: number;
  readonly sha256: string;
}

/** Cómo sale el archivo cuando no hay archivo elegido: por el canal al service worker, o en partes. */
export interface OpcionesDeSalida {
  /** El nombre del archivo anonimizado; las partes y el manifiesto se nombran a partir de él. */
  readonly nombre?: string;
  /** El tipo de contenido que el service worker pone en la descarga. */
  readonly mime?: string;
  /** S11: el extremo del canal hacia el service worker. Los trozos van por aquí, no a un `Blob`. */
  readonly flujo?: MessagePort;
  /**
   * S11: el respaldo por partes, solo para el CSV anonimizado de alto volumen. Sin esto, el archivo
   * sale en un solo `Blob` como siempre (el JSON y el regreso no se cortan: su estructura no lo permite).
   */
  readonly partes?: { readonly limite: number };
}

/** `velo-x.csv` → `velo-x-parte-2-de-5.csv`. */
export function nombreDeParte(nombre: string, i: number, de: number): string {
  const punto = nombre.lastIndexOf(".");
  const base = punto > 0 ? nombre.slice(0, punto) : nombre;
  const extension = punto > 0 ? nombre.slice(punto) : "";
  return `${base}-parte-${i}-de-${de}${extension}`;
}

/**
 * El canal hacia el service worker, con contrapresión: el service worker PIDE cada trozo y este no
 * escribe hasta que lo pide, así que en tránsito hay un trozo, no el archivo. Si el usuario cancela
 * la descarga del navegador, el siguiente `escribir` falla y la pasada dice «escritura-fallida».
 */
function canalDeDescarga(puerto: MessagePort, nombre: string, mime: string) {
  let creditos = 0;
  let cancelado = false;
  let esperando: { ok: () => void; no: () => void } | null = null;
  puerto.onmessage = (mensaje: MessageEvent<{ tipo?: string }>) => {
    const tipo = mensaje.data?.tipo;
    if (tipo === "pide") {
      if (esperando) {
        const e = esperando;
        esperando = null;
        e.ok();
      } else creditos += 1;
    } else if (tipo === "cancelado") {
      cancelado = true;
      esperando?.no();
      esperando = null;
    }
  };
  // Con esto el service worker ya puede escribir las cabeceras y empezar a pedir.
  puerto.postMessage({ tipo: "adelante", nombre, mime });
  return {
    async enviar(trozo: Uint8Array): Promise<void> {
      if (cancelado) throw new Error("descarga cancelada");
      if (creditos > 0) creditos -= 1;
      else
        await new Promise<void>((ok, no) => {
          esperando = { ok, no };
        });
      puerto.postMessage({ tipo: "trozo", bytes: trozo }, [trozo.buffer]);
    },
    fin() {
      puerto.postMessage({ tipo: "fin" });
      puerto.close();
    },
    abortar() {
      puerto.postMessage({ tipo: "abortar" });
      puerto.close();
    },
  };
}

/**
 * S8: adonde va el archivo que se escribe por trozos. Los MISMOS bytes que se hashean son los que se
 * escriben: al archivo que el usuario eligió (`createWritable`, que no confirma nada hasta `close`),
 * por el canal a la descarga del navegador (S11), o a `Blob`s hechos de `Blob`s —uno solo si cabe,
 * varios cortados en límites de trozo si no—, sin juntar las cadenas en memoria.
 *
 * Las partes NO repiten el encabezado: pegadas en orden dan exactamente los bytes del archivo
 * único, y la huella del todo es la del certificado.
 */
export async function destinoDe(
  asa: FileSystemFileHandle | undefined,
  opciones: OpcionesDeSalida = {},
) {
  const huellaDeSalida = new Sha256();
  const codificador = new TextEncoder();
  const escritor = asa ? await alDestino(() => asa.createWritable()) : null;
  const canal = opciones.flujo
    ? canalDeDescarga(
        opciones.flujo,
        opciones.nombre ?? "velo-anonimizado.csv",
        opciones.mime ?? "application/octet-stream",
      )
    : null;
  const limite = opciones.partes?.limite ?? Infinity;
  // Las partes ya cerradas y la que se está llenando.
  const cerradas: { blob: Blob; bytes: number; sha256: string }[] = [];
  let trozos: Blob[] = [];
  let enLaParte = 0;
  let huellaDeLaParte = new Sha256();
  // El encabezado es el primer trozo; una parte nunca termina antes de llevar al menos una fila.
  let escritos = 0;
  const cerrarParte = (tipo: string) => {
    cerradas.push({
      blob: new Blob(trozos, { type: tipo }),
      bytes: enLaParte,
      sha256: huellaDeLaParte.terminar(),
    });
    trozos = [];
    enLaParte = 0;
    huellaDeLaParte = new Sha256();
  };
  let bytes = 0;
  const destino: Destino = {
    async escribir(texto) {
      const trozo = codificador.encode(texto);
      huellaDeSalida.actualizar(trozo);
      bytes += trozo.length;
      await alDestino(async () => {
        if (escritor) await escritor.write(trozo);
        else if (canal) await canal.enviar(trozo);
        else {
          if (escritos >= 2 && enLaParte + trozo.length > limite)
            cerrarParte(opciones.mime ?? "");
          huellaDeLaParte.actualizar(trozo);
          enLaParte += trozo.length;
          trozos.push(new Blob([trozo]));
          escritos += 1;
        }
      });
    },
  };
  return {
    destino,
    /** Confirma el archivo (o arma el `Blob`) y devuelve lo que cruza a la página. */
    async cerrar(tipo: string) {
      if (escritor) await alDestino(() => escritor.close());
      if (canal) canal.fin();
      if (escritor || canal)
        return {
          ...(escritor
            ? { enDisco: true as const }
            : { enDescarga: true as const }),
          bytes,
          sha256: huellaDeSalida.terminar(),
        };
      cerrarParte(tipo);
      const todo = huellaDeSalida.terminar();
      // Un archivo que cupo en una parte sale como siempre: un `Blob`, sin partes ni manifiesto.
      if (cerradas.length === 1)
        return { blob: cerradas[0].blob, bytes, sha256: todo };
      const nombre = opciones.nombre ?? "velo-anonimizado.csv";
      const partes: ParteDeSalida[] = cerradas.map((parte, i) => ({
        ...parte,
        nombre: nombreDeParte(nombre, i + 1, cerradas.length),
      }));
      return {
        partes,
        manifiesto: manifiestoDePartes(nombre, partes, bytes, todo),
        bytes,
        sha256: todo,
      };
    },
    /** Deshace lo escrito: con `createWritable`, nada llega al archivo del usuario. */
    async abortar() {
      if (escritor) await escritor.abort().catch(() => {});
      if (canal) canal.abortar();
    },
  };
}

/**
 * El manifiesto de un archivo que salió en partes: de qué archivo son, el orden, y la huella de cada
 * parte y del todo, para comprobar que se juntaron bien. Texto plano, en los dos idiomas.
 */
export function manifiestoDePartes(
  nombre: string,
  partes: readonly ParteDeSalida[],
  bytes: number,
  sha256: string,
): Blob {
  return new Blob(
    [
      JSON.stringify(
        {
          archivo: nombre,
          bytes,
          sha256,
          unir: TRANSFORMAR.entrega.enPartes.unir,
          partes: partes.map((p) => ({
            nombre: p.nombre,
            bytes: p.bytes,
            sha256: p.sha256,
          })),
        },
        null,
        2,
      ),
      "\n",
    ],
    { type: "application/json;charset=utf-8" },
  );
}
