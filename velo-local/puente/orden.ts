// `pnpm velo puente` (S9, ADR-017): una tabla de la base se anonimiza en su sitio, sin exportar un
// archivo intermedio, y se escribe en una tabla NUEVA. La original jamás se toca.
//
// La conexión sale de `VELO_DB_URL` o de la consola sin eco: nunca de un argumento. Si falta la
// tabla o la política y hay una persona delante, un asistente las pregunta (con la lista de las
// tablas que tienen llave primaria); sin consola, es un error que dice qué falta.

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  abrirBoveda,
  EXTENSION_DE_BOVEDA,
  sellarBoveda,
} from "@/lib/boveda-archivo";
import type { Idioma } from "@/lib/idioma";
import { decirMensaje } from "@/lib/idioma/mensajes";
import { formatoNumerico } from "@/lib/idioma";

import { escribirNuevo } from "../archivos";
import { abrirBitacoraPara, borrarEscritos, pedidaDePolitica } from "../comun";
import { preguntar, secreto } from "../consola";
import { fechaDelDocumento, llaveDelProyecto } from "../nucleo";
import { ErrorDeVelo, texto, VELO_LOCAL as V } from "../textos";
import type { Argumentos, Consola } from "../cli";
import { conectar } from "./conectar";
import { partirTabla, type Conexion } from "./motor";
import { anonimizarTabla, restaurarTabla } from "./tabla";

/** Pregunta lo que falta, si hay una persona delante. */
async function preguntarSiHaceFalta(
  dado: string | undefined,
  pregunta: Parameters<typeof texto>[0],
  idioma: Idioma,
  falta: ConstructorParameters<typeof ErrorDeVelo>[0],
): Promise<string> {
  if (dado) return dado;
  if (!process.stdin.isTTY) throw new ErrorDeVelo(falta);
  const respuesta = (await preguntar(texto(pregunta, idioma), false)).trim();
  if (!respuesta) throw new ErrorDeVelo(falta);
  return respuesta;
}

/** El asistente de la tabla: lista las que tienen llave primaria y pregunta cuál. */
async function elegirTabla(
  conexion: Conexion,
  dada: string | undefined,
  idioma: Idioma,
  consola: Consola,
): Promise<string> {
  if (!dada && process.stdin.isTTY) {
    consola.aviso(texto(V.pedir.tablas, idioma));
    for (const t of await conexion.tablas())
      consola.aviso(`  ${t.esquema}.${t.tabla}`);
  }
  return preguntarSiHaceFalta(dada, V.pedir.tabla, idioma, "tablaDesconocida");
}

