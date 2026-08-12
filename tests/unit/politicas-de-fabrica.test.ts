// Las políticas de fábrica prometen cubrir una norma. Estos tests verifican que **cubren lo que
// dicen cubrir** — y, más importante, que declaran lo que NO cubren.
//
// Un botón que dice «HIPAA» y trata 8 de 18 identificadores sin decirlo es exactamente la mentira
// por composición que este sprint tiene prohibida: cada regla correcta, y el conjunto afirmando un
// cumplimiento que nadie verificó.

import { describe, expect, it } from "vitest";

import {
  HABEAS_DATA,
  HIPAA,
  POLITICAS_DE_FABRICA,
  construirPolitica,
  resumenDeCobertura,
  type ColumnaParaPolitica,
} from "@/engine/politicas-de-fabrica";
import {
  columnasDeMondrian,
  hashDePolitica,
  tecnicaDe,
} from "@/engine/politica";
import { VALIDADORES } from "@/engine/validadores";

/** Las 18 letras del §164.514(b)(2)(i). Escritas a mano: son el contrato, no un dato derivado. */
const LETRAS_DE_HIPAA = "ABCDEFGHIJKLMNOPQR".split("");

describe("HIPAA · Safe Harbor", () => {
  it("enumera los 18 identificadores, de la A a la R", () => {
    expect(HIPAA.cobertura).toHaveLength(18);
    expect(HIPAA.cobertura.map((c) => c.referencia)).toEqual(LETRAS_DE_HIPAA);
  });

  it("cada identificador dice CÓMO lo ve Velo, o por qué no lo ve", () => {
    for (const item of HIPAA.cobertura) {
      expect(item.identificador.length, item.referencia).toBeGreaterThan(3);
      if (item.deteccion.via === "validador") {
        expect(item.deteccion.tipos.length, item.referencia).toBeGreaterThan(0);
      } else if (item.deteccion.via === "ninguna") {
        // No basta con decir que no lo ve: tiene que decir por qué, para que el usuario sepa
        // si le toca a él.
        expect(item.deteccion.porque.length, item.referencia).toBeGreaterThan(
          20,
        );
      } else {
        expect(item.deteccion.nota.length, item.referencia).toBeGreaterThan(20);
      }
    }
  });

  it("los tipos que dice detectar EXISTEN en el motor del S1", () => {
    // Si un validador se renombra, esta tabla deja de ser cierta en silencio. Aquí se entera.
    const conocidos = new Set(VALIDADORES.map((v) => v.id));
    conocidos.add("nombre"); // el diccionario de nombres vive aparte de VALIDADORES
    for (const item of HIPAA.cobertura) {
      if (item.deteccion.via !== "validador") continue;
      for (const tipo of item.deteccion.tipos) {
        expect(conocidos.has(tipo), `${item.referencia}: ${tipo}`).toBe(true);
      }
    }
  });

  it("declara cuántos reconoce solo y cuántos le tocan al usuario", () => {
    const resumen = resumenDeCobertura(HIPAA);
    expect(resumen.total).toBe(18);
    expect(resumen.automaticos + resumen.porNombre + resumen.manuales).toBe(18);
    // El número que la UI tiene que enseñar: hay identificadores que Velo NO ve.
    expect(resumen.manuales).toBeGreaterThan(0);
  });

  it("SUPRIME los identificadores directos — Safe Harbor es eliminar, no seudonimizar", () => {
    // §164.514(c) permite un código de reidentificación, pero exige que NO se derive de la
    // información. Un HMAC del valor se deriva del valor: seudonimizar deja el archivo fuera de
    // Safe Harbor por muy irreversible que sea.
    expect(HIPAA.porCategoria["identificador-directo"]).toEqual({
      tipo: "suprimir",
    });
    for (const tecnica of Object.values(HIPAA.porTipo)) {
      expect(tecnica.tipo).not.toBe("seudonimizar");
      expect(tecnica.tipo).not.toBe("seudonimizar-con-formato");
    }
  });

  it("las fechas conservan el año y nada más: es lo que el literal C permite", () => {
    expect(HIPAA.porTipo.fecha).toEqual({
      tipo: "generalizar-fecha",
      precision: "anio",
    });
  });

  it("su advertencia dice lo que un clic dejaría creer de más", () => {
    expect(HIPAA.advertencia).toMatch(/ELIMINAR|eliminar/);
    expect(HIPAA.advertencia).toMatch(/§164\.514\(c\)/);
  });

  it("la cuenta de cobertura sale de la TABLA, no de una cifra escrita a mano", () => {
    // Primer intento de este archivo: la advertencia decía «8 de los 18» y la tabla decía 7.
    // Un número dentro de una prosa que describe una tabla se desincroniza en el primer cambio y
    // nadie se entera — es la «cita que no se cumple» del S1, en su versión de copy. La cifra la
    // compone la UI con `resumenDeCobertura()`; la prosa no lleva números.
    const resumen = resumenDeCobertura(HIPAA);
    expect(resumen).toEqual({
      automaticos: 7,
      porNombre: 2,
      manuales: 9,
      total: 18,
    });
    for (const fabrica of POLITICAS_DE_FABRICA) {
      expect(fabrica.advertencia, fabrica.id).not.toMatch(
        /\d+\s+de\s+los\s+\d+/,
      );
    }
  });
});

