// @vitest-environment node
//
// GATE «VELO LOCAL = NAVEGADOR» (S9, regla dura nº3, ADR-017).
//
// El mismo archivo, la misma política, la misma frase, la misma sal y el mismo idioma dan los mismos
// bytes en `pnpm velo` que en la web. Aquí se compara contra lo que hace el worker EN MEMORIA
// (`aplicarPolitica` + `serializarCsv`), que es el camino más distinto posible del que usa Velo
// local (pasadas por trozos, `fs.openAsBlob`, la consola): si los dos coinciden, coinciden. El e2e
// `local-igual-navegador.spec.ts` cierra el otro lado, con Chromium de verdad.
//
// Se prueba también la fuente de filas (la de una tabla de base de datos): las mismas filas por
// lotes dan los mismos bytes que el CSV.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generarFilas } from "../../docs/kit-de-prueba/generador.mjs";
import { construirBoveda, serializarBoveda } from "@/engine/boveda";
import { ConstructorColumnar, type TablaColumnar } from "@/engine/columnar";
import {
  escaparCampo,
  nombreDelArchivoAnonimizado,
  serializarCsv,
} from "@/engine/csv";
import {
  exportarPolitica,
  hashDePolitica,
  type Politica,
} from "@/engine/politica";
import { aplicarPolitica } from "@/engine/tecnicas";
import { abrirBoveda } from "@/lib/boveda-archivo";
import { abrirBitacora } from "@/lib/bitacora-archivo";
import { derivarLlave, type LlaveDeProyecto } from "@/lib/llave";
import { sha256 } from "@/lib/sha256";
import { lotesDeCsv } from "@/workers/csv";
import type { FuenteDeFilas } from "@/workers/alto-volumen";

import { principal, type Consola } from "../../velo-local/cli";
import {
  anonimizar,
  DestinoConHuella,
  leer,
  type Sumidero,
} from "../../velo-local/nucleo";

const FRASE = "una frase larga de prueba del S9";
const FRASE_DE_BOVEDA = "otra frase para la boveda del S9";
const FRASE_DE_BITACORA = "la frase de la bitacora del S9";
const SAL = "00112233445566778899aabbccddeeff";
const AHORA = () => new Date("2026-11-07T12:00:00Z");

const KIT = [
  ...generarFilas({
    filas: 1_200,
    seed: 42,
    perfil: "clinico",
    tasaInvalida: 0.08,
    tasaVacia: 0.03,
  }),
]
  .map((fila) => `${fila.map(escaparCampo).join(",")}\n`)
  .join("");

/** Con bóveda: cédula y correo reversibles; el resto, una técnica de cada familia. */
const CON_BOVEDA: Politica = {
  version: 1,
  origen: "manual",
  kObjetivo: null,
  reglas: [
    {
      columna: "cedula_titular",
      tecnica: {
        tipo: "seudonimizar-con-formato",
        formato: "cedula",
        reversible: true,
      },
    },
    {
      columna: "nit_empresa",
      tecnica: { tipo: "seudonimizar-con-formato", formato: "nit" },
    },
    {
      columna: "correo",
      tecnica: { tipo: "seudonimizar", longitud: 16, reversible: true },
    },
    { columna: "celular", tecnica: { tipo: "enmascarar" } },
    {
      columna: "fecha_nacimiento",
      tecnica: { tipo: "generalizar-fecha", precision: "anio" },
    },
    { columna: "nombre_completo", tecnica: { tipo: "suprimir" } },
    {
      columna: "monto",
      tecnica: {
        tipo: "laplace",
        epsilon: 1,
        minimo: 0,
        maximo: 10_000_000,
        decimales: 0,
      },
    },
  ],
};

/** Con reparto (Mondrian, k=5): la pasada B por trozos contra la tabla entera. */
const MONDRIAN: Politica = {
  ...CON_BOVEDA,
  kObjetivo: 5,
  reglas: [
    ...CON_BOVEDA.reglas,
    ...["sexo", "municipio", "estrato", "grupo_etnico"].map((columna) => ({
      columna,
      tecnica: { tipo: "generalizar-automatico" as const },
    })),
  ],
};

/** Solo reversibles: lo restaurado tiene que ser el archivo ORIGINAL, byte a byte. */
const SOLO_REVERSIBLES: Politica = {
  version: 1,
  origen: "manual",
  kObjetivo: null,
  reglas: [
    {
      columna: "cedula_titular",
      tecnica: {
        tipo: "seudonimizar-con-formato",
        formato: "cedula",
        reversible: true,
      },
    },
    {
      columna: "correo",
      tecnica: { tipo: "seudonimizar", longitud: 16, reversible: true },
    },
  ],
};

let llave: LlaveDeProyecto;
let carpeta: string;
const registro: string[] = [];
const consola: Consola = {
  salida: (l) => void registro.push(l),
  aviso: (l) => void registro.push(l),
};

