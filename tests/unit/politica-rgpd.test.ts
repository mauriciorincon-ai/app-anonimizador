// La política de fábrica del RGPD (S8, ADR-016), de punta a punta sobre un archivo europeo sintético:
// el clasificador lee las columnas, la política decide, el motor transforma y el certificado dice
// «seudonimizado» —jamás «anónimo»— con la fuente y la fecha de cada artículo.

import { beforeAll, describe, expect, it } from "vitest";

import { generarFilas } from "../../docs/kit-de-prueba/generador.mjs";
import { balanceDelTratamiento } from "@/engine/balance";
import { clasificar, type Diagnostico } from "@/engine/clasificador";
import { ConstructorColumnar, type TablaColumnar } from "@/engine/columnar";
import {
  exportarPolitica,
  FORMATOS_DE_SEUDONIMO,
  hashDePolitica,
  importarPolitica,
  politicaSchema,
  requiereBoveda,
  requiereLlave,
  type Politica,
} from "@/engine/politica";
import {
  construirPolitica,
  CONSULTA_RGPD,
  informeDelRgpd,
  POLITICAS_DE_FABRICA,
  resumenDeCobertura,
  RGPD,
} from "@/engine/politicas-de-fabrica";
import { construirReporte, type DatosDelReporte } from "@/engine/reporte";
import { evaluarRiesgo } from "@/engine/riesgo";
import { aplicarPolitica } from "@/engine/tecnicas";
import { medirUtilidad } from "@/engine/utilidad";
import {
  cumpleBsn,
  cumpleCodiceFiscale,
  cumpleDni,
  cumpleNie,
  cumpleNir,
  cumplePesel,
  cumpleSteuerIdNr,
  VALIDADORES,
} from "@/engine/validadores";
import { cumpleIban } from "@/engine/validadores/universales";
import { decirMensaje } from "@/lib/idioma/mensajes";

const FILAS = 800;

function tablaEuropea(): TablaColumnar {
  const todas = [
    ...generarFilas({
      filas: FILAS,
      seed: 42,
      perfil: "europeo",
      tasaInvalida: 0.02,
      tasaVacia: 0,
    }),
  ];
  const [encabezado, ...cuerpo] = todas;
  const constructor = new ConstructorColumnar(encabezado, FILAS);
  for (const fila of cuerpo) constructor.agregarFila(fila);
  return constructor.finalizar();
}

function valoresDe(tabla: TablaColumnar, nombre: string): string[] {
  const columna = tabla.columnas.find((c) => c.nombre === nombre)!;
  return [...columna.codigos].map((codigo) => columna.valores[codigo]);
}

let tabla: TablaColumnar;
let diagnostico: Diagnostico;
let politica: Politica;
let llave: CryptoKey;