describe("Habeas Data (Colombia)", () => {
  it("cita la ley y la guía", () => {
    expect(HABEAS_DATA.fuente).toContain("Ley 1581 de 2012");
    expect(HABEAS_DATA.fuente).toContain("art. 5");
    expect(HABEAS_DATA.fuente).toMatch(/AGN|SIC/);
  });

  it("CONSERVA el dato sensible: es lo que el análisis quiere medir, no la llave", () => {
    // Suprimir el diagnóstico de salud en una tabla clínica sería anonimizar destruyendo el
    // propósito. Queda protegido por el k de los cuasi-identificadores.
    expect(HABEAS_DATA.porCategoria["dato-sensible"]).toEqual({
      tipo: "conservar",
    });
  });

  it("conserva el cruce: cédulas y NITs salen con formato válido", () => {
    expect(HABEAS_DATA.porTipo.cedula).toEqual({
      tipo: "seudonimizar-con-formato",
      formato: "cedula",
    });
    expect(HABEAS_DATA.porTipo.nit).toEqual({
      tipo: "seudonimizar-con-formato",
      formato: "nit",
    });
  });

  it("pide k=5 sobre los cuasi-identificadores", () => {
    expect(HABEAS_DATA.kObjetivo).toBe(5);
    expect(HABEAS_DATA.porCategoria["cuasi-identificador"]).toEqual({
      tipo: "generalizar-automatico",
    });
  });
});

describe("las dos, como producto", () => {
  it("ninguna se presenta como certificación", () => {
    for (const fabrica of POLITICAS_DE_FABRICA) {
      expect(fabrica.advertencia, fabrica.id).toMatch(
        /no es una certificación|No es una certificación/,
      );
      expect(fabrica.advertencia.length, fabrica.id).toBeGreaterThan(80);
    }
  });

  it("ninguna promete anonimato", () => {
    for (const fabrica of POLITICAS_DE_FABRICA) {
      const texto = `${fabrica.nombre} ${fabrica.advertencia} ${fabrica.fuente}`;
      expect(texto).not.toMatch(/anonimato garantizad/i);
      expect(texto).not.toMatch(/100\s*%?\s*segur/i);
      expect(texto).not.toMatch(/imposible de reidentificar/i);
    }
  });
});

