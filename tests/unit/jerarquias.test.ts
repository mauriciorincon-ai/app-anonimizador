// Las jerarquías del S7 son la escalera que la generalización óptima sube. Todo lo que `optima.ts`
// promete (que su poda no pierde el óptimo) descansa en UNA propiedad: los niveles son anidados —dos
// celdas iguales en un nivel siguen iguales en el siguiente—. Este archivo la prueba para cada
// escalera que la pantalla ofrece, con un corpus que incluye lo que rompía la versión anterior: un
// valor que el archivo ya traía agrupado (`5-9`, `35-39`, `011`, un trimestre escrito).
//
// Y prueba lo que dice cada escalera de fábrica, con casos FUERA de rango: códigos que no existen,
// nombres de municipio que se repiten en dos departamentos, edades imposibles, clases CIIU inválidas.

import { describe, expect, it } from "vitest";

import {
  nivelesDe,
  nombresDeNiveles,
  pasosDe,
  SUPRIMIDO,
  type Jerarquia,
} from "@/engine/jerarquias";
import {
  claveDeNombre,
  granGrupo,
  quinquenio,
} from "@/engine/jerarquias/fabrica";
import {
  claveDeEscalera,
  ESCALERAS,
  escaleraSugerida,
  type ClaveDeEscalera,
} from "@/engine/jerarquias/sugerencia";

/** La escalera entera de un valor, del nivel 0 al `*`. */
function escalera(jerarquia: Jerarquia, valor: string): string[] {
  return nivelesDe(jerarquia).map((nivel) => nivel(valor));
}

// Un corpus que mezcla lo que cada escalera entiende con lo que no, y lo ya agrupado.
const CORPUS = [
  "",
  " ",
  "0",
  "7",
  "37",
  "37,5",
  "-3",
  "99",
  "100",
  "122",
  "130",
  "999",
  "5-9",
  "35-39",
  "10-19",
  "7-12",
  "100+",
  "0-14",
  "1987",
  "1987-03",
  "1987-03-14",
  "14/03/1987",
  "1987-01/1987-03",
  "1987-13-01",
  "05001",
  "5001",
  "05",
  "5",
  "11001",
  "99999",
  "Medellín",
  "MEDELLIN",
  "Antioquia",
  "Argelia",
  "Caldas",
  "Región Caribe",
  "0111",
  "111",
  "011",
  "01",
  "1410",
  "141",
  "9999",
  "A",
  "abc",
  "texto libre",
];

describe("toda escalera ofrecida es anidada (lo que sostiene la poda de OLA)", () => {
  for (const clave of Object.keys(ESCALERAS) as ClaveDeEscalera[]) {
    it(`«${clave}»: dos celdas iguales en el nivel j siguen iguales en el j+1`, () => {
      const jerarquia = ESCALERAS[clave];
      const niveles = nivelesDe(jerarquia);
      // El corpus, más lo que cada nivel produce: lo ya agrupado es el caso que rompía.
      const valores = new Set(CORPUS);
      for (const v of CORPUS)
        for (const nivel of niveles) valores.add(nivel(v));
      for (let j = 0; j + 1 < niveles.length; j++) {
        const siguiente = new Map<string, string>();
        for (const v of valores) {
          const aqui = niveles[j](v);
          const arriba = niveles[j + 1](v);
          const visto = siguiente.get(aqui);
          if (visto !== undefined)
            expect(arriba, `«${v}» en el nivel ${j} = «${aqui}»`).toBe(visto);
          else siguiente.set(aqui, arriba);
        }
      }
    });

    it(`«${clave}»: el último nivel es «*» para toda celda, la vacía incluida`, () => {
      const niveles = nivelesDe(ESCALERAS[clave]);
      for (const v of CORPUS)
        expect(niveles[niveles.length - 1](v)).toBe(SUPRIMIDO);
    });

    it(`«${clave}»: el vacío sigue vacío en los niveles intermedios`, () => {
      const niveles = nivelesDe(ESCALERAS[clave]);
      for (let j = 0; j + 1 < niveles.length; j++)
        expect(niveles[j]("")).toBe("");
    });

    it(`«${clave}»: tiene un nombre por nivel y un paso por nivel sobre el 0`, () => {
      const jerarquia = ESCALERAS[clave];
      expect(nombresDeNiveles(jerarquia)).toHaveLength(
        nivelesDe(jerarquia).length,
      );
      expect(pasosDe(jerarquia)).toHaveLength(nivelesDe(jerarquia).length - 1);
    });
  }
});

