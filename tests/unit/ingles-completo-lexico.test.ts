// @vitest-environment node
//
// El detector de español del e2e `ingles-completo.spec.ts` es un instrumento: si no detectara nada,
// el recorrido en inglés pasaría siempre. Aquí se prueba contra frases escritas a propósito, sin
// navegador: una oración en español se marca, una en inglés no, y lo permitido se queda quieto.

import { beforeAll, describe, expect, it } from "vitest";

import {
  crearDetector,
  crearTraductor,
  palabrasDe,
  type Detector,
} from "../e2e/ingles-completo-lexico";

let detector: Detector;

beforeAll(async () => {
  detector = await crearDetector("cedula_titular,diagnostico,Bogotá");
});

describe("el diccionario sale de los catálogos, no de una lista a mano", () => {
  it("trae cientos de palabras que solo el español usa", () => {
    expect(detector.tamano).toBeGreaterThan(500);
  });

  it("marca una frase en español", () => {
    expect(detector.enEspanol("Elige la frase de paso de tu bóveda")).toEqual(
      expect.arrayContaining(["elige", "bóveda"]),
    );
  });

  it("marca una oración con palabras vacías aunque las demás existan en inglés", () => {
    expect(detector.enEspanol("Select the model para este archivo")).toEqual(
      expect.arrayContaining(["para", "este"]),
    );
  });

  it("deja pasar una frase en inglés", () => {
    expect(
      detector.enEspanol(
        "Choose the passphrase for your vault. Nothing leaves this computer.",
      ),
    ).toEqual([]);
  });

  it("deja pasar lo permitido y los valores del propio archivo", () => {
    expect(
      detector.enEspanol("Velo reads cedula_titular and diagnostico"),
    ).toEqual([]);
  });
});

describe("el traductor", () => {
  it("devuelve la cara inglesa de un texto y llena sus datos", async () => {
    const en = await crearTraductor();
    expect(en("Derivar la llave")).toMatch(/key/i);
    expect(
      en("Técnica para la columna {columna}", { columna: "edad" }),
    ).toContain("edad");
  });

  it("una frase española pegada en una cara inglesa no envenena al detector", async () => {
    // La demo en rojo del e2e: el título de /regreso quedó en español en su cara inglesa. Sus
    // palabras (`recupera`, `entregaste`) no deben pasar a contar como inglés por estar ahí.
    const detector = await crearDetector("", [
      {
        es: "Recupera lo que entregaste",
        en: "Recupera lo que entregaste",
      },
      { es: "Recupera tu archivo", en: "Get your file back" },
    ]);
    expect(detector.enEspanol("Recupera lo que entregaste")).toEqual(
      expect.arrayContaining(["recupera", "lo", "que"]),
    );
    expect(detector.enEspanol("Get your file back")).toEqual([]);
  });

  it("falla fuerte si el texto no existe en ningún catálogo", async () => {
    const en = await crearTraductor();
    expect(() => en("Un texto que ningún catálogo trae")).toThrow(
      /Ningún catálogo/,
    );
  });

  it("no elige en silencio cuando dos pantallas redactan distinto el mismo texto", async () => {
    const en = await crearTraductor();
    const titulo = "Qué cambió, y qué sigue igual";
    expect(() => en(titulo)).toThrow(/enAlguna/);
    const cualquiera = en.enAlguna(titulo);
    expect(cualquiera.test("What changed, and what stays the same")).toBe(true);
    expect(cualquiera.test("What changed, and what stayed the same")).toBe(
      true,
    );
    expect(cualquiera.test("What changed")).toBe(false);
  });
});

it("palabrasDe separa por letras y baja a minúsculas", () => {
  expect(palabrasDe("Bóveda-1 «Velo»")).toEqual(["bóveda", "velo"]);
});
