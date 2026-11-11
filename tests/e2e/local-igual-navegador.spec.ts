// GATE «VELO LOCAL = NAVEGADOR», CON CHROMIUM DE VERDAD (S9, regla dura nº3, ADR-017).
//
// El mismo archivo del kit, la misma política de fábrica (RGPD, con cédulas reversibles), la misma
// frase, la MISMA sal y el mismo idioma, por los dos caminos: la web —el worker en Chromium, por la
// UI, como una persona— y `pnpm velo anonimizar` —Node, por pasadas—. El anonimizado tiene que ser
// el mismo, byte a byte; la bóveda, la misma en claro (lleva un IV nuevo cada vez, ADR-006); y el
// certificado, el mismo documento con la misma fecha. La sal se lee de la pantalla, donde la web la
// enseña para eso: sin ella, la misma frase daría otra llave.
//
// Velo local corre aquí mismo, en el proceso de la prueba, con la orden real (`principal`): así el
// reloj del certificado se puede fijar, igual que el de la página.

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { serializarBoveda } from "@/engine/boveda";
import { abrirBoveda } from "@/lib/boveda-archivo";

import { principal } from "../../velo-local/cli";
import {
  DIRECTORIO_DE_FIXTURES,
  FIXTURE_ANIDADO_JSONL,
  nombreDeFixture,
} from "./global-setup";

const EUROPEO = nombreDeFixture("europeo", 1_500, 42);
const REV5 = nombreDeFixture("jerarquias-rev5", 1_500, 42);

/** El mismo gate para un CSV y para un JSON Lines (S9: el JSON entra por el mismo motor). */
const CASOS = [
  ["un CSV", EUROPEO, "csv"],
  ["un JSON Lines", FIXTURE_ANIDADO_JSONL, "jsonl"],
] as const;
const FRASE = "una frase larga del gate entre runtimes";
const FRASE_DE_BOVEDA = "la frase de la boveda del gate";
const AHORA = new Date("2026-11-07T15:30:00Z");

const huella = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

