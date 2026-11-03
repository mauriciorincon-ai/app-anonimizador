// Pasada de capturas del Sprint 008 — el alto volumen y el RGPD, en español, en los dos temas y en
// móvil y escritorio. El contrapeso que el método exige por tener diferido el gate ⭐: PRODUCE
// imágenes para mirarlas, y además mide lo que una imagen no dice (que ninguna pantalla se
// desborde hacia los lados en 412 px).
//
// Se corre a mano contra un `pnpm start` ya levantado, con los fixtures de los e2e generados
// (`tmp/e2e/`, los crea `pnpm test:e2e`):
//   node tests/medicion/capturas-s8.mjs
//
// Todo el dato es sintético: sale del kit sembrado.

import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium, devices } from "@playwright/test";

const SALIDA = join(process.cwd(), "tmp", "capturas-s8");
mkdirSync(SALIDA, { recursive: true });

const BASE = process.env.BASE ?? "http://127.0.0.1:3300";
const EUROPEO = join(process.cwd(), "tmp", "e2e", "europeo-1500-s42.csv");
const ANCHO = join(process.cwd(), "tmp", "e2e", "ancho-100000-s42.csv");
const FRASE = "una frase larga de prueba";

const PANTALLAS = [
  { nombre: "movil", ...devices["Pixel 7"] },
  { nombre: "escritorio", viewport: { width: 1280, height: 900 } },
];

const desbordes = [];
const navegador = await chromium.launch();

for (const pantalla of PANTALLAS) {
  for (const tema of ["light", "dark"]) {
    const { nombre, ...opciones } = pantalla;
    // El idioma sale del navegador (`navigator.language`): sin `locale`, Playwright usa en-US y las
    // capturas saldrían en inglés. Esta pasada es en español.
    const contexto = await navegador.newContext({
      ...opciones,
      locale: "es-CO",
      colorScheme: tema,
    });
    const pagina = await contexto.newPage();
    const sufijo = `${nombre}-${tema}`;
    const capturar = async (que) => {
      await pagina.screenshot({ path: join(SALIDA, `${que}-${sufijo}.png`), fullPage: true });
      // El color nunca solo, y nada se sale por la derecha: el ancho del documento no pasa del de la ventana.
      const { ancho, ventana } = await pagina.evaluate(() => ({
        ancho: document.documentElement.scrollWidth,
        ventana: document.documentElement.clientWidth,
      }));
      if (ancho > ventana) desbordes.push(`${que}-${sufijo}: ${ancho} > ${ventana}`);
    };

    // El archivo ancho tiene 210 columnas: una captura de página entera mide más de 100 000 px y
    // Chromium la pinta con huecos. Para el alto volumen se captura el PANEL que se quiere mirar.
    const capturarPanel = async (que, encabezado) => {
      const panel = pagina
        .locator("section")
        .filter({ has: pagina.getByRole("heading", { name: encabezado }) })
        .first();
      await panel.screenshot({ path: join(SALIDA, `${que}-${sufijo}.png`) });
      const { ancho, ventana } = await pagina.evaluate(() => ({
        ancho: document.documentElement.scrollWidth,
        ventana: document.documentElement.clientWidth,
      }));
      if (ancho > ventana) desbordes.push(`${que}-${sufijo}: ${ancho} > ${ventana}`);
    };

    // ── El RGPD ──
    await pagina.goto(`${BASE}/`);
    await pagina.setInputFiles("#archivo", EUROPEO);
    await pagina.waitForURL("**/diagnostico", { timeout: 150_000 });
    // En 412 px la tabla de columnas puede ser otra estructura: se espera la primera coincidencia VISIBLE.
    await pagina
      .getByText(/Steuer-IdNr \(Alemania\)/)
      .filter({ visible: true })
      .first()
      .waitFor();
    await capturar("rgpd-diagnostico");

    await pagina.getByRole("link", { name: "Transformar este archivo" }).click();
    await pagina.waitForURL("**/transformar");
    await pagina.getByRole("button", { name: /RGPD/ }).click();
    await pagina.getByText("Qué cubre, artículo por artículo").waitFor();
    await capturar("rgpd-politica");

    await pagina.getByLabel("Frase de paso del proyecto").fill(FRASE);
    await pagina.getByRole("button", { name: "Derivar la llave" }).click();
    await pagina.getByRole("heading", { name: "Llave lista" }).waitFor({ timeout: 60_000 });
    await pagina.getByRole("button", { name: "Transformar", exact: true }).click();
    await pagina
      .getByRole("heading", { name: "Qué cambió, y qué sigue igual" })
      .waitFor({ timeout: 60_000 });
    await capturar("rgpd-resultado");

    // ── El alto volumen ──
    await pagina.goto(`${BASE}/`);
    await pagina.setInputFiles("#archivo", ANCHO);
    await pagina.waitForURL("**/diagnostico", { timeout: 300_000 });
    await pagina
      .getByRole("heading", { name: "Este archivo se leyó por pasadas" })
      .waitFor({ timeout: 60_000 });
    await capturarPanel("alto-volumen-diagnostico", "Este archivo se leyó por pasadas");

    await pagina.getByRole("link", { name: "Transformar este archivo" }).click();
    await pagina.waitForURL("**/transformar");
    await pagina.getByRole("button", { name: /Habeas Data/ }).click();
    await pagina.getByLabel("Frase de paso del proyecto").fill(FRASE);
    await pagina.getByRole("button", { name: "Derivar la llave" }).click();
    await pagina.getByRole("heading", { name: "Llave lista" }).waitFor({ timeout: 60_000 });
    await pagina.getByRole("button", { name: "Transformar", exact: true }).click();
    await pagina
      .getByRole("heading", { name: "Qué cambió, y qué sigue igual" })
      .waitFor({ timeout: 300_000 });
    await capturarPanel("alto-volumen-entrega", "Llévate el archivo");

    await contexto.close();
  }
}

await navegador.close();
console.log(`Capturas en ${SALIDA}`);
if (desbordes.length > 0) {
  console.log("DESBORDES:\n" + desbordes.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Ninguna captura se desborda hacia los lados.");
}
