// El eje reversible/irreversible — la costura que la Fase 2 abre entre la política, el pipeline y
// la bóveda.
//
// Lo que estos tests protegen, por orden de importancia:
//   1. Que hacer una columna reversible **no cambie su seudónimo**. Si lo cambiara, los cruces
//      entre el archivo de marzo y el de abril se romperían — que es la propiedad (C9) por la que
//      el S2 existe.
//   2. Que la identidad de las políticas escritas antes del S3 **no se mueva**.
//   3. Que la correspondencia que llega a la bóveda esté completa, colisiones incluidas.

import { describe, expect, it } from "vitest";

import { generarFilas } from "../../docs/kit-de-prueba/generador.mjs";
import {
  colisionesDeBoveda,
  construirBoveda,
  indiceDeColumna,
  paresDeBoveda,
} from "@/engine/boveda";
import { ConstructorColumnar, type TablaColumnar } from "@/engine/columnar";
import {
  esReversible,
  exportarPolitica,
  hashDePolitica,
  importarPolitica,
  requiereBoveda,
  requiereLlave,
  type Politica,
  type Tecnica,
} from "@/engine/politica";
import { aplicarPolitica } from "@/engine/tecnicas";

const IDENTIDAD = {
  huellaDeLlave: "a1b2c3d4e5f6",
  salDeLlave: "0".repeat(32),
  hashDePolitica: "0".repeat(64),
};

