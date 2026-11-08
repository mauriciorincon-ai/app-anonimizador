// Lo que comparten las órdenes de la consola (archivos y puente): la bitácora y la política pedida.

import { readFile, rename, rm } from "node:fs/promises";

import { abrirBitacora, sellarBitacora } from "@/lib/bitacora-archivo";
import type { Idioma } from "@/lib/idioma";
import { decirMensaje } from "@/lib/idioma/mensajes";

import { escribirNuevo } from "./archivos";
import { secreto } from "./consola";
import { anotar, esDeFabrica } from "./nucleo";
import { ErrorDeVelo, VELO_LOCAL as V } from "./textos";

/** La política pedida: de fábrica por su nombre, o el texto de un archivo exportado. */
export async function pedidaDePolitica(
  valor: string | undefined,
): Promise<{ fabrica: string } | { texto: string }> {
  if (!valor) throw new ErrorDeVelo("sinPolitica");
  if (esDeFabrica(valor)) return { fabrica: valor };
  try {
    return { texto: await readFile(valor, "utf8") };
  } catch {
    throw new ErrorDeVelo("politicaInvalida", { detalle: valor });
  }
}

/** Sustituye `ruta` por `bytes` escribiendo a un archivo aparte y renombrando: un corte a medias no la rompe. */
async function reemplazar(ruta: string, bytes: Uint8Array): Promise<void> {
  const temporal = `${ruta}.${process.pid}.nueva`;
  try {
    await escribirNuevo(temporal, bytes);
    await rename(temporal, ruta);
  } catch (error) {
    await rm(temporal, { force: true });
    throw error;
  }
}

/**
 * La bitácora crece: si existe se abre, se le añade la entrada y se vuelve a sellar en su sitio
 * (como en la web, «se sobrescribe al crecer»).
 *
 * S10: se abre ANTES de escribir nada. La frase se pide y se comprueba primero, así que una frase
 * equivocada o una bitácora rota no dejan un anonimizado huérfano. `deshacer` la deja como estaba
 * (o la quita, si esta corrida la creó) cuando algo falla después de anotar.
 */
export async function abrirBitacoraPara(ruta: string, idioma: Idioma) {
  const frase = await secreto(
    "VELO_FRASE_BITACORA",
    V.pedir.fraseDeBitacora,
    idioma,
  );
  let previa = null;
  let existente: Uint8Array | null = null;
  try {
    existente = new Uint8Array(await readFile(ruta));
  } catch {
    existente = null;
  }
  if (existente) {
    const abierta = await abrirBitacora(existente, frase);
    if (!abierta.ok)
      throw new ErrorDeVelo("bitacoraInvalida", {
        detalle: decirMensaje(abierta.detalle, idioma),
      });
    previa = abierta.bitacora;
  }
  let anotada = false;
  return {
    ruta,
    async anotar(entrada: Parameters<typeof anotar>[1]): Promise<void> {
      await reemplazar(
        ruta,
        await sellarBitacora(anotar(previa, entrada), frase),
      );
      anotada = true;
    },
    async deshacer(): Promise<void> {
      if (!anotada) return;
      if (existente) await reemplazar(ruta, existente);
      else await rm(ruta, { force: true });
      anotada = false;
    },
  };
}

/** S10: lo que esta corrida escribió se borra si la corrida no termina; nunca un archivo ajeno. */
export async function borrarEscritos(rutas: readonly string[]): Promise<void> {
  for (const ruta of rutas) await rm(ruta, { force: true });
}
