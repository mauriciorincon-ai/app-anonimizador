// Tests del generador del kit en sus formatos JSON.
//
// El generador es la ÚNICA fuente de datos de prueba de Velo (regla dura nº5), y desde el S6 sabe
// escribir JSON y JSON Lines. Estos tests miden lo que el kit promete a quien lo use:
//   · misma semilla ⇒ mismos bytes; otra semilla ⇒ otros bytes;
//   · lo que escribe es JSON válido según un lector INDEPENDIENTE (`JSON.parse`), no según el
//     lector propio del motor, que es justo lo que los fixtures deben poder poner a prueba;
//   · la forma canónica es compacta y de una línea por registro, para que la identidad del motor
//     sea byte-igual sobre el kit;
//   · cada perfil trae las rarezas para las que existe (anidado, listas, heterogeneidad), y el
//     oráculo (`esperadoPorRuta`) dice la verdad sobre ellas;
//   · un formato o un perfil desconocido es un ERROR, jamás un CSV en silencio.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  FORMATOS,
  PERFILES_SOLO_JSON,
  digitoVerificacionNit,
  esperadoPorColumna,
  esperadoPorRuta,
  generar,
  generarFilas,
  generarRegistros,
  listasEsperadas,
  serializarRegistro,
} from "../../docs/kit-de-prueba/generador.mjs";

const BASE = { seed: 42, tasaInvalida: 0.08, tasaVacia: 0.03 } as const;
const GENERADOR = join(process.cwd(), "docs", "kit-de-prueba", "generador.mjs");

type FormatoJson = "json" | "jsonl";

let carpeta = "";
let contador = 0;

beforeAll(() => {
  // `tmp/` está en .gitignore: aquí nunca queda nada que pueda commitearse.
  mkdirSync(join(process.cwd(), "tmp"), { recursive: true });
  carpeta = mkdtempSync(join(process.cwd(), "tmp", "generador-json-"));
});

afterAll(() => {
  rmSync(carpeta, { recursive: true, force: true });
});

async function escribirKit(
  formato: FormatoJson,
  perfil: string,
  filas: number,
  extra: { seed?: number; tasaInvalida?: number; tasaVacia?: number } = {},
) {
  const salida = join(carpeta, `kit-${contador++}.${formato}`);
  const { sha256 } = await generar({
    ...BASE,
    ...extra,
    perfil,
    filas,
    formato,
    salida,
  });
  const bytes = readFileSync(salida);
  return {
    salida,
    sha256: sha256 as string,
    bytes,
    texto: bytes.toString("utf8"),
  };
}

/** Los registros de un archivo, leídos con el lector de la plataforma (independiente del motor). */
function leerRegistros(formato: FormatoJson, texto: string): unknown[] {
  if (formato === "json") return JSON.parse(texto) as unknown[];
  return texto
    .split("\n")
    .filter((linea) => linea !== "")
    .map((linea) => JSON.parse(linea) as unknown);
}

// ── Un recorrido del JSON leído, independiente del generador ─────────────────────────────────

interface Nodo {
  registros: number;
  tipos: Set<string>;
}
interface Lista {
  registros: number;
  elementos: Set<string>;
  hijas: Set<string>;
}

