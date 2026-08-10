// El diagnóstico (P2), armado con un informe DE VERDAD.
//
// El informe no se escribe a mano: se produce con el kit de prueba y el motor real, igual que en
// producción. Un informe de mentira probaría que el componente sabe pintar lo que le pasamos; este
// prueba que sabe pintar lo que el motor produce, que es lo que el usuario va a ver.

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { generarFilas } from "../../docs/kit-de-prueba/generador.mjs";
import { InformeDeDiagnostico } from "@/components/informe-de-diagnostico";
import { clasificar } from "@/engine/clasificador";
import { ConstructorColumnar } from "@/engine/columnar";
import { evaluarRiesgo } from "@/engine/riesgo";
import { porcentaje } from "@/lib/formato";
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
    archivo: { nombre: `${perfil}.csv`, bytes: 815_899, formato: "csv" },
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
      within(panel).getByText(porcentaje(informe.riesgo.proporcionUnicos)),
    ).toBeInTheDocument();
    expect(screen.getByText(/de 400 registros/)).toBeInTheDocument();
    // La marca `naturaleza: "exacto"` tiene que ser visible: en el S2 llegan los estimadores
    // poblacionales y esta pantalla tendrá que distinguir los dos planos sin ambigüedad.
    expect(screen.getByText("Cifra exacta.")).toBeInTheDocument();
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
