// JSON en alto volumen (S9): el gate «por trozos = en memoria» del S8, ahora con JSON de punta a
// punta y por las funciones REALES del alto volumen —no por una copia—: lectura por pasadas →
// diagnóstico → plan → medida → escritura con el formato JSON → regreso.
//
// Lo que se compara: los bytes del anonimizado (arreglo y JSON Lines), las columnas que la bóveda
// marca como numéricas, y el restaurado, que además vuelve a ser —byte a byte— el original compacto.

import { beforeAll, describe, expect, it } from "vitest";

import { aplicarPolitica } from "@/engine/tecnicas";
import { construirBoveda } from "@/engine/boveda";
import { escribirJson } from "@/engine/json/escritor";
import { columnasNumericas, leerJson } from "@/engine/json/lector";
import { columnasNumericasDeJson } from "@/engine/json/trozos";
import type { Politica } from "@/engine/politica";
import { restaurar } from "@/engine/restaurar";
import { sha256 } from "@/lib/sha256";
import {
  escribirCsv,
  pasadaDeDiagnostico,
  pasadaDelDevuelto,
  pasadaDeMedida,
  prepararTransformacion,
  restaurarPorTrozos,
  type Destino,
} from "@/workers/alto-volumen";
import { abrirJsonPorTrozos } from "@/workers/json-por-trozos";

import { fuenteDe, recoger } from "./json-ayuda";

const codificar = (texto: string) => new TextEncoder().encode(texto);

const IDENTIDAD = {
  huellaDeLlave: "0123456789ab",
  salDeLlave: "c2FsLWRlLXBydWViYQ==",
  hashDePolitica: "f".repeat(64),
};

let llave: CryptoKey;
beforeAll(async () => {
  llave = await crypto.subtle.importKey(
    "raw",
    codificar("llave-del-json-en-alto-volumen".padEnd(32, ".")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
});

/** Registros sintéticos con lo que importa: anidado, un número, un nulo, una clave ausente y una lista. */
const REGISTROS = Array.from({ length: 400 }, (_, i) => {
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
const ARREGLO = `[\n${REGISTROS.join(",\n")}\n]\n`;
const LINEAS = `${REGISTROS.join("\n")}\n`;

/** Todo lo que se transforma es reversible o no cambia: lo que vuelve tiene que ser el original. */
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

function recolector(): Destino & { texto(): string } {
  const partes: string[] = [];
  return {
    escribir: async (t) => void partes.push(t),
    texto: () => partes.join(""),
  };
}

async function ida(texto: string) {
  const huella = sha256(codificar(texto));
  const fuente = fuenteDe(texto, 4096);

  const lectura = await leerJson(fuente);
  const enMemoria = await aplicarPolitica(
    lectura.tabla,
    POLITICA,
    llave,
    "es",
    huella,
  );
  const textoEnMemoria = await recoger(
    escribirJson(fuente, lectura, enMemoria.tabla),
  );

  const abierto = await abrirJsonPorTrozos(fuente, codificar(texto).length);
  const pasada = await pasadaDeDiagnostico(abierto.fuente);
  const plan = await prepararTransformacion(
    abierto.fuente,
    pasada,
    POLITICA,
    llave,
    "es",
    huella,
  );
  const destino = recolector();
  await escribirCsv(abierto.fuente, plan, destino, {
    formato: abierto.formato(),
  });
  const medida = await pasadaDeMedida(abierto.fuente, pasada, plan);
  return {
    lectura,
    enMemoria,
    textoEnMemoria,
    abierto,
    plan,
    medida,
    textoPorTrozos: destino.texto(),
  };
}

describe.each([
  ["arreglo", ARREGLO],
  ["JSON Lines", LINEAS],
])("JSON %s: por trozos = en memoria", (_forma, texto) => {
  it("el anonimizado, byte a byte", async () => {
    const r = await ida(texto);
    expect(sha256(codificar(r.textoPorTrozos))).toBe(
      sha256(codificar(r.textoEnMemoria)),
    );
    expect(r.textoPorTrozos).toBe(r.textoEnMemoria);
    // Y de verdad cambió algo, y la lista y el resto pasaron sin tocar.
    expect(r.textoPorTrozos).not.toBe(texto);
    expect(r.textoPorTrozos).toContain('"etiquetas":["a","b"]');
    expect(r.plan.suprimidas).toEqual(r.enMemoria.suprimidas);
  });

  it("las columnas que la bóveda marca como numéricas son las mismas", async () => {
    const r = await ida(texto);
    expect(columnasNumericasDeJson(r.abierto.descripcion)).toEqual(
      columnasNumericas(r.lectura),
    );
    expect([...r.abierto.numericas].sort()).toEqual(["edad", "id"]);
  });

  it("el regreso: lo restaurado es lo mismo por los dos caminos, y es el original", async () => {
    const r = await ida(texto);
    const entradas = r.plan.correspondencias.map((e) =>
      r.abierto.numericas.has(e.columna)
        ? { ...e, numerica: true as const }
        : e,
    );
    const boveda = construirBoveda(IDENTIDAD, entradas);
    // Lo que vuelve del tercero: el anonimizado, tal cual.
    const devuelto = r.textoPorTrozos;
    const huella = sha256(codificar(devuelto));

    // En memoria: la lectura del devuelto, la restauración y el escritor con las numéricas.
    const lecturaDevuelta = await leerJson(fuenteDe(devuelto, 4096));
    const restauracion = restaurar(lecturaDevuelta.tabla, boveda);
    const numericas = new Set<string>();
    const deLaBoveda = new Map(boveda.columnas.map((c) => [c.columna, c]));
    for (const columna of restauracion.columnas)
      if (
        columna.deLaBoveda !== null &&
        deLaBoveda.get(columna.deLaBoveda)?.numerica === true
      )
        numericas.add(columna.columna);
    const enMemoria = await recoger(
      escribirJson(
        fuenteDe(devuelto, 4096),
        lecturaDevuelta,
        restauracion.tabla,
        numericas,
      ),
    );

    // Por trozos.
    const abierto = await abrirJsonPorTrozos(
      fuenteDe(devuelto, 4096),
      codificar(devuelto).length,
    );
    const pasada = await pasadaDelDevuelto(abierto.fuente);
    const destino = recolector();
    const informe = await restaurarPorTrozos(
      abierto.fuente,
      pasada,
      boveda,
      huella,
      destino,
      { formato: abierto.formato() },
    );

    expect(destino.texto()).toBe(enMemoria);
    expect(informe.totales).toEqual(restauracion.totales);
    expect(informe.totales.restauradas).toBeGreaterThan(0);
    // Ida y vuelta: el original, compacto y con sus números sin comillas.
    expect(destino.texto()).toBe(texto);
  });
});

describe("lo que no cabe en memoria", () => {
  it("un JSON con más celdas que el tope en memoria se trata por pasadas y da el mismo resultado", async () => {
    const lectura = await leerJson(fuenteDe(LINEAS), {
      rutas: 256,
      celdas: 1_000,
      profundidad: 32,
      largoDeClave: 256,
      largoDeTexto: 1_048_576,
    }).catch((e: unknown) => e);
    // 400 registros × 6 rutas = 2 400 celdas > 1 000: en memoria se corta con la clase propia.
    expect(lectura).toMatchObject({
      motivo: "json-excede-tope",
      name: "JsonExcedeCeldas",
    });
    const r = await ida(LINEAS);
    expect(r.textoPorTrozos).toBe(r.textoEnMemoria);
  });
});
