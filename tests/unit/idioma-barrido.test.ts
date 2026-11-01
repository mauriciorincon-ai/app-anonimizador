// @vitest-environment node
//
// GATE DEL BARRIDO — ninguna frase escrita a mano fuera de los catálogos.
//
// La paridad (`idioma.test.ts`) garantiza que lo que está en los catálogos existe en los dos
// idiomas. Pero no ve lo que NO está: un párrafo olvidado en un componente, un `aria-label` en
// español, un mensaje del worker que se quedó con la frase. Eso es lo que vuelve a una app
// «bilingüe» en una app que cambia de idioma por partes. Este test lo mira en el código, no en el
// resultado: recorre `src/` con el árbol sintáctico de TypeScript y marca
//
//   · el texto suelto dentro de JSX (`<p>Hola</p>`),
//   · los atributos que se leen o se oyen (`aria-label`, `title`, `placeholder`, `alt`…),
//   · cualquier cadena o plantilla que parezca español, en componentes, motores, worker y librerías.
//
// No marca: clases de CSS, identificadores («identificador-directo»), rutas, importaciones,
// tipos literales, ni lo que va dentro de `throw new Error(…)` o `console.*` (mensajes para quien
// programa, no para quien usa). Lo que sí se escribe a mano a propósito se lista abajo en
// `EXCEPCIONES`, con su razón; una excepción que ya no hace falta falla, para que la lista no crezca
// en silencio.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

// ── Qué se considera «español» ────────────────────────────────────────────────────────────────

const ACENTOS = /[áéíóúñÁÉÍÓÚÑ¿¡ü]/;
const PALABRAS_VACIAS = new Set([
  "de",
  "la",
  "el",
  "los",
  "las",
  "que",
  "una",
  "un",
  "con",
  "para",
  "por",
  "se",
  "no",
  "es",
  "del",
  "al",
  "tu",
  "tus",
  "su",
  "sus",
  "en",
  "y",
  "o",
  "lo",
  "le",
  "más",
  "como",
  "si",
  "ya",
  "sin",
  "hay",
  "este",
  "esta",
  "esto",
  "estos",
  "estas",
  "ese",
  "esa",
  "cada",
  "todo",
  "toda",
  "tiene",
  "puede",
  "solo",
  "sola",
  "ni",
  "pero",
  "aquí",
  "ahí",
  "cuando",
  "donde",
]);

function parecePros(texto: string): boolean {
  if (ACENTOS.test(texto)) return true;
  // El marcado no es prosa: `class="por-que"` lleva dos palabras vacías del español y no dice nada.
  // Tampoco lo es un identificador, una ruta o una clase (sin espacios): `k-del-reparto-no-es-el-del-archivo`.
  const sinMarcado = texto.replace(/<[^>]*>/g, " ").trim();
  if (/^[\w\-./:#@]*$/.test(sinMarcado)) return false;
  // Tampoco el CSS: sus selectores llevan nombres en español (`.por-que`, `.c-no-personal`) porque
  // son identificadores del documento. Un comentario con tildes dentro de él sí se marca (arriba).
  if (/[{}]/.test(sinMarcado) && /[\w-]+\s*:\s*[^;}]+[;}]/.test(sinMarcado))
    return false;
  const palabras = sinMarcado
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
  return palabras.filter((p) => PALABRAS_VACIAS.has(p)).length >= 2;
}

const TIENE_PALABRA = (texto: string, minimo: number) =>
  new RegExp(`\\p{L}{${minimo},}`, "u").test(
    texto.replace(/&[a-z]+;|&#\d+;/gi, ""),
  );

/** Atributos cuyo valor se lee o se oye: un texto con letras ahí es prosa, sin importar el idioma. */
const ATRIBUTOS_DE_PROSA = new Set([
  "aria-label",
  "aria-description",
  "aria-roledescription",
  "aria-valuetext",
  "title",
  "placeholder",
  "alt",
  "etiqueta",
  "titulo",
  "nota",
  "label",
  "descripcion",
  "texto",
  "leyenda",
  "ayuda",
  "resumen",
  "pista",
  "aviso",
]);

/** Palabras sueltas que son nombres propios o siglas y se escriben igual en todo idioma. */
const MARCAS = new Set([
  "Velo",
  "SHA-256",
  "CSV",
  "Excel",
  "HMAC",
  "PBKDF2",
  "AES-GCM",
]);

// ── El análisis ───────────────────────────────────────────────────────────────────────────────

export interface Hallazgo {
  readonly linea: number;
  readonly fragmento: string;
  readonly regla: string;
}

function fragmento(texto: string): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length > 70 ? `${limpio.slice(0, 67)}…` : limpio;
}