for (const [que, ARCHIVO, extension] of CASOS)
  test(`la web y Velo local dan los mismos bytes con ${que}: anonimizado, bóveda y certificado`, async ({
    page,
  }, info) => {
    test.skip(
      info.project.name !== "desktop-chromium",
      "el gate entre runtimes corre en un solo proyecto",
    );
    test.setTimeout(180_000);

    // ── La web ─────────────────────────────────────────────────────────────────────────────────
    await page.clock.setFixedTime(AHORA);
    await page.addInitScript(() => {
      delete (window as Window & { showSaveFilePicker?: unknown })
        .showSaveFilePicker;
    });
    await page.goto("/");
    await page.setInputFiles("#archivo", ARCHIVO);
    await page.waitForURL("**/diagnostico", { timeout: 60_000 });
    await page.getByRole("link", { name: "Transformar este archivo" }).click();
    await page.waitForURL("**/transformar");
    await page.getByRole("button", { name: /RGPD/ }).click();
    await page.getByLabel("Frase de paso del proyecto").fill(FRASE);
    await page.getByRole("button", { name: "Derivar la llave" }).click();
    await page
      .getByRole("heading", { name: "Llave lista" })
      .waitFor({ timeout: 60_000 });
    const sal = (
      await page
        .locator("dt", { hasText: /^Sal/ })
        .locator("xpath=following-sibling::dd")
        .innerText()
    ).trim();
    expect(sal).toMatch(/^[0-9a-f]{32}$/);

    await page
      .getByRole("button", { name: "Transformar", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Qué cambió, y qué sigue igual" })
      .waitFor({ timeout: 60_000 });
    await page.getByRole("button", { name: "Preparar el archivo" }).click();
    const guardar = page.getByRole("link", {
      name: /^Guardar velo-anonimizado-/,
    });
    await guardar.waitFor({ timeout: 60_000 });
    const [csvWeb] = await Promise.all([
      page.waitForEvent("download"),
      guardar.click(),
    ]);
    const bytesWeb = readFileSync((await csvWeb.path())!);

    const [certificadoWeb] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "Descargar el certificado" })
        .click({ timeout: 60_000 }),
    ]);
    const certificadoDeLaWeb = readFileSync(
      (await certificadoWeb.path())!,
      "utf8",
    );

    await page.getByLabel("Frase de paso de la bóveda").fill(FRASE_DE_BOVEDA);
    await page
      .getByRole("button", { name: "Cifrar y preparar la bóveda" })
      .click();
    const [bovedaWeb] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("link", { name: "Guardar la bóveda" })
        .click({ timeout: 60_000 }),
    ]);
    const bovedaDeLaWeb = readFileSync((await bovedaWeb.path())!);

    // ── Velo local ─────────────────────────────────────────────────────────────────────────────
    const salida = mkdtempSync(join(DIRECTORIO_DE_FIXTURES, "velo-local-"));
    process.env.VELO_FRASE = FRASE;
    process.env.VELO_FRASE_BOVEDA = FRASE_DE_BOVEDA;
    const avisos: string[] = [];
    const codigo = await principal(
      [
        "anonimizar",
        ARCHIVO,
        "--politica",
        "rgpd",
        "--sal",
        sal,
        "--salida",
        salida,
        "--idioma",
        "es",
      ],
      { salida: (l) => void avisos.push(l), aviso: (l) => void avisos.push(l) },
      () => AHORA,
    );
    delete process.env.VELO_FRASE;
    delete process.env.VELO_FRASE_BOVEDA;
    expect(codigo, avisos.join("\n")).toBe(0);
    const archivos = readdirSync(salida);
    const de = (patron: RegExp) =>
      join(
        salida,
        archivos.find((a) => patron.test(a))!,
      );

    // ── Los mismos bytes ───────────────────────────────────────────────────────────────────────
    const bytesLocal = readFileSync(
      de(new RegExp(`^velo-anonimizado-.+\\.${extension}$`)),
    );
    expect(csvWeb.suggestedFilename()).toBe(
      archivos.find((a) => a.startsWith("velo-anonimizado-")),
    );
    expect(huella(bytesLocal)).toBe(huella(bytesWeb));

    const certificadoLocal = readFileSync(
      de(/^velo-certificado-.+\.html$/),
      "utf8",
    );
    expect(certificadoLocal).toBe(certificadoDeLaWeb);

    const [web, local] = await Promise.all([
      abrirBoveda(new Uint8Array(bovedaDeLaWeb), FRASE_DE_BOVEDA),
      abrirBoveda(new Uint8Array(readFileSync(de(/\.velo$/))), FRASE_DE_BOVEDA),
    ]);
    expect(web.ok && local.ok).toBe(true);
    if (web.ok && local.ok)
      expect(serializarBoveda(local.boveda)).toBe(serializarBoveda(web.boveda));
  });

