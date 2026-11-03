// GATE DE HONESTIDAD MEDIDA — la regla dura nº4 del producto, en forma de test.
//
// Velo reduce el riesgo de reidentificación y lo MIDE; no promete magia. k-anonimato es atacable
// incluso sin información auxiliar (arXiv:2509.03350) y se degrada con la dimensionalidad, así que
// una sola frase de más en un microcopy —"100 % seguro", "anonimato garantizado"— convierte un
// instrumento honesto en publicidad falsa.
//
// Igual que el gate de determinismo, este mira el CÓDIGO FUENTE y no la salida: una frase
// prohibida escondida en un estado que ningún test recorre haría el mismo daño, y no la cazaría
// ninguna aserción de comportamiento.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// El brochure entra al barrido desde la entrega de la pieza: es el documento MÁS público de la
// app —se sirve en /conoce y se abre con doble clic— y donde una frase de más se pagaría más
// caro. Es exactamente donde el impulso de vender aprieta.
const RAICES = [
  "src",
  "docs/MANUAL-DE-USO.md",
  "docs/MANUAL-DE-USO.en.md",
  "docs/BROCHURE.html",
];

/** Las tres del CLAUDE.md, más las variantes con las que se cuelan en la práctica. */
const PROHIBIDAS: readonly { patron: RegExp; porque: string }[] = [
  {
    patron: /anonimato\s+garantizad/i,
    porque: "ningún método garantiza el anonimato: k-anonimato es atacable",
  },
  {
    patron: /garantiza\w*\s+(el\s+)?anonimato/i,
    porque: "ningún método garantiza el anonimato: k-anonimato es atacable",
  },
  {
    patron: /100\s*%?\s*segur/i,
    porque: "no existe el 100 % seguro; existe el riesgo medido",
  },
  {
    patron: /imposible\s+de\s+reidentificar/i,
    porque: "la reidentificación se hace menos probable, nunca imposible",
  },
  {
    patron: /(totalmente|completamente|100\s*%)\s+an[oó]nim/i,
    porque: "el anonimato absoluto no es una propiedad que Velo pueda afirmar",
  },
  {
    patron: /riesgo\s+cero/i,
    porque: "ninguna técnica lleva el riesgo a cero; decirlo sería falso",
  },

  // ── Los mismos seis, en inglés (S5) ──
  // El texto ya no vive solo en español: los catálogos de `src/lib/idioma/textos/` llevan las dos
  // caras, y una promesa de más en inglés engaña igual. Cada patrón es el equivalente del español
  // de arriba, escrito con las variantes con las que se cuelan en la práctica.
  {
    patron: /guaranteed\s+anonymi/i,
    porque: "no method guarantees anonymity: k-anonymity can be attacked",
  },
  {
    patron: /anonymity\s+(is\s+|are\s+)?guarantee/i,
    porque: "no method guarantees anonymity: k-anonymity can be attacked",
  },
  {
    patron: /guarantee[sd]?\s+(the\s+|your\s+|full\s+|total\s+)?anonymi/i,
    porque: "no method guarantees anonymity: k-anonymity can be attacked",
  },
  {
    patron: /100\s*%?\s*(safe|secure)/i,
    porque: "there is no such thing as 100% safe; there is measured risk",
  },
  {
    patron: /impossible\s+to\s+(re-?identify|de-?anonymi[sz]e)/i,
    porque: "re-identification is made less likely, never impossible",
  },
  {
    patron: /(totally|completely|fully|100\s*%)\s+anonymous/i,
    porque: "absolute anonymity is not something Velo can claim",
  },
  {
    patron: /\bzero[-\s]+(re-?identification[-\s]+)?risk\b|\brisk[-\s]+free\b/i,
    porque: "no technique takes the risk to zero; saying so would be false",
  },

  // ── El ruido con garantía (S7) ──
  // La privacidad diferencial tiene un ε y un alcance; «garantizada» a secas promete lo que ningún
  // ε cubre (las demás columnas, las entregas repetidas). Velo dice el ε y su alcance, nunca esto.
  {
    patron: /privacidad\s+(\w+\s+)?garantizad/i,
    porque: "toda cifra de privacidad lleva su ε y su alcance; «garantizada» a secas es falso",
  },
  {
    patron: /garantiza\w*\s+(la\s+|tu\s+|su\s+)?privacidad/i,
    porque: "toda cifra de privacidad lleva su ε y su alcance; «garantizada» a secas es falso",
  },
  {
    patron: /guaranteed\s+privacy/i,
    porque: "every privacy figure carries its ε and its scope; plain «guaranteed» is false",
  },
  {
    patron: /privacy\s+(is\s+|are\s+)?guaranteed|guarantee[sd]?\s+(the\s+|your\s+|full\s+)?privacy/i,
    porque: "every privacy figure carries its ε and its scope; plain «guaranteed» is false",
  },

  // ── El RGPD (S8) ──
  // Seudonimizar no es anonimizar (art. 4.5 y considerando 26): un dato seudonimizado sigue siendo
  // dato personal para quien tiene la información adicional. Velo no hace el análisis de «medios
  // razonables» del considerando 26, así que jamás dice que un archivo es anónimo «según el RGPD»
  // ni que lo cumple. Tampoco lo niega con estas mismas palabras: se escribe de otro modo.
  {
    patron: /an[oó]nim\w*\s+(seg[uú]n|conforme\s+(a|al|con)|bajo|de\s+acuerdo\s+con)\s+(el\s+)?(RGPD|GDPR)/i,
    porque: "solo quien hace el análisis del considerando 26 puede decir «anónimo»; Velo no lo hace",
  },
  {
    patron: /cumpl\w*\s+(con\s+)?(el\s+)?(RGPD|GDPR)/i,
    porque: "una política de fábrica es una interpretación de Velo, no una certificación de cumplimiento",
  },
  {
    patron: /(conforme\s+(a|al|con)|apto\s+(para|con))\s+(el\s+)?(RGPD|GDPR)/i,
    porque: "una política de fábrica es una interpretación de Velo, no una certificación de cumplimiento",
  },
  {
    patron: /(GDPR|RGPD)[-\s]+(compliant|compliance)\b/i,
    porque: "a factory policy is Velo's reading of the text, not a compliance certification",
  },
  {
    patron: /complies\s+with\s+(the\s+)?GDPR|compliant\s+with\s+(the\s+)?GDPR/i,
    porque: "a factory policy is Velo's reading of the text, not a compliance certification",
  },
  {
    patron: /anonymous\s+(under|according\s+to|per|as\s+defined\s+by)\s+(the\s+)?GDPR/i,
    porque: "only the recital 26 means-reasonably-likely analysis can say «anonymous»; Velo does not run it",
  },
];

