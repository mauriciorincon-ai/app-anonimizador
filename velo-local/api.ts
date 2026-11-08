// LA API DE VELO LOCAL (S9, ADR-017) — para los procesos del usuario, en SU equipo.
//
// Escucha solo en 127.0.0.1 y cada petición pasa cinco filtros antes de tocar un byte:
//
//   1 · el socket viene de loopback (127.0.0.1 o ::1): nadie de la red, aunque el puerto se abriera;
//   2 · la cabecera `Host` es la de este puerto en loopback: un sitio web que apunte su dominio a
//       127.0.0.1 (rebinding de DNS) manda su propio `Host` y se queda fuera;
//   3 · sin cabecera `Origin`: un navegador la pone en toda petición entre sitios, un proceso del
//       usuario no la necesita. Tampoco hay CORS: ninguna respuesta lleva `Access-Control-*`;
//   4 · el token de ESTE arranque (32 bytes aleatorios, mostrado una vez), comparado en tiempo
//       constante;
//   5 · el cuerpo con tope: más grande, 413 antes de guardarlo.
//
// La llave se deriva UNA vez, al arrancar, y no viaja en ninguna petición. Y no hay un modo rápido:
// `anonimizar` mide el riesgo y devuelve el certificado, siempre.

import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import { serializarBoveda } from "@/engine/boveda";
import type { Politica } from "@/engine/politica";
import { abrirBoveda, sellarBoveda } from "@/lib/boveda-archivo";
import type { Idioma } from "@/lib/idioma";
import { decirMensaje } from "@/lib/idioma/mensajes";
import type { LlaveDeProyecto } from "@/lib/llave";
import { Sha256 } from "@/lib/sha256";
import { NoCabeEnAltoVolumen } from "@/workers/alto-volumen";
import { ArchivoCambio } from "@/workers/json";

import {
  anonimizar,
  DestinoConHuella,
  diagnosticar,
  esDeFabrica,
  fechaDelDocumento,
  resolverPolitica,
  restaurar,
  type Origen,
} from "./nucleo";
import { ErrorDeVelo, textoDeError } from "./textos";

export const PUERTO_DE_LA_API = 3301;
export const HOST_DE_LA_API = "127.0.0.1";
/** 256 MiB: un CSV de varios millones de filas cabe; un cuerpo sin fin, no. */
export const TOPE_DEL_CUERPO = 256 * 1024 * 1024;

export const RUTAS_DE_LA_API = [
  "GET /v1/salud",
  "POST /v1/diagnosticar",
  "POST /v1/anonimizar",
  "POST /v1/restaurar",
] as const;

export interface ConfiguracionDeLaApi {
  readonly llave: LlaveDeProyecto;
  readonly fraseDeBoveda: string;
  readonly idioma: Idioma;
  /** La política si la petición no trae `X-Velo-Politica`. */
  readonly politicaPorDefecto?: string;
  /** El puerto que se espera en `Host`; el real, si se pidió el 0 (las pruebas). */
  puerto?: number;
  readonly token?: string;
  readonly topeDelCuerpo?: number;
  /** El reloj, para la fecha del certificado. Las pruebas lo fijan. */
  readonly ahora?: () => Date;
}