export async function ordenPuente(
  args: Argumentos,
  idioma: Idioma,
  consola: Consola,
  ahora: () => Date,
): Promise<void> {
  const url = await secreto(
    "VELO_DB_URL",
    V.pedir.conexion,
    idioma,
    "sinConexion",
  );
  const conexion = await conectar(url);
  try {
    const { esquema, tabla } = partirTabla(
      await elegirTabla(conexion, args.values.tabla, idioma, consola),
      conexion.motor,
    );
    const carpeta = resolve(args.values.salida ?? process.cwd());
    const fecha = fechaDelDocumento(idioma, ahora());
    const numero = formatoNumerico(idioma);

    if (args.values.restaurar) {
      if (!args.values.boveda) throw new ErrorDeVelo("sinBoveda");
      const fraseDeBoveda = await secreto(
        "VELO_FRASE_BOVEDA",
        V.pedir.fraseDeBoveda,
        idioma,
      );
      let sellada: Uint8Array;
      try {
        sellada = new Uint8Array(await readFile(args.values.boveda));
      } catch {
        throw new ErrorDeVelo("bovedaInvalida", {
          detalle: args.values.boveda,
        });
      }
      const abierta = await abrirBoveda(sellada, fraseDeBoveda);
      if (!abierta.ok)
        throw new ErrorDeVelo("bovedaInvalida", {
          detalle: decirMensaje(abierta.detalle, idioma),
        });
      const r = await restaurarTabla({
        conexion,
        esquema,
        tabla,
        idioma,
        fecha,
        reemplazar: args.values.reemplazar ?? false,
        boveda: abierta.boveda,
      });
      consola.salida(
        texto(V.puente.tablaEscrita, idioma, {
          tabla: `${esquema}.${r.nombreDeLaNueva}`,
          filas: numero.format(r.filas),
          huella: r.huellaDeOrigen.sha256,
        }),
      );
      consola.salida(
        texto(V.resultado.restaurado, idioma, {
          restauradas: numero.format(r.restauradas),
          filas: numero.format(r.filas),
        }),
      );
      // S10 (regla 17-bis): la tabla restaurada es tan sensible como la original, y no sale cifrada.
      consola.aviso(
        texto(V.puente.restauradaEnClaro, idioma, {
          tabla: `${esquema}.${r.nombreDeLaNueva}`,
        }),
      );
      return;
    }

    const politica = await pedidaDePolitica(
      await preguntarSiHaceFalta(
        args.values.politica,
        V.pedir.politica,
        idioma,
        "sinPolitica",
      ),
    );
    consola.aviso(texto(V.aviso.fraseIrrecuperable, idioma));
    const frase = await secreto("VELO_FRASE", V.pedir.frase, idioma);
    const llave = await llaveDelProyecto(frase, args.values.sal);
    consola.aviso(texto(V.aviso.sal, idioma, { sal: llave.sal }));
    consola.aviso(
      texto(V.aviso.huellaDeLlave, idioma, { huella: llave.huella }),
    );

    // S10: la bitácora se abre (y su frase se comprueba) antes de leer la tabla.
    const bitacora = args.values.bitacora
      ? await abrirBitacoraPara(args.values.bitacora, idioma)
      : null;
    const escritos: string[] = [];
    let r;
    try {
      r = await anonimizarTabla({
        conexion,
        esquema,
        tabla,
        idioma,
        fecha,
        reemplazar: args.values.reemplazar ?? false,
        politica,
        llave,
        antesDeConfirmar: async (resultado) => {
          // Antes del COMMIT: un archivo que ya existe hace ROLLBACK y no queda una tabla huérfana.
          // S10: la frase de la bóveda se pide antes del primer archivo; lo escrito se borra si algo falla.
          const fraseDeBoveda = resultado.boveda
            ? await secreto("VELO_FRASE_BOVEDA", V.pedir.fraseDeBoveda, idioma)
            : null;
          const rutaDelCertificado = join(
            carpeta,
            (await import("@/engine/reporte")).nombreDelCertificado(
              `${esquema}-${tabla}`,
              idioma,
            ),
          );
          await escribirNuevo(rutaDelCertificado, resultado.certificado);
          escritos.push(rutaDelCertificado);
          if (resultado.boveda && fraseDeBoveda !== null) {
            const rutaDeBoveda = join(
              carpeta,
              `velo-boveda-${resultado.hashDePolitica.slice(0, 8)}${EXTENSION_DE_BOVEDA}`,
            );
            await escribirNuevo(
              rutaDeBoveda,
              await sellarBoveda(resultado.boveda, fraseDeBoveda),
            );
            escritos.push(rutaDeBoveda);
          }
          await bitacora?.anotar(resultado.entrada);
        },
      });
    } catch (error) {
      // El ROLLBACK ya quitó la tabla: el certificado y la bóveda de una tabla que no existe, tampoco.
      await borrarEscritos(escritos);
      await bitacora?.deshacer();
      throw error;
    }
    if (args.values.bitacora) escritos.push(args.values.bitacora);
    consola.salida(
      texto(V.puente.tablaEscrita, idioma, {
        tabla: `${esquema}.${r.nombreDeLaNueva}`,
        filas: numero.format(r.resultado.filas),
        huella: r.huellaDeOrigen.sha256,
      }),
    );
    for (const ruta of escritos)
      consola.salida(texto(V.resultado.escrito, idioma, { ruta }));
    if (!r.resultado.boveda)
      consola.aviso(texto(V.resultado.sinBoveda, idioma));
    consola.salida(
      texto(V.resultado.huellas, idioma, {
        entrada: r.huellaDeOrigen.sha256,
        salida: r.resultado.sha256DeSalida,
      }),
    );
    consola.salida(
      texto(V.resultado.riesgo, idioma, {
        antes: formatoNumerico(idioma, {
          style: "percent",
          maximumFractionDigits: 1,
        }).format(r.resultado.unicosAntes),
        despues: formatoNumerico(idioma, {
          style: "percent",
          maximumFractionDigits: 1,
        }).format(r.resultado.unicosDespues),
      }),
    );
    consola.aviso(texto(V.puente.nota, idioma));
  } finally {
    await conexion.cerrar();
  }
}