function archivos(ruta: string): string[] {
  if (!statSync(ruta).isDirectory()) return [ruta];
  return readdirSync(ruta).flatMap((entrada) => archivos(join(ruta, entrada)));
}

/** Se quitan los comentarios: este archivo NOMBRA las frases prohibidas para poder vetarlas. */
function sinComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

describe("ninguna pantalla promete lo que Velo no puede cumplir", () => {
  const rutas = RAICES.flatMap((raiz) => archivos(join(process.cwd(), raiz)))
    .filter((ruta) => /\.(tsx?|md|html)$/.test(ruta))
    .filter((ruta) => !ruta.endsWith(".d.ts"));

  it("encuentra el código de la interfaz donde debe estar", () => {
    expect(rutas.length).toBeGreaterThan(10);
  });

  for (const { patron, porque } of PROHIBIDAS) {
    it(`no dice ${patron.source} — ${porque}`, () => {
      const culpables = rutas.filter((ruta) =>
        patron.test(sinComentarios(readFileSync(ruta, "utf8"))),
      );
      expect(culpables.map((r) => r.slice(process.cwd().length + 1))).toEqual(
        [],
      );
    });
  }
});

// ── El gate se prueba a sí mismo ──────────────────────────────────────────────────────────────
// Un gate que nunca ha visto una falta es un gate que quizá no ve. Estas frases son las
// prohibidas, en los dos idiomas, y las permitidas que se les parecen: las primeras deben caer en
// al menos un patrón, las segundas en ninguno (un falso positivo haría que se desconfiara del gate).

describe("los patrones prohibidos ven lo que deben ver", () => {
  const cae = (frase: string) =>
    PROHIBIDAS.some(({ patron }) => patron.test(frase));

  it.each([
    "anonimato garantizado",
    "Velo garantiza el anonimato",
    "es 100 % seguro",
    "imposible de reidentificar",
    "queda totalmente anónimo",
    "con riesgo cero",
    "guaranteed anonymity",
    "Anonymity is guaranteed.",
    "Velo guarantees anonymity",
    "it is 100% safe",
    "100 % secure",
    "impossible to re-identify",
    "impossible to reidentify",
    "your file becomes completely anonymous",
    "fully anonymous data",
    "a zero-risk release",
    "zero risk of exposure",
    "risk-free sharing",
    "privacidad garantizada",
    "con privacidad diferencial garantizada",
    "Velo garantiza la privacidad",
    "garantiza tu privacidad",
    "guaranteed privacy",
    "Privacy is guaranteed.",
    "Velo guarantees your privacy",
    "los datos quedan anónimos según el RGPD",
    "anónimo conforme al RGPD",
    "este archivo cumple el RGPD",
    "Velo cumple con el RGPD",
    "conforme al RGPD",
    "a GDPR compliant export",
    "GDPR-compliant output",
    "Velo complies with the GDPR",
    "the file is anonymous under GDPR",
    "anonymous according to the GDPR",
  ])("atrapa «%s»", (frase) => {
    expect(cae(frase)).toBe(true);
  });

  it.each([
    "Velo mide el riesgo de reidentificación y lo muestra tal como es.",
    "ninguna técnica de anonimización lo lleva a cero",
    "Velo measures re-identification risk and shows it as it is.",
    "no anonymization technique takes it to zero, and this tool does not claim otherwise",
    "It does not remove it and it does not declare the file anonymous.",
    "Reducing that risk is not the same as removing it",
    "That figure does not describe a fully recovered file",
    "the third party may have renamed them",
    "there is no risk figure without its caveats",
    "Ruido con garantía",
    "Noise with a guarantee",
    "Perturbación, sin garantía formal.",
    "Local differential privacy, ε = 1 per value of this field.",
    "Privacidad diferencial local, ε = 1 por valor de este campo.",
    "Seudonimizado (art. 4.5 RGPD): sigue siendo dato personal para quien tiene la llave y la bóveda.",
    "Pseudonymised (GDPR art. 4(5)): still personal data for whoever holds the key and the vault.",
    "Velo no hace el análisis de medios razonables del considerando 26.",
    "Velo does not run the means-reasonably-likely analysis of recital 26.",
    "RGPD art. 9: la salud y los datos biométricos son categorías especiales.",
    "GDPR art. 9: health and biometric data are special categories.",
    "Una política de fábrica no es una certificación de cumplimiento.",
  ])("deja pasar «%s»", (frase) => {
    expect(cae(frase)).toBe(false);
  });
});
