// La política es un ARCHIVO con identidad. Estos tests protegen esa identidad: que el hash
// signifique «el mismo tratamiento» y nada más, y que un archivo que el usuario eligió a mano
// falle con un motivo que se pueda leer en pantalla.

import { describe, expect, it } from "vitest";

import {
  VERSION_DE_POLITICA,
  columnasDeMondrian,
  exportarPolitica,
  hashDePolitica,
  identificadoresSinTratar,
  importarPolitica,
  mismaPolitica,
  normalizarPolitica,
  tecnicaDe,
  type Politica,
} from "@/engine/politica";

function politicaDe(
  reglas: Politica["reglas"],
  extra: Partial<Politica> = {},
): Politica {
  return { version: 1, origen: "manual", kObjetivo: null, reglas, ...extra };
}

const BASE = politicaDe([
  {
    columna: "cedula_titular",
    tecnica: { tipo: "seudonimizar-con-formato", formato: "cedula" },
  },
  { columna: "sexo", tecnica: { tipo: "generalizar-automatico" } },
  { columna: "monto", tecnica: { tipo: "conservar" } },
]);

describe("identidad de la política", () => {
  it("el hash no depende del orden en que se editaron las reglas", () => {
    // El usuario no tiene por qué saber en qué orden tocó las filas: dos políticas que tratan el
    // archivo igual son la misma política, y el hash es lo que lo afirma.
    const alReves = politicaDe([...BASE.reglas].reverse());
    expect(hashDePolitica(alReves)).toBe(hashDePolitica(BASE));
    expect(mismaPolitica(alReves, BASE)).toBe(true);
  });

  it("es un SHA-256 de verdad, no una huella corta", () => {
    expect(hashDePolitica(BASE)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("cambiar una técnica cambia el hash", () => {
    const otra = politicaDe([
      ...BASE.reglas.slice(1),
      { columna: "cedula_titular", tecnica: { tipo: "suprimir" } },
    ]);
    expect(hashDePolitica(otra)).not.toBe(hashDePolitica(BASE));
  });

  it("el ORIGEN entra al hash: una de fábrica editada no es una manual idéntica", () => {
    // La procedencia es parte de lo que el reporte declara. Dos documentos que dicen cosas
    // distintas no pueden compartir identidad, aunque traten el archivo igual.
    const comoFabricaEditada = politicaDe(BASE.reglas, {
      origen: "habeas-data-editada",
    });
    expect(hashDePolitica(comoFabricaEditada)).not.toBe(hashDePolitica(BASE));
  });

  it("una regla repetida se resuelve por la última, sin duplicar la columna", () => {
    const conDuplicado = politicaDe([
      { columna: "sexo", tecnica: { tipo: "conservar" } },
      { columna: "sexo", tecnica: { tipo: "suprimir" } },
    ]);
    const normalizada = normalizarPolitica(conDuplicado);
    expect(normalizada.reglas).toHaveLength(1);
    expect(normalizada.reglas[0].tecnica.tipo).toBe("suprimir");
  });

  it("ordena por punto de código, no por locale", () => {
    // `localeCompare` daría otro orden según el idioma del sistema, y con él otro hash para la
    // misma política en dos computadores. El gate de determinismo lo prohíbe en el motor.
    const nombres = ["Ñandu", "Zulia", "apellido", "Ábaco"];
    const normalizada = normalizarPolitica(
      politicaDe(
        nombres.map((columna) => ({
          columna,
          tecnica: { tipo: "conservar" as const },
        })),
      ),
    );
    expect(normalizada.reglas.map((r) => r.columna)).toEqual(
      [...nombres].sort(),
    );
  });
});

describe("ida y vuelta como archivo", () => {
  it("exportar → importar conserva el hash", () => {
    const texto = exportarPolitica(BASE);
    const vuelta = importarPolitica(texto);
    expect(vuelta.ok).toBe(true);
    if (!vuelta.ok) return;
    expect(hashDePolitica(vuelta.politica)).toBe(hashDePolitica(BASE));
  });

  it("el archivo exportado lo puede leer una persona", () => {
    const texto = exportarPolitica(BASE);
    expect(texto).toContain('"_velo": "politica de anonimizacion"');
    expect(texto).toContain('"cedula_titular"');
    expect(texto.endsWith("\n")).toBe(true);
    // El hash informativo del archivo coincide con el que se recalcula al importarlo.
    expect(JSON.parse(texto)._hash).toBe(hashDePolitica(BASE));
  });

  it("un JSON roto falla diciendo que es un JSON roto", () => {
    const r = importarPolitica("{ esto no es json");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("json-invalido");
  });

  it("una política de otra versión lo dice, en vez de listar campos que no cuadran", () => {
    const r = importarPolitica(JSON.stringify({ ...BASE, version: 99 }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("version-distinta");
    expect(r.detalle).toContain("99");
    expect(r.detalle).toContain(String(VERSION_DE_POLITICA));
  });

  it("una técnica inventada no pasa, y el error dice dónde", () => {
    const r = importarPolitica(
      JSON.stringify(
        politicaDe([
          { columna: "x", tecnica: { tipo: "borrar-todo" } } as never,
        ]),
      ),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("forma-invalida");
    expect(r.detalle).toContain("reglas");
  });

  it("un parámetro fuera de rango no pasa", () => {
    // Un seudónimo de 2 caracteres colisionaría con todo; el schema es el que lo impide.
    const r = importarPolitica(
      JSON.stringify(
        politicaDe([
          { columna: "x", tecnica: { tipo: "seudonimizar", longitud: 2 } },
        ]),
      ),
    );
    expect(r.ok).toBe(false);
  });
});

describe("consultas del pipeline", () => {
  it("una columna sin regla se conserva: no hacer nada es dejar el dato como está", () => {
    expect(tecnicaDe(BASE, "columna_que_no_existe")).toEqual({
      tipo: "conservar",
    });
  });

  it("sabe qué columnas entran a Mondrian", () => {
    expect(columnasDeMondrian(BASE)).toEqual(["sexo"]);
  });

  it("delata los identificadores directos que quedaron sin tratar", () => {
    // Es la pregunta que encabeza el panel de riesgo: una reducción del 92 % con una cédula
    // intacta al lado es la composición que este sprint tiene prohibida.
    const columnas = [
      { nombre: "cedula_titular", categoria: "identificador-directo" },
      { nombre: "nombre_paciente", categoria: "identificador-directo" },
      { nombre: "sexo", categoria: "cuasi-identificador" },
    ];
    // `nombre_paciente` no tiene regla ⇒ se conserva ⇒ queda sin tratar.
    expect(identificadoresSinTratar(BASE, columnas)).toEqual([
      "nombre_paciente",
    ]);
  });

  it("no reporta nada cuando todos los identificadores tienen tratamiento", () => {
    const completa = politicaDe([
      { columna: "cedula_titular", tecnica: { tipo: "suprimir" } },
      {
        columna: "nombre_paciente",
        tecnica: { tipo: "seudonimizar", longitud: 16 },
      },
    ]);
    const columnas = [
      { nombre: "cedula_titular", categoria: "identificador-directo" },
      { nombre: "nombre_paciente", categoria: "identificador-directo" },
    ];
    expect(identificadoresSinTratar(completa, columnas)).toEqual([]);
  });
});
