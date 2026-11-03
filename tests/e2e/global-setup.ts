// Los archivos de prueba de los e2e se GENERAN, no se commitean.
//
// Dos razones y las dos son duras: el repo es público y aquí no entra un dato real ni sintético
// disfrazado (todo sale del kit seeded, que es la única fuente autorizada), y un fixture de medio
// millón de filas pesa 130 MB — clonar el repo no puede costar eso.
//
// El generador se invoca como proceso, no como import: es un módulo ESM y este archivo lo carga
// Playwright como CommonJS. Llamarlo por la CLI es además la forma en que lo usa una persona, así
// que el camino queda probado de paso.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { anadirEntrada, bitacoraVacia } from "@/engine/bitacora";
import { sellarBitacora } from "@/lib/bitacora-archivo";

export const DIRECTORIO_DE_FIXTURES = join(process.cwd(), "tmp", "e2e");

/**
 * Cuántas entradas lleva la bitácora grande, y por qué esa cifra.
 *
 * Una entrada es un tratamiento. Alguien que anonimice a diario durante cuatro años llega a unas
 * mil; dos mil es el doble de un uso intenso sostenido, que es donde conviene medir. No es un
 * número redondo elegido por bonito: es «el doble del techo realista», declarado.
 */
export const ENTRADAS_DE_LA_BITACORA_GRANDE = 2_000;

export const FRASE_DE_LA_BITACORA_GRANDE = "una frase larga de medicion";

export const BITACORA_GRANDE = join(
  DIRECTORIO_DE_FIXTURES,
  "bitacora-grande.velolog",
);

/** Formatos que el kit sabe escribir (`--formato` del generador). */
export type FormatoDeFixture = "csv" | "xlsx" | "json" | "jsonl";

interface Fixture {
  perfil: string;
  filas: number;
  seed: number;
  formato: FormatoDeFixture;
}

/** Cada fixture con su semilla: el mismo archivo, byte por byte, en cada corrida y en cada máquina. */
const FIXTURES: readonly Fixture[] = [
  { perfil: "clinico", filas: 2_000, seed: 42, formato: "csv" },
  { perfil: "sin-personales", filas: 800, seed: 42, formato: "csv" },
  // Excel de verdad, para probar la otra vía de lectura de punta a punta.
  { perfil: "clinico", filas: 1_000, seed: 42, formato: "xlsx" },
  // El grande: 500.000 × 24 ≈ 130 MB. No se commitea (el repo es público y clonarlo no puede
  // costar eso); se regenera con su semilla en cada corrida, en unos dos segundos.
  { perfil: "clinico", filas: 500_000, seed: 42, formato: "csv" },
  // El de alto volumen (S8): 210 columnas × 100.000 filas = 21 millones de celdas, apenas sobre el
  // tope de 20 millones que Velo guarda en memoria. ~42 MB, en un segundo.
  { perfil: "ancho", filas: 100_000, seed: 42, formato: "csv" },
  // JSON, el tercer formato. Un objeto anidado en las dos formas (arreglo y JSON Lines, el mismo
  // dato), uno con listas que Velo debe declarar «no tratadas» y uno heterogéneo (claves que
  // faltan, tipos mezclados, `__proto__`, un número mayor que 2⁵³). Solo existen en json/jsonl.
  { perfil: "anidado", filas: 2_000, seed: 42, formato: "json" },
  { perfil: "anidado", filas: 2_000, seed: 42, formato: "jsonl" },
  { perfil: "con-listas", filas: 500, seed: 42, formato: "json" },
  { perfil: "heterogeneo", filas: 500, seed: 42, formato: "json" },
];

export function nombreDeFixture(
  perfil: string,
  filas: number,
  seed: number,
  formato: FormatoDeFixture = "csv",
) {
  return join(DIRECTORIO_DE_FIXTURES, `${perfil}-${filas}-s${seed}.${formato}`);
}

/**
 * Las rutas de los fixtures JSON que generan estas corridas, para que los specs no armen el nombre
 * a mano. Cada una nombra un archivo que `generarFixtures` deja en `tmp/e2e/`.
 */
export const FIXTURE_ANIDADO_JSON = nombreDeFixture(
  "anidado",
  2_000,
  42,
  "json",
);
export const FIXTURE_ANIDADO_JSONL = nombreDeFixture(
  "anidado",
  2_000,
  42,
  "jsonl",
);
export const FIXTURE_CON_LISTAS_JSON = nombreDeFixture(
  "con-listas",
  500,
  42,
  "json",
);
export const FIXTURE_HETEROGENEO_JSON = nombreDeFixture(
  "heterogeneo",
  500,
  42,
  "json",
);

/**
 * Los binarios con metadatos falsos del kit (S6): una foto en tres formatos y tres PDF. Misma semilla
 * que el resto, así que cada corrida y cada máquina producen los mismos bytes. Cada uno viene con su
 * lista de «centinelas» —las cadenas que el kit escondió en los metadatos—, en `<archivo>.centinelas.json`,
 * para que un e2e afirme que la limpieza las quitó. La foto va en tres formatos con la misma semilla:
 * la misma «persona» y las mismas coordenadas, para comparar los limpiadores entre sí.
 */
