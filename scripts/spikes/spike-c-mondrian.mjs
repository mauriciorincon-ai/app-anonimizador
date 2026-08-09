#!/usr/bin/env node
// ⚠ SPIKE C (Fase 0, Sprint 001) — CÓDIGO DESECHABLE, de-risk del Sprint 002.
//
// Mondrian (LeFevre, DeWitt, Ramakrishnan — *Mondrian Multidimensional K-Anonymity*, ICDE 2006,
// https://pages.cs.wisc.edu/~lefevre/MultiDim.pdf) es el motor de k-anonimato que el S2 va a
// necesitar: greedy top-down, corta por la dimensión de mayor rango, particiona por la mediana,
// O(n log n) frente a lo exponencial del óptimo (que es NP-hard).
//
// La pregunta que este spike responde ANTES de que el S2 dependa de la respuesta: ¿corre a 500k
// filas en JavaScript, dentro de un worker? El gap de la investigación F1 lo dice literal — "no
// existe benchmark publicado de Mondrian en JS a 500k filas; amerita spike de 1 día".
//
// Esta implementación NO entra al producto: mide, y su veredicto vive en
// decisions/002-spike-mondrian.md.
//
// Uso: node --expose-gc scripts/spikes/spike-c-mondrian.mjs [ruta.csv]

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { resolve } from "node:path";

import { ConstructorColumnar } from "../../src/engine/columnar.ts";

const ruta = resolve(process.cwd(), process.argv[2] ?? "tmp/kit-de-prueba/clinico-500k.csv");

// Los QIs se toman en orden creciente de cardinalidad porque así se parecen a los de un caso
// real: pocos categóricos gruesos + algunos finos. La lista se recorta a 3/5/8 para los tres
// escenarios del benchmark.
const QIS_CANDIDATOS = [
  "sexo",
  "municipio",
  "estrato",
  "grupo_etnico",
  "fecha_nacimiento",
  "diagnostico",
  "fecha_atencion",
  "correo",
];

// ── Carga ─────────────────────────────────────────────────────────────────────────────────────
async function cargar() {
  let constructor = null;
  const lector = createInterface({ input: createReadStream(ruta), crlfDelay: Infinity });
  for await (const linea of lector) {
    if (!linea) continue;
    const celdas = linea.split(",");
    if (!constructor) {
      constructor = new ConstructorColumnar(celdas, 1 << 16);
      continue;
    }
    constructor.agregarFila(celdas);
  }
  return constructor.finalizar();
}

/**
 * Mondrian trabaja sobre dominios ORDENADOS. Los categóricos se proyectan a su código de
 * diccionario ordenado alfabéticamente: no es una jerarquía de generalización (eso es el modelo
 * ARX completo, post-MVP), pero sí un orden total estable — y estable es lo que exige el
 * determinismo.
 */
function proyectar(columna) {
  const orden = [...columna.valores.keys()].sort((a, b) =>
    columna.valores[a].localeCompare(columna.valores[b], "en"),
  );
  const rango = new Int32Array(columna.valores.length);
  orden.forEach((codigoOriginal, posicion) => {
    rango[codigoOriginal] = posicion;
  });
  const proyectada = new Int32Array(columna.codigos.length);
  for (let i = 0; i < columna.codigos.length; i++) proyectada[i] = rango[columna.codigos[i]];
  return proyectada;
}

// ── Mondrian ──────────────────────────────────────────────────────────────────────────────────

/** Quickselect determinista (pivote = mediana de tres por posición, sin aleatoriedad). */
function seleccionar(idx, ini, fin, k, valores) {
  while (fin - ini > 1) {
    const medio = (ini + fin) >> 1;
    const pivote = valores[idx[medio]];
    let i = ini;
    let j = fin - 1;
    while (i <= j) {
      while (valores[idx[i]] < pivote) i++;
      while (valores[idx[j]] > pivote) j--;
      if (i <= j) {
        const t = idx[i];
        idx[i] = idx[j];
        idx[j] = t;
        i++;
        j--;
      }
    }
    if (k <= j) fin = j + 1;
    else if (k >= i) ini = i;
    else return valores[idx[k]];
  }
  return valores[idx[ini]];
}

