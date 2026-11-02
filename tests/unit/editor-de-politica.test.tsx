// El editor de política — y en particular el k, que es donde la pantalla podía prometer algo que
// el motor no iba a hacer (hallazgo A1 de la auditoría del S2).
//
// El defecto no era un cálculo: la casilla pintaba `kObjetivo ?? 5` y la política guardaba `null`.
// La pantalla decía en futuro «Velo generaliza esas columnas hasta que nadie quede en un grupo de
// menos de 5», el motor solo reparte con un k declarado, y las columnas salían INTACTAS. Cada
// afirmación de la pantalla era cierta por separado.

import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EditorDePolitica } from "@/components/editor-de-politica";
import type { HallazgoDeColumna } from "@/engine/clasificador";
import { exportarPolitica, type Politica } from "@/engine/politica";
import { fijarIdioma } from "@/lib/idioma/estado";

const COLUMNAS = [
  { nombre: "edad", tipo: "numero", categoria: "cuasi-identificador" },
  { nombre: "municipio", tipo: "texto", categoria: "cuasi-identificador" },
] as unknown as HallazgoDeColumna[];

const SIN_REGLAS: Politica = {
  version: 1,
  origen: "manual",
  reglas: [],
  kObjetivo: null,
};

const AUTOMATICO: Politica["reglas"][number] = {
  columna: "edad",
  tecnica: { tipo: "generalizar-automatico" },
};

describe("elegir «generalizar hasta el k» fija el k en la política", () => {
  it("lo pone en 5, no solo en la casilla", () => {
    const onCambio = vi.fn();
    render(
      <EditorDePolitica
        columnas={COLUMNAS}
        politica={SIN_REGLAS}
        onCambio={onCambio}
      />,
    );

    fireEvent.change(screen.getByLabelText("Técnica para la columna edad"), {
      target: { value: "generalizar-automatico" },
    });

    expect(onCambio).toHaveBeenCalledOnce();
    const siguiente = onCambio.mock.calls[0][0] as Politica;
    expect(siguiente.kObjetivo).toBe(5);
    expect(siguiente.reglas).toContainEqual(AUTOMATICO);
  });

  it("y NO pisa el k que el usuario ya había escrito", () => {
    // Sin esta prueba, «fijar el k» podría implementarse machacándolo en cada cambio de columna, y
    // el 20 que alguien eligió a conciencia volvería a 5 al tocar la fila de al lado.
    const onCambio = vi.fn();
    render(
      <EditorDePolitica
        columnas={COLUMNAS}
        politica={{ ...SIN_REGLAS, reglas: [AUTOMATICO], kObjetivo: 20 }}
        onCambio={onCambio}
      />,
    );

    fireEvent.change(
      screen.getByLabelText("Técnica para la columna municipio"),
      { target: { value: "generalizar-automatico" } },
    );

    expect((onCambio.mock.calls[0][0] as Politica).kObjetivo).toBe(20);
  });
});

describe("una política importada que pide reparto y no trae k", () => {
  // Este estado la UI ya no lo produce, pero un archivo de política sí puede traerlo: el esquema lo
  // admite. La casilla no puede inventarse un 5 ahí.
  const IMPORTADA: Politica = {
    ...SIN_REGLAS,
    reglas: [AUTOMATICO],
    kObjetivo: null,
  };

  it("la casilla va VACÍA, no con un 5 de adorno", () => {
    render(
      <EditorDePolitica
        columnas={COLUMNAS}
        politica={IMPORTADA}
        onCambio={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/Grupo mínimo \(k\)/)).toHaveValue(null);
  });

  it("y la pantalla dice que esas columnas saldrían intactas", () => {
    render(
      <EditorDePolitica
        columnas={COLUMNAS}
        politica={IMPORTADA}
        onCambio={vi.fn()}
      />,
    );
    expect(screen.getByText(/saldrían intactas/)).toBeInTheDocument();
    expect(screen.queryByText(/Con k =/)).not.toBeInTheDocument();
  });

  it("con k, la explicación vuelve y la advertencia se va", () => {
    render(
      <EditorDePolitica
        columnas={COLUMNAS}
        politica={{ ...IMPORTADA, kObjetivo: 7 }}
        onCambio={vi.fn()}
      />,
    );
    expect(screen.getByText(/Con k = 7/)).toBeInTheDocument();
    expect(screen.queryByText(/saldrían intactas/)).not.toBeInTheDocument();
  });
});

