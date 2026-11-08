// Lo que comparten las órdenes de la consola (archivos y puente): la bitácora y la política pedida.

import { readFile, rename } from "node:fs/promises";

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

/**
 * La bitácora crece: si existe se abre, se le añade la entrada y se vuelve a sellar en su sitio
 * (como en la web, «se sobrescribe al crecer»), escribiendo primero a un archivo aparte y
 * renombrando: un corte a medias no deja la bitácora rota.
 */
export async function anotarEnBitacora(
  ruta: string,
  entrada: Parameters<typeof anotar>[1],
  idioma: Idioma,
): Promise<void> {
  const frase = await secreto("VELO_FRASE_BITACORA", V.pedir.fraseDeBitacora, idioma);
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
  const temporal = `${ruta}.${process.pid}.nueva`;
  await escribirNuevo(temporal, await sellarBitacora(anotar(previa, entrada), frase));
  await rename(temporal, ruta);
}
