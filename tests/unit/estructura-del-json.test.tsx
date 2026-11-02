// El panel de la estructura de un JSON (S6).
//
// Se prueba con un `EstructuraJson` escrito a mano y tipado: es exactamente lo que cruza el worker
// (conteos, rutas y nombres de campo, jamás valores), así que no hace falta levantar ni el lector
// ni un navegador. Lo que el panel tiene que garantizar es una sola cosa con muchas caras: que lo
// que Velo NO trata se vea tan claro como lo que sí trata.

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EstructuraDelJson } from "@/components/estructura-del-json";
import type { EstructuraJson } from "@/engine/json/tipos";
import { fijarIdioma } from "@/lib/idioma/estado";

const ESTRUCTURA: EstructuraJson = {
  forma: "arreglo",
  registros: 1_200,
  rutasTratadas: 9,
  profundidad: 3,
  noTratadas: [
    {
      ruta: "contactos[]",
      motivo: "lista-de-objetos",
      registros: 1_180,
      pistas: ["contactos[].correo", "contactos[].telefono"],
    },
    {
      ruta: "etiquetas[]",
      motivo: "lista",
      registros: 640,
      pistas: [],
    },
  ],
  heterogeneas: [
    { ruta: "paciente.segundo_nombre", presencia: 410, tipos: ["texto"] },
    { ruta: "edad", presencia: 1_200, tipos: ["numero", "texto"] },
  ],
};

const SIN_LISTAS: EstructuraJson = {
  forma: "lineas",
  registros: 50,
  rutasTratadas: 4,
  profundidad: 1,
  noTratadas: [],
  heterogeneas: [],
};

function fila(tabla: HTMLElement, ruta: string): HTMLElement {
  return within(tabla)
    .getByRole("rowheader", { name: ruta })
    .closest("tr") as HTMLElement;
}