async function llaveDe(semilla: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(semilla.padEnd(32, ".")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function politicaDe(reglas: { columna: string; tecnica: Tecnica }[]): Politica {
  return { version: 1, origen: "manual", kObjetivo: null, reglas };
}

function tablaDe(encabezado: string[], filas: string[][]): TablaColumnar {
  const constructor = new ConstructorColumnar(encabezado, filas.length);
  for (const fila of filas) constructor.agregarFila(fila);
  return constructor.finalizar();
}

const TABLA = tablaDe(
  ["cedula", "nit", "ciudad"],
  [
    ["1032456789", "800123456-1", "BOGOTA"],
    ["1098765432", "811987654-3", "MEDELLIN"],
    ["1011223344", "830555111-9", "BOGOTA"],
    ["", "800123456-1", "CALI"],
  ],
);

describe("el eje reversible de la política", () => {
  it("solo el seudónimo admite vuelta: enmascarar y generalizar destruyen", () => {
    // No es una limitación de esta versión. `103***89` y `30-39` no vuelven ni con bóveda: los
    // dígitos que faltan no existen en ningún sitio. El seudónimo no destruye, sustituye.
    expect(esReversible({ tipo: "enmascarar" })).toBe(false);
    expect(esReversible({ tipo: "generalizar-rango", amplitud: 10 })).toBe(
      false,
    );
    expect(esReversible({ tipo: "seudonimizar", longitud: 16 })).toBe(false);
    expect(
      esReversible({ tipo: "seudonimizar", longitud: 16, reversible: true }),
    ).toBe(true);
    expect(
      esReversible({
        tipo: "seudonimizar-con-formato",
        formato: "nit",
        reversible: true,
      }),
    ).toBe(true);
  });

  it("`requiereBoveda` distingue de `requiereLlave`: reversible implica llave, no al revés", () => {
    const soloDisfraz = politicaDe([
      { columna: "cedula", tecnica: { tipo: "seudonimizar", longitud: 16 } },
    ]);
    expect(requiereLlave(soloDisfraz)).toBe(true);
    expect(requiereBoveda(soloDisfraz)).toBe(false);

    const conVuelta = politicaDe([
      {
        columna: "cedula",
        tecnica: { tipo: "seudonimizar", longitud: 16, reversible: true },
      },
    ]);
    expect(requiereLlave(conVuelta)).toBe(true);
    expect(requiereBoveda(conVuelta)).toBe(true);

    const sinNada = politicaDe([
      { columna: "cedula", tecnica: { tipo: "enmascarar" } },
    ]);
    expect(requiereBoveda(sinNada)).toBe(false);
  });
});

describe("la identidad de las políticas del S2 no se mueve", () => {
  const comoElS2 = politicaDe([
    { columna: "cedula", tecnica: { tipo: "seudonimizar", longitud: 16 } },
  ]);

  it("`reversible: false` y el campo ausente son la MISMA política", () => {
    // Si el campo entrara como `false` en toda política, cambiaría el hash de todas las escritas
    // antes del S3 — y los reportes ya emitidos dejarían de cuadrar con el mismo tratamiento
    // repetido hoy. `normalizarPolitica` convierte el `false` explícito en ausencia.
    const explicito = politicaDe([
      {
        columna: "cedula",
        tecnica: { tipo: "seudonimizar", longitud: 16, reversible: false },
      },
    ]);
    expect(hashDePolitica(explicito)).toBe(hashDePolitica(comoElS2));
  });

  it("`reversible: true` SÍ cambia el hash — guardar la correspondencia es otro tratamiento", () => {
    const conVuelta = politicaDe([
      {
        columna: "cedula",
        tecnica: { tipo: "seudonimizar", longitud: 16, reversible: true },
      },
    ]);
    expect(hashDePolitica(conVuelta)).not.toBe(hashDePolitica(comoElS2));
  });

  it("una política del S2 —sin el campo— se importa sin ruido", () => {
    const delS2 = JSON.stringify({
      version: 1,
      origen: "manual",
      kObjetivo: null,
      reglas: [
        { columna: "cedula", tecnica: { tipo: "seudonimizar", longitud: 16 } },
      ],
    });
    const leida = importarPolitica(delS2);
    expect(leida.ok).toBe(true);
    if (!leida.ok) return;
    expect(requiereBoveda(leida.politica)).toBe(false);
    expect(hashDePolitica(leida.politica)).toBe(hashDePolitica(comoElS2));
  });

  it("el eje sobrevive la ida y vuelta por archivo", () => {
    const conVuelta = politicaDe([
      {
        columna: "nit",
        tecnica: {
          tipo: "seudonimizar-con-formato",
          formato: "nit",
          reversible: true,
        },
      },
    ]);
    const leida = importarPolitica(exportarPolitica(conVuelta));
    expect(leida.ok).toBe(true);
    if (!leida.ok) return;
    expect(requiereBoveda(leida.politica)).toBe(true);
    expect(hashDePolitica(leida.politica)).toBe(hashDePolitica(conVuelta));
  });
});

describe("hacer reversible una columna no cambia su seudónimo (C9)", () => {
  it("los valores del archivo son IDÉNTICOS con y sin bóveda", async () => {
    // La propiedad central del S2: mismo valor + misma llave ⇒ mismo seudónimo, dentro del archivo
    // y entre archivos. Si guardar la correspondencia cambiara el seudónimo, los cruces del mes
    // pasado se romperían justo donde nadie los está mirando.
    const llave = await llaveDe("llave-del-proyecto");
    const reglas = (reversible: boolean) => [
      {
        columna: "cedula",
        tecnica: { tipo: "seudonimizar" as const, longitud: 16, reversible },
      },
      {
        columna: "nit",
        tecnica: {
          tipo: "seudonimizar-con-formato" as const,
          formato: "nit" as const,
          reversible,
        },
      },
    ];

    const sinVuelta = await aplicarPolitica(
      TABLA,
      politicaDe(reglas(false)),
      llave,
    );
    const conVuelta = await aplicarPolitica(
      TABLA,
      politicaDe(reglas(true)),
      llave,
    );

    for (const nombre of ["cedula", "nit"]) {
      const a = sinVuelta.tabla.columnas.find((c) => c.nombre === nombre)!;
      const b = conVuelta.tabla.columnas.find((c) => c.nombre === nombre)!;
      expect(b.valores).toEqual(a.valores);
      expect([...b.codigos]).toEqual([...a.codigos]);
    }
  });
});

describe("la correspondencia que llega a la bóveda", () => {
  it("solo la producen las columnas reversibles, y está completa", async () => {
    const llave = await llaveDe("llave-del-proyecto");
    const resultado = await aplicarPolitica(
      TABLA,
      politicaDe([
        {
          columna: "cedula",
          tecnica: { tipo: "seudonimizar", longitud: 16, reversible: true },
        },
        // Reversible NO: su correspondencia no debe aparecer.
        {
          columna: "nit",
          tecnica: { tipo: "seudonimizar-con-formato", formato: "nit" },
        },
        { columna: "ciudad", tecnica: { tipo: "enmascarar" } },
      ]),
      llave,
    );

    expect(resultado.correspondencias.map((c) => c.columna)).toEqual([
      "cedula",
    ]);

    const boveda = construirBoveda(IDENTIDAD, resultado.correspondencias);
    // Tres cédulas distintas y una vacía: la vacía no entra, porque no se seudonimizó.
    expect(paresDeBoveda(boveda)).toBe(3);

    // Cada original del archivo se puede recuperar desde su seudónimo.
    const indice = indiceDeColumna(boveda.columnas[0]);
    const cedulaSalida = resultado.tabla.columnas.find(
      (c) => c.nombre === "cedula",
    )!;
    for (const original of ["1032456789", "1098765432", "1011223344"]) {
      const fila = [...TABLA.columnas[0].codigos].findIndex(
        (codigo) => TABLA.columnas[0].valores[codigo] === original,
      );
      const seudonimo = cedulaSalida.valores[cedulaSalida.codigos[fila]];
      expect(indice.get(seudonimo)).toEqual([original]);
    }
  });

  it("sin columnas reversibles la lista viene vacía, no ausente", async () => {
    const resultado = await aplicarPolitica(
      TABLA,
      politicaDe([{ columna: "ciudad", tecnica: { tipo: "enmascarar" } }]),
      null,
    );
    expect(resultado.correspondencias).toEqual([]);
  });
});

describe("la colisión de formato, provocada por el fixture", () => {
  it("el perfil `colisiones-de-formato` produce seudónimos con DOS originales", async () => {
    // No se espera a que aparezca: con 60.000 NITs distintos sobre un rango de 2×10⁸, la
    // aritmética del cumpleaños predice ~9 pares y la probabilidad de no ver ninguno es de una
    // entre ocho mil.
    //
    // Con esta semilla y esta llave salen **5 sobre 59.988 seudónimos**. Cinco contra nueve no es
    // un defecto: con λ=9, un proceso de Poisson deja P(X≤5) ≈ 12 %. Se afirma `> 0` y no `= 5` a
    // propósito — el fixture garantiza que la ambigüedad ocurre, no cuántas veces, y clavar el
    // número volvería rojo este test ante cualquier retoque legítimo del generador.
    const filas = [
      ...generarFilas({
        filas: 60_000,
        seed: 42,
        perfil: "colisiones-de-formato",
        tasaInvalida: 0,
        tasaVacia: 0,
      }),
    ];
    const [encabezado, ...datos] = filas;
    const tabla = tablaDe(encabezado, datos);

    const resultado = await aplicarPolitica(
      tabla,
      politicaDe([
        {
          columna: "nit_empresa",
          tecnica: {
            tipo: "seudonimizar-con-formato",
            formato: "nit",
            reversible: true,
          },
        },
      ]),
      await llaveDe("llave-del-proyecto"),
    );

    expect(resultado.colisiones[0]?.columna).toBe("nit_empresa");
    expect(resultado.colisiones[0]!.cuantas).toBeGreaterThan(0);

    const boveda = construirBoveda(IDENTIDAD, resultado.correspondencias);
    const ambiguos = colisionesDeBoveda(boveda);
    expect(ambiguos).toBe(resultado.colisiones[0]!.cuantas);

    // Lo que de verdad importa: el seudónimo colisionado guarda SUS DOS originales. Elegir uno y
    // callarse sería devolverle a alguien el dato de otra empresa.
    const conDos = boveda.columnas[0].originales.filter(
      (lista) => lista.length > 1,
    );
    expect(conDos.length).toBe(ambiguos);
    expect(conDos[0].length).toBeGreaterThanOrEqual(2);
    expect(new Set(conDos[0]).size).toBe(conDos[0].length);
  }, 120_000);
});
