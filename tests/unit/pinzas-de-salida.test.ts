// PINZAS DE SALIDA (S8): el SHA-256 de cada archivo que Velo escribe, fijado.
//
// Las pruebas de determinismo comparan dos corridas entre sí: atrapan el azar, no un cambio. Un
// refactor que moviera un byte de TODAS las salidas por igual —una comilla de más, el orden de una
// clave, un redondeo distinto del ruido— pasaría las dos corridas idénticas y cambiaría en silencio lo
// que el certificado afirma. Hasta el S7 ninguna prueba fijaba el hash de una SALIDA (solo los de
// entrada del kit y los de política). El S8 reescribe la lectura, la escritura y el ruido para el
// alto volumen; estas pinzas son lo que garantiza que el camino de siempre no se movió.
//
// Si una cifra de aquí cambia, el archivo que Velo entrega cambió. Eso puede ser correcto —una
// decisión nueva, con su ADR—, pero nunca un efecto lateral: se cambia a mano y se dice por qué.

import { beforeAll, describe, expect, it } from "vitest";

import {
  generarFilas,
  generarRegistros,
  serializarRegistro,
} from "../../docs/kit-de-prueba/generador.mjs";
import { construirBoveda, type EntradaDeBoveda } from "@/engine/boveda";
import { ConstructorColumnar, type TablaColumnar } from "@/engine/columnar";
import { serializarCsv } from "@/engine/csv";
import { escribirJson } from "@/engine/json/escritor";
import { leerJson } from "@/engine/json/lector";
import type { Politica } from "@/engine/politica";
import { restaurar } from "@/engine/restaurar";
import { serializarCanonico } from "@/engine/serializacion";
import { aplicarPolitica } from "@/engine/tecnicas";
import { sha256 } from "@/lib/sha256";

import { fuenteDe, recoger } from "./json-ayuda";

const OPCIONES = {
  filas: 1_200,
  seed: 42,
  perfil: "clinico",
  tasaInvalida: 0.08,
  tasaVacia: 0.03,
} as const;

function tabla(): TablaColumnar {
  const [encabezado, ...datos] = [...generarFilas(OPCIONES)];
  const constructor = new ConstructorColumnar(encabezado, 1 << 10);
  for (const fila of datos) constructor.agregarFila(fila);
  return constructor.finalizar();
}

const huella = (texto: string) => sha256(new TextEncoder().encode(texto));

const BASE: Politica = {
  version: 1,
  origen: "manual",
  kObjetivo: null,
  reglas: [
    {
      columna: "cedula_titular",
      tecnica: {
        tipo: "seudonimizar-con-formato",
        formato: "cedula",
        reversible: true,
      },
    },
    {
      columna: "nit_empresa",
      tecnica: { tipo: "seudonimizar-con-formato", formato: "nit" },
    },
    {
      columna: "correo",
      tecnica: { tipo: "seudonimizar", longitud: 16, reversible: true },
    },
    { columna: "celular", tecnica: { tipo: "enmascarar" } },
    {
      columna: "fecha_nacimiento",
      tecnica: { tipo: "generalizar-fecha", precision: "anio" },
    },
    { columna: "nombre_completo", tecnica: { tipo: "suprimir" } },
  ],
};

const RUIDO: Politica = {
  ...BASE,
  reglas: [
    ...BASE.reglas,
    {
      columna: "monto",
      tecnica: {
        tipo: "laplace",
        epsilon: 1,
        minimo: 0,
        maximo: 10_000_000,
        decimales: 0,
      },
    },
    {
      columna: "estrato",
      tecnica: { tipo: "respuesta-aleatorizada", epsilon: 2 },
    },
    { columna: "latitud", tecnica: { tipo: "perturbar", porcentaje: 10 } },
  ],
};

const REPARTO = ["sexo", "municipio", "estrato", "grupo_etnico"].map(
  (columna) => ({
    columna,
    tecnica: { tipo: "generalizar-automatico" as const },
  }),
);

const MONDRIAN: Politica = {
  ...BASE,
  kObjetivo: 5,
  reglas: [...BASE.reglas, ...REPARTO],
};

const OPTIMA: Politica = {
  ...MONDRIAN,
  generalizacion: {
    algoritmo: "optima",
    jerarquias: { estrato: { tipo: "rango", amplitudes: [2, 4, 8] } },
    diversidad: { l: 2, columnas: ["diagnostico"] },
  },
};

const IDENTIDAD = {
  huellaDeLlave: "0123456789ab",
  salDeLlave: "c2FsLWRlLXBydWViYQ==",
  hashDePolitica: "f".repeat(64),
};

