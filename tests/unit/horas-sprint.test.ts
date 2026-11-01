// @vitest-environment node
// kit v2.0.0 — horas activas del sprint (heurística git-hours): huecos ≤ 2 h entre commits se suman; un hueco > 2 h abre
// sesión nueva y cada sesión (también la primera) suma 0,5 h; por fase según la etiqueta [F1]/[F2]/[F3] del subject.
import { describe, expect, it } from "vitest";
import { calcularHoras, faseDe } from "../../scripts/horas-sprint.mjs";

const c = (fecha: string, subject = "chore: x") => ({ hash: "h", fecha, subject });

describe("horas-sprint — heurística git-hours", () => {
  it("sesión única: la sesión arranca con 0,5 h y los huecos ≤ 2 h se suman enteros", () => {
    const r = calcularHoras([c("2026-10-01T10:00:00Z"), c("2026-10-01T11:00:00Z"), c("2026-10-01T12:30:00Z")]);
    expect(r).toMatchObject({ commits: 3, sesiones: 1 });
    expect(r.horas).toBeCloseTo(0.5 + 1 + 1.5);
    expect(r.span).toBeCloseTo(2.5);
    expect(r.primero).toBe("2026-10-01T10:00:00Z");
    expect(r.ultimo).toBe("2026-10-01T12:30:00Z");
  });
  it("dos sesiones: un hueco > 2 h no se suma; abre sesión nueva y aporta 0,5 h", () => {
    const r = calcularHoras([
      c("2026-10-01T10:00:00Z"), c("2026-10-01T11:00:00Z"), // sesión 1: 0,5 + 1
      c("2026-10-01T15:00:00Z"), c("2026-10-01T15:30:00Z"), // hueco de 4 h → sesión 2: 0,5 + 0,5
    ]);
    expect(r).toMatchObject({ commits: 4, sesiones: 2 });
    expect(r.horas).toBeCloseTo(2.5);
    expect(r.span).toBeCloseTo(5.5);
  });
  it("por fase: agrupa por [F1]/[F2]/[F3], lo demás va a «sin fase», y el orden de entrada no importa", () => {
    const r = calcularHoras([
      c("2026-10-01T11:00:00Z", "feat: [F2] UI"),           // cierra 1 h → F2
      c("2026-10-01T10:00:00Z", "feat: [F1] motor"),        // arranque 0,5 → F1
      c("2026-10-01T11:30:00Z", "fix: [f2] ajuste"),        // 0,5 → F2 (minúscula también)
      c("2026-10-01T12:00:00Z", "docs: cierre ejecutivo"),  // 0,5 → sin fase
    ]);
    expect(r.porFase).toEqual([
      { fase: "F1", commits: 1, horas: 0.5 },
      { fase: "F2", commits: 2, horas: 1.5 },
      { fase: "sin fase", commits: 1, horas: 0.5 },
    ]);
    expect(r.horas).toBeCloseTo(2.5);
    expect(faseDe("chore: [F3] e2e")).toBe("F3");
    expect(faseDe("chore: sin etiqueta")).toBe("sin fase");
  });
});
