// La regla dura nº2 de Velo dice que los datos del usuario jamás salen del navegador. La DoD del
// S1 la extiende explícitamente a la telemetría: ningún evento puede llevar valores de celda NI
// nombres de columna. Este test es el gate de esa frase.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DESCARTADO,
  reportError,
  sanitizarKind,
  sanitizarMeta,
} from "../../src/lib/observability";
import { exportarPolitica } from "../../src/engine/politica";

const capturarMensaje = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureMessage: (...args: unknown[]) => capturarMensaje(...args),
}));

// Encabezados y valores como los que trae un archivo real del usuario. Ni uno solo puede viajar.
const ENCABEZADOS_REALES = [
  "Cédula del titular",
  "DIAGNOSTICO_CIE10",
  "nombre completo",
  "NIT",
  "Fecha de nacimiento",
];
const VALORES_DE_CELDA = [
  "1032456789",
  "María Fernanda Gómez",
  "J45.9",
  "ABC123",
  "900123456-7",
];

describe("sanitizarMeta", () => {
  it("descarta cualquier string con forma de nombre de columna", () => {
    for (const encabezado of ENCABEZADOS_REALES) {
      expect(sanitizarMeta({ columna: encabezado })).toEqual({
        columna: DESCARTADO,
      });
    }
  });

  it("descarta cualquier string con forma de valor de celda", () => {
    for (const celda of VALORES_DE_CELDA) {
      expect(sanitizarMeta({ muestra: celda })).toEqual({
        muestra: DESCARTADO,
      });
    }
  });

  it("descarta el par entero cuando la CLAVE es la que revela", () => {
    // Un encabezado usado como clave filtraría igual que usado como valor.
    expect(
      sanitizarMeta({ "Cédula del titular": 3, "DIAGNOSTICO CIE10": true }),
    ).toEqual({});
  });

  it("deja pasar las etiquetas del propio código (kebab-case corto)", () => {
    expect(
      sanitizarMeta({
        validador: "nit-dian",
        formato: "csv",
        etapa: "clasificacion",
      }),
    ).toEqual({
      validador: "nit-dian",
      formato: "csv",
      etapa: "clasificacion",
    });
  });

  it("deja pasar conteos pequeños exactos y booleanos", () => {
    expect(
      sanitizarMeta({ columnas: 42, codigo: 0, trunco: true, vacio: false }),
    ).toEqual({
      columnas: 42,
      codigo: 0,
      trunco: true,
      vacio: false,
    });
  });

  it("convierte los números grandes en orden de magnitud — ahí se esconde un identificador", () => {
    // Una cédula, un NIT o un celular son `number` igual que un conteo de filas: la magnitud es
    // lo único que los separa, y es lo que el sanitizador usa.
    expect(sanitizarMeta({ valor: 1032456789 })).toEqual({ valor: "1e9–1e10" });
    expect(sanitizarMeta({ valor: 3001234567 })).toEqual({ valor: "1e9–1e10" });
    expect(sanitizarMeta({ filas: 500000 })).toEqual({ filas: "1e5–1e6" });
    expect(sanitizarMeta({ saldo: -25000 })).toEqual({ saldo: "-1e4–1e5" });
  });

  it("conserva proporciones útiles y descarta números no finitos", () => {
    expect(sanitizarMeta({ confianza: 0.876543 })).toEqual({
      confianza: 0.877,
    });
    expect(
      sanitizarMeta({ ratio: Number.NaN, otro: Number.POSITIVE_INFINITY }),
    ).toEqual({
      ratio: DESCARTADO,
      otro: DESCARTADO,
    });
    expect(sanitizarMeta({ latitud: 4.710989 })).toEqual({
      latitud: "1e0–1e1",
    });
  });

  it("emite las claves en orden estable (determinismo también en la telemetría)", () => {
    expect(Object.keys(sanitizarMeta({ zeta: 1, alfa: 2, media: 3 }))).toEqual([
      "alfa",
      "media",
      "zeta",
    ]);
  });
});

describe("sanitizarKind", () => {
  it("acepta la forma dominio/motivo", () => {
    expect(sanitizarKind("parser/worker-crash")).toBe("parser/worker-crash");
    expect(sanitizarKind("riesgo/clases-vacias")).toBe("riesgo/clases-vacias");
  });

  it("reemplaza el texto libre, que es el vector clásico de fuga", () => {
    expect(
      sanitizarKind("Error al procesar la columna Cédula del titular"),
    ).toBe("evento/no-conforme");
    expect(sanitizarKind("parser")).toBe("evento/no-conforme");
  });
});

