// El informe del regreso. **El test que importa aquí no es de cifra: es de composición.**
//
// «Restauradas 445.806 de 446.006 (99,96 %)» es una frase cierta y engañosa si no dice que 200
// celdas volvieron con el valor de otra persona posible. Ningún test unitario de aritmética ve esa
// mentira, porque no hay ninguna cifra mal calculada — hay una cifra bien calculada puesta antes de
// lo que la matiza. Así que lo que se verifica es el **orden del documento**.
//
// Las tres preguntas del patrón, aplicadas a este documento:
//   1. ¿Qué deja fuera la cifra, y está dicho donde se lee la cifra? → las salvedades van ARRIBA.
//   2. ¿El titular usa el mismo concepto que el cálculo? → «restauradas» excluye ambiguas.
//   3. ¿Sobrevive fuera de contexto? → el pie REPITE la ambigüedad, porque el informe se cita solo.

import { describe, expect, it } from "vitest";

import { construirBoveda, huellaDeBoveda } from "@/engine/boveda";
import { ConstructorColumnar, type TablaColumnar } from "@/engine/columnar";
import {
  construirInformeDeRestauracion,
  nombreDelInforme,
} from "@/engine/reporte";
import { restaurar } from "@/engine/restaurar";

const IDENTIDAD = {
  huellaDeLlave: "a1b2c3d4e5f6",
  salDeLlave: "0".repeat(32),
  hashDePolitica: "9c1185a5c5e9fc54612808977ee8f548b2258d31",
};

const FECHA = "12 de agosto de 2026";

function tablaDe(encabezado: string[], filas: string[][]): TablaColumnar {
  const constructor = new ConstructorColumnar(encabezado, filas.length);
  for (const fila of filas) constructor.agregarFila(fila);
  return constructor.finalizar();
}

/** Bóveda con una colisión: `890000001-7` corresponde a dos NITs distintos. */
const CON_COLISION = construirBoveda(IDENTIDAD, [
  {
    columna: "nit",
    originales: ["800123456-1", "811987654-3", "830555111-9", "860111222-4"],
    seudonimos: ["890000001-7", "890000001-7", "890000002-4", "890000003-1"],
  },
]);

const LIMPIA = construirBoveda(IDENTIDAD, [
  {
    columna: "nit",
    originales: ["800123456-1", "811987654-3", "830555111-9"],
    seudonimos: ["890000001-7", "890000002-4", "890000003-1"],
  },
]);

function informeDe(boveda: typeof LIMPIA, tabla: TablaColumnar): string {
  const restauracion = restaurar(tabla, boveda);
  return construirInformeDeRestauracion({
    archivo: { nombre: "devuelto.csv", bytes: 4096, sha256: "f".repeat(64) },
    restauracion,
    huellaDeBoveda: huellaDeBoveda(boveda),
    hashDePolitica: boveda.hashDePolitica,
    fecha: FECHA,
  });
}

const DEVUELTO = tablaDe(
  ["nit", "resultado"],
  [
    ["890000001-7", "aprobado"],
    ["890000002-4", "aprobado"],
    ["890000003-1", "rechazado"],
    ["890000001-7", "aprobado"],
  ],
);

