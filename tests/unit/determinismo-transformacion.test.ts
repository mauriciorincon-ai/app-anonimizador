// GATE DE DETERMINISMO, EXTENDIDO A LAS TRANSFORMACIONES CON LLAVE (regla dura nº3, S2).
//
// El gate del S1 verificaba el diagnóstico: mismo archivo ⇒ mismo informe. Este sprint añade algo
// que el S1 no tenía: una **llave**. Y con ella, la promesa se vuelve doble y hay que probar las
// dos direcciones, porque cada una atrapa un defecto que la otra deja pasar:
//
//   · **misma llave ⇒ archivo byte-idéntico.** Atrapa el azar sin semilla, el orden de iteración
//     que cambia, el `Date.now()` colado.
//   · **llave distinta ⇒ archivo distinto.** Atrapa lo contrario, que es peor porque no se ve: un
//     HMAC mal cableado que ignorara la llave, o que devolviera una constante, pasaría la primera
//     dirección con nota perfecta y dejaría a todos los usuarios con los mismos seudónimos.

import { beforeAll, describe, expect, it } from "vitest";

import {
  generarFilas,
  generarRegistros,
  serializarRegistro,
} from "../../docs/kit-de-prueba/generador.mjs";
import { ConstructorColumnar, type TablaColumnar } from "@/engine/columnar";
import { nombreDelArchivoAnonimizado, serializarCsv } from "@/engine/csv";
import { escribirJson } from "@/engine/json/escritor";
import { leerJson } from "@/engine/json/lector";
import {
  exportarPolitica,
  hashDePolitica,
  type Politica,
} from "@/engine/politica";
import { serializarCanonico } from "@/engine/serializacion";
import { aplicarPolitica } from "@/engine/tecnicas";
import { sha256 } from "@/lib/sha256";

import { fuenteDe, recoger } from "./json-ayuda";

const OPCIONES = {
  filas: 1_500,
  seed: 42,
  perfil: "clinico",
  tasaInvalida: 0.08,
  tasaVacia: 0.03,
} as const;

/** Construye la tabla alimentando el constructor en bloques del tamaño dado (como el parser). */
function tablaPorBloques(tamano: number): TablaColumnar {
  const [encabezado, ...datos] = [...generarFilas(OPCIONES)];
  const constructor = new ConstructorColumnar(encabezado, tamano);
  for (let i = 0; i < datos.length; i += tamano) {
    for (const fila of datos.slice(i, i + tamano))
      constructor.agregarFila(fila);
  }
  return constructor.finalizar();
}

const POLITICA: Politica = {
  version: 1,
  origen: "manual",
  kObjetivo: null,
  reglas: [
    {
      columna: "cedula_titular",
      tecnica: { tipo: "seudonimizar-con-formato", formato: "cedula" },
    },
    {
      columna: "nit_empresa",
      tecnica: { tipo: "seudonimizar-con-formato", formato: "nit" },
    },
    { columna: "correo", tecnica: { tipo: "seudonimizar", longitud: 16 } },
    { columna: "celular", tecnica: { tipo: "enmascarar" } },
    {
      columna: "fecha_nacimiento",
      tecnica: { tipo: "generalizar-fecha", precision: "anio" },
    },
    { columna: "nombre_completo", tecnica: { tipo: "suprimir" } },
  ],
};

