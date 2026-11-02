// La segunda pasada: del original y la tabla transformada al JSON de salida.

import { describe, expect, it } from "vitest";

import { escribirJson } from "../../src/engine/json/escritor";
import { leerJson } from "../../src/engine/json/lector";
import { ErrorDeJson } from "../../src/engine/json/tipos";
import {
  fuenteDe,
  pasarPorLaAduana,
  recoger,
  reescribir,
  transformar,
} from "./json-ayuda";

// Un archivo ya canónico (compacto, un registro por línea) con todo lo que sabe romper un viaje de
// ida y vuelta: un número de 20 dígitos, 1E3, -0, claves enteras en SU orden, __proto__, null contra
// ausente contra "", escapes, un par sustituto, objetos vacíos y listas con de todo.
const CANONICO_ARREGLO =
  "[\n" +
  '{"id":12345678901234567890,"n":1E3,"z":-0,"2":"b","1":"a","__proto__":"p","nulo":null,"vacio":"","u":"caf\\u00e9 \\ud83d\\ude00 😀","t":true,"f":false,"o":{"x":1,"y":{"z":"deep"}},"e":{},"l":[1,{"a":[2,3.50]},"x",[],{}],"constructor":"c"},\n' +
  '{"id":2,"n":2.50,"o":{"x":2},"nulo":"ya no"},\n' +
  '{"1":"solo","2":"orden"}\n' +
  "]\n";
const CANONICO_LINEAS = CANONICO_ARREGLO.split("\n")
  .slice(1, -2)
  .map((linea) => linea.replace(/,$/, ""))
  .join("\n")
  .concat("\n");

describe("escribirJson — política identidad", () => {
  it("un archivo canónico sale BYTE a BYTE igual (arreglo)", async () => {
    expect(await reescribir(CANONICO_ARREGLO)).toBe(CANONICO_ARREGLO);
  });

  it("un archivo canónico sale BYTE a BYTE igual (JSON Lines)", async () => {
    expect(CANONICO_LINEAS.split("\n")).toHaveLength(4);
    expect(await reescribir(CANONICO_LINEAS)).toBe(CANONICO_LINEAS);
  });

  it("da lo mismo entero que de a 1, 2, 3, 7 o 64 caracteres", async () => {
    for (const tamano of [1, 2, 3, 7, 64]) {
      expect(await reescribir(CANONICO_ARREGLO, tamano)).toBe(CANONICO_ARREGLO);
      expect(await reescribir(CANONICO_LINEAS, tamano)).toBe(CANONICO_LINEAS);
    }
  });

  it("las claves enteras salen en su orden original, no ordenadas", async () => {
    const salida = await reescribir('[{"2":"b","10":"c","1":"a"}]');
    expect(salida).toBe('[\n{"2":"b","10":"c","1":"a"}\n]\n');
  });

  it("un archivo con sangría sale compacto, con la misma estructura y el mismo orden de claves", async () => {
    const bonito =
      '﻿[\r\n  {\r\n    "id": 1,\r\n    "o": { "a": [ 1,  2 ], "b": "x" },\r\n    "z": null\r\n  },\r\n' +
      '  {"id": 2, "o": {"a": [], "b": "y\\n"}}\r\n]';
    expect(await reescribir(bonito)).toBe(
      '[\n{"id":1,"o":{"a":[1,2],"b":"x"},"z":null},\n{"id":2,"o":{"a":[],"b":"y\\n"}}\n]\n',
    );
    // La salida es JSON que `JSON.parse` entiende (la prueba del otro lado de la frontera).
    const analizado = JSON.parse(await reescribir(bonito));
    expect(analizado).toHaveLength(2);
  });

  it("en JSON Lines, un registro por línea y compacto aunque la entrada tuviera espacios", async () => {
    const salida = await reescribir('{ "a" : [1, 2,\t{"b": 3}] }\r\n\r\n{"a":[ ]}');
    expect(salida).toBe('{"a":[1,2,{"b":3}]}\n{"a":[]}\n');
  });

  it("es determinista: leer y escribir dos veces da los mismos bytes", async () => {
    const primera = await reescribir(CANONICO_ARREGLO);
    const segunda = await reescribir(CANONICO_ARREGLO);
    expect(segunda).toBe(primera);
  });
});

