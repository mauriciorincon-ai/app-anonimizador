#!/usr/bin/env node
// Spike A del Sprint 002 — ¿cuánto cuesta de verdad un seudónimo?
//
// La pregunta que decide la arquitectura de la Fase 2: el motor de Velo es SÍNCRONO y PURO
// (`clasificar`, `evaluarRiesgo`, el serializador canónico). `crypto.subtle.sign` es asíncrono y
// devuelve una promesa por valor. Si las técnicas usan Web Crypto, `async` se contagia hacia
// arriba y arrastra al gate de determinismo con él.
//
// La alternativa: HMAC-SHA256 síncrono sobre el `Sha256` de FIPS 180-4 que este repo YA tiene
// (`src/lib/sha256.ts`) — 25 líneas encima de algo ya escrito, ya citado y ya verificado contra
// `crypto.subtle.digest`.
//
// Se mide EN EL NAVEGADOR, no en Node. `crypto.subtle` de Chromium no es el de Node: el costo
// por llamada depende de cómo el motor despacha la operación, y esa es justo la variable en duda.
// El SHA-256 síncrono sí es el mismo V8 en los dos lados — y aun así se inyecta el archivo REAL
// del producto (tipos quitados con el stripper nativo de Node 24), no una copia, para que lo que
// se mide sea lo que se despacha.
//
// Uso:  node scripts/spikes/spike-hmac.mjs [--valores 500000]
// El código de este spike NO entra al producto: mide, da su veredicto, y su valor queda en el ADR.

import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { chromium } from "@playwright/test";

const VALORES = Number(
  process.argv.find((a) => a.startsWith("--valores="))?.split("=")[1] ?? 500_000,
);

// El archivo del producto, sin tipos y sin `export`, listo para inyectar como script clásico.
const sha256Js = stripTypeScriptTypes(
  readFileSync(new URL("../../src/lib/sha256.ts", import.meta.url), "utf8"),
  { mode: "strip" },
).replace(/^export /gm, "");

/**
 * HMAC-SHA256 síncrono, tal como se implementaría en el producto.
 * RFC 2104: H((K ⊕ opad) ‖ H((K ⊕ ipad) ‖ m)).
 */
const hmacJs = `
const BLOQUE_HMAC = 64;
function hexABytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}
function prepararLlave(llave) {
  const k = llave.length > BLOQUE_HMAC ? hexABytes(sha256(llave)) : llave;
  const ipad = new Uint8Array(BLOQUE_HMAC);
  const opad = new Uint8Array(BLOQUE_HMAC);
  for (let i = 0; i < BLOQUE_HMAC; i++) {
    const b = i < k.length ? k[i] : 0;
    ipad[i] = b ^ 0x36;
    opad[i] = b ^ 0x5c;
  }
  return { ipad, opad };
}
function hmacSincrono({ ipad, opad }, mensaje) {
  const interno = hexABytes(new Sha256().actualizar(ipad).actualizar(mensaje).terminar());
  return new Sha256().actualizar(opad).actualizar(interno).terminar();
}

// Variante justa: el 'Sha256' del repo solo sabe entregar hexadecimal, así que el HMAC de arriba
// paga DOS conversiones hex↔bytes por valor que no son culpa del algoritmo sino de la API. Si el
// producto añadiera un 'terminarBytes()', el costo sería este. Se mide para no descartar la
// alternativa por un artefacto de la implementación.
function digestBytes(sha) {
  const hex = sha.terminar();
  const b = new Uint8Array(32);
  for (let i = 0; i < 32; i++) b[i] = parseInt(hex.substr(i * 2, 2), 16);
  return b;
}
function hmacSincronoJusto({ ipad, opad }, mensaje) {
  const interno = digestBytes(new Sha256().actualizar(ipad).actualizar(mensaje));
  return digestBytes(new Sha256().actualizar(opad).actualizar(interno));
}
`;

const navegador = await chromium.launch();
const pagina = await navegador.newPage();
// `crypto.subtle` SOLO existe en contexto seguro: en `about:blank` no está definido. Se sirve una
// página vacía por https interceptando la petición — así el spike no necesita levantar el server.
await pagina.route("https://spike.velo/**", (ruta) =>
  ruta.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><body>" }),
);
await pagina.goto("https://spike.velo/");
await pagina.addScriptTag({ content: sha256Js + hmacJs });

