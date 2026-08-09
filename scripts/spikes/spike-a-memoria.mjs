#!/usr/bin/env node
// ⚠ SPIKE A · parte 2 (Fase 0, Sprint 001) — el número que el navegador NO puede dar.
//
// `performance.memory` no existe dentro de un Web Worker (Chromium solo la expone en `window`),
// así que el heap real de la tabla columnar es invisible desde el e2e. Node corre el mismo V8:
// medir aquí `heapUsed` con GC forzado da la cifra comparable, y es la que decide si 500k filas
// caben con holgura bajo el techo de ~4 GB por pestaña (https://v8.dev/blog/heap-size-limit).
//
// Uso: node --expose-gc scripts/spikes/spike-a-memoria.mjs [ruta.csv]

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { resolve } from "node:path";

import { ConstructorColumnar } from "../../src/engine/columnar.ts";

const ruta = resolve(
  process.cwd(),
  process.argv[2] ?? "tmp/kit-de-prueba/clinico-500k.csv",
);

function heapMb() {
  if (typeof global.gc === "function") global.gc();
  return process.memoryUsage().heapUsed / 1_048_576;
}

// Partición CSV mínima suficiente para el spike: el fixture no lleva comillas ni comas dentro de
// celda (el generador las evita en este perfil). En producción parte PapaParse, no esto.
function partir(linea) {
  return linea.split(",");
}

const antes = heapMb();
const inicio = Date.now();

let constructor = null;
let filas = 0;
const lector = createInterface({ input: createReadStream(ruta), crlfDelay: Infinity });

for await (const linea of lector) {
  if (!linea) continue;
  const celdas = partir(linea);
  if (!constructor) {
    constructor = new ConstructorColumnar(celdas, 1 << 16);
    continue;
  }
  constructor.agregarFila(celdas);
  filas++;
}

const tabla = constructor.finalizar();
const segundos = (Date.now() - inicio) / 1000;
const despues = heapMb();

const bytesCodigos = tabla.columnas.reduce((n, c) => n + c.codigos.byteLength, 0);
const valoresUnicos = tabla.columnas.reduce((n, c) => n + c.valores.length, 0);

console.log(`archivo          : ${ruta}`);
console.log(`filas × columnas : ${filas.toLocaleString("es-CO")} × ${tabla.columnas.length}`);
console.log(`tiempo           : ${segundos.toFixed(2)} s`);
console.log(`heap antes       : ${antes.toFixed(1)} MB`);
console.log(`heap después     : ${despues.toFixed(1)} MB`);
console.log(`costo de la tabla: ${(despues - antes).toFixed(1)} MB`);
console.log(`  · códigos      : ${(bytesCodigos / 1_048_576).toFixed(1)} MB (Uint32Array)`);
console.log(`  · valores únicos: ${valoresUnicos.toLocaleString("es-CO")} strings en diccionarios`);
console.log("\ncardinalidad por columna:");
for (const c of tabla.columnas) {
  const unicos = c.valores.length - 1;
  console.log(
    `  ${c.nombre.padEnd(18)} únicos=${String(unicos).padStart(7)}  noVacíos=${String(c.noVacios).padStart(7)}`,
  );
}
