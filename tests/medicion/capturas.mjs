// Pasada de capturas del builder — el contrapeso que el método exige por tener diferido el gate ⭐.
//
// Se corre a mano contra un `pnpm start` ya levantado:
//   node tests/medicion/capturas.mjs
//
// No verifica nada: PRODUCE imágenes para mirarlas. Lo que caza esta pasada no lo ve ningún test —
// un control recortado en 412 px, un contraste que solo falla en oscuro, dos cifras ciertas que
// juntas dicen una mentira. En el S2 encontró la tercera columna del editor empujando el
// desplegable fuera de la pantalla del teléfono.

import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium, devices } from "@playwright/test";

const SALIDA = join(process.cwd(), "tmp", "capturas");
mkdirSync(SALIDA, { recursive: true });

const BASE = process.env.BASE ?? "http://localhost:3000";
const FIXTURE = join(process.cwd(), "tmp", "e2e", "clinico-2000-s42.csv");
const FRASE = "una frase larga de prueba";
const FRASE_BOVEDA = "otra frase larga, la de la boveda";

const PANTALLAS = [
  { nombre: "movil", ...devices["Pixel 7"] },
  { nombre: "escritorio", viewport: { width: 1280, height: 900 } },
];

const navegador = await chromium.launch();

for (const pantalla of PANTALLAS) {
  for (const tema of ["light", "dark"]) {
    const { nombre, ...opciones } = pantalla;
    const contexto = await navegador.newContext({
      ...opciones,
      colorScheme: tema,
    });
    const pagina = await contexto.newPage();
    const sufijo = `${nombre}-${tema}`;
    const capturar = (que) =>
      pagina.screenshot({
        path: join(SALIDA, `${que}-${sufijo}.png`),
        fullPage: true,
      });

    // 1. El regreso en reposo.
    await pagina.goto(`${BASE}/regreso`);
    await pagina.getByRole("heading", { name: /Recupera lo que/ }).waitFor();
    await capturar("regreso-reposo");

    // 2. El regreso con la bóveda rechazada.
    await pagina
      .getByLabel("Elegir el archivo de bóveda")
      .setInputFiles(FIXTURE);
    await pagina.getByLabel("Frase de paso de la bóveda").fill(FRASE);
    await pagina.getByRole("button", { name: "Abrir la bóveda" }).click();
    await pagina.locator("main").getByRole("alert").waitFor();
    await capturar("regreso-boveda-rechazada");

    // 3. El editor con el eje reversible, y el panel de la bóveda.
    await pagina.goto(`${BASE}/`);
    await pagina.setInputFiles("#archivo", FIXTURE);
    await pagina.waitForURL("**/diagnostico", { timeout: 150_000 });
    await pagina.getByRole("link", { name: "Transformar este archivo" }).click();
    await pagina.waitForURL("**/transformar");
    await pagina
      .getByLabel("Técnica para la columna cedula_titular")
      .selectOption("seudonimizar");
    await pagina.getByRole("checkbox").first().check();
    await capturar("editor-con-eje-reversible");

    await pagina.getByLabel("Frase de paso del proyecto").fill(FRASE);
    await pagina.getByRole("button", { name: "Derivar la llave" }).click();
    await pagina.getByText("Llave lista").waitFor({ timeout: 60_000 });
    await pagina.getByRole("button", { name: "Transformar", exact: true }).click();
    await pagina
      .getByRole("heading", { name: "La correspondencia para poder deshacerlo" })
      .waitFor({ timeout: 60_000 });
    await capturar("boveda-sin-sellar");

    await pagina.getByLabel("Frase de paso de la bóveda").fill(FRASE_BOVEDA);
    await pagina
      .getByRole("button", { name: "Cifrar y preparar la bóveda" })
      .click();
    await pagina
      .getByRole("link", { name: "Guardar la bóveda" })
      .waitFor({ timeout: 60_000 });
    await capturar("boveda-sellada");

    await contexto.close();
  }
}

await navegador.close();
console.log(`Capturas en ${SALIDA}`);
