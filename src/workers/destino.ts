// S8/S10: adonde va el archivo que se escribe por trozos, y qué se dice cuando escribir falla.
//
// Vive aparte del worker para poder probarse en Node: no conoce `self` ni manda mensajes. El worker
// lo usa para el anonimizado y para el restaurado de alto volumen.

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

/**
 * S8: adonde va el archivo que se escribe por trozos. Los MISMOS bytes que se hashean son los que se
 * escriben: al archivo que el usuario eligió (`createWritable`, que no confirma nada hasta `close`)
 * o a un `Blob` hecho de `Blob`s, sin juntar las cadenas en memoria.
 */
export async function destinoDe(asa: FileSystemFileHandle | undefined) {
  const huellaDeSalida = new Sha256();
  const codificador = new TextEncoder();
  const escritor = asa ? await alDestino(() => asa.createWritable()) : null;
  const partes: Blob[] = [];
  let bytes = 0;
  const destino: Destino = {
    async escribir(texto) {
      const trozo = codificador.encode(texto);
      huellaDeSalida.actualizar(trozo);
      bytes += trozo.length;
      await alDestino(async () => {
        if (escritor) await escritor.write(trozo);
        else partes.push(new Blob([trozo]));
      });
    },
  };
  return {
    destino,
    /** Confirma el archivo (o arma el `Blob`) y devuelve lo que cruza a la página. */
    async cerrar(tipo: string) {
      if (escritor) await alDestino(() => escritor.close());
      return {
        ...(escritor
          ? { enDisco: true as const }
          : {
              blob: await alDestino(
                async () => new Blob(partes, { type: tipo }),
              ),
            }),
        bytes,
        sha256: huellaDeSalida.terminar(),
      };
    },
    /** Deshace lo escrito: con `createWritable`, nada llega al archivo del usuario. */
    async abortar() {
      if (escritor) await escritor.abort().catch(() => {});
    },
  };
}