beforeAll(async () => {
  llave = await derivarLlave(FRASE, SAL);
  carpeta = mkdtempSync(join(tmpdir(), "velo-s9-"));
  writeFileSync(join(carpeta, "clinico.csv"), KIT);
  process.env.VELO_FRASE = FRASE;
  process.env.VELO_FRASE_BOVEDA = FRASE_DE_BOVEDA;
  process.env.VELO_FRASE_BITACORA = FRASE_DE_BITACORA;
});

afterAll(() => {
  rmSync(carpeta, { recursive: true, force: true });
  delete process.env.VELO_FRASE;
  delete process.env.VELO_FRASE_BOVEDA;
  delete process.env.VELO_FRASE_BITACORA;
});

async function tablaEnMemoria(texto: string): Promise<TablaColumnar> {
  let constructor: ConstructorColumnar | null = null;
  for await (const lote of lotesDeCsv(new Blob([texto]))) {
    let desde = 0;
    if (!constructor) {
      constructor = new ConstructorColumnar(lote[0] ?? [], 1 << 10);
      desde = 1;
    }
    for (let i = desde; i < lote.length; i++) constructor.agregarFila(lote[i]);
  }
  return constructor!.finalizar();
}

/** Lo que el worker hace en memoria con este archivo, esta política y esta llave. */
async function enMemoria(politica: Politica) {
  const huella = sha256(new TextEncoder().encode(KIT));
  return aplicarPolitica(
    await tablaEnMemoria(KIT),
    politica,
    llave.clave,
    "es",
    huella,
  );
}

/** `pnpm velo anonimizar`, de verdad, en una carpeta propia. */
async function porLaConsola(
  politica: Politica,
  nombre: string,
  extra: string[] = [],
) {
  const salida = mkdtempSync(join(carpeta, `${nombre}-`));
  const rutaDePolitica = join(salida, "politica.json");
  writeFileSync(rutaDePolitica, exportarPolitica(politica));
  const codigo = await principal(
    [
      "anonimizar",
      join(carpeta, "clinico.csv"),
      "--politica",
      rutaDePolitica,
      "--sal",
      SAL,
      "--salida",
      salida,
      ...extra,
    ],
    consola,
    AHORA,
  );
  expect(codigo, registro.join("\n")).toBe(0);
  const hash = hashDePolitica(politica);
  return {
    salida,
    hash,
    csv: readFileSync(join(salida, nombreDelArchivoAnonimizado(hash))),
    boveda: join(salida, `velo-boveda-${hash.slice(0, 8)}.velo`),
    certificado: readFileSync(
      join(salida, "velo-certificado-clinico.html"),
      "utf8",
    ),
  };
}