describe("la ambigüedad va ANTES que el porcentaje, en el orden del documento", () => {
  const html = informeDe(CON_COLISION, DEVUELTO);

  it("la salvedad precede a la cifra de restauración", () => {
    const ambiguedad = html.indexOf("sin resolver");
    const cifra = html.indexOf("de las celdas con contenido");
    const cifraNoTitular = html.indexOf("celdas con contenido — el");
    const posicionDeLaCifra = Math.max(cifra, cifraNoTitular);

    expect(ambiguedad).toBeGreaterThan(-1);
    expect(posicionDeLaCifra).toBeGreaterThan(-1);
    expect(ambiguedad).toBeLessThan(posicionDeLaCifra);
  });

  it("y la cifra NO se presenta como titular", () => {
    // `cifrota` es la clase del número gigante. Con una salvedad que descalifica, no aparece.
    // Sobre la ETIQUETA, no sobre la palabra: `cifrota` es también una clase del CSS embebido, y
    // buscarla suelta daría siempre verdadero.
    expect(html).not.toContain('<p class="cifrota">');
    expect(html).toContain("no\ndescribe un archivo recuperado del todo");
  });

  it("la salvedad dice que Velo NO eligió, que es lo que el usuario necesita saber", () => {
    expect(html).toMatch(/no eligió por ti/i);
    expect(html).toMatch(/conservan el seudónimo/);
  });

  it("el pie REPITE la ambigüedad, porque el informe se lee fuera de contexto", () => {
    // Tercera pregunta del patrón: un documento exportado se cita sin la pantalla alrededor.
    const pie = html.slice(html.indexOf("<footer>"));
    expect(pie).toMatch(/celdas ambiguas/i);
    expect(pie).toMatch(/no volvieron/);
    expect(pie).toMatch(/dice más de lo que ocurrió/);
  });

  it("las dos celdas ambiguas se cuentan como celdas, no como valores", () => {
    // El seudónimo colisionado aparece en dos filas: son DOS celdas ambiguas, no una.
    expect(html).toMatch(/<b>2<\/b> celdas volvieron/);
  });
});

describe("sin nada que matizar, la cifra sí puede ir de titular", () => {
  const html = informeDe(
    LIMPIA,
    tablaDe(["nit"], [["890000001-7"], ["890000002-4"], ["890000003-1"]]),
  );

  it("presenta el porcentaje en grande y sin peros", () => {
    expect(html).toContain("cifrota");
    expect(html).toMatch(/100 %/);
    expect(html).not.toMatch(/no describe un archivo recuperado/);
  });

  it("y el pie no inventa una advertencia que no aplica", () => {
    const pie = html.slice(html.indexOf("<footer>"));
    expect(pie).not.toMatch(/celdas ambiguas/i);
  });
});

describe("una bóveda que no corresponde se dice en el informe", () => {
  const html = informeDe(
    LIMPIA,
    tablaDe(["cedula"], [["7000000001"], ["7000000002"], ["7000000003"]]),
  );

  it("lo declara arriba y no da ningún porcentaje", () => {
    expect(html).toMatch(/Ninguna columna de la bóveda apareció/);
    expect(html).toMatch(/No hubo ninguna celda que restaurar/);
    // Sobre la ETIQUETA, no sobre la palabra: `cifrota` es también una clase del CSS embebido, y
    // buscarla suelta daría siempre verdadero.
    expect(html).not.toContain('<p class="cifrota">');
  });
});

// Cada rama de estas es una frase que alguien va a leer. «1 celdas volvieron sin resolver» no es un
// hueco de cobertura: es un documento que se entrega a un tercero escrito con falta de ortografía.
describe("el singular y el plural, que son copy y no ramas", () => {
  it("una sola celda ambigua se dice en singular", () => {
    const html = informeDe(
      CON_COLISION,
      tablaDe(["nit"], [["890000001-7"], ["890000002-4"], ["890000003-1"]]),
    );
    expect(html).toMatch(/<b>1<\/b> celda volvió/);
    expect(html).not.toMatch(/celdas volvieron/);
  });

  it("una sola celda cambiada por el tercero, también", () => {
    const html = informeDe(
      LIMPIA,
      tablaDe(
        ["nit"],
        [["890000001-7"], ["890000002-4"], ["890000003-1"], ["999999999-9"]],
      ),
    );
    expect(html).toMatch(/<b>1<\/b> celda no estaba/);
    expect(html).toMatch(/él la dejó/);
  });

  it("varias celdas cambiadas van en plural", () => {
    const html = informeDe(
      LIMPIA,
      tablaDe(
        ["nit"],
        [
          ["890000001-7"],
          ["890000002-4"],
          ["890000003-1"],
          ["999999999-9"],
          ["888888888-8"],
        ],
      ),
    );
    expect(html).toMatch(/<b>2<\/b> celdas no estaban/);
    expect(html).toMatch(/él las dejó/);
  });

  it("una columna de la bóveda que no apareció se dice en singular", () => {
    const dos = construirBoveda(IDENTIDAD, [
      ...LIMPIA.columnas.map((c) => ({
        columna: c.columna,
        originales: c.originales.map((o) => o[0]),
        seudonimos: [...c.seudonimos],
      })),
      {
        columna: "cedula",
        originales: ["1032456789", "1098765432"],
        seudonimos: ["1900000001", "1900000002"],
      },
    ]);
    const html = informeDe(
      dos,
      tablaDe(["nit"], [["890000001-7"], ["890000002-4"], ["890000003-1"]]),
    );
    expect(html).toMatch(/una columna que no apareció/);
    expect(html).toMatch(/El porcentaje de abajo no\s*la cuenta/);
  });

  it("una columna a medias sale nombrada con su proporción", () => {
    // Dos valores de la bóveda sobre cinco: pasa el piso de coincidencias, no el umbral.
    const html = informeDe(
      LIMPIA,
      tablaDe(
        ["referencias"],
        [["890000001-7"], ["890000002-4"], ["nota-a"], ["nota-b"], ["nota-c"]],
      ),
    );
    expect(html).toMatch(
      /<code>referencias<\/code> tiene valores de la bóveda/,
    );
    expect(html).toMatch(/40 %/);
    expect(html).toMatch(/salió <b>intacta<\/b>/);
    // Y en la tabla, la columna no reconocida dice cuántos valores coincidieron.
    expect(html).toMatch(/No reconocida<\/span> <small>2 de 5 valores/);
  });
});

