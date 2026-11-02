// Pasada de capturas del builder — el conmutador de idioma (S5).
//
// Se corre a mano contra un `pnpm start` ya levantado:
//   node tests/medicion/capturas-idioma.mjs
//
// No sustituye a un test: PRODUCE imágenes para mirarlas y MIDE dos cosas que una imagen no dice.
// La regla 22 de la constitución pide que la pasada active cada control nuevo y compruebe que
// ALGO cambió (un control dibujado sin su efecto es el defecto que esa regla existe para cazar), y
// el inglés suele ser más largo que el español, así que el encabezado —donde ahora viven el
// conmutador y el sello— se mide por si se desborda en un teléfono estrecho.
//
// Sale con código distinto de cero si el conmutador no cambió nada o si algo se desbordó.

import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium, devices } from "@playwright/test";

const SALIDA = join(process.cwd(), "tmp", "capturas");
mkdirSync(SALIDA, { recursive: true });

const BASE = process.env.BASE ?? "http://localhost:3000";
const FIXTURE = join(process.cwd(), "tmp", "e2e", "clinico-2000-s42.csv");

const PANTALLAS = [
  {
    nombre: "movil-360",
    ...devices["Pixel 7"],
    viewport: { width: 360, height: 740 },
  },
  { nombre: "movil", ...devices["Pixel 7"] },
  { nombre: "escritorio", viewport: { width: 1280, height: 900 } },
];

const fallos = [];
const navegador = await chromium.launch();

for (const pantalla of PANTALLAS) {
  for (const tema of ["light", "dark"]) {
    const { nombre, ...opciones } = pantalla;
    const sufijo = `${nombre}-${tema}`;
    const contexto = await navegador.newContext({
      ...opciones,
      colorScheme: tema,
      locale: "es-CO",
    });
    const pagina = await contexto.newPage();

    const desborde = () =>
      pagina.evaluate(() => ({
        ancho: document.documentElement.clientWidth,
        contenido: document.documentElement.scrollWidth,
        encabezado: document.querySelector("header")?.scrollWidth ?? 0,
        encabezadoVisible: document.querySelector("header")?.clientWidth ?? 0,
      }));
    const mide = async (donde) => {
      const d = await desborde();
      if (d.contenido > d.ancho + 1 || d.encabezado > d.encabezadoVisible + 1)
        fallos.push(
          `${sufijo} · ${donde}: desborde horizontal ${JSON.stringify(d)}`,
        );
    };
    const lang = () => pagina.evaluate(() => document.documentElement.lang);
    const pie = () => pagina.locator("footer p").first().innerText();

    // 1. La aduana en español, tal como llega.
    await pagina.goto(`${BASE}/`);
    await pagina.getByRole("group", { name: "Idioma · Language" }).waitFor();
    const lemaEs = await pie();
    await mide("aduana-es");
    await pagina.screenshot({
      path: join(SALIDA, `idioma-aduana-es-${sufijo}.png`),
      fullPage: true,
    });

    // 2. Se ACTIVA el control y se comprueba que algo cambió (regla 22).
    await pagina.getByRole("button", { name: "English" }).click();
    await pagina.waitForFunction(
      () => document.documentElement.lang === "en-US",
    );
    const lemaEn = await pie();
    if (lemaEn === lemaEs)
      fallos.push(`${sufijo}: el conmutador no cambió el texto del pie`);
    if ((await lang()) !== "en-US")
      fallos.push(`${sufijo}: el lang no pasó a en-US`);
    await mide("aduana-en");
    await pagina.screenshot({
      path: join(SALIDA, `idioma-aduana-en-${sufijo}.png`),
      fullPage: true,
    });

    // 3. El encabezado solo, de cerca (es lo que cambió a la vista).
    await pagina
      .locator("header")
      .screenshot({ path: join(SALIDA, `idioma-encabezado-en-${sufijo}.png`) });
    await pagina.getByRole("button", { name: "Español" }).click();
    await pagina.waitForFunction(
      () => document.documentElement.lang === "es-CO",
    );
    await pagina
      .locator("header")
      .screenshot({ path: join(SALIDA, `idioma-encabezado-es-${sufijo}.png`) });

    // 4. El diagnóstico en inglés con un archivo sintético: textos largos, tabla, cifras con coma.
    await pagina.getByRole("button", { name: "English" }).click();
    await pagina.setInputFiles("#archivo", FIXTURE);
    await pagina.waitForURL("**/diagnostico");
    await pagina.getByRole("heading", { level: 1 }).waitFor();
    await mide("diagnostico-en");
    await pagina.screenshot({
      path: join(SALIDA, `idioma-diagnostico-en-${sufijo}.png`),
      fullPage: true,
    });

    await contexto.close();
  }
}

await navegador.close();

if (fallos.length) {
  console.error(`✗ ${fallos.length} problema(s):\n  ${fallos.join("\n  ")}`);
  process.exit(1);
}
console.log(
  `✓ el conmutador cambia el texto y el lang, y nada se desborda · imágenes en ${SALIDA}`,
);