function esCadena(
  n: ts.Node,
): n is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n);
}

function textoEstatico(n: ts.Node): string | null {
  if (esCadena(n)) return n.text;
  if (ts.isTemplateExpression(n))
    return [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join(
      " ",
    );
  return null;
}

function esMensajeParaQuienPrograma(n: ts.Node): boolean {
  if (ts.isNewExpression(n)) return /Error$/.test(n.expression.getText());
  if (ts.isCallExpression(n))
    return n.expression.getText().startsWith("console.");
  return false;
}

export function analizar(nombre: string, codigo: string): Hallazgo[] {
  const archivo = ts.createSourceFile(
    nombre,
    codigo,
    ts.ScriptTarget.Latest,
    true,
    nombre.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const salida: Hallazgo[] = [];
  const marcar = (nodo: ts.Node, texto: string, regla: string) => {
    const { line } = archivo.getLineAndCharacterOfPosition(
      nodo.getStart(archivo),
    );
    salida.push({ linea: line + 1, fragmento: fragmento(texto), regla });
  };

  const visitar = (
    nodo: ts.Node,
    enAtributoDeProsa: boolean,
    enHijoJsx: boolean,
  ): void => {
    if (
      ts.isImportDeclaration(nodo) ||
      ts.isExportDeclaration(nodo) ||
      ts.isLiteralTypeNode(nodo) ||
      ts.isImportTypeNode(nodo) ||
      esMensajeParaQuienPrograma(nodo)
    )
      return;

    if (ts.isJsxText(nodo)) {
      const texto = nodo.text;
      if (!MARCAS.has(texto.trim()) && TIENE_PALABRA(texto, 3))
        marcar(nodo, texto, "texto dentro de JSX");
      return;
    }

    if (ts.isJsxAttribute(nodo)) {
      const nombreDelAtributo = nodo.name.getText(archivo);
      const valor = nodo.initializer;
      if (valor && esCadena(valor)) {
        if (
          (ATRIBUTOS_DE_PROSA.has(nombreDelAtributo) &&
            TIENE_PALABRA(valor.text, 2)) ||
          parecePros(valor.text)
        )
          marcar(valor, valor.text, `atributo ${nombreDelAtributo}`);
        return;
      }
      if (valor)
        visitar(valor, ATRIBUTOS_DE_PROSA.has(nombreDelAtributo), false);
      return;
    }

    if (ts.isJsxExpression(nodo)) {
      const esHijo =
        ts.isJsxElement(nodo.parent) || ts.isJsxFragment(nodo.parent);
      if (nodo.expression) visitar(nodo.expression, enAtributoDeProsa, esHijo);
      return;
    }

    // Una clave de objeto escrita como cadena es un identificador, no una frase.
    if (
      esCadena(nodo) &&
      (ts.isPropertyAssignment(nodo.parent) ||
        ts.isPropertySignature(nodo.parent)) &&
      nodo.parent.name === nodo
    )
      return;

    const estatico = textoEstatico(nodo);
    if (estatico !== null) {
      const esProsa = enAtributoDeProsa || enHijoJsx;
      if ((esProsa && TIENE_PALABRA(estatico, 2)) || parecePros(estatico))
        marcar(
          nodo,
          estatico,
          enHijoJsx ? "cadena dentro de JSX" : "cadena que parece español",
        );
      // Una plantilla puede llevar más plantillas dentro de sus `${…}`.
      if (ts.isTemplateExpression(nodo))
        for (const tramo of nodo.templateSpans)
          visitar(tramo.expression, false, false);
      return;
    }

    // Un ternario o un `a && b` dentro de un hijo de JSX sigue siendo texto que se pinta.
    const propaga =
      enHijoJsx &&
      (ts.isConditionalExpression(nodo) ||
        ts.isParenthesizedExpression(nodo) ||
        (ts.isBinaryExpression(nodo) &&
          [
            ts.SyntaxKind.AmpersandAmpersandToken,
            ts.SyntaxKind.BarBarToken,
            ts.SyntaxKind.QuestionQuestionToken,
          ].includes(nodo.operatorToken.kind)));
    ts.forEachChild(nodo, (hijo) => visitar(hijo, enAtributoDeProsa, propaga));
  };

  visitar(archivo, false, false);
  return salida;
}

// ── Qué archivos, y qué excepciones ───────────────────────────────────────────────────────────

const RAIZ = process.cwd();

const FUERA_DEL_BARRIDO = [
  "src/lib/idioma/textos/", // los catálogos SON las frases
  "src/engine/diccionarios/", // listas de nombres y apellidos: datos, no interfaz
];

interface Excepcion {
  readonly archivo: string;
  readonly contiene: string;
  readonly razon: string;
}

const EXCEPCIONES: readonly Excepcion[] = [
  {
    archivo: "src/lib/idioma/index.ts",
    contiene: "Español",
    razon:
      "el nombre de cada idioma se escribe en su propio idioma, a propósito (el conmutador)",
  },
  {
    archivo: "src/engine/mondrian.ts",
    contiene: "(o vacío)",
    razon:
      "es texto que Velo ESCRIBE EN EL ARCHIVO DE SALIDA del usuario (el rótulo de un intervalo que cubre celdas vacías): " +
      "la salida depende de entrada, política y llave, nunca del idioma de la interfaz (regla dura nº3, ADR-009). " +
      "Decisión pendiente del dueño: si algún día el archivo de salida debe poder salir con rótulos en inglés.",
  },
];

function archivos(ruta: string): string[] {
  if (!statSync(ruta).isDirectory()) return [ruta];
  return readdirSync(ruta).flatMap((e) => archivos(join(ruta, e)));
}

const FUENTES = archivos(join(RAIZ, "src"))
  .map((a) => relative(RAIZ, a))
  .filter((a) => /\.(ts|tsx)$/.test(a) && !a.endsWith(".d.ts"))
  .filter((a) => !FUERA_DEL_BARRIDO.some((f) => a.startsWith(f)));

const usadas = new Set<Excepcion>();

function sinExcepciones(archivo: string, hallazgos: Hallazgo[]): Hallazgo[] {
  return hallazgos.filter((h) => {
    const e = EXCEPCIONES.find(
      (x) => x.archivo === archivo && h.fragmento.includes(x.contiene),
    );
    if (e) usadas.add(e);
    return !e;
  });
}

describe("el barrido no deja frases fuera de los catálogos", () => {
  it("encuentra el código de la interfaz donde debe estar", () => {
    expect(FUENTES.length).toBeGreaterThan(40);
    expect(FUENTES).toContain("src/app/page.tsx");
    expect(FUENTES).toContain("src/engine/reporte.ts");
    expect(FUENTES).toContain("src/workers/parser.worker.ts");
  });

  it("ningún archivo de src/ trae una frase escrita a mano", () => {
    const quedan: string[] = [];
    for (const archivo of FUENTES) {
      const hallazgos = sinExcepciones(
        archivo,
        analizar(archivo, readFileSync(join(RAIZ, archivo), "utf8")),
      );
      for (const h of hallazgos)
        quedan.push(`${archivo}:${h.linea}  ${h.regla}  «${h.fragmento}»`);
    }
    expect(quedan).toEqual([]);
  });

  it("cada excepción sigue haciendo falta", () => {
    // Si nadie la usó es porque la frase ya no está: la excepción sobra y se borra.
    const sobran = EXCEPCIONES.filter((e) => !usadas.has(e)).map(
      (e) => `${e.archivo} «${e.contiene}»`,
    );
    expect(sobran).toEqual([]);
  });
});

// ── El barrido se prueba a sí mismo ───────────────────────────────────────────────────────────
// Un gate que nunca ha visto una falta es un gate que quizá no ve. Estas muestras son sintéticas.

describe("el barrido ve lo que debe ver", () => {
  const reglas = (codigo: string, nombre = "muestra.tsx") =>
    analizar(nombre, codigo).map((h) => h.regla);

  it("marca el texto suelto dentro de JSX", () => {
    expect(reglas("export const A = () => <p>Hola, mundo</p>;")).toEqual([
      "texto dentro de JSX",
    ]);
    expect(reglas("export const A = () => <p>Loading your file</p>;")).toEqual([
      "texto dentro de JSX",
    ]);
  });

  it("marca los atributos que se leen o se oyen", () => {
    expect(
      reglas('export const A = () => <button aria-label="Cerrar">x</button>;'),
    ).toContain("atributo aria-label");
    expect(
      reglas('export const A = () => <Panel titulo="Resumen" />;'),
    ).toContain("atributo titulo");
  });

  it("marca una cadena o una plantilla que parece español", () => {
    expect(reglas('const X = "no se pudo leer el archivo";', "m.ts")).toEqual([
      "cadena que parece español",
    ]);
    expect(
      reglas("const X = (n: number) => `hay ${n} filas en la tabla`;", "m.ts"),
    ).toEqual(["cadena que parece español"]);
    expect(reglas('const X = "señal";', "m.ts")).toEqual([
      "cadena que parece español",
    ]);
  });

  it("marca la cadena escrita como expresión dentro de JSX", () => {
    expect(
      reglas(
        'export const A = ({ok}: {ok: boolean}) => <p>{ok ? "Listo" : "Error"}</p>;',
      ),
    ).toEqual(["cadena dentro de JSX", "cadena dentro de JSX"]);
  });

  it("no marca clases, identificadores, rutas, importaciones ni tipos", () => {
    const codigo = `
      import { A } from "@/components/mi-componente";
      type T = "identificador-directo" | "no-personal";
      const CLASES = "flex items-center gap-4 px-6 py-3 text-tinta";
      const llaves = { "cuasi-identificador": 1 };
      export const B = () => (
        <a href="/regreso" className="rounded-3 border" data-testid="boton-x" role="group">
          <Rico texto={X} /> {" "} <span aria-hidden="true">·</span>
        </a>
      );
    `;
    expect(reglas(codigo)).toEqual([]);
  });

  it("no marca los mensajes para quien programa", () => {
    expect(
      reglas(
        'throw new Error("la política pide seudonimizar y no se dio una llave");',
        "m.ts",
      ),
    ).toEqual([]);
    expect(
      reglas('console.warn("no se pudo leer la sesión");', "m.ts"),
    ).toEqual([]);
  });

  it("no marca el marcado HTML ni los identificadores con guiones", () => {
    const html =
      'const A = `<p class="por-que"><code>${x}</code></p><td class="col">${y}</td>`;';
    expect(reglas(html, "m.ts")).toEqual([]);
    expect(
      reglas('const B = "k-del-reparto-no-es-el-del-archivo";', "m.ts"),
    ).toEqual([]);
  });

  it("pero sí la prosa metida dentro de una plantilla de HTML", () => {
    expect(
      reglas(
        "const A = `<p>No hay nada que mostrar en esta tabla</p>`;",
        "m.ts",
      ),
    ).toEqual(["cadena que parece español"]);
    // Un comentario CSS dentro de la plantilla viajaría escrito en cada documento descargado.
    expect(
      reglas(
        "const A = `td{width:1px}/* sin él la columna se estrecha */`;",
        "m.ts",
      ),
    ).toEqual(["cadena que parece español"]);
  });

  it("deja pasar los nombres propios", () => {
    expect(reglas("export const A = () => <b>Velo</b>;")).toEqual([]);
  });
});
