// GATE «POR TROZOS = EN MEMORIA» (S8, regla dura nº3).
//
// El mismo archivo, la misma política, la misma llave y el mismo idioma tienen que dar los mismos
// bytes por los dos caminos: el de siempre (la tabla entera en memoria, `aplicarPolitica` y
// `filasDeCsv`, lo que hace el worker) y el de alto volumen (pasadas por trozos). Con los topes y
// el trozo forzados BAJOS, para que los archivos del kit recorran de verdad el camino por trozos:
// fronteras de trozo en mitad de una fila, columnas que no caben en su diccionario y se tratan por
// valor, ruido con el índice absoluto de la fila.
//
// Se compara también lo que el alto volumen dice medir: el balance, el ruido, las colisiones y la
// bóveda en claro. El DIAGNÓSTICO no entra al gate por diseño (en alto volumen se clasifica sobre las
// primeras filas, en memoria sobre una muestra a saltos); con menos filas que la muestra, son iguales.

import { Blob as BlobDeNode } from "node:buffer";

import { beforeAll, describe, expect, it } from "vitest";

import { generarFilas } from "../../docs/kit-de-prueba/generador.mjs";
import { balanceDelTratamiento } from "@/engine/balance";
import { construirBoveda } from "@/engine/boveda";
import { clasificar } from "@/engine/clasificador";
import { ConstructorColumnar, type TablaColumnar } from "@/engine/columnar";
import { escaparCampo, serializarCsv } from "@/engine/csv";
import { medirDiversidad } from "@/engine/diversidad";
import type { Politica } from "@/engine/politica";
import { construirPolitica, RGPD } from "@/engine/politicas-de-fabrica";
import { restaurar } from "@/engine/restaurar";
import { evaluarRiesgo } from "@/engine/riesgo";
import { serializarCanonico } from "@/engine/serializacion";
import { aplicarPolitica } from "@/engine/tecnicas";
import { sha256 } from "@/lib/sha256";
import {
  balanceDelAltoVolumen,
  escribirCsv,
  NoCabeEnAltoVolumen,
  pasadaDeDiagnostico,
  pasadaDeMedida,
  pasadaDelDevuelto,
  prepararTransformacion,
  restaurarPorTrozos,
  TOPES_DEL_ALTO_VOLUMEN,
  type Destino,
  type TopesDelAltoVolumen,
} from "@/workers/alto-volumen";
import { lotesDeCsv } from "@/workers/csv";

const codificar = (texto: string) => new TextEncoder().encode(texto);
const blobDe = (texto: string) =>
  new BlobDeNode([codificar(texto)]) as unknown as Blob;

const KIT = [
  ...generarFilas({
    filas: 1_200,
    seed: 42,
    perfil: "clinico",
    tasaInvalida: 0.08,
    tasaVacia: 0.03,
  }),
]
  .map((fila) => `${fila.map(escaparCampo).join(",")}\n`)
  .join("");

/** Topes bajos: trozos de 4 KB, y las columnas casi únicas no caben en su diccionario. */
const BAJOS: TopesDelAltoVolumen = {
  ...TOPES_DEL_ALTO_VOLUMEN,
  distintosPorColumna: 300,
  distintosEnTotal: 4_000,
  trozo: 4_096,
};
/** Topes holgados, con el trozo bajo: todo cabe en su diccionario, y se lee igual por trozos. */
const HOLGADOS: TopesDelAltoVolumen = {
  ...TOPES_DEL_ALTO_VOLUMEN,
  trozo: 4_096,
};

const BASE: Politica = {
  version: 1,
  origen: "manual",
  kObjetivo: null,
  reglas: [
    {
      columna: "cedula_titular",
      tecnica: {
        tipo: "seudonimizar-con-formato",
        formato: "cedula",
        reversible: true,
      },
    },
    {
      columna: "nit_empresa",
      tecnica: { tipo: "seudonimizar-con-formato", formato: "nit" },
    },
    {
      columna: "correo",
      tecnica: { tipo: "seudonimizar", longitud: 16, reversible: true },
    },
    { columna: "celular", tecnica: { tipo: "enmascarar" } },
    {
      columna: "fecha_nacimiento",
      tecnica: { tipo: "generalizar-fecha", precision: "anio" },
    },
    { columna: "nombre_completo", tecnica: { tipo: "suprimir" } },
  ],
};