describe("escribirJson — la tabla transformada manda", () => {
  it("una celda cambiada sale como TEXTO, aunque fuera un número; la que no cambió sale cruda", async () => {
    const { salida } = await pasarPorLaAduana(
      '[{"edad":34,"id":12345678901234567890,"n":"Ana","ok":true},{"edad":41,"id":2,"n":"Beto","ok":false}]',
      {
        valor: (nombre, _fila, original) =>
          nombre === "edad"
            ? Number(original) < 40
              ? "[30-40]"
              : "[40-50]"
            : original,
      },
    );
    expect(salida).toBe(
      '[\n{"edad":"[30-40]","id":12345678901234567890,"n":"Ana","ok":true},\n{"edad":"[40-50]","id":2,"n":"Beto","ok":false}\n]\n',
    );
  });

  it("el valor nuevo se escapa como corresponde (comillas, barras, saltos, unicode)", async () => {
    const { salida } = await pasarPorLaAduana('[{"n":"x"}]', {
      valor: () => 'dijo "hola"\n\\ café 😀  ',
    });
    expect(JSON.parse(salida)[0].n).toBe('dijo "hola"\n\\ café 😀  ');
    expect(salida.split("\n")).toHaveLength(4); // [ , registro, ] y el vacío final: sin saltos extra
  });

  it('las celdas vaciadas salen como lo que eran: texto → "", null/número/booleano → null', async () => {
    const { salida } = await pasarPorLaAduana(
      '[{"t":"a","n":5,"b":true,"c":null,"v":""}]',
      { valor: () => "" },
    );
    // `c` ya estaba vacía (null) y `v` también ("") — siguen igual; los demás se vaciaron.
    expect(salida).toBe('[\n{"t":"","n":null,"b":null,"c":null,"v":""}\n]\n');
  });

  it("una celda que era null y la transformación llenó sale como texto", async () => {
    const { salida } = await pasarPorLaAduana('[{"x":null,"y":""}]', {
      valor: () => "L",
    });
    expect(salida).toBe('[\n{"x":"L","y":"L"}\n]\n');
  });

  it("una columna ausente en el registro y vacía en la salida no escribe la clave", async () => {
    const { salida } = await pasarPorLaAduana('[{"a":1,"b":2},{"a":3}]');
    expect(salida).toBe('[\n{"a":1,"b":2},\n{"a":3}\n]\n');
  });
});

