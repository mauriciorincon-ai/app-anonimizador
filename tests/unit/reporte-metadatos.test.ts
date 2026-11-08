// @vitest-environment node
//
// El certificado de una limpieza: autocontenido, sin un solo valor completo, determinista por
// idioma, y diciendo primero lo que NO cubre.

import { describe, expect, it } from "vitest";

import {
  construirCertificadoDeLimpieza,
  nombreDelCertificadoDeLimpieza,
  type DatosDelCertificadoDeLimpieza,
} from "@/engine/reporte-metadatos";
import { campoParaLaPagina } from "@/engine/metadatos/hallazgos";
import type { Idioma } from "@/lib/idioma";

const AUTOR = "Ana Pérez · CC 1032456789";
const LATITUD = "4.609710";

function datos(
  idioma: Idioma,
  cambios: Partial<DatosDelCertificadoDeLimpieza> = {},
): DatosDelCertificadoDeLimpieza {
  return {
    archivo: {
      nombre: "informe <final>.pdf",
      bytes: 48_213,
      sha256: "a".repeat(64),
      formato: "pdf",
    },
    campos: [
      campoParaLaPagina({
        clave: "Author",
        origen: "pdf-info",
        valor: AUTOR,
        revela: "autoria",
      }),
      campoParaLaPagina({
        clave: "Author",
        origen: "pdf-revision-anterior",
        valor: "Luis Gómez",
        revela: "autoria",
      }),
      campoParaLaPagina({
        clave: "GPSLatitude",
        origen: "gps",
        valor: LATITUD,
        revela: "ubicacion",
      }),
    ],
    otrasEtiquetas: 7,
    avisos: [
      { clave: "pdf-firmado" },
      { clave: "pdf-anotaciones", n: 1 },
      { clave: "pdf-adjuntos", n: 3 },
    ],
    revisiones: { revisiones: 2, objetosRedefinidos: 3, conId: true },
    limpieza: {
      quitados: [
        { clase: "pdf-info", marcador: "/Info", bytes: null, cuantos: 1 },
        { clase: "pdf-revisiones", marcador: "%%EOF", bytes: null, cuantos: 1 },
        { clase: "pdf-xmp", marcador: "/Metadata", bytes: 1_204, cuantos: 2 },
      ],
      conservados: [],
      revisionesQuitadas: 1,
      idNuevo: "0123456789abcdef0123456789abcdef",
      poscomprobacion: { campos: 0, revisiones: 1 },
      sha256: "b".repeat(64),
      bytes: 41_002,
      nombre: "velo-limpio-aaaaaaaa.pdf",
    },
    fecha: "2 de noviembre de 2026, 10:00",
    idioma,
    ...cambios,
  };
}

