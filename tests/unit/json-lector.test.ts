// La primera pasada: del texto de un JSON a una tabla columnar dispersa, sus clases y su estructura.

import { describe, expect, it } from "vitest";

import { leerJson } from "../../src/engine/json/lector";
import { CLASE_DE_CELDA, TOPES_JSON } from "../../src/engine/json/tipos";
import {
  celdas,
  clasesDe,
  esperarError,
  fuenteDe,
  nombresDe,
} from "./json-ayuda";

const { ausente, texto, numero, verdadero, falso, nulo } = CLASE_DE_CELDA;

describe("leerJson — la tabla", () => {
  it("una columna por ruta de valores sueltos, en orden de descubrimiento, con su ruta", async () => {
    const lectura = await leerJson(
      fuenteDe(
        '[{"id":1,"paciente":{"nombre":"Ana","contacto":{"correo":"a@x.co"}}},{"id":2,"extra":"x","paciente":{"nombre":"Beto"}}]',
      ),
    );
    expect(nombresDe(lectura)).toEqual([
      "id",
      "paciente.nombre",
      "paciente.contacto.correo",
      "extra",
    ]);
    expect(lectura.tabla.filas).toBe(2);
    expect(lectura.tabla.columnas.map((c) => c.ruta)).toEqual([
      ["id"],
      ["paciente", "nombre"],
      ["paciente", "contacto", "correo"],
      ["extra"],
    ]);
    expect(celdas(lectura, "paciente.nombre")).toEqual(["Ana", "Beto"]);
    // Las celdas de los registros donde la ruta no existe quedan vacías y «ausentes».
    expect(celdas(lectura, "paciente.contacto.correo")).toEqual(["a@x.co", ""]);
    expect(clasesDe(lectura, "paciente.contacto.correo")).toEqual([
      texto,
      ausente,
    ]);
    // Una columna descubierta en el registro 2 se rellena hacia atrás.
    expect(celdas(lectura, "extra")).toEqual(["", "x"]);
    expect(clasesDe(lectura, "extra")).toEqual([ausente, texto]);
    expect(lectura.tabla.columnas[3].noVacios).toBe(1);
    expect(lectura.clases).toHaveLength(4);
  });

  it("los números conservan su texto CRUDO y la clase los distingue del texto", async () => {
    const lectura = await leerJson(
      fuenteDe(
        '[{"a":12345678901234567890,"b":1E3,"c":-0,"d":2.50,"e":"12","f":-1.5e-7,"g":0}]',
      ),
    );
    expect(celdas(lectura, "a")).toEqual(["12345678901234567890"]);
    expect(celdas(lectura, "b")).toEqual(["1E3"]);
    expect(celdas(lectura, "c")).toEqual(["-0"]);
    expect(celdas(lectura, "d")).toEqual(["2.50"]);
    expect(celdas(lectura, "f")).toEqual(["-1.5e-7"]);
    expect(celdas(lectura, "g")).toEqual(["0"]);
    expect(clasesDe(lectura, "a")).toEqual([numero]);
    expect(clasesDe(lectura, "e")).toEqual([texto]);
  });

  it("distingue null, cadena vacía y clave ausente; true y false llevan su clase", async () => {
    const lectura = await leerJson(
      fuenteDe('[{"x":null,"y":"","t":true,"f":false},{"y":"v"},{"x":"w"}]'),
    );
    expect(celdas(lectura, "x")).toEqual(["", "", "w"]);
    expect(clasesDe(lectura, "x")).toEqual([nulo, ausente, texto]);
    expect(celdas(lectura, "y")).toEqual(["", "v", ""]);
    expect(clasesDe(lectura, "y")).toEqual([texto, texto, ausente]);
    expect(celdas(lectura, "t")).toEqual(["true", "", ""]);
    expect(clasesDe(lectura, "t")).toEqual([verdadero, ausente, ausente]);
    expect(celdas(lectura, "f")).toEqual(["false", "", ""]);
    expect(clasesDe(lectura, "f")).toEqual([falso, ausente, ausente]);
  });

  it("decodifica los escapes, también los pares sustitutos", async () => {
    const lectura = await leerJson(
      fuenteDe('[{"a":"caf\\u00e9 \\ud83d\\ude00 \\n\\t\\"\\\\\\/\\b\\f\\r"}]'),
    );
    expect(celdas(lectura, "a")).toEqual(['café 😀 \n\t"\\/\b\f\r']);
  });

  it("las claves `__proto__` y `constructor` son claves como cualquier otra", async () => {
    const lectura = await leerJson(
      fuenteDe(
        '[{"__proto__":"a","constructor":"b","toString":"c","o":{"__proto__":1}}]',
      ),
    );
    expect(nombresDe(lectura)).toEqual([
      "__proto__",
      "constructor",
      "toString",
      "o.__proto__",
    ]);
    expect(celdas(lectura, "__proto__")).toEqual(["a"]);
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    expect(({} as Record<string, unknown>)["a"]).toBeUndefined();
  });

  it("una clave con punto y un objeto anidado son columnas DISTINTAS", async () => {
    const lectura = await leerJson(
      fuenteDe('[{"a.b":1,"a":{"b":2},"":3,"x":{"":4}}]'),
    );
    expect(nombresDe(lectura)).toEqual(["a\\.b", "a.b", "\\_", "x.\\_"]);
    expect(celdas(lectura, "a\\.b")).toEqual(["1"]);
    expect(celdas(lectura, "a.b")).toEqual(["2"]);
    expect(lectura.tabla.columnas[0].ruta).toEqual(["a.b"]);
    expect(lectura.tabla.columnas[2].ruta).toEqual([""]);
  });

  it("registros sin ningún valor suelto dan una tabla sin columnas pero con filas", async () => {
    const lectura = await leerJson(fuenteDe("[{},{}]"));
    expect(lectura.tabla.columnas).toHaveLength(0);
    expect(lectura.tabla.filas).toBe(2);
    expect(lectura.estructura.registros).toBe(2);
    expect(lectura.estructura.rutasTratadas).toBe(0);
  });

  it("el mismo resultado leyendo de a un carácter, de a tres y entero", async () => {
    const texto =
      '﻿[\r\n {"id":12345678901234567890,"n":"caf\\u00e9 \\ud83d\\ude00 😀","o":{"x":-1.5E+3,"l":[1,{"k":null}]},"t":true,"z":null},\n{"id":2,"extra":false}\n]\n';
    const entero = await leerJson(fuenteDe(texto));
    for (const tamano of [1, 2, 3, 5, 17]) {
      const partido = await leerJson(fuenteDe(texto, tamano));
      expect(nombresDe(partido)).toEqual(nombresDe(entero));
      expect(partido.estructura).toEqual(entero.estructura);
      for (const nombre of nombresDe(entero)) {
        expect(celdas(partido, nombre)).toEqual(celdas(entero, nombre));
        expect(clasesDe(partido, nombre)).toEqual(clasesDe(entero, nombre));
      }
    }
  });

  it("crece más allá de la capacidad inicial y rellena hacia atrás sin perder nada", async () => {
    const registros: string[] = [];
    for (let i = 0; i < 2_500; i++) {
      registros.push(i === 2_000 ? '{"id":2000,"tarde":"si"}' : `{"id":${i}}`);
    }
    const lectura = await leerJson(fuenteDe(`[${registros.join(",")}]`));
    expect(lectura.tabla.filas).toBe(2_500);
    expect(celdas(lectura, "id")[2_499]).toBe("2499");
    const tarde = celdas(lectura, "tarde");
    expect(tarde[2_000]).toBe("si");
    expect(tarde.filter((v) => v !== "")).toHaveLength(1);
    const clases = clasesDe(lectura, "tarde");
    expect(clases[0]).toBe(ausente);
    expect(clases[2_000]).toBe(texto);
    expect(clases[2_499]).toBe(ausente);
  });
});

