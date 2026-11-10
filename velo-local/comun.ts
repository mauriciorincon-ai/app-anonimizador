// Lo que comparten las órdenes de la consola (archivos y puente): la bitácora y la política pedida.

import { readFile, rename, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { abrirBitacora, sellarBitacora } from "@/lib/bitacora-archivo";
import type { Idioma } from "@/lib/idioma";
import { decirMensaje } from "@/lib/idioma/mensajes";

import { EscrituraAMedias, escribirNuevo } from "./archivos";
import { secreto } from "./consola";
import { anotar, esDeFabrica } from "./nucleo";
import { ErrorDeVelo, texto, VELO_LOCAL as V } from "./textos";

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
export async function reemplazar(ruta: string, bytes: Uint8Array): Promise<void> {
  const temporal = `${ruta}.${process.pid}.nueva`;
  try {
    await escribirNuevo(temporal, bytes);
    await rename(temporal, ruta);
  } catch (error) {
    // Si el aborto de la escritura ya había fallado y el temporal se borra ahora, el problema
    // que importa es la causa: el envoltorio solo avisaba de un archivo que ya no está.
    const borrado = await rm(temporal, { force: true }).then(
      () => true,
      () => false,
    );
    if (error instanceof EscrituraAMedias && borrado) throw error.causa;
    throw error;
  }
}

/**
 * `--salida`, o `porOmision`. Lo pedido debe existir, y si no se dice ANTES de pedir ninguna frase o
 * conexión; la carpeta por omisión (la del archivo de entrada, o la de trabajo) no se comprueba:
 * si faltara, lo que falta es el archivo y `abrirArchivo` lo dice con sus palabras.
 */
export async function carpetaDeSalida(
  pedida: string | undefined,
  porOmision: string,
): Promise<string> {
  const carpeta = resolve(pedida ?? porOmision);
  if (pedida === undefined) return carpeta;
  const info = await stat(carpeta).catch(() => null);
  if (!info?.isDirectory()) throw new ErrorDeVelo("carpetaNoExiste");
  return carpeta;
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

/**
 * S10: lo que esta corrida escribió se borra si la corrida no termina; nunca un archivo ajeno.
 * S12: intenta con TODOS (un fallo no deja sin borrar a los demás) y devuelve los que NO pudo borrar,
 * para que quien llama los nombre.
 */
export async function borrarEscritos(
  rutas: readonly string[],
): Promise<string[]> {
  const quedaron: string[] = [];
  for (const ruta of rutas)
    try {
      await rm(ruta, { force: true });
    } catch {
      quedaron.push(ruta);
    }
  return quedaron;
}

/**
 * Lo que se hace cuando una corrida falla después de escribir: se borra lo escrito, se deshace la
 * bitácora y se AVISA de cada archivo que no se pudo borrar (queda en el disco, y la persona tiene
 * que saberlo para quitarlo). Devuelve el error que se relanza: la causa, no el envoltorio.
 */
export async function deshacerLaCorrida(
  escritos: readonly string[],
  bitacora: { deshacer(): Promise<void> } | null | undefined,
  error: unknown,
  consola: { aviso(linea: string): void },
  idioma: Idioma,
): Promise<unknown> {
  const quedaron = await borrarEscritos(escritos);
  if (error instanceof EscrituraAMedias) quedaron.push(error.ruta);
  await bitacora?.deshacer();
  for (const ruta of quedaron)
    consola.aviso(texto(V.aviso.quedoSinBorrar, idioma, { ruta }));
  return error instanceof EscrituraAMedias ? error.causa : error;
}
