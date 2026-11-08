// JSON por pasadas (S9): el gate «por trozos = en memoria» del S8, para JSON.
//
// El escritor es UNO: `VisitanteDeEscritura`. En memoria lo alimenta la tabla transformada entera;
// por pasadas, la fila que el alto volumen acaba de entregar. Lo que este archivo prueba es que, con
// la misma transformación, los dos caminos escriben los mismos bytes —en arreglo y en JSON Lines,
// con trozos de entrada de cualquier tamaño, con claves ausentes que la transformación llena, con
// columnas suprimidas y con el regreso a números— y que la lectura por pasadas ve las mismas filas
// que la lectura en memoria.

import { describe, expect, it } from "vitest";

import {
  PERFILES_SOLO_JSON,
  generarRegistros,
  serializarRegistro,
} from "../../docs/kit-de-prueba/generador.mjs";
import { ConstructorColumnar, valorEn } from "@/engine/columnar";
import { escribirJson } from "@/engine/json/escritor";
import { leerJson } from "@/engine/json/lector";
import { ErrorDeJson } from "@/engine/json/tipos";
import {
  descubrirJson,
  EscritorDeRegistros,
  lotesDeJson,
  registrosCrudos,
} from "@/engine/json/trozos";

import { fuenteDe, recoger } from "./json-ayuda";

const BASE = { seed: 42, tasaInvalida: 0.08, tasaVacia: 0.03 } as const;

/** Una transformación cualquiera, pero determinista y que toca cada caso del escritor. */
const suprimida = (c: number) => c % 5 === 0;
const numerica = (c: number) => c % 4 === 1;
function celdaNueva(c: number, valor: string): string {
  if (valor === "") return c % 3 === 0 ? "ETIQ" : "";
  if (numerica(c)) return "7";
  return c % 2 === 0 ? `P${valor}` : valor;
}

async function porLosDosCaminos(
  texto: string,
  tamano: number,
  filasPorLote = 3,
) {
  const fuente = fuenteDe(texto, tamano);
  const lectura = await leerJson(fuente);
  const nombres = lectura.tabla.columnas.map((c) => c.nombre);
  const originales = Array.from({ length: lectura.tabla.filas }, (_, f) =>
    lectura.tabla.columnas.map((columna) => valorEn(columna, f)),
  );
  const vivas = nombres.map((_, c) => c).filter((c) => !suprimida(c));
  const nuevas = originales.map((fila) =>
    vivas.map((c) => celdaNueva(c, fila[c])),
  );

  // En memoria.
  const constructor = new ConstructorColumnar(
    vivas.map((c) => nombres[c]),
    nuevas.length || 1,
  );
  for (const fila of nuevas) constructor.agregarFila(fila);
  const enMemoria = await recoger(
    escribirJson(
      fuente,
      lectura,
      constructor.finalizar(),
      new Set(vivas.filter(numerica).map((c) => nombres[c])),
    ),
  );

  // Por pasadas.
  const descripcion = await descubrirJson(fuente);
  const leidas: string[][] = [];
  for await (const lote of lotesDeJson(fuente, descripcion, filasPorLote))
    leidas.push(...lote);
  const escritor = new EscritorDeRegistros(
    descripcion,
    vivas,
    new Set(vivas.filter(numerica)),
  );
  let porTrozos = "";
  let i = 0;
  for await (const crudo of registrosCrudos(
    fuente,
    descripcion.estructura.forma,
  ))
    porTrozos += escritor.registro(crudo, nuevas[i++]);
  porTrozos += escritor.cierre();

  return {
    enMemoria,
    porTrozos,
    descripcion,
    leidas,
    nombres,
    originales,
    lectura,
  };
}

function comoArreglo(lineas: string[]): string {
  return `[\n${lineas.join(",\n")}\n]\n`;
}
function comoLineas(lineas: string[]): string {
  return `${lineas.join("\n")}\n`;
}

describe.each(PERFILES_SOLO_JSON as string[])(
  "perfil %s: por trozos = en memoria, byte a byte",
  (perfil) => {
    const lineas = [...generarRegistros({ ...BASE, perfil, filas: 60 })].map(
      (registro) => serializarRegistro(registro) as string,
    );
    const formas = [
      ["arreglo", comoArreglo(lineas)],
      ["JSON Lines", comoLineas(lineas)],
    ] as const;

    describe.each(formas)("%s", (_forma, texto) => {
      it.each([Infinity, 64, 7])(
        "trozos de entrada de %s caracteres",
        async (tamano) => {
          const r = await porLosDosCaminos(texto, tamano);
          expect(r.porTrozos).toBe(r.enMemoria);
          expect(r.leidas[0]).toEqual(r.nombres);
          expect(r.leidas.slice(1)).toEqual(r.originales);
          expect(r.descripcion.estructura).toEqual(r.lectura.estructura);
        },
      );
    });
  },
);