describe("leerJson — las formas", () => {
  it("un arreglo de objetos, aunque venga en una sola línea o con saltos de línea mixtos", async () => {
    const a = await leerJson(fuenteDe('[{"a":1},{"a":2}]'));
    const b = await leerJson(fuenteDe('[\r\n{"a":1},\n  {"a":2}\r\n]\n\n'));
    expect(a.estructura.forma).toBe("arreglo");
    expect(b.estructura.forma).toBe("arreglo");
    expect(celdas(a, "a")).toEqual(["1", "2"]);
    expect(celdas(b, "a")).toEqual(["1", "2"]);
  });

  it("JSON Lines: un objeto por línea, líneas en blanco ignoradas, CRLF", async () => {
    const lectura = await leerJson(
      fuenteDe('{"a":1}\r\n\r\n{"a":2,"b":"x"}\n   \n{"a":3}'),
    );
    expect(lectura.estructura.forma).toBe("lineas");
    expect(lectura.estructura.registros).toBe(3);
    expect(celdas(lectura, "a")).toEqual(["1", "2", "3"]);
    expect(celdas(lectura, "b")).toEqual(["", "x", ""]);
  });

  it("la profundidad cuenta el objeto del registro como el nivel 1", async () => {
    expect((await leerJson(fuenteDe('[{"a":1}]'))).estructura.profundidad).toBe(
      1,
    );
    expect(
      (await leerJson(fuenteDe('[{"a":{"b":1}}]'))).estructura.profundidad,
    ).toBe(2);
    expect(
      (await leerJson(fuenteDe('[{"a":1},{"a":{"b":[{"c":1}]}}]'))).estructura
        .profundidad,
    ).toBe(4);
  });
});

