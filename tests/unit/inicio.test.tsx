// La portada (P1) y la página del diagnóstico, en los dos idiomas.
//
// Se montan las páginas de verdad (con el router de Next sustituido por uno mudo) para comprobar
// lo que ninguna prueba de componente ve: que los cuatro pasos, los dos bloques «y después» y el
// estado «sin datos» salen del catálogo en el idioma elegido, y que el énfasis dentro del párrafo
// (la negrita) sigue siendo de la clase que el diseño pide.

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Aduana from "@/app/page";
import PaginaDeDiagnostico from "@/app/diagnostico/page";
import { fijarIdioma } from "@/lib/idioma/estado";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
}));

describe("la portada", () => {
  it("dice los cuatro pasos y los dos «y después» en español", () => {
    render(<Aduana />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Mira tu tabla como la vería un extraño",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText("Velo la lee columna por columna")).toBeVisible();
    expect(screen.getByText("Y semanas después")).toBeInTheDocument();
    expect(screen.getByText("Y meses después")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Ya tengo mi bóveda y el archivo devuelto",
      }),
    ).toHaveAttribute("href", "/regreso");
    expect(
      screen.getByRole("link", { name: "Abrir mi bitácora" }),
    ).toHaveAttribute("href", "/bitacora");
  });

  it("dice lo mismo en inglés, sin dejar nada en español", () => {
    fijarIdioma("en");
    render(<Aduana />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Look at your table the way a stranger would",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Velo reads it column by column")).toBeVisible();
    expect(screen.getByText("And weeks later")).toBeInTheDocument();
    expect(screen.getByText("And months later")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open my log" })).toHaveAttribute(
      "href",
      "/bitacora",
    );
    expect(screen.queryByText(/Cómo funciona/)).toBeNull();
    // Y la honestidad medida no se perdió en la redacción: dice que mide, no que garantiza.
    expect(
      screen.getByText(
        "Velo reduces re-identification risk and measures it; it does not declare any file anonymous.",
      ),
    ).toBeInTheDocument();
  });

  it("la negrita de los dos bloques sigue siendo de la tinta fuerte", () => {
    // El párrafo es `text-tinta-suave` y su énfasis `text-tinta`: antes lo ponía la clase de la
    // propia negrita; ahora la pinta el catálogo y el párrafo se lo pide con una variante.
    render(<Aduana />);
    const negrita = screen.getByText("pone los valores originales de vuelta");
    expect(negrita.tagName).toBe("STRONG");
    expect(negrita.closest("p")?.className).toMatch(/\[&_strong\]:text-tinta/);
  });
});

describe("el diagnóstico sin datos", () => {
  it("explica en español que no quedó nada, y es a propósito", () => {
    render(<PaginaDeDiagnostico />);
    expect(
      screen.getByRole("heading", { name: "No quedó nada, y es a propósito" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Volver a la aduana" }),
    ).toHaveAttribute("href", "/");
  });

  it("lo explica en inglés", () => {
    fijarIdioma("en");
    render(<PaginaDeDiagnostico />);
    expect(
      screen.getByRole("heading", {
        name: "Nothing was left, and that is on purpose",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to the customs checkpoint" }),
    ).toHaveAttribute("href", "/");
  });
});
