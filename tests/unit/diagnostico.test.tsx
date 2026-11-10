// El diagnóstico (P2), armado con un informe DE VERDAD.
//
// El informe no se escribe a mano: se produce con el kit de prueba y el motor real, igual que en
// producción. Un informe de mentira probaría que el componente sabe pintar lo que le pasamos; este
// prueba que sabe pintar lo que el motor produce, que es lo que el usuario va a ver.

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { generarFilas } from "../../docs/kit-de-prueba/generador.mjs";
import { InformeDeDiagnostico } from "@/components/informe-de-diagnostico";
import { clasificar } from "@/engine/clasificador";
import { ConstructorColumnar } from "@/engine/columnar";
import { evaluarRiesgo } from "@/engine/riesgo";
import { porcentaje } from "@/lib/formato";
import { fijarIdioma } from "@/lib/idioma/estado";
import type { EstructuraJson } from "@/engine/json/tipos";
import type { Informe } from "@/workers/contrato";

function informeDe(perfil: string, filas = 400): Informe {
  const todas = [
    ...generarFilas({
      filas,
      seed: 42,
      perfil,
      tasaInvalida: 0.08,
      tasaVacia: 0.03,
    }),
  ];
  const [encabezado, ...datos] = todas;
  const constructor = new ConstructorColumnar(encabezado, filas);
  for (const fila of datos) constructor.agregarFila(fila);
  const tabla = constructor.finalizar();
  const diagnostico = clasificar(tabla);
  const { riesgo, advisor } = evaluarRiesgo(tabla, diagnostico);

  return {
    archivo: {
      nombre: `${perfil}.csv`,
      bytes: 815_899,
      formato: "csv",
      sha256:
        "50ad22651a462bb3d5ebf08f1adf34486799384aef4688c7724d5a934f988f1c",
    },
    diagnostico,
    riesgo,
    advisor,
    medicion: { msLectura: 12, msDiagnostico: 8, heapMb: null },
  };
}