describe("escribirJson — etiquetas sobre celdas que no existían", () => {
  it("se agregan al FINAL del registro, como texto (Mondrian etiqueta también las vacías)", async () => {
    const { salida } = await pasarPorLaAduana(
      '[{"a":1,"b":5},{"a":2},{"c":9}]',
      {
        valor: (nombre, fila, original) =>
          nombre === "b" ? `[${fila}]` : original,
      },
    );
    expect(salida).toBe(
      '[\n{"a":1,"b":"[0]"},\n{"a":2,"b":"[1]"},\n{"c":9,"b":"[2]"}\n]\n',
    );
  });

  it("crea los objetos intermedios que falten, agrupados y en el orden de descubrimiento", async () => {
    const { salida, lectura } = await pasarPorLaAduana(
      '[{"p":{"q":{"r":1,"s":2},"t":3}},{"p":{"u":4}},{"z":1}]',
      { valor: (nombre, fila, original) => (nombre === "z" ? original : `${nombre}@${fila}`) },
    );
    expect(lectura.tabla.columnas.map((c) => c.nombre)).toEqual([
      "p.q.r",
      "p.q.s",
      "p.t",
      "p.u",
      "z",
    ]);
    // Registro 0: todo existe salvo p.u (se agrega al final de `p`). Registro 1: falta `q` entero
    // (se crea con sus dos hijos) y p.t. Registro 2: falta `p` entero.
    expect(JSON.parse(salida)).toEqual([
      { p: { q: { r: "p.q.r@0", s: "p.q.s@0" }, t: "p.t@0", u: "p.u@0" } },
      { p: { u: "p.u@1", q: { r: "p.q.r@1", s: "p.q.s@1" }, t: "p.t@1" } },
      { z: 1, p: { q: { r: "p.q.r@2", s: "p.q.s@2" }, t: "p.t@2", u: "p.u@2" } },
    ]);
    // El orden es el de la tabla (descubrimiento), no el alfabético ni el de aparición en el registro.
    expect(salida).toContain('{"p":{"u":"p.u@1","q":{"r":"p.q.r@1","s":"p.q.s@1"},"t":"p.t@1"}}');
    expect(salida).toContain('{"z":1,"p":{"q":{"r":"p.q.r@2","s":"p.q.s@2"},"t":"p.t@2","u":"p.u@2"}}');
  });

  it("si la clave existe como otra cosa en ese registro (valor suelto, lista), la etiqueta no cabe y se omite", async () => {
    const { salida } = await pasarPorLaAduana(
      '[{"a":{"b":1}},{"a":5},{"a":[1]},{"a":{}},{"a":{"c":2}}]',
      {
        valor: (nombre) =>
          nombre === "a.b" ? "L" : nombre === "a.c" ? "M" : "A",
      },
    );
    const analizado = JSON.parse(salida);
    expect(analizado[0]).toEqual({ a: { b: "L", c: "M" } });
    // `a` es un valor suelto o una lista: sus hijos no caben, y el valor de `a` (cambiado) sale como texto.
    expect(analizado[1]).toEqual({ a: "A" });
    expect(analizado[2]).toEqual({ a: [1] });
    // Un objeto vacío SÍ es un objeto: allí se agregan.
    expect(analizado[3]).toEqual({ a: { b: "L", c: "M" } });
    expect(analizado[4]).toEqual({ a: { c: "M", b: "L" } });
  });

  it("una ruta que es valor y contenedor a la vez: el valor gana la clave si ambos faltaron", async () => {
    const { salida } = await pasarPorLaAduana('[{"x":{"y":1}},{"x":7},{}]', {
      valor: (nombre) => `L:${nombre}`,
    });
    const analizado = JSON.parse(salida);
    expect(analizado[2]).toEqual({ x: "L:x" });
    expect(analizado[0]).toEqual({ x: { y: "L:x.y" } });
  });

  it("solo se agregan las que la transformación llenó: una fila ausente y vacía en la salida no escribe nada", async () => {
    const { salida } = await pasarPorLaAduana('[{"a":1},{"a":2},{"b":3}]', {
      valor: (nombre, fila, original) => (nombre === "b" && fila === 0 ? "L" : original),
    });
    expect(salida).toBe('[\n{"a":1,"b":"L"},\n{"a":2},\n{"b":3}\n]\n');
  });

  it("sin celdas llenadas donde no había, el registro no cambia (nada de objetos vacíos de más)", async () => {
    const { salida } = await pasarPorLaAduana('[{"a":{"b":1}},{"z":1}]');
    expect(salida).toBe('[\n{"a":{"b":1}},\n{"z":1}\n]\n');
  });
});

