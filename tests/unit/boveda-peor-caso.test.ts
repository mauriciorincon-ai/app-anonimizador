// MEDICIÓN del peor caso de la bóveda. No verifica: mide.
//
// Se salta por defecto —tarda cerca de un minuto y no tendría sentido pagarlo en cada PR— y se
// corre a mano:
//
//     MEDIR_BOVEDA=1 pnpm vitest run tests/unit/boveda-peor-caso.test.ts --coverage.enabled=false
//
// Vive aquí, junto a los tests, para que el número sea repetible: quien discuta una cifra de la
// bitácora puede volver a sacarla con una línea. La orden del S3 pide esta medición **antes de que
// exista una sola pantalla**, y la razón es que su resultado puede obligar a declarar un tope —como
// el ADR-003 hizo con Excel— en vez de descubrirlo con la UI construida encima.
//
// Los datos salen del generador sintético seeded, que es la única fuente de datos de prueba del
// repo. El recorrido es el real: diccionario de valores distintos → HMAC con formato → bóveda →
// serialización → cifrado → apertura.

import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { generarFilas } from "../../docs/kit-de-prueba/generador.mjs";
import {
  colisionesDeBoveda,
  construirBoveda,
  deserializarBoveda,
  huellaDeBoveda,
  paresDeBoveda,
  serializarBoveda,
} from "@/engine/boveda";
import { ConstructorColumnar } from "@/engine/columnar";
import { restaurar } from "@/engine/restaurar";
import { seudonimizarConFormato } from "@/engine/tecnicas/seudonimo";
import { abrirBoveda, sellarBoveda } from "@/lib/boveda-archivo";

const FILAS = 500_000;
const COLUMNA = "cedula_titular";
const FRASE = "dos toros y una brújula";

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function cronometrar<T>(
  que: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  const t0 = performance.now();
  const salida = await fn();
  console.log(`  ${que.padEnd(34)} ${Math.round(performance.now() - t0)} ms`);
  return salida;
}

describe.skipIf(!process.env.MEDIR_BOVEDA)(
  "peor caso: una columna de ~480.000 valores distintos",
  () => {
    it("mide la bóveda de punta a punta", async () => {
      console.log(`\n── Peor caso: ${COLUMNA} sobre ${FILAS} filas ──`);

      const distintos = await cronometrar("generar y deduplicar", () => {
        const vistos = new Set<string>();
        const filas = generarFilas({
          filas: FILAS,
          seed: 42,
          perfil: "clinico",
          tasaInvalida: 0.08,
          tasaVacia: 0.03,
        });
        const encabezado: string[] = filas.next().value;
        const indice = encabezado.indexOf(COLUMNA);
        for (const fila of filas) {
          if (fila[indice] !== "") vistos.add(fila[indice]);
        }
        return [...vistos];
      });
      console.log(`  valores distintos                  ${distintos.length}`);

      const clave = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode("llave-de-medicion".padEnd(32, ".")),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );

      const seudonimos = await cronometrar("HMAC con formato (cedula)", () =>
        seudonimizarConFormato(distintos, clave, "cedula"),
      );
      console.log(
        `  colisiones de formato              ${seudonimos.colisiones}`,
      );

      const boveda = await cronometrar("construirBoveda", () =>
        construirBoveda(
          {
            huellaDeLlave: "a1b2c3d4e5f6",
            salDeLlave: "0".repeat(32),
            hashDePolitica: "0".repeat(64),
          },
          [
            {
              columna: COLUMNA,
              originales: distintos,
              seudonimos: seudonimos.valores,
            },
          ],
        ),
      );
      console.log(
        `  pares en la bóveda                 ${paresDeBoveda(boveda)}`,
      );
      console.log(
        `  seudónimos con dos originales      ${colisionesDeBoveda(boveda)}`,
      );

      const claro = await cronometrar("serializarBoveda", () =>
        serializarBoveda(boveda),
      );
      const bytesEnClaro = new TextEncoder().encode(claro).length;
      console.log(`  tamaño en claro                    ${mb(bytesEnClaro)}`);

      await cronometrar("huellaDeBoveda (SHA-256)", () =>
        huellaDeBoveda(boveda),
      );

      const velo = await cronometrar("sellarBoveda (PBKDF2 + AES-GCM)", () =>
        sellarBoveda(boveda, FRASE),
      );
      console.log(`  tamaño del .velo                   ${mb(velo.length)}`);

      const abierta = await cronometrar("abrirBoveda", () =>
        abrirBoveda(velo, FRASE),
      );
      expect(abierta.ok).toBe(true);

      await cronometrar("deserializarBoveda a solas", () =>
        deserializarBoveda(claro),
      );

      // El regreso, sobre el mismo peor caso. El reconocimiento por contenido puntúa CADA columna
      // del archivo devuelto contra CADA columna de la bóveda, así que su costo crece con el
      // producto de las dos — y esa multiplicación no estaba medida en ningún sitio.
      const devuelto = (() => {
        const constructor = new ConstructorColumnar(
          [COLUMNA, "resultado_del_tercero"],
          FILAS,
        );
        for (let i = seudonimos.valores.length - 1; i >= 0; i--) {
          // Al revés a propósito: el tercero reordena, y restaurar es por valor.
          constructor.agregarFila([seudonimos.valores[i], "procesado"]);
        }
        return constructor.finalizar();
      })();

      const vuelta = await cronometrar("restaurar (2 columnas)", () =>
        restaurar(devuelto, boveda),
      );
      console.log(
        `  celdas restauradas                 ${vuelta.totales.restauradas}`,
      );
      console.log(
        `  celdas ambiguas                    ${vuelta.totales.ambiguas}`,
      );
      expect(vuelta.reconocimiento).toBe("completo");

      // Cuánto ahorraría comprimir antes de cifrar. Se mide para poder DECIDIRLO con un número:
      // el texto en claro son dígitos repetitivos y comprime mucho, pero comprimir añade un paso
      // y un modo de fallo, y no se paga sin saber cuánto compra.
      // gzip de Node y no `CompressionStream`: jsdom no implementa `Blob.stream()`. Como cifra de
      // referencia sirve igual — lo que se quiere saber es cuánto comprime este texto, no cuál de
      // las dos implementaciones es más rápida.
      const comprimido = await cronometrar("gzip del claro (referencia)", () =>
        gzipSync(Buffer.from(claro)),
      );
      console.log(
        `  tamaño gzip                        ${mb(comprimido.length)} (${(
          (comprimido.length / bytesEnClaro) *
          100
        ).toFixed(0)} % del claro)`,
      );

      const heap = process.memoryUsage();
      console.log(`  heap usado al terminar             ${mb(heap.heapUsed)}`);
      console.log("");

      expect(paresDeBoveda(boveda)).toBeGreaterThan(400_000);
    }, 600_000);
  },
);