describe("reportError", () => {
  beforeEach(() => {
    capturarMensaje.mockClear();
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  });

  it("es inerte sin DSN — en CI y en local no se reporta nada", () => {
    reportError("parser/worker-crash", { columnas: 3 });
    expect(capturarMensaje).not.toHaveBeenCalled();
  });

  it("con DSN, lo que llega a Sentry ya viene sanitizado", () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://ejemplo@sentry.invalid/1";

    reportError("clasificador/columna-ilegible", {
      columna: "Cédula del titular",
      muestra: "1032456789",
      valor: 1032456789,
      validador: "nit-dian",
      columnas: 12,
    });

    expect(capturarMensaje).toHaveBeenCalledWith(
      "clasificador/columna-ilegible",
      {
        level: "error",
        extra: {
          columna: DESCARTADO,
          columnas: 12,
          muestra: DESCARTADO,
          validador: "nit-dian",
          valor: "1e9–1e10",
        },
      },
    );
  });

  it("no lleva contenido ni cuando lo llaman mal", () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://ejemplo@sentry.invalid/1";

    reportError("Falló la columna DIAGNOSTICO_CIE10 con valor J45.9");

    expect(capturarMensaje).toHaveBeenCalledWith("evento/no-conforme", {
      level: "error",
      extra: {},
    });
  });

  it("ningún encabezado ni valor real aparece en lo enviado", () => {
    // Prueba de barrido: se le mete TODO lo prohibido de una y se inspecciona el payload crudo.
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://ejemplo@sentry.invalid/1";

    const meta = Object.fromEntries(
      [...ENCABEZADOS_REALES, ...VALORES_DE_CELDA].map((texto, i) => [
        `campo${i}`,
        texto,
      ]),
    );
    reportError("parser/lectura-fallida", meta);

    const enviado = JSON.stringify(capturarMensaje.mock.calls[0]);
    for (const prohibido of [...ENCABEZADOS_REALES, ...VALORES_DE_CELDA]) {
      expect(enviado).not.toContain(prohibido);
    }
  });

  // ── S2: los objetos nuevos del sprint ───────────────────────────────────────────────────────
  // El sanitizador del S1 cerraba las dos puertas que existían entonces (encabezados y celdas).
  // Este sprint trae dos objetos más que jamás pueden salir, y el gate tiene que crecer con ellos
  // el mismo día que nacen — no el día que alguien se acuerde.

  it("una LLAVE no sale, ni entera ni en pedazos", () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://ejemplo@sentry.invalid/1";

    // Una llave filtrada vuelve enlazables TODOS los seudónimos a la vez: es la peor fuga posible
    // de este producto, peor que una celda suelta.
    const llaveHex =
      "9f2c4a7e1b03d85f6a2e9c0b47d1f83a5e6b2c9d0f4a7183e5b2c6d9f0a4718c";
    const frase = "mi frase de paso del proyecto de agosto";

    reportError("tecnicas/hmac-fallido", {
      llave: llaveHex,
      frase,
      "llave-parcial": llaveHex.slice(0, 8),
      "sal-base64": "dGhpcyBpcyBhIHNhbHQ=",
    });

    const enviado = JSON.stringify(capturarMensaje.mock.calls[0]);
    for (const secreto of [
      llaveHex,
      frase,
      llaveHex.slice(0, 8),
      "dGhpcyBpcyBhIHNhbHQ=",
    ]) {
      expect(enviado).not.toContain(secreto);
    }
  });

  it("una POLÍTICA no sale: lleva los nombres de columna del usuario", () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://ejemplo@sentry.invalid/1";

    const politica = exportarPolitica({
      version: 1,
      origen: "manual",
      kObjetivo: 5,
      reglas: [
        { columna: "Cédula del titular", tecnica: { tipo: "suprimir" } },
        { columna: "DIAGNOSTICO_CIE10", tecnica: { tipo: "conservar" } },
      ],
    });

    reportError("politica/importacion-fallida", {
      politica,
      columna: "Cédula del titular",
      // El hash SÍ puede viajar: identifica el tratamiento sin revelar una sola columna. Pero
      // tiene 64 caracteres, así que el sanitizador lo descarta igual — y está bien que así sea,
      // porque el gate no distingue «hash inofensivo» de «llave» mirando la cadena.
      hash: "a".repeat(64),
    });

    const enviado = JSON.stringify(capturarMensaje.mock.calls[0]);
    for (const prohibido of [
      "Cédula del titular",
      "DIAGNOSTICO_CIE10",
      "suprimir",
      politica,
    ]) {
      expect(enviado).not.toContain(prohibido);
    }
  });
});
