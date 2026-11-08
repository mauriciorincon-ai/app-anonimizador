// @vitest-environment node
//
// JSON en Velo local (S9): la consola y la API, de punta a punta, con JSON y JSON Lines.
//
// El oráculo es el camino en memoria del worker (`leerJson` + `aplicarPolitica` + `escribirJson`):
// lo que sale de `pnpm velo` tiene que ser lo mismo, byte a byte, por el camino en memoria y por el
// de pasadas (se fuerza con un tope de celdas diminuto), y la ida y vuelta tiene que devolver el
// archivo original. Un JSON roto se rechaza con su clave y sin citar el archivo.

import { request } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { escribirJson } from "@/engine/json/escritor";
import { columnasNumericas, leerJson } from "@/engine/json/lector";
import {
  exportarPolitica,
  hashDePolitica,
  numericasConRuido,
  type Politica,
} from "@/engine/politica";
import { nombreDelArchivoAnonimizado } from "@/engine/csv";
import { aplicarPolitica } from "@/engine/tecnicas";
import { derivarLlave, type LlaveDeProyecto } from "@/lib/llave";
import { sha256 } from "@/lib/sha256";

import {
  crearApi,
  escuchar,
  type ConfiguracionDeLaApi,
} from "../../velo-local/api";
import { principal, type Consola } from "../../velo-local/cli";
import {
  anonimizar,
  DestinoConHuella,
  leer,
  type Sumidero,
} from "../../velo-local/nucleo";
import { fuenteDe, recoger } from "./json-ayuda";

const FRASE = "una frase larga de prueba del S9";
const FRASE_DE_BOVEDA = "otra frase para la boveda del S9";
const SAL = "00112233445566778899aabbccddeeff";
const AHORA = () => new Date("2026-11-07T12:00:00Z");

const REGISTROS = Array.from({ length: 300 }, (_, i) => {
  const contacto: Record<string, string> = {
    correo: `persona${i}@ejemplo.test`,
  };
  if (i % 7 !== 0) contacto.celular = `30012${String(i).padStart(5, "0")}`;
  return JSON.stringify({
    id: 1000 + i,
    nombre: `Persona ${i}`,
    contacto,
    edad: 20 + (i % 50),
    ciudad: i % 11 === 0 ? null : `Ciudad ${i % 9}`,
    etiquetas: ["a", "b"],
  });
});
const FORMAS = [
  ["json", `[\n${REGISTROS.join(",\n")}\n]\n`, "datos.json"],
  ["jsonl", `${REGISTROS.join("\n")}\n`, "datos.jsonl"],
] as const;

/** Todo lo reversible o intacto: lo restaurado tiene que ser el original. */
const POLITICA: Politica = {
  version: 1,
  origen: "manual",
  kObjetivo: null,
  reglas: [
    {
      columna: "id",
      tecnica: { tipo: "seudonimizar", longitud: 12, reversible: true },
    },
    {
      columna: "contacto.correo",
      tecnica: { tipo: "seudonimizar", longitud: 16, reversible: true },
    },
    {
      columna: "ciudad",
      tecnica: { tipo: "seudonimizar", longitud: 10, reversible: true },
    },
  ],
};

let llave: LlaveDeProyecto;
let carpeta: string;
let rutaDePolitica: string;
const registro: string[] = [];
const consola: Consola = {
  salida: (l) => void registro.push(l),
  aviso: (l) => void registro.push(l),
};

beforeAll(async () => {
  llave = await derivarLlave(FRASE, SAL);
  carpeta = mkdtempSync(join(tmpdir(), "velo-json-s9-"));
  rutaDePolitica = join(carpeta, "politica.json");
  writeFileSync(rutaDePolitica, exportarPolitica(POLITICA));
  for (const [, texto, nombre] of FORMAS)
    writeFileSync(join(carpeta, nombre), texto);
  process.env.VELO_FRASE = FRASE;
  process.env.VELO_FRASE_BOVEDA = FRASE_DE_BOVEDA;
});

afterAll(() => {
  rmSync(carpeta, { recursive: true, force: true });
  delete process.env.VELO_FRASE;
  delete process.env.VELO_FRASE_BOVEDA;
});

/** Lo que hace el worker en memoria con este JSON, esta política y esta llave. */
async function enMemoria(texto: string): Promise<string> {
  const fuente = fuenteDe(texto, 4096);
  const lectura = await leerJson(fuente);
  const hecho = await aplicarPolitica(
    lectura.tabla,
    POLITICA,
    llave.clave,
    "es",
    sha256(new TextEncoder().encode(texto)),
  );
  return recoger(escribirJson(fuente, lectura, hecho.tabla));
}

