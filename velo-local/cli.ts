// LA CONSOLA DE VELO LOCAL (S9, ADR-017): `pnpm velo <orden>`.
//
// Las frases de paso y la conexión a la base NO son argumentos: salen del entorno o de la consola
// sin eco (`./consola.ts`). Lo que sí es argumento —rutas, la política, la sal— no es secreto: la
// sal se enseña a propósito, porque sin ella la misma frase daría otra llave.

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { nombreDelArchivoAnonimizado } from "@/engine/csv";
import { hashDePolitica, requiereBoveda } from "@/engine/politica";
import {
  EXTENSION_DE_BOVEDA,
  abrirBoveda,
  sellarBoveda,
} from "@/lib/boveda-archivo";
import type { Idioma } from "@/lib/idioma";
import { decirMensaje } from "@/lib/idioma/mensajes";
import { formatoNumerico } from "@/lib/idioma";
import { NoCabeEnAltoVolumen } from "@/workers/alto-volumen";
import { ErrorDeJson } from "@/engine/json/tipos";
import { ArchivoCambio } from "@/workers/json";

import { crearApi, escuchar, PUERTO_DE_LA_API } from "./api";
import {
  abrirArchivo,
  ArchivoNuevo,
  EscrituraAMedias,
  escribirNuevo,
} from "./archivos";
import {
  abrirBitacoraPara,
  deshacerLaCorrida,
  pedidaDePolitica,
} from "./comun";
import { secreto } from "./consola";
import {
  abrirDevuelto,
  anonimizar,
  DestinoConHuella,
  diagnosticar,
  extensionDeSalida,
  fechaDelDocumento,
  llaveDelProyecto,
  resolverPolitica,
  restaurar,
} from "./nucleo";
import {
  ErrorDeVelo,
  idiomaDe,
  texto,
  textoDeError,
  VELO_LOCAL as V,
} from "./textos";
import { ordenPuente } from "./puente/orden";

/** Lo que la consola escribe. Las pruebas lo cambian por uno que guarda. */
export interface Consola {
  salida(linea: string): void;
  aviso(linea: string): void;
}

const CONSOLA_DEL_PROCESO: Consola = {
  salida: (linea) => process.stdout.write(`${linea}\n`),
  aviso: (linea) => process.stderr.write(`${linea}\n`),
};

const OPCIONES = {
  politica: { type: "string" },
  salida: { type: "string" },
  sal: { type: "string" },
  bitacora: { type: "string" },
  boveda: { type: "string" },
  tabla: { type: "string" },
  idioma: { type: "string" },
  restaurar: { type: "boolean" },
  reemplazar: { type: "boolean" },
  json: { type: "boolean" },
  ayuda: { type: "boolean", short: "h" },
} as const;

export type Argumentos = ReturnType<typeof leerArgumentos>;

function leerArgumentos(argv: readonly string[]) {
  return parseArgs({
    args: [...argv],
    options: OPCIONES,
    allowPositionals: true,
    strict: true,
  });
}

