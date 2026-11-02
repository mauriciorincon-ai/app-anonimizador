// «Cómo llegar al k» (S7): lo que el usuario elige en este panel se escribe en la POLÍTICA, y la
// política es la identidad del tratamiento. Estos tests fijan que elegir la óptima, cambiar una
// escalera o pedir una ℓ cambie la política exactamente así —y que volver a Mondrian la deje como
// estaba—; que la comparación pida al worker lo que hay en pantalla; y que la tabla diga cada
// veredicto con símbolo y palabra, no solo con color.

import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ComoLlegarAlK } from "@/components/como-llegar-al-k";
import type { HallazgoDeColumna } from "@/engine/clasificador";
import type { Politica } from "@/engine/politica";
import { fijarIdioma } from "@/lib/idioma/estado";
import { firmaDeComparacion } from "@/lib/sesion";
import type { LadoDeLaComparacion } from "@/workers/contrato";

const sesion = vi.hoisted(() => ({
  comparar: vi.fn(),
  comparacion: { fase: "sin-hacer" } as Record<string, unknown>,
}));

vi.mock("@/lib/sesion", async (original) => {
  const real = await original<typeof import("@/lib/sesion")>();
  return {
    ...real,
    compararGeneralizacion: sesion.comparar,
    useTaller: () => ({ comparacion: sesion.comparacion }),
  };
});

const COLUMNAS = [
  { nombre: "edad", tipo: "numero", categoria: "cuasi-identificador" },
  { nombre: "municipio", tipo: "texto", categoria: "cuasi-identificador" },
  { nombre: "diagnostico", tipo: "texto", categoria: "dato-sensible" },
] as unknown as HallazgoDeColumna[];

const CON_REPARTO: Politica = {
  version: 1,
  origen: "manual",
  kObjetivo: 5,
  reglas: [
    { columna: "edad", tecnica: { tipo: "generalizar-automatico" } },
    { columna: "municipio", tecnica: { tipo: "generalizar-automatico" } },
  ],
};

const OPTIMA: Politica = {
  ...CON_REPARTO,
  generalizacion: {
    algoritmo: "optima",
    jerarquias: {
      edad: { tipo: "edad-dane" },
      municipio: { tipo: "divipola" },
    },
  },
};

/** La firma de lo que la pantalla compara con CON_REPARTO: las escaleras propuestas, sin ℓ. */
const FIRMA = firmaDeComparacion(OPTIMA, OPTIMA.generalizacion!.jerarquias);

function pintar(politica: Politica) {
  const onCambio = vi.fn();
  render(
    <ComoLlegarAlK
      columnas={COLUMNAS}
      politica={politica}
      onCambio={onCambio}
    />,
  );
  return onCambio;
}

beforeEach(() => {
  sesion.comparar.mockReset();
  sesion.comparacion = { fase: "sin-hacer" };
});
afterEach(() => fijarIdioma("es"));

describe("el camino se escribe en la política", () => {
  it("por defecto es Mondrian, y la escalera propuesta sale del tipo y del nombre", () => {
    pintar(CON_REPARTO);
    expect(
      screen.getByRole("radio", { name: "Mondrian (el de siempre)" }),
    ).toBeChecked();
    expect(
      screen.getByLabelText("Escalera de generalización para la columna edad"),
    ).toHaveValue("edad-dane");
    expect(
      screen.getByLabelText(
        "Escalera de generalización para la columna municipio",
      ),
    ).toHaveValue("divipola");
  });

  it("elegir la óptima escribe las escaleras que se ven en pantalla", () => {
    const onCambio = pintar(CON_REPARTO);
    fireEvent.click(
      screen.getByRole("radio", { name: "La generalización óptima" }),
    );
    expect(onCambio).toHaveBeenCalledWith(OPTIMA);
  });

  it("con la óptima elegida, cambiar una escalera cambia la política", () => {
    const onCambio = pintar(OPTIMA);
    fireEvent.change(
      screen.getByLabelText("Escalera de generalización para la columna edad"),
      { target: { value: "rango-10" } },
    );
    const siguiente = onCambio.mock.calls[0][0] as Politica;
    expect(siguiente.generalizacion?.jerarquias.edad).toEqual({
      tipo: "rango",
      amplitudes: [10, 100, 1000, 10000],
    });
  });

  it("volver a Mondrian quita el campo: la política queda como era (y su hash también)", () => {
    const onCambio = pintar(OPTIMA);
    fireEvent.click(
      screen.getByRole("radio", { name: "Mondrian (el de siempre)" }),
    );
    expect(onCambio).toHaveBeenCalledWith(CON_REPARTO);
  });

  it("la ℓ se pide sobre las columnas sensibles fuera del reparto", () => {
    const onCambio = pintar(OPTIMA);
    fireEvent.change(
      screen.getByLabelText("ℓ distinta (opcional) sobre diagnostico"),
      {
        target: { value: "3" },
      },
    );
    expect(
      (onCambio.mock.calls[0][0] as Politica).generalizacion?.diversidad,
    ).toEqual({
      l: 3,
      columnas: ["diagnostico"],
    });
  });

  it("una escalera importada que no es de las ofrecidas se nombra como tal", () => {
    pintar({
      ...OPTIMA,
      generalizacion: {
        ...OPTIMA.generalizacion!,
        jerarquias: {
          ...OPTIMA.generalizacion!.jerarquias,
          edad: { tipo: "rango", amplitudes: [3, 6] },
        },
      },
    });
    expect(
      screen.getByLabelText("Escalera de generalización para la columna edad"),
    ).toHaveValue("propia");
  });
});

