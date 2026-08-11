// El gate de composición, en el DOM.
//
// El motor ya garantiza que `salvedades` viene ordenada y que `esTitular` está decidido
// (`tests/unit/balance.test.ts`), y el reporte ya garantiza el orden en su documento
// (`tests/unit/reporte.test.ts`). Falta la tercera superficie, que es la que el usuario ve
// primero: la pantalla. Aquí se comprueba con `compareDocumentPosition`, que es la pregunta
// literal —¿qué nodo viene antes?— y no una aproximación por texto.

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BalanceEnPantalla } from "@/components/balance-en-pantalla";
import type { BalanceDelTratamiento } from "@/engine/balance";

const ANTES = {
  naturaleza: "exacto",
  qis: ["municipio", "estrato"],
  filas: 1_000,
  clases: 400,
  kMinimo: 1,
  riesgoMaximo: 1,
  riesgoPromedio: 0.4,
  unicos: 300,
  proporcionUnicos: 0.3,
} as const;

const DESPUES = {
  naturaleza: "exacto",
  qis: ["municipio", "estrato"],
  filas: 1_000,
  clases: 40,
  kMinimo: 8,
  riesgoMaximo: 0.125,
  riesgoPromedio: 0.04,
  unicos: 0,
  proporcionUnicos: 0,
} as const;

const CON_CEDULA_INTACTA: BalanceDelTratamiento = {
  antes: ANTES,
  despues: { ...DESPUES, unicos: 12, proporcionUnicos: 0.012 },
  reduccion: 0.96,
  esTitular: false,
  salvedades: [
    {
      gravedad: "descalifica",
      tipo: "identificadores-sin-tratar",
      columnas: ["cedula_titular"],
    },
    {
      gravedad: "descalifica",
      tipo: "unicos-restantes",
      cuantos: 12,
      proporcion: 0.012,
    },
    {
      gravedad: "matiza",
      tipo: "colisiones-de-seudonimo",
      columna: "nit_empresa",
      cuantas: 2,
    },
  ],
};

const LIMPIO: BalanceDelTratamiento = {
  antes: ANTES,
  despues: DESPUES,
  reduccion: 1,
  esTitular: true,
  salvedades: [],
};

describe("«riesgo reducido 96 %» con una cédula intacta al lado", () => {
  it("la salvedad se pinta ANTES que la cifra, en el orden del DOM", () => {
    render(<BalanceEnPantalla balance={CON_CEDULA_INTACTA} />);
    const salvedades = screen.getByTestId("salvedades");
    const cifra = screen.getByTestId("reduccion");

    expect(
      salvedades.compareDocumentPosition(cifra) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("la cifra existe, pero sin el tratamiento de titular", () => {
    render(<BalanceEnPantalla balance={CON_CEDULA_INTACTA} />);
    // No se esconde el número —el usuario tiene derecho a él— pero no se luce.
    expect(screen.getByTestId("reduccion")).toBeInTheDocument();
    expect(
      screen.getByText(/Esa cifra no describe un archivo tratado/),
    ).toBeInTheDocument();
  });

  it("nombra la columna que quedó intacta, no solo cuántas", () => {
    render(<BalanceEnPantalla balance={CON_CEDULA_INTACTA} />);
    expect(screen.getByTestId("salvedades").textContent).toContain(
      "cedula_titular",
    );
  });

  it("las descalificantes se ven distinto de las que solo matizan", () => {
    render(<BalanceEnPantalla balance={CON_CEDULA_INTACTA} />);
    const items = screen.getByTestId("salvedades").querySelectorAll("li");
    expect(items).toHaveLength(3);
    expect(items[0].className).toContain("border-alerta");
    expect(items[2].className).toContain("border-aviso");
  });
});

describe("el complemento: cuando nada la descalifica", () => {
  it("la cifra sí se luce", () => {
    // Sin este test, un componente que jamás pintara el titular pasaría los de arriba.
    render(<BalanceEnPantalla balance={LIMPIO} />);
    expect(screen.getByTestId("reduccion")).toBeInTheDocument();
    expect(screen.queryByTestId("salvedades")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Esa cifra no describe un archivo tratado/),
    ).not.toBeInTheDocument();
  });

  it("y aun así declara sobre qué columnas está calculada", () => {
    render(<BalanceEnPantalla balance={LIMPIO} />);
    expect(screen.getByText(/columnas cruzadas/)).toBeInTheDocument();
  });
});

describe("sin riesgo previo", () => {
  it("dice que no hay reducción que medir, en vez de un 0 %", () => {
    render(
      <BalanceEnPantalla
        balance={{
          ...LIMPIO,
          antes: { ...ANTES, unicos: 0, proporcionUnicos: 0 },
          reduccion: null,
          esTitular: false,
        }}
      />,
    );
    expect(screen.getByText(/no hay reducción que medir/)).toBeInTheDocument();
    expect(screen.queryByTestId("reduccion")).not.toBeInTheDocument();
  });
});

describe("las cuatro cifras del pie", () => {
  it("marcan en alerta los únicos que quedan", () => {
    render(<BalanceEnPantalla balance={CON_CEDULA_INTACTA} />);
    const dd =
      screen.getByText("Únicos, después").parentElement?.lastElementChild;
    expect(dd?.className).toContain("text-alerta");
  });
});