describe.each(FORMAS)("%s por la consola", (extension, texto, nombre) => {
  const hash = hashDePolitica(POLITICA);
  const salidaDe = (carpetaDeSalida: string) =>
    join(carpetaDeSalida, nombreDelArchivoAnonimizado(hash, extension));

  it("el anonimizado es el del camino en memoria, y la bóveda y el certificado salen", async () => {
    const salida = mkdtempSync(join(carpeta, `${extension}-`));
    const codigo = await principal(
      [
        "anonimizar",
        join(carpeta, nombre),
        "--politica",
        rutaDePolitica,
        "--sal",
        SAL,
        "--salida",
        salida,
      ],
      consola,
      AHORA,
    );
    expect(codigo, registro.join("\n")).toBe(0);
    const anonimizado = readFileSync(salidaDe(salida), "utf8");
    expect(anonimizado).toBe(await enMemoria(texto));
    expect(anonimizado).not.toBe(texto);
    expect(
      readFileSync(join(salida, `velo-boveda-${hash.slice(0, 8)}.velo`)),
    ).toBeTruthy();
    // El certificado ata las dos huellas: la del JSON que entró y la del que salió.
    const certificado = readFileSync(
      join(salida, `velo-certificado-${nombre.replace(/\.\w+$/, "")}.html`),
      "utf8",
    );
    expect(certificado).toContain(sha256(new TextEncoder().encode(texto)));
    expect(certificado).toContain(
      sha256(new TextEncoder().encode(anonimizado)),
    );
  });

  it("ida y vuelta por la consola: lo restaurado es el JSON original", async () => {
    const ida = mkdtempSync(join(carpeta, `${extension}-ida-`));
    await principal(
      [
        "anonimizar",
        join(carpeta, nombre),
        "--politica",
        rutaDePolitica,
        "--sal",
        SAL,
        "--salida",
        ida,
      ],
      consola,
      AHORA,
    );
    const vuelta = mkdtempSync(join(carpeta, `${extension}-vuelta-`));
    const codigo = await principal(
      [
        "restaurar",
        salidaDe(ida),
        "--boveda",
        join(ida, `velo-boveda-${hash.slice(0, 8)}.velo`),
        "--salida",
        vuelta,
      ],
      consola,
      AHORA,
    );
    expect(codigo, registro.join("\n")).toBe(0);
    const devuelto = readFileSync(salidaDe(ida));
    const restaurado = readFileSync(
      join(
        vuelta,
        `velo-restaurado-${sha256(new Uint8Array(devuelto)).slice(0, 8)}.${extension}`,
      ),
      "utf8",
    );
    expect(restaurado).toBe(texto);
  });

  it("por pasadas (un tope de celdas diminuto) da los mismos bytes que en memoria", async () => {
    const origen = {
      nombre,
      bytes: texto.length,
      sha256: sha256(new TextEncoder().encode(texto)),
    };
    const fuente = new Blob([texto]);
    const lectura = await leer(fuente, origen, { topeDeCeldas: 10 });
    expect(lectura.modo).toBe("alto-volumen");
    const partes: Uint8Array[] = [];
    const sumidero: Sumidero = { escribir: async (b) => void partes.push(b) };
    const resultado = await anonimizar({
      fuente,
      origen,
      lectura,
      politica: POLITICA,
      llave,
      idioma: "es",
      destino: new DestinoConHuella(sumidero),
      fecha: "7 de noviembre de 2026",
    });
    expect(resultado.extension).toBe(extension);
    expect(resultado.boveda).not.toBeNull();
    expect(Buffer.concat(partes).toString("utf8")).toBe(await enMemoria(texto));
  });
});

describe.each(FORMAS)(
  "%s con ruido: el número sigue siendo número, igual que en la web (S10)",
  (extension, texto, nombre) => {
    const RUIDO: Politica = {
      ...POLITICA,
      reglas: [
        ...POLITICA.reglas,
        {
          columna: "edad",
          tecnica: {
            tipo: "laplace",
            epsilon: 1,
            minimo: 0,
            maximo: 120,
            decimales: 0,
          },
        },
      ],
    };

    /** Lo que hace el worker en memoria: las numéricas del original con ruido, sin comillas. */
    async function enLaWeb(): Promise<string> {
      const fuente = fuenteDe(texto, 4096);
      const lectura = await leerJson(fuente);
      const hecho = await aplicarPolitica(
        lectura.tabla,
        RUIDO,
        llave.clave,
        "es",
        sha256(new TextEncoder().encode(texto)),
      );
      return recoger(
        escribirJson(
          fuente,
          lectura,
          hecho.tabla,
          numericasConRuido(columnasNumericas(lectura), RUIDO),
        ),
      );
    }

    it.each([
      ["en memoria", undefined],
      ["por pasadas", 10],
    ] as const)("%s", async (_camino, topeDeCeldas) => {
      const origen = {
        nombre,
        bytes: texto.length,
        sha256: sha256(new TextEncoder().encode(texto)),
      };
      const fuente = new Blob([texto]);
      const lectura = await leer(
        fuente,
        origen,
        topeDeCeldas === undefined ? {} : { topeDeCeldas },
      );
      expect(lectura.modo).toBe(
        topeDeCeldas === undefined ? "memoria" : "alto-volumen",
      );
      const partes: Uint8Array[] = [];
      const sumidero: Sumidero = {
        escribir: async (b) => void partes.push(b),
      };
      const resultado = await anonimizar({
        fuente,
        origen,
        lectura,
        politica: RUIDO,
        llave,
        idioma: "es",
        destino: new DestinoConHuella(sumidero),
        fecha: "8 de noviembre de 2026",
      });
      expect(resultado.extension).toBe(extension);
      const local = Buffer.concat(partes).toString("utf8");
      expect(local).toBe(await enLaWeb());
      expect(local).toMatch(/"edad":-?\d+[,}]/);
      expect(local).not.toMatch(/"edad":"/);
    });
  },
);

