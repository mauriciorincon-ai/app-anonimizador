// La política es un ARCHIVO con identidad. Estos tests protegen esa identidad: que el hash
// signifique «el mismo tratamiento» y nada más, y que un archivo que el usuario eligió a mano
// falle con un motivo que se pueda leer en pantalla.

import { describe, expect, it } from "vitest";

import { decirMensaje } from "@/lib/idioma/mensajes";
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

  it("el archivo exportado NO depende del idioma de la pantalla", async () => {
    // La nota va en los dos idiomas, siempre en el mismo orden; el resto del archivo no tiene
    // prosa. Dos personas que exportan la misma política con la interfaz en idiomas distintos
    // tienen que obtener el mismo archivo, byte por byte (y el mismo hash).
    const { fijarIdioma } = await import("@/lib/idioma/estado");
    fijarIdioma("es");
    const enEspanol = exportarPolitica(BASE);
    fijarIdioma("en");
    const enIngles = exportarPolitica(BASE);
    expect(enIngles).toBe(enEspanol);
    expect(JSON.parse(enEspanol)._nota).toBe(
      "El hash se recalcula al importar; el de aquí es informativo. / " +
        "The hash is recomputed on import; the one here is informational.",
    );
    expect(JSON.parse(enIngles)._hash).toBe(hashDePolitica(BASE));
  });

  it("un JSON roto falla diciendo que es un JSON roto", () => {
    const r = importarPolitica("{ esto no es json");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("json-invalido");
    // El motor no escribe la frase: devuelve su clave, y la pantalla la dice en su idioma.
    expect(r.detalle).toEqual({ clave: "politica.importar.jsonInvalido" });
  });

  it("una política de otra versión lo dice, en vez de listar campos que no cuadran", () => {
    const r = importarPolitica(JSON.stringify({ ...BASE, version: 99 }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("version-distinta");
    // Los números viajan crudos en `datos`: formatearlos es cosa de quien los dice.
    expect(r.detalle).toEqual({
      clave: "politica.importar.versionDistinta",
      datos: { version: 99, esperada: VERSION_DE_POLITICA },
    });
    expect(decirMensaje(r.detalle, "es")).toBe(
      `La política es de la versión 99 y esta Velo entiende la ${VERSION_DE_POLITICA}.`,
    );
    expect(decirMensaje(r.detalle, "en")).toBe(
      `The policy is version 99 and this Velo understands version ${VERSION_DE_POLITICA}.`,
    );
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
    expect(r.detalle.clave).toBe("politica.importar.formaInvalida");
    expect(String(r.detalle.datos?.ruta)).toContain("reglas");
    expect(decirMensaje(r.detalle, "es")).toContain("reglas");
    expect(decirMensaje(r.detalle, "en")).toContain("reglas");
  });

  it("un JSON que no es ni un objeto dice «la política», no una ruta vacía", () => {
    const r = importarPolitica("42");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.detalle.clave).toBe("politica.importar.formaInvalidaRaiz");
    expect(decirMensaje(r.detalle, "es")).toMatch(/^la política: /);
    expect(decirMensaje(r.detalle, "en")).toMatch(/^the policy: /);
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

describe("la generalización óptima en la política (S7)", () => {
  // Vectores dorados: el hash de dos políticas del S6, calculado con el código de `main` antes del
  // S7 (25f638d). El campo nuevo es opcional y ausente no se serializa: ninguna política vieja
  // cambia de identidad, y una bitácora o un certificado del S6 sigue apuntando a la misma.
  const DEL_S6: readonly [Politica, string][] = [
    [
      {
        version: 1,
        origen: "manual",
        kObjetivo: 5,
        reglas: [
          {
            columna: "cedula_titular",
            tecnica: { tipo: "seudonimizar-con-formato", formato: "cedula" },
          },
          { columna: "edad", tecnica: { tipo: "generalizar-automatico" } },
          { columna: "municipio", tecnica: { tipo: "generalizar-automatico" } },
          { columna: "monto", tecnica: { tipo: "conservar" } },
        ],
      },
      "a665000331f846700f6cd054612eb870f02d618851d6073c0151f9da5927fd48",
    ],
    [
      {
        version: 1,
        origen: "habeas-data-editada",
        kObjetivo: 3,
        reglas: [
          {
            columna: "correo",
            tecnica: { tipo: "seudonimizar", longitud: 16, reversible: true },
          },
          {
            columna: "fecha_nacimiento",
            tecnica: { tipo: "generalizar-automatico" },
          },
          { columna: "diagnostico", tecnica: { tipo: "conservar" } },
          { columna: "telefono", tecnica: { tipo: "suprimir" } },
        ],
      },
      "57ceb316d18afea2dd3d6720203a1433151934644ccb8697489119ea75eda79f",
    ],
  ];

  it("el hash de una política del S6 no se movió", () => {
    for (const [politica, hash] of DEL_S6)
      expect(hashDePolitica(politica)).toBe(hash);
  });

  const CON_OPTIMA: Politica = {
    ...DEL_S6[0][0],
    generalizacion: {
      algoritmo: "optima",
      jerarquias: {
        edad: { tipo: "edad-dane" },
        municipio: { tipo: "divipola" },
        monto: { tipo: "rango", amplitudes: [10, 100] },
      },
      diversidad: { l: 2, columnas: ["diagnostico", "edad", "diagnostico"] },
    },
  };

  it("pedir la óptima SÍ cambia el hash: es otro tratamiento", () => {
    expect(hashDePolitica(CON_OPTIMA)).not.toBe(DEL_S6[0][1]);
  });

  it("normalizar descarta las escaleras fuera del reparto y ordena la ℓ sin repetir", () => {
    const normal = normalizarPolitica(CON_OPTIMA);
    expect(normal.generalizacion).toEqual({
      algoritmo: "optima",
      jerarquias: {
        edad: { tipo: "edad-dane" },
        municipio: { tipo: "divipola" },
      },
      // `edad` está en el reparto: no puede ser a la vez la columna sensible.
      diversidad: { l: 2, columnas: ["diagnostico"] },
    });
    // Por eso la escalera de `monto` (que se conserva) no mueve el hash.
    const sinMonto: Politica = {
      ...CON_OPTIMA,
      generalizacion: {
        ...CON_OPTIMA.generalizacion!,
        jerarquias: {
          edad: { tipo: "edad-dane" },
          municipio: { tipo: "divipola" },
        },
      },
    };
    expect(hashDePolitica(sinMonto)).toBe(hashDePolitica(CON_OPTIMA));
  });

  it("exportar → importar conserva la óptima y su hash", () => {
    const vuelta = importarPolitica(exportarPolitica(CON_OPTIMA));
    expect(vuelta.ok).toBe(true);
    if (!vuelta.ok) return;
    expect(vuelta.politica.generalizacion?.algoritmo).toBe("optima");
    expect(hashDePolitica(vuelta.politica)).toBe(hashDePolitica(CON_OPTIMA));
  });

  it("una escalera mal formada no entra: rangos que no se dividen, largos que no bajan", () => {
    for (const jerarquia of [
      { tipo: "rango", amplitudes: [5, 7] },
      { tipo: "prefijo", largos: [2, 3] },
      { tipo: "inventada" },
    ]) {
      const archivo = JSON.parse(exportarPolitica(CON_OPTIMA));
      // El control: sin tocar la escalera, el mismo camino importa bien.
      expect(importarPolitica(JSON.stringify(archivo)).ok).toBe(true);
      archivo.generalizacion.jerarquias.edad = jerarquia;
      expect(
        importarPolitica(JSON.stringify(archivo)).ok,
        JSON.stringify(jerarquia),
      ).toBe(false);
    }
  });
});