describe("archivo con datos personales", () => {
  const informe = informeDe("clinico");

  it("encabeza con el archivo y su tamaño real", () => {
    render(<InformeDeDiagnostico informe={informe} />);
    expect(
      screen.getByRole("heading", { level: 1, name: "clinico.csv" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/400 filas · 24 columnas/)).toBeInTheDocument();
  });

  it("presenta el riesgo exacto con su denominador y su marca de naturaleza", () => {
    render(<InformeDeDiagnostico informe={informe} />);
    // Acotado al panel de riesgo: el mismo porcentaje aparece más abajo en el advisor, y una
    // consulta global no distinguiría la cifra principal de una fila del ranking.
    const panel = screen.getByRole("region", {
      name: "Cuánta gente queda sola en tu tabla",
    });
    expect(
      within(panel).getByText(
        porcentaje(informe.riesgo.proporcionUnicos, "es"),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/de 400 registros/)).toBeInTheDocument();
    // La marca `naturaleza: "exacto"` tiene que ser visible: en el S2 llegan los estimadores
    // poblacionales y esta pantalla tendrá que distinguir los dos planos sin ambigüedad.
    expect(screen.getByText("Cifra exacta.")).toBeInTheDocument();
  });

  it("declara que la cifra no cuenta a quienes identifican solos", () => {
    // La cifra del panel se calcula solo sobre cuasi-identificadores. Sin esta línea, un archivo
    // con una cédula y dos columnas demográficas enseña un porcentaje bajo como titular y se lee
    // como tranquilidad, con la cédula ahí al lado. Cada afirmación estaba bien acotada; la
    // composición decía otra cosa.
    render(<InformeDeDiagnostico informe={informe} />);
    expect(
      informe.diagnostico.resumen["identificador-directo"],
    ).toBeGreaterThan(0);
    const panel = screen.getByRole("region", {
      name: "Cuánta gente queda sola en tu tabla",
    });
    expect(within(panel).getByText(/no cuenta/)).toBeInTheDocument();
    expect(
      within(panel).getByText(/sin ayuda de ninguna otra/),
    ).toBeInTheDocument();
  });

  it("enseña qué columnas se cruzaron para llegar a esa cifra", () => {
    render(<InformeDeDiagnostico informe={informe} />);
    expect(informe.riesgo.qis.length).toBeGreaterThan(0);
    for (const qi of informe.riesgo.qis) {
      expect(screen.getAllByText(qi).length).toBeGreaterThan(0);
    }
  });

  it("cada columna lleva su categoría, su certeza y su evidencia", () => {
    render(<InformeDeDiagnostico informe={informe} />);
    const tabla = screen.getByRole("table");
    const fila = within(tabla).getByRole("rowheader", { name: /nit_empresa/ });
    const celdas = within(fila.closest("tr")!).getAllByRole("cell");
    expect(celdas[0]).toHaveTextContent("NIT con dígito de verificación");
    // El NIT sí tiene algoritmo oficial (mod 11 de la DIAN): su certeza es la fuerte.
    expect(celdas[0]).toHaveTextContent("Confirmado");
    expect(celdas[0]).toHaveTextContent(/DIAN/);
    expect(celdas[1]).toHaveTextContent("Identificador directo");
  });

  it("las muestras van enmascaradas y las sensibles no van", () => {
    render(<InformeDeDiagnostico informe={informe} />);
    const tabla = screen.getByRole("table");

    const cedula = within(tabla).getByRole("rowheader", {
      name: /cedula_titular/,
    });
    const muestra = within(cedula.closest("tr")!).getAllByRole("cell")[2];
    expect(muestra).toHaveTextContent(/^\d{3}\*\*\*\d{2}$/);

    const diagnostico = within(tabla).getByRole("rowheader", {
      name: /^diagnostico/,
    });
    const sinMuestra = within(diagnostico.closest("tr")!).getAllByRole(
      "cell",
    )[2];
    expect(sinMuestra).toHaveTextContent("sin muestra");
  });

  it("la tabla se puede recorrer con teclado aunque se desplace en horizontal", () => {
    render(<InformeDeDiagnostico informe={informe} />);
    const region = screen.getByRole("region", {
      name: "Detalle de las columnas del archivo",
    });
    expect(region).toHaveAttribute("tabindex", "0");
  });

  it("el advisor declara su alcance en vez de dejar el tope en silencio", () => {
    render(<InformeDeDiagnostico informe={informe} />);
    expect(
      screen.getByText(/no es el universo entero de cruces posibles/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(
          `${informe.advisor.candidatos.length} columnas? candidatas?`,
        ),
      ),
    ).toBeInTheDocument();
    // Y lo que quedó fuera sale con su motivo, no desaparece.
    expect(informe.advisor.excluidas.length).toBeGreaterThan(0);
    expect(screen.getByText(/quedaron fuera, y por qué/)).toBeInTheDocument();
  });

  it("enseña la huella del archivo sin obligar a descargar nada", () => {
    render(<InformeDeDiagnostico informe={informe} />);
    expect(screen.getByText(informe.archivo.sha256)).toBeInTheDocument();
  });

  it("el reporte dice qué lleva y qué no ANTES de descargarlo", () => {
    // Es el único artefacto que sale del navegador: quien lo descarga tiene derecho a saber qué
    // va a mandar antes de mandarlo.
    render(<InformeDeDiagnostico informe={informe} />);
    const panel = screen.getByRole("region", {
      name: "Llévate el diagnóstico",
    });
    expect(within(panel).getByText(/No lleva:/)).toBeInTheDocument();
    expect(
      within(panel).getByText(/ninguna\s+fila de tu tabla/),
    ).toBeInTheDocument();
    expect(
      within(panel).getByRole("button", { name: "Descargar el reporte" }),
    ).toBeInTheDocument();
  });

  // S12 (deuda del S10): el `click()` del enlace ocurría tras dos `await` y Safari puede dejar de
  // contarlo como gesto del usuario. Con el módulo ya cargado (el puntero o el foco lo precargan),
  // el clic ocurre en el MISMO turno de la pulsación: la aserción va SIN esperar nada.
  describe("la descarga conserva el gesto del usuario", () => {
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });
    const prepararDescarga = () => {
      vi.stubGlobal(
        "URL",
        Object.assign(URL, {
          createObjectURL: () => "blob:velo/reporte",
          revokeObjectURL: () => {},
        }),
      );
      return vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});
    };

    it("con el módulo precargado, el clic ocurre antes de devolver el control", async () => {
      const clic = prepararDescarga();
      render(<InformeDeDiagnostico informe={informe} />);
      const boton = screen.getByRole("button", {
        name: "Descargar el reporte",
      });
      fireEvent.focus(boton);
      await act(async () => {
        await import("@/engine/reporte");
        await new Promise((r) => setTimeout(r, 0));
      });
      fireEvent.click(boton);
      expect(clic).toHaveBeenCalledOnce();
    });

    it("sin precarga, descarga igual en cuanto el módulo carga", async () => {
      const clic = prepararDescarga();
      render(<InformeDeDiagnostico informe={informe} />);
      fireEvent.click(
        screen.getByRole("button", { name: "Descargar el reporte" }),
      );
      await waitFor(() => expect(clic).toHaveBeenCalledOnce());
    });
  });

  it("la vista previa se abre y se cierra", async () => {
    render(<InformeDeDiagnostico informe={informe} />);
    const abrir = screen.getByRole("button", {
      name: "Ver antes de descargar",
    });
    expect(abrir).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(abrir);
    // El constructor del documento se carga al pedirlo (S10): el marco aparece tras esa espera.
    const marco = await screen.findByTitle("Vista previa del reporte");
    await waitFor(() =>
      expect(marco.getAttribute("srcdoc")).toContain(informe.archivo.sha256),
    );
    // `sandbox` vacío: el reporte se ve tal como lo verá quien lo reciba, y no puede tocar nada.
    expect(marco).toHaveAttribute("sandbox", "");

    fireEvent.click(screen.getByRole("button", { name: "Cerrar la vista" }));
    expect(
      screen.queryByTitle("Vista previa del reporte"),
    ).not.toBeInTheDocument();
  });

  it("las columnas que delatan solas se reportan aparte", () => {
    render(<InformeDeDiagnostico informe={informe} />);
    expect(informe.advisor.identificanSolas.length).toBeGreaterThan(0);
    expect(screen.getByText("Estas no necesitan compañía")).toBeInTheDocument();
  });
});