describe("las genéricas", () => {
  it("rango 5/10/20/40: un número sube por rangos alineados en el cero", () => {
    expect(escalera(ESCALERAS["rango-5"], "37")).toEqual([
      "37",
      "35-39",
      "30-39",
      "20-39",
      "0-39",
      SUPRIMIDO,
    ]);
    expect(escalera(ESCALERAS["rango-5"], "-3")).toEqual([
      "-3",
      "-5--1",
      "-10--1",
      "-20--1",
      "-40--1",
      SUPRIMIDO,
    ]);
  });

  it("rango: lo ya agrupado sube solo si cabe ENTERO en el rango nuevo", () => {
    // `5-9` cabe en `0-9`; `7-12` no cabe en `5-9` ni en `0-9`, sí en `0-19`.
    expect(escalera(ESCALERAS["rango-5"], "5-9")).toEqual([
      "5-9",
      "5-9",
      "0-9",
      "0-19",
      "0-39",
      SUPRIMIDO,
    ]);
    expect(escalera(ESCALERAS["rango-5"], "7-12")).toEqual([
      "7-12",
      "7-12",
      "7-12",
      "0-19",
      "0-39",
      SUPRIMIDO,
    ]);
  });

  it("rango: un texto no se vuelve rango (inventarle uno sería afirmar un dato)", () => {
    expect(escalera(ESCALERAS["rango-5"], "abc")).toEqual([
      "abc",
      "abc",
      "abc",
      "abc",
      "abc",
      SUPRIMIDO,
    ]);
  });

  it("fecha: día → mes → trimestre ISO → año, desde ISO y desde el formato local", () => {
    const esperado = ["1987-03", "1987-01/1987-03", "1987", SUPRIMIDO];
    expect(escalera(ESCALERAS.fecha, "1987-03-14")).toEqual([
      "1987-03-14",
      ...esperado,
    ]);
    expect(escalera(ESCALERAS.fecha, "14/03/1987")).toEqual([
      "14/03/1987",
      ...esperado,
    ]);
    expect(escalera(ESCALERAS.fecha, "1987-12-31")[2]).toBe("1987-10/1987-12");
  });

  it("fecha: un trimestre ya escrito no baja a mes; un mes imposible no es fecha", () => {
    expect(escalera(ESCALERAS.fecha, "1987-01/1987-03")).toEqual([
      "1987-01/1987-03",
      "1987-01/1987-03",
      "1987-01/1987-03",
      "1987",
      SUPRIMIDO,
    ]);
    expect(escalera(ESCALERAS.fecha, "1987-13-01").slice(0, 4)).toEqual(
      Array(4).fill("1987-13-01"),
    );
  });

  it("prefijo 3/2/1 y supresión", () => {
    expect(escalera(ESCALERAS.prefijo, " 05001 ")).toEqual([
      " 05001 ",
      "050",
      "05",
      "0",
      SUPRIMIDO,
    ]);
    expect(escalera(ESCALERAS.supresion, "lo que sea")).toEqual([
      "lo que sea",
      SUPRIMIDO,
    ]);
  });
});

describe("DIVIPOLA (DANE): municipio → departamento → región", () => {
  const DIVIPOLA: Jerarquia = { tipo: "divipola" };

  it("un código de municipio sube a código de departamento y a su región", () => {
    expect(escalera(DIVIPOLA, "05001")).toEqual([
      "05001",
      "05",
      "Región Eje Cafetero",
      SUPRIMIDO,
    ]);
    // Sin el cero que una hoja de cálculo le quita.
    expect(escalera(DIVIPOLA, "5001")[1]).toBe("05");
    expect(escalera(DIVIPOLA, "11001")[2]).toBe("Región Centro-Oriente");
  });

  it("un nombre único sube al nombre oficial del departamento, sin tildes ni mayúsculas de por medio", () => {
    expect(escalera(DIVIPOLA, "Medellín")).toEqual([
      "Medellín",
      "ANTIOQUIA",
      "Región Eje Cafetero",
      SUPRIMIDO,
    ]);
    expect(escalera(DIVIPOLA, "medellin")[1]).toBe("ANTIOQUIA");
  });

  it("un nombre de municipio repetido en dos departamentos NO se adivina", () => {
    // Argelia hay en Antioquia, Cauca y Valle del Cauca: elegir uno sería afirmar dónde vive alguien.
    expect(escalera(DIVIPOLA, "Argelia")).toEqual([
      "Argelia",
      "Argelia",
      "Argelia",
      SUPRIMIDO,
    ]);
  });

  it("un nombre que también es departamento se lee como el departamento", () => {
    // «Caldas» es departamento y municipio (en Antioquia y en Boyacá): manda el departamento.
    expect(escalera(DIVIPOLA, "Caldas")[1]).toBe("CALDAS");
    expect(escalera(DIVIPOLA, "Caldas")[2]).toBe("Región Eje Cafetero");
  });

  it("fuera de rango: un código que no existe y un texto se quedan como están", () => {
    expect(escalera(DIVIPOLA, "99999").slice(0, 3)).toEqual(
      Array(3).fill("99999"),
    );
    expect(escalera(DIVIPOLA, "03").slice(0, 3)).toEqual(Array(3).fill("03"));
    expect(escalera(DIVIPOLA, "texto libre")[2]).toBe("texto libre");
  });

  it("claveDeNombre: mayúsculas, sin tildes y sin espacios de más", () => {
    expect(claveDeNombre("  Bogotá,   D.C. ")).toBe("BOGOTA, D.C.");
  });
});