// S13: el camino contrario. La sal no la enseña la web: la TRAE el usuario (de otro mes, de su
// gestor de contraseñas) y la pega en el campo; la misma sal va a `--sal` en Velo local. Con la
// misma frase, el anonimizado tiene que salir byte a byte igual por los dos caminos.
test("la web con la sal pegada y Velo local con --sal dan los mismos bytes", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop-chromium",
    "el gate entre runtimes corre en un solo proyecto",
  );
  test.setTimeout(180_000);
  const SAL_TRAIDA = "5a1e0f3c9b7d42e68c10a4f2d3b9e7c1";

  await page.clock.setFixedTime(AHORA);
  await page.addInitScript(() => {
    delete (window as Window & { showSaveFilePicker?: unknown })
      .showSaveFilePicker;
  });
  await page.goto("/");
  await page.setInputFiles("#archivo", EUROPEO);
  await page.waitForURL("**/diagnostico", { timeout: 60_000 });
  await page.getByRole("link", { name: "Transformar este archivo" }).click();
  await page.waitForURL("**/transformar");
  await page.getByRole("button", { name: /RGPD/ }).click();
  await page.getByLabel("Frase de paso del proyecto").fill(FRASE);
  await page.getByLabel("¿Vuelves a un proyecto? Pega su sal").fill(SAL_TRAIDA);
  await page.getByRole("button", { name: "Derivar la llave" }).click();
  await page
    .getByRole("heading", { name: "Llave lista" })
    .waitFor({ timeout: 60_000 });
  // La sal que la pantalla enseña es la pegada, no una nueva.
  await expect(
    page
      .locator("dt", { hasText: /^Sal/ })
      .locator("xpath=following-sibling::dd"),
  ).toHaveText(SAL_TRAIDA);

  await page.getByRole("button", { name: "Transformar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Qué cambió, y qué sigue igual" })
    .waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: "Preparar el archivo" }).click();
  const guardar = page.getByRole("link", {
    name: /^Guardar velo-anonimizado-/,
  });
  await guardar.waitFor({ timeout: 60_000 });
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    guardar.click(),
  ]);
  const bytesWeb = readFileSync((await descarga.path())!);

  const salida = mkdtempSync(join(DIRECTORIO_DE_FIXTURES, "velo-local-sal-"));
  process.env.VELO_FRASE = FRASE;
  process.env.VELO_FRASE_BOVEDA = FRASE_DE_BOVEDA;
  const avisos: string[] = [];
  const codigo = await principal(
    [
      "anonimizar",
      EUROPEO,
      "--politica",
      "rgpd",
      "--sal",
      SAL_TRAIDA,
      "--salida",
      salida,
      "--idioma",
      "es",
    ],
    { salida: (l) => void avisos.push(l), aviso: (l) => void avisos.push(l) },
    () => AHORA,
  );
  delete process.env.VELO_FRASE;
  delete process.env.VELO_FRASE_BOVEDA;
  expect(codigo, avisos.join("\n")).toBe(0);
  const nombre = readdirSync(salida).find((a) =>
    /^velo-anonimizado-.+\.csv$/.test(a),
  )!;
  expect(huella(readFileSync(join(salida, nombre)))).toBe(huella(bytesWeb));
});