beforeAll(async () => {
  tabla = tablaEuropea();
  diagnostico = clasificar(tabla);
  politica = construirPolitica(
    RGPD,
    diagnostico.columnas.map((c) => ({
      nombre: c.nombre,
      tipo: c.tipo,
      categoria: c.categoria,
    })),
  );
  llave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("llave-del-proyecto-a".padEnd(32, ".")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
});

const tecnicaDe = (columna: string) =>
  politica.reglas.find((r) => r.columna === columna)!.tecnica;

describe("la política RGPD de fábrica", () => {
  it("es la tercera de fábrica, con k = 5 que el usuario puede cambiar", () => {
    expect(POLITICAS_DE_FABRICA.map((p) => p.id)).toEqual([
      "habeas-data",
      "hipaa",
      "rgpd",
    ]);
    expect(politica.origen).toBe("rgpd");
    expect(politica.kObjetivo).toBe(5);
  });

  it("cada identificador nacional pasa a un seudónimo con SU formato, reversible con bóveda", () => {
    const formatoDe = {
      iban_es: "iban",
      dni_es: "dni",
      nie_es: "nie",
      nir_fr: "nir",
      codice_fiscale_it: "codice-fiscale",
      steuer_id_de: "steuer-idnr",
      bsn_nl: "bsn",
      pesel_pl: "pesel",
    } as const;
    for (const [columna, formato] of Object.entries(formatoDe)) {
      expect(tecnicaDe(columna), columna).toEqual({
        tipo: "seudonimizar-con-formato",
        formato,
        reversible: true,
      });
    }
    expect(requiereLlave(politica)).toBe(true);
    expect(requiereBoveda(politica)).toBe(true);
  });

  it("correo y nombre, que no tienen formato, van a un seudónimo hexadecimal reversible", () => {
    expect(tecnicaDe("correo")).toEqual({
      tipo: "seudonimizar",
      longitud: 16,
      reversible: true,
    });
    expect(tecnicaDe("nombre_completo")).toEqual({
      tipo: "seudonimizar",
      longitud: 16,
      reversible: true,
    });
  });

  it("las categorías especiales (art. 9) y las condenas (art. 10) se SUPRIMEN", () => {
    expect(tecnicaDe("diagnose")).toEqual({ tipo: "suprimir" });
    expect(tecnicaDe("casier_judiciaire")).toEqual({ tipo: "suprimir" });
  });

  it("los cuasi-identificadores se generalizan hasta el k, aunque tengan regla por tipo", () => {
    for (const columna of [
      "geburtsdatum",
      "code_postal",
      "geschlecht",
      "nationalite",
    ]) {
      expect(tecnicaDe(columna).tipo, columna).toBe("generalizar-automatico");
    }
  });

  it("lo no personal se conserva o se recorta, nunca se seudonimiza", () => {
    expect(tecnicaDe("monto")).toEqual({ tipo: "conservar" });
    expect(tecnicaDe("fecha_atencion")).toEqual({
      tipo: "generalizar-fecha",
      precision: "mes",
    });
  });

  it("todos los formatos de seudónimo de la lista única están cubiertos por un validador o por Colombia", () => {
    const europeos = FORMATOS_DE_SEUDONIMO.filter(
      (f) => f !== "cedula" && f !== "nit",
    );
    const tipos = new Set(VALIDADORES.map((v) => v.id as string));
    for (const formato of europeos)
      expect(tipos.has(formato), formato).toBe(true);
  });

  it("sobrevive la ida y vuelta por archivo con el mismo hash", () => {
    const texto = exportarPolitica(politica);
    const vuelta = importarPolitica(texto);
    expect(vuelta.ok).toBe(true);
    if (!vuelta.ok) return;
    expect(hashDePolitica(vuelta.politica)).toBe(hashDePolitica(politica));
    expect(politicaSchema.safeParse(vuelta.politica).success).toBe(true);
  });
});

describe("cada línea de la cobertura cita su artículo, su fuente y su fecha", () => {
  const citadas = RGPD.cobertura.filter((c) => c.articulo);

  it("las líneas con artículo traen fuente en los dos idiomas y la fecha de consulta", () => {
    expect(citadas.length).toBeGreaterThanOrEqual(5);
    for (const linea of citadas) {
      expect(linea.consultada, linea.referencia).toBe(CONSULTA_RGPD);
      expect(CONSULTA_RGPD).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(decirMensaje(linea.fuente!, "es")).toMatch(/DO L 119, 4\.5\.2016/);
      expect(decirMensaje(linea.fuente!, "en")).toMatch(/DO L 119, 4\.5\.2016/);
    }
  });

  it("los artículos son los que la política dice usar: 4.1, 9 y 10", () => {
    expect(new Set(citadas.map((c) => c.articulo))).toEqual(
      new Set(["art. 4.1", "art. 9", "art. 10"]),
    );
  });

  it("los tipos que dice reconocer por contenido existen como validador", () => {
    const ids = new Set(VALIDADORES.map((v) => v.id as string));
    for (const linea of RGPD.cobertura) {
      if (linea.deteccion.via !== "validador") continue;
      for (const tipo of linea.deteccion.tipos)
        expect(ids.has(tipo), tipo).toBe(true);
    }
  });

  it("el resumen cuenta lo que Velo reconoce y lo que no", () => {
    expect(resumenDeCobertura(RGPD)).toEqual({
      automaticos: 2,
      porNombre: 3,
      manuales: 1,
      total: 6,
    });
  });

  it("la advertencia dice que NO es una certificación y que seudonimizar no es anonimizar", () => {
    const es = decirMensaje(RGPD.advertencia, "es");
    const en = decirMensaje(RGPD.advertencia, "en");
    expect(es).toMatch(/No es una certificación/);
    expect(es).toMatch(/Seudonimizar no es anonimizar/);
    expect(es).toMatch(/considerando 26/);
    expect(es).toMatch(/el RGPD no fija ningún k/);
    expect(en).toMatch(/not a certification of compliance/);
    expect(en).toMatch(/Pseudonymising is not anonymising/);
    expect(en).toMatch(/recital 26/);
    expect(en).toMatch(/the GDPR sets no k/);
  });
});

describe("la política aplicada al archivo", () => {
  async function aplicar() {
    return aplicarPolitica(tabla, politica, llave, "es");
  }

  it("suprime las columnas del art. 9 y del art. 10 y las deja fuera del archivo", async () => {
    const r = await aplicar();
    expect(r.suprimidas).toEqual(["diagnose", "casier_judiciaire"]);
    const nombres = r.tabla.columnas.map((c) => c.nombre);
    expect(nombres).not.toContain("diagnose");
    expect(nombres).not.toContain("casier_judiciaire");
  });

  it("los seudónimos pasan el control oficial de su país y no son el dato original", async () => {
    const r = await aplicar();
    const control = {
      iban_es: cumpleIban,
      dni_es: cumpleDni,
      nie_es: cumpleNie,
      nir_fr: cumpleNir,
      codice_fiscale_it: cumpleCodiceFiscale,
      steuer_id_de: cumpleSteuerIdNr,
      bsn_nl: cumpleBsn,
      pesel_pl: cumplePesel,
    } as const;
    for (const [columna, cumple] of Object.entries(control)) {
      const originales = valoresDe(tabla, columna);
      const salidas = valoresDe(r.tabla, columna);
      expect(
        salidas.filter((v) => v !== "" && !cumple(v)),
        columna,
      ).toEqual([]);
      expect(
        salidas.filter((v, i) => v !== "" && v === originales[i]),
        columna,
      ).toEqual([]);
    }
  });

  it("guarda la correspondencia de cada columna reversible para la bóveda", async () => {
    const r = await aplicar();
    const columnas = new Set(r.correspondencias.map((c) => c.columna));
    for (const columna of [
      "iban_es",
      "dni_es",
      "pesel_pl",
      "correo",
      "nombre_completo",
    ]) {
      expect(columnas.has(columna), columna).toBe(true);
    }
  });

  it("mismo archivo, política, llave e idioma: los mismos bytes", async () => {
    const a = await aplicar();
    const b = await aplicar();
    for (const columna of a.tabla.columnas) {
      expect(valoresDe(b.tabla, columna.nombre)).toEqual(
        valoresDe(a.tabla, columna.nombre),
      );
    }
  });
});

describe("el certificado del RGPD dice «seudonimizado» y nunca «anónimo»", () => {
  async function certificado(
    idioma: "es" | "en",
    politicaAplicada: Politica = politica,
  ) {
    const r = await aplicarPolitica(tabla, politicaAplicada, llave, idioma);
    const { riesgo, advisor } = evaluarRiesgo(tabla, diagnostico);
    const balance = balanceDelTratamiento({
      tablaOriginal: tabla,
      tablaTransformada: r.tabla,
      diagnostico,
      politica: politicaAplicada,
      pendientesDeMondrian: r.pendientesDeMondrian,
      suprimidas: r.suprimidas,
      colisiones: r.colisiones,
      mondrian: r.mondrian,
      diversidad: [],
    });
    const datos: DatosDelReporte = {
      archivo: {
        nombre: "europeo.csv",
        bytes: 100_000,
        sha256: "a".repeat(64),
      },
      diagnostico,
      riesgo,
      advisor,
      fecha: "2 de noviembre de 2026",
      idioma,
      tratamiento: {
        balance,
        utilidad: medirUtilidad(tabla, r.tabla),
        hashDePolitica: hashDePolitica(politicaAplicada),
        idiomaDelTrabajo: idioma,
        suprimidas: r.suprimidas,
        sha256DeSalida: "b".repeat(64),
        nombreDeSalida: "velo-anonimizado-abc12345.csv",
        rgpd: informeDelRgpd(politicaAplicada, r.suprimidas),
      },
    };
    return construirReporte(datos);
  }

  it("en español: seudonimizado (art. 4.5), generalizado, suprimido y lo que NO afirma", async () => {
    const html = await certificado("es");
    expect(html).toContain("Seudonimizado (art. 4.5 RGPD)");
    expect(html).toContain(
      "sigue siendo dato personal para quien tenga la llave y la bóveda",
    );
    expect(html).toContain("<h2>Seudonimizado, no anónimo</h2>");
    expect(html).toContain("<b>Generalizado.</b>");
    expect(html).toContain("<b>Suprimido.</b>");
    expect(html).toContain("No declara este archivo anónimo");
    expect(html).toContain("considerando 26");
    expect(html).toContain(`consultado el ${CONSULTA_RGPD}`);
    expect(html).toContain("<code>dni_es</code>");
    expect(html).toContain("<code>geburtsdatum</code>");
  });

  it("en inglés: pseudonymised (art. 4(5)), generalized, removed y lo que NO afirma", async () => {
    const html = await certificado("en");
    expect(html).toContain("Pseudonymised (GDPR art. 4(5))");
    expect(html).toContain(
      "still personal data for whoever holds the key and the vault",
    );
    expect(html).toContain("<h2>Pseudonymised, not anonymous</h2>");
    expect(html).toContain("It does not declare this file anonymous");
    expect(html).toContain("recital 26");
    expect(html).toContain(`consulted on ${CONSULTA_RGPD}`);
  });

  it("jamás afirma que el archivo es anónimo «según el RGPD» ni que cumple el reglamento", async () => {
    for (const idioma of ["es", "en"] as const) {
      const html = await certificado(idioma);
      expect(html, idioma).not.toMatch(
        /an[oó]nim\w*\s+(seg[uú]n|conforme\s+(a|al|con)|bajo)\s+(el\s+)?(RGPD|GDPR)/i,
      );
      expect(html, idioma).not.toMatch(
        /cumpl\w*\s+(con\s+)?(el\s+)?(RGPD|GDPR)/i,
      );
      expect(html, idioma).not.toMatch(
        /complies\s+with\s+(the\s+)?GDPR|GDPR[-\s]compliant/i,
      );
    }
  });

  it("no pide un solo recurso externo ni lleva un enlace", async () => {
    const html = await certificado("es");
    expect(html).not.toMatch(/https?:\/\//);
  });

  it("una política editada lo dice; y sin seudónimos no hay frase de «seudonimizado»", async () => {
    const editada: Politica = {
      ...politica,
      origen: "rgpd-editada",
      reglas: politica.reglas.map((r) =>
        r.tecnica.tipo === "seudonimizar" ||
        r.tecnica.tipo === "seudonimizar-con-formato"
          ? { columna: r.columna, tecnica: { tipo: "conservar" as const } }
          : r,
      ),
    };
    const html = await certificado("es", editada);
    expect(html).toContain(
      "Partiste de la política RGPD de Velo y la cambiaste",
    );
    expect(html).not.toContain("Seudonimizado (art. 4.5 RGPD)");
    // Con la política en cualquier otro origen, la sección no existe.
    const otra = await certificado("es", { ...politica, origen: "manual" });
    expect(otra).not.toContain("Seudonimizado, no anónimo");
  });
});