function tipoJson(valor: unknown): string {
  if (valor === null) return "null";
  if (Array.isArray(valor)) return "array";
  return typeof valor;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function recorrer(registros: unknown[]) {
  const nodos = new Map<string, Nodo>();
  const listas = new Map<string, Lista>();

  const visitar = (valor: unknown, ruta: string) => {
    if (Array.isArray(valor)) {
      const clave = `${ruta}[]`;
      const lista = listas.get(clave) ?? {
        registros: 0,
        elementos: new Set<string>(),
        hijas: new Set<string>(),
      };
      listas.set(clave, lista);
      lista.registros++;
      for (const elemento of valor) {
        if (esObjeto(elemento)) {
          lista.elementos.add("objetos");
          for (const llave of Object.keys(elemento)) {
            lista.hijas.add(`${clave}.${llave}`);
          }
        } else lista.elementos.add("textos");
      }
      return;
    }
    const nodo = nodos.get(ruta) ?? { registros: 0, tipos: new Set<string>() };
    nodos.set(ruta, nodo);
    nodo.registros++;
    nodo.tipos.add(tipoJson(valor));
    if (esObjeto(valor)) {
      // `Object.entries` ve la clave `__proto__` que JSON.parse deja como propia.
      for (const [llave, hijo] of Object.entries(valor)) {
        visitar(hijo, ruta ? `${ruta}.${llave}` : llave);
      }
    }
  };

  for (const registro of registros) visitar(registro, "");
  nodos.delete("");
  return { nodos, listas };
}

function tiene(objeto: object, clave: string): boolean {
  return Object.prototype.hasOwnProperty.call(objeto, clave);
}

const sha256DeBytes = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

// ── serializarRegistro: la forma canónica ────────────────────────────────────────────────────

describe("serializarRegistro", () => {
  it("conserva el orden de inserción de CUALQUIER clave, incluidas las enteras y __proto__", () => {
    const registro = new Map<string, unknown>([
      ["2", "b"],
      ["1", "a"],
      ["__proto__", new Map([["x", 1]])],
      ["z", [true, null, "q"]],
    ]);
    expect(serializarRegistro(registro)).toBe(
      '{"2":"b","1":"a","__proto__":{"x":1},"z":[true,null,"q"]}',
    );
  });

  it("escapa las cadenas como JSON.stringify: la forma que el motor debe reproducir", () => {
    const texto = 'a"b\\c\nd é 👍';
    expect(serializarRegistro(texto)).toBe(JSON.stringify(texto));
  });

  it("se niega a escribir lo que JSON no puede representar", () => {
    expect(() => serializarRegistro(undefined)).toThrow();
    expect(() => serializarRegistro(Number.NaN)).toThrow();
    expect(() => serializarRegistro(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => serializarRegistro(() => 1)).toThrow();
    expect(() => serializarRegistro(BigInt(10))).toThrow();
  });
});

// ── Determinismo, validez y forma canónica, por perfil y por formato ────────────────────────

const PERFILES_A_PROBAR = ["anidado", "con-listas", "heterogeneo", "clinico"];
const FORMATOS_JSON: FormatoJson[] = ["json", "jsonl"];

describe.each(
  PERFILES_A_PROBAR.flatMap((p) => FORMATOS_JSON.map((f) => [p, f] as const)),
)("perfil %s en %s", (perfil, formato) => {
  const FILAS = 300;

  it("mismas banderas ⇒ mismos bytes; otra semilla ⇒ otros bytes", async () => {
    const una = await escribirKit(formato, perfil, FILAS);
    const otra = await escribirKit(formato, perfil, FILAS);
    expect(otra.bytes.equals(una.bytes)).toBe(true);
    expect(otra.sha256).toBe(una.sha256);
    // El hash que devuelve el escritor es el del archivo en disco, no el de otra cosa.
    expect(una.sha256).toBe(sha256DeBytes(una.bytes));

    const otraSemilla = await escribirKit(formato, perfil, FILAS, { seed: 43 });
    expect(otraSemilla.bytes.equals(una.bytes)).toBe(false);
  });

  it("es JSON válido para un lector independiente, con tantos registros como se pidieron", async () => {
    const { texto } = await escribirKit(formato, perfil, FILAS);
    const registros = leerRegistros(formato, texto);
    expect(registros).toHaveLength(FILAS);
    expect(registros.every(esObjeto)).toBe(true);
  });

  it("escribe la forma canónica: compacta, un registro por línea, exactamente el enmarcado prometido", async () => {
    const { texto } = await escribirKit(formato, perfil, FILAS);
    const lineas = [...generarRegistros({ ...BASE, perfil, filas: FILAS })].map(
      serializarRegistro,
    );
    const esperado =
      formato === "json"
        ? `[\n${lineas.join(",\n")}\n]\n`
        : lineas.map((l) => `${l}\n`).join("");
    // Un solo `toBe` sobre megabytes imprime un diff ilegible: se compara y se afirma el booleano.
    expect(texto === esperado).toBe(true);

    // Compacta: quitadas las cadenas, no queda un solo espacio ni salto dentro de un registro.
    for (const linea of lineas) {
      expect(linea.replace(/"(?:[^"\\]|\\.)*"/g, '""')).not.toMatch(/\s/);
      expect(linea).not.toContain("\n");
    }
    expect(texto.includes("\r")).toBe(false);
    expect(texto.charCodeAt(0)).not.toBe(0xfeff);
  });
});

describe("el enmarcado del arreglo y de JSON Lines", () => {
  it("el arreglo es «[», un registro por línea con coma salvo el último, «]» y un salto final", async () => {
    const { texto } = await escribirKit("json", "anidado", 5);
    const lineas = texto.split("\n");
    expect(lineas[0]).toBe("[");
    expect(lineas.at(-1)).toBe("");
    expect(lineas.at(-2)).toBe("]");
    const internas = lineas.slice(1, -2);
    expect(internas).toHaveLength(5);
    internas.forEach((linea, i) => {
      expect(linea.endsWith(",")).toBe(i < internas.length - 1);
    });
  });

  it("JSON Lines no lleva comas entre registros ni línea en blanco al final", async () => {
    const { texto } = await escribirKit("jsonl", "anidado", 5);
    expect(texto.endsWith("}\n")).toBe(true);
    expect(texto.endsWith("\n\n")).toBe(false);
    expect(texto.split("\n")).toHaveLength(6);
    texto
      .trimEnd()
      .split("\n")
      .forEach((linea) => {
        expect(linea.startsWith("{")).toBe(true);
        expect(linea.endsWith("}")).toBe(true);
      });
  });

  it("las dos formas llevan EXACTAMENTE los mismos registros", async () => {
    const arreglo = await escribirKit("json", "con-listas", 120);
    const lineas = await escribirKit("jsonl", "con-listas", 120);
    const internas = arreglo.texto
      .split("\n")
      .slice(1, -2)
      .map((linea) => linea.replace(/,$/, ""));
    expect(internas.join("\n") + "\n").toBe(lineas.texto);
  });

  it("escribir en bloques no altera un solo byte: pasa de 1 MB y coincide con armarlo en memoria", async () => {
    // 20 000 registros con listas ocupan varios MB: cruzan el umbral de 1 MB del escritor
    // muchas veces. Si un trozo se perdiera o se duplicara, esto lo vería.
    const filas = 20_000;
    for (const formato of FORMATOS_JSON) {
      const { bytes, texto, sha256 } = await escribirKit(
        formato,
        "con-listas",
        filas,
      );
      expect(bytes.length).toBeGreaterThan(5 * 1024 * 1024);
      const lineas: string[] = [];
      for (const registro of generarRegistros({
        ...BASE,
        perfil: "con-listas",
        filas,
      })) {
        lineas.push(serializarRegistro(registro));
      }
      const esperado =
        formato === "json"
          ? `[\n${lineas.join(",\n")}\n]\n`
          : lineas.map((l) => `${l}\n`).join("");
      expect(texto === esperado).toBe(true);
      expect(sha256).toBe(sha256DeBytes(bytes));
    }
  }, 60_000);

  it("el arreglo sin registros sigue siendo JSON válido (la fórmula del enmarcado, aplicada a cero)", async () => {
    const vacio = await escribirKit("json", "anidado", 0);
    expect(vacio.texto).toBe("[\n\n]\n");
    expect(JSON.parse(vacio.texto)).toEqual([]);
    const lineas = await escribirKit("jsonl", "anidado", 0);
    expect(lineas.texto).toBe("");
  });
});

// ── El oráculo dice la verdad sobre cada perfil ──────────────────────────────────────────────

describe.each(PERFILES_SOLO_JSON as string[])(
  "el oráculo del perfil %s",
  (perfil) => {
    const FILAS = 2_000;

    it("coincide con lo que el archivo trae: rutas, presencia y tipos de valor", async () => {
      const { texto } = await escribirKit("jsonl", perfil, FILAS);
      const { nodos, listas } = recorrer(leerRegistros("jsonl", texto));
      const esperado = esperadoPorRuta(perfil);

      for (const [ruta, e] of Object.entries(esperado)) {
        const nodo = nodos.get(ruta);
        expect(nodo, `la ruta ${ruta} debería existir`).toBeDefined();
        if (!nodo) continue;
        if (e.presencia === "siempre") {
          expect(nodo.registros, `${ruta} debería estar en todos`).toBe(FILAS);
        } else {
          expect(
            nodo.registros,
            `${ruta} debería estar en algunos`,
          ).toBeGreaterThan(0);
          expect(
            nodo.registros,
            `${ruta} debería faltar en algunos`,
          ).toBeLessThan(FILAS);
        }
        expect([...nodo.tipos].sort(), `tipos de ${ruta}`).toEqual(
          [...e.tipos].sort(),
        );
        expect(e.trampa).toBeNull();
        expect(typeof e.tipo).toBe("string");
        expect(typeof e.categoria).toBe("string");
      }

      // Nada sin declarar: lo único que puede sobrar son contenedores que son SOLO objetos.
      const sobrantes = [...nodos]
        .filter(
          ([ruta, nodo]) =>
            !tiene(esperado, ruta) &&
            [...nodo.tipos].some((t) => t !== "object"),
        )
        .map(([ruta]) => ruta);
      expect(sobrantes).toEqual([]);

      // Las listas: las que el oráculo declara, ni una más ni una menos.
      const declaradas = listasEsperadas(perfil);
      expect([...listas.keys()].sort()).toEqual(
        declaradas.map((l) => l.ruta).sort(),
      );
      for (const declarada of declaradas) {
        const vista = listas.get(declarada.ruta);
        expect(vista).toBeDefined();
        expect([...(vista?.hijas ?? [])].sort()).toEqual(
          [...declarada.rutasHijas].sort(),
        );
        expect(vista?.elementos.has(declarada.elementos)).toBe(true);
      }
    });

    it("esperadoPorColumna entrega el mismo oráculo y no comparte estado con quien lo pide", () => {
      expect(esperadoPorColumna(perfil)).toEqual(esperadoPorRuta(perfil));
      const una = esperadoPorRuta(perfil);
      const primera = Object.keys(una)[0];
      una[primera].tipos.push("inventado");
      expect(esperadoPorRuta(perfil)[primera].tipos).not.toContain("inventado");
    });
  },
);

describe("el oráculo de los perfiles planos no cambió", () => {
  it("clinico sigue declarando sus 24 columnas y la trampa del código interno", () => {
    const esperado = esperadoPorColumna("clinico");
    expect(Object.keys(esperado)).toHaveLength(24);
    expect(esperado.codigo_interno.trampa).toEqual(expect.any(String));
    expect(esperado.cedula_titular).toEqual({
      tipo: "cedula",
      categoria: "identificador-directo",
      trampa: null,
    });
  });

  it("un perfil que no existe es un error, también en el oráculo", () => {
    expect(() => esperadoPorColumna("no-existe")).toThrow(/perfil desconocido/);
  });

  it("los perfiles planos no declaran listas", () => {
    expect(listasEsperadas("clinico")).toEqual([]);
    expect(listasEsperadas("anidado")).toEqual([]);
  });
});

// ── Las formas de cada perfil ────────────────────────────────────────────────────────────────

describe("perfil anidado", () => {
  it("anida objetos, con el orden de claves fijo en todos los registros", async () => {
    const { texto } = await escribirKit("jsonl", "anidado", 200);
    const registros = leerRegistros("jsonl", texto) as Record<
      string,
      unknown
    >[];
    for (const registro of registros) {
      expect(Object.keys(registro)).toEqual([
        "paciente",
        "ubicacion",
        "empleador",
        "atencion",
      ]);
      const paciente = registro.paciente as Record<string, unknown>;
      expect(Object.keys(paciente)).toEqual([
        "documento",
        "nombre",
        "nacimiento",
        "contacto",
      ]);
      expect(esObjeto(paciente.contacto)).toBe(true);
      expect(Object.keys(paciente.contacto as object)).toEqual([
        "correo",
        "celular",
      ]);
      expect(Object.keys(registro.ubicacion as object)).toEqual([
        "ciudad",
        "direccion",
      ]);
      expect(Object.keys(registro.atencion as object)).toEqual([
        "fecha",
        "diagnostico",
        "edad",
      ]);
    }
  });

  it("la edad es un número JSON (o null si la hoja salió vacía), no un texto", async () => {
    const { texto } = await escribirKit("jsonl", "anidado", 500);
    const edades = (
      leerRegistros("jsonl", texto) as { atencion: { edad: unknown } }[]
    ).map((r) => r.atencion.edad);
    expect(edades.every((e) => e === null || typeof e === "number")).toBe(true);
    expect(edades.some((e) => typeof e === "number")).toBe(true);
  });

  it("trae casos FUERA de rango a propósito: cédulas imposibles, NIT con DV falso, celulares rotos", async () => {
    const { texto } = await escribirKit("jsonl", "anidado", 2_000);
    const registros = leerRegistros("jsonl", texto) as {
      paciente: { documento: string; contacto: { celular: string } };
      empleador: { nit: string };
    }[];

    // Cédula válida: 7 a 10 dígitos sin ceros a la izquierda (el kit emite 1.000.000–79.999.999
    // o 10 dígitos). Las imposibles del kit: "0", "99", "1", 12 dígitos y una con letra.
    const cedulas = registros
      .map((r) => r.paciente.documento)
      .filter((c) => c !== "");
    expect(cedulas.some((c) => /^[1-9]\d{6,9}$/.test(c))).toBe(true);
    expect(cedulas.some((c) => !/^[1-9]\d{6,9}$/.test(c))).toBe(true);

    const nits = registros.map((r) => r.empleador.nit).filter((n) => n !== "");
    const dvCorrecto = (nit: string) => {
      const [base, dv] = nit.replaceAll(".", "").split("-");
      return Number(dv) === digitoVerificacionNit(base);
    };
    expect(nits.some(dvCorrecto)).toBe(true);
    expect(nits.some((n) => !dvCorrecto(n))).toBe(true);

    const celulares = registros
      .map((r) => r.paciente.contacto.celular)
      .filter((c) => c !== "");
    const celularValido = (c: string) =>
      /^(\+57 )?3\d{2}[ ]?\d{3}[ ]?\d{4}$/.test(c);
    expect(celulares.some(celularValido)).toBe(true);
    expect(celulares.some((c) => !celularValido(c))).toBe(true);
  });

  it("sin tasas, no hay valores rotos ni hojas vacías", async () => {
    const { texto } = await escribirKit("jsonl", "anidado", 300, {
      tasaInvalida: 0,
      tasaVacia: 0,
    });
    expect(texto).not.toContain('""');
    expect(texto).not.toContain("null");
  });
});

describe("perfil con-listas", () => {
  it("trae contactos[] (objetos con correo) y etiquetas[] (cadenas), con listas vacías y llenas", async () => {
    const { texto } = await escribirKit("jsonl", "con-listas", 500);
    const registros = leerRegistros("jsonl", texto) as {
      contactos: { correo: string; parentesco: string }[];
      etiquetas: string[];
    }[];
    expect(
      registros.every(
        (r) => Array.isArray(r.contactos) && Array.isArray(r.etiquetas),
      ),
    ).toBe(true);
    expect(registros.some((r) => r.contactos.length === 0)).toBe(true);
    expect(registros.some((r) => r.contactos.length > 0)).toBe(true);
    expect(registros.some((r) => r.etiquetas.length === 0)).toBe(true);
    expect(registros.some((r) => r.etiquetas.length > 0)).toBe(true);
    for (const registro of registros) {
      for (const contacto of registro.contactos) {
        expect(Object.keys(contacto)).toEqual(["correo", "parentesco"]);
        expect(typeof contacto.correo).toBe("string");
      }
      expect(registro.etiquetas.every((e) => typeof e === "string")).toBe(true);
    }
    // Los correos de las listas SON datos personales que Velo no trata: tienen que existir.
    expect(
      registros.some((r) =>
        r.contactos.some((c) => /^[^@\s]+@[^@\s]+$/.test(c.correo)),
      ),
    ).toBe(true);
  });

  it("empieza por el mismo bloque que anidado: las listas se añaden al final", async () => {
    const { texto } = await escribirKit("jsonl", "con-listas", 50);
    for (const registro of leerRegistros("jsonl", texto) as Record<
      string,
      unknown
    >[]) {
      expect(Object.keys(registro)).toEqual([
        "paciente",
        "ubicacion",
        "empleador",
        "atencion",
        "contactos",
        "etiquetas",
      ]);
    }
  });
});

describe("perfil heterogeneo", () => {
  const FILAS = 500;

  it("a veces falta la clave, y el kit distingue ausente de null de «»", async () => {
    const { texto } = await escribirKit("jsonl", "heterogeneo", FILAS);
    const registros = leerRegistros("jsonl", texto) as {
      paciente: Record<string, unknown>;
      [clave: string]: unknown;
    }[];

    const celulares = registros.map((r) =>
      tiene(r.paciente, "celular") ? r.paciente.celular : "AUSENTE",
    );
    expect(celulares).toContain("AUSENTE");
    expect(celulares).toContain(null);
    expect(celulares).toContain("");
    expect(
      celulares.some(
        (c) => typeof c === "string" && c !== "" && c !== "AUSENTE",
      ),
    ).toBe(true);

    for (const clave of ["ciudad", "empleador", "observacion"]) {
      const con = registros.filter((r) => tiene(r, clave)).length;
      expect(
        con,
        `${clave} debe faltar en algunos y estar en otros`,
      ).toBeGreaterThan(0);
      expect(con).toBeLessThan(FILAS);
    }
  });

  it("paciente.contacto es texto en unos registros y objeto en otros", async () => {
    const { texto } = await escribirKit("jsonl", "heterogeneo", FILAS);
    const contactos = (
      leerRegistros("jsonl", texto) as { paciente: { contacto: unknown } }[]
    ).map((r) => r.paciente.contacto);
    expect(contactos.some((c) => typeof c === "string")).toBe(true);
    expect(contactos.some((c) => esObjeto(c))).toBe(true);
    expect(contactos.every((c) => typeof c === "string" || esObjeto(c))).toBe(
      true,
    );
  });

  it("mezcla tipos en un mismo camino: documento y edad", async () => {
    const { texto } = await escribirKit("jsonl", "heterogeneo", FILAS);
    const pacientes = (
      leerRegistros("jsonl", texto) as { paciente: Record<string, unknown> }[]
    ).map((r) => r.paciente);
    const tiposDeDocumento = new Set(pacientes.map((p) => typeof p.documento));
    expect([...tiposDeDocumento].sort()).toEqual(["number", "string"]);
    const tiposDeEdad = new Set(pacientes.map((p) => tipoJson(p.edad)));
    expect([...tiposDeEdad].sort()).toEqual(["null", "number", "string"]);
  });

  it("escribe números mayores que 2^53 COMO NÚMERO y con todos sus dígitos", async () => {
    const { texto } = await escribirKit("jsonl", "heterogeneo", FILAS);
    const serieles = [...texto.matchAll(/"serial":(\d+),/g)].map((m) => m[1]);
    expect(serieles).toHaveLength(FILAS);
    // Los dos primeros son fijos para que un test pueda buscarlos por texto.
    expect(serieles[0]).toBe("12345678901234567");
    expect(serieles[1]).toBe("12345678901234567890");
    for (const literal of serieles) {
      expect(BigInt(literal) > BigInt(2) ** BigInt(53)).toBe(true);
    }
    expect(serieles.some((s) => s.length === 17)).toBe(true);
    expect(serieles.some((s) => s.length === 20)).toBe(true);
    // Y un lector de JavaScript los redondea: por eso el motor no puede usar JSON.parse.
    expect(String(JSON.parse(`{"n":${serieles[0]}}`).n)).not.toBe(serieles[0]);
    // Ninguno entre comillas: es un número, no un texto.
    expect(texto).not.toContain('"serial":"');
  });

  it("escribe los números como fueron escritos: exponente, ceros finales, cero negativo", async () => {
    const { texto } = await escribirKit("jsonl", "heterogeneo", FILAS);
    const lecturas = new Set(
      [...texto.matchAll(/"lectura":([^,}]+)/g)].map((m) => m[1]),
    );
    for (const literal of ["1E3", "2.50", "1.5e-3", "-0.0", "0.10"]) {
      expect(lecturas, `falta ${literal}`).toContain(literal);
    }
    // Todas son números JSON válidos (si no, JSON.parse del archivo ya habría fallado).
    expect(lecturas.size).toBeGreaterThan(4);
  });

  it("lleva la clave __proto__ como clave de datos, con hijos, en todos los registros", async () => {
    const { texto } = await escribirKit("jsonl", "heterogeneo", FILAS);
    expect(texto.split('"__proto__":{').length - 1).toBe(FILAS);
    for (const registro of leerRegistros("jsonl", texto)) {
      // JSON.parse la deja como propiedad PROPIA, no como prototipo.
      expect(tiene(registro as object, "__proto__")).toBe(true);
      expect(Object.getPrototypeOf(registro)).toBe(Object.prototype);
    }
  });

  it("escribe las claves enteras en el orden del archivo: «2» antes que «1»", async () => {
    const { texto } = await escribirKit("jsonl", "heterogeneo", FILAS);
    const enOrden = [
      ...texto.matchAll(/"referencias":\{"2":"[^"]*","1":"[^"]*"\}/g),
    ];
    expect(enOrden).toHaveLength(FILAS);
    // Un objeto de JavaScript las reordenaría: el kit tiene que escribirlas a mano.
    const primero = leerRegistros("jsonl", texto)[0] as { referencias: object };
    expect(Object.keys(primero.referencias)).toEqual(["1", "2"]);
  });

  it("trae textos con comillas, barra invertida, salto de línea y un carácter fuera del plano básico", async () => {
    const { texto } = await escribirKit("jsonl", "heterogeneo", FILAS);
    const observaciones = (
      leerRegistros("jsonl", texto) as { observacion?: string }[]
    )
      .map((r) => r.observacion)
      .filter((o): o is string => o !== undefined);
    expect(observaciones.some((o) => o.includes('"'))).toBe(true);
    expect(observaciones.some((o) => o.includes("\\"))).toBe(true);
    expect(observaciones.some((o) => o.includes("\n"))).toBe(true);
    expect(
      observaciones.some(
        (o) =>
          /\p{Extended_Pictographic}/u.test(o) && o.length !== [...o].length,
      ),
    ).toBe(true);
    // El salto de línea está ESCAPADO: un registro sigue ocupando una sola línea.
    expect(texto.trimEnd().split("\n")).toHaveLength(FILAS);
  });
});

// ── Los perfiles planos, escritos como JSON ──────────────────────────────────────────────────

describe("perfiles planos en JSON", () => {
  it("llevan el MISMO dato que su CSV con la misma semilla; las columnas numéricas, como número", async () => {
    const filas = 300;
    const origen = [...generarFilas({ ...BASE, perfil: "clinico", filas })];
    const columnas = origen[0] as string[];
    const cuerpo = origen.slice(1) as string[][];
    const registros = [
      ...generarRegistros({ ...BASE, perfil: "clinico", filas }),
    ];
    expect(registros).toHaveLength(filas);

    const numericas = new Set(["estrato", "monto", "latitud", "longitud"]);
    registros.forEach((registro, i) => {
      expect([...registro.keys()]).toEqual(columnas);
      columnas.forEach((columna, j) => {
        const celda = cuerpo[i][j];
        const valor = registro.get(columna);
        if (numericas.has(columna)) {
          // Número JSON con el texto exacto de la celda (ceros finales incluidos); vacío ⇒ null.
          expect(serializarRegistro(valor)).toBe(celda === "" ? "null" : celda);
        } else {
          expect(valor).toBe(celda);
        }
      });
    });
  });

  it("en el archivo, estrato y monto son números, y las trampas siguen siendo texto", async () => {
    const { texto } = await escribirKit("jsonl", "clinico", 400);
    const registros = leerRegistros("jsonl", texto) as Record<
      string,
      unknown
    >[];
    expect(
      registros.every(
        (r) => r.estrato === null || typeof r.estrato === "number",
      ),
    ).toBe(true);
    expect(
      registros.every((r) => r.monto === null || typeof r.monto === "number"),
    ).toBe(true);
    expect(registros.some((r) => typeof r.monto === "number")).toBe(true);
    // Un código interno o una referencia de pago NO son cantidades: siguen siendo texto.
    expect(registros.every((r) => typeof r.codigo_interno === "string")).toBe(
      true,
    );
    expect(registros.every((r) => typeof r.referencia_pago === "string")).toBe(
      true,
    );
    // Las coordenadas conservan sus ceros finales (texto exacto del número).
    expect(/"latitud":-?\d+\.\d{6}[,}]/.test(texto)).toBe(true);
  });

  it("mediana-repetida: las dos columnas sesgadas salen como número", async () => {
    const { texto } = await escribirKit("json", "mediana-repetida", 300);
    const registros = leerRegistros("json", texto) as Record<string, unknown>[];
    expect(
      registros.every(
        (r) =>
          r.edad_reportada === null || typeof r.edad_reportada === "number",
      ),
    ).toBe(true);
    expect(
      registros.every(
        (r) =>
          r.puntaje_triage === null || typeof r.puntaje_triage === "number",
      ),
    ).toBe(true);
    expect(
      registros.filter((r) => r.edad_reportada === 40).length,
    ).toBeGreaterThan(100);
  });
});

