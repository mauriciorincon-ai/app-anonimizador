#!/usr/bin/env node
// kit v2.0.0 — horas activas del sprint con la heurística git-hours (auditoría del proceso 2026-10-06, § 5 P4).
// Lee los commits de la rama (por defecto `origin/main..HEAD`; `--rango a..b` para otro tramo), los ordena por fecha
// y suma los huecos ≤ 2 h entre commits consecutivos; un hueco > 2 h abre una sesión nueva, y cada sesión (también la
// primera) suma 0,5 h de arranque. Es un PISO: no ve las paradas ni la lectura. Por fase agrupa por la etiqueta
// `[F1]`, `[F2]`, `[F3]` del subject (sin etiqueta → «sin fase»): cada commit aporta a su fase el tramo que él cierra.
// Uso: node scripts/horas-sprint.mjs [--rango origin/main..HEAD]  → bloque Markdown para pegar en el cierre ejecutivo.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const HUECO_MAX_MS = 2 * 60 * 60 * 1000;
const ARRANQUE_H = 0.5;
const FASES = ["F1", "F2", "F3", "sin fase"];

export function faseDe(subject) {
  const m = /\[(F[123])\]/i.exec(subject ?? "");
  return m ? m[1].toUpperCase() : "sin fase";
}

/** commits: [{ hash, fecha (ISO), subject }] en cualquier orden. Devuelve horas activas, sesiones, span y por fase. */
export function calcularHoras(commits) {
  const lista = commits
    .map((c) => ({ ...c, t: new Date(c.fecha).getTime() }))
    .filter((c) => Number.isFinite(c.t))
    .sort((a, b) => a.t - b.t);
  const porFase = new Map(FASES.map((f) => [f, { fase: f, commits: 0, horas: 0 }]));
  let horas = 0, sesiones = 0, previo = null;
  for (const c of lista) {
    const nueva = previo === null || c.t - previo > HUECO_MAX_MS;
    const delta = nueva ? ARRANQUE_H : (c.t - previo) / 3_600_000;
    if (nueva) sesiones++;
    horas += delta;
    const f = porFase.get(faseDe(c.subject));
    f.commits++; f.horas += delta;
    previo = c.t;
  }
  const primero = lista[0]?.fecha ?? null, ultimo = lista.at(-1)?.fecha ?? null;
  const span = lista.length ? (lista.at(-1).t - lista[0].t) / 3_600_000 : 0;
  return { commits: lista.length, sesiones, horas, span, primero, ultimo, porFase: [...porFase.values()].filter((f) => f.commits > 0) };
}

export function leerCommits(rango, cwd = process.cwd()) {
  const salida = execFileSync("git", ["log", "--format=%H%x09%cI%x09%s", rango], { cwd, encoding: "utf8" });
  return salida.split("\n").filter(Boolean).map((l) => {
    const [hash, fecha, ...resto] = l.split("\t");
    return { hash, fecha, subject: resto.join("\t") };
  });
}

const h = (x) => `${x.toFixed(1).replace(".", ",")} h`;
const fecha = (iso) => (iso ? iso.replace("T", " ").slice(0, 16) : "—");

export function markdown(r, rango) {
  const lineas = [
    `### Horas del sprint (\`scripts/horas-sprint.mjs\`, rango \`${rango}\`, heurística git-hours: huecos ≤ 2 h + 0,5 h por sesión)`,
    "", "| Commits | Sesiones | Horas activas | Span (primer → último commit) |", "|---:|---:|---:|---|",
    `| ${r.commits} | ${r.sesiones} | ${h(r.horas)} | ${fecha(r.primero)} → ${fecha(r.ultimo)} (${h(r.span)}) |`,
    "", "| Fase | Commits | Horas activas |", "|---|---:|---:|",
    ...r.porFase.map((f) => `| ${f.fase} | ${f.commits} | ${h(f.horas)} |`),
  ];
  return lineas.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf("--rango");
  const rango = i > -1 ? process.argv[i + 1] : "origin/main..HEAD";
  if (!rango) { console.error("uso: node scripts/horas-sprint.mjs [--rango a..b]"); process.exit(2); }
  const commits = leerCommits(rango);
  if (!commits.length) { console.error(`horas-sprint: sin commits en ${rango}`); process.exit(1); }
  console.log(markdown(calcularHoras(commits), rango));
}