let llave: CryptoKey;
beforeAll(async () => {
  llave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("llave-de-las-pinzas".padEnd(32, ".")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
});

const HUELLA_DE_ENTRADA = "a".repeat(64);

async function csvDe(politica: Politica) {
  const original = tabla();
  const r = await aplicarPolitica(
    original,
    politica,
    llave,
    "es",
    HUELLA_DE_ENTRADA,
  );
  return { original, r, csv: serializarCsv(r.tabla) };
}

/** Lo que Velo escribe hoy. Ver el encabezado: cambiar una cifra es una decisión, no un arreglo. */
const ESPERADO = {
  "csv-base":
    "90deba22aaae082f32ffa60ab7db17863bb87c043214c798ab0f2ad7b7500432",
  "csv-ruido":
    "e24892783a3aa13ca280021063004dbf465d1449dac179444d889d531dad12bc",
  "csv-mondrian-es":
    "f72a30300456f9156386aa13480494d4501559825df642e286f7488565bcd07b",
  "csv-mondrian-en":
    "9aeba6f95f77e98ddd3cd48d57f165df41a473269aae687c06b2a849ad0dd763",
  "csv-optima-l":
    "81f2868a0af81ae3359393ee147e5eb71a50644fc9a7b0f86dbb09803c4fcee8",
  boveda: "60f5d28d01ce87360ae718a713b7798c81309d000cc4bed1817dc3450cb35ad5",
  "csv-restaurado":
    "0b58b979d74d2940edd6b25f3de3cecb5761ccf8d1e174ffbdebd228b3be2ef4",
  "json-arreglo":
    "9bd572d833d68e19fd576b0ce303578fe88d004effe3938102518ee56151cf6c",
  jsonl: "57a5ac814abe61c46cc6b8e58c9cd3a26d36bc6fcd34d5b1f310bbca53f57608",
  "json-restaurado":
    "fa3a520e843771e749d7a227eec197a237944d1e521b112991c4fdb3f9ff925f",
} as const;

type Pinza = keyof typeof ESPERADO;

describe("las pinzas de salida: lo que Velo escribe no se mueve sin decirlo", () => {
  const obtenidas: Partial<Record<Pinza, string>> = {};

  it("CSV: base, ruido, Mondrian en los dos idiomas y la óptima con ℓ", async () => {
    obtenidas["csv-base"] = huella((await csvDe(BASE)).csv);
    obtenidas["csv-ruido"] = huella((await csvDe(RUIDO)).csv);
    obtenidas["csv-mondrian-es"] = huella((await csvDe(MONDRIAN)).csv);
    const en = await aplicarPolitica(
      tabla(),
      MONDRIAN,
      llave,
      "en",
      HUELLA_DE_ENTRADA,
    );
    obtenidas["csv-mondrian-en"] = huella(serializarCsv(en.tabla));
    obtenidas["csv-optima-l"] = huella((await csvDe(OPTIMA)).csv);
    for (const clave of [
      "csv-base",
      "csv-ruido",
      "csv-mondrian-es",
      "csv-mondrian-en",
      "csv-optima-l",
    ] as const)
      expect(obtenidas[clave], clave).toBe(ESPERADO[clave]);
  });

  it("la bóveda (en claro, forma canónica) y el CSV restaurado con ella", async () => {
    const { r, csv } = await csvDe(BASE);
    const boveda = construirBoveda(IDENTIDAD, r.correspondencias);
    obtenidas.boveda = huella(serializarCanonico(boveda));
    // El devuelto es el anonimizado tal cual; el restaurado es lo que Velo escribe al volver.
    const devuelta = r.tabla;
    const restaurada = restaurar(devuelta, boveda);
    obtenidas["csv-restaurado"] = huella(serializarCsv(restaurada.tabla));
    expect(csv.length).toBeGreaterThan(0);
    expect(obtenidas.boveda, "boveda").toBe(ESPERADO.boveda);
    expect(obtenidas["csv-restaurado"], "csv-restaurado").toBe(
      ESPERADO["csv-restaurado"],
    );
  });

  it("JSON: el arreglo, JSON Lines y el restaurado", async () => {
    const registros = [...generarRegistros(OPCIONES)].map(serializarRegistro);
    const arreglo = `[\n${registros.join(",\n")}\n]\n`;
    const lineas = `${registros.join("\n")}\n`;
    const correspondencias: EntradaDeBoveda[] = [];

    for (const [clave, texto] of [
      ["json-arreglo", arreglo],
      ["jsonl", lineas],
    ] as const) {
      const lectura = await leerJson(fuenteDe(texto, 4_093));
      const r = await aplicarPolitica(
        lectura.tabla,
        MONDRIAN,
        llave,
        "es",
        HUELLA_DE_ENTRADA,
      );
      const salida = await recoger(
        escribirJson(fuenteDe(texto, 4_093), lectura, r.tabla),
      );
      obtenidas[clave] = huella(salida);
      if (clave === "jsonl") {
        correspondencias.push(...r.correspondencias);
        const devuelta = await leerJson(fuenteDe(salida, 4_093));
        const restaurada = restaurar(
          devuelta.tabla,
          construirBoveda(IDENTIDAD, correspondencias),
        );
        obtenidas["json-restaurado"] = huella(
          await recoger(
            escribirJson(fuenteDe(salida, 4_093), devuelta, restaurada.tabla),
          ),
        );
      }
    }
    for (const clave of ["json-arreglo", "jsonl", "json-restaurado"] as const)
      expect(obtenidas[clave], clave).toBe(ESPERADO[clave]);
  });
});
