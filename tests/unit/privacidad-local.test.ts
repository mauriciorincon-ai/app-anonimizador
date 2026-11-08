// @vitest-environment node
//
// GATE DE PRIVACIDAD DE VELO LOCAL (S9, regla dura nº2 ampliada, ADR-017).
//
// En la web, los datos jamás salen del navegador (`privacidad.test.ts`). En Velo local, jamás salen
// del equipo: el proceso escucha solo en loopback, con token y `Host` verificados; no hay Sentry ni
// telemetría; la única conexión saliente es a la base que el usuario configura (y solo desde
// `velo-local/puente/`); los secretos no son argumentos. Esto se prueba de tres maneras:
//
//   1 · barrido del código de `velo-local/`: lo que no puede aparecer, no aparece;
//   2 · la API de verdad, en un puerto libre: cada uno de los cinco filtros rechaza;
//   3 · una corrida entera de `pnpm velo anonimizar` con `net.Socket.connect` espiado: cero
//       conexiones.

import {
  readdirSync,
  readFileSync,
  statSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { request } from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { generarFilas } from "../../docs/kit-de-prueba/generador.mjs";
import { escaparCampo } from "@/engine/csv";
import { derivarLlave } from "@/lib/llave";

import {
  crearApi,
  escuchar,
  filtrar,
  RUTAS_DE_LA_API,
  type ConfiguracionDeLaApi,
} from "../../velo-local/api";
import { principal } from "../../velo-local/cli";

const RAIZ = join(__dirname, "..", "..");
const VELO_LOCAL = join(RAIZ, "velo-local");

function archivosDe(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    return statSync(ruta).isDirectory()
      ? archivosDe(ruta)
      : ruta.endsWith(".ts")
        ? [ruta]
        : [];
  });
}

const FUENTES = archivosDe(VELO_LOCAL).map((ruta) => ({
  ruta: relative(RAIZ, ruta),
  codigo: readFileSync(ruta, "utf8"),
}));

