// Los servidores de Velo escuchan en 127.0.0.1:3300 y en ningún otro sitio (regla de la casa,
// 2026-11-02): el 3000 y el 3100 son de otras apps, y un `next start` sin `-H` escucha en todas las
// interfaces. Esta prueba lee los archivos que levantan o apuntan a un servidor y falla si alguno
// vuelve a `localhost`, al 3000 o a un arranque sin host.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), "utf8");

/** Los archivos versionados que apuntan a un servidor, y el ejemplo de uso que no cuenta. */
const APUNTAN_A_UN_SERVIDOR = [
  "playwright.config.ts",
  ".github/workflows/ci.yml",
  "scripts/capturas-brochure.mjs",
  "scripts/demo-rojo.sh",
  "tests/medicion/capturas.mjs",
  "tests/medicion/capturas-idioma.mjs",
  "README.md",
];

describe("los servidores locales", () => {
  const paquete = JSON.parse(leer("package.json")) as {
    scripts: Record<string, string>;
  };

  it("`start` y `dev` escuchan solo en 127.0.0.1, en el 3300", () => {
    for (const orden of ["start", "dev"]) {
      expect(paquete.scripts[orden], orden).toMatch(
        /\bnext (start|dev)\b.*-H 127\.0\.0\.1\b.*-p 3300\b/,
      );
    }
  });

  it("Playwright prueba contra 127.0.0.1:3300 y no reutiliza un servidor ajeno", () => {
    const config = leer("playwright.config.ts");
    expect(config).toContain('baseURL: "http://127.0.0.1:3300"');
    expect(config).toContain('url: "http://127.0.0.1:3300"');
    expect(config).toContain("reuseExistingServer: false");
  });

  it("Lighthouse mide contra 127.0.0.1:3300", () => {
    expect(leer(".github/workflows/ci.yml")).toContain(
      "--url=http://127.0.0.1:3300",
    );
  });

  it("ningún archivo versionado apunta a localhost:3000 ni al 3000", () => {
    for (const ruta of APUNTAN_A_UN_SERVIDOR) {
      const texto = leer(ruta);
      expect(texto, ruta).not.toMatch(/localhost:3000|127\.0\.0\.1:3000\b/);
      expect(texto, ruta).not.toMatch(/--puerto 3000\b/);
    }
  });

  it("ningún archivo versionado arranca `next start` o `next dev` sin host y puerto", () => {
    const versionados = execFileSync("git", ["ls-files"], {
      cwd: RAIZ,
      encoding: "utf8",
    })
      .split("\n")
      .filter((r) => /\.(json|ya?ml|mjs|cjs|sh|ts|tsx)$/.test(r))
      .filter(
        (r) =>
          !r.startsWith("tests/unit/servidores-locales") &&
          !r.startsWith("sprints/") &&
          !r.startsWith(".claude/") &&
          r !== "pnpm-lock.yaml",
      );
    const sueltos: string[] = [];
    for (const ruta of versionados) {
      let texto: string;
      try {
        texto = leer(ruta);
      } catch {
        continue;
      }
      for (const linea of texto.split("\n")) {
        // Un comentario que nombra el comando no lo ejecuta.
        if (/^\s*(\/\/|#|\*)/.test(linea)) continue;
        if (
          /["'`\s]next (start|dev)\b/.test(linea) &&
          !/-H 127\.0\.0\.1/.test(linea)
        )
          sueltos.push(`${ruta}: ${linea.trim()}`);
      }
    }
    expect(sueltos).toEqual([]);
  });
});