/** Sin columnas reversibles: con topes bajos, sus diccionarios no caben y la bóveda tampoco. */
const SIN_BOVEDA: Politica = {
  ...BASE,
  reglas: BASE.reglas.map((r) =>
    r.tecnica.tipo === "seudonimizar" ||
    r.tecnica.tipo === "seudonimizar-con-formato"
      ? { ...r, tecnica: { ...r.tecnica, reversible: undefined } }
      : r,
  ),
};

const RUIDO: Politica = {
  ...SIN_BOVEDA,
  reglas: [
    ...SIN_BOVEDA.reglas,
    {
      columna: "monto",
      tecnica: {
        tipo: "laplace",
        epsilon: 1,
        minimo: 0,
        maximo: 10_000_000,
        decimales: 0,
      },
    },
    {
      columna: "estrato",
      tecnica: { tipo: "respuesta-aleatorizada", epsilon: 2 },
    },
    { columna: "latitud", tecnica: { tipo: "perturbar", porcentaje: 10 } },
    // Más de 64 valores distintos: no se aplica, y el informe lo dice.
    {
      columna: "codigo_interno",
      tecnica: { tipo: "respuesta-aleatorizada", epsilon: 1 },
    },
  ],
};

const REPARTO = ["sexo", "municipio", "estrato", "grupo_etnico"].map(
  (columna) => ({
    columna,
    tecnica: { tipo: "generalizar-automatico" as const },
  }),
);

const MONDRIAN: Politica = {
  ...SIN_BOVEDA,
  kObjetivo: 5,
  reglas: [...SIN_BOVEDA.reglas, ...REPARTO],
};

const OPTIMA: Politica = {
  ...MONDRIAN,
  reglas: [
    ...MONDRIAN.reglas,
    // La sensible de la ℓ lleva técnica propia: la óptima la mide transformada, como en memoria.
    { columna: "diagnostico", tecnica: { tipo: "enmascarar" } },
  ],
  generalizacion: {
    algoritmo: "optima",
    jerarquias: { estrato: { tipo: "rango", amplitudes: [2, 4, 8] } },
    diversidad: { l: 2, columnas: ["diagnostico", "aseguradora"] },
  },
};

const IDENTIDAD = {
  huellaDeLlave: "0123456789ab",
  salDeLlave: "c2FsLWRlLXBydWViYQ==",
  hashDePolitica: "f".repeat(64),
};

