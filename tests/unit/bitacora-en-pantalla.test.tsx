// La bitácora en pantalla — el sitio donde la lección más cara del ciclo se podía perder.
//
// El ADR-007 decidió que una entrada guarda **las dos puntas del riesgo y no la reducción entre
// ellas**, porque «bajó del 30 % al 2 %» es cierta y puede engañar, y una bitácora se lee meses
// después sin la pantalla al lado que la matice. Esa decisión vive en el tipo, pero una pantalla
// puede deshacerla en una línea: basta con restar los dos números y pintar el resultado.
//
// Aquí se comprueba que no lo hace. El resto de estados —abierta con N entradas, frase incorrecta,
// bóveda confundida con bitácora— los cubre `tests/e2e/bitacora.spec.ts`, que puede cifrar de
// verdad; esto mira lo que el e2e no distingue bien: qué se dice y qué NO se dice.

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Bitacora } from "@/components/bitacora";
import type { EntradaDeBitacora } from "@/engine/bitacora";
import { anotarTratamiento, descartarAnotacion } from "@/lib/bitacora";

const ENTRADA: EntradaDeBitacora = {
  fecha: "13 de agosto de 2026, 21:04",
  archivo: "pacientes-2026.csv",
  hashDePolitica: "abc12345def67890",
  tecnicas: ["enmascarar", "seudonimizar"],
  filas: 2_000,
  unicosAntes: 0.3,
  unicosDespues: 0.02,
  esTitular: true,
  huellaDeEntrada: "a".repeat(64),
  huellaDeSalida: "b".repeat(64),
};

afterEach(() => {
  cleanup();
  act(() => descartarAnotacion());
});

describe("la anotación pendiente", () => {
  it("enseña las DOS proporciones y nunca la reducción entre ellas", () => {
    act(() => anotarTratamiento(ENTRADA));
    render(<Bitacora />);

    // Las dos puntas, cada una por su lado.
    expect(
      screen.getByText(/30 % antes · 2,0 % después/),
    ).toBeInTheDocument();

    // Y la resta NO está en ninguna parte: ni el 28 de la diferencia, ni el 93 % de la reducción
    // relativa. Si algún día alguien «ayuda» al usuario calculándosela, esto se pone rojo.
    const texto = document.body.textContent ?? "";
    expect(texto).not.toMatch(/\b28(,0)? %/);
    expect(texto).not.toMatch(/\b93(,3)? %/);
    expect(texto).not.toMatch(/−|reducción de/);
  });

  it("traduce las claves de técnica a palabras, sin decir a qué columnas", () => {
    act(() => anotarTratamiento(ENTRADA));
    render(<Bitacora />);

    expect(
      screen.getAllByText(/enmascarada, seudónimo/).length,
    ).toBeGreaterThan(0);
    // Qué se hizo, no a qué: ningún nombre de columna viaja en la entrada.
    expect(document.body.textContent).not.toMatch(/cedula|nombre_completo/);
  });

  it("una medición que llevaba salvedades lo dice, en vez de callarlo", () => {
    act(() => anotarTratamiento({ ...ENTRADA, esTitular: false }));
    render(<Bitacora />);

    expect(
      screen.getByText(/salvedades que descalificaban su cifra/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/restarlas y presentarlo como el efecto/),
    ).toBeInTheDocument();
  });

  it("la primera anotación avisa de que la frase no se comparte con las otras dos", () => {
    act(() => anotarTratamiento(ENTRADA));
    render(<Bitacora />);

    expect(
      screen.getByRole("heading", { name: "Tu primera anotación" }),
    ).toBeInTheDocument();
    // Tres secretos con tres alcances: reusarlos convierte la filtración de uno en la de todo.
    expect(
      screen.getByText(/tres secretos con tres alcances/),
    ).toBeInTheDocument();
    expect(screen.getByText(/ni Velo, ni nadie/)).toBeInTheDocument();
  });

  it("sin anotación pendiente, la pantalla ofrece abrir y no finge tener nada", () => {
    render(<Bitacora />);

    expect(
      screen.getByRole("heading", { name: "Abre la bitácora que guardaste" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /anotación/ })).toBeNull();
    // Ningún control muerto: no hay botón de guardar si no hay nada que guardar.
    expect(
      screen.queryByRole("link", { name: /Guardar la bitácora/ }),
    ).toBeNull();
  });
});
