// El gate anti-IA es el único test del repo que verifica una AUSENCIA. Por eso se prueba a sí
// mismo: un gate que nunca ha visto un rojo es una promesa, no un gate.
import { describe, expect, it } from "vitest";

import {
  auditar,
  familiaVetada,
  nombresDeLockfile,
} from "../../scripts/gate-anti-ia.mjs";

const PACKAGE_LIMPIO = {
  dependencies: { next: "16.3.0", react: "19.2.8", zod: "^4.4.3" },
  devDependencies: { vitest: "^4.1.10", typescript: "^5" },
};

describe("familiaVetada", () => {
  it("veta los SDKs de proveedores de LLM por nombre exacto", () => {
    expect(familiaVetada("openai")).toBe("sdk de proveedor de LLM");
    expect(familiaVetada("groq-sdk")).toBe("sdk de proveedor de LLM");
    expect(familiaVetada("@google/genai")).toBe("sdk de proveedor de LLM");
  });

  it("veta familias completas por prefijo de scope", () => {
    expect(familiaVetada("@anthropic-ai/sdk")).toBe("sdk de proveedor de LLM");
    expect(familiaVetada("@anthropic-ai/paquete-que-aun-no-existe")).toBe(
      "sdk de proveedor de LLM",
    );
    expect(familiaVetada("@langchain/core")).toBe(
      "framework de orquestación de LLM",
    );
    expect(familiaVetada("@ai-sdk/openai")).toBe(
      "framework de orquestación de LLM",
    );
  });

  it("veta los runtimes de inferencia local, no solo las APIs remotas", () => {
    // "Cero IA" en Velo no significa "cero llamadas de red a un LLM": significa cero adivinanza.
    // Un modelo corriendo en la propia pestaña rompe el determinismo igual que uno remoto.
    expect(familiaVetada("@xenova/transformers")).toBe(
      "runtime de inferencia de modelos",
    );
    expect(familiaVetada("@mlc-ai/web-llm")).toBe(
      "runtime de inferencia de modelos",
    );
    expect(familiaVetada("onnxruntime-web")).toBe(
      "runtime de inferencia de modelos",
    );
  });

  it("no confunde paquetes legítimos con SDKs de IA", () => {
    // El vetado exacto "ai" no puede arrastrar a todo lo que empiece por esas dos letras,
    // ni el prefijo "@aws-sdk/client-bedrock-runtime" a todo el scope de AWS.
    expect(familiaVetada("aidan")).toBeNull();
    expect(familiaVetada("airbnb-config")).toBeNull();
    expect(familiaVetada("@aws-sdk/client-s3")).toBeNull();
    expect(familiaVetada("papaparse")).toBeNull();
    expect(familiaVetada("react")).toBeNull();
  });
});

describe("nombresDeLockfile", () => {
  it("extrae nombres de las claves nombre@version de packages y snapshots", () => {
    const lock = [
      "lockfileVersion: '9.0'",
      "",
      "importers:",
      "",
      "  .:",
      "    dependencies:",
      "      react:",
      "        specifier: 19.2.8",
      "        version: 19.2.8",
      "",
      "packages:",
      "",
      "  '@sentry/nextjs@10.69.0':",
      "    resolution: {integrity: sha512-abc==}",
      "",
      "  papaparse@5.5.4:",
      "    resolution: {integrity: sha512-def==}",
      "",
      "snapshots:",
      "",
      "  '@sentry/nextjs@10.69.0(react@19.2.8)':",
      "    dependencies:",
      "      react: 19.2.8",
    ].join("\n");

    const nombres = nombresDeLockfile(lock);

    expect(nombres).toContain("@sentry/nextjs"); // scope + nombre, sin la versión
    expect(nombres).toContain("papaparse"); // clave sin comillas
    expect(nombres).not.toContain("react"); // la sección importers no aporta claves
  });
});

describe("auditar", () => {
  it("deja pasar un proyecto sin una sola dependencia de IA", () => {
    expect(auditar({ packageJson: PACKAGE_LIMPIO, lockfile: "" })).toEqual([]);
  });

  it("pone en rojo un SDK de LLM declarado en dependencies", () => {
    const hallazgos = auditar({
      packageJson: {
        ...PACKAGE_LIMPIO,
        dependencies: {
          ...PACKAGE_LIMPIO.dependencies,
          "@anthropic-ai/sdk": "^0.30.0",
        },
      },
      lockfile: "",
    });

    expect(hallazgos).toHaveLength(1);
    expect(hallazgos[0]).toMatchObject({
      nombre: "@anthropic-ai/sdk",
      origen: "package.json",
      familia: "sdk de proveedor de LLM",
    });
  });

  it("pone en rojo un SDK colado en devDependencies", () => {
    // "solo para desarrollo" no es una excepción: la regla dura no tiene modos.
    const hallazgos = auditar({
      packageJson: {
        ...PACKAGE_LIMPIO,
        devDependencies: {
          ...PACKAGE_LIMPIO.devDependencies,
          openai: "^4.0.0",
        },
      },
      lockfile: "",
    });

    expect(hallazgos.map((h) => h.nombre)).toEqual(["openai"]);
  });

  it("caza una dependencia TRANSITIVA aunque package.json esté limpio", () => {
    // El caso que un gate ingenuo (solo package.json) dejaría pasar: el LLM entra como
    // dependencia de una dependencia.
    const lockfile = [
      "packages:",
      "",
      "  '@langchain/core@0.3.0':",
      "    resolution: {integrity: sha512-xyz==}",
    ].join("\n");

    const hallazgos = auditar({ packageJson: PACKAGE_LIMPIO, lockfile });

    expect(hallazgos).toEqual([
      {
        nombre: "@langchain/core",
        origen: "pnpm-lock.yaml",
        familia: "framework de orquestación de LLM",
      },
    ]);
  });

  it("reporta cada paquete una sola vez y en orden estable", () => {
    // El gate también obedece la regla de determinismo: mismo repo ⇒ misma salida.
    const packageJson = {
      dependencies: { openai: "^4.0.0", "@anthropic-ai/sdk": "^0.30.0" },
      devDependencies: { ollama: "^0.5.0" },
    };
    const lockfile = [
      "packages:",
      "",
      "  openai@4.0.0:",
      "    resolution: {}",
    ].join("\n");

    const primera = auditar({ packageJson, lockfile });
    const segunda = auditar({ packageJson, lockfile });

    expect(primera.map((h) => h.nombre)).toEqual([
      "@anthropic-ai/sdk",
      "ollama",
      "openai",
    ]);
    expect(segunda).toEqual(primera);
  });
});