describe("escribirJson — supresión", () => {
  const FUENTE =
    '[{"a":1,"o":{"x":1,"y":2},"l":[1,2],"b":2,"c":3},{"a":4,"b":5,"c":6}]';

  it("una columna suprimida se omite en todas partes, sin dejar comas huérfanas", async () => {
    expect(
      (await pasarPorLaAduana(FUENTE, { suprimir: ["a", "c"] })).salida,
    ).toBe('[\n{"o":{"x":1,"y":2},"l":[1,2],"b":2},\n{"b":5}\n]\n');
    expect((await pasarPorLaAduana(FUENTE, { suprimir: ["b"] })).salida).toBe(
      '[\n{"a":1,"o":{"x":1,"y":2},"l":[1,2],"c":3},\n{"a":4,"c":6}\n]\n',
    );
    expect(
      (await pasarPorLaAduana(FUENTE, { suprimir: ["a", "b", "c"] })).salida,
    ).toBe('[\n{"o":{"x":1,"y":2},"l":[1,2]},\n{}\n]\n');
  });

  it("un padre cuyos hijos se omitieron todos queda {}", async () => {
    const { salida } = await pasarPorLaAduana(FUENTE, {
      suprimir: ["o.x", "o.y"],
    });
    expect(salida).toBe(
      '[\n{"a":1,"o":{},"l":[1,2],"b":2,"c":3},\n{"a":4,"b":5,"c":6}\n]\n',
    );
  });

  it("lo suprimido no recibe etiquetas", async () => {
    const { salida } = await pasarPorLaAduana('[{"a":1,"b":2},{"a":3}]', {
      suprimir: ["b"],
      valor: (nombre) => (nombre === "a" ? "X" : "ignorado"),
    });
    expect(salida).toBe('[\n{"a":"X"},\n{"a":"X"}\n]\n');
  });

  it("las listas y los subárboles sin valores sueltos se copian crudos, compactos, aunque lleven sus propios datos", async () => {
    const { salida } = await pasarPorLaAduana(
      '[{"id": 1 , "contactos" : [ {"correo" : "a@x.co" , "n": 1E2 }, [ ] ], "vacio":{ }, "solo_listas":{"l":[ 1 ]}}]',
      { valor: (nombre) => (nombre === "id" ? "seudonimo" : "otro") },
    );
    expect(salida).toBe(
      '[\n{"id":"seudonimo","contactos":[{"correo":"a@x.co","n":1E2},[]],"vacio":{},"solo_listas":{"l":[1]}}\n]\n',
    );
  });
});

describe("escribirJson — salida en trozos", () => {
  it("entrega trozos de ≈ 64 KB hechos de registros COMPLETOS (JSON Lines)", async () => {
    const registros = Array.from(
      { length: 6_000 },
      (_, i) => `{"id":${i},"nombre":"persona número ${i}","o":{"x":${i % 7}}}`,
    );
    const texto = registros.join("\n") + "\n";
    const lectura = await leerJson(fuenteDe(texto, 10_000));
    const trozos: string[] = [];
    for await (const trozo of escribirJson(
      fuenteDe(texto, 10_000),
      lectura,
      lectura.tabla,
    )) {
      trozos.push(trozo);
    }
    expect(trozos.length).toBeGreaterThan(3);
    expect(trozos.join("")).toBe(texto);
    for (const trozo of trozos) {
      expect(trozo.length).toBeGreaterThan(0);
      expect(trozo.endsWith("\n")).toBe(true);
      // Cada línea del trozo es un registro entero que `JSON.parse` entiende.
      for (const linea of trozo.trimEnd().split("\n")) JSON.parse(linea);
    }
    for (const trozo of trozos.slice(0, -1)) {
      expect(trozo.length).toBeGreaterThanOrEqual(64 * 1024);
      expect(trozo.length).toBeLessThan(2 * 64 * 1024);
    }
  });

  it("un registro más grande que un trozo sale entero, y no queda un trozo vacío al final", async () => {
    const texto = `{"a":"${"y".repeat(150_000)}","b":1}\n`;
    const lectura = await leerJson(fuenteDe(texto));
    const trozos: string[] = [];
    for await (const trozo of escribirJson(fuenteDe(texto), lectura, lectura.tabla)) {
      trozos.push(trozo);
    }
    expect(trozos.join("")).toBe(texto);
    expect(trozos.every((t) => t.length > 0)).toBe(true);
  });

  it("con un arreglo y una entrada de un solo trozo enorme, también sale en trozos acotados", async () => {
    const registros = Array.from(
      { length: 10_000 },
      (_, i) => `{"id":${i},"a":"${"x".repeat(30)}"}`,
    );
    const texto = `[${registros.join(",")}]`;
    const lectura = await leerJson(fuenteDe(texto));
    const trozos: string[] = [];
    for await (const trozo of escribirJson(
      fuenteDe(texto),
      lectura,
      lectura.tabla,
    )) {
      trozos.push(trozo);
    }
    expect(trozos.length).toBeGreaterThan(2);
    const todo = trozos.join("");
    expect(todo.startsWith("[\n{")).toBe(true);
    expect(todo.endsWith("}\n]\n")).toBe(true);
    expect(JSON.parse(todo)).toHaveLength(10_000);
    // Ningún trozo corta un registro por la mitad.
    for (const trozo of trozos.slice(0, -1)) {
      expect(trozo.endsWith("}")).toBe(true);
    }
  });
});

