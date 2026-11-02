#!/usr/bin/env node
// kit v2.0.0 — regla 17 (cero enlaces): la producción se MUESTRA, jamás se ENTREGA.
// Barre DOS superficies: (1) todo archivo versionado (`git grep`) y (2) el campo `homepage` del repo en GitHub —
// la fuga de nutri-kids (2026-08) vivía ahí, no en un archivo. Los dominios salen de `cero-enlaces.json` (ampliable por app).
// Uso en CI:  node scripts/cero-enlaces.mjs --homepage "$(gh api repos/$GITHUB_REPOSITORY --jq '.homepage // ""')"
// Uso local:  node scripts/cero-enlaces.mjs [--config <ruta>] [--homepage <valor>]   (sin --homepage solo barre el árbol)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const escapar = (d) => d.replace(/[.]/g, "[.]");

export function leerConfig(ruta = "cero-enlaces.json") {
  const c = JSON.parse(readFileSync(ruta, "utf8"));
  if (!Array.isArray(c.dominios) || c.dominios.length === 0) throw new Error("cero-enlaces.json: `dominios` vacío");
  return { dominios: c.dominios, excluir: Array.isArray(c.excluir) ? c.excluir : [] };
}

/** Patrón ERE: el punto va como clase de carácter para que los archivos que lo citan no se delaten a sí mismos. */
export function patronDesde(config) {
  return config.dominios.map(escapar).join("|");
}

/** Superficie 1: archivos versionados. Devuelve las líneas `ruta:línea:texto` que delatan. */
export function buscarEnArbol(config, cwd = process.cwd()) {
  const args = ["grep", "-nIE", patronDesde(config), "--", ".", ...config.excluir.map((e) => `:!${e}`)];
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8" }).split("\n").filter(Boolean);
  } catch (e) {
    if (e.status === 1) return []; // git grep: 1 = sin coincidencias
    throw e;
  }
}

/** Superficie 2: el campo homepage del repo. Delata si contiene un dominio de hosting. Vacío o el propio repo = limpio. */
export function evaluarHomepage(homepage, config) {
  const h = (homepage ?? "").trim();
  if (!h) return null;
  const re = new RegExp(patronDesde(config), "i");
  return re.test(h) ? h : null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf("--homepage");
  const homepage = i > -1 ? process.argv[i + 1] : process.env.CERO_ENLACES_HOMEPAGE;
  const j = process.argv.indexOf("--config");
  const config = leerConfig(j > -1 ? process.argv[j + 1] : "cero-enlaces.json");
  const arbol = buscarEnArbol(config);
  const fugaHomepage = evaluarHomepage(homepage, config);
  let rojo = false;
  if (arbol.length) {
    rojo = true;
    console.error(`::error::cero enlaces: ${arbol.length} línea(s) con dominio de producción en archivos versionados:`);
    for (const l of arbol) console.error("  " + l);
  }
  if (fugaHomepage) {
    rojo = true;
    console.error(`::error::cero enlaces: el campo homepage del repo apunta a producción (${fugaHomepage}); debe ser vacío o el propio repo: gh repo edit --homepage ""`);
  }
  if (rojo) process.exit(1);
  const homepageDada = i > -1 || process.env.CERO_ENLACES_HOMEPAGE !== undefined;
  console.log(`cero enlaces: árbol limpio (${config.dominios.length} dominios) · homepage ${homepageDada ? (homepage ? "limpia (propio repo)" : "limpia (vacía)") : "no verificada (sin --homepage)"}`);
}
