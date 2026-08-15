// La huella de salida — la mitad del certificado que se puede comprobar.
//
// El worker calcula el SHA-256 del archivo tratado **mientras arma los trozos** que forman el
// `Blob`, en vez de volver a leer el `Blob` después. Es la única forma de que quepa: el peor caso
// del producto son ~130 MB de texto, y una segunda pasada costaría recorrerlos otra vez.
//
// Esa optimización descansa en una afirmación sobre codificación que **es fácil de escribir en un
// comentario y difícil de verificar leyendo**: que hashear `TextEncoder().encode(trozo)` trozo a
// trozo produce exactamente los bytes que el navegador va a escribir en el disco. Si fuera falsa,
// el certificado declararía una huella que no coincide con el archivo — y el defecto sería
// invisible en pantalla: el documento se vería perfecto y solo fallaría cuando alguien lo
// comprobara, que es justo lo que el certificado promete que se puede hacer.
//
// Así que aquí se verifica, y con los caracteres que rompen las suposiciones: acentos, ñ, emojis
// fuera del plano básico, y trozos partidos en sitios incómodos.

import { describe, expect, it } from "vitest";

import { Sha256, sha256 } from "@/lib/sha256";

/** Lo que hace el worker: un acumulador, un trozo cada vez. */
function huellaPorTrozos(trozos: readonly string[]): string {
  const acumulador = new Sha256();
  const codificador = new TextEncoder();
  for (const trozo of trozos) acumulador.actualizar(codificador.encode(trozo));
  return acumulador.terminar();
}

/** Lo que hará quien reciba el archivo: hashear los bytes completos, de una. */
function huellaDelTodo(trozos: readonly string[]): string {
  return sha256(new TextEncoder().encode(trozos.join("")));
}

describe("hashear por trozos da lo mismo que hashear el archivo entero", () => {
  it("con texto ASCII, que es el caso corriente", () => {
    const trozos = [
      "cedula,ciudad\n",
      "1032456789,Bogota\n",
      "1098765432,Cali\n",
    ];
    expect(huellaPorTrozos(trozos)).toBe(huellaDelTodo(trozos));
  });

  it("con acentos y ñ — un byte por carácter deja de ser cierto", () => {
    // `ñ` son dos bytes en UTF-8 y `á` también. Un cálculo que contara caracteres en vez de bytes
    // daría una longitud distinta, y SHA-256 mete la longitud en el relleno final: la huella
    // saldría mal aunque los bytes fueran los mismos.
    const trozos = [
      "municipio,institución\n",
      "Medellín,Universidad de Antioquia\n",
      "Chocó,Peñol\n",
    ];
    expect(huellaPorTrozos(trozos)).toBe(huellaDelTodo(trozos));
  });

  it("con caracteres de cuatro bytes fuera del plano básico", () => {
    // Un emoji es un par sustituto en JavaScript: `"🔒".length` es 2, no 1. Si el troceado partiera
    // uno por la mitad, cada mitad se codificaría como U+FFFD y la huella cambiaría. No puede pasar
    // —los trozos se cortan entre filas completas— pero se prueba que no pasa en vez de suponerlo.
    const trozos = ["nota\n", "archivo 🔒 cerrado\n", "🇨🇴 Colombia\n"];
    expect(huellaPorTrozos(trozos)).toBe(huellaDelTodo(trozos));
  });

  it("da lo mismo dónde caigan los cortes: uno, muchos o vacíos", () => {
    // La huella describe el archivo, no cómo se troceó para escribirlo. Es la misma propiedad que
    // el S1 probó para el parser («el tamaño de los trozos no cambia el diagnóstico»), aplicada al
    // otro extremo del pipeline.
    const completo = "a,b\n1,2\n3,4\n5,6\nñ,🔒\n";
    const cortes: readonly (readonly string[])[] = [
      [completo],
      ["a,b\n", "1,2\n3,4\n", "5,6\nñ,🔒\n"],
      ["a,b\n1,2\n3,4\n5,6\n", "ñ,🔒\n"],
      ["", "a,b\n", "", "1,2\n3,4\n5,6\nñ,🔒\n", ""],
    ];
    const esperada = sha256(new TextEncoder().encode(completo));
    for (const trozos of cortes) {
      expect(huellaPorTrozos(trozos)).toBe(esperada);
    }
  });

  it("un solo byte distinto cambia la huella — si no, no probaría nada", () => {
    // Sin esta comprobación, una implementación que devolviera siempre la misma cadena pasaría
    // todas las de arriba. Es la otra dirección, la que el determinismo del S2 enseñó a exigir.
    const a = ["cedula\n", "1032456789\n"];
    const b = ["cedula\n", "1032456780\n"];
    expect(huellaPorTrozos(a)).not.toBe(huellaPorTrozos(b));
  });
});

describe("el Blob del navegador codifica lo mismo que TextEncoder", () => {
  it("los bytes de un Blob de cadenas son la codificación UTF-8 de su concatenación", async () => {
    // Esta es LA suposición que sostiene el atajo del worker. `new Blob([...cadenas])` codifica
    // cada cadena en UTF-8, así que los bytes del archivo son los que se hashearon. Se comprueba
    // contra el `Blob` de verdad en vez de confiar en la lectura de la especificación.
    const trozos = ["cedula,ciudad\n", "1032456789,Medellín\n", "🔒,Chocó\n"];
    const blob = new Blob(trozos, { type: "text/csv;charset=utf-8" });
    const bytes = new Uint8Array(await blob.arrayBuffer());

    expect(sha256(bytes)).toBe(huellaPorTrozos(trozos));
    expect(bytes.length).toBe(blob.size);
  });
});
