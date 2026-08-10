// La aduana (P1) y sus cinco estados.
//
// Se prueba el componente presentacional, no la página: así los cinco estados se recorren sin
// levantar un Worker ni un router, y cada uno queda fijado como comportamiento y no como captura.

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ZonaDeCarga } from "@/components/zona-de-carga";
import type { EstadoDeSesion } from "@/lib/sesion";

const ANALIZANDO: Extract<EstadoDeSesion, { fase: "analizando" }> = {
  fase: "analizando",
  nombre: "pacientes.csv",
  bytes: 1_000_000,
  formato: "csv",
  avisoDeTamano: false,
  etapa: "leyendo",
  filas: 40_000,
  bytesLeidos: 250_000,
  bytesTotales: 1_000_000,
};

function montar(
  estado: EstadoDeSesion,
  manejadores: Partial<{
    onArchivo: (a: File) => void;
    onReintentar: () => void;
  }> = {},
) {
  return render(
    <ZonaDeCarga
      estado={estado}
      onArchivo={manejadores.onArchivo ?? (() => {})}
      onReintentar={manejadores.onReintentar ?? (() => {})}
    />,
  );
}

describe("estado vacío — la primera impresión de la app", () => {
  it("ofrece una entrada por teclado, no solo arrastre", () => {
    montar({ fase: "vacio" });
    // El input de archivo es real y está en el árbol de accesibilidad, con su etiqueta asociada.
    // Un <div role="button"> que abre el diálogo por JavaScript se vería igual y dejaría fuera a
    // quien navega con teclado o con lector de pantalla.
    const entrada = screen.getByLabelText("Elegir archivo");
    expect(entrada).toHaveAttribute("type", "file");
  });

  it("declara el tope de Excel donde el usuario decide, no en la documentación", () => {
    montar({ fase: "vacio" });
    expect(screen.getByText(/hasta 150 MB/)).toBeInTheDocument();
  });

  it("responde al arrastre y vuelve a su sitio si el archivo se va", () => {
    const { container } = montar({ fase: "vacio" });
    const zona = container.firstElementChild!;

    fireEvent.dragOver(zona);
    expect(screen.getByText("Suéltalo aquí")).toBeInTheDocument();

    fireEvent.dragLeave(zona);
    expect(screen.getByText("Trae tu tabla")).toBeInTheDocument();
  });

  it("acepta el archivo soltado encima", () => {
    const onArchivo = vi.fn();
    const { container } = montar({ fase: "vacio" }, { onArchivo });
    const archivo = new File(["a,b\n1,2\n"], "soltada.csv");
    fireEvent.drop(container.firstElementChild!, {
      dataTransfer: { files: [archivo] },
    });
    expect(onArchivo).toHaveBeenCalledWith(archivo);
  });

  it("avisa del archivo elegido", () => {
    const onArchivo = vi.fn();
    montar({ fase: "vacio" }, { onArchivo });
    const archivo = new File(["a,b\n1,2\n"], "tabla.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("Elegir archivo"), {
      target: { files: [archivo] },
    });
    expect(onArchivo).toHaveBeenCalledWith(archivo);
  });
});

describe("estado cargando — progreso real o ninguno", () => {
  it("enseña una barra con el avance medido mientras lee", () => {
    montar(ANALIZANDO);
    const barra = screen.getByRole("progressbar");
    expect(barra).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByText(/40\.000 filas leídas/)).toBeInTheDocument();
  });

  it("NO inventa una barra cuando no hay medida que enseñar", () => {
    // Un .xlsx no reporta avance mientras SheetJS abre el libro, y las etapas de clasificación y
    // riesgo no tienen fracción que mostrar. Rellenar el hueco con una barra decorativa sería una
    // mentira pequeña en la única pantalla donde el producto está pidiendo confianza.
    montar({ ...ANALIZANDO, etapa: "clasificando" });
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(
      screen.getByText("Reconociendo qué hay en cada columna"),
    ).toBeInTheDocument();
  });

  it("nombra la etapa en la que va", () => {
    montar({ ...ANALIZANDO, etapa: "midiendo-riesgo" });
    expect(
      screen.getByText("Midiendo el riesgo de reidentificación"),
    ).toBeInTheDocument();
  });

  it("avisa del Excel grande y ofrece la salida", () => {
    montar({
      ...ANALIZANDO,
      formato: "excel",
      nombre: "libro.xlsx",
      bytes: 60 * 1024 * 1024,
      avisoDeTamano: true,
    });
    expect(screen.getByText(/guárdalo como CSV/)).toBeInTheDocument();
  });
});

describe("estado de error — dice qué hacer, no qué falló", () => {
  it("explica la salida para un formato que no lee", () => {
    montar({
      fase: "error",
      motivo: "formato-no-soportado",
      nombre: "notas.txt",
    });
    const alerta = screen.getByRole("alert", {
      name: "Velo no reconoce ese tipo de archivo",
    });
    expect(alerta).toHaveTextContent("guárdalo como CSV");
    expect(alerta).toHaveTextContent("notas.txt");
  });

  it("explica el tope de Excel con su razón", () => {
    montar({
      fase: "error",
      motivo: "excel-excede-tope",
      nombre: "enorme.xlsx",
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      /el CSV se lee por partes y no tiene tope/i,
    );
  });

  it("deja volver a intentar", () => {
    const onReintentar = vi.fn();
    montar(
      { fase: "error", motivo: "lectura-fallida", nombre: "roto.csv" },
      { onReintentar },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Elegir otro archivo" }),
    );
    expect(onReintentar).toHaveBeenCalledOnce();
  });

  it("nunca reenvía el detalle técnico del parser a la pantalla", () => {
    // El motivo original de PapaParse o de SheetJS puede citar el contenido de la línea que
    // falló. Por eso el worker manda una etiqueta cerrada y la UI la traduce; lo que se ve es
    // texto escrito por nosotros, no texto derivado del archivo.
    montar({ fase: "error", motivo: "lectura-fallida", nombre: "roto.csv" });
    expect(screen.queryByText(/lectura-fallida/)).not.toBeInTheDocument();
  });
});