// S11: la generalización óptima con TOPE DE SUPRESIÓN y la escalera CIIU Rev. 5, por los dos caminos.
// La política llega a la web importada desde un archivo y a Velo local con `--politica` sobre el
// mismo archivo: las filas que salen, el nivel de cada columna y el certificado tienen que coincidir.
test("la web y Velo local dan los mismos bytes con tope de supresión y la CIIU Rev. 5", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop-chromium",
    "el gate entre runtimes corre en un solo proyecto",
  );
  test.setTimeout(180_000);
  const carpeta = mkdtempSync(join(DIRECTORIO_DE_FIXTURES, "velo-supresion-"));
  const rutaDePolitica = join(carpeta, "politica-supresion.json");
  writeFileSync(
    rutaDePolitica,
    JSON.stringify({
      version: 1,
      origen: "manual",
      kObjetivo: 10,
      reglas: [
        {
          columna: "cedula_titular",
          tecnica: { tipo: "seudonimizar", longitud: 12 },
        },
        { columna: "edad", tecnica: { tipo: "generalizar-automatico" } },
        {
          columna: "codigo_municipio",
          tecnica: { tipo: "generalizar-automatico" },
        },
        {
          columna: "actividad_ciiu5",
          tecnica: { tipo: "generalizar-automatico" },
        },
        { columna: "sexo", tecnica: { tipo: "conservar" } },
      ],
      generalizacion: {
        algoritmo: "optima",
        jerarquias: {
          edad: { tipo: "edad-dane" },
          codigo_municipio: { tipo: "divipola" },
          actividad_ciiu5: { tipo: "ciiu5" },
        },
        supresionMaxima: 3,
      },
    }),
  );

  // ── La web ───────────────────────────────────────────────────────────────────────────────────
  await page.clock.setFixedTime(AHORA);
  await page.addInitScript(() => {
    delete (window as Window & { showSaveFilePicker?: unknown })
      .showSaveFilePicker;
  });
  await page.goto("/");
  await page.setInputFiles("#archivo", REV5);
  await page.waitForURL("**/diagnostico", { timeout: 60_000 });
  await page.getByRole("link", { name: "Transformar este archivo" }).click();
  await page.waitForURL("**/transformar");
  await page.setInputFiles(
    'input[aria-label="Importar una política desde un archivo"]',
    rutaDePolitica,
  );
  await expect(
    page.getByLabel(
      "Escalera de generalización para la columna actividad_ciiu5",
    ),
  ).toHaveValue("ciiu5");
  await expect(
    page.getByLabel("Tope de supresión (opcional), en % de las filas"),
  ).toHaveValue("3");
  await page.getByLabel("Frase de paso del proyecto").fill(FRASE);
  await page.getByRole("button", { name: "Derivar la llave" }).click();
  await page
    .getByRole("heading", { name: "Llave lista" })
    .waitFor({ timeout: 60_000 });
  const sal = (
    await page
      .locator("dt", { hasText: /^Sal/ })
      .locator("xpath=following-sibling::dd")
      .innerText()
  ).trim();
  await page.getByRole("button", { name: "Transformar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Qué cambió, y qué sigue igual" })
    .waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: "Preparar el archivo" }).click();
  const guardar = page.getByRole("link", {
    name: /^Guardar velo-anonimizado-/,
  });
  await guardar.waitFor({ timeout: 60_000 });
  const [csvWeb] = await Promise.all([
    page.waitForEvent("download"),
    guardar.click(),
  ]);
  const bytesWeb = readFileSync((await csvWeb.path())!);
  const [certificadoWeb] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: "Descargar el certificado" })
      .click({ timeout: 60_000 }),
  ]);
  const certificadoDeLaWeb = readFileSync(
    (await certificadoWeb.path())!,
    "utf8",
  );

  // ── Velo local ───────────────────────────────────────────────────────────────────────────────
  const salida = mkdtempSync(join(carpeta, "local-"));
  process.env.VELO_FRASE = FRASE;
  const avisos: string[] = [];
  const codigo = await principal(
    [
      "anonimizar",
      REV5,
      "--politica",
      rutaDePolitica,
      "--sal",
      sal,
      "--salida",
      salida,
      "--idioma",
      "es",
    ],
    { salida: (l) => void avisos.push(l), aviso: (l) => void avisos.push(l) },
    () => AHORA,
  );
  delete process.env.VELO_FRASE;
  expect(codigo, avisos.join("\n")).toBe(0);
  const archivos = readdirSync(salida);
  const de = (patron: RegExp) =>
    join(
      salida,
      archivos.find((a) => patron.test(a))!,
    );

  // ── Los mismos bytes, y de verdad salieron filas ─────────────────────────────────────────────
  expect(huella(readFileSync(de(/^velo-anonimizado-.+\.csv$/)))).toBe(
    huella(bytesWeb),
  );
  expect(readFileSync(de(/^velo-certificado-.+\.html$/), "utf8")).toBe(
    certificadoDeLaWeb,
  );
  const filasDeSalida =
    bytesWeb.toString("utf8").trimEnd().split("\n").length - 1;
  expect(filasDeSalida).toBeLessThan(1_500);
  expect(filasDeSalida).toBeGreaterThanOrEqual(
    1_500 - Math.floor(1_500 * 0.03),
  );
  expect(certificadoDeLaWeb).toContain("Salieron del archivo de salida");
  expect(certificadoDeLaWeb).toContain("CIIU_5_AC_Estructura_detallada.xlsx");
});
