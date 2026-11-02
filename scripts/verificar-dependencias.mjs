#!/usr/bin/env node
// Regla 18 del kit (v1.32.0): ningún paquete queda POR DEBAJO de `main` al mergear dependencias.
// pnpm degrada en silencio al resolver un lockfile en conflicto y la CI pasa verde porque ninguna
// puerta compara el resultado contra la INTENCIÓN del PR. Este script es esa puerta: lee las versiones
// de pnpm-lock.yaml en el árbol actual y en origin/main y falla si alguna bajó.
// Uso: node scripts/verificar-dependencias.mjs [rama-base]   (default: origin/main)
// En CI corre solo en pull_request, tras `git fetch origin main --depth=1`.
// kit v1.37.0 (portado de planlang S2): una degradación A PROPÓSITO (p. ej. @types/node 26 → 22 para seguir al Node de la CI)
// se declara en scripts/degradaciones-permitidas.json con {nombre, de, a, razon}; solo pasa la
// coincidencia exacta de las tres primeras.
// Auditoría del S2 (AU-S2-B37): una entrada que ya no aplica FALLA (bórrala: si no, mañana cubriría una degradación
// que nadie revisó); en CI, una base que no se puede leer FALLA (antes «se omitía» y salía verde); y se compara cada
// línea mayor que las dos orillas tienen, no solo la versión más alta (dos copias de un paquete: la vieja también).
// kit v1.39.0 (Big-D, PR #6 de dependabot, 2026-10-04) — BAJADA FORZADA: a veces el bump trae un paquete que FIJA una
// versión exacta más vieja que la de main (vitest 5.0.3 fija why-is-node-running 3.2.1; la 5.0.2 pedía ^3.2.1). Esa
// bajada es la intención del PR, no pnpm degradando: se acepta sin declararla SOLO si algún paquete del lockfile del
// PR que usa esa versión la declara EXACTA en el registro (`npm view`), y se nombra quién. Un rango que admite la
// versión de main, sin dependiente o sin registro, sigue en rojo (o va a degradaciones-permitidas.json con su razón).
import { execFileSync, execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Versiones por paquete en la sección `packages:` del lockfile (v6 y v9: claves `/nombre@ver` o `nombre@ver:`). */
export function versiones(texto) {
  const out = new Map();
  let dentro = false;
  for (const linea of texto.split("\n")) {
    if (/^packages:\s*$/.test(linea)) {
      dentro = true;
      continue;
    }
    if (dentro && /^[A-Za-z]/.test(linea)) dentro = false; // otra sección de primer nivel
    if (!dentro) continue;
    const m = linea.match(
      /^  ['"]?\/?((?:@[^/@'"]+\/)?[^/@'"]+)@([0-9][^('":\s]*)/,
    );
    if (!m) continue;
    const [, nombre, ver] = m;
    if (!out.has(nombre)) out.set(nombre, []);
    out.get(nombre).push(ver);
  }
  return out;
}
const num = (v) =>
  v
    .split(/[-+]/)[0]
    .split(".")
    .map((x) => parseInt(x, 10) || 0);
const cmp = (a, b) => {
  const A = num(a),
    B = num(b);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const d = (A[i] ?? 0) - (B[i] ?? 0);
    if (d) return d;
  }
  return 0;
};
const mayor = (vs) => vs.reduce((m, v) => (cmp(v, m) > 0 ? v : m));
const linea = (v) => num(v)[0];

/**
 * Los paquetes de la sección `snapshots:` (lockfile v9) que resuelven `nombre` a `version`: `{ nombre, version }` de
 * cada dependiente, sin el sufijo de pares. (kit v1.39.0)
 */
export function dependientes(texto, nombre, version) {
  const out = [];
  let dentro = false;
  let actual = null;
  for (const l of texto.split("\n")) {
    if (/^snapshots:\s*$/.test(l)) {
      dentro = true;
      continue;
    }
    if (dentro && /^[A-Za-z]/.test(l)) dentro = false;
    if (!dentro) continue;
    const clave = l.match(/^  ['"]?((?:@[^/@'"]+\/)?[^/@'"]+)@([0-9][^('":\s]*)/);
    if (clave) {
      actual = { nombre: clave[1], version: clave[2] };
      continue;
    }
    const dep = l.match(/^      ['"]?((?:@[^/@'"]+\/)?[^'":\s]+)['"]?: ['"]?([0-9][^('"\s]*)/);
    if (
      actual &&
      dep &&
      dep[1] === nombre &&
      dep[2] === version &&
      !out.some((d) => d.nombre === actual.nombre && d.version === actual.version)
    )
      out.push(actual);
  }
  return out;
}

/** El rango que `dependiente@version` declara para `nombre`, según el registro (`npm view`). (kit v1.39.0) */
export function rangoEnElRegistro(dependiente, version, nombre) {
  const salida = execFileSync(
    "npm",
    ["view", `${dependiente}@${version}`, "dependencies", "optionalDependencies", "--json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const json = JSON.parse(salida || "{}");
  const campos =
    "dependencies" in json || "optionalDependencies" in json
      ? [json.dependencies, json.optionalDependencies]
      : [json];
  for (const c of campos) if (c && typeof c[nombre] === "string") return c[nombre];
  return null;
}

const exacta = (rango, version) => rango !== null && rango.trim().replace(/^=/, "") === version;

/**
 * Compara dos lockfiles. Una degradación es: la versión más alta del paquete bajó, o bajó la más alta de una línea
 * mayor que siguen teniendo las dos orillas. Devuelve las degradaciones sin permiso, las permitidas que se usaron (con
 * su razón), las BAJADAS FORZADAS aceptadas (un paquete del PR las fija exactas; `consultar` es inyectable en pruebas)
 * y las permitidas que ya no aplican.
 */
export function revisar({
  lockBase,
  lockPR,
  permitidas,
  base = "origin/main",
  consultar = rangoEnElRegistro,
}) {
  const enBase = versiones(lockBase),
    enPR = versiones(lockPR);
  const usadas = new Set();
  const degradados = [];
  const aceptados = [];
  const forzados = [];
  for (const [nombre, vsBase] of enBase) {
    const vsPR = enPR.get(nombre);
    if (!vsPR) continue; // quitado a propósito: no es degradación
    const pares = [[mayor(vsBase), mayor(vsPR)]];
    for (const l of new Set(vsBase.map(linea))) {
      const deBase = vsBase.filter((v) => linea(v) === l),
        dePR = vsPR.filter((v) => linea(v) === l);
      if (dePR.length) pares.push([mayor(deBase), mayor(dePR)]);
    }
    for (const [a, b] of pares) {
      if (cmp(b, a) >= 0) continue;
      const i = permitidas.findIndex(
        (p) => p.nombre === nombre && p.de === a && p.a === b,
      );
      if (i >= 0) {
        usadas.add(i);
        aceptados.push(
          `${nombre}: ${a} → ${b} degradado a propósito (${permitidas[i].razon})`,
        );
        continue;
      }
      let quien = null;
      for (const d of dependientes(lockPR, nombre, b)) {
        try {
          if (exacta(consultar(d.nombre, d.version, nombre), b)) {
            quien = `${d.nombre}@${d.version}`;
            break;
          }
        } catch {
          /* sin registro no hay prueba de la intención: sigue en rojo */
        }
      }
      if (quien) {
        forzados.push(`${nombre}: ${a} (${base}) → ${b}, bajada forzada aceptada porque ${quien} la fija exacta`);
        continue;
      }
      degradados.push(`${nombre}: ${a} (${base}) → ${b} (este árbol)`);
    }
  }
  const sinUso = permitidas
    .filter((_, i) => !usadas.has(i))
    .map((p) => `${p.nombre} ${p.de} → ${p.a}`);
  return {
    degradados: [...new Set(degradados)],
    aceptados: [...new Set(aceptados)],
    forzados: [...new Set(forzados)],
    sinUso,
    paquetes: enPR.size,
  };
}

function principal() {
  const base = process.argv[2] ?? "origin/main";
  const LOCK = "pnpm-lock.yaml";
  if (!existsSync(LOCK)) {
    console.log(`verificar-dependencias: no hay ${LOCK}; nada que comparar`);
    return 0;
  }
  let lockBase;
  try {
    lockBase = execSync(`git show ${base}:${LOCK}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    // Falla CERRADO (kit v1.35.0, ds S5 K-S5-4): una base ilegible NO es un verde. Solo pasa (con aviso) si la base
    // EXISTE y no tiene lockfile (repo nuevo).
    try {
      execSync(`git rev-parse --verify --quiet ${base}^{commit}`, { stdio: "ignore" });
    } catch {
      console.error(
        `✗ verificar-dependencias: no puedo leer la rama base ${base} (¿faltó \`git fetch origin main --depth=1\`?). Un gate que no puede mirar no está verde.`,
      );
      return 1;
    }
    console.log(
      `⚠ verificar-dependencias: ${base} existe pero no tiene ${LOCK} (repo nuevo); nada que comparar`,
    );
    return 0;
  }
  const PERMITIDAS = "scripts/degradaciones-permitidas.json";
  const permitidas = existsSync(PERMITIDAS)
    ? JSON.parse(readFileSync(PERMITIDAS, "utf8"))
    : [];
  const r = revisar({
    lockBase,
    lockPR: readFileSync(LOCK, "utf8"),
    permitidas,
    base,
  });
  for (const a of r.aceptados) console.log(`· ${a}`);
  for (const f of r.forzados) console.log(`· ${f}`);
  let fallo = false;
  if (r.sinUso.length) {
    console.error(
      `✗ ${PERMITIDAS} tiene entradas que ya no aplican; bórralas: ${r.sinUso.join(" · ")}`,
    );
    fallo = true;
  }
  if (r.degradados.length) {
    console.error(
      `✗ ${r.degradados.length} paquete(s) quedaron POR DEBAJO de ${base} (regla 18 — el lockfile no se pelea):`,
    );
    for (const d of r.degradados) console.error(`  - ${d}`);
    console.error(
      "Resuelve partiendo del lado que trae los bumps y verifica dependencia por dependencia.",
    );
    fallo = true;
  }
  if (fallo) return 1;
  console.log(
    `✓ verificar-dependencias: ${r.paquetes} paquetes, ninguno por debajo de ${base}`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exit(principal());