describe("leerJson — listas", () => {
  it("las listas NO son columnas: se declaran, con cuántos registros las traen", async () => {
    const lectura = await leerJson(
      fuenteDe(
        '[{"id":1,"etiquetas":["a","b"],"vacia":[]},{"id":2,"etiquetas":[1]},{"id":3}]',
      ),
    );
    expect(nombresDe(lectura)).toEqual(["id"]);
    expect(lectura.estructura.noTratadas).toEqual([
      { ruta: "etiquetas[]", motivo: "lista", registros: 2, pistas: [] },
      { ruta: "vacia[]", motivo: "lista", registros: 1, pistas: [] },
    ]);
    expect(lectura.estructura.rutasTratadas).toBe(1);
  });

  it("una lista con objetos es «lista-de-objetos» y trae pistas: nombres, ordenados, sin valores", async () => {
    const lectura = await leerJson(
      fuenteDe(
        '[{"contactos":[{"tipo":"movil","correo":"SECRETO@x.co","direccion":{"ciudad":"Cali","calle":"1"}},{"correo":"otro@x.co","tags":["a",{"k":1}]}]},{"contactos":[]}]',
      ),
    );
    expect(lectura.estructura.noTratadas).toEqual([
      {
        ruta: "contactos[]",
        motivo: "lista-de-objetos",
        registros: 2,
        pistas: [
          "contactos[].correo",
          "contactos[].direccion.calle",
          "contactos[].direccion.ciudad",
          "contactos[].tags[]",
          "contactos[].tags[].k",
          "contactos[].tipo",
        ],
      },
    ]);
    // Los valores jamás aparecen en la estructura.
    expect(JSON.stringify(lectura.estructura)).not.toContain("SECRETO");
    expect(lectura.tabla.columnas).toHaveLength(0);
  });

  it("una lista de listas es «lista-de-objetos» y sus rutas se nombran con []", async () => {
    const lectura = await leerJson(fuenteDe('[{"m":[[1,2],[3]]}]'));
    expect(lectura.estructura.noTratadas).toEqual([
      {
        ruta: "m[]",
        motivo: "lista-de-objetos",
        registros: 1,
        pistas: ["m[][]"],
      },
    ]);
  });

  it("las pistas se acotan a 8 y son las 8 menores, sin importar el orden en que aparezcan", async () => {
    const claves = "jihgfedcbazyx".split("");
    const elemento = (ks: string[]) =>
      "{" + ks.map((k) => `"${k}":1`).join(",") + "}";
    const a = await leerJson(fuenteDe(`[{"l":[${elemento(claves)}]}]`));
    const b = await leerJson(
      fuenteDe(`[{"l":[${elemento([...claves].reverse())}]}]`),
    );
    const esperado = ["a", "b", "c", "d", "e", "f", "g", "h"].map(
      (k) => `l[].${k}`,
    );
    expect(a.estructura.noTratadas[0].pistas).toEqual(esperado);
    expect(b.estructura.noTratadas[0].pistas).toEqual(esperado);
  });

  it("una lista dentro de un objeto anidado lleva su ruta completa, y una clave con punto se escapa", async () => {
    const lectura = await leerJson(
      fuenteDe('[{"p":{"a.b":[1]},"q[0]":[{"x":1}]}]'),
    );
    expect(lectura.estructura.noTratadas.map((n) => n.ruta)).toEqual([
      "p.a\\.b[]",
      "q\\[0\\][]",
    ]);
    expect(lectura.estructura.noTratadas[1].pistas).toEqual(["q\\[0\\][].x"]);
  });

  it("pasado el tope de nodos de una lista, la lectura sigue y las pistas siguen acotadas", async () => {
    const claves = Array.from(
      { length: 40 },
      (_, i) => `"k${String(i).padStart(2, "0")}":1`,
    );
    const lectura = await leerJson(
      fuenteDe(`[{"l":[{${claves.join(",")}}]}]`),
      { ...TOPES_JSON, rutas: 4 },
    );
    expect(lectura.estructura.noTratadas[0].pistas.length).toBeLessThanOrEqual(
      8,
    );
    expect(lectura.estructura.noTratadas[0].pistas.length).toBeGreaterThan(0);
  });
});