describe("de criterio a política concreta", () => {
  const COLUMNAS: ColumnaParaPolitica[] = [
    {
      nombre: "cedula_titular",
      tipo: "cedula",
      categoria: "identificador-directo",
    },
    { nombre: "correo", tipo: "email", categoria: "identificador-directo" },
    {
      nombre: "fecha_nacimiento",
      tipo: "fecha",
      categoria: "cuasi-identificador",
    },
    {
      nombre: "municipio",
      tipo: "categoria",
      categoria: "cuasi-identificador",
    },
    { nombre: "diagnostico", tipo: "texto", categoria: "dato-sensible" },
    { nombre: "monto", tipo: "numero", categoria: "no-personal" },
  ];

  it("el tipo manda sobre la categoría: la cédula tiene tratamiento propio", () => {
    const politica = construirPolitica(HABEAS_DATA, COLUMNAS);
    expect(tecnicaDe(politica, "cedula_titular")).toEqual({
      tipo: "seudonimizar-con-formato",
      formato: "cedula",
    });
    // `correo` no tiene regla por tipo ⇒ cae en la de su categoría.
    expect(tecnicaDe(politica, "correo")).toEqual({
      tipo: "seudonimizar",
      longitud: 16,
    });
  });

  it("la misma fábrica sobre las mismas columnas da la misma política, siempre", () => {
    expect(hashDePolitica(construirPolitica(HIPAA, COLUMNAS))).toBe(
      hashDePolitica(construirPolitica(HIPAA, [...COLUMNAS].reverse())),
    );
  });

  it("las dos fábricas tratan el mismo archivo de forma distinta, y se nota", () => {
    const conHabeas = construirPolitica(HABEAS_DATA, COLUMNAS);
    const conHipaa = construirPolitica(HIPAA, COLUMNAS);
    expect(hashDePolitica(conHabeas)).not.toBe(hashDePolitica(conHipaa));
    // La diferencia que importa: HIPAA suprime la cédula, Habeas Data la seudonimiza.
    expect(tecnicaDe(conHipaa, "cedula_titular")).toEqual({ tipo: "suprimir" });
  });

  it("marca su origen, para que el reporte pueda decir de dónde salió", () => {
    expect(construirPolitica(HIPAA, COLUMNAS).origen).toBe("hipaa");
    expect(construirPolitica(HABEAS_DATA, COLUMNAS).origen).toBe("habeas-data");
  });
});

describe("una política que declara un k tiene que poder cumplirlo", () => {
  // REGRESIÓN, encontrada en la pasada de capturas de la Fase 5 y no por un test: Habeas Data
  // dejaba el archivo en k=1 mientras la pantalla decía «el reparto alcanzó k=7». Las dos cifras
  // eran ciertas. La causa: `fecha_nacimiento` recibía su regla por tipo —«recortar al año», que
  // es lo que la guía recomienda— y con eso salía del reparto; la fecha recortada seguía partiendo
  // las clases desde fuera.
  //
  // k-anonimato es una propiedad del CONJUNTO de cuasi-identificadores: uno fuera del reparto no
  // es una excepción al k, es su negación.
  const COLUMNAS = [
    { nombre: "cedula", tipo: "cedula", categoria: "identificador-directo" },
    { nombre: "fecha_nacimiento", tipo: "fecha", categoria: "cuasi-identificador" },
    { nombre: "municipio", tipo: "categoria", categoria: "cuasi-identificador" },
    { nombre: "fecha_atencion", tipo: "fecha", categoria: "no-personal" },
  ] as const;

  it("ningún cuasi-identificador se queda fuera del reparto", () => {
    const politica = construirPolitica(HABEAS_DATA, [...COLUMNAS]);
    const qis = COLUMNAS.filter(
      (c) => c.categoria === "cuasi-identificador",
    ).map((c) => c.nombre);

    for (const nombre of qis) {
      expect(tecnicaDe(politica, nombre).tipo, nombre).toBe(
        "generalizar-automatico",
      );
    }
    expect(columnasDeMondrian(politica).sort()).toEqual([...qis].sort());
  });

  it("y la regla por tipo sigue mandando en todo lo demás", () => {
    // El complemento: si la excepción se hubiera aplicado a lo ancho, `fecha_atencion` —que no es
    // personal— también habría entrado al reparto y generalizaría un dato que nadie pidió tocar.
    const politica = construirPolitica(HABEAS_DATA, [...COLUMNAS]);
    expect(tecnicaDe(politica, "fecha_atencion").tipo).toBe(
      "generalizar-fecha",
    );
    expect(tecnicaDe(politica, "cedula").tipo).toBe(
      "seudonimizar-con-formato",
    );
  });

  it("sin kObjetivo declarado, la regla por tipo manda también en los QIs", () => {
    // HIPAA no declara k (Safe Harbor es una lista de supresiones, no un modelo de riesgo), así
    // que ahí no hay k que proteger y la excepción no aplica.
    const sinK = { ...HABEAS_DATA, kObjetivo: null };
    expect(tecnicaDe(construirPolitica(sinK, [...COLUMNAS]), "fecha_nacimiento").tipo).toBe(
      "generalizar-fecha",
    );
  });
});
