// Plantilla del kit (v1.37.0): corre el comando REAL del hook PreToolUse de .claude/settings.json.
// @vitest-environment node
/**
 * El hook PreToolUse de Claude Code (`.claude/settings.json`) que busca secretos en lo que se va a escribir: se corre
 * su comando real. Falla CERRADO si faltan gitleaks o jq, como el pre-commit (kit v1.37.0; origen planlang AU-S2-B12); `KIT_SIN_GITLEAKS=1` lo
 * salta a sabiendas; deja pasar un contenido limpio y bloquea la carnada canónica (carnada canónica del kit, armada
 * partida para que este archivo no la contenga).
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ajustes = JSON.parse(readFileSync(".claude/settings.json", "utf8")) as {
  hooks: { PreToolUse: { matcher: string; hooks: { command: string }[] }[] };
};
const comando = ajustes.hooks.PreToolUse.find(
  (h) => h.matcher === "Write|Edit",
)!.hooks[0]!.command;

function correr(contenido: string, env: Record<string, string | undefined>) {
  return spawnSync("/bin/bash", ["-c", comando], {
    input: JSON.stringify({ tool_input: { content: contenido } }),
    encoding: "utf8",
    env: env as NodeJS.ProcessEnv,
  });
}

/** Un PATH con lo básico del sistema y sin gitleaks ni jq. */
function pathSinHerramientas(): string {
  const dir = mkdtempSync(join(tmpdir(), "hook-sin-"));
  for (const b of ["cat", "printf", "echo"]) {
    const r = spawnSync("/bin/bash", ["-c", `command -v ${b}`], {
      encoding: "utf8",
    });
    if (r.stdout.trim().startsWith("/"))
      symlinkSync(r.stdout.trim(), join(dir, b));
  }
  return dir;
}

const hayHerramientas =
  spawnSync("/bin/bash", ["-c", "command -v gitleaks && command -v jq"])
    .status === 0;

describe("hook PreToolUse de secretos (kit v1.37.0; origen planlang AU-S2-B12)", () => {
  it("sin gitleaks ni jq bloquea, y lo dice", () => {
    const r = correr("hola", { PATH: pathSinHerramientas() });
    expect(r.status).toBe(2);
    expect(r.stdout).toContain("falta gitleaks o jq");
  });

  it("KIT_SIN_GITLEAKS=1 lo salta a sabiendas", () => {
    const r = correr("hola", {
      PATH: pathSinHerramientas(),
      KIT_SIN_GITLEAKS: "1",
    });
    expect(r.status).toBe(0);
  });

  it.runIf(hayHerramientas)(
    "con las herramientas: deja pasar lo limpio y bloquea la carnada",
    () => {
      expect(correr("const x = 1;", process.env).status).toBe(0);
      const carnada = ["AWS_ACCESS_KEY_ID=", "AKIAQ7RTZ4PX", "KM2WNB3S"].join(
        "",
      );
      const r = correr(carnada, process.env);
      expect(r.status).toBe(2);
      expect(r.stdout).toContain("SECRET DETECTADO");
    },
  );
});
