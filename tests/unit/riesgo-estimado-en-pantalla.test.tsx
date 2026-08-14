// El gate de honestidad del S4, en el DOM.
//
// `tests/unit/riesgo-estimado.test.ts` garantiza que los números son correctos y que los tipos no
// dejan sumar un exacto con un estimado. Eso cubre el motor. Falta la superficie donde la mentira
// del sprint podría ocurrir igual con dos cifras bien calculadas: **la pantalla**.
//
// La regla que se prueba aquí no es «el número es correcto» —lo es— sino que **no se presenta como
// si fuera de la otra clase**. Un estimado con la tipografía del titular exacto ya mintió, aunque
// su valor sea impecable. Es el mismo instrumento que el S2 estrenó con las salvedades del balance:
// se mira la composición, no la cifra.

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BalanceEnPantalla } from "@/components/balance-en-pantalla";
import { RiesgoEstimadoEnPantalla } from "@/components/riesgo-estimado-en-pantalla";
import type { BalanceDelTratamiento } from "@/engine/balance";
import { estimarRiesgo, type RiesgoEstimado } from "@/engine/riesgo-estimado";

/** Clases de equivalencia de un archivo pequeño con únicos de sobra. */
function clases(tamanos: number[]) {
  const filas = tamanos.reduce((a, b) => a + b, 0);
  return {
    clases: { ids: new Uint32Array(filas), tamanos: Uint32Array.from(tamanos) },
    filas,
  };
}

function estimacionCon(poblacion: number | null): RiesgoEstimado {
  const { clases: c, filas } = clases([
    ...Array(300).fill(1),
    ...Array(50).fill(2),
  ]);
  return estimarRiesgo({ clases: c, filas, poblacion });
}

const EXACTO = {
  naturaleza: "exacto",
  qis: ["municipio", "estrato"],
  filas: 1_000,
  clases: 400,
  kMinimo: 1,
  riesgoMaximo: 1,
  riesgoPromedio: 0.4,
  unicos: 300,
  proporcionUnicos: 0.3,
} as const;

const BALANCE_LIMPIO: BalanceDelTratamiento = {
  antes: EXACTO,
  despues: {
    ...EXACTO,
    kMinimo: 8,
    unicos: 0,
    proporcionUnicos: 0,
    clases: 40,
  },
  reduccion: 1,
  salvedades: [],
  esTitular: true,
};

describe("el estimado no se disfraza de exacto", () => {
  it("sin población no da un cero: dice que no es calculable y por qué", () => {
    render(
      <RiesgoEstimadoEnPantalla
        estimacion={estimacionCon(null)}
        poblacion={null}
        onDeclarar={() => {}}
      />,
    );

    // Dos veces: los dos estimadores rechazan por separado. Ninguno inventa un número.
    expect(screen.getAllByText(/No calculable/)).toHaveLength(2);
    expect(
      screen.getAllByText(/el riesgo exacto no depende de este dato/),
    ).not.toHaveLength(0);
    // Y en ninguna parte aparece un 0 % haciéndose pasar por medición.
    expect(screen.queryByText(/^0(,0)? %$/)).toBeNull();
  });

  it("cada cifra estimada lleva su modelo y su supuesto EN LA MISMA línea", () => {
    render(
      <RiesgoEstimadoEnPantalla
        estimacion={estimacionCon(800)}
        poblacion={800}
        onDeclarar={() => {}}
      />,
    );

    // No basta con que las palabras existan en la página: tienen que estar en el mismo bloque que
    // la cifra. Un supuesto al pie de la pantalla es un supuesto que nadie lee, y una estimación
    // sin su supuesto es una afirmación.
    const marcas = screen.getAllByText(/Cifra estimada/);
    expect(marcas.length).toBeGreaterThan(0);
    for (const marca of marcas) {
      const bloque = marca.closest("p");
      expect(bloque?.textContent).toMatch(/modelo:/);
      expect(bloque?.textContent).toMatch(/supone que/);
      // Y la fuente citada, como los validadores del S1 citan a la DIAN.
      expect(bloque?.textContent).toMatch(/199[18]/);
    }
  });

  it("ninguna cifra estimada usa la tipografía del titular exacto", () => {
    // La clase del número gigante del balance. Si algún día apareciera en el panel del estimado,
    // las dos cifras se leerían como si fueran de la misma clase — que es la composición prohibida
    // en su forma más silenciosa: nadie sumó nada y aun así el conjunto miente.
    const TIPOGRAFIA_DEL_TITULAR = "text-[clamp(2.5rem,8vw,3.5rem)]";

    const exacto = render(<BalanceEnPantalla balance={BALANCE_LIMPIO} />);
    expect(
      exacto.container.querySelector(`[class*="clamp(2.5rem"]`),
    ).not.toBeNull();
    exacto.unmount();

    const estimado = render(
      <RiesgoEstimadoEnPantalla
        estimacion={estimacionCon(800)}
        poblacion={800}
        onDeclarar={() => {}}
      />,
    );
    expect(
      estimado.container.querySelector(`[class*="clamp(2.5rem"]`),
    ).toBeNull();
    expect(estimado.container.innerHTML).not.toContain(TIPOGRAFIA_DEL_TITULAR);
  });

  it("cuando un estimador calla y el otro habla, se ve la diferencia", () => {
    // Fracción de muestreo baja: Zayatz se retira citando su propia evaluación y
    // Benedetti–Franconi contesta. Los dos modelos tienen dominios de validez distintos y esa
    // asimetría es información, no un fallo que la pantalla deba uniformar.
    const { clases: c, filas } = clases([1, 1, 1, 2, 3]);
    render(
      <RiesgoEstimadoEnPantalla
        estimacion={estimarRiesgo({ clases: c, filas, poblacion: 100_000 })}
        poblacion={100_000}
        onDeclarar={() => {}}
      />,
    );

    expect(screen.getAllByText(/No calculable/)).toHaveLength(1);
    expect(screen.getByText(/Zayatz \(1991\)/)).toBeInTheDocument();
    expect(screen.getAllByText(/Cifra estimada/)).toHaveLength(1);
  });

  it("el campo de población dice que es opcional y que Velo no se lo inventa", () => {
    render(
      <RiesgoEstimadoEnPantalla
        estimacion={null}
        poblacion={null}
        onDeclarar={() => {}}
      />,
    );

    expect(
      screen.getByLabelText(
        /¿De cuántas personas salió este archivo\? \(opcional\)/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/no se lo inventa/)).toBeInTheDocument();
  });
});
