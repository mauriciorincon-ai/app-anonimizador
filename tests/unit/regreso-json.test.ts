// @vitest-environment node
//
// El regreso de un JSON (S7), de punta a punta y con las piezas de verdad: leer el original, aplicar
// la política con seudónimos reversibles, escribir lo anonimizado, sellar la bóveda (en claro, que es
// donde se mide), leer lo que «devolvió el tercero», restaurar POR VALOR y escribir lo restaurado con
// la estructura y el orden de claves del archivo devuelto. La promesa: lo que vuelve es el original,
// byte por byte —los números sin comillas incluidos—, y lo que la bóveda no conoce se queda y se dice.

import { beforeAll, describe, expect, it } from "vitest";

import {
  construirBoveda,
  deserializarBoveda,
  serializarBoveda,
  type Boveda,
} from "../../src/engine/boveda";
import { escribirJson } from "../../src/engine/json/escritor";
import { columnasNumericas, leerJson } from "../../src/engine/json/lector";
import type { Politica } from "../../src/engine/politica";
import { restaurar } from "../../src/engine/restaurar";
import { aplicarPolitica } from "../../src/engine/tecnicas";
import { fuenteDe, recoger } from "./json-ayuda";

let llave: CryptoKey;

beforeAll(async () => {
  llave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("llave-del-regreso-json".padEnd(32, ".")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
});

/** Registros sintéticos con lo que importa: anidado, números grandes, una lista, una clave rara. */
const REGISTROS = [
  `{"id":1,"paciente":{"documento":1032456789,"contacto":{"correo":"ana@ejemplo.test","telefono":"3001234567"}},"notas":["a",1],"ok":true}`,
  `{"id":2,"paciente":{"documento":79123456,"contacto":{"correo":"luis@ejemplo.test"}},"notas":[],"ok":false}`,
  `{"id":3,"paciente":{"documento":null,"contacto":{"correo":"ana@ejemplo.test","telefono":null}},"ok":true}`,
  `{"id":4,"paciente":{"documento":12345678901234567890,"contacto":{}},"notas":[{"x":"y"}],"ok":true}`,
];
const ARREGLO = `[\n${REGISTROS.join(",\n")}\n]\n`;
const LINEAS = `${REGISTROS.join("\n")}\n`;

const POLITICA: Politica = {
  version: 1,
  origen: "manual",
  kObjetivo: null,
  reglas: [
    {
      columna: "paciente.documento",
      tecnica: { tipo: "seudonimizar", longitud: 16, reversible: true },
    },
    {
      columna: "paciente.contacto.correo",
      tecnica: { tipo: "seudonimizar", longitud: 16, reversible: true },
    },
    // Irreversible: sale seudonimizado y NO vuelve (la bóveda no lo conoce).
    {
      columna: "paciente.contacto.telefono",
      tecnica: { tipo: "seudonimizar", longitud: 12 },
    },
  ],
};

/** La ida: lo anonimizado y la bóveda en claro, por el mismo camino que el worker. */
async function ida(
  original: string,
): Promise<{ anonimo: string; boveda: Boveda }> {
  const lectura = await leerJson(fuenteDe(original));
  const r = await aplicarPolitica(lectura.tabla, POLITICA, llave, "es");
  const anonimo = await recoger(
    escribirJson(fuenteDe(original), lectura, r.tabla),
  );
  const numericas = columnasNumericas(lectura);
  const boveda = construirBoveda(
    { huellaDeLlave: "abc123abc123", salDeLlave: "sal", hashDePolitica: "h" },
    r.correspondencias.map((e) =>
      numericas.has(e.columna) ? { ...e, numerica: true as const } : e,
    ),
  );
  // Por el texto en claro, como la abre el regreso: lo que no sobrevive a serializar no existe.
  const abierta = deserializarBoveda(serializarBoveda(boveda));
  if (!abierta.ok) throw new Error("la bóveda no se pudo releer");
  return { anonimo, boveda: abierta.boveda };
}

/** La vuelta: el archivo devuelto, restaurado con la bóveda. */
async function vuelta(devuelto: string, boveda: Boveda) {
  const lectura = await leerJson(fuenteDe(devuelto));
  const restauracion = restaurar(lectura.tabla, boveda);
  const deLaBoveda = new Map(boveda.columnas.map((c) => [c.columna, c]));
  const numericas = new Set(
    restauracion.columnas
      .filter(
        (c) => c.deLaBoveda !== null && deLaBoveda.get(c.deLaBoveda)?.numerica,
      )
      .map((c) => c.columna),
  );
  const texto = await recoger(
    escribirJson(fuenteDe(devuelto), lectura, restauracion.tabla, numericas),
  );
  return { texto, restauracion };
}

describe("el regreso de un JSON", () => {
  it("lo anonimizado no trae ni un original de las columnas tratadas", async () => {
    const { anonimo } = await ida(ARREGLO);
    for (const original of [
      "1032456789",
      "79123456",
      "ana@ejemplo.test",
      "3001234567",
    ])
      expect(anonimo).not.toContain(original);
    // Lo que no se trató sale igual: la lista, el booleano, el número de 20 dígitos no.
    expect(anonimo).toContain(`"notas":["a",1]`);
    expect(anonimo).not.toContain("12345678901234567890");
  });

  it("la bóveda anota que el documento era un número y el correo no", async () => {
    const { boveda } = await ida(ARREGLO);
    const porNombre = new Map(boveda.columnas.map((c) => [c.columna, c]));
    expect(porNombre.get("paciente.documento")?.numerica).toBe(true);
    expect(porNombre.get("paciente.contacto.correo")?.numerica).toBeUndefined();
    // La irreversible no está.
    expect(porNombre.has("paciente.contacto.telefono")).toBe(false);
  });

  it.each([
    ["un arreglo", ARREGLO],
    ["JSON Lines", LINEAS],
  ])(
    "%s vuelve a su original byte por byte, salvo lo que nunca tuvo vuelta",
    async (_, original) => {
      const { anonimo, boveda } = await ida(original);
      const { texto, restauracion } = await vuelta(anonimo, boveda);
      // El teléfono salió con seudónimo irreversible: ese, y solo ese, no vuelve.
      const esperado = original.replace(
        '"telefono":"3001234567"',
        `"telefono":${JSON.stringify(seudonimoDelTelefono(anonimo))}`,
      );
      expect(texto).toBe(esperado);
      expect(restauracion.totales.ambiguas).toBe(0);
    },
  );

  it("si el tercero devuelve los registros en otro orden, vuelven en ESE orden y restaurados", async () => {
    const { anonimo, boveda } = await ida(ARREGLO);
    const lineas = anonimo.split("\n").filter((l) => l.startsWith("{"));
    const al_reves = `${lineas
      .reverse()
      .map((l) => l.replace(/,$/, ""))
      .join("\n")}\n`;
    const { texto } = await vuelta(al_reves, boveda);
    const registros = texto.trimEnd().split("\n");
    expect(registros[0]).toContain(`"documento":12345678901234567890`);
    expect(registros[3]).toContain(`"documento":1032456789,`);
    expect(registros[3]).toContain(`"correo":"ana@ejemplo.test"`);
  });

  it("una celda que el tercero cambió por algo que la bóveda no conoce se queda como está", async () => {
    const { anonimo, boveda } = await ida(LINEAS);
    const cambiado = anonimo.replace(
      /"correo":"[0-9a-f]{16}"/,
      '"correo":"corregido@tercero.test"',
    );
    const { texto, restauracion } = await vuelta(cambiado, boveda);
    expect(texto).toContain('"correo":"corregido@tercero.test"');
    expect(restauracion.totales.desconocidas).toBeGreaterThan(0);
  });
});

/** El seudónimo irreversible del teléfono, leído de lo anonimizado (12 hex). */
function seudonimoDelTelefono(anonimo: string): string {
  const m = /"telefono":"([0-9a-f]{12})"/.exec(anonimo);
  if (!m) throw new Error("sin teléfono en lo anonimizado");
  return m[1];
}