const resultado = await pagina.evaluate(async (n) => {
  const enc = new TextEncoder();
  const bytesDeLlave = new Uint8Array(32);
  crypto.getRandomValues(bytesDeLlave);

  // ── 1. Corrección: las dos implementaciones tienen que dar EXACTAMENTE lo mismo ──────────────
  const llaveWeb = await crypto.subtle.importKey(
    "raw",
    bytesDeLlave,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const preparada = prepararLlave(bytesDeLlave);
  const aHex = (buf) =>
    [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

  const casos = [
    "",
    "1032456789",
    "900123456-7",
    "a".repeat(63),
    "a".repeat(64),
    "a".repeat(65),
    "MARÍA JOSÉ ÑÚÑEZ",
    "\u{1F511} llave con emoji",
  ];
  const discrepancias = [];
  for (const caso of casos) {
    const m = enc.encode(caso);
    const web = aHex(await crypto.subtle.sign("HMAC", llaveWeb, m));
    const sinc = hmacSincrono(preparada, m);
    if (web !== sinc) discrepancias.push(caso);
  }

  // Y una llave más larga que el bloque, que es la rama que casi nadie prueba.
  const llaveLarga = new Uint8Array(100);
  crypto.getRandomValues(llaveLarga);
  const webLarga = await crypto.subtle.importKey(
    "raw", llaveLarga, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const m = enc.encode("1032456789");
  if (
    aHex(await crypto.subtle.sign("HMAC", webLarga, m)) !==
    hmacSincrono(prepararLlave(llaveLarga), m)
  ) {
    discrepancias.push("(llave de 100 bytes)");
  }

  // ── 2. Velocidad, sobre valores DISTINTOS (una columna de cédulas es casi única) ─────────────
  const valores = new Array(n);
  for (let i = 0; i < n; i++) valores[i] = String(1_000_000_000 + i * 7);
  const codificados = valores.map((v) => enc.encode(v));

  // Los cuatro caminos, cada uno sobre los n valores COMPLETOS. Nada de extrapolar desde una
  // muestra: el primer millar de llamadas está frío y mentiría a favor del que se mida después.
  let t = performance.now();
  for (let i = 0; i < n; i++) {
    await crypto.subtle.sign("HMAC", llaveWeb, codificados[i]);
  }
  const msSecuencial = performance.now() - t;

  t = performance.now();
  for (let desde = 0; desde < n; desde += 2_000) {
    const lote = codificados.slice(desde, desde + 2_000);
    await Promise.all(lote.map((c) => crypto.subtle.sign("HMAC", llaveWeb, c)));
  }
  const msLotes = performance.now() - t;

  t = performance.now();
  for (let i = 0; i < n; i++) hmacSincrono(preparada, codificados[i]);
  const msSincrono = performance.now() - t;

  t = performance.now();
  for (let i = 0; i < n; i++) hmacSincronoJusto(preparada, codificados[i]);
  const msSincronoJusto = performance.now() - t;

  return { discrepancias, msSecuencial, msLotes, msSincrono, msSincronoJusto, n };
}, VALORES);

await navegador.close();

const seg = (ms) => `${(ms / 1000).toFixed(2)} s`;
const porValor = (ms) => `${((ms / resultado.n) * 1000).toFixed(2)} µs`;

console.log(`\nSpike A · HMAC-SHA256 sobre ${resultado.n.toLocaleString("es-CO")} valores distintos`);
console.log(`Navegador: Chromium de Playwright (no Node)\n`);
for (const [etiqueta, ms] of [
  ["Web Crypto, await uno por uno", resultado.msSecuencial],
  ["Web Crypto, lotes de 2.000", resultado.msLotes],
  ["Síncrono (Sha256 del repo, hex)", resultado.msSincrono],
  ["Síncrono con terminarBytes()", resultado.msSincronoJusto],
]) {
  console.log(`  ${etiqueta.padEnd(34)} ${seg(ms).padStart(9)}  ${porValor(ms).padStart(9)}`);
}
console.log(
  `\nCorrección: ${
    resultado.discrepancias.length === 0
      ? "las dos implementaciones coinciden en los 9 casos (incluidas las fronteras del bloque y una llave de 100 bytes)."
      : `✗ DISCREPAN en: ${resultado.discrepancias.join(", ")}`
  }`,
);