function mondrian(dimensiones, n, k) {
  const idx = new Int32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;

  const particiones = [];
  const pila = [[0, n]];
  let cortes = 0;

  while (pila.length) {
    const [ini, fin] = pila.pop();
    const tam = fin - ini;
    if (tam < 2 * k) {
      particiones.push(tam);
      continue;
    }

    // Dimensión con mayor rango dentro de la partición. Desempate por índice de dimensión: sin
    // un desempate FIJO, dos corridas podrían cortar distinto y la salida dejaría de ser
    // byte-idéntica — que es regla dura del producto, no una preferencia.
    let mejorDim = -1;
    let mejorRango = -1;
    for (let d = 0; d < dimensiones.length; d++) {
      const v = dimensiones[d];
      let min = Infinity;
      let max = -Infinity;
      for (let p = ini; p < fin; p++) {
        const x = v[idx[p]];
        if (x < min) min = x;
        if (x > max) max = x;
      }
      const rango = max - min;
      if (rango > mejorRango) {
        mejorRango = rango;
        mejorDim = d;
      }
    }
    if (mejorRango <= 0) {
      particiones.push(tam); // todo idéntico en los QIs: no hay corte posible
      continue;
    }

    const valores = dimensiones[mejorDim];
    const posMediana = ini + (tam >> 1);
    const mediana = seleccionar(idx, ini, fin, posMediana, valores);

    // Partición estable por valor (≤ mediana | > mediana), no por posición: si la mediana se
    // repite mucho, cortar por posición dejaría clases que violan el propio k.
    let escritura = ini;
    for (let p = ini; p < fin; p++) {
      if (valores[idx[p]] <= mediana) {
        const t = idx[escritura];
        idx[escritura] = idx[p];
        idx[p] = t;
        escritura++;
      }
    }
    const izquierda = escritura - ini;
    const derecha = fin - escritura;
    if (izquierda < k || derecha < k) {
      particiones.push(tam); // ningún corte admisible: la partición es hoja
      continue;
    }
    cortes++;
    pila.push([ini, escritura]);
    pila.push([escritura, fin]);
  }
  return { particiones, cortes };
}

// ── Benchmark ─────────────────────────────────────────────────────────────────────────────────
function heapMb() {
  if (typeof global.gc === "function") global.gc();
  return process.memoryUsage().heapUsed / 1_048_576;
}

const tabla = await cargar();
const porNombre = new Map(tabla.columnas.map((c) => [c.nombre, c]));
console.log(`archivo : ${ruta}`);
console.log(`filas   : ${tabla.filas.toLocaleString("es-CO")}\n`);

const K = 5;
for (const cuantos of [3, 5, 8]) {
  const nombres = QIS_CANDIDATOS.slice(0, cuantos);
  const inicioProy = Date.now();
  const dimensiones = nombres.map((n) => proyectar(porNombre.get(n)));
  const msProyeccion = Date.now() - inicioProy;

  const antes = heapMb();
  const inicio = Date.now();
  const { particiones, cortes } = mondrian(dimensiones, tabla.filas, K);
  const ms = Date.now() - inicio;
  const despues = heapMb();

  const minima = Math.min(...particiones);
  const bajoK = particiones.filter((t) => t < K).length;
  console.log(`QIs=${cuantos} (${nombres.join(", ")})`);
  console.log(`  proyección   : ${msProyeccion} ms`);
  console.log(`  mondrian k=${K} : ${ms} ms  ·  ${cortes} cortes`);
  console.log(`  clases        : ${particiones.length.toLocaleString("es-CO")}`);
  console.log(`  clase mínima  : ${minima}  (clases por debajo de k: ${bajoK})`);
  console.log(`  heap del paso : ${(despues - antes).toFixed(1)} MB\n`);
}
