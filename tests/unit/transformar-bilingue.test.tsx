// El taller en dos idiomas — lo que el barrido y la paridad no ven: que la pantalla, ya montada,
// diga lo mismo en español y en inglés, que los números sigan la convención del idioma y que lo más
// delicado (la frase de paso y su pérdida irreversible, regla dura nº6) se lea igual de fuerte.
//
// Los textos en sí están en `src/lib/idioma/textos/{transformar,llaves,motor-transformar}.ts`; aquí
// se prueba el cableado: que cada componente los pida con el idioma de la pantalla y con los datos
// crudos que corresponden.

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fijarIdioma } from "@/lib/idioma/estado";
import type { EstadoDelTaller } from "@/lib/sesion";

// ── Dobles ────────────────────────────────────────────────────────────────────────────────────

let tallerActual: EstadoDelTaller;
const construirReporte = vi.fn<(datos: unknown) => string>(
  () => "<html></html>",
);
const anotarTratamiento = vi.fn<(entrada: unknown) => void>();
const push = vi.fn<(ruta: string) => void>();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/lib/sesion", async (original) => ({
  ...(await original<typeof import("@/lib/sesion")>()),
  useTaller: () => tallerActual,
}));
vi.mock("@/lib/bitacora", () => ({
  anotarTratamiento: (entrada: unknown) => anotarTratamiento(entrada),
}));
vi.mock("@/engine/reporte", async (original) => ({
  ...(await original<typeof import("@/engine/reporte")>()),
  construirReporte: (datos: unknown) => construirReporte(datos),
}));

import { AnotarEnBitacora } from "@/components/anotar-en-bitacora";
import { BovedaDelTratamiento } from "@/components/boveda-del-tratamiento";
import { DescargaDelArchivo } from "@/components/descarga-del-archivo";
import { DescargaDelCertificado } from "@/components/descarga-del-certificado";
import { LlaveDelProyecto } from "@/components/llave-del-proyecto";
import { Taller } from "@/components/taller";
import { VistaPrevia } from "@/components/vista-previa";
import { nombreDeTecnica } from "@/lib/tecnicas-en-palabras";

const TALLER_VACIO: EstadoDelTaller = {
  llave: { fase: "sin-llave" },
  transformacion: { fase: "sin-hacer" },
  etapa: null,
  archivo: null,
  huellaDeSalida: null,
  boveda: { fase: "sin-sellar" },
  archivoDeBoveda: null,
  estimacion: null,
  poblacionDeclarada: null,
  limpieza: { fase: "sin-hacer" },
};