describe("la comparación", () => {
  it("pide al worker la política con lo que hay en pantalla, aunque Mondrian esté elegido", () => {
    pintar(CON_REPARTO);
    fireEvent.click(
      screen.getByRole("button", { name: "Comparar los dos caminos" }),
    );
    expect(sesion.comparar).toHaveBeenCalledWith(
      { ...OPTIMA },
      OPTIMA.generalizacion!.jerarquias,
    );
  });

  it("sin k no se puede comparar", () => {
    pintar({ ...CON_REPARTO, kObjetivo: null });
    expect(
      screen.getByRole("button", { name: "Comparar los dos caminos" }),
    ).toBeDisabled();
  });

  const lado = (extra: Partial<LadoDeLaComparacion>): LadoDeLaComparacion => ({
    disponible: true,
    motivo: null,
    alcanzado: true,
    kAlcanzado: 5,
    lAlcanzado: null,
    clases: 12,
    unicos: 0,
    riesgoMaximo: 0.2,
    riesgoPromedio: 0.1,
    bitsAntes: 9.5,
    bitsDespues: 6.25,
    columnas: [
      { nombre: "edad", nivel: null, distintos: 8 },
      { nombre: "municipio", nivel: null, distintos: 5 },
    ],
    nodosRevisados: null,
    nodosEnLaReticula: null,
    ms: 3,
    ...extra,
  });

  it("la tabla lado a lado dice cada veredicto con símbolo y palabra, y su alcance", () => {
    sesion.comparacion = {
      fase: "hecha",
      firma: FIRMA,
      comparacion: {
        kObjetivo: 5,
        lObjetivo: null,
        dimensiones: ["edad", "municipio"],
        mondrian: lado({}),
        optima: lado({
          alcanzado: false,
          kAlcanzado: 3,
          columnas: [
            { nombre: "edad", nivel: "quinquenio", distintos: 6 },
            { nombre: "municipio", nivel: "departamento", distintos: 3 },
          ],
          nodosRevisados: 7,
          nodosEnLaReticula: 16,
        }),
      },
    };
    pintar(CON_REPARTO);
    const tabla = screen.getByRole("table");
    const cumple = within(tabla).getByRole("row", {
      name: /¿Llega al k pedido \(5\)\?/,
    });
    expect(cumple).toHaveTextContent("✓Sí");
    expect(cumple).toHaveTextContent("✗No");
    expect(
      screen.getByText(
        /Medido sobre las columnas del reparto \(edad · municipio\)/,
      ),
    ).toBeInTheDocument();
    expect(
      within(tabla).getByRole("row", { name: /Cómo queda edad/ }),
    ).toHaveTextContent("cortes locales");
    expect(
      within(tabla).getByRole("row", { name: /Cómo queda edad/ }),
    ).toHaveTextContent("quinquenio");
    expect(
      within(tabla).getByRole("row", { name: /Combinaciones revisadas/ }),
    ).toHaveTextContent("7 de 16");
  });

  it("si la retícula pasa del tope, la óptima dice «sin calcular» en vez de una cifra", () => {
    sesion.comparacion = {
      fase: "hecha",
      firma: FIRMA,
      comparacion: {
        kObjetivo: 5,
        lObjetivo: null,
        dimensiones: ["edad", "municipio"],
        mondrian: lado({}),
        optima: lado({ disponible: false, motivo: "excede-tope" }),
      },
    };
    pintar(CON_REPARTO);
    expect(
      screen.getAllByText("Sin calcular: la retícula pasa del tope").length,
    ).toBeGreaterThan(0);
  });

  it("elegir el camino NO esconde la comparación; cambiar el k sí", () => {
    sesion.comparacion = {
      fase: "hecha",
      firma: FIRMA,
      comparacion: {
        kObjetivo: 5,
        lObjetivo: null,
        dimensiones: ["edad", "municipio"],
        mondrian: lado({}),
        optima: lado({}),
      },
    };
    pintar(OPTIMA);
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("con otro k, la comparación de antes describe otra cosa y se esconde", () => {
    sesion.comparacion = {
      fase: "hecha",
      firma: FIRMA,
      comparacion: {
        kObjetivo: 5,
        lObjetivo: null,
        dimensiones: ["edad", "municipio"],
        mondrian: lado({}),
        optima: lado({}),
      },
    };
    pintar({ ...CON_REPARTO, kObjetivo: 10 });
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("un fallo se dice, no se queda en blanco", () => {
    sesion.comparacion = { fase: "fallo", firma: FIRMA };
    pintar(CON_REPARTO);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo comparar");
  });
});

describe("en inglés, redactado y no traducido", () => {
  it("el panel entero cambia de idioma", () => {
    fijarIdioma("en");
    pintar(CON_REPARTO);
    expect(
      screen.getByRole("heading", { name: "How to reach k" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "The optimal generalization" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Compare the two roads" }),
    ).toBeInTheDocument();
  });
});