describe("Velo local = el motor del navegador, byte a byte", () => {
  for (const [nombre, politica] of [
    ["con bóveda, ruido y supresión", CON_BOVEDA],
    ["con Mondrian", MONDRIAN],
  ] as const)
    it(nombre, async () => {
      const local = await porLaConsola(politica, nombre.replace(/\W+/g, "-"));
      const memoria = await enMemoria(politica);
      expect(sha256(new Uint8Array(local.csv))).toBe(
        sha256(new TextEncoder().encode(serializarCsv(memoria.tabla))),
      );
      // La bóveda se compara EN CLARO (ADR-006): el archivo lleva un IV nuevo cada vez.
      const abierta = await abrirBoveda(
        new Uint8Array(readFileSync(local.boveda)),
        FRASE_DE_BOVEDA,
      );
      expect(abierta.ok).toBe(true);
      if (!abierta.ok) return;
      expect(serializarBoveda(abierta.boveda)).toBe(
        serializarBoveda(
          construirBoveda(
            {
              huellaDeLlave: llave.huella,
              salDeLlave: SAL,
              hashDePolitica: local.hash,
            },
            memoria.correspondencias,
          ),
        ),
      );
      // El certificado lleva las dos huellas: la del archivo que entró y la del que salió.
      expect(local.certificado).toContain(
        sha256(new TextEncoder().encode(KIT)),
      );
      expect(local.certificado).toContain(sha256(new Uint8Array(local.csv)));
    });

  it("dos corridas, mismos bytes: el anonimizado y el certificado (con la misma fecha)", async () => {
    const a = await porLaConsola(CON_BOVEDA, "a");
    const b = await porLaConsola(CON_BOVEDA, "b");
    expect(a.csv.equals(b.csv)).toBe(true);
    expect(a.certificado).toBe(b.certificado);
  });

  it("otra sal, otros seudónimos: la sal entra a la llave", async () => {
    const salida = mkdtempSync(join(carpeta, "otra-sal-"));
    const politica = join(salida, "p.json");
    writeFileSync(politica, exportarPolitica(CON_BOVEDA));
    await principal(
      [
        "anonimizar",
        join(carpeta, "clinico.csv"),
        "--politica",
        politica,
        "--sal",
        "f".repeat(32),
        "--salida",
        salida,
      ],
      consola,
      AHORA,
    );
    const otra = readFileSync(
      join(salida, nombreDelArchivoAnonimizado(hashDePolitica(CON_BOVEDA))),
    );
    const misma = (await porLaConsola(CON_BOVEDA, "misma")).csv;
    expect(otra.equals(misma)).toBe(false);
  });

  it("una fuente de filas (la de una tabla) da los mismos bytes que el CSV", async () => {
    const filas = KIT.trimEnd()
      .split("\n")
      .map((l) => l.split(","));
    // Sin comas dentro de un campo en este kit: la división basta para armar las filas.
    expect(filas.every((f) => f.length === filas[0].length)).toBe(true);
    const fuente: FuenteDeFilas = {
      bytes: 0,
      async *lotes() {
        for (let i = 0; i < filas.length; i += 97) yield filas.slice(i, i + 97);
      },
    };
    const partes: Uint8Array[] = [];
    const sumidero: Sumidero = { escribir: async (b) => void partes.push(b) };
    const huella = sha256(new TextEncoder().encode(KIT));
    await anonimizar({
      fuente,
      origen: { nombre: "clinico.csv", bytes: KIT.length, sha256: huella },
      politica: CON_BOVEDA,
      llave,
      idioma: "es",
      destino: new DestinoConHuella(sumidero),
      fecha: "7 de noviembre de 2026",
    });
    const memoria = await enMemoria(CON_BOVEDA);
    expect(sha256(new Uint8Array(Buffer.concat(partes)))).toBe(
      sha256(new TextEncoder().encode(serializarCsv(memoria.tabla))),
    );
  });

  it("por pasadas (un archivo que no cabe) da los mismos bytes que en memoria", async () => {
    const huella = sha256(new TextEncoder().encode(KIT));
    const origen = { nombre: "clinico.csv", bytes: KIT.length, sha256: huella };
    const salidas: string[] = [];
    for (const topeDeCeldas of [undefined, 1_000]) {
      const fuente = new Blob([KIT]);
      const lectura = await leer(fuente, origen, { topeDeCeldas });
      expect(lectura.modo).toBe(topeDeCeldas ? "alto-volumen" : "memoria");
      const partes: Uint8Array[] = [];
      await anonimizar({
        fuente,
        origen,
        lectura,
        politica: MONDRIAN,
        llave,
        idioma: "es",
        destino: new DestinoConHuella({ escribir: async (b) => void partes.push(b) }),
        fecha: "7 de noviembre de 2026",
      });
      salidas.push(sha256(new Uint8Array(Buffer.concat(partes))));
    }
    expect(salidas[1]).toBe(salidas[0]);
  });

  it("ida y regreso: lo restaurado es el archivo original, byte a byte", async () => {
    const ida = await porLaConsola(SOLO_REVERSIBLES, "ida");
    const devuelto = join(ida.salida, nombreDelArchivoAnonimizado(ida.hash));
    const codigo = await principal(
      ["restaurar", devuelto, "--boveda", ida.boveda, "--salida", ida.salida],
      consola,
      AHORA,
    );
    expect(codigo, registro.join("\n")).toBe(0);
    const restaurado = readFileSync(
      join(
        ida.salida,
        `velo-restaurado-${sha256(new Uint8Array(ida.csv)).slice(0, 8)}.csv`,
      ),
      "utf8",
    );
    expect(sha256(new TextEncoder().encode(restaurado))).toBe(
      sha256(new TextEncoder().encode(KIT)),
    );
  });

  it("la bitácora crece: dos tratamientos, dos entradas, sin tocar la primera", async () => {
    const ruta = join(carpeta, "velo-bitacora.velolog");
    await porLaConsola(CON_BOVEDA, "bit-1", ["--bitacora", ruta]);
    const primera = await abrirBitacora(
      new Uint8Array(readFileSync(ruta)),
      FRASE_DE_BITACORA,
    );
    await porLaConsola(MONDRIAN, "bit-2", ["--bitacora", ruta]);
    const segunda = await abrirBitacora(
      new Uint8Array(readFileSync(ruta)),
      FRASE_DE_BITACORA,
    );
    expect(primera.ok && segunda.ok).toBe(true);
    if (!primera.ok || !segunda.ok) return;
    expect(segunda.bitacora.entradas).toHaveLength(2);
    expect(segunda.bitacora.entradas[0]).toEqual(primera.bitacora.entradas[0]);
    // Qué se hizo, no a qué: ninguna entrada lleva un nombre de columna.
    expect(JSON.stringify(segunda.bitacora)).not.toContain("cedula_titular");
  });

  it("no pisa un archivo que ya existe", async () => {
    const salida = mkdtempSync(join(carpeta, "pisar-"));
    const politica = join(salida, "p.json");
    writeFileSync(politica, exportarPolitica(CON_BOVEDA));
    writeFileSync(
      join(salida, nombreDelArchivoAnonimizado(hashDePolitica(CON_BOVEDA))),
      "mio",
    );
    const codigo = await principal(
      [
        "anonimizar",
        join(carpeta, "clinico.csv"),
        "--politica",
        politica,
        "--sal",
        SAL,
        "--salida",
        salida,
      ],
      consola,
      AHORA,
    );
    expect(codigo).toBe(1);
    expect(
      readFileSync(
        join(salida, nombreDelArchivoAnonimizado(hashDePolitica(CON_BOVEDA))),
        "utf8",
      ),
    ).toBe("mio");
  });
});