beforeEach(() => {
  tallerActual = TALLER_VACIO;
  construirReporte.mockReset();
  construirReporte.mockImplementation(() => "<html></html>");
  anotarTratamiento.mockClear();
  push.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

const INFORME = {
  archivo: { nombre: "pacientes.csv", bytes: 10, formato: "csv", sha256: "ab" },
  diagnostico: { filas: 1_234, columnas: [{}, {}, {}, {}], resumen: {} },
} as never;

/** ¿Un nodo viene antes que otro en el documento? */
function antes(a: Element, b: Element): boolean {
  return Boolean(
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

// ── El taller ─────────────────────────────────────────────────────────────────────────────────

describe("el taller", () => {
  it("en español, igual que siempre", () => {
    render(<Taller informe={INFORME} />);
    expect(
      screen.getByRole("heading", { name: "Ahora sí, transformar" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/1\.234 filas y 4 columnas de/),
    ).toBeInTheDocument();
    expect(screen.getByText("pacientes.csv")).toBeInTheDocument();
  });

  it("en inglés: otro texto, la convención de los miles, y el nombre del archivo intacto", () => {
    fijarIdioma("en");
    render(<Taller informe={INFORME} />);
    expect(
      screen.getByRole("heading", { name: "Time to transform" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/1,234 rows and 4 columns from/),
    ).toBeInTheDocument();
    expect(screen.getByText("pacientes.csv")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Transform" })).toBeDisabled();
    expect(
      screen.getByText(/Choose what to do with at least one column/),
    ).toBeInTheDocument();
  });

  it("un fallo dice qué hacer, en el idioma de la pantalla", () => {
    tallerActual = {
      ...TALLER_VACIO,
      transformacion: { fase: "fallo", motivo: "sin-llave" },
    };
    fijarIdioma("en");
    render(<Taller informe={INFORME} />);
    expect(
      screen.getByText("Could not transform the file"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/there is no key yet\. Derive the key and try again/),
    ).toBeInTheDocument();
  });

  it("cambiar de idioma con la pantalla abierta la repinta", () => {
    render(<Taller informe={INFORME} />);
    expect(screen.getByText("El taller")).toBeInTheDocument();
    act(() => fijarIdioma("en"));
    expect(screen.getByText("The workshop")).toBeInTheDocument();
    expect(screen.queryByText("El taller")).not.toBeInTheDocument();
  });
});

// ── La llave y la bóveda: regla dura nº6 ──────────────────────────────────────────────────────

describe("la llave del proyecto", () => {
  it("dice que perderla es irreversible ANTES de pedir la frase, en inglés", () => {
    fijarIdioma("en");
    render(
      <LlaveDelProyecto llave={{ fase: "sin-llave" }} onDerivar={() => {}} />,
    );
    const aviso = screen.getByText(/If you lose it, there is no going back\./);
    const campo = screen.getByLabelText("Project passphrase");
    expect(antes(aviso, campo)).toBe(true);
    // Y lo dice sin rodeos: no se puede recuperar.
    expect(
      screen.getByText(/cannot be recovered or regenerated/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Velo doesn't store it/)).toBeInTheDocument();
    expect(
      screen.getByText(/If it leaks, the pseudonyms become linkable\./),
    ).toBeInTheDocument();
  });

  it("en español, las mismas tres cosas, en el mismo orden", () => {
    render(
      <LlaveDelProyecto llave={{ fase: "sin-llave" }} onDerivar={() => {}} />,
    );
    const textos = [
      "La misma frase da los mismos seudónimos.",
      "Si la pierdes, no hay vuelta atrás.",
      "Si se filtra, los seudónimos se vuelven enlazables.",
    ].map((t) => screen.getByText(t));
    expect(antes(textos[0], textos[1])).toBe(true);
    expect(antes(textos[1], textos[2])).toBe(true);
    expect(
      antes(textos[2], screen.getByLabelText("Frase de paso del proyecto")),
    ).toBe(true);
  });

  it("las vueltas de PBKDF2 se escriben con la convención del idioma", () => {
    fijarIdioma("en");
    const { unmount } = render(
      <LlaveDelProyecto llave={{ fase: "derivando" }} onDerivar={() => {}} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "600,000 iterations of PBKDF2",
    );
    unmount();
    fijarIdioma("es");
    render(
      <LlaveDelProyecto llave={{ fase: "derivando" }} onDerivar={() => {}} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "600.000 vueltas de PBKDF2",
    );
  });

  it("derivar manda la frase y vacía el campo, igual en inglés", () => {
    fijarIdioma("en");
    const onDerivar = vi.fn();
    render(
      <LlaveDelProyecto llave={{ fase: "sin-llave" }} onDerivar={onDerivar} />,
    );
    const campo = screen.getByLabelText("Project passphrase");
    fireEvent.change(campo, { target: { value: "dos toros y una brújula" } });
    fireEvent.click(screen.getByRole("button", { name: "Derive the key" }));
    expect(onDerivar).toHaveBeenCalledWith("dos toros y una brújula");
    expect(campo).toHaveValue("");
  });

  it("la llave lista enseña huella y sal con sus nombres en inglés", () => {
    fijarIdioma("en");
    render(
      <LlaveDelProyecto
        llave={{ fase: "lista", huella: "a1b2c3d4e5f6", sal: "00ff".repeat(8) }}
        onDerivar={() => {}}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Key ready" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Key fingerprint")).toBeInTheDocument();
    expect(screen.getByText("Salt")).toBeInTheDocument();
    expect(screen.getByText("a1b2c3d4e5f6")).toBeInTheDocument();
  });
});

describe("la bóveda del tratamiento", () => {
  const PROPS = {
    boveda: { fase: "sin-sellar" } as const,
    archivo: null,
    columnas: ["cedula", "nit"],
    onSellar: () => {},
  };

  it("avisa de que sin la frase no hay recuperación ANTES de cifrar, en inglés", () => {
    fijarIdioma("en");
    render(<BovedaDelTratamiento {...PROPS} />);
    const aviso = screen.getByText(
      "Without the passphrase, it cannot be recovered.",
    );
    const campo = screen.getByLabelText("Vault passphrase");
    const boton = screen.getByRole("button", {
      name: "Encrypt and prepare the vault",
    });
    expect(antes(aviso, campo)).toBe(true);
    expect(antes(campo, boton)).toBe(true);
    // La ayuda del propio campo (la que lee el lector de pantalla) lo repite.
    expect(campo).toHaveAccessibleDescription(
      /At least 12 characters\. Write it in your password manager before continuing: it cannot be recovered\./,
    );
    expect(
      screen.getByText(/You marked 2 reversible columns/),
    ).toBeInTheDocument();
  });

  it("en español, lo mismo que antes", () => {
    render(<BovedaDelTratamiento {...PROPS} />);
    expect(
      screen.getByText("Sin la frase no hay recuperación."),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Frase de paso de la bóveda"),
    ).toHaveAccessibleDescription(
      "Al menos 12 caracteres. Apúntala en tu gestor de contraseñas antes de continuar: no hay forma de recuperarla.",
    );
  });

  it("la bóveda lista cuenta las columnas y el tamaño con la convención del idioma", () => {
    fijarIdioma("en");
    render(
      <BovedaDelTratamiento
        {...PROPS}
        boveda={{ fase: "sellada" }}
        archivo={{ nombre: "velo.velo", bytes: 2_048_000, url: "blob:x" }}
        columnas={["cedula"]}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Save the vault" }),
    ).toHaveAttribute("href", "blob:x");
    expect(
      screen.getByText(/2,000 KB\. Covers one column:/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Return" })).toHaveAttribute(
      "href",
      "/regreso",
    );
  });
});

// ── La entrega ────────────────────────────────────────────────────────────────────────────────

describe("la entrega del archivo", () => {
  const ENTREGA = {
    archivo: null,
    preparando: false,
    filas: 1_234,
    suprimidas: ["correo", "telefono"],
    hashDePolitica: "0123456789abcdef",
    idiomaDelTrabajo: "en" as const,
    onPreparar: () => {},
  };

  it("en inglés compone la frase con la lista de columnas quitadas", () => {
    fijarIdioma("en");
    render(<DescargaDelArchivo {...ENTREGA} />);
    expect(
      screen.getByText(/A CSV with 1,234 rows and without the 2 columns/),
    ).toBeInTheDocument();
    expect(screen.getByText("correo · telefono")).toBeInTheDocument();
    expect(screen.getByText("01234567")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Prepare the file" }),
    ).toBeEnabled();
  });

  it("si el idioma cambió después de transformar, dice en cuál se escribió el archivo", () => {
    fijarIdioma("en");
    render(<DescargaDelArchivo {...ENTREGA} idiomaDelTrabajo="es" />);
    expect(screen.getByText(/This file was written in/)).toHaveTextContent(
      /written in Spanish, the language you had when you transformed/,
    );
    act(() => fijarIdioma("es"));
    // Misma pantalla que el trabajo: no hay nada que avisar.
    expect(
      screen.queryByText(/Este archivo se escribió en/),
    ).not.toBeInTheDocument();
    act(() => fijarIdioma("en"));
  });

  it("y la misma frase, en español, nombra el inglés", () => {
    render(<DescargaDelArchivo {...ENTREGA} idiomaDelTrabajo="en" />);
    expect(screen.getByText(/Este archivo se escribió en/)).toHaveTextContent(
      /escribió en inglés, el idioma que tenías al transformar/,
    );
  });

  it("con el mismo idioma del trabajo no hay aviso", () => {
    fijarIdioma("en");
    render(<DescargaDelArchivo {...ENTREGA} />);
    expect(
      screen.queryByText(/This file was written in/),
    ).not.toBeInTheDocument();
  });

  it("el tamaño del archivo listo sigue la convención del idioma", () => {
    fijarIdioma("en");
    render(
      <DescargaDelArchivo
        {...ENTREGA}
        archivo={{
          nombre: "velo-anonimizado-01234567.csv",
          bytes: 1_572_864,
          url: "blob:x",
        }}
      />,
    );
    expect(
      screen.getByText(/1\.5 MB · written by your browser, not by a server/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Save velo-anonimizado-01234567\.csv/ }),
    ).toBeInTheDocument();
  });
});

describe("la vista previa", () => {
  const MUESTRAS = [
    {
      nombre: "cedula",
      tecnica: "seudonimizar-con-formato",
      filas: [{ antes: "103***89", despues: "" }],
      despuesEnmascarado: false,
      omitida: false,
      suprimida: false,
    },
    {
      nombre: "diagnostico",
      tecnica: "conservar",
      filas: [],
      despuesEnmascarado: true,
      omitida: true,
      suprimida: false,
    },
  ];

  it("nombra la técnica y lo vacío en inglés, y cuenta las columnas con la coma de miles", () => {
    fijarIdioma("en");
    render(<VistaPrevia muestras={MUESTRAS} filas={3} />);
    expect(screen.getByText("format-preserving pseudonym")).toBeInTheDocument();
    expect(screen.getByText("(empty)")).toBeInTheDocument();
    expect(
      screen.getByText("sensitive data, unchanged: not shown"),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 columns change/)).toBeInTheDocument();
  });

  it("el nombre de una técnica desconocida se ve, no se esconde", () => {
    expect(nombreDeTecnica("seudonimizar", "es")).toBe("seudónimo");
    expect(nombreDeTecnica("seudonimizar", "en")).toBe("pseudonym");
    expect(nombreDeTecnica("inventada", "en")).toBe("inventada");
    expect(nombreDeTecnica("constructor", "es")).toBe("constructor");
  });
});

// ── Lo que se guarda o se descarga: el idioma entra como dato ─────────────────────────────────

describe("el certificado", () => {
  const TRATAMIENTO = {
    balance: {},
    utilidad: {},
    hashDePolitica: "abc",
    suprimidas: [],
  } as never;

  it("recibe el idioma de la pantalla y la fecha con su convención", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-04T15:30:00Z"));
    fijarIdioma("en");
    render(
      <DescargaDelCertificado
        informe={INFORME}
        tratamiento={TRATAMIENTO}
        archivo={{
          nombre: "velo-anonimizado-abc.csv",
          bytes: 5,
          url: "blob:x",
        }}
        huellaDeSalida="beef"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Preview before downloading" }),
    );
    expect(construirReporte).toHaveBeenCalledOnce();
    const datos = construirReporte.mock.calls[0]![0] as {
      idioma: string;
      fecha: string;
    };
    expect(datos.idioma).toBe("en");
    expect(datos.fecha).toMatch(/March/);
    expect(datos.fecha).not.toMatch(/marzo/);
  });

  it("y en español, el idioma y la fecha en español", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-04T15:30:00Z"));
    render(
      <DescargaDelCertificado
        informe={INFORME}
        tratamiento={TRATAMIENTO}
        archivo={{
          nombre: "velo-anonimizado-abc.csv",
          bytes: 5,
          url: "blob:x",
        }}
        huellaDeSalida="beef"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Ver antes de descargar" }),
    );
    const datos = construirReporte.mock.calls[0]![0] as {
      idioma: string;
      fecha: string;
    };
    expect(datos.idioma).toBe("es");
    expect(datos.fecha).toMatch(/marzo/);
  });

  it("la vista previa abierta se regenera al cambiar de idioma: no enseña un idioma y descarga otro", () => {
    construirReporte.mockImplementation(
      (datos) => `<html lang="${(datos as { idioma: string }).idioma}"></html>`,
    );
    render(
      <DescargaDelCertificado
        informe={INFORME}
        tratamiento={TRATAMIENTO}
        archivo={{
          nombre: "velo-anonimizado-abc.csv",
          bytes: 5,
          url: "blob:x",
        }}
        huellaDeSalida="beef"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Ver antes de descargar" }),
    );
    const marco = () => document.querySelector("iframe");
    expect(marco()?.getAttribute("srcdoc")).toBe('<html lang="es"></html>');

    act(() => fijarIdioma("en"));
    expect(marco()?.getAttribute("srcdoc")).toBe('<html lang="en"></html>');
    // Sigue abierta: cambiar de idioma no la cierra, la repinta.
    expect(
      screen.getByRole("button", { name: "Close the preview" }),
    ).toHaveAttribute("aria-expanded", "true");

    act(() => fijarIdioma("es"));
    expect(marco()?.getAttribute("srcdoc")).toBe('<html lang="es"></html>');
  });

  it("antes del archivo no hay certificado, y lo dice en inglés", () => {
    fijarIdioma("en");
    render(
      <DescargaDelCertificado informe={INFORME} tratamiento={TRATAMIENTO} />,
    );
    expect(
      screen.getByRole("heading", {
        name: "First the file, then its certificate",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("SHA-256")).toBeInTheDocument();
  });
});

describe("anotar en la bitácora", () => {
  const ENTRADA = {
    archivo: "pacientes.csv",
    hashDePolitica: "abc",
    tecnicas: ["seudonimizar", "suprimir"],
    filas: 3,
    unicosAntes: 0.3,
    unicosDespues: 0,
    esTitular: true,
    huellaDeEntrada: "a",
    huellaDeSalida: "b",
  };

  it("nombra las técnicas en el idioma de la pantalla", () => {
    fijarIdioma("en");
    render(<AnotarEnBitacora entrada={ENTRADA} />);
    expect(screen.getByText(/Here: pseudonym, removed\./)).toBeInTheDocument();
  });

  it("la fecha se escribe YA, en el idioma de ahora, y así se guarda", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-04T15:30:00Z"));
    fijarIdioma("en");
    render(<AnotarEnBitacora entrada={ENTRADA} />);
    fireEvent.click(screen.getByRole("button", { name: "Add to my log" }));
    const guardada = anotarTratamiento.mock.calls[0]![0] as { fecha: string };
    expect(guardada.fecha).toMatch(/March/);
    expect(push).toHaveBeenCalledWith("/bitacora");
  });

  it("en español, la fecha queda en español", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-04T15:30:00Z"));
    render(<AnotarEnBitacora entrada={ENTRADA} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Anotar en mi bitácora" }),
    );
    const guardada = anotarTratamiento.mock.calls[0]![0] as { fecha: string };
    expect(guardada.fecha).toMatch(/marzo/);
  });
});
