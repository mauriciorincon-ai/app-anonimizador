// Los archivos del equipo del usuario: de dónde salen las filas y adónde van.
//
// Lo que en la web es un `File` aquí es `fs.openAsBlob`: un `Blob` que lee del disco a pedido, sin
// copiar el archivo a memoria. Lo que en la web es `createWritable` aquí es un archivo que se abre
// con `wx`: si ya existe, Velo no lo pisa. Y si algo falla a medias, se borra lo escrito: no queda
// un archivo a medio hacer en el equipo.

import { createReadStream, openAsBlob } from "node:fs";
import { open, unlink, type FileHandle } from "node:fs/promises";
import { basename } from "node:path";

import { Sha256 } from "@/lib/sha256";

import type { Origen, Sumidero } from "./nucleo";
import { ErrorDeVelo } from "./textos";

/** SHA-256 de un archivo, leído por trozos: la misma huella que la web toma antes de parsear. */
export async function huellaDeArchivo(ruta: string): Promise<string> {
  const acumulador = new Sha256();
  for await (const trozo of createReadStream(ruta))
    acumulador.actualizar(new Uint8Array(trozo as Buffer));
  return acumulador.terminar();
}

/** El archivo como `Blob` (la `Fuente` de las pasadas) y lo que se sabe de él. */
export async function abrirArchivo(
  ruta: string,
): Promise<{ readonly fuente: Blob; readonly origen: Origen }> {
  const fuente = await openAsBlob(ruta);
  return {
    fuente,
    origen: {
      nombre: basename(ruta),
      bytes: fuente.size,
      sha256: await huellaDeArchivo(ruta),
    },
  };
}

/** Un archivo nuevo, que no pisa a nadie: `wx` falla si ya existe. */
export class ArchivoNuevo implements Sumidero {
  private constructor(
    readonly ruta: string,
    private readonly asa: FileHandle,
  ) {}

  static async crear(ruta: string): Promise<ArchivoNuevo> {
    try {
      return new ArchivoNuevo(ruta, await open(ruta, "wx", 0o600));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST")
        throw new ErrorDeVelo("yaExiste", { ruta });
      throw error;
    }
  }

  async escribir(bytes: Uint8Array): Promise<void> {
    await this.asa.write(bytes);
  }

  async cerrar(): Promise<void> {
    await this.asa.close();
  }

  /**
   * Deshace: cierra y borra. Lo que no terminó no se queda en el disco. Devuelve `false` si NO pudo
   * borrarlo (permisos, un disco que se fue): el archivo queda a medias y quien llama lo AVISA, en
   * vez de callarlo.
   */
  async abortar(): Promise<boolean> {
    await this.asa.close().catch(() => {});
    return unlink(this.ruta).then(
      () => true,
      (error: NodeJS.ErrnoException) => error.code === "ENOENT",
    );
  }
}

/**
 * S12: una escritura falló Y el archivo a medias no se pudo borrar. Lleva la ruta que quedó y la
 * causa original; quien la atrapa avisa de la ruta y relanza la causa (el error que importa).
 */
export class EscrituraAMedias extends Error {
  constructor(
    readonly ruta: string,
    readonly causa: unknown,
  ) {
    super("escritura-a-medias");
    this.name = "EscrituraAMedias";
  }
}

/** Escribe un archivo entero de una vez (la bóveda, el certificado), sin pisar a nadie. */
export async function escribirNuevo(
  ruta: string,
  contenido: Uint8Array | string,
): Promise<void> {
  const archivo = await ArchivoNuevo.crear(ruta);
  try {
    await archivo.escribir(
      typeof contenido === "string"
        ? new TextEncoder().encode(contenido)
        : contenido,
    );
    await archivo.cerrar();
  } catch (error) {
    if (!(await archivo.abortar())) throw new EscrituraAMedias(ruta, error);
    throw error;
  }
}