// ── Un formato o un perfil desconocido es un error, jamás un CSV en silencio ─────────────────

describe("la puerta única del kit rechaza lo que no entiende", () => {
  const salida = () => join(carpeta, `rechazo-${contador++}.out`);

  it("lista los formatos que sabe escribir", () => {
    expect([...FORMATOS]).toEqual(["csv", "xlsx", "json", "jsonl"]);
    expect([...PERFILES_SOLO_JSON].sort()).toEqual([
      "anidado",
      "con-listas",
      "heterogeneo",
    ]);
  });

  it("un formato desconocido es un error y no deja ningún archivo", async () => {
    for (const formato of ["yaml", "JSON", "ndjson", "txt", ""]) {
      const destino = salida();
      await expect(
        generar({
          ...BASE,
          perfil: "clinico",
          filas: 5,
          formato,
          salida: destino,
        }),
      ).rejects.toThrow(/formato desconocido/);
      expect(existsSync(destino), `«${formato}» no debe crear archivo`).toBe(
        false,
      );
    }
  });

  it("un perfil desconocido es un error y no deja ningún archivo", async () => {
    for (const formato of ["csv", "json", "jsonl", "xlsx"]) {
      const destino = salida();
      await expect(
        generar({
          ...BASE,
          perfil: "no-existe",
          filas: 5,
          formato,
          salida: destino,
        }),
      ).rejects.toThrow(/perfil desconocido/);
      expect(existsSync(destino)).toBe(false);
    }
  });

  it("un perfil que solo existe en JSON no se escribe como CSV ni como Excel", async () => {
    for (const perfil of PERFILES_SOLO_JSON as string[]) {
      for (const formato of ["csv", "xlsx"]) {
        const destino = salida();
        await expect(
          generar({ ...BASE, perfil, filas: 5, formato, salida: destino }),
        ).rejects.toThrow(/solo existe en los formatos json y jsonl/);
        expect(existsSync(destino)).toBe(false);
      }
    }
  });

  it("un número de filas que no es un entero no negativo es un error", async () => {
    for (const filas of [-1, 1.5, Number.NaN, undefined]) {
      await expect(
        generar({
          ...BASE,
          perfil: "anidado",
          filas,
          formato: "json",
          salida: salida(),
        }),
      ).rejects.toThrow(/filas/);
    }
  });

  it("sin formato, el kit sigue escribiendo CSV (el comportamiento de siempre)", async () => {
    const destino = salida();
    const { sha256 } = await generar({
      ...BASE,
      perfil: "limpio",
      filas: 10,
      salida: destino,
    });
    const texto = readFileSync(destino, "utf8");
    expect(texto.startsWith("sucursal,monto,fecha_atencion,estrato\n")).toBe(
      true,
    );
    expect(sha256).toBe(sha256DeBytes(readFileSync(destino)));
  });
});

