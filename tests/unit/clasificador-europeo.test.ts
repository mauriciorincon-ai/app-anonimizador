// El clasificador frente a un archivo europeo (S8, ADR-016). El oráculo lo declara el kit de prueba
// (`COLUMNAS_EUROPEAS`), no este archivo: si el motor deja de coincidir con lo que el kit dice que
// debería detectar, falla. Todo sintético, con el control bien calculado y, en 8 % de los valores,
// mal calculado a propósito.

import { describe, expect, it } from "vitest";

import {
  esperadoPorColumna,
  generarFilas,
} from "../../docs/kit-de-prueba/generador.mjs";
import { ConstructorColumnar } from "../../src/engine/columnar";
import {
  clasificar,
  type HallazgoDeColumna,
} from "../../src/engine/clasificador";
import { decirMensaje } from "../../src/lib/idioma/mensajes";

const filas = [
  ...generarFilas({
    filas: 3_000,
    seed: 42,
    perfil: "europeo",
    tasaInvalida: 0.08,
    tasaVacia: 0.03,
  }),
];
const [encabezado, ...datos] = filas;
const constructor = new ConstructorColumnar(encabezado, datos.length);
for (const fila of datos) constructor.agregarFila(fila);
const diagnostico = clasificar(constructor.finalizar());
const porNombre = new Map(diagnostico.columnas.map((c) => [c.nombre, c]));

function columna(nombre: string): HallazgoDeColumna {
  const hallazgo = porNombre.get(nombre);
  if (!hallazgo) throw new Error(`el kit no generó la columna ${nombre}`);
  return hallazgo;
}

describe("clasificar — un archivo europeo contra el oráculo del kit", () => {
  for (const [nombre, esperado] of Object.entries(
    esperadoPorColumna("europeo"),
  )) {
    it(`${nombre} → ${esperado.tipo} · ${esperado.categoria}`, () => {
      const hallazgo = columna(nombre);
      expect(hallazgo.tipo).toBe(esperado.tipo);
      expect(hallazgo.categoria).toBe(esperado.categoria);
    });
  }
});

describe("lo que confirma el algoritmo y lo que sugiere el encabezado", () => {
  it.each([
    "iban_es",
    "dni_es",
    "nie_es",
    "nir_fr",
    "codice_fiscale_it",
    "steuer_id_de",
    "bsn_nl",
    "pesel_pl",
  ])("%s lo confirma el algoritmo oficial, con su fuente citada", (nombre) => {
    const hallazgo = columna(nombre);
    expect(hallazgo.certeza).toBe("algoritmo-oficial");
    const evidencia = hallazgo.evidencia[0];
    expect(evidencia.origen).toBe("validador");
    if (evidencia.origen !== "validador")
      throw new Error("evidencia inesperada");
    expect(decirMensaje(evidencia.fuente, "es").length).toBeGreaterThan(10);
    expect(decirMensaje(evidencia.fuente, "en").length).toBeGreaterThan(10);
  });

  it.each([
    ["geschlecht", "cuasi-identificador"],
    ["nationalite", "cuasi-identificador"],
    ["diagnose", "dato-sensible"],
    ["casier_judiciaire", "dato-sensible"],
  ])("%s sube a %s solo por el encabezado y lo dice «sin confirmar»", (nombre, categoria) => {
    const hallazgo = columna(nombre);
    expect(hallazgo.categoria).toBe(categoria);
    expect(hallazgo.certeza).toBe("sin-confirmar");
    expect(hallazgo.evidencia.some((e) => e.origen === "nombre-de-columna")).toBe(true);
  });

  it.each(["geburtsdatum", "code_postal"])(
    "%s: los valores solo dan la forma (fecha, número) y el encabezado la sube a cuasi-identificador",
    (nombre) => {
      const hallazgo = columna(nombre);
      expect(hallazgo.categoria).toBe("cuasi-identificador");
      // Como con `fecha_nacimiento`: un validador estructural gana la columna y la certeza sigue
      // siendo la de la forma; la evidencia del encabezado se suma, no la reemplaza.
      expect(hallazgo.certeza).toBe("estructural");
      expect(hallazgo.evidencia.map((e) => e.origen)).toEqual([
        "validador",
        "nombre-de-columna",
      ]);
    },
  );

  it("las columnas no personales siguen siéndolo", () => {
    expect(columna("monto").categoria).toBe("no-personal");
    expect(columna("fecha_atencion").categoria).toBe("no-personal");
  });
});
