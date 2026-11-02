// El ruido con garantía en pantalla y en el certificado (S7). Lo que estos tests fijan es la regla
// del texto: toda cifra de privacidad lleva su ε y su alcance, la perturbación simple dice «sin
// garantía formal», y un Laplace a medio teclear no llega a la política.

import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorDePolitica } from "@/components/editor-de-politica";
import {
  PrivacidadEnPantalla,
  privacidadDeLaEntrada,
} from "@/components/privacidad-en-pantalla";
import type { HallazgoDeColumna } from "@/engine/clasificador";
import type { Politica } from "@/engine/politica";
import type { InformeDePrivacidad } from "@/engine/ruido";
import { fijarIdioma } from "@/lib/idioma/estado";

afterEach(() => fijarIdioma("es"));

const COLUMNAS = [
  { nombre: "ingreso", tipo: "numero", categoria: "dato-sensible" },
] as unknown as HallazgoDeColumna[];

const CON_LAPLACE: Politica = {
  version: 1,
  origen: "manual",
  kObjetivo: null,
  reglas: [
    {
      columna: "ingreso",
      tecnica: {
        tipo: "laplace",
        epsilon: 1,
        minimo: 0,
        maximo: 100,
        decimales: 0,
      },
    },
  ],
};

describe("el editor: elegir ruido y sus parámetros", () => {
  it("elegir Laplace escribe la técnica con sus parámetros de partida", () => {
    const onCambio = vi.fn();
    render(
      <EditorDePolitica
        columnas={COLUMNAS}
        politica={{ ...CON_LAPLACE, reglas: [] }}
        onCambio={onCambio}
      />,
    );
    fireEvent.change(screen.getByLabelText("Técnica para la columna ingreso"), {
      target: { value: "laplace" },
    });
    expect((onCambio.mock.calls[0][0] as Politica).reglas).toContainEqual(
      CON_LAPLACE.reglas[0],
    );
  });

  it("la nota dice ε y su alcance; cambiar ε y el rango llega a la política", () => {
    const onCambio = vi.fn();
    render(
      <EditorDePolitica
        columnas={COLUMNAS}
        politica={CON_LAPLACE}
        onCambio={onCambio}
      />,
    );
    expect(
      screen.getByText(
        /Privacidad diferencial local, ε = 1 por valor de este campo/,
      ),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("ε de ingreso"), {
      target: { value: "0.5" },
    });
    expect(
      (onCambio.mock.calls.at(-1)![0] as Politica).reglas[0].tecnica,
    ).toMatchObject({
      epsilon: 0.5,
    });
    fireEvent.change(screen.getByLabelText("Máximo posible de ingreso"), {
      target: { value: "5000" },
    });
    expect(
      (onCambio.mock.calls.at(-1)![0] as Politica).reglas[0].tecnica,
    ).toMatchObject({
      maximo: 5000,
    });
  });

  it("un máximo por debajo del mínimo NO llega a la política y se dice, con símbolo", () => {
    const onCambio = vi.fn();
    render(
      <EditorDePolitica
        columnas={COLUMNAS}
        politica={CON_LAPLACE}
        onCambio={onCambio}
      />,
    );
    fireEvent.change(screen.getByLabelText("Máximo posible de ingreso"), {
      target: { value: "-5" },
    });
    expect(onCambio).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("✗");
  });

  it("perturbar se rotula sin garantía formal, y en inglés también", () => {
    const perturbar: Politica = {
      ...CON_LAPLACE,
      reglas: [
        { columna: "ingreso", tecnica: { tipo: "perturbar", porcentaje: 10 } },
      ],
    };
    const { unmount } = render(
      <EditorDePolitica
        columnas={COLUMNAS}
        politica={perturbar}
        onCambio={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/Perturbación, sin garantía formal/),
    ).toBeInTheDocument();
    unmount();
    fijarIdioma("en");
    render(
      <EditorDePolitica
        columnas={COLUMNAS}
        politica={perturbar}
        onCambio={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/Perturbation, with no formal guarantee/),
    ).toBeInTheDocument();
  });
});

const INFORME: InformeDePrivacidad = {
  epsilonPorFila: 1 + 0.99999987,
  columnas: [
    {
      columna: "ingreso",
      mecanismo: "laplace",
      epsilon: 1,
      epsilonEfectivo: 1,
      tratadas: 98,
      recortes: 3,
      noNumericas: 2,
      dominio: null,
      aplicado: true,
    },
    {
      columna: "diagnostico",
      mecanismo: "respuesta-aleatorizada",
      epsilon: 1,
      epsilonEfectivo: 0.99999987,
      tratadas: 100,
      recortes: 0,
      noNumericas: 0,
      dominio: 8,
      aplicado: true,
    },
    {
      columna: "estrato",
      mecanismo: "perturbar",
      epsilon: null,
      epsilonEfectivo: null,
      tratadas: 100,
      recortes: 0,
      noNumericas: 0,
      dominio: null,
      aplicado: true,
    },
    {
      columna: "municipio",
      mecanismo: "respuesta-aleatorizada",
      epsilon: 1,
      epsilonEfectivo: null,
      tratadas: 0,
      recortes: 0,
      noNumericas: 0,
      dominio: 120,
      aplicado: false,
    },
  ],
};

describe("el panel de privacidad, después de transformar", () => {
  it("sin ruido no hay panel", () => {
    const { container } = render(<PrivacidadEnPantalla privacidad={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("dice el ε por fila redondeado HACIA ARRIBA, cada mecanismo y su alcance", () => {
    render(<PrivacidadEnPantalla privacidad={INFORME} />);
    // 1,99999987 se dice «2», jamás «1,999»: la cifra no puede prometer más de lo que hay.
    expect(screen.getByText(/ε por fila:/)).toHaveTextContent("ε por fila: 2,");
    const tabla = screen.getByRole("table");
    const fila = (n: string) =>
      within(tabla).getByRole("row", { name: new RegExp(n) });
    expect(fila("ingreso")).toHaveTextContent("Laplace discreto");
    expect(fila("ingreso")).toHaveTextContent("3 fuera del rango declarado");
    expect(fila("diagnostico")).toHaveTextContent("1 (pedido: 1)");
    expect(fila("diagnostico")).toHaveTextContent("sacado del archivo");
    expect(fila("estrato")).toHaveTextContent("sin garantía formal");
    expect(fila("estrato")).toHaveTextContent("sin ε");
    expect(fila("municipio")).toHaveTextContent("✗");
    expect(fila("municipio")).toHaveTextContent("más de 64");
    expect(screen.getByText(/no se suma con ε/)).toBeInTheDocument();
  });

  it("la bitácora guarda el ε por fila y los mecanismos con ε, sin nombres de columna", () => {
    expect(privacidadDeLaEntrada(INFORME)).toEqual({
      epsilonPorFila: INFORME.epsilonPorFila,
      mecanismos: ["laplace", "respuesta-aleatorizada"],
      perturbadas: 1,
    });
  });
});
