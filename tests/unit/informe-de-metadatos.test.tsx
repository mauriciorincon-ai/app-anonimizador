// El diagnóstico de un PDF o una imagen (S6).
//
// Se prueba con un `InformeDeMetadatos` escrito a mano y tipado: es exactamente lo que cruza el
// worker (nombres de campo, valores YA enmascarados, conteos y tamaños), así que no hace falta ni el
// lector ni un navegador. Lo que la pantalla tiene que garantizar es una sola cosa con muchas caras:
// que el LÍMITE —Velo no toca el texto de las páginas ni lo que se ve en la imagen— se lea tan fuerte
// como lo que sí hace, y que ningún color vaya solo.

import { act, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { InformeDeMetadatos } from "@/components/informe-de-metadatos";
import { fijarIdioma } from "@/lib/idioma/estado";

import {
  HUELLA_DEL_PDF,
  INFORME_FOTO,
  INFORME_PDF,
  INFORME_SIN_CAMPOS,
} from "./metadatos-informes";

const LIMITE_ES =
  "Velo limpia lo que el archivo dice de sí mismo; no toca el texto de las páginas ni lo que se ve en la imagen.";
const LIMITE_EN =
  "Velo cleans what the file says about itself; it does not touch the text on the pages or what can be seen in the image.";

function fila(tabla: HTMLElement, clave: string, indice = 0): HTMLElement {
  return within(tabla)
    .getAllByRole("rowheader", { name: clave })
    [indice]!.closest("tr") as HTMLElement;
}

describe("el diagnóstico de un PDF, en español", () => {
  it("encabeza con el nombre en mono, el tamaño, el formato por contenido y la huella", () => {
    render(<InformeDeMetadatos informe={INFORME_PDF} />);
    const titulo = screen.getByRole("heading", { level: 1 });
    expect(titulo).toHaveTextContent("informe-trimestral.pdf");
    expect(titulo).toHaveClass("font-mono");
    // Miles y decimales con la convención del español, y el formato dicho por sus bytes.
    expect(screen.getByText("2,3 MB · PDF según su contenido")).toBeVisible();
    expect(screen.getByText("SHA-256")).toBeInTheDocument();
    expect(screen.getByText(HUELLA_DEL_PDF)).toBeInTheDocument();
    expect(
      screen.getByText(/Leído en 120 ms y analizado en 30 ms/),
    ).toBeVisible();
  });

  it("dice el límite ANTES que la tabla, con símbolo y en negrita de alerta", () => {
    render(<InformeDeMetadatos informe={INFORME_PDF} />);
    const limite = screen.getByRole("region", {
      name: "Qué limpia Velo y qué no toca",
    });
    expect(limite).toHaveTextContent(LIMITE_ES);
    // La advertencia es negrita en el color de alerta: no solo un párrafo gris.
    expect(limite.querySelector("strong.text-alerta")).toHaveTextContent(
      LIMITE_ES,
    );
    // El color no va solo: el «!» está, oculto al lector (el texto ya lo dice).
    expect(limite.querySelector('[aria-hidden="true"]')).toHaveTextContent("!");
    // Lo específico del PDF, y lo de las imágenes no.
    expect(limite).toHaveTextContent("salen igual que entraron");
    expect(limite).not.toHaveTextContent("ningún píxel");
    expect(limite).toHaveTextContent("edítalo antes");

    const tabla = screen.getByRole("table", {
      name: "Campos con nombre que Velo encontró dentro del archivo, uno por fila",
    });
    // El límite precede a la evidencia en el documento.
    expect(
      limite.compareDocumentPosition(tabla) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("lista cada campo: clave en mono, dónde vive, qué revela y la muestra ENMASCARADA", () => {
    render(<InformeDeMetadatos informe={INFORME_PDF} />);
    const tabla = screen.getByRole("table", {
      name: /Campos con nombre que Velo encontró/,
    });
    expect(
      within(tabla)
        .getAllByRole("columnheader")
        .map((c) => c.textContent),
    ).toEqual([
      "Campo",
      "Dónde vive",
      "Qué revela",
      "Muestra enmascarada",
      "Qué reconoce Velo",
    ]);

    // Dos `Author`: el actual y el de una versión anterior, que sigue en los bytes.
    const actual = fila(tabla, "Author", 0);
    const anterior = fila(tabla, "Author", 1);
    expect(within(actual).getByText("Info del PDF")).toBeInTheDocument();
    expect(within(actual).getByText("Ana Pér***")).toBeInTheDocument();
    expect(
      within(anterior).getByText("Versión anterior del PDF"),
    ).toBeInTheDocument();
    expect(within(anterior).getByText("Luc***")).toBeInTheDocument();

    // La insignia de «qué revela» lleva símbolo Y texto; el símbolo es decorativo.
    const insignia = within(actual).getByText("Autoría");
    expect(insignia.querySelector('[aria-hidden="true"]')).toHaveTextContent(
      "●",
    );
    expect(
      within(fila(tabla, "Producer")).getByText("Programa"),
    ).toBeInTheDocument();
    expect(
      within(fila(tabla, "xmpMM:DocumentID")).getByText("Identificador"),
    ).toBeInTheDocument();
    expect(
      within(fila(tabla, "xmpMM:DocumentID")).getByText("XMP del PDF"),
    ).toBeInTheDocument();
  });

  it("lo que un validador vio DENTRO de un valor se dice «Contiene», no «es»", () => {
    render(<InformeDeMetadatos informe={INFORME_PDF} />);
    const tabla = screen.getByRole("table", {
      name: /Campos con nombre que Velo encontró/,
    });
    const asunto = fila(tabla, "Subject");
    expect(
      within(asunto).getByText("Contiene: Cédula de ciudadanía (formato)"),
    ).toBeInTheDocument();
    // Misma evidencia que una columna: qué tan firme es y su categoría, con texto.
    expect(
      within(asunto).getByText("Identificador directo"),
    ).toBeInTheDocument();
    // Sin validador que lo confirme, la celda lo dice en vez de quedarse en blanco.
    expect(
      within(fila(tabla, "Producer")).getByText(
        "Nada que un algoritmo confirme",
      ),
    ).toBeInTheDocument();
  });

  it("enseña lo que se quita —con marcador técnico y tamaño— y dice cuándo no hay tamaño propio", () => {
    render(<InformeDeMetadatos informe={INFORME_PDF} />);
    const quitar = screen.getByRole("region", {
      name: "Bloques que la limpieza quita del archivo",
    });
    const tabla = within(quitar).getByRole("table");
    const info = within(tabla)
      .getByRole("rowheader", {
        name: "Diccionario de información (autor, programa, fechas)",
      })
      .closest("tr") as HTMLElement;
    expect(within(info).getByText("/Info")).toBeInTheDocument();
    expect(within(info).getByText("sin tamaño propio")).toBeInTheDocument();

    const xmp = within(tabla)
      .getByRole("rowheader", { name: "Flujo de metadatos XMP" })
      .closest("tr") as HTMLElement;
    expect(within(xmp).getByText("3 KB")).toBeInTheDocument();
    const versiones = within(tabla)
      .getByRole("rowheader", { name: "Versiones anteriores del documento" })
      .closest("tr") as HTMLElement;
    expect(within(versiones).getByText("2")).toBeInTheDocument();
    expect(within(versiones).getByText("18 KB")).toBeInTheDocument();

    // Y lo que se conserva, aunque aquí no haya nada: lo dice, no lo calla.
    expect(screen.getByText("Nada aparte del contenido.")).toBeInTheDocument();
  });

  it("cada aviso lleva icono y texto; los que dicen «no se limpia» alertan", () => {
    render(<InformeDeMetadatos informe={INFORME_PDF} />);
    const panel = screen.getByRole("region", {
      name: "Lo que hay que saber antes de limpiar",
    });
    const avisos = within(panel).getAllByRole("listitem");
    expect(avisos).toHaveLength(4);

    // La firma se invalida.
    expect(avisos[0]).toHaveTextContent("invalida la firma");
    expect(avisos[0]!.querySelector('[aria-hidden="true"]')).toHaveTextContent(
      "!",
    );
    // Anotaciones con autor: la cuenta va al final, y se dice que NO se limpian.
    expect(avisos[1]).toHaveTextContent("Anotaciones con autor: 3");
    expect(avisos[1]).toHaveTextContent("no las limpia");
    // Adjuntos sin cuenta: la frase que no la necesita, sin un «{n}» a medias.
    expect(avisos[2]).toHaveTextContent("Hay archivos adjuntos");
    expect(avisos[2]!.textContent).not.toMatch(/\{n\}/);
    // Los avisos que solo informan llevan «i», no «!».
    expect(avisos[3]).toHaveTextContent("flujos de objetos comprimidos");
    expect(avisos[3]!.querySelector('[aria-hidden="true"]')).toHaveTextContent(
      "i",
    );
  });

  it("el panel de versiones dice cuántas guarda y que la limpieza quita las anteriores", () => {
    render(<InformeDeMetadatos informe={INFORME_PDF} />);
    const panel = screen.getByRole("region", {
      name: "Este PDF guarda 3 versiones dentro",
    });
    expect(panel).toHaveTextContent("Versiones guardadas");
    expect(panel).toHaveTextContent("Objetos reemplazados por una edición");
    expect(panel).toHaveTextContent("Sí, lo trae");
    expect(panel).toHaveTextContent("un texto reemplazado, un autor anterior");
    expect(panel).toHaveTextContent("quita las 2 anteriores");
    expect(panel).toHaveTextContent("lo cambia por uno nuevo");
  });

  it("una sola versión no inventa historia: dice que no detectó ninguna anterior", () => {
    render(
      <InformeDeMetadatos
        informe={{
          ...INFORME_PDF,
          metadatos: {
            ...INFORME_PDF.metadatos,
            revisiones: { revisiones: 1, objetosRedefinidos: 0, conId: false },
          },
        }}
      />,
    );
    const panel = screen.getByRole("region", {
      name: "Este PDF guarda una sola versión",
    });
    expect(panel).toHaveTextContent("no detectó versiones anteriores");
    expect(panel).not.toHaveTextContent("quita las");
    expect(panel).toHaveTextContent("No lo trae");
  });

  it("dos versiones: la anterior, en singular", () => {
    render(
      <InformeDeMetadatos
        informe={{
          ...INFORME_PDF,
          metadatos: {
            ...INFORME_PDF.metadatos,
            revisiones: { revisiones: 2, objetosRedefinidos: 1, conId: true },
          },
        }}
      />,
    );
    expect(
      screen.getByRole("region", {
        name: "Este PDF guarda 2 versiones dentro",
      }),
    ).toHaveTextContent("quita la anterior");
  });

  it("los títulos van en orden: un h1, y los h2 antes de cualquier h3", () => {
    render(<InformeDeMetadatos informe={INFORME_PDF} />);
    const niveles = screen
      .getAllByRole("heading")
      .map((h) => Number(h.tagName.slice(1)));
    expect(niveles[0]).toBe(1);
    expect(niveles.filter((n) => n === 1)).toHaveLength(1);
    // Nunca se salta un nivel hacia abajo (h1 → h3).
    niveles.slice(1).forEach((n, i) => {
      expect(n - niveles[i]!).toBeLessThanOrEqual(1);
    });
  });
});

describe("el diagnóstico de una foto", () => {
  it("dice el límite de una imagen —ningún píxel— y no el de un PDF", () => {
    render(<InformeDeMetadatos informe={INFORME_FOTO} />);
    const limite = screen.getByRole("region", {
      name: "Qué limpia Velo y qué no toca",
    });
    expect(limite).toHaveTextContent(LIMITE_ES);
    expect(limite).toHaveTextContent("ningún píxel");
    expect(limite).not.toHaveTextContent("salen igual que entraron");
  });

  it("nombra el formato por contenido y no enseña historia de versiones", () => {
    render(<InformeDeMetadatos informe={INFORME_FOTO} />);
    expect(screen.getByText("4,9 MB · JPEG según su contenido")).toBeVisible();
    expect(screen.queryByText(/Este PDF guarda/)).toBeNull();
    // Memoria del worker, cuando el navegador la expone.
    expect(screen.getByText(/64 MB de memoria/)).toBeInTheDocument();
  });

  it("las coordenadas llegan enmascaradas, con su detección y su categoría", () => {
    render(<InformeDeMetadatos informe={INFORME_FOTO} />);
    const tabla = screen.getByRole("table", {
      name: /Campos con nombre que Velo encontró/,
    });
    const gps = fila(tabla, "GPSLatitude");
    expect(within(gps).getByText("4.71***")).toBeInTheDocument();
    expect(within(gps).getByText("GPS (ubicación)")).toBeInTheDocument();
    expect(within(gps).getByText("Ubicación")).toBeInTheDocument();
    // No es «Contiene»: el validador cuadró con el valor entero.
    expect(within(gps).queryByText(/Contiene/)).toBeNull();
    expect(within(gps).getByText("Cuasi-identificador")).toBeInTheDocument();
  });

  it("cuenta las etiquetas técnicas sin nada personal y declara lo que conserva", () => {
    render(<InformeDeMetadatos informe={INFORME_FOTO} />);
    expect(
      screen.getByText(/Además hay 14 etiquetas técnicas sin nada personal/),
    ).toBeInTheDocument();
    const conservar = screen.getByRole("region", {
      name: "Bloques que la limpieza conserva",
    });
    expect(conservar).toHaveTextContent("Perfil de color");
    expect(conservar).toHaveTextContent("Orientación de la foto");
    // Y los dos avisos de imagen: la orientación que se queda y la extensión que miente.
    expect(
      screen.getByText(/Se conserva la orientación de la foto/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/La extensión del archivo no coincide con su contenido/),
    ).toBeInTheDocument();
  });

  it("la nota de lista blanca dice que lo que Velo no reconoce también se va", () => {
    render(<InformeDeMetadatos informe={INFORME_FOTO} />);
    expect(
      screen.getByText(/aunque Velo no lo reconozca/, { exact: false }),
    ).toBeInTheDocument();
  });
});

describe("un archivo sin campos con nombre", () => {
  it("lo dice, no pinta una tabla vacía y sigue listando lo que se quitará", () => {
    render(<InformeDeMetadatos informe={INFORME_SIN_CAMPOS} />);
    expect(
      screen.getByText("Velo no encontró campos con nombre"),
    ).toBeVisible();
    expect(
      screen.getByText(
        /«Sin campos con nombre» no es lo mismo que «sin metadatos»/,
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole("table", { name: /Campos con nombre/ }),
    ).toBeNull();
    // La cuenta en singular, sin «etiquetas».
    expect(
      screen.getByText(/Además hay 1 etiqueta técnica sin nada personal/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Velo no encontró bloques de metadatos que quitar."),
    ).toBeInTheDocument();
    // Sin avisos no hay panel de avisos.
    expect(
      screen.queryByRole("region", {
        name: "Lo que hay que saber antes de limpiar",
      }),
    ).toBeNull();
  });

  it("el límite sigue arriba aunque no haya nada que listar", () => {
    render(<InformeDeMetadatos informe={INFORME_SIN_CAMPOS} />);
    expect(
      screen.getByRole("region", { name: "Qué limpia Velo y qué no toca" }),
    ).toHaveTextContent(LIMITE_ES);
  });
});

describe("el diagnóstico de metadatos, en inglés", () => {
  it("dice el límite, el formato y los avisos en inglés, con la convención del inglés", () => {
    fijarIdioma("en");
    render(<InformeDeMetadatos informe={INFORME_PDF} />);
    expect(screen.getByText("Metadata diagnosis")).toBeInTheDocument();
    expect(screen.getByText("2.3 MB · PDF by its contents")).toBeVisible();
    const limite = screen.getByRole("region", {
      name: "What Velo cleans and what it leaves alone",
    });
    expect(limite).toHaveTextContent(LIMITE_EN);
    expect(limite.querySelector("strong.text-alerta")).toHaveTextContent(
      LIMITE_EN,
    );
    expect(
      screen.getByRole("table", {
        name: "Named fields Velo found inside the file, one per row",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Earlier version of the PDF")).toBeInTheDocument();
    expect(
      screen.getByText("Contains: Colombian ID card, cédula (format)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Annotations with an author: 3/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "This PDF keeps 3 versions inside" }),
    ).toHaveTextContent("removes the 2 earlier ones");
    // Y nada del español se queda en la pantalla.
    expect(screen.queryByText(/Qué limpia Velo/)).toBeNull();
    expect(screen.queryByText(/según su contenido/)).toBeNull();
  });

  it("cambiar de idioma con el informe a la vista lo repinta entero", () => {
    render(<InformeDeMetadatos informe={INFORME_FOTO} />);
    expect(screen.getByText("Diagnóstico de metadatos")).toBeInTheDocument();
    act(() => fijarIdioma("en"));
    expect(screen.getByText("Metadata diagnosis")).toBeInTheDocument();
    expect(screen.queryByText("Diagnóstico de metadatos")).toBeNull();
    expect(screen.getByText("4.9 MB · JPEG by its contents")).toBeVisible();
    expect(
      screen.getByText(/There are also 14 technical tags/),
    ).toBeInTheDocument();
  });
});
