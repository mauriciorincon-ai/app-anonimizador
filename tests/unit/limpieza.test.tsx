// La limpieza de metadatos (S6) — con la sesión de mentira.
//
// Se doblan `@/lib/sesion` (el taller que la pantalla lee) y `next/dynamic` (para que el certificado
// y la anotación de la bitácora, que se cargan bajo demanda, se monten de verdad y se puedan mirar).
// Lo que importa aquí es lo que la pantalla DICE: una sola acción, la etapa en vivo, el resultado
// con la poscomprobación como un hecho, la advertencia de lo que no se tocó, y — cuando Velo se
// niega a entregar — qué hacer.

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fijarIdioma } from "@/lib/idioma/estado";
import type { AsaDeArchivo, EstadoDelTaller } from "@/lib/sesion";

import {
  HUELLA_DEL_PDF,
  HUELLA_LIMPIA,
  INFORME_FOTO,
  INFORME_PDF,
  RESUMEN_FOTO,
  RESUMEN_PDF,
} from "./metadatos-informes";

// ── Dobles ────────────────────────────────────────────────────────────────────────────────────

let tallerActual: EstadoDelTaller;
const limpiar = vi.fn<() => void>();
const descartar = vi.fn<() => void>();
const push = vi.fn<(ruta: string) => void>();
const anotarTratamiento = vi.fn<(entrada: unknown) => void>();
const construirCertificado = vi.fn<(datos: unknown) => string>(
  () => "<html>certificado</html>",
);

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
// `dynamic` de verdad se resuelve en el navegador, con su propio `Suspense`; aquí `lazy` hace lo
// mismo y cada pieza diferida lleva el suyo, para que el resultado no espere a que lleguen.
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
  useTaller: () => tallerActual,
  limpiar: () => limpiar(),
  descartar: () => descartar(),
}));
vi.mock("@/lib/bitacora", () => ({
  anotarTratamiento: (entrada: unknown) => anotarTratamiento(entrada),
}));
vi.mock("@/engine/reporte-metadatos", async (original) => ({
  ...(await original<typeof import("@/engine/reporte-metadatos")>()),
  construirCertificadoDeLimpieza: (datos: unknown) =>
    construirCertificado(datos),
}));

import { Limpieza } from "@/components/limpieza";

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

const ASA_PDF: AsaDeArchivo = {
  nombre: "velo-limpio-aaaaaaaa.pdf",
  bytes: 2_300_000,
  url: "blob:velo/limpio-pdf",
};
const ASA_FOTO: AsaDeArchivo = {
  nombre: "velo-limpio-cccccccc.jpg",
  bytes: 5_070_000,
  url: "blob:velo/limpio-foto",
};

function conTaller(cambio: Partial<EstadoDelTaller>): void {
  tallerActual = { ...TALLER_VACIO, ...cambio };
}

function pdfLimpio(): void {
  conTaller({
    limpieza: { fase: "hecha", resumen: RESUMEN_PDF, archivo: ASA_PDF },
  });
}

function montar(informe = INFORME_PDF) {
  return render(<Limpieza informe={informe} />);
}