describe("construirCertificadoDeLimpieza", () => {
  it("es determinista: mismos datos, mismo idioma ⇒ mismos bytes", () => {
    for (const idioma of ["es", "en"] as const)
      expect(construirCertificadoDeLimpieza(datos(idioma))).toBe(
        construirCertificadoDeLimpieza(datos(idioma)),
      );
  });

  it("no lleva ningún valor completo: solo nombres y muestras enmascaradas", () => {
    const html = construirCertificadoDeLimpieza(datos("es"));
    expect(html).not.toContain("1032456789");
    expect(html).not.toContain(LATITUD);
    expect(html).not.toContain("Luis Gómez");
    expect(html).toContain("Author");
    expect(html).toContain("***");
  });

  it("dice primero el límite: el texto de las páginas y la imagen no se tocaron", () => {
    const es = construirCertificadoDeLimpieza(datos("es"));
    const en = construirCertificadoDeLimpieza(datos("en"));
    expect(es).toContain(
      "El texto de las páginas y lo que se ve en la imagen no se tocaron.",
    );
    expect(en).toContain(
      "The text of the pages and what can be seen in the image were not touched.",
    );
    // Antes que las huellas y que la lista de lo quitado.
    expect(es.indexOf("no se tocaron")).toBeLessThan(es.indexOf("SHA-256"));
  });

  it("lleva las dos huellas, el /ID nuevo, las versiones quitadas y la poscomprobación", () => {
    const html = construirCertificadoDeLimpieza(datos("es"));
    expect(html).toContain("a".repeat(64));
    expect(html).toContain("b".repeat(64));
    expect(html).toContain("0123456789abcdef0123456789abcdef");
    expect(html).toContain("Versiones anteriores quitadas:</b> 1");
    expect(html).toMatch(/Encontró <b>0<\/b> campos con nombre/);
    expect(html).toContain("sha256sum velo-limpio-aaaaaaaa.pdf");
  });

  it("los avisos eligen singular o plural y dicen lo que NO se limpió", () => {
    const es = construirCertificadoDeLimpieza(datos("es"));
    expect(es).toContain("Una anotación lleva nombre de autor.");
    expect(es).toContain("3 archivos adjuntos van dentro del PDF.");
    expect(es).toContain("Reescribirlo invalida la firma");
    const en = construirCertificadoDeLimpieza(datos("en"));
    expect(en).toContain("One annotation carries an author name.");
    expect(en).toContain("3 attached files travel inside the PDF.");
  });

  it("cada aviso tiene su frase en los dos idiomas", () => {
    const claves = [
      "extension-distinta",
      "orientacion-conservada",
      "imagenes-adicionales",
      "texto-comprimido",
      "exif-ilegible",
      "iptc-xmp-ilegible",
      "valores-recortados",
      "campos-de-mas",
      "pdf-firmado",
      "pdf-anotaciones",
      "pdf-adjuntos",
      "pdf-formularios",
      "pdf-javascript",
      "pdf-flujos-de-objetos",
    ] as const;
    for (const idioma of ["es", "en"] as const) {
      const html = construirCertificadoDeLimpieza(
        datos(idioma, {
          avisos: claves.map((clave) => ({ clave, n: 2 })),
        }),
      );
      const avisos = html.slice(html.indexOf('class="limpia salvedades"'));
      expect(avisos.match(/<li>/g)).toHaveLength(claves.length);
      expect(avisos).not.toContain("<li></li>");
    }
  });

  it("los elementos sin tamaño propio y los repetidos se dicen así", () => {
    const html = construirCertificadoDeLimpieza(datos("en"));
    expect(html).toContain("inside the document");
    expect(html).toContain("× 2");
  });

  it("escapa el nombre del archivo y no pide nada de fuera", () => {
    const html = construirCertificadoDeLimpieza(datos("es"));
    expect(html).toContain("informe &lt;final&gt;.pdf");
    expect(html).not.toContain("<final>");
    expect(html).not.toMatch(/<(link|script|img)\b/i);
    expect(html).not.toMatch(/https?:\/\//);
  });

  it("una imagen sin campos dice que no los había y no habla de versiones", () => {
    const html = construirCertificadoDeLimpieza(
      datos("es", {
        archivo: {
          nombre: "foto.jpg",
          bytes: 9_000,
          sha256: "c".repeat(64),
          formato: "jpeg",
        },
        campos: [],
        otrasEtiquetas: 0,
        avisos: [{ clave: "orientacion-conservada" }],
        revisiones: null,
        limpieza: {
          quitados: [],
          conservados: [
            {
              clase: "orientacion",
              marcador: "APP1",
              bytes: 34,
              cuantos: 1,
            },
          ],
          revisionesQuitadas: 0,
          idNuevo: null,
          poscomprobacion: { campos: 0, revisiones: null },
          sha256: "d".repeat(64),
          bytes: 8_000,
          nombre: "velo-limpio-cccccccc.jpg",
        },
      }),
    );
    expect(html).toContain("El original no traía campos con nombre");
    expect(html).toContain("No había nada que quitar");
    expect(html).toContain("Lo que se conservó");
    expect(html).not.toContain("versión del documento");
    expect(html).not.toContain("/ID");
  });
});

describe("nombreDelCertificadoDeLimpieza", () => {
  it("con el nombre de la copia limpia no repite el prefijo", () => {
    expect(
      nombreDelCertificadoDeLimpieza("velo-limpio-1a2b3c4d.pdf", "es"),
    ).toBe("velo-limpieza-1a2b3c4d.html");
    expect(
      nombreDelCertificadoDeLimpieza("velo-limpio-1a2b3c4d.pdf", "en"),
    ).toBe("velo-cleaning-1a2b3c4d.html");
  });

  it("sigue al idioma del documento y no al del archivo", () => {
    expect(nombreDelCertificadoDeLimpieza("foto playa.jpg", "es")).toBe(
      "velo-limpieza-foto-playa.html",
    );
    expect(nombreDelCertificadoDeLimpieza("foto playa.jpg", "en")).toBe(
      "velo-cleaning-foto-playa.html",
    );
  });
});