describe("un JSON roto", () => {
  it("se rechaza con su clave y sin citar lo que hay dentro del archivo", async () => {
    const ruta = join(carpeta, "roto.json");
    writeFileSync(ruta, '[{"secreto": "VALOR-REAL-QUE-NO-DEBE-SALIR",');
    registro.length = 0;
    const codigo = await principal(["diagnosticar", ruta], consola, AHORA);
    expect(codigo).toBe(1);
    const texto = registro.join("\n");
    expect(texto).toContain("json-invalido");
    expect(texto).not.toContain("VALOR-REAL");
    expect(texto).not.toContain("secreto");
  });
});

describe("la API REST con JSON", () => {
  let config: ConfiguracionDeLaApi;
  let servidor: ReturnType<typeof crearApi>["servidor"];
  let token: string;
  let puerto: number;

  beforeAll(async () => {
    config = {
      llave,
      fraseDeBoveda: FRASE_DE_BOVEDA,
      idioma: "es",
      topeDelCuerpo: 2 * 1024 * 1024,
      ahora: AHORA,
    };
    ({ servidor, token } = crearApi(config));
    puerto = await escuchar(servidor, config, 0);
  });
  afterAll(async () => {
    await new Promise((r) => servidor.close(r));
  });

  function pedir(
    ruta: string,
    cabeceras: Record<string, string>,
    cuerpo: string,
  ): Promise<{ estado: number; cuerpo: Record<string, unknown> }> {
    return new Promise((resolver, rechazar) => {
      const peticion = request(
        {
          host: "127.0.0.1",
          port: puerto,
          method: "POST",
          path: ruta,
          agent: false,
          headers: { Authorization: `Bearer ${token}`, ...cabeceras },
        },
        (respuesta) => {
          let datos = "";
          respuesta.setEncoding("utf8");
          respuesta.on("data", (d) => (datos += d));
          respuesta.on("end", () =>
            resolver({
              estado: respuesta.statusCode ?? 0,
              cuerpo: JSON.parse(datos) as Record<string, unknown>,
            }),
          );
        },
      );
      peticion.on("error", rechazar);
      peticion.end(cuerpo);
    });
  }

  it.each(FORMAS)(
    "anonimiza y restaura un %s: ida y vuelta al original",
    async (extension, texto, nombre) => {
      const ida = await pedir(
        "/v1/anonimizar",
        { "X-Velo-Nombre": nombre, "X-Velo-Politica": rutaDePolitica },
        texto,
      );
      expect(ida.estado).toBe(200);
      expect(ida.cuerpo.nombre).toBe(
        nombreDelArchivoAnonimizado(hashDePolitica(POLITICA), extension),
      );
      const anonimizado = Buffer.from(
        ida.cuerpo.anonimizado as string,
        "base64",
      ).toString("utf8");
      expect(anonimizado).toBe(await enMemoria(texto));

      // La bóveda llega sellada: se guarda en el equipo y se le da su ruta al restaurar.
      const rutaDeBoveda = join(carpeta, `api-${extension}.velo`);
      writeFileSync(
        rutaDeBoveda,
        Buffer.from(ida.cuerpo.boveda as string, "base64"),
      );
      const vuelta = await pedir(
        "/v1/restaurar",
        { "X-Velo-Nombre": nombre, "X-Velo-Boveda": rutaDeBoveda },
        anonimizado,
      );
      expect(vuelta.estado).toBe(200);
      expect(String(vuelta.cuerpo.nombre)).toMatch(
        new RegExp(`^velo-restaurado-[0-9a-f]{8}\\.${extension}$`),
      );
      expect(
        Buffer.from(vuelta.cuerpo.restaurado as string, "base64").toString(
          "utf8",
        ),
      ).toBe(texto);
    },
  );

  it("un JSON roto responde con la clave del motivo, sin citar el cuerpo", async () => {
    const r = await pedir(
      "/v1/diagnosticar",
      { "X-Velo-Nombre": "roto.json" },
      '[{"secreto": "VALOR-REAL-QUE-NO-DEBE-SALIR",',
    );
    expect(r.estado).toBe(422);
    expect(r.cuerpo.error).toBe("json-invalido");
    expect(JSON.stringify(r.cuerpo)).not.toContain("VALOR-REAL");
  });
});
