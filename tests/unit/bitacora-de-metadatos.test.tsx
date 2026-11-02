// Una limpieza de metadatos en la bitácora (S6).
//
// El ADR-007 decidió que una entrada guarda las dos puntas del riesgo; una limpieza de un PDF o una
// imagen no tiene riesgo que medir, ni filas, ni técnicas, y sus campos de eso van en CERO. Una
// pantalla que los pintara enseñaría una medición que no se hizo («0 filas», «0 % antes · 0 %
// después»). Aquí se comprueba que no lo hace: la entrada se lee como lo que es, una limpieza.
//
// Se prueba con el estado de la bitácora doblado (una abierta con entradas) y con la anotación
// pendiente real, que es la que llega desde la pantalla de la limpieza.

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EntradaDeBitacora } from "@/engine/bitacora";
import { fijarIdioma } from "@/lib/idioma/estado";
import type { EstadoDeBitacora } from "@/lib/bitacora";

let estadoDoblado: EstadoDeBitacora | null = null;

vi.mock("@/lib/bitacora", async (original) => {
  const real = await original<typeof import("@/lib/bitacora")>();
  return {
    ...real,
    useBitacora: () => estadoDoblado ?? real.useBitacora(),
  };
});

import { Bitacora } from "@/components/bitacora";
import { anotarTratamiento, descartarAnotacion } from "@/lib/bitacora";

const LIMPIEZA_PDF: EntradaDeBitacora = {
  fecha: "2 de noviembre de 2026, 10:15",
  archivo: "informe-trimestral.pdf",
  hashDePolitica: "",
  tecnicas: [],
  filas: 0,
  unicosAntes: 0,
  unicosDespues: 0,
  esTitular: true,
  huellaDeEntrada: "a".repeat(64),
  huellaDeSalida: "b".repeat(64),
  metadatos: { formato: "pdf", campos: 5, elementos: 4, revisionesQuitadas: 2 },
};

const LIMPIEZA_FOTO: EntradaDeBitacora = {
  ...LIMPIEZA_PDF,
  archivo: "fachada.jpg",
  huellaDeEntrada: "c".repeat(64),
  huellaDeSalida: "d".repeat(64),
  metadatos: {
    formato: "jpeg",
    campos: 3,
    elementos: 5,
    revisionesQuitadas: 0,
  },
};

const TRATAMIENTO: EntradaDeBitacora = {
  fecha: "13 de agosto de 2026, 21:04",
  archivo: "pacientes-2026.csv",
  hashDePolitica: "abc12345def67890",
  tecnicas: ["enmascarar"],
  filas: 2_000,
  unicosAntes: 0.3,
  unicosDespues: 0.02,
  esTitular: true,
  huellaDeEntrada: "e".repeat(64),
  huellaDeSalida: "f".repeat(64),
};

function abiertaCon(entradas: EntradaDeBitacora[]): EstadoDeBitacora {
  return {
    archivo: {
      fase: "abierta",
      contenido: { version: 1, entradas, huella: "9".repeat(64) },
    },
    pendiente: null,
    sellando: false,
    guardado: null,
    etapa: null,
  };
}

afterEach(() => {
  cleanup();
  estadoDoblado = null;
  act(() => descartarAnotacion());
});

