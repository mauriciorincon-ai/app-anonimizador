#!/usr/bin/env node
// Gate anti-IA de Velo — la regla dura nº1 del producto convertida en check mecánico.
//
// Velo no lleva IA generativa DENTRO: ni SDKs de LLM, ni clientes de APIs de IA, ni runtimes
// de inferencia local. No es una limitación técnica, es LA propuesta de valor: un motor
// determinista es reproducible, y lo reproducible es auditable (ver decisions/001-cero-ia.md).
// Una promesa sin gate es marketing; este script la vuelve un check que pone el PR en rojo.
//
// Qué revisa: los manifiestos de dependencias de package.json Y el pnpm-lock.yaml completo —
// una dependencia TRANSITIVA cuenta igual que una directa (el LLM no entra por la puerta de
// atrás). Lo que NO revisa: la IA como herramienta de DESARROLLO (Claude Code escribiendo este
// repo está bien); lo prohibido es el runtime del producto.
//
// Uso:  node scripts/gate-anti-ia.mjs            → exit 0 si está limpio, 1 si hay hallazgos
//       pnpm gate:anti-ia

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Paquetes vetados por nombre exacto, agrupados por familia para que el mensaje de error
 * explique POR QUÉ está vetado, no solo que lo está.
 */
export const VETADOS_EXACTOS = {
  "sdk de proveedor de LLM": [
    "openai",
    "@azure/openai",
    "@azure-rest/ai-inference",
    "@google/generative-ai",
    "@google/genai",
    "@google-cloud/vertexai",
    "cohere-ai",
    "groq-sdk",
    "replicate",
    "ollama",
    "together-ai",
    "@aws-sdk/client-bedrock-runtime",
    "@aws-sdk/client-bedrock-agent-runtime",
    "@aws-sdk/client-sagemaker-runtime",
    "@huggingface/inference",
  ],
  "framework de orquestación de LLM": [
    "ai",
    "langchain",
    "langsmith",
    "llamaindex",
    "@modelcontextprotocol/sdk",
  ],
  "runtime de inferencia de modelos": [
    "@xenova/transformers",
    "@huggingface/transformers",
    "@mlc-ai/web-llm",
    "node-llama-cpp",
    "onnxruntime-web",
    "onnxruntime-node",
    "@tensorflow/tfjs",
  ],
};

/**
 * Familias completas vetadas por prefijo de scope: cubre los paquetes que el proveedor publique
 * mañana sin que haya que actualizar la lista.
 */
export const VETADOS_POR_PREFIJO = {
  "sdk de proveedor de LLM": ["@anthropic-ai/", "@mistralai/", "@fireworks-ai/", "@openrouter/"],
  "framework de orquestación de LLM": ["@langchain/", "@ai-sdk/", "@llamaindex/"],
  "runtime de inferencia de modelos": ["@tensorflow/", "@huggingface/"],
};

/** Devuelve la familia por la que un paquete está vetado, o null si está limpio. */
export function familiaVetada(nombre) {
  for (const [familia, lista] of Object.entries(VETADOS_EXACTOS)) {
    if (lista.includes(nombre)) return familia;
  }
  for (const [familia, prefijos] of Object.entries(VETADOS_POR_PREFIJO)) {
    if (prefijos.some((p) => nombre.startsWith(p))) return familia;
  }
  return null;
}

const CAMPOS_DE_DEPENDENCIAS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

/** Nombres declarados en los cuatro mapas de dependencias de un package.json. */
export function nombresDePackageJson(pkg) {
  const nombres = new Set();
  for (const campo of CAMPOS_DE_DEPENDENCIAS) {
    for (const nombre of Object.keys(pkg?.[campo] ?? {})) nombres.add(nombre);
  }
  return [...nombres];
}

/**
 * Nombres de TODOS los paquetes resueltos en un pnpm-lock.yaml (v9): las claves de las secciones
 * `packages:` y `snapshots:` son `nombre@version`, con sufijos de peers entre paréntesis en
 * snapshots. Se parsea a mano —sin dependencia de YAML— porque un gate no puede depender de una
 * librería que el propio gate tendría que auditar.
 */
export function nombresDeLockfile(texto) {
  const nombres = new Set();
  let dentro = false;
  for (const linea of texto.split("\n")) {
    if (/^[a-zA-Z]+:/.test(linea)) {
      dentro = linea.startsWith("packages:") || linea.startsWith("snapshots:");
      continue;
    }
    if (!dentro) continue;
    const clave = /^ {2}'?(.+?)'?:\s*$/.exec(linea);
    if (!clave) continue;
    // `@scope/pkg@1.2.3(peer@4.5.6)` → cortar los peers y quedarse con lo previo a la ÚLTIMA @.
    const sinPeers = clave[1].split("(")[0];
    const corte = sinPeers.lastIndexOf("@");
    if (corte > 0) nombres.add(sinPeers.slice(0, corte));
  }
  return [...nombres];
}

/** Audita manifiesto + lockfile. Devuelve los hallazgos ordenados (determinista). */
export function auditar({ packageJson, lockfile }) {
  const candidatos = [
    ...nombresDePackageJson(packageJson).map((nombre) => ({ nombre, origen: "package.json" })),
    ...nombresDeLockfile(lockfile ?? "").map((nombre) => ({ nombre, origen: "pnpm-lock.yaml" })),
  ];
  const hallazgos = [];
  const vistos = new Set();
  for (const { nombre, origen } of candidatos) {
    const familia = familiaVetada(nombre);
    if (!familia || vistos.has(nombre)) continue;
    vistos.add(nombre);
    hallazgos.push({ nombre, origen, familia });
  }
  return hallazgos.sort((a, b) => a.nombre.localeCompare(b.nombre, "en"));
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────
const esEjecucionDirecta = process.argv[1] && process.argv[1].endsWith("gate-anti-ia.mjs");

if (esEjecucionDirecta) {
  const raiz = process.cwd();
  const packageJson = JSON.parse(readFileSync(resolve(raiz, "package.json"), "utf8"));
  let lockfile = "";
  try {
    lockfile = readFileSync(resolve(raiz, "pnpm-lock.yaml"), "utf8");
  } catch {
    console.warn("aviso: no se encontró pnpm-lock.yaml — solo se auditó package.json.");
  }

  const hallazgos = auditar({ packageJson, lockfile });

  if (hallazgos.length === 0) {
    console.log("✓ Gate anti-IA: cero SDKs de IA generativa. Velo sigue siendo 100% determinista.");
    process.exit(0);
  }

  console.error("✗ GATE ANTI-IA EN ROJO — la regla dura nº1 de Velo está rota.\n");
  for (const { nombre, origen, familia } of hallazgos) {
    console.error(`  · ${nombre}  (${familia})  — declarado en ${origen}`);
  }
  console.error(
    "\nVelo no lleva IA generativa en el runtime: el determinismo ES la propuesta de valor",
  );
  console.error("(reproducible ⇒ auditable). Ver decisions/001-cero-ia.md.");
  console.error("Si el paquete no es un SDK de IA, corrige la lista de este gate en el mismo PR.");
  process.exit(1);
}
