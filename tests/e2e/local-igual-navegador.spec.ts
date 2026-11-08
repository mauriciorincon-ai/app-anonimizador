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
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { serializarBoveda } from "@/engine/boveda";
import { abrirBoveda } from "@/lib/boveda-archivo";

import { principal } from "../../velo-local/cli";
import { DIRECTORIO_DE_FIXTURES, nombreDeFixture } from "./global-setup";

const EUROPEO = nombreDeFixture("europeo", 1_500, 42);
const FRASE = "una frase larga del gate entre runtimes";
const FRASE_DE_BOVEDA = "la frase de la boveda del gate";
const AHORA = new Date("2026-11-07T15:30:00Z");

const huella = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

test("la web y Velo local dan los mismos bytes: anonimizado, bóveda y certificado", async ({
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
  await page.setInputFiles("#archivo", EUROPEO);
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
      EUROPEO,
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
  const bytesLocal = readFileSync(de(/^velo-anonimizado-.+\.csv$/));
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
