// Las tres páginas ante un PDF o una imagen (S6): la aduana navega, el diagnóstico enseña el informe
// de metadatos con su acción, y la ruta del taller abre la limpieza en vez del taller.
//
// Se doblan la sesión (para decidir en qué fase está) y `next/dynamic` (para que las piezas que se
// cargan bajo demanda se monten de verdad). El informe y la limpieza se prueban a fondo en sus
// propios archivos; aquí se comprueba el cableado entre rutas, que es lo que ninguno de los dos ve.

import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fijarIdioma } from "@/lib/idioma/estado";
import type { EstadoDeSesion, EstadoDelTaller } from "@/lib/sesion";

import { INFORME_FOTO, INFORME_PDF } from "./metadatos-informes";

let sesionActual: EstadoDeSesion;
let tallerActual: EstadoDelTaller;
const push = vi.fn<(ruta: string) => void>();
const descartar = vi.fn<() => void>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: () => {} }),
}));
vi.mock("next/dynamic", async () => {
  const { createElement, lazy, Suspense } = await import("react");
  return {
    default: (cargar: () => Promise<ComponentType<object>>) => {
      const Diferido = lazy(async () => ({ default: await cargar() }));
      return (props: object) =>
        createElement(
          Suspense,
          { fallback: null },
          createElement(Diferido, props),
        );
    },
  };
});
vi.mock("@/lib/sesion", async (original) => ({
  ...(await original<typeof import("@/lib/sesion")>()),
  useSesion: () => sesionActual,
  useTaller: () => tallerActual,
  descartar: () => descartar(),
  limpiar: () => {},
}));

import Aduana from "@/app/page";
import PaginaDeDiagnostico from "@/app/diagnostico/page";
import PaginaDeTransformacion from "@/app/transformar/page";

const TALLER_VACIO: EstadoDelTaller = {
  llave: { fase: "sin-llave" },
  transformacion: { fase: "sin-hacer" },
  etapa: null,
  archivo: null,
  archivoEnDisco: null,
  huellaDeSalida: null,
  escrituraFallida: false,
  boveda: { fase: "sin-sellar" },
  archivoDeBoveda: null,
  estimacion: null,
  poblacionDeclarada: null,
  limpieza: { fase: "sin-hacer" },
  comparacion: { fase: "sin-hacer" },
};

beforeEach(() => {
  sesionActual = { fase: "vacio" };
  tallerActual = TALLER_VACIO;
  push.mockClear();
  descartar.mockClear();
});

describe("la aduana ante un PDF o una imagen", () => {
  it("navega al diagnóstico en la TRANSICIÓN a «metadatos», igual que con una tabla", () => {
    const { rerender } = render(<Aduana />);
    expect(push).not.toHaveBeenCalled();
    sesionActual = { fase: "metadatos", informe: INFORME_PDF };
    rerender(<Aduana />);
    expect(push).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledWith("/diagnostico");
  });

  it("no rebota si ya estaba leído: volver con «atrás» no atrapa al usuario", () => {
    sesionActual = { fase: "metadatos", informe: INFORME_PDF };
    const { rerender } = render(<Aduana />);
    rerender(<Aduana />);
    expect(push).not.toHaveBeenCalled();
    // Y la salida está a mano: el enlace al diagnóstico.
    expect(
      screen.getByRole("link", { name: "Ver el diagnóstico" }),
    ).toHaveAttribute("href", "/diagnostico");
  });

  it("pasar de una tabla a otro archivo ya leído no navega dos veces", () => {
    sesionActual = {
      fase: "listo",
      informe: {
        archivo: { nombre: "tabla.csv" },
        diagnostico: { filas: 10 },
      } as never,
    };
    const { rerender } = render(<Aduana />);
    expect(push).not.toHaveBeenCalled();
    sesionActual = { fase: "metadatos", informe: INFORME_PDF };
    rerender(<Aduana />);
    expect(push).not.toHaveBeenCalled();
  });
});

describe("el diagnóstico de metadatos como página", () => {
  it("enseña el informe de metadatos —no el de una tabla— con la acción de limpiar", async () => {
    sesionActual = { fase: "metadatos", informe: INFORME_PDF };
    render(<PaginaDeDiagnostico />);
    // El informe llega bajo demanda, así que se espera; su título es el nombre del archivo.
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "informe-trimestral.pdf",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Qué limpia Velo y qué no toca" }),
    ).toBeInTheDocument();
    // La acción es limpiar, no transformar.
    const accion = screen.getByRole("link", { name: "Limpiar este archivo" });
    expect(accion).toHaveAttribute("href", "/transformar");
    expect(
      screen.getByText(
        /La limpieza no tiene opciones: quita todo lo que no hace falta/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Transformar este archivo" }),
    ).toBeNull();
  });

  it("descartar apaga el worker antes de volver a la aduana", async () => {
    sesionActual = { fase: "metadatos", informe: INFORME_FOTO };
    render(<PaginaDeDiagnostico />);
    await screen.findByRole("heading", { level: 1, name: "fachada.jpg" });
    fireEvent.click(
      screen.getByRole("button", { name: "Analizar otro archivo" }),
    );
    expect(descartar).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledWith("/");
    expect(
      screen.getByText(/Al salir de aquí el informe se descarta/),
    ).toBeInTheDocument();
  });

  it("sin archivo sigue siendo el estado «sin datos» de siempre", () => {
    render(<PaginaDeDiagnostico />);
    expect(
      screen.getByRole("heading", { name: "No quedó nada, y es a propósito" }),
    ).toBeInTheDocument();
  });

  it("dice la acción y su explicación en inglés", async () => {
    fijarIdioma("en");
    sesionActual = { fase: "metadatos", informe: INFORME_PDF };
    render(<PaginaDeDiagnostico />);
    await screen.findByRole("heading", {
      level: 1,
      name: "informe-trimestral.pdf",
    });
    expect(
      screen.getByRole("link", { name: "Clean this file" }),
    ).toHaveAttribute("href", "/transformar");
    expect(
      screen.getByText(
        /The cleaning has no options: it removes everything not needed/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Limpiar este archivo")).toBeNull();
  });
});

describe("la ruta del taller ante un PDF o una imagen", () => {
  it("abre la limpieza, con su acción única", async () => {
    sesionActual = { fase: "metadatos", informe: INFORME_PDF };
    render(<PaginaDeTransformacion />);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Limpia lo que el archivo dice de sí mismo",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Limpiar" })).toBeInTheDocument();
    // No el taller de una tabla: sin editor de política ni «Transformar».
    expect(screen.queryByRole("button", { name: "Transformar" })).toBeNull();
  });

  it("sin archivo no descarga la limpieza: dice que no hay nada que transformar", () => {
    render(<PaginaDeTransformacion />);
    expect(
      screen.getByRole("heading", { name: "No hay nada que transformar" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Limpiar" })).toBeNull();
  });
});