/** Un token nuevo: 32 bytes del generador del sistema, en hexadecimal. */
export function nuevoToken(): string {
  return randomBytes(32).toString("hex");
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

class Rechazo extends Error {
  constructor(
    readonly estado: number,
    readonly clave: string,
  ) {
    super(clave);
  }
}

function mismoToken(dado: string, esperado: string): boolean {
  const a = Buffer.from(dado);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Los cinco filtros. Lanza un `Rechazo` con su estado; no lee el cuerpo. */
export function filtrar(
  peticion: Pick<IncomingMessage, "headers" | "socket">,
  token: string,
  puerto: number,
): void {
  if (!LOOPBACK.has(peticion.socket.remoteAddress ?? ""))
    throw new Rechazo(403, "fuera-de-loopback");
  const host = peticion.headers.host ?? "";
  if (host !== `127.0.0.1:${puerto}` && host !== `localhost:${puerto}`)
    throw new Rechazo(421, "host-ajeno");
  if (peticion.headers.origin !== undefined)
    throw new Rechazo(403, "con-origin");
  const autorizacion = peticion.headers.authorization ?? "";
  const dado = autorizacion.startsWith("Bearer ") ? autorizacion.slice(7) : "";
  if (!mismoToken(dado, token)) throw new Rechazo(401, "sin-token");
}

async function leerCuerpo(
  peticion: IncomingMessage,
  tope: number,
): Promise<Uint8Array> {
  const declarado = Number(peticion.headers["content-length"] ?? "0");
  if (declarado > tope) throw new Rechazo(413, "cuerpo-excede-tope");
  const partes: Buffer[] = [];
  let total = 0;
  for await (const parte of peticion) {
    total += (parte as Buffer).length;
    if (total > tope) throw new Rechazo(413, "cuerpo-excede-tope");
    partes.push(parte as Buffer);
  }
  return new Uint8Array(Buffer.concat(partes));
}

function responder(
  respuesta: ServerResponse,
  estado: number,
  cuerpo: unknown,
  cerrar = false,
): void {
  const texto = JSON.stringify(cuerpo);
  respuesta.writeHead(estado, {
    // Un rechazo cierra la conexión: lo que quedara del cuerpo no se lee en la siguiente petición.
    ...(cerrar ? { Connection: "close" } : {}),
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(texto),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  respuesta.end(texto);
}

/** Un sumidero en memoria: la respuesta de la API lleva el archivo entero. */
class EnMemoria {
  readonly partes: Uint8Array[] = [];
  async escribir(bytes: Uint8Array): Promise<void> {
    this.partes.push(bytes);
  }
  base64(): string {
    return Buffer.concat(this.partes).toString("base64");
  }
}

function origenDe(peticion: IncomingMessage, bytes: Uint8Array): Origen {
  const nombre = String(peticion.headers["x-velo-nombre"] ?? "velo-api.csv");
  return {
    // Solo el nombre, nunca una ruta: lo que viene de la cabecera no se usa para abrir nada.
    nombre: nombre.replace(/[/\\]/g, "_").slice(0, 200),
    bytes: bytes.length,
    sha256: new Sha256().actualizar(bytes).terminar(),
  };
}

async function politicaDe(
  pedida: string,
  diagnostico: Parameters<typeof resolverPolitica>[1],
  idioma: Idioma,
): Promise<Politica> {
  if (esDeFabrica(pedida))
    return resolverPolitica({ fabrica: pedida }, diagnostico, idioma);
  let texto: string;
  try {
    texto = await readFile(pedida, "utf8");
  } catch {
    throw new ErrorDeVelo("politicaInvalida", { detalle: "?" });
  }
  return resolverPolitica({ texto }, diagnostico, idioma);
}

async function atender(
  peticion: IncomingMessage,
  respuesta: ServerResponse,
  config: ConfiguracionDeLaApi,
  token: string,
): Promise<void> {
  filtrar(peticion, token, config.puerto ?? PUERTO_DE_LA_API);
  const ruta = `${peticion.method} ${(peticion.url ?? "").split("?")[0]}`;
  const { idioma } = config;

  if (ruta === "GET /v1/salud") {
    responder(respuesta, 200, { ok: true, huellaDeLlave: config.llave.huella });
    return;
  }
  if (!(RUTAS_DE_LA_API as readonly string[]).includes(ruta))
    throw new Rechazo(404, "ruta-desconocida");

  const bytes = await leerCuerpo(
    peticion,
    config.topeDelCuerpo ?? TOPE_DEL_CUERPO,
  );
  const origen = origenDe(peticion, bytes);
  const fuente = new Blob([bytes as Uint8Array<ArrayBuffer>]);

  if (ruta === "POST /v1/diagnosticar") {
    const { informe } = await diagnosticar(fuente, origen);
    responder(respuesta, 200, informe);
    return;
  }

  if (ruta === "POST /v1/anonimizar") {
    const pedida =
      (peticion.headers["x-velo-politica"] as string | undefined) ??
      config.politicaPorDefecto;
    if (!pedida) throw new ErrorDeVelo("sinPolitica");
    const { lectura } = await diagnosticar(fuente, origen);
    const politica = await politicaDe(pedida, lectura.diagnostico, idioma);
    const memoria = new EnMemoria();
    const resultado = await anonimizar({
      fuente,
      origen,
      lectura,
      politica,
      llave: config.llave,
      idioma,
      destino: new DestinoConHuella(memoria),
      fecha: fechaDelDocumento(idioma, (config.ahora ?? (() => new Date()))()),
    });
    const boveda = resultado.boveda
      ? Buffer.from(
          await sellarBoveda(resultado.boveda, config.fraseDeBoveda),
        ).toString("base64")
      : null;
    responder(respuesta, 200, {
      nombre: resultado.nombreDeSalida,
      anonimizado: memoria.base64(),
      sha256DeEntrada: origen.sha256,
      sha256DeSalida: resultado.sha256DeSalida,
      hashDePolitica: resultado.hashDePolitica,
      filas: resultado.filas,
      riesgo: {
        unicosAntes: resultado.unicosAntes,
        unicosDespues: resultado.unicosDespues,
      },
      certificado: resultado.certificado,
      boveda,
    });
    return;
  }

  // POST /v1/restaurar: el cuerpo es el archivo devuelto; la bóveda, una ruta de este equipo.
  const rutaDeBoveda = peticion.headers["x-velo-boveda"] as string | undefined;
  if (!rutaDeBoveda) throw new ErrorDeVelo("sinBoveda");
  let sellada: Uint8Array;
  try {
    sellada = new Uint8Array(await readFile(rutaDeBoveda));
  } catch {
    throw new ErrorDeVelo("bovedaInvalida", { detalle: "?" });
  }
  const abierta = await abrirBoveda(sellada, config.fraseDeBoveda);
  if (!abierta.ok)
    throw new ErrorDeVelo("bovedaInvalida", {
      detalle: decirMensaje(abierta.detalle, idioma),
    });
  const memoria = new EnMemoria();
  const resultado = await restaurar(
    fuente,
    origen,
    abierta.boveda,
    new DestinoConHuella(memoria),
  );
  responder(respuesta, 200, {
    restaurado: memoria.base64(),
    sha256DeSalida: resultado.sha256DeSalida,
    filas: resultado.filas,
    totales: resultado.totales,
    reconocimiento: resultado.reconocimiento,
    huellaDeBoveda: new Sha256()
      .actualizar(new TextEncoder().encode(serializarBoveda(abierta.boveda)))
      .terminar(),
  });
}

/**
 * El servidor, sin escuchar todavía. Un error se responde con su CLAVE y, si Velo sabe explicarlo,
 * su texto; jamás con el mensaje crudo de una excepción, que podría llevar un valor del archivo.
 */
export function crearApi(config: ConfiguracionDeLaApi): {
  readonly servidor: Server;
  readonly token: string;
} {
  const token = config.token ?? nuevoToken();
  const servidor = createServer((peticion, respuesta) => {
    atender(peticion, respuesta, config, token).catch((error: unknown) => {
      if (error instanceof Rechazo) {
        responder(respuesta, error.estado, { error: error.clave }, true);
      } else if (error instanceof ErrorDeVelo)
        responder(respuesta, 422, {
          error: error.clave,
          mensaje: textoDeError(error, config.idioma),
        });
      else if (error instanceof NoCabeEnAltoVolumen)
        responder(respuesta, 422, { error: error.motivo });
      else if (error instanceof ArchivoCambio)
        responder(respuesta, 409, { error: "archivo-cambio" });
      else responder(respuesta, 500, { error: "fallo-interno" });
    });
  });
  return { servidor, token };
}

/** Escucha SOLO en 127.0.0.1. El puerto 0 (las pruebas) toma uno libre y lo anota en la config. */
export function escuchar(
  servidor: Server,
  config: ConfiguracionDeLaApi,
  puerto = PUERTO_DE_LA_API,
): Promise<number> {
  return new Promise((resolver, rechazar) => {
    servidor.once("error", rechazar);
    servidor.listen(puerto, HOST_DE_LA_API, () => {
      const direccion = servidor.address();
      const real =
        typeof direccion === "object" && direccion ? direccion.port : puerto;
      config.puerto = real;
      resolver(real);
    });
  });
}
