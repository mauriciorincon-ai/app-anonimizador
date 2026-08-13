// Medición de la cripto de la bóveda EN CHROMIUM, no en Node.
//
// Se corre a mano: `node tests/medicion/cripto-en-el-navegador.mjs`. No entra al CI porque tarda
// más de un minuto y no verifica nada: MIDE. Vive en el repo para que el número sea repetible y
// para que quien discuta una cifra de la bitácora pueda volver a sacarla.
//
// Por qué en el navegador: Node usa OpenSSL y Chromium usa BoringSSL, y el producto corre en el
// segundo. Medir PBKDF2 en Node y escribir el número como si fuera el del usuario sería
// exactamente la clase de cifra sin fuente que este repo no se permite.

import { createServer } from "node:http";

import { chromium } from "@playwright/test";

// `crypto.subtle` solo existe en **contexto seguro**: en `about:blank` es `undefined`. Un servidor
// mínimo en 127.0.0.1 basta —las direcciones locales cuentan como confiables— y evita tener que
// construir la app entera para medir dos primitivas.
const servidor = createServer((_, respuesta) => {
  respuesta.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  respuesta.end("<!doctype html><title>medición</title>");
});
await new Promise((listo) => servidor.listen(0, "127.0.0.1", listo));
const puerto = servidor.address().port;

const navegador = await chromium.launch();
const pagina = await navegador.newPage();
await pagina.goto(`http://127.0.0.1:${puerto}/`);

const resultado = await pagina.evaluate(async () => {
  const codificador = new TextEncoder();

  /** Mediana de `veces` corridas, en ms. */
  const medir = async (fn, veces = 3) => {
    const tiempos = [];
    for (let i = 0; i < veces; i++) {
      const t0 = performance.now();
      await fn();
      tiempos.push(performance.now() - t0);
    }
    return Math.round(tiempos.sort((a, b) => a - b)[Math.floor(veces / 2)]);
  };

  const derivar = async (iteraciones) => {
    const material = await crypto.subtle.importKey(
      "raw",
      codificador.encode("dos toros y una brújula"),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: new Uint8Array(16),
        iterations: iteraciones,
        hash: "SHA-256",
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  };

  const salida = { pbkdf2: {}, aesGcm: {} };
  for (const iteraciones of [600_000, 1_000_000, 2_000_000]) {
    salida.pbkdf2[iteraciones] = await medir(() => derivar(iteraciones));
  }

  const clave = await derivar(600_000);
  for (const mb of [1, 8, 26]) {
    const datos = new Uint8Array(mb * 1024 * 1024);
    // Solo el primer trozo con azar: llenar 26 MB de aleatorio mide el generador, no el cifrado.
    crypto.getRandomValues(datos.subarray(0, 65_536));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    let cifrado;
    salida.aesGcm[`cifrar ${mb} MB`] = await medir(async () => {
      cifrado = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        clave,
        datos,
      );
    });
    salida.aesGcm[`descifrar ${mb} MB`] = await medir(() =>
      crypto.subtle.decrypt({ name: "AES-GCM", iv }, clave, cifrado),
    );
  }
  return salida;
});

console.log("PBKDF2-HMAC-SHA256 (ms por derivación, mediana de 3):");
for (const [iteraciones, ms] of Object.entries(resultado.pbkdf2)) {
  console.log(`  ${Number(iteraciones).toLocaleString("es-CO")} iteraciones → ${ms} ms`);
}
console.log("\nAES-GCM 256 (ms, mediana de 3):");
for (const [que, ms] of Object.entries(resultado.aesGcm)) {
  console.log(`  ${que} → ${ms} ms`);
}

await navegador.close();
servidor.close();