describe("el informe se abre solo, sin internet", () => {
  const html = informeDe(CON_COLISION, DEVUELTO);

  it("no pide un solo recurso externo", () => {
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/@import/i);
    expect(html).not.toMatch(/\burl\(/i);
    expect(html).not.toMatch(/<img\b/i);
    expect(html).not.toMatch(/<iframe\b/i);
  });

  it("es un documento HTML completo, no un fragmento", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
  });
});

describe("no lleva una sola celda del archivo", () => {
  const html = informeDe(CON_COLISION, DEVUELTO);

  it("ni seudónimos ni valores restaurados aparecen en el documento", () => {
    // El informe viaja en un correo igual que el reporte del S2. Un seudónimo es dato del usuario
    // y un original lo es más todavía.
    for (const valor of ["890000001-7", "890000002-4", "890000003-1"]) {
      expect(html, `el seudónimo ${valor} aparece`).not.toContain(valor);
    }
    for (const valor of ["800123456-1", "811987654-3", "830555111-9"]) {
      expect(html, `el original ${valor} aparece`).not.toContain(valor);
    }
    expect(html).toMatch(/No lleva ninguna celda del archivo/);
  });

  it("sí lleva los nombres de columna y las huellas, que es lo que lo hace auditable", () => {
    expect(html).toContain("nit");
    expect(html).toContain(huellaDeBoveda(CON_COLISION));
    expect(html).toContain(IDENTIDAD.hashDePolitica);
    expect(html).toContain("f".repeat(64));
  });
});

describe("el archivo del usuario no puede volverse código", () => {
  it("una columna llamada <script> no ejecuta nada", () => {
    const html = informeDe(
      LIMPIA,
      tablaDe(
        ["<script>alert(1)</script>", "nit"],
        [
          ["x", "890000001-7"],
          ["y", "890000002-4"],
          ["z", "890000003-1"],
        ],
      ),
    );
    expect(html).not.toMatch(/<script\b/i);
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("determinismo", () => {
  it("mismos datos y misma fecha ⇒ mismo archivo, byte por byte", () => {
    expect(informeDe(CON_COLISION, DEVUELTO)).toBe(
      informeDe(CON_COLISION, DEVUELTO),
    );
  });
});

describe("nombre del archivo descargado", () => {
  it("sale del original y se distingue del reporte del diagnóstico", () => {
    expect(nombreDelInforme("pacientes 2026.csv")).toBe(
      "velo-regreso-pacientes-2026.html",
    );
    expect(nombreDelInforme("informe/raro*.xlsx")).toBe(
      "velo-regreso-informe-raro.html",
    );
    expect(nombreDelInforme("***.csv")).toBe("velo-regreso-archivo.html");
  });
});