describe("la CLI", () => {
  function correr(argumentos: string[]) {
    return spawnSync(process.execPath, [GENERADOR, ...argumentos], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
  }

  it("--formato jsonl escribe el archivo y anuncia el sha-256 del archivo real", () => {
    const destino = join(carpeta, "cli.jsonl");
    const resultado = correr([
      "--perfil",
      "anidado",
      "--formato",
      "jsonl",
      "--filas",
      "25",
      "--seed",
      "42",
      "--salida",
      destino,
    ]);
    expect(resultado.status).toBe(0);
    expect(resultado.stdout).toContain("25 registros");
    const anunciado = /sha-256 : ([0-9a-f]{64})/.exec(resultado.stdout)?.[1];
    expect(anunciado).toBe(sha256DeBytes(readFileSync(destino)));
  });

  it("--formato json con el perfil por omisión (clinico) escribe un arreglo", () => {
    const destino = join(carpeta, "cli.json");
    const resultado = correr([
      "--formato",
      "json",
      "--filas",
      "10",
      "--salida",
      destino,
    ]);
    expect(resultado.status).toBe(0);
    expect(JSON.parse(readFileSync(destino, "utf8"))).toHaveLength(10);
  });

  it("un formato desconocido termina con código 1, lo dice en stderr y no escribe nada", () => {
    const destino = join(carpeta, "cli-yaml.out");
    const resultado = correr([
      "--formato",
      "yaml",
      "--filas",
      "5",
      "--salida",
      destino,
    ]);
    expect(resultado.status).toBe(1);
    expect(resultado.stderr).toContain("formato desconocido");
    expect(existsSync(destino)).toBe(false);
  });

  it("un perfil solo-JSON pedido como CSV termina con código 1", () => {
    const destino = join(carpeta, "cli-anidado.csv");
    const resultado = correr([
      "--perfil",
      "anidado",
      "--filas",
      "5",
      "--salida",
      destino,
    ]);
    expect(resultado.status).toBe(1);
    expect(resultado.stderr).toContain("solo existe");
    expect(existsSync(destino)).toBe(false);
  });
});
