// @vitest-environment node
// kit v2.0.0 — regla 17. Demo en rojo del gate de cero enlaces: debe detectar la fuga de la homepage de nutri-kids
// (2026-08: el campo homepage del repo apuntaba al subdominio de Vercel de producción) y una URL en un archivo versionado.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buscarEnArbol, evaluarHomepage, leerConfig, patronDesde } from "../../scripts/cero-enlaces.mjs";

const config = leerConfig(fileURLToPath(new URL("../../cero-enlaces.json", import.meta.url))); // raíz del kit, sin depender del cwd
// Los dominios se arman por partes: este archivo está versionado y el gate (git grep) no debe detectarse a sí mismo.
const d = (a: string, b: string) => `${a}.${b}`;
const VERCEL = d("vercel", "app"), WORKERS = d("workers", "dev");
const DEFECTO = [VERCEL, WORKERS, d("pages", "dev"), d("netlify", "app"), d("github", "io"), d("onrender", "com"), d("fly", "dev"), d("herokuapp", "com")];

describe("cero-enlaces (regla 17)", () => {
  it("la configuración trae los 8 dominios por defecto y es ampliable", () => {
    expect(config.dominios).toEqual(DEFECTO);
    const ampliada = { ...config, dominios: [...config.dominios, "mi-dominio.co"] };
    expect(evaluarHomepage("https://app.mi-dominio.co", ampliada)).toBe("https://app.mi-dominio.co");
  });

  it("habría detectado la fuga de la homepage de nutri-kids (subdominio de Vercel en el campo homepage del repo)", () => {
    const fugaReal = `https://app-nutri-kids.${VERCEL}`; // valor leído del repo con gh repo view el 2026-10-06
    expect(evaluarHomepage(fugaReal, config)).toBe(fugaReal);
    expect(evaluarHomepage(`https://app-nutri-kids-git-main-mauricio.${VERCEL}/`, config)).not.toBeNull();
  });

  it("homepage vacía o apuntando al propio repo es limpia", () => {
    expect(evaluarHomepage("", config)).toBeNull();
    expect(evaluarHomepage(undefined, config)).toBeNull();
    expect(evaluarHomepage("https://github.com/mauriciorincon-ai/app-nutri-kids", config)).toBeNull();
  });

  it("detecta una URL de producción en un archivo versionado y no se delata con la forma escapada", () => {
    const dir = mkdtempSync(join(tmpdir(), "cero-enlaces-"));
    execFileSync("git", ["init", "-q"], { cwd: dir });
    writeFileSync(join(dir, "README.md"), `Demo: https://mi-app.${WORKERS}/ (fuga a propósito)\n`);
    writeFileSync(join(dir, "ci.yml"), "patrón citado como vercel[.]app — no es una URL\n");
    writeFileSync(join(dir, "pnpm-lock.yaml"), `resolved: https://registry.${VERCEL}/x\n`);
    execFileSync("git", ["add", "-A"], { cwd: dir });
    const hallazgos = buscarEnArbol(config, dir);
    expect(hallazgos).toHaveLength(1);
    expect(hallazgos[0]).toMatch(/^README\.md:1:/);
  });

  it("el patrón escapa los puntos para que cero-enlaces.json y los workflows no se detecten a sí mismos", () => {
    expect(patronDesde(config)).toBe("vercel[.]app|workers[.]dev|pages[.]dev|netlify[.]app|github[.]io|onrender[.]com|fly[.]dev|herokuapp[.]com");
  });
});