function porcentaje(valor: number, idioma: Idioma): string {
  return formatoNumerico(idioma, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(valor);
}

async function ordenDiagnosticar(
  args: Argumentos,
  idioma: Idioma,
  consola: Consola,
): Promise<void> {
  const ruta = args.positionals[1];
  if (!ruta) throw new ErrorDeVelo("sinArchivo");
  const { fuente, origen } = await abrirArchivo(ruta);
  const { informe } = await diagnosticar(fuente, origen);
  if (args.values.json) {
    consola.salida(JSON.stringify(informe, null, 2));
    return;
  }
  consola.salida(
    texto(V.resultado.diagnostico, idioma, {
      filas: formatoNumerico(idioma).format(informe.diagnostico.filas),
      columnas: informe.diagnostico.columnas.length,
      unicos: porcentaje(informe.riesgo.proporcionUnicos, idioma),
    }),
  );
  for (const c of informe.diagnostico.columnas)
    consola.salida(
      texto(V.resultado.columna, idioma, {
        nombre: c.nombre,
        categoria: c.categoria,
        tipo: decirMensaje(c.etiqueta, idioma),
      }),
    );
}

async function ordenAnonimizar(
  args: Argumentos,
  idioma: Idioma,
  consola: Consola,
  ahora: () => Date,
): Promise<void> {
  const ruta = args.positionals[1];
  if (!ruta) throw new ErrorDeVelo("sinArchivo");
  const pedida = await pedidaDePolitica(args.values.politica);
  const carpeta = resolve(args.values.salida ?? dirname(ruta));

  consola.aviso(texto(V.aviso.fraseIrrecuperable, idioma));
  const frase = await secreto("VELO_FRASE", V.pedir.frase, idioma);
  const llave = await llaveDelProyecto(frase, args.values.sal);
  consola.aviso(texto(V.aviso.sal, idioma, { sal: llave.sal }));
  consola.aviso(texto(V.aviso.huellaDeLlave, idioma, { huella: llave.huella }));

  const { fuente, origen } = await abrirArchivo(ruta);
  const { lectura } = await diagnosticar(fuente, origen);
  const politica = resolverPolitica(pedida, lectura.diagnostico, idioma);
  const fecha = fechaDelDocumento(idioma, ahora());

  // S10: las frases que faltan se piden ANTES de escribir el primer byte. Pedirlas después dejaba el
  // anonimizado y el certificado en el disco sin su bóveda si la frase no llegaba.
  const fraseDeBoveda = requiereBoveda(politica)
    ? await secreto("VELO_FRASE_BOVEDA", V.pedir.fraseDeBoveda, idioma)
    : null;
  const bitacora = args.values.bitacora
    ? await abrirBitacoraPara(args.values.bitacora, idioma)
    : null;

  // El nombre de salida depende del hash de la política, que ya se sabe: se abre antes de escribir.
  const hash = hashDePolitica(politica);
  const rutaDeSalida = join(
    carpeta,
    nombreDelArchivoAnonimizado(hash, extensionDeSalida(lectura)),
  );
  const escritos: string[] = [];
  let resultado;
  try {
    const archivo = await ArchivoNuevo.crear(rutaDeSalida);
    try {
      resultado = await anonimizar({
        fuente,
        origen,
        lectura,
        politica,
        llave,
        idioma,
        destino: new DestinoConHuella(archivo),
        fecha,
      });
      await archivo.cerrar();
    } catch (error) {
      if (!(await archivo.abortar()))
        throw new EscrituraAMedias(rutaDeSalida, error);
      throw error;
    }
    escritos.push(rutaDeSalida);

    const rutaDelCertificado = join(carpeta, resultado.nombreDelCertificado);
    await escribirNuevo(rutaDelCertificado, resultado.certificado);
    escritos.push(rutaDelCertificado);

    if (resultado.boveda) {
      const rutaDeBoveda = join(
        carpeta,
        `velo-boveda-${hash.slice(0, 8)}${EXTENSION_DE_BOVEDA}`,
      );
      await escribirNuevo(
        rutaDeBoveda,
        await sellarBoveda(
          resultado.boveda,
          fraseDeBoveda ??
            (await secreto("VELO_FRASE_BOVEDA", V.pedir.fraseDeBoveda, idioma)),
        ),
      );
      escritos.push(rutaDeBoveda);
    }
    await bitacora?.anotar(resultado.entrada);
  } catch (error) {
    // Un anonimizado sin su bóveda o un certificado sin su archivo no quedan a medias en el disco;
    // si algo no se pudo borrar, se dice cuál.
    throw await deshacerLaCorrida(escritos, bitacora, error, consola, idioma);
  }
  for (const ruta of escritos)
    consola.salida(texto(V.resultado.escrito, idioma, { ruta }));
  if (!resultado.boveda) consola.aviso(texto(V.resultado.sinBoveda, idioma));
  if (bitacora)
    consola.salida(texto(V.resultado.escrito, idioma, { ruta: bitacora.ruta }));

  consola.salida(
    texto(V.resultado.huellas, idioma, {
      entrada: origen.sha256,
      salida: resultado.sha256DeSalida,
    }),
  );
  consola.salida(
    texto(V.resultado.riesgo, idioma, {
      antes: porcentaje(resultado.unicosAntes, idioma),
      despues: porcentaje(resultado.unicosDespues, idioma),
    }),
  );
}

async function ordenRestaurar(
  args: Argumentos,
  idioma: Idioma,
  consola: Consola,
): Promise<void> {
  const ruta = args.positionals[1];
  if (!ruta) throw new ErrorDeVelo("sinArchivo");
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
    throw new ErrorDeVelo("bovedaInvalida", { detalle: args.values.boveda });
  }
  const abierta = await abrirBoveda(sellada, fraseDeBoveda);
  if (!abierta.ok)
    throw new ErrorDeVelo("bovedaInvalida", {
      detalle: decirMensaje(abierta.detalle, idioma),
    });

  const { fuente, origen } = await abrirArchivo(ruta);
  // La pasada R1 va antes de abrir el destino: de ella sale si lo restaurado es CSV, JSON o JSON Lines.
  const devuelto = await abrirDevuelto(fuente, origen);
  const carpeta = resolve(args.values.salida ?? dirname(ruta));
  const rutaDeSalida = join(
    carpeta,
    `velo-restaurado-${origen.sha256.slice(0, 8)}.${devuelto.extension}`,
  );
  const archivo = await ArchivoNuevo.crear(rutaDeSalida);
  let resultado;
  try {
    resultado = await restaurar(
      fuente,
      origen,
      abierta.boveda,
      new DestinoConHuella(archivo),
      {},
      devuelto,
    );
    await archivo.cerrar();
  } catch (error) {
    if (!(await archivo.abortar()))
      consola.aviso(
        texto(V.aviso.quedoSinBorrar, idioma, { ruta: rutaDeSalida }),
      );
    throw error;
  }
  consola.salida(texto(V.resultado.escrito, idioma, { ruta: rutaDeSalida }));
  consola.salida(
    texto(V.resultado.restaurado, idioma, {
      restauradas: formatoNumerico(idioma).format(
        resultado.totales.restauradas,
      ),
      filas: formatoNumerico(idioma).format(resultado.filas),
    }),
  );
}