describe("archivo sin datos personales", () => {
  const informe = informeDe("sin-personales", 300);

  it("lo dice sin convertirlo en una promesa de anonimato", () => {
    render(<InformeDeDiagnostico informe={informe} />);
    expect(
      screen.getByText("Velo no reconoció datos personales aquí"),
    ).toBeInTheDocument();
    // La distinción que sostiene la honestidad del producto: "no reconocimos" ≠ "es anónimo".
    expect(
      screen.getByText(/no es lo mismo que «este archivo es anónimo»/),
    ).toBeInTheDocument();
  });

  it("no finge un riesgo cuando no hay nada que cruzar", () => {
    render(<InformeDeDiagnostico informe={informe} />);
    expect(informe.riesgo.qis).toHaveLength(0);
    expect(
      screen.getByText("No hay ningún cruce que medir"),
    ).toBeInTheDocument();
  });
});

describe("el mismo informe, en inglés", () => {
  // El informe lo produce el motor real UNA vez y la pantalla lo dice en el idioma que se pida:
  // el motor devuelve claves y datos, no frases, así que ningún texto se queda en español.
  const informe = informeDe("clinico");

  it("dice el encabezado, el riesgo exacto y la evidencia en inglés, con las cifras del inglés", () => {
    fijarIdioma("en");
    render(<InformeDeDiagnostico informe={informe} />);

    expect(screen.getByText("Diagnosis")).toBeInTheDocument();
    // Miles con coma y decimales con punto: la convención del inglés, no la del español.
    expect(screen.getByText(/400 rows · 24 columns/)).toBeInTheDocument();
    const panel = screen.getByRole("region", {
      name: "How many people end up alone in your table",
    });
    expect(
      within(panel).getByText(
        porcentaje(informe.riesgo.proporcionUnicos, "en"),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/of 400 records/)).toBeInTheDocument();
    expect(screen.getByText("Exact figure.")).toBeInTheDocument();

    // La etiqueta y la fuente de la columna salen del motor como mensajes, y se dicen en inglés.
    const tabla = screen.getByRole("table");
    const fila = within(tabla).getByRole("rowheader", { name: /nit_empresa/ });
    const celdas = within(fila.closest("tr")!).getAllByRole("cell");
    expect(celdas[0]).toHaveTextContent("NIT with check digit");
    expect(celdas[0]).toHaveTextContent("Confirmed");
    // La cita conserva el nombre propio de la fuente oficial.
    expect(celdas[0]).toHaveTextContent(/DIAN, Administrative Order 4 of 1989/);
    expect(celdas[1]).toHaveTextContent("Direct identifier");
  });

  it("no deja nada en español: ni las columnas excluidas ni el alcance del consejero", () => {
    fijarIdioma("en");
    render(<InformeDeDiagnostico informe={informe} />);

    expect(
      screen.getByText(/this is not the whole universe of possible crossings/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/columns were left out, and why/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/quedaron fuera/)).toBeNull();
    // Y una clave sin catálogo se vería como «⟦clave⟧»: ninguna debe aparecer.
    expect(document.body.textContent).not.toContain("⟦");
  });
});

