// El clasificador con columnas de JSON: mira la ÚLTIMA clave de la ruta, no el camino entero.
// Las columnas de CSV no traen `ruta` y se clasifican exactamente como siempre.

import { describe, expect, it } from "vitest";

import {
  ConstructorColumnar,
  ConstructorColumnarDisperso,
  type TablaColumnar,
} from "../../src/engine/columnar";
import { clasificar } from "../../src/engine/clasificador";
import { partirRuta } from "../../src/engine/json/ruta";

const CIUDADES = ["Bogotá", "Cali", "Medellín", "Barranquilla"];
const CEDULAS = ["1234567", "7654321", "2345678", "8765432", "3456789"];

/** Una tabla como la deja el lector JSON: nombre = ruta con escapes, `ruta` = los segmentos. */
function tablaJson(columnas: Record<string, string[]>): TablaColumnar {
  const c = new ConstructorColumnarDisperso();
  const indices = Object.keys(columnas).map((nombre) =>
    c.agregarColumna(nombre, partirRuta(nombre)),
  );
  const filas = Math.max(...Object.values(columnas).map((v) => v.length));
  for (let f = 0; f < filas; f++) {
    Object.values(columnas).forEach((valores, i) => {
      if (valores[f] !== undefined) c.poner(indices[i], valores[f], 1);
    });
    c.cerrarFila();
  }
  return c.finalizar().tabla;
}

/** La misma tabla como CSV: el nombre es la cabecera tal cual y no hay `ruta`. */
function tablaCsv(columnas: Record<string, string[]>): TablaColumnar {
  const nombres = Object.keys(columnas);
  const c = new ConstructorColumnar(nombres);
  const filas = Math.max(...Object.values(columnas).map((v) => v.length));
  for (let f = 0; f < filas; f++) {
    c.agregarFila(nombres.map((n) => columnas[n][f] ?? ""));
  }
  return c.finalizar();
}

function categoriaDe(tabla: TablaColumnar, nombre: string): string {
  const hallazgo = clasificar(tabla).columnas.find((h) => h.nombre === nombre);
  if (!hallazgo) throw new Error(`no hay ${nombre}`);
  return hallazgo.categoria;
}

function tipoDe(tabla: TablaColumnar, nombre: string): string {
  const hallazgo = clasificar(tabla).columnas.find((h) => h.nombre === nombre);
  if (!hallazgo) throw new Error(`no hay ${nombre}`);
  return hallazgo.tipo;
}

describe("clasificar columnas con ruta (JSON)", () => {
  it("`direccion.ciudad` se clasifica como `ciudad`: cuasi-identificador, no identificador directo", () => {
    const datos = { "direccion.ciudad": CIUDADES, ciudad: CIUDADES };
    const json = tablaJson(datos);
    expect(categoriaDe(json, "ciudad")).toBe("cuasi-identificador");
    expect(categoriaDe(json, "direccion.ciudad")).toBe("cuasi-identificador");
  });

  it("el nombre de un PADRE no sube de categoría a sus hijos", () => {
    const datos = {
      "salud.ciudad": CIUDADES,
      "paciente.ciudad": CIUDADES,
      "cliente.contacto.ciudad": CIUDADES,
    };
    const json = tablaJson(datos);
    for (const nombre of Object.keys(datos)) {
      expect(categoriaDe(json, nombre)).toBe("cuasi-identificador");
    }
  });

  it("el último segmento SÍ cuenta: lo sensible, lo directo y lo demográfico siguen detectándose", () => {
    const json = tablaJson({
      "x.diagnostico": ["J45.9", "E11", "I10"],
      "x.apellido": ["Pérez", "Gómez", "Rojas"],
      "x.direccion": ["Calle 1", "Cra 2", "Av 3"],
      "x.edad": ["31", "42", "27"],
      "x.sexo": ["F", "M", "F"],
      "x.codigo": ["a1", "b2", "c3"],
    });
    expect(categoriaDe(json, "x.diagnostico")).toBe("dato-sensible");
    expect(categoriaDe(json, "x.apellido")).toBe("identificador-directo");
    expect(categoriaDe(json, "x.direccion")).toBe("identificador-directo");
    expect(categoriaDe(json, "x.edad")).toBe("cuasi-identificador");
    expect(categoriaDe(json, "x.sexo")).toBe("cuasi-identificador");
    expect(categoriaDe(json, "x.codigo")).toBe("no-personal");
  });

  it("`paciente.cedula` sigue siendo una cédula; el encabezado de la cédula mira las dos últimas claves", () => {
    const json = tablaJson({
      "paciente.cedula": CEDULAS,
      "titular.documento.numero": CEDULAS,
      "paciente.valor": CEDULAS,
      "documento.paciente.valor": CEDULAS,
      "a.b.c.monto": CEDULAS,
    });
    expect(tipoDe(json, "paciente.cedula")).toBe("cedula");
    expect(tipoDe(json, "titular.documento.numero")).toBe("cedula");
    // Un monto o un valor cualquiera con 6–8 dígitos NO es una cédula, por mucho que cuelgue de `paciente`.
    expect(tipoDe(json, "paciente.valor")).not.toBe("cedula");
    expect(tipoDe(json, "documento.paciente.valor")).not.toBe("cedula");
    expect(tipoDe(json, "a.b.c.monto")).not.toBe("cedula");
  });

  it("la clave vacía y las claves con punto no rompen nada", () => {
    const json = tablaJson({
      "\\_": ["a", "b"],
      "x.\\_": ["c", "d"],
      "a\\.b": ["e", "f"],
    });
    const diagnostico = clasificar(json);
    expect(diagnostico.columnas).toHaveLength(3);
    expect(
      diagnostico.columnas.every((h) => h.categoria === "no-personal"),
    ).toBe(true);
  });

  it("una `ruta` vacía (tabla armada a mano) cae al nombre de la columna", () => {
    const c = new ConstructorColumnarDisperso();
    const i = c.agregarColumna("ciudad", []);
    for (const v of CIUDADES) {
      c.poner(i, v, 1);
      c.cerrarFila();
    }
    expect(categoriaDe(c.finalizar().tabla, "ciudad")).toBe(
      "cuasi-identificador",
    );
  });
});

describe("clasificar columnas SIN ruta (CSV): nada cambia", () => {
  it("el nombre entero sigue mandando: `direccion.ciudad` es una dirección, `salud.x` es sensible", () => {
    const csv = tablaCsv({
      "direccion.ciudad": CIUDADES,
      "salud.ciudad": CIUDADES,
      "paciente.ciudad": CIUDADES,
      "paciente.cedula": CEDULAS,
      "paciente.valor": CEDULAS,
    });
    expect(categoriaDe(csv, "direccion.ciudad")).toBe("identificador-directo");
    expect(categoriaDe(csv, "salud.ciudad")).toBe("dato-sensible");
    expect(categoriaDe(csv, "paciente.ciudad")).toBe("identificador-directo");
    expect(tipoDe(csv, "paciente.cedula")).toBe("cedula");
    // Con el encabezado entero, `paciente.valor` no trae ninguna palabra de cédula.
    expect(tipoDe(csv, "paciente.valor")).not.toBe("cedula");
  });

  it("la misma tabla leída como JSON y como CSV se clasifica distinto SOLO por la ruta", () => {
    const datos = { "salud.ciudad": CIUDADES };
    expect(categoriaDe(tablaCsv(datos), "salud.ciudad")).toBe("dato-sensible");
    expect(categoriaDe(tablaJson(datos), "salud.ciudad")).toBe(
      "cuasi-identificador",
    );
  });
});