let llave: CryptoKey;
beforeAll(async () => {
  llave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("llave-del-alto-volumen".padEnd(32, ".")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
});

/** Lo que hace el worker en memoria: el lector compartido a una tabla, y la tabla entera. */
async function tablaEnMemoria(texto: string): Promise<TablaColumnar> {
  let constructor: ConstructorColumnar | null = null;
  for await (const lote of lotesDeCsv(blobDe(texto))) {
    let desde = 0;
    if (!constructor) {
      constructor = new ConstructorColumnar(lote[0] ?? [], 1 << 10);
      desde = 1;
    }
    for (let i = desde; i < lote.length; i++) constructor.agregarFila(lote[i]);
  }
  return constructor!.finalizar();
}

function recolector(): Destino & { texto(): string } {
  const partes: string[] = [];
  return {
    escribir: async (t) => void partes.push(t),
    texto: () => partes.join(""),
  };
}

async function porLosDosCaminos(
  texto: string,
  politica: Politica,
  topes: TopesDelAltoVolumen,
  idioma: "es" | "en" = "es",
) {
  const huella = sha256(codificar(texto));
  const tabla = await tablaEnMemoria(texto);
  const enMemoria = await aplicarPolitica(
    tabla,
    politica,
    llave,
    idioma,
    huella,
  );

  const archivo = blobDe(texto);
  const pasada = await pasadaDeDiagnostico(archivo, { topes, huella });
  const plan = await prepararTransformacion(
    archivo,
    pasada,
    politica,
    llave,
    idioma,
    huella,
    { topes },
  );
  const destino = recolector();
  await escribirCsv(archivo, plan, destino, { topes });
  const medida = await pasadaDeMedida(archivo, pasada, plan, { topes });
  return { tabla, enMemoria, pasada, plan, medida, salida: destino.texto() };
}

describe("por trozos = en memoria, byte a byte (CSV)", () => {
  const casos: [string, Politica, TopesDelAltoVolumen, ("es" | "en")?][] = [
    ["base, con bóveda, todo en su diccionario", BASE, HOLGADOS],
    ["sin bóveda, columnas casi únicas tratadas por valor", SIN_BOVEDA, BAJOS],
    ["ruido (Laplace, respuesta aleatorizada, perturbación)", RUIDO, BAJOS],
    ["Mondrian", MONDRIAN, BAJOS],
    ["Mondrian en inglés", MONDRIAN, BAJOS, "en"],
    ["la óptima con ℓ sobre una sensible transformada", OPTIMA, BAJOS],
  ];

  for (const [nombre, politica, topes, idioma] of casos)
    it(nombre, async () => {
      const r = await porLosDosCaminos(KIT, politica, topes, idioma);
      const esperado = serializarCsv(r.enMemoria.tabla);
      expect(sha256(codificar(r.salida))).toBe(sha256(codificar(esperado)));
      expect(r.plan.suprimidas).toEqual(r.enMemoria.suprimidas);
      // El informe del ruido es el mismo, salvo el dominio de una columna que no cupo entera: allí el
      // alto volumen dice «más de N» (un mínimo) en vez de la cifra exacta, y lo marca.
      expect(
        r.medida.ruido.map(({ dominio, dominioAlMenos, ...resto }) =>
          dominioAlMenos
            ? { ...resto, dominio: "al menos" }
            : { ...resto, dominio },
        ),
      ).toEqual(
        r.enMemoria.ruido.map(({ dominio, ...resto }, i) =>
          r.medida.ruido[i]?.dominioAlMenos
            ? { ...resto, dominio: "al menos" }
            : { ...resto, dominio },
        ),
      );
      for (const [i, informe] of r.medida.ruido.entries())
        if (informe.dominioAlMenos)
          expect(informe.dominio!).toBeLessThan(r.enMemoria.ruido[i].dominio!);
      if (topes === HOLGADOS) {
        expect(r.plan.colisiones).toEqual(r.enMemoria.colisiones);
        expect(
          serializarCanonico(
            construirBoveda(IDENTIDAD, r.plan.correspondencias),
          ),
        ).toBe(
          serializarCanonico(
            construirBoveda(IDENTIDAD, r.enMemoria.correspondencias),
          ),
        );
      }
      expect(r.plan.reparto?.mondrian?.alcanzado ?? null).toBe(
        r.enMemoria.mondrian?.alcanzado ?? null,
      );
      expect(r.plan.reparto?.optima?.niveles ?? null).toEqual(
        r.enMemoria.optima?.niveles ?? null,
      );
    });

  // S8 (ADR-016): los seudónimos con formato europeo salen del mismo `transformarDiccionario`, así que
  // son los mismos bytes por los dos caminos; el gate lo comprueba con la política RGPD entera sobre
  // el perfil europeo, con ocho formatos, el k de Mondrian y la supresión del art. 9 y del art. 10.
  describe("con la política RGPD sobre el perfil europeo", () => {
    const KIT_EUROPEO = [
      ...generarFilas({
        filas: 900,
        seed: 42,
        perfil: "europeo",
        tasaInvalida: 0.02,
        tasaVacia: 0.02,
      }),
    ]
      .map((fila) => `${fila.map(escaparCampo).join(",")}\n`)
      .join("");

    async function politicaRgpd(reversible: boolean): Promise<Politica> {
      const diagnostico = clasificar(await tablaEnMemoria(KIT_EUROPEO));
      const politica = construirPolitica(
        RGPD,
        diagnostico.columnas.map((c) => ({
          nombre: c.nombre,
          tipo: c.tipo,
          categoria: c.categoria,
        })),
      );
      return reversible
        ? politica
        : {
            ...politica,
            reglas: politica.reglas.map((r) =>
              r.tecnica.tipo === "seudonimizar" ||
              r.tecnica.tipo === "seudonimizar-con-formato"
                ? { ...r, tecnica: { ...r.tecnica, reversible: undefined } }
                : r,
            ),
          };
    }

    it.each([
      ["todo en su diccionario, con bóveda", HOLGADOS, true],
      ["columnas casi únicas tratadas por valor, sin bóveda", BAJOS, false],
    ] as const)("%s", async (_nombre, topes, reversible) => {
      const politica = await politicaRgpd(reversible);
      const r = await porLosDosCaminos(KIT_EUROPEO, politica, topes);
      expect(sha256(codificar(r.salida))).toBe(
        sha256(codificar(serializarCsv(r.enMemoria.tabla))),
      );
      expect(r.plan.suprimidas).toEqual(["diagnose", "casier_judiciaire"]);
      expect(r.plan.suprimidas).toEqual(r.enMemoria.suprimidas);
      if (reversible) {
        expect(r.plan.colisiones).toEqual(r.enMemoria.colisiones);
        expect(
          serializarCanonico(construirBoveda(IDENTIDAD, r.plan.correspondencias)),
        ).toBe(
          serializarCanonico(
            construirBoveda(IDENTIDAD, r.enMemoria.correspondencias),
          ),
        );
      }
    });
  });

  it("lo que el alto volumen mide es lo que mide la memoria: diagnóstico (con menos filas que la muestra), riesgo y balance", async () => {
    const r = await porLosDosCaminos(KIT, MONDRIAN, BAJOS);
    const diagnostico = clasificar(r.tabla);
    expect(r.pasada.diagnostico.columnas.map((c) => c.categoria)).toEqual(
      diagnostico.columnas.map((c) => c.categoria),
    );
    const { riesgo } = evaluarRiesgo(r.tabla, diagnostico);
    expect(r.pasada.riesgo).toEqual(riesgo);

    const qis = diagnostico.columnas
      .filter((c) => c.categoria === "cuasi-identificador")
      .map((c) => c.nombre);
    const sensibles = diagnostico.columnas
      .filter((c) => c.categoria === "dato-sensible")
      .map((c) => c.nombre);
    const extra = {
      mondrian: r.enMemoria.mondrian,
      ruidoNoAplicado: { columnas: [], maximo: 64 },
      reticulaExcedida: null,
    };
    const enMemoria = balanceDelTratamiento({
      tablaOriginal: r.tabla,
      tablaTransformada: r.enMemoria.tabla,
      diagnostico,
      politica: MONDRIAN,
      suprimidas: r.enMemoria.suprimidas,
      colisiones: r.enMemoria.colisiones,
      diversidad: medirDiversidad(
        r.enMemoria.tabla,
        qis.filter((n) => !r.enMemoria.suprimidas.includes(n)),
        sensibles.filter((n) => !r.enMemoria.suprimidas.includes(n)),
      ),
      pendientesDeMondrian: r.enMemoria.pendientesDeMondrian,
      ...extra,
    });
    // Las colisiones no se cuentan en las columnas tratadas por valor: con topes holgados, sí.
    const holgado = await porLosDosCaminos(KIT, MONDRIAN, HOLGADOS);
    expect(
      balanceDelAltoVolumen(
        holgado.pasada,
        holgado.plan,
        holgado.medida,
        MONDRIAN,
        extra,
      ),
    ).toEqual(enMemoria);
  });

  it("un CSV raro: encabezados vacíos y repetidos, filas cortas y largas, CRLF, BOM y saltos entre comillas", async () => {
    const raro =
      "﻿id,,id,nota\r\n" +
      Array.from(
        { length: 900 },
        (_, i) =>
          `${1_000_000 + i},x${i % 13},${i % 3},"nota ""${i}"",\r\nsegunda línea"${i % 11 === 0 ? ",sobra" : ""}`,
      ).join("\r\n") +
      "\r\ncorta\r\n";
    const politica: Politica = {
      version: 1,
      origen: "manual",
      kObjetivo: null,
      reglas: [
        { columna: "id", tecnica: { tipo: "seudonimizar", longitud: 12 } },
        { columna: "nota", tecnica: { tipo: "enmascarar" } },
      ],
    };
    for (const topes of [BAJOS, { ...BAJOS, trozo: 37 }]) {
      const r = await porLosDosCaminos(raro, politica, topes);
      expect(r.salida).toBe(serializarCsv(r.enMemoria.tabla));
    }
  });
});

describe("el regreso por trozos = en memoria", () => {
  it("el restaurado y su informe, byte a byte", async () => {
    const r = await porLosDosCaminos(KIT, BASE, HOLGADOS);
    const boveda = construirBoveda(IDENTIDAD, r.plan.correspondencias);
    // Lo que vuelve: el anonimizado, con una fila de más inventada por el tercero.
    const devuelto = `${r.salida}1999999999,1234567890-1,,,,,,,,,,,,,,,,,,,,,,\n`;

    const enMemoria = restaurar(await tablaEnMemoria(devuelto), boveda);
    const archivo = blobDe(devuelto);
    const pasada = await pasadaDelDevuelto(archivo, { topes: HOLGADOS });
    const destino = recolector();
    const porTrozos = await restaurarPorTrozos(
      archivo,
      pasada,
      boveda,
      sha256(codificar(devuelto)),
      destino,
      { topes: HOLGADOS },
    );
    expect(destino.texto()).toBe(serializarCsv(enMemoria.tabla));
    const { tabla: _tabla, ...informe } = enMemoria;
    void _tabla;
    expect({ ...porTrozos, filas: undefined }).toEqual({
      ...informe,
      filas: undefined,
    });
    expect(porTrozos.totales.restauradas).toBeGreaterThan(0);
  });
});

describe("lo que no cabe se dice, no se estima ni se escribe a medias", () => {
  it("una columna reversible sin diccionario completo: la bóveda no cabe", async () => {
    const archivo = blobDe(KIT);
    const huella = sha256(codificar(KIT));
    const pasada = await pasadaDeDiagnostico(archivo, { topes: BAJOS, huella });
    await expect(
      prepararTransformacion(archivo, pasada, BASE, llave, "es", huella, {
        topes: BAJOS,
      }),
    ).rejects.toMatchObject({ motivo: "alto-volumen-boveda-no-cabe" });
  });

  it("más combinaciones de cuasi-identificadores que las que se pueden contar: lo dice con el conteo", async () => {
    const archivo = blobDe(KIT);
    const error = await pasadaDeDiagnostico(archivo, {
      topes: { ...BAJOS, combinacionesDelRiesgo: 10 },
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NoCabeEnAltoVolumen);
    expect((error as NoCabeEnAltoVolumen).motivo).toBe(
      "alto-volumen-histograma-no-cabe",
    );
    expect((error as NoCabeEnAltoVolumen).cuantos).toBeGreaterThan(10);
  });

  it("un archivo que cambió en el disco entre dos pasadas no se escribe", async () => {
    const archivo = blobDe(KIT);
    const pasada = await pasadaDeDiagnostico(archivo, { topes: BAJOS });
    await expect(
      prepararTransformacion(
        archivo,
        pasada,
        MONDRIAN,
        llave,
        "es",
        "0".repeat(64),
        { topes: BAJOS },
      ),
    ).rejects.toThrow();
  });
});