/** Sin comentarios: el barrido mira el código, no lo que el código dice que no hace. */
const sinComentarios = (codigo: string) =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("barrido de velo-local/", () => {
  it("existe y se barre", () => {
    expect(FUENTES.length).toBeGreaterThan(4);
  });

  const VETADOS: [string, RegExp][] = [
    ["fetch", /\bfetch\s*\(/],
    ["XMLHttpRequest", /XMLHttpRequest/],
    ["WebSocket", /WebSocket/],
    ["sendBeacon", /sendBeacon/],
    ["Sentry", /@sentry|Sentry\./],
    ["https", /["']node:https["']|["']https["']/],
    ["http.request / http.get", /\b(request|get)\s*\(\s*["'`]?https?:/],
    ["console.log", /console\.(log|info|debug)\s*\(/],
    ["dgram / tls", /["']node:(dgram|tls)["']/],
  ];
  for (const [nombre, patron] of VETADOS)
    it(`sin ${nombre}`, () => {
      const con = FUENTES.filter((f) =>
        patron.test(sinComentarios(f.codigo)),
      ).map((f) => f.ruta);
      expect(con).toEqual([]);
    });

  it("node:http y .listen solo en api.ts, y solo en 127.0.0.1", () => {
    const conHttp = FUENTES.filter((f) =>
      /["']node:http["']/.test(f.codigo),
    ).map((f) => f.ruta);
    expect(conHttp).toEqual([join("velo-local", "api.ts")]);
    const api = sinComentarios(
      FUENTES.find((f) => f.ruta.endsWith("api.ts"))!.codigo,
    );
    expect(api).toMatch(/HOST_DE_LA_API = "127\.0\.0\.1"/);
    expect(
      [...api.matchAll(/\.listen\(([^)]*)\)/g)].map((m) =>
        m[1].split(",")[1]?.trim(),
      ),
    ).toEqual(["HOST_DE_LA_API"]);
  });

  it("los drivers de base solo dentro de velo-local/puente/", () => {
    const fuera = FUENTES.filter(
      (f) =>
        !f.ruta.startsWith(join("velo-local", "puente")) &&
        /from ["'](pg|mssql|node:net)["']/.test(f.codigo),
    ).map((f) => f.ruta);
    expect(fuera).toEqual([]);
  });

  it("ningún secreto es un argumento de la consola", () => {
    const cli = FUENTES.find((f) => f.ruta.endsWith("cli.ts"))!.codigo;
    const opciones = cli.slice(
      cli.indexOf("const OPCIONES"),
      cli.indexOf("} as const;"),
    );
    const nombres = [...opciones.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
    expect(nombres.length).toBeGreaterThan(5);
    expect(
      nombres.filter((n) =>
        /frase|clave|pass|token|url|conexion|secreto/i.test(n),
      ),
    ).toEqual([]);
  });
});

// ── La API de verdad ──────────────────────────────────────────────────────────────────────────

const KIT = [...generarFilas({
    filas: 300,
    seed: 42,
    perfil: "clinico",
    tasaInvalida: 0.08,
    tasaVacia: 0.03,
  })]
  .map((fila) => `${fila.map(escaparCampo).join(",")}\n`)
  .join("");

let config: ConfiguracionDeLaApi;
let servidor: ReturnType<typeof crearApi>["servidor"];
let token: string;
let puerto: number;

beforeAll(async () => {
  config = {
    llave: await derivarLlave("una frase de la api", "0".repeat(32)),
    fraseDeBoveda: "la frase de la boveda de la api",
    idioma: "es",
    topeDelCuerpo: 2 * 1024 * 1024,
    ahora: () => new Date("2026-11-07T12:00:00Z"),
  };
  ({ servidor, token } = crearApi(config));
  puerto = await escuchar(servidor, config, 0);
});

afterAll(async () => {
  await new Promise((r) => servidor.close(r));
});

interface Respuesta {
  estado: number;
  cabeceras: Record<string, unknown>;
  cuerpo: Record<string, unknown>;
}

function pedir(
  metodo: string,
  ruta: string,
  cabeceras: Record<string, string>,
  cuerpo?: string,
): Promise<Respuesta> {
  return new Promise((resolver, rechazar) => {
    const peticion = request(
      {
        host: "127.0.0.1",
        port: puerto,
        method: metodo,
        path: ruta,
        headers: cabeceras,
        // Una conexión por petición: un rechazo que corta la suya no se lleva la siguiente.
        agent: false,
      },
      (respuesta) => {
        let texto = "";
        respuesta.on("data", (d) => (texto += d));
        respuesta.on("end", () =>
          resolver({
            estado: respuesta.statusCode ?? 0,
            cabeceras: respuesta.headers,
            cuerpo: texto ? JSON.parse(texto) : {},
          }),
        );
      },
    );
    peticion.on("error", rechazar);
    if (cuerpo !== undefined) peticion.write(cuerpo);
    peticion.end();
  });
}

const bien = () => ({
  host: `127.0.0.1:${puerto}`,
  authorization: `Bearer ${token}`,
});

describe("la API: los cinco filtros", () => {
  it("escucha solo en 127.0.0.1", () => {
    const direccion = servidor.address();
    expect(typeof direccion === "object" && direccion?.address).toBe(
      "127.0.0.1",
    );
  });

  it("con token y Host de loopback, responde", async () => {
    const r = await pedir("GET", "/v1/salud", bien());
    expect(r.estado).toBe(200);
    expect(r.cuerpo.huellaDeLlave).toBe(config.llave.huella);
    // Sin CORS: ninguna cabecera Access-Control-*.
    expect(
      Object.keys(r.cabeceras).filter((c) => c.startsWith("access-control")),
    ).toEqual([]);
  });

  it("sin token: 401; con otro token: 401", async () => {
    expect(
      (await pedir("GET", "/v1/salud", { host: `127.0.0.1:${puerto}` })).estado,
    ).toBe(401);
    expect(
      (
        await pedir("GET", "/v1/salud", {
          host: `127.0.0.1:${puerto}`,
          authorization: `Bearer ${"0".repeat(64)}`,
        })
      ).estado,
    ).toBe(401);
  });

  it("con un Host ajeno (rebinding de DNS): 421", async () => {
    expect(
      (
        await pedir("GET", "/v1/salud", {
          ...bien(),
          host: `ataque.example:${puerto}`,
        })
      ).estado,
    ).toBe(421);
    expect(
      (await pedir("GET", "/v1/salud", { ...bien(), host: "127.0.0.1:80" }))
        .estado,
    ).toBe(421);
  });

  it("con Origin (un navegador): 403", async () => {
    expect(
      (
        await pedir("GET", "/v1/salud", {
          ...bien(),
          origin: "https://ataque.example",
        })
      ).estado,
    ).toBe(403);
  });

  it("desde fuera de loopback: 403", () => {
    const desde = (remoteAddress: string) => () =>
      filtrar(
        { headers: bien(), socket: { remoteAddress } as never },
        token,
        puerto,
      );
    expect(desde("192.168.1.20")).toThrow("fuera-de-loopback");
    expect(desde("10.0.0.5")).toThrow("fuera-de-loopback");
    expect(desde("127.0.0.1")).not.toThrow();
    expect(desde("::1")).not.toThrow();
  });

  it("un cuerpo sobre el tope: 413", async () => {
    const r = await pedir(
      "POST",
      "/v1/diagnosticar",
      bien(),
      "a,b\n".repeat(700_000),
    ).catch(() => ({ estado: 413 }) as Respuesta);
    expect(r.estado).toBe(413);
  });

  it("anonimizar: siempre con el riesgo medido y el certificado, sin modo rápido", async () => {
    for (const ruta of [
      "/v1/anonimizar",
      "/v1/anonimizar?rapido=1&sinRiesgo=1",
    ]) {
      const r = await pedir(
        "POST",
        ruta,
        { ...bien(), "x-velo-politica": "habeas-data" },
        KIT,
      );
      expect(r.estado).toBe(200);
      expect(
        typeof (r.cuerpo.riesgo as { unicosDespues: number }).unicosDespues,
      ).toBe("number");
      expect(r.cuerpo.certificado).toContain(r.cuerpo.sha256DeSalida as string);
    }
  });

  it("un error dice su clave, nunca el texto crudo de una excepción", async () => {
    const r = await pedir(
      "POST",
      "/v1/anonimizar",
      { ...bien(), "x-velo-politica": "/no/existe.json" },
      KIT,
    );
    expect(r.estado).toBe(422);
    expect(r.cuerpo.error).toBe("politicaInvalida");
    expect(JSON.stringify(r.cuerpo)).not.toContain("/no/existe.json");
  });

  it("el contrato OpenAPI y el servidor tienen las mismas rutas", () => {
    const yaml = readFileSync(
      join(RAIZ, "docs", "api", "velo-local.yaml"),
      "utf8",
    );
    const enElContrato: string[] = [];
    let ruta = "";
    for (const linea of yaml.split("\n")) {
      const deRuta = linea.match(/^ {2}(\/v1\/\w+):$/);
      if (deRuta) ruta = deRuta[1];
      const deMetodo = linea.match(/^ {4}(get|post):$/);
      if (deMetodo && ruta)
        enElContrato.push(`${deMetodo[1].toUpperCase()} ${ruta}`);
    }
    expect(enElContrato.sort()).toEqual([...RUTAS_DE_LA_API].sort());
  });
});

// ── Una corrida entera, sin una sola conexión ─────────────────────────────────────────────────

describe("pnpm velo anonimizar no abre ninguna conexión", () => {
  it("cero llamadas a net.Socket.connect", async () => {
    const carpeta = mkdtempSync(join(tmpdir(), "velo-red-"));
    writeFileSync(join(carpeta, "clinico.csv"), KIT);
    process.env.VELO_FRASE = "frase de la corrida sin red";
    process.env.VELO_FRASE_BOVEDA = "frase de la boveda sin red";
    const espia = vi.spyOn(net.Socket.prototype, "connect");
    try {
      const codigo = await principal(
        [
          "anonimizar",
          join(carpeta, "clinico.csv"),
          "--politica",
          "rgpd",
          "--salida",
          carpeta,
        ],
        { salida: () => {}, aviso: () => {} },
      );
      expect(codigo).toBe(0);
      expect(espia).not.toHaveBeenCalled();
    } finally {
      espia.mockRestore();
      delete process.env.VELO_FRASE;
      delete process.env.VELO_FRASE_BOVEDA;
      rmSync(carpeta, { recursive: true, force: true });
    }
  });
});