describe("el editor en inglés", () => {
  // Mismo componente, otro idioma: lo que cambia es el texto y la convención de los números, no
  // el comportamiento ni lo que se manda a la política.
  it("habla en inglés y escribe los miles con coma", () => {
    fijarIdioma("en");
    render(
      <EditorDePolitica
        columnas={COLUMNAS}
        politica={{ ...SIN_REGLAS, reglas: [AUTOMATICO], kObjetivo: 1_234 }}
        onCambio={vi.fn()}
      />,
    );
    expect(screen.getByText("What happens to each column")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Technique for column edad"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Minimum group size \(k\)/),
    ).toBeInTheDocument();
    // «1,234», no «1.234»: la convención del idioma, aplicada a la cifra que viaja cruda.
    expect(screen.getByText(/With k = 1,234/)).toBeInTheDocument();
    expect(screen.queryByText(/Con k =/)).not.toBeInTheDocument();
  });

  it("elegir una técnica en inglés manda lo mismo a la política", () => {
    fijarIdioma("en");
    const onCambio = vi.fn();
    render(
      <EditorDePolitica
        columnas={COLUMNAS}
        politica={SIN_REGLAS}
        onCambio={onCambio}
      />,
    );
    // La opción es la misma, solo cambia su rótulo.
    expect(
      screen.getAllByRole("option", { name: "Generalize until k is reached" }),
    ).toHaveLength(COLUMNAS.length);
    fireEvent.change(screen.getByLabelText("Technique for column edad"), {
      target: { value: "generalizar-automatico" },
    });
    const siguiente = onCambio.mock.calls[0][0] as Politica;
    expect(siguiente.kObjetivo).toBe(5);
    expect(siguiente.reglas).toContainEqual(AUTOMATICO);
  });

  it("la advertencia de una política de fábrica sigue diciendo que no es una certificación", () => {
    fijarIdioma("en");
    render(
      <EditorDePolitica
        columnas={COLUMNAS}
        politica={{ ...SIN_REGLAS, origen: "hipaa" }}
        onCambio={vi.fn()}
      />,
    );
    expect(screen.getByText(/not a certification/)).toBeInTheDocument();
    expect(
      screen.getByText(/Safe Harbor requires REMOVING/),
    ).toBeInTheDocument();
  });

  it("el error de importar se repinta si cambia el idioma", async () => {
    fijarIdioma("es");
    const { container, rerender } = render(
      <EditorDePolitica
        columnas={COLUMNAS}
        politica={SIN_REGLAS}
        onCambio={vi.fn()}
      />,
    );
    const entrada = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const archivo = new File(["{ esto no es json"], "mala.json", {
      type: "application/json",
    });
    // jsdom no implementa `File.text()` en todas las versiones: se completa si falta.
    if (!archivo.text)
      Object.assign(archivo, { text: async () => "{ esto no es json" });
    fireEvent.change(entrada, { target: { files: [archivo] } });
    expect(
      await screen.findByText(/No se pudo importar: El archivo no es un JSON/),
    ).toBeInTheDocument();

    act(() => fijarIdioma("en"));
    rerender(
      <EditorDePolitica
        columnas={COLUMNAS}
        politica={SIN_REGLAS}
        onCambio={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        /Could not import: The file is not a JSON that can be read/,
      ),
    ).toBeInTheDocument();
  });
});