describe("lo que el kit no trae", () => {
  it("espacios, números crudos, escapes, comillas y llaves dentro de las cadenas, y un BOM", async () => {
    const texto =
      '\ufeff[ \n {"a" : 1E3, "b":"x}{\\"y]" ,"c": {"d":"\\u00e9", "e":[1,{"f":2}] } },\r\n' +
      '{"b":null,"c":{"d":"z"},"a":12345678901234567890}\n' +
      ',{"a":true}]\n';
    const sinBom = texto.slice(1);
    for (const t of [sinBom, comoLineas(['{"a":1}', '{"a":2,"b":"q\\\\"}'])]) {
      const r = await porLosDosCaminos(t, 5);
      expect(r.porTrozos).toBe(r.enMemoria);
    }
    // El BOM lo quita el decodificador del worker; aquí se prueba el arreglo ya sin él.
    const r = await porLosDosCaminos(sinBom, 3);
    expect(r.porTrozos).toBe(r.enMemoria);
  });

  // Auditoría del S9 (A1): un registro repartido en varias líneas es JSON válido en un arreglo, y el
  // escritor por pasadas lo alimentaba como una línea de JSON Lines. El kit escribe compacto, así
  // que ningún fixture lo traía.
  it.each([
    ["sangría de 2 espacios", 2],
    ["sangría de tabulador", "\t"],
  ] as const)(
    "un arreglo con %s: un registro ocupa varias líneas",
    async (_n, sangria) => {
      const filas = Array.from({ length: 12 }, (_, i) => ({
        id: i,
        nombre: `a\nb ${i}`,
        contacto: { correo: `p${i}@x.test`, tel: i % 3 === 0 ? null : `${i}` },
        lista: [1, { z: 2 }],
      }));
      const texto = `${JSON.stringify(filas, null, sangria)}\n`;
      for (const tamano of [Infinity, 7]) {
        const r = await porLosDosCaminos(texto, tamano, 5);
        expect(r.porTrozos).toBe(r.enMemoria);
      }
      // Y lo mismo con CRLF entre las líneas del registro.
      const crlf = texto.replace(/\n/g, "\r\n");
      const r = await porLosDosCaminos(crlf, 5);
      expect(r.porTrozos).toBe(r.enMemoria);
    },
  );

  it("un solo registro, y un registro vacío en JSON Lines", async () => {
    for (const t of ['[{"a":1}]', '{"a":1}\n', '{}\n{"a":1}\n']) {
      const r = await porLosDosCaminos(t, Infinity, 1);
      expect(r.porTrozos).toBe(r.enMemoria);
    }
  });
});

describe("la fuente que ya no es la que se describió", () => {
  const texto = comoLineas(['{"a":1}', '{"a":2}', '{"a":3}']);

  it("más registros: lotesDeJson lo dice con json-invalido", async () => {
    const descripcion = await descubrirJson(fuenteDe(texto));
    const otra = comoLineas(['{"a":1}', '{"a":2}', '{"a":3}', '{"a":4}']);
    await expect(
      (async () => {
        for await (const _ of lotesDeJson(fuenteDe(otra), descripcion)) void _;
      })(),
    ).rejects.toMatchObject({ motivo: "json-invalido" });
  });

  it("otra columna: lotesDeJson lo dice con json-invalido", async () => {
    const descripcion = await descubrirJson(fuenteDe(texto));
    const otra = comoLineas(['{"a":1}', '{"a":2,"b":1}', '{"a":3}']);
    await expect(
      (async () => {
        for await (const _ of lotesDeJson(fuenteDe(otra), descripcion)) void _;
      })(),
    ).rejects.toBeInstanceOf(ErrorDeJson);
  });

  it("el escritor no cierra si quedaron registros sin escribir", async () => {
    const descripcion = await descubrirJson(fuenteDe(texto));
    const escritor = new EscritorDeRegistros(descripcion, [0]);
    escritor.registro('{"a":1}', ["9"]);
    expect(() => escritor.cierre()).toThrow(ErrorDeJson);
  });

  it("el escritor no acepta más registros que los descritos", async () => {
    const descripcion = await descubrirJson(fuenteDe(texto));
    const escritor = new EscritorDeRegistros(descripcion, [0]);
    for (let i = 0; i < 3; i++) escritor.registro('{"a":1}', ["9"]);
    expect(() => escritor.registro('{"a":1}', ["9"])).toThrow(ErrorDeJson);
  });
});

describe("descubrirJson no guarda el archivo", () => {
  it("un JSON de 40 000 registros cabe con un tope de celdas diminuto en el lector en memoria", async () => {
    const lineas = Array.from(
      { length: 40_000 },
      (_, i) => `{"id":${i},"nombre":"n${i}","ciudad":"c${i % 7}"}`,
    );
    const texto = comoLineas(lineas);
    // En memoria, con 100 000 celdas de tope, no cabe (40 000 × 3 = 120 000)…
    await expect(
      leerJson(fuenteDe(texto, 4096), {
        rutas: 256,
        celdas: 100_000,
        profundidad: 32,
        largoDeClave: 256,
        largoDeTexto: 1_048_576,
      }),
    ).rejects.toMatchObject({ motivo: "json-excede-tope" });
    // …por pasadas sí, y ve todas las filas.
    const descripcion = await descubrirJson(fuenteDe(texto, 4096));
    expect(descripcion.estructura.registros).toBe(40_000);
    let filas = 0;
    for await (const lote of lotesDeJson(fuenteDe(texto, 4096), descripcion))
      filas += lote.length;
    expect(filas).toBe(40_001); // + el encabezado
  });
});
