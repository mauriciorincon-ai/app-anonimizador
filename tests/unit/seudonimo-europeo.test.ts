// Los seudónimos con formato europeo (S8, ADR-016). Lo que se protege no es que las funciones
// «anden»: es que el archivo que sale pase el control oficial del país (así el sistema del destino
// no lo rechaza), que jamás sea el dato que entró y que dependa solo del valor y la llave.

import { beforeAll, describe, expect, it } from "vitest";

import {
  FORMATOS_DE_SEUDONIMO,
  type FormatoDeSeudonimo,
} from "@/engine/politica";
import { seudonimizarConFormato } from "@/engine/tecnicas/seudonimo";
import {
  cumpleBsn,
  cumpleCodiceFiscale,
  cumpleDni,
  cumpleNie,
  cumpleNir,
  cumplePesel,
  claveDelRib,
  controlDelCcc,
  cumpleSteuerIdNr,
  estructuraDeSteuer,
  fechaDelPesel,
  sinSeparadores,
} from "@/engine/validadores/europeos";
import { cumpleIban } from "@/engine/validadores/universales";

async function llaveDe(semilla: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(semilla.padEnd(32, ".")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

let llaveA: CryptoKey;
let llaveB: CryptoKey;
beforeAll(async () => {
  llaveA = await llaveDe("llave-del-proyecto-a");
  llaveB = await llaveDe("llave-del-proyecto-b");
});

const EUROPEOS = FORMATOS_DE_SEUDONIMO.filter(
  (f) => f !== "cedula" && f !== "nit",
) as readonly Exclude<FormatoDeSeudonimo, "cedula" | "nit">[];

/** El control oficial de cada formato: el MISMO que usa el validador del diagnóstico. */
const CONTROL: Record<(typeof EUROPEOS)[number], (valor: string) => boolean> = {
  iban: cumpleIban,
  dni: cumpleDni,
  nie: cumpleNie,
  nir: cumpleNir,
  "codice-fiscale": cumpleCodiceFiscale,
  "steuer-idnr": cumpleSteuerIdNr,
  bsn: cumpleBsn,
  pesel: cumplePesel,
};

/** IBAN sintéticos de varios países, con sus dígitos de control calculados aparte del código bajo prueba. */
function ibanDe(pais: string, bban: string): string {
  const numerico = `${bban}${pais}00`.replace(/[A-Z]/g, (c) =>
    String(c.charCodeAt(0) - 55),
  );
  let residuo = 0;
  for (const c of numerico) residuo = (residuo * 10 + Number(c)) % 97;
  return `${pais}${String(98 - residuo).padStart(2, "0")}${bban}`;
}

/** 1 000 entradas sintéticas por formato. Para el IBAN, con forma de IBAN de países distintos. */
function entradasDe(formato: (typeof EUROPEOS)[number]): string[] {
  return Array.from({ length: 1000 }, (_, i) => {
    if (formato !== "iban") return `entrada-sintetica-${formato}-${i}`;
    const n = String(10_000_000_000 + i * 7919).padStart(20, "0");
    const variante = i % 4;
    if (variante === 0) return ibanDe("ES", n);
    if (variante === 1) return ibanDe("DE", n.slice(0, 18));
    if (variante === 2) return ibanDe("GB", `NWBK${n.slice(0, 14)}`);
    return ibanDe("FR", `${n.slice(0, 10)}0A${n.slice(10, 19)}12`.slice(0, 23));
  });
}

describe.each(EUROPEOS)("seudónimo con formato %s", (formato) => {
  it("pasa el control oficial en 1 000 entradas", async () => {
    const r = await seudonimizarConFormato(
      entradasDe(formato),
      llaveA,
      formato,
    );
    const malos = r.valores.filter((v) => !CONTROL[formato](v));
    expect(malos).toEqual([]);
  });

  it("jamás coincide con su entrada (1 000 entradas sintéticas)", async () => {
    const entradas = entradasDe(formato);
    const r = await seudonimizarConFormato(entradas, llaveA, formato);
    const iguales = entradas.filter(
      (entrada, i) => sinSeparadores(entrada) === sinSeparadores(r.valores[i]),
    );
    expect(iguales).toEqual([]);
  });

  it("mismo valor y misma llave dan el mismo seudónimo; otra llave, otro", async () => {
    const entradas = entradasDe(formato).slice(0, 50);
    const a1 = await seudonimizarConFormato(entradas, llaveA, formato);
    const a2 = await seudonimizarConFormato(entradas, llaveA, formato);
    const b = await seudonimizarConFormato(entradas, llaveB, formato);
    expect(a2.valores).toEqual(a1.valores);
    expect(b.valores).not.toEqual(a1.valores);
  });

  it("depende solo del valor: el mismo valor sale igual con otros vecinos", async () => {
    const [x, ...resto] = entradasDe(formato);
    const solo = await seudonimizarConFormato([x], llaveA, formato);
    const acompanado = await seudonimizarConFormato(
      [...resto, x],
      llaveA,
      formato,
    );
    expect(acompanado.valores.at(-1)).toBe(solo.valores[0]);
  });

  it("el vacío sigue vacío y no cuenta como colisión", async () => {
    const r = await seudonimizarConFormato(["", ""], llaveA, formato);
    expect(r.valores).toEqual(["", ""]);
    expect(r.colisiones).toBe(0);
  });
});

describe("la forma de cada seudónimo, más allá del control", () => {
  it("IBAN: conserva el país, el largo, la clase de cada posición y el agrupado", async () => {
    const entradas = [
      ibanDe("ES", "21000418450200051332"),
      ibanDe("DE", "370400440532013000"),
      ibanDe("GB", "NWBK60161331926819"),
    ];
    const r = await seudonimizarConFormato(entradas, llaveA, "iban");
    entradas.forEach((original, i) => {
      const salida = r.valores[i];
      expect(salida.slice(0, 2)).toBe(original.slice(0, 2));
      expect(salida).toHaveLength(original.length);
      expect(salida.slice(4).replace(/\d/g, "9").replace(/[A-Z]/g, "A")).toBe(
        original.slice(4).replace(/\d/g, "9").replace(/[A-Z]/g, "A"),
      );
    });
    const conEspacios = "ES91 2100 0418 4502 0005 1332";
    const [agrupado] = (
      await seudonimizarConFormato([conEspacios], llaveA, "iban")
    ).valores;
    expect(agrupado).toMatch(/^ES\d{2}( \d{4}){5}$/);
    expect(cumpleIban(agrupado)).toBe(true);
  });

  it("IBAN: los BBAN de España y de Francia salen con la clave nacional recalculada (S10)", async () => {
    const entradas = entradasDe("iban");
    const r = await seudonimizarConFormato(entradas, llaveA, "iban");
    let es = 0;
    let fr = 0;
    entradas.forEach((original, i) => {
      const salida = r.valores[i];
      if (salida.startsWith("ES")) {
        es++;
        const bban = salida.slice(4);
        expect(bban.slice(8, 10), salida).toBe(
          controlDelCcc(bban.slice(0, 8), bban.slice(10)),
        );
      } else if (salida.startsWith("FR")) {
        fr++;
        const bban = salida.slice(4);
        expect(bban.slice(21), salida).toBe(
          String(
            claveDelRib(
              bban.slice(0, 5),
              bban.slice(5, 10),
              bban.slice(10, 21),
            ),
          ).padStart(2, "0"),
        );
      }
      // Sigue siendo un IBAN: la clave nacional no rompe el módulo 97.
      expect(cumpleIban(salida), salida).toBe(true);
      expect(original).not.toBe(salida);
    });
    expect(es).toBeGreaterThan(100);
    expect(fr).toBeGreaterThan(100);
  });

  it("IBAN: un valor sin forma de IBAN sale como un IBAN español sintético", async () => {
    const [salida] = (
      await seudonimizarConFormato(["no soy un iban"], llaveA, "iban")
    ).valores;
    expect(salida).toMatch(/^ES\d{22}$/);
    expect(cumpleIban(salida)).toBe(true);
  });

  it("DNI: 8 dígitos sin cero inicial y su letra; NIE: X, Y o Z, 7 dígitos y su letra", async () => {
    const r = await seudonimizarConFormato(entradasDe("dni"), llaveA, "dni");
    for (const v of r.valores) expect(v).toMatch(/^[1-9]\d{7}[A-Z]$/);
    const n = await seudonimizarConFormato(entradasDe("nie"), llaveA, "nie");
    for (const v of n.valores) expect(v).toMatch(/^[XYZ]\d{7}[A-Z]$/);
  });

  it("NIR: 15 dígitos, mes real y departamento posible", async () => {
    const r = await seudonimizarConFormato(entradasDe("nir"), llaveA, "nir");
    for (const v of r.valores) {
      expect(v).toMatch(/^[12]\d{14}$/);
      expect(Number(v.slice(3, 5))).toBeGreaterThanOrEqual(1);
      expect(Number(v.slice(3, 5))).toBeLessThanOrEqual(12);
      const depto = Number(v.slice(5, 7));
      expect(depto).toBeGreaterThanOrEqual(1);
      expect(depto).toBeLessThanOrEqual(95);
      expect(depto).not.toBe(20);
    }
  });

  it("codice fiscale: letra de mes de la norma y día 01–31 (41–71 en mujeres)", async () => {
    const r = await seudonimizarConFormato(
      entradasDe("codice-fiscale"),
      llaveA,
      "codice-fiscale",
    );
    for (const v of r.valores) {
      expect(v).toMatch(/^[A-Z]{6}\d{2}[ABCDEHLMPRST]\d{2}[A-Z]\d{3}[A-Z]$/);
      const dia = Number(v.slice(9, 11));
      expect((dia >= 1 && dia <= 31) || (dia >= 41 && dia <= 71)).toBe(true);
    }
  });

  it("Steuer-IdNr: 11 dígitos con la estructura del documento de ELSTER", async () => {
    const r = await seudonimizarConFormato(
      entradasDe("steuer-idnr"),
      llaveA,
      "steuer-idnr",
    );
    for (const v of r.valores) {
      expect(v).toMatch(/^[1-9]\d{10}$/);
      expect(estructuraDeSteuer([...v.slice(0, 10)].map(Number))).toBe(true);
    }
  });

  it("BSN: 9 dígitos, el primero distinto de 0; PESEL: 11 dígitos con una fecha que existe", async () => {
    const b = await seudonimizarConFormato(entradasDe("bsn"), llaveA, "bsn");
    for (const v of b.valores) expect(v).toMatch(/^[1-9]\d{8}$/);
    const p = await seudonimizarConFormato(
      entradasDe("pesel"),
      llaveA,
      "pesel",
    );
    for (const v of p.valores) {
      expect(v).toMatch(/^\d{11}$/);
      expect(fechaDelPesel([...v].map(Number))).not.toBeNull();
    }
  });
});

describe("los seudónimos europeos y la bóveda", () => {
  it("las colisiones se cuentan, no se esconden: dos valores distintos con el mismo seudónimo", async () => {
    // El PESEL tiene ~76·12·28·10⁴ ≈ 2,5×10⁸ combinaciones: con pocos valores no colisiona, y por
    // eso el conteo es exacto y se contrasta con el conjunto.
    const entradas = Array.from({ length: 3000 }, (_, i) => `persona-${i}`);
    const r = await seudonimizarConFormato(entradas, llaveA, "pesel");
    expect(r.colisiones).toBe(entradas.length - new Set(r.valores).size);
  });
});
