// LA CONSOLA DE VELO LOCAL (S9, ADR-017): `pnpm velo <orden>`.
//
// Las frases de paso y la conexión a la base NO son argumentos: salen del entorno o de la consola
// sin eco (`./consola.ts`). Lo que sí es argumento —rutas, la política, la sal— no es secreto: la
// sal se enseña a propósito, porque sin ella la misma frase daría otra llave.

import { readFile, rename } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { nombreDelArchivoAnonimizado } from "@/engine/csv";
import { hashDePolitica } from "@/engine/politica";
import { abrirBitacora, sellarBitacora } from "@/lib/bitacora-archivo";
import {
  EXTENSION_DE_BOVEDA,
  abrirBoveda,
  sellarBoveda,
} from "@/lib/boveda-archivo";
import type { Idioma } from "@/lib/idioma";
import { decirMensaje } from "@/lib/idioma/mensajes";
import { formatoNumerico } from "@/lib/idioma";
import { NoCabeEnAltoVolumen } from "@/workers/alto-volumen";
import { ArchivoCambio } from "@/workers/json";

import { crearApi, escuchar, PUERTO_DE_LA_API } from "./api";
import { abrirArchivo, ArchivoNuevo, escribirNuevo } from "./archivos";
import { secreto } from "./consola";
import {
  anonimizar,
  anotar,
  DestinoConHuella,
  diagnosticar,
  esDeFabrica,
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

  // El nombre de salida depende del hash de la política, que ya se sabe: se abre antes de escribir.
  const hash = hashDePolitica(politica);
  const rutaDeSalida = join(carpeta, nombreDelArchivoAnonimizado(hash));
  const archivo = await ArchivoNuevo.crear(rutaDeSalida);
  let resultado;
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
    await archivo.abortar();
    throw error;
  }
  consola.salida(texto(V.resultado.escrito, idioma, { ruta: rutaDeSalida }));

  const rutaDelCertificado = join(carpeta, resultado.nombreDelCertificado);
  await escribirNuevo(rutaDelCertificado, resultado.certificado);
  consola.salida(
    texto(V.resultado.escrito, idioma, { ruta: rutaDelCertificado }),
  );

  if (resultado.boveda) {
    const fraseDeBoveda = await secreto(
      "VELO_FRASE_BOVEDA",
      V.pedir.fraseDeBoveda,
      idioma,
    );
    const rutaDeBoveda = join(
      carpeta,
      `velo-boveda-${hash.slice(0, 8)}${EXTENSION_DE_BOVEDA}`,
    );
    await escribirNuevo(
      rutaDeBoveda,
      await sellarBoveda(resultado.boveda, fraseDeBoveda),
    );
    consola.salida(texto(V.resultado.escrito, idioma, { ruta: rutaDeBoveda }));
  } else consola.aviso(texto(V.resultado.sinBoveda, idioma));

  if (args.values.bitacora) {
    await anotarEnBitacora(args.values.bitacora, resultado.entrada, idioma);
    consola.salida(
      texto(V.resultado.escrito, idioma, { ruta: args.values.bitacora }),
    );
  }

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
  const temporal = `${ruta}.${process.pid}.nueva`;
  await escribirNuevo(
    temporal,
    await sellarBitacora(anotar(previa, entrada), frase),
  );
  await rename(temporal, ruta);
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
  const carpeta = resolve(args.values.salida ?? dirname(ruta));
  const rutaDeSalida = join(
    carpeta,
    `velo-restaurado-${origen.sha256.slice(0, 8)}.csv`,
  );
  const archivo = await ArchivoNuevo.crear(rutaDeSalida);
  let resultado;
  try {
    resultado = await restaurar(
      fuente,
      origen,
      abierta.boveda,
      new DestinoConHuella(archivo),
    );
    await archivo.cerrar();
  } catch (error) {
    await archivo.abortar();
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

/** Las órdenes que se suman fuera de este archivo (el puente, F2). */
export type Orden = (
  args: Argumentos,
  idioma: Idioma,
  consola: Consola,
) => Promise<void>;
const ORDENES_EXTRA = new Map<string, Orden>();
export function registrarOrden(nombre: string, orden: Orden): void {
  ORDENES_EXTRA.set(nombre, orden);
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
    else if (ORDENES_EXTRA.has(orden))
      await ORDENES_EXTRA.get(orden)!(args, idioma, consola);
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
    else consola.aviso(`velo: ${(error as Error)?.name ?? "Error"}`);
    return 1;
  }
}