async function ordenApi(
  args: Argumentos,
  idioma: Idioma,
  consola: Consola,
): Promise<void> {
  consola.aviso(texto(V.aviso.fraseIrrecuperable, idioma));
  const frase = await secreto("VELO_FRASE", V.pedir.frase, idioma);
  const llave = await llaveDelProyecto(frase, args.values.sal);
  const fraseDeBoveda = await secreto(
    "VELO_FRASE_BOVEDA",
    V.pedir.fraseDeBoveda,
    idioma,
  );
  consola.aviso(texto(V.aviso.sal, idioma, { sal: llave.sal }));
  consola.aviso(texto(V.aviso.huellaDeLlave, idioma, { huella: llave.huella }));
  const config = {
    llave,
    fraseDeBoveda,
    idioma,
    politicaPorDefecto: args.values.politica,
  };
  const { servidor, token } = crearApi(config);
  const puerto = await escuchar(servidor, config, PUERTO_DE_LA_API);
  consola.aviso(texto(V.api.escuchando, idioma, { puerto }));
  consola.salida(token);
  consola.aviso(texto(V.api.cerrar, idioma));
  await new Promise<void>((resolver) => {
    const cerrar = () => servidor.close(() => resolver());
    process.once("SIGINT", cerrar);
    process.once("SIGTERM", cerrar);
  });
}

/** La orden entera. Devuelve el código de salida; los errores se dicen en el idioma de la orden. */
export async function principal(
  argv: readonly string[],
  consola: Consola = CONSOLA_DEL_PROCESO,
  ahora: () => Date = () => new Date(),
): Promise<number> {
  let args: Argumentos;
  try {
    args = leerArgumentos(argv);
  } catch {
    consola.aviso(texto(V.error.uso, idiomaDe(undefined)));
    return 2;
  }
  const idioma = idiomaDe(args.values.idioma);
  const orden = args.positionals[0];
  if (args.values.ayuda || !orden) {
    consola.salida(texto(V.ayuda, idioma));
    return 0;
  }
  try {
    if (orden === "diagnosticar")
      await ordenDiagnosticar(args, idioma, consola);
    else if (orden === "anonimizar")
      await ordenAnonimizar(args, idioma, consola, ahora);
    else if (orden === "restaurar") await ordenRestaurar(args, idioma, consola);
    else if (orden === "api") await ordenApi(args, idioma, consola);
    else if (orden === "puente")
      await ordenPuente(args, idioma, consola, ahora);
    else {
      consola.aviso(texto(V.error.uso, idioma));
      return 2;
    }
    return 0;
  } catch (error) {
    // Jamás el mensaje crudo de la excepción: podría llevar un valor del archivo o la conexión.
    if (error instanceof ErrorDeVelo)
      consola.aviso(textoDeError(error, idioma));
    else if (error instanceof NoCabeEnAltoVolumen)
      consola.aviso(texto(V.error.noCabe, idioma, { motivo: error.motivo }));
    else if (error instanceof ArchivoCambio)
      consola.aviso(texto(V.error.archivoCambio, idioma));
    else if (error instanceof ErrorDeJson)
      consola.aviso(
        texto(V.error.jsonInvalido, idioma, {
          motivo: error.motivo,
          linea: error.linea ?? "?",
        }),
      );
    else consola.aviso(`velo: ${(error as Error)?.name ?? "Error"}`);
    return 1;
  }
}