describe("leerJson — rutas heterogéneas", () => {
  it("declara lo que no está en todos los registros o cambia de tipo, con tipos ordenados", async () => {
    const lectura = await leerJson(
      fuenteDe(
        '[{"id":1,"edad":30,"o":{"x":1},"a":{"b":1}},{"id":2,"edad":"treinta","o":{}},{"id":3,"edad":null,"a":5}]',
      ),
    );
    const por = new Map(
      lectura.estructura.heterogeneas.map((h) => [h.ruta, h]),
    );
    expect(por.has("id")).toBe(false);
    expect(por.get("edad")).toEqual({
      ruta: "edad",
      presencia: 3,
      tipos: ["nulo", "numero", "texto"],
    });
    // `o` es objeto siempre que aparece, pero falta en un registro.
    expect(por.get("o")).toEqual({
      ruta: "o",
      presencia: 2,
      tipos: ["objeto"],
    });
    expect(por.get("o.x")).toEqual({
      ruta: "o.x",
      presencia: 1,
      tipos: ["numero"],
    });
    // `a` es un valor suelto en un registro y un contenedor en otro: se permite y se declara.
    expect(por.get("a")).toEqual({
      ruta: "a",
      presencia: 2,
      tipos: ["numero", "objeto"],
    });
    expect(por.get("a.b")?.presencia).toBe(1);
    // La columna de `a` existe (hubo un valor suelto) y la de `a.b` también.
    expect(nombresDe(lectura)).toEqual(["id", "edad", "o.x", "a.b", "a"]);
  });

  it("una lista que aparece o no, o que cambia de tipo, se declara con su tipo", async () => {
    const lectura = await leerJson(fuenteDe('[{"l":[1]},{"l":"x"},{}]'));
    expect(lectura.estructura.heterogeneas).toEqual([
      { ruta: "l", presencia: 2, tipos: ["lista", "texto"] },
    ]);
  });
});