describe("la anotación pendiente de una limpieza", () => {
  it("se lee como una limpieza: formato, campos, bloques y versiones, y las dos huellas", () => {
    act(() => anotarTratamiento(LIMPIEZA_PDF));
    render(<Bitacora />);
    const detalle = screen.getByText("Limpieza de metadatos").closest("dl")!;
    const termino = (nombre: string) =>
      within(detalle).getByText(nombre).nextElementSibling;
    expect(termino("Tratamiento")).toHaveTextContent("Limpieza de metadatos");
    expect(termino("Formato")).toHaveTextContent("PDF");
    expect(termino("Campos con nombre")).toHaveTextContent("5");
    expect(termino("Bloques quitados")).toHaveTextContent("4");
    expect(termino("Versiones anteriores quitadas")).toHaveTextContent("2");
    expect(termino("Huella de entrada")).toHaveTextContent("a".repeat(16));
    expect(termino("Huella de salida")).toHaveTextContent("b".repeat(16));
    expect(detalle).toHaveTextContent(
      "El contenido —el texto de las páginas, lo que se ve en la imagen— no se tocó",
    );
  });

  it("NUNCA enseña las líneas de filas, técnicas, política ni riesgo: serían ceros sin sentido", () => {
    act(() => anotarTratamiento(LIMPIEZA_PDF));
    render(<Bitacora />);
    for (const linea of ["Filas", "Técnicas", "Registros únicos", "Política"])
      expect(screen.queryByText(linea)).toBeNull();
    const texto = document.body.textContent ?? "";
    expect(texto).not.toMatch(/0 filas/);
    expect(texto).not.toMatch(/0 % antes|antes · 0 %/);
    expect(texto).not.toMatch(/salvedades/);
  });

  it("una foto no tiene versiones que quitar, y no finge que sí", () => {
    act(() => anotarTratamiento(LIMPIEZA_FOTO));
    render(<Bitacora />);
    expect(screen.getByText("Formato").nextElementSibling).toHaveTextContent(
      "JPEG",
    );
    expect(screen.queryByText("Versiones anteriores quitadas")).toBeNull();
  });

  it("lo dice en inglés, también sin filas ni riesgo", () => {
    fijarIdioma("en");
    act(() => anotarTratamiento(LIMPIEZA_PDF));
    render(<Bitacora />);
    expect(
      screen.getByText("Metadata cleaning", { selector: "dd" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Named fields")).toBeInTheDocument();
    expect(screen.getByText("Blocks removed")).toBeInTheDocument();
    expect(screen.getByText("Earlier versions removed")).toBeInTheDocument();
    expect(screen.queryByText("Rows")).toBeNull();
    expect(screen.queryByText("Unique records")).toBeNull();
    expect(
      screen.getByText(
        /were not touched: this cleaning removes what the file said about itself/,
      ),
    ).toBeInTheDocument();
  });
});

describe("la lista de una bitácora abierta", () => {
  it("la línea de una limpieza dice qué fue, no cuántas filas ni qué técnicas", () => {
    estadoDoblado = abiertaCon([TRATAMIENTO, LIMPIEZA_PDF, LIMPIEZA_FOTO]);
    render(<Bitacora />);
    // De la más reciente a la más antigua.
    expect(
      screen.getByText(
        "2 de noviembre de 2026, 10:15 · limpieza de metadatos · JPEG",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "2 de noviembre de 2026, 10:15 · limpieza de metadatos · PDF",
      ),
    ).toBeInTheDocument();
    // La del tratamiento de una tabla sigue siendo la de siempre.
    expect(
      screen.getByText(
        /13 de agosto de 2026, 21:04 · 2\.000 filas · enmascarada/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("3 tratamientos anotados")).toBeInTheDocument();
  });

  it("desplegar una limpieza enseña su detalle; desplegar un tratamiento, el suyo", () => {
    estadoDoblado = abiertaCon([TRATAMIENTO, LIMPIEZA_PDF]);
    render(<Bitacora />);

    fireEvent.click(
      screen.getByRole("button", { name: /informe-trimestral\.pdf/ }),
    );
    expect(screen.getByText("Bloques quitados")).toBeInTheDocument();
    expect(screen.queryByText("Registros únicos")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: /pacientes-2026\.csv/ }),
    );
    expect(screen.getByText("Registros únicos")).toBeInTheDocument();
    expect(screen.getByText(/30 % antes · 2,0 % después/)).toBeInTheDocument();
    // Y el detalle de la limpieza ya no está desplegado (se abre una a la vez).
    expect(screen.queryByText("Bloques quitados")).toBeNull();
  });

  it("la línea también sale en inglés", () => {
    fijarIdioma("en");
    estadoDoblado = abiertaCon([LIMPIEZA_FOTO]);
    render(<Bitacora />);
    expect(
      screen.getByText(
        "2 de noviembre de 2026, 10:15 · metadata cleaning · JPEG",
      ),
    ).toBeInTheDocument();
  });
});
