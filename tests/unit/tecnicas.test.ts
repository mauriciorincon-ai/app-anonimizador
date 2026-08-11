// Las cuatro familias de transformación. Lo que estos tests protegen no es que las funciones
// «anden»: es que el archivo que sale de Velo cumpla lo que Velo promete de él.

import { beforeAll, describe, expect, it } from "vitest";

import { ConstructorColumnar, type TablaColumnar } from "@/engine/columnar";
import { aplicarPolitica, requiereLlave } from "@/engine/tecnicas";
import {
  generalizarFecha,
  generalizarPrefijo,
  generalizarRango,
} from "@/engine/tecnicas/generalizar";
import {
  seudonimizar,
  seudonimizarConFormato,
} from "@/engine/tecnicas/seudonimo";
import { validadorNit } from "@/engine/validadores/colombianos";
import { derivarLlave, generarSal, ITERACIONES_PBKDF2 } from "@/lib/llave";
import type { Politica } from "@/engine/politica";

/** Llave cruda: las técnicas solo necesitan una `CryptoKey`, y derivarla cuesta un segundo. */
async function llaveDe(semilla: string): Promise<CryptoKey> {
  const bytes = new TextEncoder().encode(semilla.padEnd(32, "."));
  return crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function tablaDe(encabezado: string[], filas: string[][]): TablaColumnar {
  const constructor = new ConstructorColumnar(encabezado, filas.length);
  for (const fila of filas) constructor.agregarFila(fila);
  return constructor.finalizar();
}

function valoresDe(tabla: TablaColumnar, nombre: string): string[] {
  const columna = tabla.columnas.find((c) => c.nombre === nombre)!;
  return [...columna.codigos].map((codigo) => columna.valores[codigo]);
}

function politicaDe(reglas: Politica["reglas"]): Politica {
  return { version: 1, origen: "manual", kObjetivo: null, reglas };
}

let llaveA: CryptoKey;
let llaveB: CryptoKey;
beforeAll(async () => {
  llaveA = await llaveDe("llave-del-proyecto-a");
  llaveB = await llaveDe("llave-del-proyecto-b");
});

describe("generalizar", () => {
  it("agrupa números en intervalos, y trata bien los negativos", () => {
    expect(generalizarRango("37", 10)).toBe("30-39");
    expect(generalizarRango("40", 10)).toBe("40-49");
    // Truncar en vez de usar `floor` mandaría −5 y 5 al mismo balde.
    expect(generalizarRango("-5", 10)).toBe("-10--1");
    expect(generalizarRango("5", 10)).toBe("0-9");
  });

  it("deja como está lo que no puede generalizar", () => {
    // Devolver vacío escondería que ahí había algo; inventar una marca sería escribir un dato que
    // nadie puso.
    expect(generalizarRango("N/A", 10)).toBe("N/A");
    expect(generalizarFecha("ayer", "anio")).toBe("ayer");
  });

  it("recorta fechas y las devuelve SIEMPRE en ISO, venga como venga la entrada", () => {
    expect(generalizarFecha("1987-03-14", "mes")).toBe("1987-03");
    expect(generalizarFecha("1987-03-14", "anio")).toBe("1987");
    // Una columna que mezclara `1987` con `03/1987` no se podría ordenar ni agrupar.
    expect(generalizarFecha("14/03/1987", "mes")).toBe("1987-03");
    expect(generalizarFecha("14-03-1987", "anio")).toBe("1987");
  });

  it("corta prefijos sin pasarse del largo del valor", () => {
    expect(generalizarPrefijo("05001", 2)).toBe("05");
    expect(generalizarPrefijo("05", 5)).toBe("05");
  });
});

describe("seudonimizar", () => {
  it("el mismo valor con la misma llave da el mismo seudónimo", async () => {
    const uno = await seudonimizar(["1032456789"], llaveA);
    const otro = await seudonimizar(["1032456789"], llaveA);
    expect(otro.valores).toEqual(uno.valores);
  });

  it("una llave DISTINTA da un seudónimo distinto", async () => {
    // La dirección que casi nunca se prueba, y sin la cual un HMAC roto que devolviera una
    // constante pasaría el test de arriba con nota.
    const conA = await seudonimizar(["1032456789"], llaveA);
    const conB = await seudonimizar(["1032456789"], llaveB);
    expect(conB.valores[0]).not.toBe(conA.valores[0]);
  });

  it("el vacío sigue vacío: una celda en blanco no tiene seudónimo", async () => {
    const r = await seudonimizar(["", "1032456789", ""], llaveA);
    expect(r.valores[0]).toBe("");
    expect(r.valores[2]).toBe("");
    expect(r.colisiones).toBe(0);
  });

  it("respeta la longitud pedida y no colisiona en un archivo grande", async () => {
    const valores = Array.from({ length: 5_000 }, (_, i) =>
      String(1_000_000_000 + i),
    );
    const r = await seudonimizar(valores, llaveA, 16);
    expect(r.valores[0]).toHaveLength(16);
    expect(new Set(r.valores).size).toBe(5_000);
    expect(r.colisiones).toBe(0);
  });
});

describe("seudonimizar conservando el formato (C10)", () => {
  it("un NIT seudonimizado pasa el validador oficial del S1", async () => {
    // El criterio de aceptación nº3: el archivo de salida tiene que ser válido para el sistema del
    // destino, y quien lo dice es el mismo validador que el S1 usa para detectarlos.
    const originales = ["900123456-7", "800654321-2", "901112223-9"];
    const r = await seudonimizarConFormato(originales, llaveA, "nit");
    for (const seudonimo of r.valores) {
      expect(validadorNit.valida(seudonimo, { nombre: "nit" }), seudonimo).toBe(
        true,
      );
    }
  });

  it("el DV se RECALCULA: el seudónimo no hereda el dígito del original", async () => {
    const r = await seudonimizarConFormato(["900123456-7"], llaveA, "nit");
    const [base, dv] = r.valores[0].split("-");
    expect(base).toMatch(/^[89]\d{8}$/);
    expect(dv).toMatch(/^\d$/);
    expect(validadorNit.valida(`${base}-${dv}`, { nombre: "nit" })).toBe(true);
  });

  it("una cédula seudonimizada sigue pareciendo una cédula", async () => {
    // Estructural y nada más: la cédula colombiana NO tiene dígito de verificación público, así
    // que aquí Velo no puede afirmar lo que afirma con el NIT.
    const r = await seudonimizarConFormato(
      ["1032456789", "79123456"],
      llaveA,
      "cedula",
    );
    for (const seudonimo of r.valores) expect(seudonimo).toMatch(/^1\d{9}$/);
  });

  it("cuenta las colisiones del formato en vez de esconderlas o rehashear", async () => {
    // El formato de un NIT solo tiene 2×10⁸ combinaciones: con suficientes valores distintos, dos
    // caen en el mismo seudónimo. Velo NO lo resuelve rehasheando —eso rompería la consistencia
    // referencial entre archivos, que es lo único que hace útil al seudónimo— así que lo cuenta.
    const valores = Array.from(
      { length: 40_000 },
      (_, i) => `${900_000_000 + i}-1`,
    );
    const r = await seudonimizarConFormato(valores, llaveA, "nit");
    const distintos = new Set(r.valores).size;
    expect(r.colisiones).toBe(valores.length - distintos);
    // Y el conteo es exacto, no una estimación: se comprueba contra el conjunto.
    expect(r.colisiones).toBeGreaterThan(0);
  });
});

describe("consistencia referencial (C9) — cae sola del HMAC", () => {
  it("el mismo cliente recibe el mismo seudónimo en DOS ARCHIVOS distintos", async () => {
    // Criterio de aceptación nº4. No se construye ninguna tabla de correspondencia: es lo que un
    // HMAC hace. Pero una propiedad que nadie comprueba es una esperanza.
    const marzo = tablaDe(
      ["cedula", "monto"],
      [
        ["1032456789", "100"],
        ["79123456", "200"],
      ],
    );
    const abril = tablaDe(
      ["cedula", "sucursal"],
      [
        ["79123456", "SUC-01"],
        ["1032456789", "SUC-02"],
        ["1088777666", "SUC-01"],
      ],
    );
    const politica = politicaDe([
      { columna: "cedula", tecnica: { tipo: "seudonimizar", longitud: 16 } },
    ]);

    const deMarzo = await aplicarPolitica(marzo, politica, llaveA);
    const deAbril = await aplicarPolitica(abril, politica, llaveA);

    const enMarzo = valoresDe(deMarzo.tabla, "cedula");
    const enAbril = valoresDe(deAbril.tabla, "cedula");
    // 1032456789 es la fila 0 de marzo y la fila 1 de abril: el join sigue funcionando.
    expect(enAbril[1]).toBe(enMarzo[0]);
    expect(enAbril[0]).toBe(enMarzo[1]);
    // Y el que solo está en abril no coincide con ninguno de marzo.
    expect(enMarzo).not.toContain(enAbril[2]);
  });

  it("con OTRA llave, los cruces del mes pasado dejan de cuadrar", async () => {
    const tabla = tablaDe(["cedula"], [["1032456789"]]);
    const politica = politicaDe([
      { columna: "cedula", tecnica: { tipo: "seudonimizar", longitud: 16 } },
    ]);
    const conA = await aplicarPolitica(tabla, politica, llaveA);
    const conB = await aplicarPolitica(tabla, politica, llaveB);
    expect(valoresDe(conB.tabla, "cedula")[0]).not.toBe(
      valoresDe(conA.tabla, "cedula")[0],
    );
  });
});

describe("el pipeline completo", () => {
  const TABLA = tablaDe(
    ["cedula", "edad", "fecha_nac", "municipio", "diagnostico", "monto"],
    [
      ["1032456789", "37", "1987-03-14", "05001", "J45.9", "120000"],
      ["79123456", "42", "1982-11-02", "11001", "E11.9", "85000"],
      ["1088777666", "37", "1987-07-30", "05001", "J45.9", "200000"],
    ],
  );

  it("suprime, enmascara, generaliza y seudonimiza en una pasada", async () => {
    const politica = politicaDe([
      {
        columna: "cedula",
        tecnica: { tipo: "seudonimizar-con-formato", formato: "cedula" },
      },
      { columna: "edad", tecnica: { tipo: "generalizar-rango", amplitud: 10 } },
      {
        columna: "fecha_nac",
        tecnica: { tipo: "generalizar-fecha", precision: "anio" },
      },
      {
        columna: "municipio",
        tecnica: { tipo: "generalizar-prefijo", caracteres: 2 },
      },
      { columna: "diagnostico", tecnica: { tipo: "conservar" } },
      { columna: "monto", tecnica: { tipo: "suprimir" } },
    ]);

    const r = await aplicarPolitica(TABLA, politica, llaveA);

    expect(r.suprimidas).toEqual(["monto"]);
    expect(r.tabla.columnas.map((c) => c.nombre)).not.toContain("monto");
    expect(valoresDe(r.tabla, "edad")).toEqual(["30-39", "40-49", "30-39"]);
    expect(valoresDe(r.tabla, "fecha_nac")).toEqual(["1987", "1982", "1987"]);
    expect(valoresDe(r.tabla, "municipio")).toEqual(["05", "11", "05"]);
    // El dato sensible se conserva: es lo que el análisis quiere medir.
    expect(valoresDe(r.tabla, "diagnostico")).toEqual([
      "J45.9",
      "E11.9",
      "J45.9",
    ]);
    expect(r.tabla.filas).toBe(3);
  });

  it("re-deduplica el diccionario: la cardinalidad no puede mentir después de generalizar", async () => {
    // De aquí salen las clases de equivalencia, o sea el riesgo. Un diccionario con 3 entradas
    // donde solo quedan 2 valores distintos daría un k equivocado.
    const politica = politicaDe([
      {
        columna: "fecha_nac",
        tecnica: { tipo: "generalizar-fecha", precision: "anio" },
      },
    ]);
    const r = await aplicarPolitica(TABLA, politica, null);
    const columna = r.tabla.columnas.find((c) => c.nombre === "fecha_nac")!;
    // "" + 1987 + 1982 = 3 entradas, no 4 (las dos fechas de 1987 colapsaron en una).
    expect(columna.valores).toEqual(["", "1987", "1982"]);
  });

  it("las columnas de Mondrian salen intactas y anotadas para la fase siguiente", async () => {
    const politica = politicaDe([
      { columna: "municipio", tecnica: { tipo: "generalizar-automatico" } },
      { columna: "monto", tecnica: { tipo: "suprimir" } },
    ]);
    const r = await aplicarPolitica(TABLA, politica, null);
    expect(r.pendientesDeMondrian).toEqual(["municipio"]);
    expect(valoresDe(r.tabla, "municipio")).toEqual([
      "05001",
      "11001",
      "05001",
    ]);
  });

  it("una columna marcada para Mondrian Y suprimida no queda pendiente de nada", async () => {
    const politica = politicaDe([
      { columna: "municipio", tecnica: { tipo: "suprimir" } },
      { columna: "edad", tecnica: { tipo: "generalizar-automatico" } },
    ]);
    const r = await aplicarPolitica(TABLA, politica, null);
    expect(r.pendientesDeMondrian).toEqual(["edad"]);
  });

  it("sin llave, una política que seudonimiza no produce un archivo a medias", async () => {
    const politica = politicaDe([
      { columna: "cedula", tecnica: { tipo: "seudonimizar", longitud: 16 } },
    ]);
    expect(requiereLlave(politica)).toBe(true);
    await expect(aplicarPolitica(TABLA, politica, null)).rejects.toThrow(
      /llave/,
    );
  });

  it("una política sin seudónimos no pide llave", async () => {
    const politica = politicaDe([
      { columna: "cedula", tecnica: { tipo: "enmascarar" } },
    ]);
    expect(requiereLlave(politica)).toBe(false);
    const r = await aplicarPolitica(TABLA, politica, null);
    // La regla del S1: nunca más de la mitad del valor a la vista.
    for (const valor of valoresDe(r.tabla, "cedula")) {
      expect(valor.replace("***", "").length / 10).toBeLessThanOrEqual(0.5);
    }
  });
});

describe("la llave del proyecto", () => {
  it("misma frase + misma sal ⇒ misma llave; otra sal ⇒ otra llave", async () => {
    const sal = generarSal();
    const [uno, otro, conOtraSal] = await Promise.all([
      derivarLlave("mi frase de paso", sal),
      derivarLlave("mi frase de paso", sal),
      derivarLlave("mi frase de paso", generarSal()),
    ]);
    expect(otro.huella).toBe(uno.huella);
    expect(conOtraSal.huella).not.toBe(uno.huella);
  }, 30_000);

  it("la sal es aleatoria de verdad", () => {
    const salidas = new Set(Array.from({ length: 50 }, generarSal));
    expect(salidas.size).toBe(50);
    expect([...salidas][0]).toMatch(/^[0-9a-f]{32}$/);
  });

  it("declara el costo que OWASP pide, y no uno más cómodo", () => {
    expect(ITERACIONES_PBKDF2).toBe(600_000);
  });

  it("la huella no revela la llave: es corta y sale de una constante", async () => {
    const llave = await derivarLlave("otra frase", generarSal());
    expect(llave.huella).toMatch(/^[0-9a-f]{12}$/);
    expect(llave.clave.extractable).toBe(false);
  }, 30_000);
});