async function llaveDe(semilla: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(semilla.padEnd(32, ".")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/** El archivo de salida, tal cual se descarga, resumido con SHA-256. */
async function huellaDelArchivo(
  tabla: TablaColumnar,
  llave: CryptoKey,
): Promise<string> {
  const { tabla: transformada } = await aplicarPolitica(
    tabla,
    POLITICA,
    llave,
    "es",
  );
  return sha256(new TextEncoder().encode(serializarCsv(transformada)));
}

let llaveA: CryptoKey;
let llaveB: CryptoKey;
beforeAll(async () => {
  llaveA = await llaveDe("llave-del-proyecto-a");
  llaveB = await llaveDe("llave-del-proyecto-b");
});

describe("misma tabla + misma política + misma llave ⇒ archivo byte-idéntico", () => {
  it("dos corridas dan el mismo SHA-256", async () => {
    const primera = await huellaDelArchivo(tablaPorBloques(500), llaveA);
    const segunda = await huellaDelArchivo(tablaPorBloques(500), llaveA);
    expect(segunda).toBe(primera);
    expect(primera).toMatch(/^[0-9a-f]{64}$/);
  });

  it("el tamaño de los trozos del parser no cambia el archivo de salida", async () => {
    // PapaParse corta por bytes, no por filas: la frontera depende del archivo y del navegador. Si
    // el resultado dependiera de dónde cae el corte, dos computadores producirían archivos
    // distintos a partir del mismo CSV.
    const conTrozosChicos = await huellaDelArchivo(tablaPorBloques(7), llaveA);
    const conTrozoUnico = await huellaDelArchivo(
      tablaPorBloques(100_000),
      llaveA,
    );
    expect(conTrozoUnico).toBe(conTrozosChicos);
  });
});

describe("llave distinta ⇒ archivo distinto", () => {
  it("la otra dirección, que es la que atrapa un HMAC mal cableado", async () => {
    const tabla = tablaPorBloques(500);
    expect(await huellaDelArchivo(tabla, llaveB)).not.toBe(
      await huellaDelArchivo(tabla, llaveA),
    );
  });

  it("y CADA columna seudonimizada cambió, no solo el archivo en conjunto", async () => {
    // Un archivo distinto podría deberse a una sola columna. La promesa es más fuerte: toda
    // columna que dependa de la llave tiene que cambiar con ella.
    const tabla = tablaPorBloques(500);
    const conA = await aplicarPolitica(tabla, POLITICA, llaveA, "es");
    const conB = await aplicarPolitica(tabla, POLITICA, llaveB, "es");

    for (const nombre of ["cedula_titular", "nit_empresa", "correo"]) {
      const a = conA.tabla.columnas.find((c) => c.nombre === nombre)!;
      const b = conB.tabla.columnas.find((c) => c.nombre === nombre)!;
      expect(b.valores.slice(1), nombre).not.toEqual(a.valores.slice(1));
    }
  });

  it("lo que NO depende de la llave se queda igual con las dos", async () => {
    // El complemento del test anterior: si `celular` (enmascarado) o `fecha_nacimiento`
    // (generalizada) cambiaran con la llave, algo estaría leyendo la llave donde no debe.
    const tabla = tablaPorBloques(500);
    const conA = await aplicarPolitica(tabla, POLITICA, llaveA, "es");
    const conB = await aplicarPolitica(tabla, POLITICA, llaveB, "es");

    for (const nombre of ["celular", "fecha_nacimiento", "municipio"]) {
      const a = conA.tabla.columnas.find((c) => c.nombre === nombre)!;
      const b = conB.tabla.columnas.find((c) => c.nombre === nombre)!;
      expect(b.valores, nombre).toEqual(a.valores);
    }
  });
});

describe("con Mondrian en la política, el archivo sigue siendo byte-idéntico", () => {
  // El reparto es la parte del pipeline con más sitios donde perder el determinismo: el orden en
  // que se eligen las dimensiones, el desempate de rangos iguales, la mediana cuando se repite, y
  // el orden del diccionario que sale. El gate del S1 no lo veía porque no existía.
  const CON_REPARTO: Politica = {
    ...POLITICA,
    kObjetivo: 5,
    reglas: [
      ...POLITICA.reglas,
      { columna: "municipio", tecnica: { tipo: "generalizar-automatico" } },
      { columna: "estrato", tecnica: { tipo: "generalizar-automatico" } },
      { columna: "latitud", tecnica: { tipo: "generalizar-automatico" } },
    ],
  };

  async function huellaConReparto(tabla: TablaColumnar): Promise<string> {
    const { tabla: transformada, mondrian } = await aplicarPolitica(
      tabla,
      CON_REPARTO,
      llaveA,
      "es",
    );
    expect(mondrian?.alcanzado).toBe(true);
    return sha256(new TextEncoder().encode(serializarCsv(transformada)));
  }

  it("dos corridas dan el mismo SHA-256", async () => {
    const primera = await huellaConReparto(tablaPorBloques(500));
    expect(await huellaConReparto(tablaPorBloques(500))).toBe(primera);
  });

  it("y el tamaño de los trozos del parser tampoco lo mueve", async () => {
    expect(await huellaConReparto(tablaPorBloques(100_000))).toBe(
      await huellaConReparto(tablaPorBloques(13)),
    );
  });

  it("otro k da otro archivo — el gate no compara constantes", async () => {
    const tabla = tablaPorBloques(500);
    const conK50 = await aplicarPolitica(
      tabla,
      { ...CON_REPARTO, kObjetivo: 50 },
      llaveA,
      "es",
    );
    expect(
      sha256(new TextEncoder().encode(serializarCsv(conK50.tabla))),
    ).not.toBe(await huellaConReparto(tabla));
  });
});

describe("con la generalización óptima (S7), el archivo sigue siendo byte-idéntico", () => {
  // OLA recorre una retícula: el orden de los nodos de una altura y el desempate entre dos de igual
  // pérdida son los dos sitios donde perder el determinismo. Y la óptima no escribe palabras, así
  // que el idioma NO puede moverla: los dos idiomas dan el mismo archivo.
  const CON_OPTIMA: Politica = {
    ...POLITICA,
    kObjetivo: 5,
    reglas: [
      ...POLITICA.reglas,
      { columna: "municipio", tecnica: { tipo: "generalizar-automatico" } },
      { columna: "estrato", tecnica: { tipo: "generalizar-automatico" } },
      { columna: "sexo", tecnica: { tipo: "generalizar-automatico" } },
    ],
    generalizacion: {
      algoritmo: "optima",
      jerarquias: {
        municipio: { tipo: "divipola" },
        estrato: { tipo: "rango", amplitudes: [2, 4] },
      },
      diversidad: { l: 2, columnas: ["diagnostico"] },
    },
  };

  async function huellaConOptima(
    tabla: TablaColumnar,
    idioma: "es" | "en" = "es",
  ): Promise<string> {
    const r = await aplicarPolitica(tabla, CON_OPTIMA, llaveA, idioma);
    expect(r.mondrian).toBeNull();
    expect(r.optima?.alcanzado).toBe(true);
    return sha256(new TextEncoder().encode(serializarCsv(r.tabla)));
  }

  it("dos corridas dan el mismo SHA-256", async () => {
    const primera = await huellaConOptima(tablaPorBloques(500));
    expect(await huellaConOptima(tablaPorBloques(500))).toBe(primera);
  });

  it("ni el tamaño de los trozos del parser ni el idioma lo mueven", async () => {
    const base = await huellaConOptima(tablaPorBloques(13));
    expect(await huellaConOptima(tablaPorBloques(100_000))).toBe(base);
    expect(await huellaConOptima(tablaPorBloques(500), "en")).toBe(base);
  });

  it("y no es Mondrian con otro nombre: la misma tabla con Mondrian da otro archivo", async () => {
    const tabla = tablaPorBloques(500);
    const { generalizacion: _optima, ...conMondrian } = CON_OPTIMA;
    void _optima;
    const r = await aplicarPolitica(tabla, conMondrian, llaveA, "es");
    expect(r.mondrian).not.toBeNull();
    expect(sha256(new TextEncoder().encode(serializarCsv(r.tabla)))).not.toBe(
      await huellaConOptima(tabla),
    );
  });

  // S11: el tope de supresión es opcional y 0 se normaliza fuera. Una política que lo trae en 0 es
  // la MISMA política (mismo hash) y da el MISMO archivo; con tope, otro archivo, y estable.
  it("tope de supresión 0: mismo hash de política y el mismo archivo, byte por byte", async () => {
    const conCero: Politica = {
      ...CON_OPTIMA,
      generalizacion: { ...CON_OPTIMA.generalizacion!, supresionMaxima: 0 },
    };
    expect(hashDePolitica(conCero)).toBe(hashDePolitica(CON_OPTIMA));
    const tabla = tablaPorBloques(500);
    const r = await aplicarPolitica(tabla, conCero, llaveA, "es");
    expect(r.fuera).toBeNull();
    expect(r.tabla.filas, "con tope 0 no sale ninguna fila").toBe(tabla.filas);
    expect(sha256(new TextEncoder().encode(serializarCsv(r.tabla)))).toBe(
      await huellaConOptima(tabla),
    );
  });

  it("con tope, otro hash y otro archivo, el mismo en cada corrida y con cualquier trozo", async () => {
    const conTope: Politica = {
      ...CON_OPTIMA,
      generalizacion: { ...CON_OPTIMA.generalizacion!, supresionMaxima: 5 },
    };
    expect(hashDePolitica(conTope)).not.toBe(hashDePolitica(CON_OPTIMA));
    const huella = async (tabla: TablaColumnar) => {
      const r = await aplicarPolitica(tabla, conTope, llaveA, "es");
      expect(r.optima?.alcanzado).toBe(true);
      return {
        sha: sha256(new TextEncoder().encode(serializarCsv(r.tabla))),
        filas: r.tabla.filas,
      };
    };
    const base = await huella(tablaPorBloques(500));
    expect(await huella(tablaPorBloques(13))).toEqual(base);
    expect(await huella(tablaPorBloques(500))).toEqual(base);
    expect(base.sha).not.toBe(await huellaConOptima(tablaPorBloques(500)));
  });
});

describe("con ruido con garantía (S7), el archivo sigue siendo byte-idéntico", () => {
  // El ruido es el sitio donde el determinismo es más fácil de perder: cualquier azar sin semilla
  // pasaría todos los tests de comportamiento (el ruido «parece» ruido). Aquí se exige que salga de
  // la llave y de la huella del archivo, y de nada más: ni del idioma, ni del tamaño de los trozos.
  const CON_RUIDO: Politica = {
    ...POLITICA,
    reglas: [
      ...POLITICA.reglas,
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
        columna: "diagnostico",
        tecnica: { tipo: "respuesta-aleatorizada", epsilon: 2 },
      },
      { columna: "latitud", tecnica: { tipo: "perturbar", porcentaje: 5 } },
    ],
  };
  const HUELLA = "a".repeat(64);

  async function huellaConRuido(
    tabla: TablaColumnar,
    { llave = llaveA, idioma = "es" as "es" | "en", huella = HUELLA } = {},
  ): Promise<string> {
    const r = await aplicarPolitica(tabla, CON_RUIDO, llave, idioma, huella);
    expect(r.ruido.map((i) => i.columna)).toEqual([
      "latitud",
      "diagnostico",
      "monto",
    ]);
    return sha256(new TextEncoder().encode(serializarCsv(r.tabla)));
  }

  it("dos corridas dan el mismo SHA-256", async () => {
    const primera = await huellaConRuido(tablaPorBloques(500));
    expect(await huellaConRuido(tablaPorBloques(500))).toBe(primera);
  });

  it("ni el tamaño de los trozos del parser ni el idioma lo mueven", async () => {
    const base = await huellaConRuido(tablaPorBloques(13));
    expect(await huellaConRuido(tablaPorBloques(100_000))).toBe(base);
    expect(await huellaConRuido(tablaPorBloques(500), { idioma: "en" })).toBe(
      base,
    );
  });

  it("otra llave da otro ruido, y otro archivo (otra huella) también", async () => {
    const tabla = tablaPorBloques(500);
    const base = await huellaConRuido(tabla);
    expect(await huellaConRuido(tabla, { llave: llaveB })).not.toBe(base);
    expect(await huellaConRuido(tabla, { huella: "b".repeat(64) })).not.toBe(
      base,
    );
  });

  it("y el ruido no toca a los seudónimos: las columnas con llave salen igual que sin ruido", async () => {
    const tabla = tablaPorBloques(500);
    const sin = await aplicarPolitica(tabla, POLITICA, llaveA, "es");
    const con = await aplicarPolitica(tabla, CON_RUIDO, llaveA, "es", HUELLA);
    for (const nombre of ["cedula_titular", "nit_empresa", "correo"]) {
      const a = sin.tabla.columnas.find((c) => c.nombre === nombre)!;
      const b = con.tabla.columnas.find((c) => c.nombre === nombre)!;
      expect(b.valores, nombre).toEqual(a.valores);
    }
  });
});

describe("el gate no está comparando constantes", () => {
  it("otra política sobre la misma tabla da otro archivo", async () => {
    const tabla = tablaPorBloques(500);
    const otra: Politica = {
      ...POLITICA,
      reglas: [
        ...POLITICA.reglas.filter((r) => r.columna !== "fecha_nacimiento"),
        {
          columna: "fecha_nacimiento",
          tecnica: { tipo: "generalizar-fecha", precision: "mes" },
        },
      ],
    };
    expect(hashDePolitica(otra)).not.toBe(hashDePolitica(POLITICA));

    const { tabla: conOtra } = await aplicarPolitica(tabla, otra, llaveA, "es");
    const huellaOtra = sha256(new TextEncoder().encode(serializarCsv(conOtra)));
    expect(huellaOtra).not.toBe(await huellaDelArchivo(tabla, llaveA));
  });

  it("el archivo de salida ya no lleva la columna suprimida, en ninguna parte", async () => {
    const { tabla: transformada } = await aplicarPolitica(
      tablaPorBloques(500),
      POLITICA,
      llaveA,
      "es",
    );
    const csv = serializarCsv(transformada);
    expect(csv).not.toContain("nombre_completo");
  });
});

// ── El idioma del trabajo (S6) ────────────────────────────────────────────────────────────────
//
// Lo que Velo escribe DENTRO del archivo (los dos rótulos de un intervalo de Mondrian) sigue al
// idioma de la pantalla al pulsar «transformar». Eso añade una entrada a la función del archivo:
// mismo input + misma política + misma llave + MISMO IDIOMA ⇒ mismo archivo, byte por byte. Lo que
// el idioma NO puede hacer es entrar a la identidad del tratamiento: ni a la política, ni a su
// hash, ni a la bóveda, ni al nombre del archivo. Las dos versiones del CSV se llaman igual; solo
// su SHA-256 difiere, y eso es lo que el certificado declara.

describe("el idioma del trabajo", () => {
  const CON_REPARTO: Politica = {
    ...POLITICA,
    kObjetivo: 5,
    reglas: [
      ...POLITICA.reglas.map((regla) =>
        regla.columna === "correo"
          ? {
              columna: "correo",
              tecnica: {
                tipo: "seudonimizar" as const,
                longitud: 16,
                reversible: true,
              },
            }
          : regla,
      ),
      { columna: "municipio", tecnica: { tipo: "generalizar-automatico" } },
      { columna: "estrato", tecnica: { tipo: "generalizar-automatico" } },
      { columna: "latitud", tecnica: { tipo: "generalizar-automatico" } },
    ],
  };

  async function csvDe(
    politica: Politica,
    idioma: "es" | "en",
    tabla = tablaPorBloques(500),
  ) {
    const r = await aplicarPolitica(tabla, politica, llaveA, idioma);
    return { csv: serializarCsv(r.tabla), r };
  }

  const huella = (csv: string) => sha256(new TextEncoder().encode(csv));

  it("un CSV transformado SIN Mondrian es byte-idéntico en los dos idiomas", async () => {
    const es = await csvDe(POLITICA, "es");
    const en = await csvDe(POLITICA, "en");
    expect(es.r.mondrian).toBeNull();
    expect(en.csv).toBe(es.csv);
    expect(huella(en.csv)).toBe(huella(es.csv));
  });

  it("con Mondrian, cada idioma es byte-idéntico a sí mismo (dos corridas completas)", async () => {
    for (const idioma of ["es", "en"] as const) {
      const primera = huella((await csvDe(CON_REPARTO, idioma)).csv);
      const segunda = huella(
        (await csvDe(CON_REPARTO, idioma, tablaPorBloques(13))).csv,
      );
      expect(segunda, idioma).toBe(primera);
      expect(primera).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("y los dos idiomas NO dan el mismo archivo — el gate no compara constantes", async () => {
    const es = await csvDe(CON_REPARTO, "es");
    const en = await csvDe(CON_REPARTO, "en");
    expect(es.r.mondrian?.alcanzado).toBe(true);
    expect(en.r.mondrian?.alcanzado).toBe(true);
    expect(huella(en.csv)).not.toBe(huella(es.csv));
    // Lo que difiere son los dos rótulos y nada más: traducidos los del español, el CSV es el mismo.
    expect(
      es.csv.replaceAll(" a ", " to ").replaceAll(" (o vacío)", " (or empty)"),
    ).toBe(en.csv);
  });

  it("el idioma no toca la identidad: ni el hash de la política, ni la bóveda, ni el nombre del archivo", async () => {
    const antes = JSON.stringify(CON_REPARTO);
    const hashAntes = hashDePolitica(CON_REPARTO);

    const es = await csvDe(CON_REPARTO, "es");
    const en = await csvDe(CON_REPARTO, "en");

    // La política es la misma, el hash es el mismo y el JSON que se exporta no sabe de idiomas.
    expect(JSON.stringify(CON_REPARTO)).toBe(antes);
    expect(hashDePolitica(CON_REPARTO)).toBe(hashAntes);
    expect(exportarPolitica(CON_REPARTO)).not.toContain('"idioma"');
    // El nombre sale solo del hash: las dos versiones del CSV se llaman igual.
    expect(nombreDelArchivoAnonimizado(hashAntes)).toBe(
      `velo-anonimizado-${hashAntes.slice(0, 8)}.csv`,
    );
    // La correspondencia de la bóveda (original ↔ seudónimo) no depende del idioma.
    expect(es.r.correspondencias.length).toBeGreaterThan(0);
    expect(serializarCanonico(en.r.correspondencias)).toBe(
      serializarCanonico(es.r.correspondencias),
    );
    // Ni lo que no es Mondrian: columnas suprimidas y colisiones salen idénticas.
    expect(en.r.suprimidas).toEqual(es.r.suprimidas);
    expect(en.r.colisiones).toEqual(es.r.colisiones);
  });

  // Un JSON (S6), de punta a punta y con la política de verdad: leer, aplicar (Mondrian incluido) y
  // escribir. Las pruebas del escritor usan una transformación hecha a mano; esta no (hallazgo M2 de
  // la auditoría del S6). Es el mismo dato que el CSV de arriba, escrito como arreglo por el kit.
  describe("un JSON, de punta a punta", () => {
    const texto = `[\n${[...generarRegistros(OPCIONES)].map(serializarRegistro).join(",\n")}\n]\n`;

    async function jsonDe(idioma: "es" | "en", trozo = Infinity) {
      const lectura = await leerJson(fuenteDe(texto, trozo));
      const r = await aplicarPolitica(
        lectura.tabla,
        CON_REPARTO,
        llaveA,
        idioma,
      );
      const json = await recoger(
        escribirJson(fuenteDe(texto, trozo), lectura, r.tabla),
      );
      return { json, r };
    }

    it("cada idioma es byte-idéntico a sí mismo, se lea entero o en trozos", async () => {
      for (const idioma of ["es", "en"] as const) {
        const primera = await jsonDe(idioma);
        const segunda = await jsonDe(idioma, 4_093);
        expect(primera.r.mondrian?.alcanzado, idioma).toBe(true);
        expect(huella(segunda.json), idioma).toBe(huella(primera.json));
        expect(JSON.parse(primera.json)).toHaveLength(OPCIONES.filas);
      }
    });

    it("y los dos idiomas difieren en los rótulos del intervalo, y en nada más", async () => {
      const es = await jsonDe("es");
      const en = await jsonDe("en");
      expect(huella(en.json)).not.toBe(huella(es.json));
      expect(
        es.json
          .replaceAll(" a ", " to ")
          .replaceAll(" (o vacío)", " (or empty)"),
      ).toBe(en.json);
    });
  });
});