describe("la estructura de un JSON, en español", () => {
  it("es una región con nombre y cuenta lo que se leyó", () => {
    render(<EstructuraDelJson estructura={ESTRUCTURA} />);
    const panel = screen.getByRole("region", {
      name: "Qué se trató y qué no en este JSON",
    });
    expect(panel).toBeInTheDocument();
    // Miles con punto: la convención del español.
    expect(within(panel).getByText("1.200")).toBeInTheDocument();
    expect(within(panel).getByText("Registros")).toBeInTheDocument();
    expect(
      within(panel).getByText("Rutas tratadas (columnas)"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Profundidad máxima")).toBeInTheDocument();
    expect(within(panel).getByText("Arreglo de objetos")).toBeInTheDocument();
  });

  it("nombra la otra forma del archivo: JSON Lines", () => {
    render(<EstructuraDelJson estructura={SIN_LISTAS} />);
    expect(
      screen.getByText("JSON Lines (un objeto por línea)"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Arreglo de objetos")).toBeNull();
  });

  it("avisa en voz alta de lo que sale sin tratar, con símbolo y con texto", () => {
    render(<EstructuraDelJson estructura={ESTRUCTURA} />);
    const aviso = screen.getByRole("note", {
      name: "Estas rutas salen sin tocar",
    });
    expect(aviso).toHaveTextContent(
      "Velo no trata los valores de estas listas: los copia al archivo tal cual.",
    );
    expect(aviso).toHaveTextContent(/correos, teléfonos, documentos/);
    expect(aviso).toHaveTextContent("no las alcanza");
    // El ejemplo es un nombre de campo real del archivo, no una frase genérica.
    expect(aviso).toHaveTextContent("contactos[].correo saldrá tal cual");
    // El color no va solo: el símbolo «!» está en el aviso, oculto al lector (el texto ya lo dice).
    expect(aviso.querySelector('[aria-hidden="true"]')).toHaveTextContent("!");
    // Y la advertencia es negrita en el color de alerta, no solo un párrafo gris.
    const fuerte = aviso.querySelector("strong.text-alerta");
    expect(fuerte).toHaveTextContent(/^Velo no trata los valores/);
  });

  it("si la lista no trae campos con nombre, el ejemplo es la propia ruta", () => {
    render(
      <EstructuraDelJson
        estructura={{ ...ESTRUCTURA, noTratadas: [ESTRUCTURA.noTratadas[1]!] }}
      />,
    );
    expect(
      screen.getByRole("note", { name: "Estas rutas salen sin tocar" }),
    ).toHaveTextContent("etiquetas[] saldrá tal cual");
  });

  it("lista cada ruta sin tratar: qué es, en cuántos registros y qué campos se vieron", () => {
    render(<EstructuraDelJson estructura={ESTRUCTURA} />);
    const tabla = screen.getByRole("table", {
      name: "Listas dentro de los registros que Velo no trata",
    });
    expect(
      within(tabla).getAllByRole("columnheader", { hidden: false }),
    ).toHaveLength(4);

    const contactos = fila(tabla, "contactos[]");
    const celdasDeContactos = within(contactos).getAllByRole("cell");
    expect(celdasDeContactos[0]).toHaveTextContent("Lista de objetos");
    expect(celdasDeContactos[1]).toHaveTextContent("1.180 de 1.200");
    expect(celdasDeContactos[2]).toHaveTextContent("contactos[].correo");
    expect(celdasDeContactos[2]).toHaveTextContent("contactos[].telefono");

    const etiquetas = within(fila(tabla, "etiquetas[]")).getAllByRole("cell");
    expect(etiquetas[0]).toHaveTextContent("Lista de valores");
    expect(etiquetas[1]).toHaveTextContent("640 de 1.200");
    expect(etiquetas[2]).toHaveTextContent("sin campos con nombre");
  });

  it("la tabla se puede recorrer con teclado: la región que la envuelve se enfoca", () => {
    render(<EstructuraDelJson estructura={ESTRUCTURA} />);
    const region = screen.getByRole("region", {
      name: "Detalle de las listas que salen sin tratar",
    });
    expect(region).toHaveAttribute("tabindex", "0");
  });

  it("declara las rutas que faltan en algunos registros o cambian de tipo", () => {
    render(<EstructuraDelJson estructura={ESTRUCTURA} />);
    const tabla = screen.getByRole("table", {
      name: "Rutas que no están en todos los registros o que cambian de tipo",
    });
    const segundo = within(fila(tabla, "paciente.segundo_nombre")).getAllByRole(
      "cell",
    );
    expect(segundo[0]).toHaveTextContent("410 de 1.200 registros");
    expect(segundo[1]).toHaveTextContent("texto");

    const edad = within(fila(tabla, "edad")).getAllByRole("cell");
    expect(edad[0]).toHaveTextContent("1.200 de 1.200 registros");
    // Dos tipos distintos: ambos se nombran.
    expect(edad[1]).toHaveTextContent("número");
    expect(edad[1]).toHaveTextContent("texto");
    expect(within(edad[1]!).getAllByRole("listitem")).toHaveLength(2);

    expect(
      screen.getByText(/Velo no la crea por su cuenta/),
    ).toBeInTheDocument();
  });

  it("sin listas ni rutas irregulares lo dice, con su símbolo, y no pinta tablas ni aviso", () => {
    render(<EstructuraDelJson estructura={SIN_LISTAS} />);
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(
      screen.getByText(
        "Ninguna lista dentro de los registros: cada ruta es una columna y se trata como tal.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Todas las rutas están en todos los registros y mantienen un solo tipo.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("✓")).toHaveLength(2);
  });

  it("el aviso fuerte está presente siempre que hay listas sin tratar", () => {
    // Una sola lista basta: el aviso no depende de cuántas sean.
    render(
      <EstructuraDelJson
        estructura={{
          ...SIN_LISTAS,
          noTratadas: [
            { ruta: "a[]", motivo: "lista", registros: 1, pistas: [] },
          ],
        }}
      />,
    );
    expect(
      screen.getByRole("note", { name: "Estas rutas salen sin tocar" }),
    ).toBeInTheDocument();
  });

  it("no promete lo que Velo no puede cumplir", () => {
    render(<EstructuraDelJson estructura={ESTRUCTURA} />);
    expect(document.body.textContent).not.toMatch(
      /garantiz|100\s*%|imposible de reidentificar/i,
    );
  });
});

describe("la estructura de un JSON, en inglés", () => {
  it("dice lo mismo, redactado en inglés y con los miles con coma", () => {
    fijarIdioma("en");
    render(<EstructuraDelJson estructura={ESTRUCTURA} />);
    const panel = screen.getByRole("region", {
      name: "What was treated, and what was not, in this JSON",
    });
    expect(within(panel).getByText("1,200")).toBeInTheDocument();
    expect(within(panel).getByText("Records")).toBeInTheDocument();
    expect(within(panel).getByText("Array of objects")).toBeInTheDocument();

    const aviso = screen.getByRole("note", {
      name: "These paths come out untouched",
    });
    expect(aviso).toHaveTextContent(
      "Velo does not treat the values inside these lists: it copies them into the file as they are.",
    );
    expect(aviso).toHaveTextContent("does not reach them");
    expect(aviso).toHaveTextContent("contactos[].correo will come out as is");

    const tabla = screen.getByRole("table", {
      name: "Lists inside the records that Velo does not treat",
    });
    const celdas = within(fila(tabla, "contactos[]")).getAllByRole("cell");
    expect(celdas[0]).toHaveTextContent("List of objects");
    expect(celdas[1]).toHaveTextContent("1,180 of 1,200");
    expect(
      within(
        fila(
          screen.getByRole("table", {
            name: "Paths that are not in every record or that change type",
          }),
          "edad",
        ),
      ).getAllByRole("cell")[1],
    ).toHaveTextContent(/number.*text|text.*number/);

    // Nada en español, ni una clave del catálogo sin resolver.
    expect(screen.queryByText(/Estas rutas salen/)).toBeNull();
    expect(document.body.textContent).not.toContain("⟦");
    expect(document.body.textContent).not.toMatch(/[¿¡]/);
  });

  it("la forma JSON Lines se nombra en inglés", () => {
    fijarIdioma("en");
    render(<EstructuraDelJson estructura={SIN_LISTAS} />);
    expect(
      screen.getByText("JSON Lines (one object per line)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "No lists inside the records: every path is a column and is treated as one.",
      ),
    ).toBeInTheDocument();
  });
});