export const FIXTURE_JPEG = join(DIRECTORIO_DE_FIXTURES, "foto-s42.jpg");
export const FIXTURE_PNG = join(DIRECTORIO_DE_FIXTURES, "foto-s42.png");
export const FIXTURE_WEBP = join(DIRECTORIO_DE_FIXTURES, "foto-s42.webp");
export const FIXTURE_HEIC = join(DIRECTORIO_DE_FIXTURES, "foto-s42.heic");
/** Dos revisiones: el Author de la primera sigue en los bytes aunque la segunda lo reemplace. */
export const FIXTURE_PDF = join(DIRECTORIO_DE_FIXTURES, "documento-s42.pdf");
/** El trailer trae `/Encrypt`: Velo lo reconoce y se niega a limpiarlo. */
export const FIXTURE_PDF_CIFRADO = join(
  DIRECTORIO_DE_FIXTURES,
  "documento-cifrado-s42.pdf",
);
/** Un campo de firma con `/ByteRange`: limpiarlo invalida la firma, y la interfaz lo avisa. */
export const FIXTURE_PDF_FIRMADO = join(
  DIRECTORIO_DE_FIXTURES,
  "documento-firmado-s42.pdf",
);

interface FixtureBinario {
  formato: "jpeg" | "png" | "webp" | "heic" | "pdf";
  /** Solo el PDF tiene perfiles (`simple` · `con-revisiones` · `cifrado` · `firmado`). */
  perfil?: string;
  seed: number;
  destino: string;
}

const FIXTURES_BINARIOS: readonly FixtureBinario[] = [
  { formato: "jpeg", seed: 42, destino: FIXTURE_JPEG },
  { formato: "png", seed: 42, destino: FIXTURE_PNG },
  { formato: "webp", seed: 42, destino: FIXTURE_WEBP },
  { formato: "heic", seed: 42, destino: FIXTURE_HEIC },
  { formato: "pdf", perfil: "con-revisiones", seed: 42, destino: FIXTURE_PDF },
  { formato: "pdf", perfil: "cifrado", seed: 42, destino: FIXTURE_PDF_CIFRADO },
  { formato: "pdf", perfil: "firmado", seed: 42, destino: FIXTURE_PDF_FIRMADO },
];

/** Dónde deja el kit la lista de centinelas de un fixture binario. */
export function rutaDeCentinelas(fixture: string): string {
  return `${fixture}.centinelas.json`;
}

/**
 * Las cadenas que el kit escondió en los metadatos de un fixture binario (todas de 6 o más
 * caracteres, ninguna en el contenido visible). Un e2e las busca en la salida de la limpieza y
 * afirma que ya no están.
 */
export function centinelasDe(fixture: string): string[] {
  const lista: unknown = JSON.parse(
    readFileSync(rutaDeCentinelas(fixture), "utf8"),
  );
  if (!Array.isArray(lista) || !lista.every((c) => typeof c === "string")) {
    throw new Error(`centinelas ilegibles para ${fixture}`);
  }
  return lista;
}

export default async function generarFixtures(): Promise<void> {
  mkdirSync(DIRECTORIO_DE_FIXTURES, { recursive: true });

  for (const { perfil, filas, seed, formato } of FIXTURES) {
    execFileSync(
      "node",
      [
        join(process.cwd(), "docs", "kit-de-prueba", "generador.mjs"),
        "--filas",
        String(filas),
        "--seed",
        String(seed),
        "--perfil",
        perfil,
        "--formato",
        formato,
        "--salida",
        nombreDeFixture(perfil, filas, seed, formato),
      ],
      { stdio: "ignore" },
    );
  }

  for (const { formato, perfil, seed, destino } of FIXTURES_BINARIOS) {
    execFileSync(
      "node",
      [
        join(process.cwd(), "docs", "kit-de-prueba", "generador.mjs"),
        "--formato",
        formato,
        ...(perfil ? ["--perfil", perfil] : []),
        "--seed",
        String(seed),
        "--salida",
        destino,
        "--centinelas",
        rutaDeCentinelas(destino),
      ],
      { stdio: "ignore" },
    );
  }

  // Un archivo que Velo no lee, para el estado de error de formato.
  writeFileSync(
    join(DIRECTORIO_DE_FIXTURES, "notas.txt"),
    "Esto no es una tabla.\n",
    "utf8",
  );

  // La bitácora grande, para medir qué pasa cuando crece. Se SELLA con el mismo código del
  // producto —no con una imitación— porque lo que se mide es abrir un archivo real. Los nombres
  // son inventados y las cifras deterministas: aquí no entra un dato real, como en todo lo demás.
  let bitacora = bitacoraVacia();
  for (let i = 0; i < ENTRADAS_DE_LA_BITACORA_GRANDE; i++) {
    bitacora = anadirEntrada(bitacora, {
      fecha: `13 de agosto de 2026, ${String(i % 24).padStart(2, "0")}:00`,
      archivo: `estudio-${String(i).padStart(5, "0")}.csv`,
      hashDePolitica: (i % 7).toString(16).repeat(64).slice(0, 64),
      tecnicas: i % 2 === 0 ? ["enmascarar"] : ["seudonimizar", "suprimir"],
      filas: 1_000 + i,
      unicosAntes: 0.3,
      unicosDespues: 0.02,
      esTitular: i % 3 !== 0,
      huellaDeEntrada: (i % 9).toString(16).repeat(64).slice(0, 64),
      huellaDeSalida: (i % 11).toString(16).repeat(64).slice(0, 64),
    });
  }
  writeFileSync(
    BITACORA_GRANDE,
    await sellarBitacora(bitacora, FRASE_DE_LA_BITACORA_GRANDE),
  );
}
