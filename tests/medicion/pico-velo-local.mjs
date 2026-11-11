// Medición de Velo local: el tiempo y el pico de memoria de `pnpm velo anonimizar` sobre el CSV
// `clinico` del generador sembrado (S12: es la cifra del manual § 9 que no tenía arnés).
//
// Se corre a mano: `node tests/medicion/pico-velo-local.mjs [filas]` (1 000 000 por omisión; el
// manual cita 1 000 000 y 5 000 000, esta última de unos 20 min). No entra a la CI: MIDE.
//
// Regla 17-bis y 5: el archivo sale del generador sembrado (`--seed 42`) a `tmp/` (ignorado), y el
// arnés aborta si el archivo que va a leer no está dentro de `tmp/`. Ningún dato real entra aquí.
// El pico es el «maximum resident set size» de `/usr/bin/time -l` (macOS, en bytes) o de
// `-v` (Linux, en KB): cuenta la basura aún no recogida, así que es un techo.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { platform } from "node:os";

const raiz = process.cwd();
const tmp = resolve(raiz, "tmp");
const filas = Number(process.argv[2] ?? 1_000_000);
const archivo = join(tmp, `clinico-${filas}.csv`);
const salida = join(tmp, `velo-local-medida-${filas}`);

if (!resolve(archivo).startsWith(`${tmp}/`)) {
  console.error("El archivo de prueba debe vivir en tmp/: se aborta.");
  process.exit(2);
}
mkdirSync(tmp, { recursive: true });
rmSync(salida, { recursive: true, force: true });
mkdirSync(salida, { recursive: true });

if (!existsSync(archivo)) {
  const g = spawnSync(
    "node",
    [
      "docs/kit-de-prueba/generador.mjs",
      "--filas",
      String(filas),
      "--seed",
      "42",
      "--perfil",
      "clinico",
      "--salida",
      archivo,
    ],
    { stdio: "inherit" },
  );
  if (g.status !== 0) process.exit(g.status ?? 1);
}

const mac = platform() === "darwin";
const t0 = Date.now();
const r = spawnSync(
  "/usr/bin/time",
  [
    mac ? "-l" : "-v",
    "pnpm",
    "velo",
    "anonimizar",
    archivo,
    "--politica",
    "habeas-data",
    "--sal",
    "00112233445566778899aabbccddeeff",
    "--salida",
    salida,
  ],
  {
    env: { ...process.env, VELO_FRASE: "frase de medicion de esta prueba" },
    encoding: "utf8",
  },
);
const segundos = (Date.now() - t0) / 1000;
const m = mac
  ? /(\d+)\s+maximum resident set size/.exec(r.stderr)
  : /Maximum resident set size \(kbytes\): (\d+)/.exec(r.stderr);
const bytes = m ? Number(m[1]) * (mac ? 1 : 1024) : null;
console.log(
  JSON.stringify({
    filas,
    salida: r.status,
    segundos: Number(segundos.toFixed(1)),
    picoGB: bytes ? Number((bytes / 1e9).toFixed(2)) : null,
  }),
);
rmSync(salida, { recursive: true, force: true });
process.exit(r.status ?? 1);
