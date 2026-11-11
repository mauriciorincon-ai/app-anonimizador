// Lo que los recorridos en inglés comparten: leer el texto que una persona ve y oye en una pantalla,
// y revisarlo contra el detector de español (ver `ingles-completo-lexico.ts`).

import type { Page } from "@playwright/test";

import type { Detector } from "./ingles-completo-lexico";

/** El texto que una persona ve y oye en la pantalla: contenido, título y atributos de lectura. */
export function textoDeLaPantalla(page: Page): Promise<string> {
  return page.evaluate(() => {
    const partes = [document.title, document.body.innerText];
    const atributos = ["aria-label", "title", "placeholder", "alt"];
    for (const elemento of document.querySelectorAll(
      atributos.map((a) => `[${a}]`).join(","),
    )) {
      for (const a of atributos) {
        const valor = elemento.getAttribute(a);
        if (valor) partes.push(valor);
      }
    }
    return partes.join("\n");
  });
}

/**
 * Quita lo que es dato y no interfaz: una muestra enmascarada (`al***e`, `Bo***á`) y el nombre de un
 * archivo (`foto-s42.jpg`, `velo-limpio-487c1b73.jpg`): ambos los pone el archivo o el nombre fijo
 * que Velo escribe, igual en los dos idiomas.
 */
export function sinDatos(texto: string): string {
  return texto
    .replace(/\S*\*+\S*/g, " ")
    .replace(
      /\S+\.(?:pdf|jpe?g|png|webp|heic|avif|csv|json|jsonl|velo|velolog|html)\b/gi,
      " ",
    );
}

/** Un revisor que junta en `fallos` cada palabra en español, con el contexto de su primera aparición. */
export function crearRevisor(detector: Detector, fallos: string[]) {
  return async (pagina: Page, donde: string) => {
    const texto = sinDatos(await textoDeLaPantalla(pagina));
    for (const palabra of detector.enEspanol(texto)) {
      // El contexto de la primera aparición: sin él, «su» en una pantalla es imposible de rastrear.
      const lugar = new RegExp(
        `.{0,40}(?<!\\p{L})${palabra}(?!\\p{L}).{0,40}`,
        "iu",
      ).exec(texto.replace(/\s+/g, " "));
      fallos.push(`${donde}: «${palabra}» en «${lugar?.[0] ?? "?"}»`);
    }
  };
}