beforeEach(() => {
  tallerActual = TALLER_VACIO;
  limpiar.mockClear();
  descartar.mockClear();
  push.mockClear();
  anotarTratamiento.mockClear();
  construirCertificado.mockClear();
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: () => "blob:velo/certificado",
      revokeObjectURL: () => {},
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Antes de limpiar ──────────────────────────────────────────────────────────────────────────

describe("antes de limpiar", () => {
  it("ofrece UNA acción, «Limpiar», con el límite pegado al botón", () => {
    montar();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Limpia lo que el archivo dice de sí mismo",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("informe-trimestral.pdf")).toHaveClass("font-mono");

    const botones = screen.getAllByRole("button");
    expect(botones.map((b) => b.textContent)).toEqual([
      "Limpiar",
      "Volver al diagnóstico",
    ]);
    // El límite se dice antes de que se pueda pulsar nada.
    expect(screen.getByRole("note")).toHaveTextContent(
      "Velo limpia lo que el archivo dice de sí mismo; no toca el texto de las páginas ni lo que se ve en la imagen.",
    );
    // Sin resultado, sin estado en vivo.
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("pulsar «Limpiar» pide la limpieza a la sesión, sin opciones", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
    expect(limpiar).toHaveBeenCalledOnce();
    expect(limpiar).toHaveBeenCalledWith();
  });

  it("«Volver al diagnóstico» navega sin descartar el archivo", () => {
    montar();
    fireEvent.click(
      screen.getByRole("button", { name: "Volver al diagnóstico" }),
    );
    expect(push).toHaveBeenCalledWith("/diagnostico");
    expect(descartar).not.toHaveBeenCalled();
  });
});

describe("mientras limpia", () => {
  it("el botón se bloquea y la etapa se anuncia en UNA región viva", () => {
    conTaller({ limpieza: { fase: "limpiando" }, etapa: "limpiando" });
    montar();
    const boton = screen.getByRole("button", { name: "Limpiando…" });
    expect(boton).toBeDisabled();
    const estado = screen.getByRole("status");
    expect(estado).toHaveTextContent(
      "Reescribiendo el archivo sin sus metadatos",
    );
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("en la etapa de comprobar, dice que vuelve a leer el archivo limpio", () => {
    conTaller({ limpieza: { fase: "limpiando" }, etapa: "comprobando" });
    montar();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Volviendo a leer el archivo limpio, para comprobarlo",
    );
  });
});

// ── El resultado de un PDF ────────────────────────────────────────────────────────────────────

describe("el resultado de un PDF limpio", () => {
  it("dice la poscomprobación como un HECHO con su cifra", async () => {
    pdfLimpio();
    montar();
    expect(
      screen.getByText(/Velo volvió a leer el archivo limpio:/),
    ).toHaveTextContent(
      "Velo volvió a leer el archivo limpio: 0 campos con nombre. El PDF limpio guarda una sola versión: no queda ninguna anterior.",
    );
    // Y la cifra va en negrita: es lo que alguien puede volver a comprobar.
    expect(screen.getByText("0 campos con nombre").tagName).toBe("STRONG");
    // Honesto sobre sí mismo: lo comprobó el mismo lector.
    expect(
      screen.getByText(/Lo comprobó el mismo lector que hizo el diagnóstico/),
    ).toBeInTheDocument();
    await screen.findByText("Llévate el certificado de la limpieza");
  });

  it("repite lo que NO cambió, en el panel del resultado", async () => {
    pdfLimpio();
    montar();
    const resultado = screen.getByRole("region", {
      name: "Esto es lo que Velo quitó",
    });
    expect(resultado).toHaveTextContent(
      "Qué no cambió: el texto de las páginas y lo que se ve en la imagen quedaron como estaban.",
    );
    // Y ya no hay botón de limpiar ni la advertencia previa: el resultado ocupa su lugar.
    expect(
      screen.queryByRole("button", { name: /Limpiar|Limpiando/ }),
    ).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
    await screen.findByText("Llévate el certificado de la limpieza");
  });

  it("resume lo quitado: campos, bloques contados uno a uno, versiones y tamaño", async () => {
    pdfLimpio();
    montar();
    const resultado = screen.getByRole("region", {
      name: "Esto es lo que Velo quitó",
    });
    const cifras = within(resultado).getAllByRole("definition");
    // campos que tenía · bloques (1 + 1 + 2) · versiones anteriores · tamaño
    expect(cifras.map((d) => d.textContent)).toEqual([
      "5",
      "4",
      "2",
      "2,3 MB → 2,2 MB",
    ]);
    await screen.findByText("Llévate el certificado de la limpieza");
  });

  it("lista lo que se quitó, con tamaños, y dice qué se conservó", async () => {
    pdfLimpio();
    montar();
    const quitado = screen.getByRole("region", {
      name: "Bloques que la limpieza quitó del archivo",
    });
    expect(quitado).toHaveTextContent("Diccionario de información");
    expect(quitado).toHaveTextContent("/Info");
    expect(quitado).toHaveTextContent("Versiones anteriores del documento");
    expect(quitado).toHaveTextContent("18 KB");
    // Un PDF que no conserva nada aparte del contenido lo dice, en vez de una tabla vacía.
    expect(screen.getByText("Nada aparte del contenido.")).toBeInTheDocument();
    await screen.findByText("Llévate el certificado de la limpieza");
  });

  it("enseña el identificador nuevo del PDF y su explicación", async () => {
    pdfLimpio();
    montar();
    expect(screen.getByText("Identificador nuevo del documento")).toBeVisible();
    expect(screen.getByText("0123456789abcdef0123456789abcdef")).toHaveClass(
      "font-mono",
    );
    expect(
      screen.getByText(/ya no ata esta copia a su original/),
    ).toBeInTheDocument();
    await screen.findByText("Llévate el certificado de la limpieza");
  });

  it("enseña las dos huellas y el enlace de descarga real, hacia una URL blob:", async () => {
    pdfLimpio();
    montar();
    expect(screen.getByText("Huella del original")).toBeInTheDocument();
    expect(screen.getByText(HUELLA_DEL_PDF)).toBeInTheDocument();
    expect(screen.getByText("Huella del archivo limpio")).toBeInTheDocument();
    expect(screen.getByText(HUELLA_LIMPIA)).toBeInTheDocument();

    // Un `<a download>` de verdad —alcanzable con Tab—, no un clic sintético; la página solo ve la
    // cadena de la URL, jamás el `Blob` (ADR-005).
    const enlace = screen.getByRole("link", {
      name: /Guardar velo-limpio-aaaaaaaa\.pdf/,
    });
    expect(enlace).toHaveAttribute("href", "blob:velo/limpio-pdf");
    expect(enlace).toHaveAttribute("download", "velo-limpio-aaaaaaaa.pdf");
    expect(screen.getByText(/2,2 MB · lo escribe tu navegador/)).toBeVisible();
    await screen.findByText("Llévate el certificado de la limpieza");
  });
});

describe("el resultado de una foto", () => {
  it("no inventa versiones ni identificador, y declara lo que conservó", async () => {
    conTaller({
      limpieza: { fase: "hecha", resumen: RESUMEN_FOTO, archivo: ASA_FOTO },
    });
    montar(INFORME_FOTO);
    expect(
      screen.getByText("0 campos con nombre").parentElement,
    ).toHaveTextContent(
      "Velo volvió a leer el archivo limpio: 0 campos con nombre.",
    );
    expect(screen.queryByText(/El PDF limpio/)).toBeNull();
    expect(screen.queryByText("Versiones anteriores quitadas")).toBeNull();
    expect(screen.queryByText("Identificador nuevo del documento")).toBeNull();

    const conservado = screen.getByRole("region", {
      name: "Bloques que la limpieza conservó",
    });
    expect(conservado).toHaveTextContent("Orientación de la foto");
    // Dos `tEXt` son dos: el bloque cuenta cuántos hay.
    const quitado = screen.getByRole("region", {
      name: "Bloques que la limpieza quitó del archivo",
    });
    expect(quitado).toHaveTextContent("Texto libre del archivo");
    expect(
      screen.getByRole("link", { name: /Guardar velo-limpio-cccccccc\.jpg/ }),
    ).toHaveAttribute("href", "blob:velo/limpio-foto");
    await screen.findByText("Llévate el certificado de la limpieza");
  });
});

// ── El certificado ────────────────────────────────────────────────────────────────────────────

describe("el certificado de la limpieza", () => {
  it("se carga tras limpiar, con una vista previa aislada en un iframe sin permisos", async () => {
    pdfLimpio();
    montar();
    await screen.findByText("Llévate el certificado de la limpieza");
    expect(screen.getByText(/Lleva:/)).toBeInTheDocument();
    expect(screen.getByText(/No lleva:/)).toBeInTheDocument();
    expect(construirCertificado).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Ver antes de descargar" }),
    );
    const marco = screen.getByTitle("Vista previa del certificado");
    expect(marco.tagName).toBe("IFRAME");
    // `sandbox` vacío: sin scripts, sin acceso a la página que lo contiene.
    expect(marco).toHaveAttribute("sandbox", "");
    expect(marco).toHaveAttribute("srcdoc", "<html>certificado</html>");
  });

  it("le pasa al generador las dos huellas, lo diagnosticado y lo hecho — sin valores completos", async () => {
    pdfLimpio();
    montar();
    await screen.findByText("Llévate el certificado de la limpieza");
    fireEvent.click(
      screen.getByRole("button", { name: "Ver antes de descargar" }),
    );
    const datos = construirCertificado.mock.lastCall![0] as Record<
      string,
      unknown
    >;
    expect(datos).toMatchObject({
      archivo: {
        nombre: "informe-trimestral.pdf",
        sha256: HUELLA_DEL_PDF,
        formato: "pdf",
        bytes: 2_400_000,
      },
      limpieza: {
        sha256: HUELLA_LIMPIA,
        nombre: "velo-limpio-aaaaaaaa.pdf",
        revisionesQuitadas: 2,
        idNuevo: "0123456789abcdef0123456789abcdef",
        poscomprobacion: { campos: 0, revisiones: 1 },
      },
      otrasEtiquetas: 0,
      idioma: "es",
    });
    // Lo diagnosticado viaja tal cual cruzó el worker: muestras enmascaradas.
    expect(datos.campos).toBe(INFORME_PDF.metadatos.campos);
    expect(datos.avisos).toBe(INFORME_PDF.metadatos.avisos);
    expect(datos.revisiones).toBe(INFORME_PDF.metadatos.revisiones);
    // La fecha la pone la PANTALLA, con la convención del idioma, no el motor.
    expect(datos.fecha).toMatch(/de 20\d\d/);
  });

  it("la vista previa se regenera en el idioma nuevo si se cambia con ella abierta", async () => {
    pdfLimpio();
    montar();
    await screen.findByText("Llévate el certificado de la limpieza");
    fireEvent.click(
      screen.getByRole("button", { name: "Ver antes de descargar" }),
    );
    expect(construirCertificado.mock.lastCall![0]).toMatchObject({
      idioma: "es",
    });

    act(() => fijarIdioma("en"));
    expect(construirCertificado.mock.lastCall![0]).toMatchObject({
      idioma: "en",
    });
    expect(screen.getByTitle("Certificate preview")).toBeInTheDocument();
    // La fecha en inglés: mes antes que día, sin «de».
    const datos = construirCertificado.mock.lastCall![0] as { fecha: string };
    expect(datos.fecha).not.toMatch(/ de /);
  });

  it("descargar arma el documento al pulsar y lo entrega como HTML", async () => {
    pdfLimpio();
    const clic = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    montar();
    await screen.findByText("Llévate el certificado de la limpieza");
    expect(construirCertificado).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Descargar el certificado" }),
    );
    expect(construirCertificado).toHaveBeenCalledOnce();
    expect(clic).toHaveBeenCalledOnce();
    clic.mockRestore();
  });
});

// ── La bitácora ───────────────────────────────────────────────────────────────────────────────

describe("anotarlo en la bitácora", () => {
  it("prepara una entrada de LIMPIEZA: sin filas, técnicas ni riesgo, con las dos huellas", async () => {
    pdfLimpio();
    montar();
    await screen.findByText("Se anotan el nombre del archivo", {
      exact: false,
    });
    expect(
      screen.getByText(/Los valores de los metadatos no se anotan/),
    ).toBeInTheDocument();
    // No repite lo de una tabla: ni «técnicas que aplicaste» ni «proporciones de registros únicos».
    expect(screen.queryByText(/proporciones de registros únicos/)).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Anotar en mi bitácora" }),
    );
    expect(anotarTratamiento).toHaveBeenCalledOnce();
    const entrada = anotarTratamiento.mock.lastCall![0] as Record<
      string,
      unknown
    >;
    expect(entrada).toMatchObject({
      archivo: "informe-trimestral.pdf",
      hashDePolitica: "",
      tecnicas: [],
      filas: 0,
      unicosAntes: 0,
      unicosDespues: 0,
      esTitular: true,
      huellaDeEntrada: HUELLA_DEL_PDF,
      huellaDeSalida: HUELLA_LIMPIA,
      // formato, campos con nombre, bloques quitados uno a uno (1 + 1 + 2) y versiones quitadas.
      metadatos: {
        formato: "pdf",
        campos: 5,
        elementos: 4,
        revisionesQuitadas: 2,
      },
    });
    expect(typeof entrada.fecha).toBe("string");
    // Y ningún valor de metadato —ni siquiera enmascarado— viaja a la bitácora.
    expect(JSON.stringify(entrada)).not.toContain("Ana Pér");
    expect(push).toHaveBeenCalledWith("/bitacora");
  });
});

// ── Cuando Velo se niega ──────────────────────────────────────────────────────────────────────

describe("cuando la limpieza falla", () => {
  it("limpieza-incompleta: Velo se negó a entregar, y dice QUÉ HACER", () => {
    conTaller({
      limpieza: { fase: "fallo", motivo: "limpieza-incompleta" },
    });
    montar();
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent("No se entregó ningún archivo");
    expect(alerta).toHaveTextContent("todavía encontró campos con nombre");
    expect(alerta).toHaveTextContent("no te lo entrega");
    expect(alerta).toHaveTextContent("El original no se tocó");
    expect(alerta).toHaveTextContent(
      "No uses un archivo que Velo no pudo dejar limpio",
    );
    expect(alerta).toHaveTextContent("imprime el documento a PDF");
    // Nada que descargar, ni una limpieza que reintentar (daría lo mismo: es determinista).
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button", { name: "Limpiar" })).toBeNull();
    // La salida está a mano: otro archivo.
    fireEvent.click(
      screen.getByRole("button", { name: "Analizar otro archivo" }),
    );
    expect(descartar).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledWith("/");
  });

  it.each([
    ["pdf-ilegible", /no pudo reescribir el archivo/],
    ["imagen-ilegible", /no pudo reescribir el archivo/],
    ["lectura-fallida", /ya no tiene el archivo en memoria/],
    [
      "transformacion-fallida",
      /Algo falló al limpiar y Velo prefirió no entregar nada/,
    ],
  ] as const)("%s: dice qué pasó y qué hacer", (motivo, texto) => {
    conTaller({ limpieza: { fase: "fallo", motivo } });
    montar();
    expect(screen.getByRole("alert")).toHaveTextContent(texto);
    // Nunca la clave cruda del motivo.
    expect(screen.getByRole("alert").textContent).not.toContain(motivo);
  });
});

// ── En inglés ─────────────────────────────────────────────────────────────────────────────────

describe("la limpieza, en inglés", () => {
  it("dice la acción, la poscomprobación y el límite en inglés", async () => {
    fijarIdioma("en");
    pdfLimpio();
    montar();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Clean what the file says about itself",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("0 named fields").parentElement).toHaveTextContent(
      "Velo read the clean file again: 0 named fields.",
    );
    expect(screen.getByText("0 named fields").tagName).toBe("STRONG");
    expect(
      screen.getByText("a single version").parentElement,
    ).toHaveTextContent(
      "The clean PDF keeps a single version: no earlier one is left.",
    );
    expect(screen.getByText("What did not change:").tagName).toBe("STRONG");
    expect(screen.getByText("2.3 MB → 2.2 MB")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Save velo-limpio-aaaaaaaa\.pdf/ }),
    ).toHaveAttribute("href", "blob:velo/limpio-pdf");
    await screen.findByText("Take the cleaning certificate with you");
    expect(
      screen.queryByText("Limpia lo que el archivo dice de sí mismo"),
    ).toBeNull();
  });

  it("antes de limpiar, el botón y el límite también están en inglés", () => {
    fijarIdioma("en");
    montar();
    expect(screen.getByRole("button", { name: "Clean" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(
      "Velo cleans what the file says about itself; it does not touch the text on the pages or what can be seen in the image.",
    );
    expect(
      screen.getByRole("button", { name: "Back to the diagnosis" }),
    ).toBeInTheDocument();
  });

  it("limpieza-incompleta, en inglés, también dice qué hacer", () => {
    fijarIdioma("en");
    conTaller({
      limpieza: { fase: "fallo", motivo: "limpieza-incompleta" },
    });
    montar();
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent("No file was handed over");
    expect(alerta).toHaveTextContent("will not hand it over");
    expect(alerta).toHaveTextContent(
      "Do not use a file Velo could not leave clean",
    );
  });
});