describe("Edad (DANE): quinquenio → gran grupo", () => {
  const EDAD: Jerarquia = { tipo: "edad-dane" };

  it("quinquenios hasta 100+ y los tres grandes grupos", () => {
    expect(escalera(EDAD, "37")).toEqual(["37", "35-39", "15-59", SUPRIMIDO]);
    expect(escalera(EDAD, "14")).toEqual(["14", "10-14", "0-14", SUPRIMIDO]);
    expect(escalera(EDAD, "59")).toEqual(["59", "55-59", "15-59", SUPRIMIDO]);
    expect(escalera(EDAD, "60")).toEqual(["60", "60-64", "60+", SUPRIMIDO]);
    expect(escalera(EDAD, "100")).toEqual(["100", "100+", "60+", SUPRIMIDO]);
    expect(escalera(EDAD, "37,5")[1]).toBe("35-39");
    expect(quinquenio(0)).toBe("0-4");
    expect(granGrupo(64)).toBe("60+");
  });

  it("fuera de rango: una edad imposible, un negativo y un texto se quedan como están", () => {
    for (const v of ["130", "999", "-3", "abc"])
      expect(escalera(EDAD, v).slice(0, 3), v).toEqual(Array(3).fill(v));
    expect(escalera(EDAD, "122")[1]).toBe("100+");
  });

  it("un quinquenio ya escrito sube a su gran grupo; un rango que cruza dos grupos, no", () => {
    expect(escalera(EDAD, "35-39")).toEqual([
      "35-39",
      "35-39",
      "15-59",
      SUPRIMIDO,
    ]);
    expect(escalera(EDAD, "10-19").slice(0, 3)).toEqual(Array(3).fill("10-19"));
  });
});

describe("CIIU Rev. 4 A.C. (DANE): clase → grupo → división → sección", () => {
  const CIIU: Jerarquia = { tipo: "ciiu" };

  it("una clase sube por grupo, división y sección", () => {
    expect(escalera(CIIU, "0111")).toEqual([
      "0111",
      "011",
      "01",
      "A",
      SUPRIMIDO,
    ]);
    expect(escalera(CIIU, "1410")).toEqual([
      "1410",
      "141",
      "14",
      "C",
      SUPRIMIDO,
    ]);
    expect(escalera(CIIU, "9900")[3]).toBe("U");
  });

  it("tres dígitos son una clase que perdió su cero, no un grupo", () => {
    // `141` existe como grupo y como clase 0141; una columna numérica de hoja de cálculo deja lo
    // segundo, y así se lee.
    expect(escalera(CIIU, "141")).toEqual(["141", "014", "01", "A", SUPRIMIDO]);
  });

  it("lo que ya es un grupo o una división sube desde donde está", () => {
    expect(escalera(CIIU, "011")).toEqual(["011", "011", "01", "A", SUPRIMIDO]);
    expect(escalera(CIIU, "01")).toEqual(["01", "01", "01", "A", SUPRIMIDO]);
  });

  it("fuera de rango: una clase que no existe y un texto se quedan como están", () => {
    for (const v of ["9999", "0000", "abc", "04"])
      expect(escalera(CIIU, v).slice(0, 4), v).toEqual(Array(4).fill(v));
  });
});

describe("la escalera que la pantalla propone", () => {
  it("sale del tipo y del nombre, nunca de los valores", () => {
    expect(escaleraSugerida({ nombre: "Edad", tipo: "numero" })).toBe(
      "edad-dane",
    );
    expect(
      escaleraSugerida({ nombre: "fecha_nacimiento", tipo: "texto" }),
    ).toBe("fecha");
    expect(escaleraSugerida({ nombre: "Código_DANE", tipo: "texto" })).toBe(
      "divipola",
    );
    expect(escaleraSugerida({ nombre: "municipio", tipo: "texto" })).toBe(
      "divipola",
    );
    expect(
      escaleraSugerida({ nombre: "actividad_economica", tipo: "texto" }),
    ).toBe("ciiu");
    expect(escaleraSugerida({ nombre: "ingresos", tipo: "numero" })).toBe(
      "rango-5",
    );
    expect(escaleraSugerida({ nombre: "sexo", tipo: "texto" })).toBe(
      "supresion",
    );
  });

  it("una escalera ofrecida se reconoce por su clave; una importada distinta, no", () => {
    for (const clave of Object.keys(ESCALERAS) as ClaveDeEscalera[])
      expect(claveDeEscalera(ESCALERAS[clave])).toBe(clave);
    expect(claveDeEscalera({ tipo: "rango", amplitudes: [2, 4] })).toBeNull();
  });
});