describe("un JSON en el diagnóstico (S6)", () => {
  const estructura: EstructuraJson = {
    forma: "lineas",
    registros: 400,
    rutasTratadas: 24,
    profundidad: 2,
    noTratadas: [
      {
        ruta: "contactos[]",
        motivo: "lista-de-objetos",
        registros: 390,
        pistas: ["contactos[].correo"],
      },
    ],
    heterogeneas: [{ ruta: "edad", presencia: 399, tipos: ["numero", "nulo"] }],
  };

  function conEstructura(): Informe {
    const base = informeDe("clinico");
    return {
      ...base,
      archivo: { ...base.archivo, nombre: "clinico.jsonl", formato: "json" },
      estructura,
    };
  }

  it("un CSV o un Excel no trae el panel de la estructura", () => {
    render(<InformeDeDiagnostico informe={informeDe("clinico")} />);
    expect(
      screen.queryByRole("region", {
        name: "Qué se trató y qué no en este JSON",
      }),
    ).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
    // Y el encabezado sigue diciendo filas y columnas, como siempre.
    expect(screen.getByText(/400 filas · 24 columnas/)).toBeInTheDocument();
  });

  it("un JSON trae el panel, con el aviso de lo que sale sin tratar, antes de la tabla de columnas", () => {
    render(<InformeDeDiagnostico informe={conEstructura()} />);
    const panel = screen.getByRole("region", {
      name: "Qué se trató y qué no en este JSON",
    });
    expect(
      within(panel).getByRole("note", { name: "Estas rutas salen sin tocar" }),
    ).toHaveTextContent("contactos[].correo saldrá tal cual");
    const columnas = screen.getByRole("region", {
      name: "Qué hay en tu tabla, y por qué lo creemos",
    });
    // El panel de la estructura precede al de las columnas en el documento.
    expect(
      panel.compareDocumentPosition(columnas) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // El encabezado habla de registros y de rutas, no de filas y columnas.
    expect(
      screen.getByText(/400 registros · 24 rutas tratadas/),
    ).toBeInTheDocument();
  });

  it("lo mismo en inglés", () => {
    fijarIdioma("en");
    render(<InformeDeDiagnostico informe={conEstructura()} />);
    expect(
      screen.getByRole("region", {
        name: "What was treated, and what was not, in this JSON",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(
      "contactos[].correo will come out as is",
    );
    expect(
      screen.getByText(/400 records · 24 treated paths/),
    ).toBeInTheDocument();
  });
});
