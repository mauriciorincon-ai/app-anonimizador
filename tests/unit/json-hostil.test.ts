// Entradas hostiles al lector de JSON: la gramática estricta, los archivos cortados y las formas que
// no son una lista de registros. Todo error es un `ErrorDeJson` con una clave y una línea.

import { describe, expect, it } from "vitest";

import { leerJson } from "../../src/engine/json/lector";
import { ErrorDeJson } from "../../src/engine/json/tipos";
import { celdas, esperarError, fuenteDe } from "./json-ayuda";

describe("gramática estricta (RFC 8259)", () => {
  const invalidos: Array<[string, string]> = [
    ["cero a la izquierda", '[{"a":01}]'],
    ["sin parte entera", '[{"a":.5}]'],
    ["punto sin decimales", '[{"a":1.}]'],
    ["signo más", '[{"a":+1}]'],
    ["NaN", '[{"a":NaN}]'],
    ["Infinity", '[{"a":Infinity}]'],
    ["-Infinity", '[{"a":-Infinity}]'],
    ["comillas simples", "[{'a':1}]"],
    ["coma final en el objeto", '[{"a":1,}]'],
    ["coma final en la lista", '[{"a":[1,]}]'],
    ["coma inicial en la lista", '[{"a":[,1]}]'],
    ["tabulador sin escapar", '[{"a":"x\ty"}]'],
    ["salto de línea sin escapar", '[{"a":"x\ny"}]'],
    ["escape inexistente", '[{"a":"\\x"}]'],
    ["\\u con dígitos no hexadecimales", '[{"a":"\\u12G4"}]'],
    ["\\u incompleto", '[{"a":"\\u12"}]'],
    ["true cortado", '[{"a":tru}]'],
    ["true mal escrito", '[{"a":trve}]'],
    ["null cortado", '[{"a":nul}]'],
    ["comentario", '[{"a":1} // c\n]'],
    ["clave sin valor", '[{"a"}]'],
    ["falta la coma", '[{"a":1 "b":2}]'],
    ["coma sola", "[{,}]"],
    ["valor ausente", '[{"a":}]'],
    ["falta el dos puntos", '[{"a" 1}]'],
    ["clave que no es cadena", "[{1:2}]"],
    ["llave de más", '[{"a":1}}]'],
    ["corchete de más", '[{"a":1}]]'],
    ["basura tras el arreglo", '[{"a":1}] x'],
    ["segundo documento", '[{"a":1}][{"a":2}]'],
    ["signo suelto", '[{"a":-}]'],
    ["exponente vacío", '[{"a":1e}]'],
    ["exponente con signo vacío", '[{"a":1e+}]'],
    ["doble signo", '[{"a":--1}]'],
    ["dos puntos decimales", '[{"a":1.2.3}]'],
    ["número pegado a otro valor", '[{"a":1true}]'],
    ["cadena sin cerrar", '[{"a":"abc'],
    ["basura al empezar", "@"],
    ["texto plano", "hola mundo"],
    ["archivo vacío", ""],
    ["solo espacios", "  \n\t "],
    ["solo un BOM", "﻿"],
    ["BOM en el medio", '[﻿{"a":1}]'],
    ["registro sin cerrar", '[{"a":1'],
    ["arreglo sin cerrar", '[{"a":1},'],
    ["solo el corchete", "["],
    ["JSON Lines con basura tras el registro", '{"a":1} x'],
    ["dos registros en la misma línea", '{"a":1}{"b":2}'],
    ["dos registros separados por coma", '{"a":1},{"b":2}'],
    ["JSON Lines con un registro roto", '{"a":1}\n{"a":'],
    ["llave suelta", "}"],
    ["dos puntos suelto", ":"],
  ];

  for (const [nombre, texto] of invalidos) {
    it(`rechaza con json-invalido: ${nombre}`, async () => {
      await esperarError(texto, "json-invalido");
      // Y exactamente igual leyendo de a un carácter.
      await esperarError(texto, "json-invalido", 1);
    });
  }

  it("el error jamás cita el contenido, ni el mensaje ni sus campos", async () => {
    const texto = '[{"cedula":"SECRETO-1032456789","x":SECRETO-2}]';
    for (const tamano of [Infinity, 1, 5]) {
      let error: unknown;
      try {
        await leerJson(fuenteDe(texto, tamano));
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(ErrorDeJson);
      expect(JSON.stringify(error)).not.toContain("SECRETO");
      expect((error as ErrorDeJson).message).not.toContain("SECRETO");
      expect((error as ErrorDeJson).stack ?? "").not.toContain("SECRETO");
    }
  });

  it("acepta los casos límite legales", async () => {
    const lectura = await leerJson(
      fuenteDe(
        '﻿ \n[ { "a" : [ ] , "b" : { } , "c" : -0.0e+0 , "d" : "\\u0000" , "e" : 1E400 , "f":"\\ud800" } ]  \n',
      ),
    );
    expect(celdas(lectura, "c")).toEqual(["-0.0e+0"]);
    expect(celdas(lectura, "d")).toEqual(["\u0000"]);
    expect(celdas(lectura, "e")).toEqual(["1E400"]);
    // Un sustituto suelto es legal en la gramática: se conserva tal cual.
    expect(celdas(lectura, "f")).toEqual(["\ud800"]);
  });
});

describe("lo que es JSON válido pero no es una lista de registros", () => {
  const noEsRegistros: Array<[string, string]> = [
    ["un número", "42"],
    ["una cadena", '"hola"'],
    ["true", "true"],
    ["null", "null"],
    ["un arreglo vacío", "[]"],
    ["un arreglo vacío con espacios", " [ \n ] "],
    ["un arreglo de números", "[1,2]"],
    ["un arreglo de cadenas", '["a"]'],
    ["un arreglo de null", "[null]"],
    ["un arreglo de arreglos", "[[1]]"],
    ["un objeto y luego un número", '[{"a":1}, 5]'],
    ["un objeto y luego un arreglo", '[{"a":1},[2]]'],
    ["un objeto y luego un null", '[{"a":1},null]'],
    ["JSON Lines con un número en la segunda línea", '{"a":1}\n5'],
    ["JSON Lines con un arreglo en la segunda línea", '{"a":1}\n[2]'],
    [
      "un objeto envuelto con sangría (no es JSON Lines)",
      '{\n  "usuarios": [{"a":1}]\n}',
    ],
  ];

  for (const [nombre, texto] of noEsRegistros) {
    it(`json-no-es-registros: ${nombre}`, async () => {
      await esperarError(texto, "json-no-es-registros");
      await esperarError(texto, "json-no-es-registros", 1);
    });
  }

  it("un registro de JSON Lines partido en varias líneas, tras el primero, es json-invalido", async () => {
    await esperarError('{"a":1}\n{"a":\n2}', "json-invalido");
  });

  it("un JSON Lines cortado justo tras una coma de la primera línea sigue siendo invalido", async () => {
    await esperarError('{"a":1,\n', "json-invalido");
  });
});

describe("archivos cortados en cada carácter", () => {
  const DOCUMENTO =
    '[\n  {"id":1,"n":"Ana \\u00e9 \\ud83d\\ude00","o":{"x":1.5e3,"l":[1,{"k":null}],"t":true}},\n' +
    '  {"id":-2,"o":{"x":-0,"m":[[],{}]},"z":false}\n]\n';
  const FIN_VALIDO = DOCUMENTO.lastIndexOf("]") + 1;

  async function motivoDe(texto: string, tamano: number): Promise<string> {
    try {
      await leerJson(fuenteDe(texto, tamano));
      return "ok";
    } catch (e) {
      // Cualquier otro tipo de error (un RangeError, un TypeError) sería un fallo del lector.
      expect(e).toBeInstanceOf(ErrorDeJson);
      return (e as ErrorDeJson).motivo;
    }
  }

  it("un arreglo cortado en CUALQUIER punto da ErrorDeJson, salvo tras el cierre", async () => {
    for (let corte = 0; corte <= DOCUMENTO.length; corte++) {
      const prefijo = DOCUMENTO.slice(0, corte);
      const esperado = corte >= FIN_VALIDO ? "ok" : null;
      const entero = await motivoDe(prefijo, Infinity);
      const porCaracter = await motivoDe(prefijo, 1);
      expect(porCaracter).toBe(entero);
      if (esperado === "ok") expect(entero).toBe("ok");
      else expect(entero).not.toBe("ok");
    }
  }, 30_000);

  it("JSON Lines cortado en cualquier punto: error con clave, o un archivo válido más corto", async () => {
    const lineas =
      '{"id":1,"o":{"x":[1,2]}}\n\n{"id":2,"s":"a\\nb"}\r\n{"id":3}\n';
    let validos = 0;
    for (let corte = 0; corte <= lineas.length; corte++) {
      const prefijo = lineas.slice(0, corte);
      const entero = await motivoDe(prefijo, Infinity);
      expect(await motivoDe(prefijo, 1)).toBe(entero);
      if (entero === "ok") validos++;
    }
    // Es válido al terminar cada registro (y todo lo que sigue hasta el siguiente); nada más.
    expect(validos).toBeGreaterThan(3);
    expect(validos).toBeLessThan(lineas.length);
  }, 30_000);
});

describe("lectura por trozos arbitrarios", () => {
  it("un escape \\uXXXX o un par sustituto partido entre dos trozos se lee igual", async () => {
    const texto = '[{"a":"x\\ud83d\\ude00y\\u00e9z","b":"😀"}]';
    const entero = await leerJson(fuenteDe(texto));
    for (let tamano = 1; tamano <= texto.length; tamano++) {
      const partido = await leerJson(fuenteDe(texto, tamano));
      expect(celdas(partido, "a")).toEqual(celdas(entero, "a"));
      expect(celdas(partido, "b")).toEqual(celdas(entero, "b"));
    }
    expect(celdas(entero, "a")).toEqual(["x😀yéz"]);
  });

  it("una fuente que entrega trozos vacíos entre medias no cambia nada", async () => {
    const fuente = () =>
      (async function* () {
        yield "";
        yield '[{"a"';
        yield "";
        yield ":12";
        yield "";
        yield "3}]";
      })();
    const lectura = await leerJson(fuente);
    expect(celdas(lectura, "a")).toEqual(["123"]);
  });

  it("un valor enorme repartido en muchos trozos no se repasa entero en cada uno", async () => {
    const largo = "x".repeat(900_000);
    const texto = `[{"a":"${largo}"}]`;
    const inicio = Date.now();
    const lectura = await leerJson(fuenteDe(texto, 4_096));
    expect(celdas(lectura, "a")[0]).toHaveLength(900_000);
    // No se mide un tiempo exacto (varía con la máquina), solo que no es cuadrático.
    expect(Date.now() - inicio).toBeLessThan(10_000);
  });
});