describe("la bóveda en un JSON (S6): el regreso lee solo CSV", () => {
  const SEUDONIMO: Politica["reglas"][number] = {
    columna: "edad",
    tecnica: { tipo: "seudonimizar", longitud: 16 },
  };
  const CON_SEUDONIMO: Politica = { ...SIN_REGLAS, reglas: [SEUDONIMO] };

  function casilla(): HTMLInputElement {
    return screen.getByRole("checkbox") as HTMLInputElement;
  }

  it("en un JSON la casilla de poder deshacer está apagada y dice por qué", () => {
    render(
      <EditorDePolitica
        columnas={COLUMNAS}
        politica={CON_SEUDONIMO}
        onCambio={vi.fn()}
        formato="json"
      />,
    );
    expect(casilla()).toBeDisabled();
    expect(casilla()).not.toBeChecked();
    expect(
      screen.getByText(
        /No disponible con un JSON: el regreso funciona solo con CSV/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/no serviría de nada/)).toBeInTheDocument();
    // No hay la frase que promete la bóveda: la que prometía lo contrario de lo que se ve.
    expect(screen.queryByText(/Guarda la correspondencia/)).toBeNull();
  });

  it("apagada no manda nada a la política aunque se intente", () => {
    const onCambio = vi.fn();
    render(
      <EditorDePolitica
        columnas={COLUMNAS}
        politica={CON_SEUDONIMO}
        onCambio={onCambio}
        formato="json"
      />,
    );
    fireEvent.click(casilla());
    expect(onCambio).not.toHaveBeenCalled();
  });

  it("en un JSON no aparece el aviso de «vas a poder guardar una bóveda»", () => {
    render(
      <EditorDePolitica
        columnas={COLUMNAS}
        politica={CON_SEUDONIMO}
        onCambio={vi.fn()}
        formato="json"
      />,
    );
    expect(screen.queryByText(/guardar una bóveda/)).toBeNull();
  });

  it.each(["csv", "excel"] as const)(
    "en %s la casilla sigue activa y funciona como siempre",
    (formato) => {
      const onCambio = vi.fn();
      render(
        <EditorDePolitica
          columnas={COLUMNAS}
          politica={CON_SEUDONIMO}
          onCambio={onCambio}
          formato={formato}
        />,
      );
      expect(casilla()).toBeEnabled();
      expect(
        screen.getByText(/Guarda la correspondencia en un archivo cifrado/),
      ).toBeInTheDocument();
      expect(screen.queryByText(/No disponible con un JSON/)).toBeNull();
      fireEvent.click(casilla());
      const siguiente = onCambio.mock.calls[0][0] as Politica;
      expect(siguiente.reglas[0]!.tecnica).toMatchObject({
        tipo: "seudonimizar",
        reversible: true,
      });
    },
  );

  it("sin decir el formato se comporta como un CSV", () => {
    render(
      <EditorDePolitica
        columnas={COLUMNAS}
        politica={CON_SEUDONIMO}
        onCambio={vi.fn()}
      />,
    );
    expect(casilla()).toBeEnabled();
  });

  it("la columna que no es seudónimo no trae casilla, tampoco en un JSON", () => {
    render(
      <EditorDePolitica
        columnas={COLUMNAS}
        politica={SIN_REGLAS}
        onCambio={vi.fn()}
        formato="json"
      />,
    );
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("lo dice en inglés", () => {
    fijarIdioma("en");
    render(
      <EditorDePolitica
        columnas={COLUMNAS}
        politica={CON_SEUDONIMO}
        onCambio={vi.fn()}
        formato="json"
      />,
    );
    expect(casilla()).toBeDisabled();
    expect(
      screen.getByText(
        /Not available with a JSON: the return flow works only with CSV, so a vault for this file would be useless/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No disponible/)).toBeNull();
  });

  describe("una política importada que pedía bóveda", () => {
    const PEDIA_VUELTA: Politica = {
      ...SIN_REGLAS,
      reglas: [
        {
          columna: "edad",
          tecnica: { tipo: "seudonimizar", longitud: 16, reversible: true },
        },
        {
          columna: "municipio",
          tecnica: {
            tipo: "seudonimizar-con-formato",
            formato: "cedula",
            reversible: true,
          },
        },
      ],
    };

    async function importarEn(formato: "json" | "csv", onCambio = vi.fn()) {
      const { container } = render(
        <EditorDePolitica
          columnas={COLUMNAS}
          politica={SIN_REGLAS}
          onCambio={onCambio}
          formato={formato}
        />,
      );
      const texto = exportarPolitica(PEDIA_VUELTA);
      const archivo = new File([texto], "velo-politica.json", {
        type: "application/json",
      });
      // jsdom no implementa `File.text()` en todas las versiones: se completa si falta.
      if (!archivo.text) Object.assign(archivo, { text: async () => texto });
      fireEvent.change(
        container.querySelector('input[type="file"]') as HTMLInputElement,
        { target: { files: [archivo] } },
      );
      return onCambio;
    }

    it("en un JSON se le quita la vuelta y se avisa, con el número de columnas", async () => {
      const onCambio = await importarEn("json");
      expect(
        await screen.findByText(
          /pedía poder deshacer 2 columnas con una bóveda/,
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent(
        "esas columnas quedaron",
      );
      const aplicada = onCambio.mock.calls[0][0] as Politica;
      expect(aplicada.reglas).toHaveLength(2);
      for (const regla of aplicada.reglas)
        expect(regla.tecnica).not.toHaveProperty("reversible", true);
    });

    it("en un CSV se respeta tal cual y no se avisa de nada", async () => {
      const onCambio = await importarEn("csv");
      await vi.waitFor(() => expect(onCambio).toHaveBeenCalled());
      const aplicada = onCambio.mock.calls[0][0] as Politica;
      expect(aplicada.reglas[0]!.tecnica).toMatchObject({ reversible: true });
      expect(screen.queryByRole("status")).toBeNull();
    });
  });
});
