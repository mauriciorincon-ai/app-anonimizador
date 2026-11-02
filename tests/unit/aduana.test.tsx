// La aduana (P1) y sus cinco estados.
//
// Se prueba el componente presentacional, no la página: así los cinco estados se recorren sin
// levantar un Worker ni un router, y cada uno queda fijado como comportamiento y no como captura.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ZonaDeCarga } from "@/components/zona-de-carga";
import { fijarIdioma } from "@/lib/idioma/estado";
import type { EstadoDeSesion } from "@/lib/sesion";

import { INFORME_PDF } from "./metadatos-informes";

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

describe("la zona de carga, en inglés", () => {
  it("dice el estado vacío en inglés y declara el tope de Excel", () => {
    fijarIdioma("en");
    montar({ fase: "vacio" });
    expect(screen.getByLabelText("Choose file")).toHaveAttribute(
      "type",
      "file",
    );
    expect(screen.getByText("Bring your table")).toBeInTheDocument();
    expect(screen.getByText(/up to 150 MB/)).toBeInTheDocument();
    // Y el español no se quedó en la pantalla.
    expect(screen.queryByText("Trae tu tabla")).not.toBeInTheDocument();
  });

  it("escribe los miles con la convención del inglés mientras lee", () => {
    fijarIdioma("en");
    montar(ANALIZANDO);
    expect(screen.getByText(/40,000 rows read/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-label",
      "Reading the file",
    );
  });

  it("dice qué hacer cuando el archivo falla, también en inglés", () => {
    fijarIdioma("en");
    montar({
      fase: "error",
      motivo: "excel-excede-tope",
      nombre: "enorme.xlsx",
    });
    const alerta = screen.getByRole("alert", {
      name: "That Excel file is bigger than Velo can open",
    });
    expect(alerta).toHaveTextContent("Save it as CSV");
    expect(alerta).toHaveTextContent("The limit for Excel is 150 MB");
    expect(
      screen.getByRole("button", { name: "Choose another file" }),
    ).toBeInTheDocument();
  });
});

describe("JSON en la zona de carga (S6)", () => {
  it("el selector de archivos acepta JSON y JSON Lines además de CSV y Excel", () => {
    montar({ fase: "vacio" });
    const accept = screen
      .getByLabelText("Elegir archivo")
      .getAttribute("accept");
    for (const admitido of [
      ".csv",
      ".xlsx",
      ".xls",
      ".json",
      ".jsonl",
      ".ndjson",
      "application/json",
    ])
      expect(accept).toContain(admitido);
  });

  it("la pista bajo la zona nombra el JSON junto al CSV y al Excel, en los dos idiomas", () => {
    montar({ fase: "vacio" });
    expect(screen.getByText(/CSV, Excel o JSON/)).toBeInTheDocument();
    expect(screen.getByText(/hasta 150 MB/)).toBeInTheDocument();
    expect(
      screen.getByText(/el JSON se limita por la cantidad de celdas/),
    ).toBeInTheDocument();
  });

  it("la pista en inglés nombra el JSON y conserva el tope de Excel", () => {
    fijarIdioma("en");
    montar({ fase: "vacio" });
    expect(screen.getByText(/CSV, Excel or JSON/)).toBeInTheDocument();
    expect(screen.getByText(/up to 150 MB/)).toBeInTheDocument();
    expect(
      screen.getByText(/JSON is capped by its number of cells/),
    ).toBeInTheDocument();
  });

  it("soltar un .json avisa del archivo igual que un CSV", () => {
    const onArchivo = vi.fn();
    const { container } = montar({ fase: "vacio" }, { onArchivo });
    const archivo = new File(["[]"], "pacientes.json", {
      type: "application/json",
    });
    fireEvent.drop(container.firstElementChild!, {
      dataTransfer: { files: [archivo] },
    });
    expect(onArchivo).toHaveBeenCalledWith(archivo);
  });

  it("el formato no soportado ya nombra el JSON entre lo que sí se lee", () => {
    montar({
      fase: "error",
      motivo: "formato-no-soportado",
      nombre: "notas.txt",
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "CSV (.csv), Excel (.xlsx, .xls) y JSON (.json, .jsonl, .ndjson)",
    );
  });

  // Cada motivo nuevo: qué está mal (el título del alert) y qué hacer (un trozo de la salida).
  const MOTIVOS_JSON = [
    {
      motivo: "json-invalido",
      es: [
        "Ese archivo no es un JSON válido",
        /ábrelo en un editor, corrígelo/,
      ],
      en: ["That file is not valid JSON", /open it in an editor, fix it/],
    },
    {
      motivo: "json-no-es-registros",
      es: [
        "Ese JSON no es una lista de registros",
        /envuélvelos en un arreglo o guarda uno por línea/,
      ],
      en: [
        "That JSON is not a list of records",
        /wrap them in an array or save one per line/,
      ],
    },
    {
      motivo: "json-demasiado-profundo",
      es: [
        "Ese JSON tiene demasiados niveles de anidamiento",
        /hasta 32 niveles dentro de un registro.*aplánalo en el origen/,
      ],
      en: [
        "That JSON is nested too deeply",
        /up to 32 levels inside a record.*flatten it at the source/,
      ],
    },
    {
      motivo: "json-demasiado-ancho",
      es: [
        "Ese JSON tiene demasiados campos distintos",
        /hasta 256 rutas distintas.*una clave fija y el dato como valor/,
      ],
      en: [
        "That JSON has too many distinct fields",
        /up to 256 distinct paths.*a fixed key, with the data as its value/,
      ],
    },
    {
      motivo: "json-claves-duplicadas",
      es: ["Un registro repite una clave", /cada clave aparezca una sola vez/],
      en: ["A record repeats a key", /each key appears only once/],
    },
    {
      motivo: "json-excede-tope",
      es: [
        "Ese JSON es más grande de lo que Velo puede tratar",
        /20\.000\.000 celdas.*Divide el archivo en partes/,
      ],
      en: [
        "That JSON is bigger than Velo can handle",
        /20,000,000 cells.*Split the file into parts/,
      ],
    },
    {
      motivo: "formato-no-coincide",
      es: [
        "El contenido no es el que anuncia el nombre del archivo",
        /un .json que en realidad es un PDF/,
      ],
      en: [
        "The content is not what the file name announces",
        /a .json that is really a PDF/,
      ],
    },
  ] as const;

  it.each(MOTIVOS_JSON)(
    "$motivo: dice qué está mal y qué hacer, en español",
    ({ motivo, es }) => {
      montar({ fase: "error", motivo, nombre: "datos.json" });
      const alerta = screen.getByRole("alert", { name: es[0] });
      expect(alerta).toHaveTextContent(es[1]);
      expect(alerta).toHaveTextContent("datos.json");
      // Nunca la clave cruda del motivo, ni un marcador sin llenar.
      expect(alerta.textContent).not.toContain(motivo);
      expect(alerta.textContent).not.toMatch(/\{[A-Za-z]+\}/);
      // Sin línea que citar, no hay frase de línea ni hueco donde iba.
      expect(alerta).not.toHaveTextContent(/línea \d/);
      expect(
        screen.getByRole("button", { name: "Elegir otro archivo" }),
      ).toBeInTheDocument();
    },
  );

  it.each(MOTIVOS_JSON)(
    "$motivo: dice qué está mal y qué hacer, en inglés",
    ({ motivo, en }) => {
      fijarIdioma("en");
      montar({ fase: "error", motivo, nombre: "data.json" });
      const alerta = screen.getByRole("alert", { name: en[0] });
      expect(alerta).toHaveTextContent(en[1]);
      expect(alerta.textContent).not.toContain(motivo);
      expect(alerta.textContent).not.toMatch(/\{[A-Za-z]+\}/);
      expect(alerta.textContent).not.toMatch(/[¿¡]/);
      expect(alerta).not.toHaveTextContent(/line \d/);
      expect(
        screen.getByRole("button", { name: "Choose another file" }),
      ).toBeInTheDocument();
    },
  );

  it("cita la línea donde el lector se detuvo, como número, en los dos idiomas", () => {
    montar({
      fase: "error",
      motivo: "json-invalido",
      nombre: "datos.jsonl",
      linea: 1234,
    });
    // «1234», no «1.234»: una línea no lleva separador de miles.
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Velo se detuvo en la línea 1234: ahí, o justo antes, aparece el problema.",
    );
  });

  it("la línea también se cita en inglés", () => {
    fijarIdioma("en");
    montar({
      fase: "error",
      motivo: "json-claves-duplicadas",
      nombre: "data.jsonl",
      linea: 7,
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Velo stopped at line 7: the problem is there, or just before it.",
    );
  });

  it("la línea 1 de un arreglo en una sola línea también se dice", () => {
    montar({
      fase: "error",
      motivo: "json-invalido",
      nombre: "uno.json",
      linea: 1,
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/en la línea 1:/);
  });
});

describe("PDF e imágenes en la zona de carga (S6)", () => {
  it("el selector de archivos acepta PDF, JPEG, PNG y WebP además de las tablas", () => {
    montar({ fase: "vacio" });
    const accept = screen
      .getByLabelText("Elegir archivo")
      .getAttribute("accept");
    for (const admitido of [
      ".csv",
      ".json",
      ".pdf",
      ".jpg",
      ".jpeg",
      ".png",
      ".webp",
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ])
      expect(accept).toContain(admitido);
  });

  it("la pista nombra el PDF y las imágenes con SU tope, aparte del de Excel", () => {
    montar({ fase: "vacio" });
    expect(screen.getByText(/hasta 150 MB/)).toHaveTextContent(
      "También limpia los metadatos de un PDF (hasta 50 MB) o de una imagen JPEG, PNG o WebP (hasta 100 MB).",
    );
  });

  it("la pista en inglés también", () => {
    fijarIdioma("en");
    montar({ fase: "vacio" });
    expect(screen.getByText(/up to 150 MB/)).toHaveTextContent(
      "Velo also cleans the metadata of a PDF (up to 50 MB) or of a JPEG, PNG or WebP image (up to 100 MB).",
    );
  });

  it("soltar un .pdf avisa del archivo igual que una tabla", () => {
    const onArchivo = vi.fn();
    const { container } = montar({ fase: "vacio" }, { onArchivo });
    const archivo = new File(["%PDF-1.7"], "informe.pdf", {
      type: "application/pdf",
    });
    fireEvent.drop(container.firstElementChild!, {
      dataTransfer: { files: [archivo] },
    });
    expect(onArchivo).toHaveBeenCalledWith(archivo);
  });

  it("el formato no soportado ya nombra el PDF y las imágenes entre lo que sí limpia", () => {
    montar({
      fase: "error",
      motivo: "formato-no-soportado",
      nombre: "notas.txt",
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "limpia los metadatos de PDF (.pdf) e imágenes (.jpg, .png, .webp)",
    );
  });

  // Mientras lee: no hay filas que contar, y decir «0 filas leídas» sería contar algo que no pasa.
  const PDF_LEYENDO: Extract<EstadoDeSesion, { fase: "analizando" }> = {
    ...ANALIZANDO,
    nombre: "informe.pdf",
    formato: "pdf",
    etapa: "leyendo-metadatos",
    filas: 0,
    bytesLeidos: 0,
    bytesTotales: 2_400_000,
  };

  it("nombra la etapa de leer los metadatos y no inventa filas ni barra", () => {
    montar(PDF_LEYENDO);
    expect(
      screen.getByText("Leyendo lo que el archivo dice de sí mismo"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText(/filas leídas/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Velo abre el archivo entero en memoria/),
    ).toBeInTheDocument();
  });

  it("la etapa y la nota de memoria también salen en inglés", () => {
    fijarIdioma("en");
    montar(PDF_LEYENDO);
    expect(
      screen.getByText("Reading what the file says about itself"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/rows read/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Velo opens the whole file in memory/),
    ).toBeInTheDocument();
  });

  it("antes de leer, la huella sí lleva barra y ningún conteo de filas", () => {
    montar({ ...PDF_LEYENDO, etapa: "huella", bytesLeidos: 600_000 });
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "25",
    );
    expect(screen.queryByText(/filas leídas/)).not.toBeInTheDocument();
  });

  it("al terminar cuenta los campos con nombre —no filas— y ofrece el diagnóstico", () => {
    montar({ fase: "metadatos", informe: INFORME_PDF });
    expect(screen.getByRole("status")).toHaveTextContent("Listo");
    expect(screen.getByText("informe-trimestral.pdf")).toBeInTheDocument();
    expect(screen.getByText("5 campos con nombre encontrados")).toBeVisible();
    expect(screen.queryByText(/filas revisadas/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ver el diagnóstico" }),
    ).toHaveAttribute("href", "/diagnostico");
  });

  it("al terminar con un solo campo habla en singular, y en inglés con su convención", () => {
    const uno = {
      ...INFORME_PDF,
      metadatos: {
        ...INFORME_PDF.metadatos,
        campos: INFORME_PDF.metadatos.campos.slice(0, 1),
      },
    };
    montar({ fase: "metadatos", informe: uno });
    expect(screen.getByText("1 campo con nombre encontrado")).toBeVisible();
    cleanup();
    fijarIdioma("en");
    montar({ fase: "metadatos", informe: INFORME_PDF });
    expect(screen.getByText("5 named fields found")).toBeVisible();
  });

  // Cada motivo nuevo: qué está mal (el título del alert) y qué hacer (un trozo de la salida).
  const MOTIVOS_BINARIOS = [
    {
      motivo: "pdf-cifrado",
      es: [
        "Ese PDF está protegido con contraseña",
        /Velo no pide contraseñas.*Quita la protección con el programa que lo creó/,
      ],
      en: [
        "That PDF is password-protected",
        /Velo does not ask for passwords.*Remove the protection with the program that made it/,
      ],
    },
    {
      motivo: "pdf-ilegible",
      es: ["No se pudo leer ese PDF", /imprímelo a PDF o guárdalo de nuevo/],
      en: [
        "That PDF could not be read",
        /print it to PDF or save it again from there/,
      ],
    },
    {
      motivo: "imagen-ilegible",
      es: [
        "No se pudo leer esa imagen",
        /Velo lee JPEG, PNG y WebP.*expórtala de nuevo/,
      ],
      en: [
        "That image could not be read",
        /Velo reads JPEG, PNG and WebP.*export it again/,
      ],
    },
    {
      motivo: "pdf-excede-tope",
      es: [
        "Ese PDF es más grande de lo que Velo puede abrir",
        /El tope para un PDF es 50 MB.*Divídelo en partes más pequeñas/,
      ],
      en: [
        "That PDF is bigger than Velo can open",
        /The limit for a PDF is 50 MB.*Split it into smaller parts/,
      ],
    },
    {
      motivo: "imagen-excede-tope",
      es: [
        "Esa imagen es más grande de lo que Velo puede abrir",
        /El tope para una imagen es 100 MB.*Expórtala de nuevo con menos peso/,
      ],
      en: [
        "That image is bigger than Velo can open",
        /The limit for an image is 100 MB.*Export it again at a lower weight/,
      ],
    },
    {
      motivo: "limpieza-incompleta",
      es: [
        "Velo no pudo dejar limpio ese archivo",
        /por eso no te la entrega.*genera una copia nueva desde su origen/,
      ],
      en: [
        "Velo could not leave that file clean",
        /it will not hand it over.*make a fresh copy from its source/,
      ],
    },
  ] as const;

  it.each(MOTIVOS_BINARIOS)(
    "$motivo: dice qué está mal y qué hacer, en español",
    ({ motivo, es }) => {
      montar({ fase: "error", motivo, nombre: "archivo.pdf" });
      const alerta = screen.getByRole("alert", { name: es[0] });
      expect(alerta).toHaveTextContent(es[1]);
      expect(alerta).toHaveTextContent("archivo.pdf");
      // Nunca la clave cruda del motivo, ni un marcador sin llenar.
      expect(alerta.textContent).not.toContain(motivo);
      expect(alerta.textContent).not.toMatch(/\{[A-Za-z]+\}/);
      expect(
        screen.getByRole("button", { name: "Elegir otro archivo" }),
      ).toBeInTheDocument();
    },
  );

  it.each(MOTIVOS_BINARIOS)(
    "$motivo: dice qué está mal y qué hacer, en inglés",
    ({ motivo, en }) => {
      fijarIdioma("en");
      montar({ fase: "error", motivo, nombre: "file.pdf" });
      const alerta = screen.getByRole("alert", { name: en[0] });
      expect(alerta).toHaveTextContent(en[1]);
      expect(alerta.textContent).not.toContain(motivo);
      expect(alerta.textContent).not.toMatch(/\{[A-Za-z]+\}/);
      expect(alerta.textContent).not.toMatch(/[¿¡]/);
    },
  );

  it("el PDF cifrado dice que Velo no pide contraseñas, y no pide una", () => {
    montar({ fase: "error", motivo: "pdf-cifrado", nombre: "cerrado.pdf" });
    expect(document.querySelector("input")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