describe("leerJson — topes y errores", () => {
  it("el error cita la línea (1-based) y jamás el contenido", async () => {
    const linea = await esperarError(
      '[\n{"nombre":"SECRETO"},\n{"nombre":SECRETO}\n]',
      "json-invalido",
    );
    expect(linea).toBe(3);
    // También leyendo de a un carácter: la cuenta de líneas cruza los trozos.
    expect(
      await esperarError('[\r\n{"a":1},\r\n{"a":}\r\n]', "json-invalido", 1),
    ).toBe(3);
  });

  it("más rutas distintas que el tope: json-demasiado-ancho", async () => {
    const registro = (n: number) =>
      "{" + Array.from({ length: n }, (_, i) => `"k${i}":1`).join(",") + "}";
    await leerJson(fuenteDe(`[${registro(256)}]`)); // 256 caben
    await esperarError(`[${registro(257)}]`, "json-demasiado-ancho");
    // Aunque las rutas nuevas aparezcan en registros distintos.
    await esperarError(
      `[${registro(200)},${registro(300)}]`,
      "json-demasiado-ancho",
    );
    // Y con un tope propio.
    await esperarError(
      '[{"a":1,"b":2,"c":3}]',
      "json-demasiado-ancho",
      Infinity,
      { ...TOPES_JSON, rutas: 2 },
    );
  });

  it("contenedores vacíos sin fin también tienen su tope (no inflan la memoria)", async () => {
    const claves = Array.from({ length: 40 }, (_, i) => `"o${i}":{}`).join(",");
    await esperarError(`[{${claves}}]`, "json-demasiado-ancho", Infinity, {
      ...TOPES_JSON,
      rutas: 4,
    });
    const listas = Array.from({ length: 40 }, (_, i) => `"l${i}":[]`).join(",");
    await esperarError(`[{${listas}}]`, "json-demasiado-ancho", Infinity, {
      ...TOPES_JSON,
      rutas: 4,
    });
  });

  it("registros × rutas sobre el tope de celdas: json-excede-tope", async () => {
    const topes = { ...TOPES_JSON, celdas: 4 };
    await leerJson(fuenteDe('[{"a":1,"b":2},{"a":3,"b":4}]'), topes); // 4 celdas caben
    await esperarError(
      '[{"a":1,"b":2},{"a":3,"b":4},{"a":5,"b":6}]',
      "json-excede-tope",
      Infinity,
      topes,
    );
    // Una columna nueva que no cabe se rechaza antes de reservarla.
    await esperarError(
      '[{"a":1},{"a":2},{"a":3,"b":4}]',
      "json-excede-tope",
      Infinity,
      {
        ...TOPES_JSON,
        celdas: 5,
      },
    );
    // Y lo mismo con la capacidad reservada acotada: nunca más de lo que el tope deja.
    await esperarError(
      `[${Array.from({ length: 1_030 }, () => '{"a":1}').join(",")}]`,
      "json-excede-tope",
      Infinity,
      { ...TOPES_JSON, celdas: 1_025 },
    );
  });

  it("una clave más larga que el tope y un texto más largo que el tope: json-excede-tope", async () => {
    const topes = { ...TOPES_JSON, largoDeClave: 5, largoDeTexto: 8 };
    await leerJson(fuenteDe('[{"abcde":"12345678"}]'), topes);
    await esperarError('[{"abcdef":1}]', "json-excede-tope", Infinity, topes);
    await esperarError(
      '[{"a":"123456789"}]',
      "json-excede-tope",
      Infinity,
      topes,
    );
    // Contado en caracteres DECODIFICADOS: ocho escapes de seis caracteres caben en un tope de ocho.
    await leerJson(
      fuenteDe(
        '[{"a":"\\u0041\\u0041\\u0041\\u0041\\u0041\\u0041\\u0041\\u0041"}]',
      ),
      topes,
    );
    await esperarError(
      '[{"a":"\\u0041\\u0041\\u0041\\u0041\\u0041\\u0041\\u0041\\u0041\\u0041"}]',
      "json-excede-tope",
      Infinity,
      topes,
    );
    await esperarError(
      '[{"a\\u0041\\u0041\\u0041\\u0041\\u0041\\u0041":1}]',
      "json-excede-tope",
      Infinity,
      topes,
    );
    // Un número largo cuenta como texto.
    await esperarError(
      `[{"a":${"1".repeat(30)}}]`,
      "json-excede-tope",
      Infinity,
      topes,
    );
    // El corte llega ANTES de acumular una cadena sin fin, también leyendo de a trozos.
    await esperarError(
      `[{"a":"${"x".repeat(200)}`,
      "json-excede-tope",
      7,
      topes,
    );
    await esperarError(
      `[{"a":${"1".repeat(200)}`,
      "json-excede-tope",
      7,
      topes,
    );
  });

  it("claves duplicadas en el mismo objeto: json-claves-duplicadas (también anidadas y en listas)", async () => {
    await esperarError('[{"a":1,"a":2}]', "json-claves-duplicadas");
    await esperarError('[{"a":1,"a":2}]', "json-claves-duplicadas", 1);
    await esperarError('[{"o":{"b":1,"b":2}}]', "json-claves-duplicadas");
    await esperarError('[{"l":[{"x":1,"x":2}]}]', "json-claves-duplicadas");
    await esperarError(
      '[{"l":[{"o":{"y":[],"y":1}}]}]',
      "json-claves-duplicadas",
    );
    await esperarError('{"a":1}\n{"b":1,"b":2}', "json-claves-duplicadas");
    // Escrita con escapes, la clave es la misma.
    await esperarError('[{"a":1,"\\u0061":2}]', "json-claves-duplicadas");
    // La misma clave en objetos DISTINTOS no es un duplicado.
    await leerJson(fuenteDe('[{"a":1,"o":{"a":2}},{"a":3}]'));
    await leerJson(fuenteDe('[{"l":[{"x":1},{"x":2}]}]'));
    // Sin nodo propio (tope de la lista agotado) también se detecta.
    await esperarError(
      '[{"l":[{"a":1,"b":2,"b":3}]}]',
      "json-claves-duplicadas",
      Infinity,
      { ...TOPES_JSON, rutas: 1 },
    );
    await leerJson(fuenteDe('[{"l":[{"a":1,"b":2},{"b":3}]}]'), {
      ...TOPES_JSON,
      rutas: 1,
    });
  });

  it("profundidad: 32 niveles caben, 33 no (con la bomba de 100.000 no se desborda la pila)", async () => {
    const anidado = (n: number) =>
      '{"a":'.repeat(n) + "1" + "}".repeat(n);
    expect(
      (await leerJson(fuenteDe(`[${anidado(32)}]`))).estructura.profundidad,
    ).toBe(32);
    await esperarError(`[${anidado(33)}]`, "json-demasiado-profundo");
    await esperarError(
      `[{"a":${"[".repeat(100_000)}`,
      "json-demasiado-profundo",
    );
    await esperarError(
      `${'{"a":'.repeat(100_000)}`,
      "json-demasiado-profundo",
      4096,
    );
    await esperarError(
      `[{"a":${'[{"b":'.repeat(40_000)}`,
      "json-demasiado-profundo",
    );
  });
});