describe("escribirJson — defensas", () => {
  it("si la segunda pasada ve un archivo distinto, aborta con ErrorDeJson", async () => {
    const original = '[{"a":1},{"a":2}]';
    const lectura = await leerJson(fuenteDe(original));
    const distintos = [
      '[{"a":1},{"a":2},{"a":3}]', // más registros
      '[{"a":1}]', // menos registros
      '{"a":1}\n{"a":2}', // otra forma
      '[{"a":1},{"b":2}]', // un valor suelto donde no hubo ninguno
      '[{"a":1},{"a":',
    ];
    for (const texto of distintos) {
      let error: unknown;
      try {
        await recoger(escribirJson(fuenteDe(texto), lectura, lectura.tabla));
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(ErrorDeJson);
    }
  });

  it("una tabla transformada con otro número de filas es un error de programación", async () => {
    const lectura = await leerJson(fuenteDe('[{"a":1},{"a":2}]'));
    const otra = await leerJson(fuenteDe('[{"a":1}]'));
    await expect(
      recoger(escribirJson(fuenteDe('[{"a":1},{"a":2}]'), lectura, otra.tabla)),
    ).rejects.toThrow(/mismas filas/);
  });

  it("las columnas se emparejan POR NOMBRE: el orden de la transformada no importa", async () => {
    const lectura = await leerJson(fuenteDe('[{"a":1,"b":"x"}]'));
    const t = transformar(lectura, {
      valor: (n, _f, o) => (n === "b" ? "Y" : o),
    });
    const invertida = { ...t, columnas: [...t.columnas].reverse() };
    expect(
      await recoger(
        escribirJson(fuenteDe('[{"a":1,"b":"x"}]'), lectura, invertida),
      ),
    ).toBe('[\n{"a":1,"b":"Y"}\n]\n');
  });

  it("una columna sin `ruta` (tabla armada a mano) se parte desde su nombre", async () => {
    const lectura = await leerJson(fuenteDe('[{"a.b":1,"c":{"d":2}}]'));
    const sinRuta = {
      ...lectura,
      tabla: {
        ...lectura.tabla,
        columnas: lectura.tabla.columnas.map((c) => ({
          nombre: c.nombre,
          codigos: c.codigos,
          valores: c.valores,
          noVacios: c.noVacios,
        })),
      },
    };
    expect(
      await recoger(
        escribirJson(
          fuenteDe('[{"a.b":1,"c":{"d":2}}]'),
          sinRuta,
          sinRuta.tabla,
        ),
      ),
    ).toBe('[\n{"a.b":1,"c":{"d":2}}\n]\n');
  });
});
