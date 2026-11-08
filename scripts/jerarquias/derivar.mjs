#!/usr/bin/env node
// Derives the factory generalization hierarchies (DIVIPOLA, CIIU Rev. 4 A.C. and, since S11, CIIU
// Rev. 5 A.C.) from the official source files that the builder downloaded ONCE by hand (the app itself
// never uses the network). No dependencies: Node built-ins only (a minimal ZIP reader for the .xlsx).
//
// Usage:  node scripts/jerarquias/derivar.mjs <sources-dir> [<output-dir>] [--solo <name>[,<name>]]
//   <sources-dir>  directory holding the downloaded originals (names below, untouched)
//   <output-dir>   default: src/engine/jerarquias/fabrica (relative to the repo root)
//   --solo         derive only these (divipola, ciiu, ciiu5); only their sources need to be present
//
// Inputs (see the *.meta.json files for URL, publisher, date accessed and SHA-256 of each):
//   divipola-gdxc-w37w.csv                    DANE, "DIVIPOLA- Códigos municipios" (datos.gov.co, id gdxc-w37w)
//   ley2056-senado-pr001.html                 Ley 2056 de 2020, art. 45 (regions of the Sistema General de Regalías)
//   Estructura-detallada-CIIU-4AC-2022.xlsx   DANE, "Estructura Detallada CIIU Rev. 4 A.C. (Excel - actualización 2022)"
//   CIIU_5_AC_Estructura_detallada.xlsx       DANE, "CIIU Rev. 5 A.C. — Estructura detallada" (Resolución 992 de 2026)
// Outputs: divipola.json, ciiu.json and ciiu5.json (UTF-8, no BOM, JSON.stringify on one line + trailing newline).
// Every sanity check throws: a source that changes shape fails loudly instead of producing a wrong file.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argumentos = process.argv.slice(2);
const iSolo = argumentos.indexOf("--solo");
const solo = iSolo >= 0 ? new Set((argumentos[iSolo + 1] ?? "").split(",")) : null;
if (iSolo >= 0) argumentos.splice(iSolo, 2);
const [dirFuentes, dirSalidaArg] = argumentos;
if (!dirFuentes || (solo && [...solo].some((n) => !["divipola", "ciiu", "ciiu5"].includes(n)))) {
  console.error("Usage: node scripts/jerarquias/derivar.mjs <sources-dir> [<output-dir>] [--solo divipola,ciiu,ciiu5]");
  process.exit(2);
}
const dirSalida = resolve(dirSalidaArg ?? join(RAIZ, "src/engine/jerarquias/fabrica"));
const toca = (nombre) => solo === null || solo.has(nombre);

const ARCHIVOS = {
  divipola: "divipola-gdxc-w37w.csv",
  ley: "ley2056-senado-pr001.html",
  ciiu: "Estructura-detallada-CIIU-4AC-2022.xlsx",
  ciiu5: "CIIU_5_AC_Estructura_detallada.xlsx",
};
/** The sources each output reads. */
const FUENTES_DE = { divipola: ["divipola", "ley"], ciiu: ["ciiu"], ciiu5: ["ciiu5"] };

function exigir(condicion, mensaje) {
  if (!condicion) throw new Error(`Sanity check failed: ${mensaje}`);
}
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const leer = (nombre) => readFileSync(join(dirFuentes, nombre));
const quitarAcentos = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const clave = (s) => quitarAcentos(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// ---------------------------------------------------------------------------------------------
// 1. DIVIPOLA (CSV)
// ---------------------------------------------------------------------------------------------

/** RFC 4180-style CSV: quoted fields may hold commas and doubled quotes. */
function parsearCsv(texto) {
  const filas = [];
  let fila = [];
  let campo = "";
  let entre = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entre) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else entre = false;
      } else campo += c;
    } else if (c === '"') entre = true;
    else if (c === ",") {
      fila.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(campo);
      campo = "";
      if (fila.length > 1 || fila[0] !== "") filas.push(fila);
      fila = [];
    } else campo += c;
  }
  if (campo !== "" || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}

const ENTIDADES_HTML = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", uuml: "ü",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ",
};
function decodificarEntidades(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[A-Za-z]+);/g, (_, e) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    exigir(e in ENTIDADES_HTML, `unknown HTML entity &${e};`);
    return ENTIDADES_HTML[e];
  });
}

/** Article 45 of Ley 2056 de 2020 -> [{ etiqueta: "Región Caribe", departamentos: ["Atlántico", ...] }, ...] */
function leerRegiones(htmlBuf) {
  // The page declares charset ISO-8859-1 and writes accents as HTML entities.
  const html = new TextDecoder("latin1").decode(htmlBuf);
  const ini = html.indexOf('name="45"');
  const fin = html.indexOf('name="46"');
  exigir(ini >= 0 && fin > ini, "article 45 / 46 anchors not found in the Senado page");
  const parrafos = [...html.slice(html.lastIndexOf("<p>", ini), fin).matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) =>
    decodificarEntidades(m[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim(),
  );
  exigir(/^ARTÍCULO 45\. REGIONES DEL SISTEMA GENERAL DE REGALÍAS\./.test(parrafos[0] ?? ""), "article 45 heading not found");
  const regiones = [];
  for (const p of parrafos.slice(1)) {
    let m;
    if ((m = p.match(/^(\d+)\. (Región [^:]+):/))) {
      exigir(Number(m[1]) === regiones.length + 1, `region numbering broke at "${p}"`);
      regiones.push({ etiqueta: m[2], departamentos: [] });
    } else if ((m = p.match(/^(\d+)\.(\d+)\. (.+?)\.$/))) {
      const r = regiones[Number(m[1]) - 1];
      exigir(r && Number(m[2]) === r.departamentos.length + 1, `department numbering broke at "${p}"`);
      r.departamentos.push(m[3]);
    } else exigir(/^PARÁGRAFO\./.test(p), `unexpected paragraph in article 45: "${p}"`);
  }
  return regiones;
}

function derivarDivipola() {
  const bufCsv = leer(ARCHIVOS.divipola);
  const texto = new TextDecoder("utf-8", { fatal: true }).decode(bufCsv).replace(/^﻿/, "");
  const [cabecera, ...filas] = parsearCsv(texto);
  exigir(
    cabecera.join("|") ===
      "Código Departamento|Nombre Departamento|Código Municipio|Nombre Municipio|Tipo: Municipio / Isla / Área no municipalizada|longitud|Latitud",
    `unexpected CSV header: ${cabecera.join("|")}`,
  );

  const nombrePorDepto = new Map();
  const tipos = {};
  const municipios = new Map();
  for (const f of filas) {
    exigir(f.length === 7, `row with ${f.length} columns: ${f.join(",")}`);
    const [cd, nd, cm, nm, tipo] = f;
    exigir(/^\d{2}$/.test(cd) && /^\d{5}$/.test(cm) && cm.startsWith(cd), `bad codes ${cd} / ${cm}`);
    exigir(nd !== "" && nm !== "", `empty name in ${cm}`);
    if (nombrePorDepto.has(cd)) exigir(nombrePorDepto.get(cd) === nd, `department ${cd} has two names`);
    nombrePorDepto.set(cd, nd);
    exigir(!municipios.has(cm), `duplicate municipality code ${cm}`);
    municipios.set(cm, { nombre: nm, depto: cd, tipo });
    tipos[tipo] = (tipos[tipo] ?? 0) + 1;
  }

  // Regionalization: Ley 2056 de 2020, art. 45, matched to DIVIPOLA departments by normalized name.
  const regiones = leerRegiones(leer(ARCHIVOS.ley));
  const regionDeDepto = new Map();
  for (const r of regiones) {
    for (const dep of r.departamentos) {
      const candidatos = [...nombrePorDepto].filter(([, nd]) => {
        const k = clave(nd);
        const kl = clave(dep);
        // The law writes the archipelago department by its short name; DIVIPOLA prefixes it with "ARCHIPIÉLAGO DE".
        return k === kl || k === `archipielago de ${kl}`;
      });
      exigir(candidatos.length === 1, `law department "${dep}" matched ${candidatos.length} DIVIPOLA departments`);
      const cd = candidatos[0][0];
      exigir(!regionDeDepto.has(cd), `department ${cd} (${dep}) appears in two regions`);
      regionDeDepto.set(cd, r.etiqueta);
    }
  }
  exigir(regionDeDepto.size === nombrePorDepto.size, `${regionDeDepto.size} departments in the law vs ${nombrePorDepto.size} in DIVIPOLA`);

  const departamentos = [...nombrePorDepto]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([cd, nd]) => [cd, nd, regionDeDepto.get(cd)]);
  const listaMunicipios = [...municipios]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([cm, m]) => [cm, m.nombre, m.depto]);

  exigir(departamentos.length === 33, `${departamentos.length} department-level entities, expected 33`);
  exigir(municipios.has("11001") && municipios.get("11001").depto === "11", "Bogotá 11001 missing");
  exigir(municipios.has("05001") && municipios.get("05001").nombre === "MEDELLÍN", "Medellín 05001 missing");
  exigir(listaMunicipios.every(([, , d]) => nombrePorDepto.has(d)), "a municipality points to a missing department");

  const anm = [...municipios].filter(([, m]) => m.tipo === "Área no municipalizada").map(([c]) => c);
  const isla = [...municipios].filter(([, m]) => m.tipo === "Isla").map(([c]) => c);
  return {
    json: { departamentos, municipios: listaMunicipios },
    resumen: {
      regiones: regiones.map((r) => `${r.etiqueta} (${r.departamentos.length})`),
      conteos: {
        departamentos: departamentos.length,
        entradas_con_codigo_de_5_digitos: listaMunicipios.length,
        por_tipo_en_la_fuente: tipos,
        regiones: regiones.length,
      },
      areas_no_municipalizadas: anm,
      isla,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// 2. CIIU Rev. 4 A.C. (xlsx = zip of XML; minimal reader, no dependencies)
// ---------------------------------------------------------------------------------------------

function leerZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  exigir(eocd >= 0, "ZIP end-of-central-directory record not found");
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entradas = new Map();
  for (let n = 0; n < total; n++) {
    exigir(buf.readUInt32LE(p) === 0x02014b50, "bad ZIP central directory entry");
    const metodo = buf.readUInt16LE(p + 10);
    const tamComprimido = buf.readUInt32LE(p + 20);
    const lNombre = buf.readUInt16LE(p + 28);
    const lExtra = buf.readUInt16LE(p + 30);
    const lComentario = buf.readUInt16LE(p + 32);
    const offLocal = buf.readUInt32LE(p + 42);
    const nombre = buf.toString("utf8", p + 46, p + 46 + lNombre);
    exigir(buf.readUInt32LE(offLocal) === 0x04034b50, `bad local header for ${nombre}`);
    const ini = offLocal + 30 + buf.readUInt16LE(offLocal + 26) + buf.readUInt16LE(offLocal + 28);
    const datos = buf.subarray(ini, ini + tamComprimido);
    exigir(metodo === 0 || metodo === 8, `unsupported ZIP method ${metodo} for ${nombre}`);
    entradas.set(nombre, metodo === 8 ? inflateRawSync(datos) : datos);
    p += 46 + lNombre + lExtra + lComentario;
  }
  return entradas;
}

const textoXml = (s) => decodificarEntidades(s);

function leerHoja(zip) {
  const hojas = [...zip.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k));
  exigir(hojas.length === 1, `expected exactly one worksheet, found ${hojas.length}`);
  const compartidas = [];
  const ss = zip.get("xl/sharedStrings.xml")?.toString("utf8") ?? "";
  for (const si of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    compartidas.push([...si[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => textoXml(t[1])).join(""));
  }
  const filas = [];
  const xml = zip.get(hojas[0]).toString("utf8");
  for (const fila of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const celdas = {};
    for (const c of fila[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = c[1].match(/\br="([A-Z]+)\d+"/)[1];
      const tipo = c[1].match(/\bt="([^"]+)"/)?.[1];
      const v = c[2]?.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      if (tipo === "inlineStr") celdas[ref] = textoXml([...(c[2] ?? "").matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""));
      else if (v === undefined) continue;
      else celdas[ref] = tipo === "s" ? compartidas[Number(v)] : v;
    }
    filas.push(celdas);
  }
  return filas;
}

function derivarCiiu() {
  const filas = leerHoja(leerZip(leer(ARCHIVOS.ciiu)));
  const cabecera = filas.find((f) => f.A === "División");
  exigir(cabecera && cabecera.B === "Grupo" && cabecera.C === "Clase" && cabecera.D === "Descripción", "unexpected xlsx header row");

  const secciones = []; // { letra, divisiones: [] }
  const clases = [];
  let grupos = 0;
  let grupoActual = null;
  const vistas = new Set();
  for (const f of filas.slice(filas.indexOf(cabecera) + 1)) {
    const a = (f.A ?? "").trim();
    const b = (f.B ?? "").trim();
    const c = (f.C ?? "").trim();
    if (a.startsWith("SECCIÓN")) {
      const m = a.match(/^SECCIÓN ([A-Z])$/);
      exigir(m, `bad section label "${a}"`);
      exigir(secciones.length === m[1].charCodeAt(0) - 65, `section ${m[1]} out of order`);
      secciones.push({ letra: m[1], divisiones: [] });
      grupoActual = null;
      continue;
    }
    exigir(secciones.length > 0, "data before the first section");
    const seccion = secciones[secciones.length - 1];
    if (a !== "") {
      exigir(/^\d{2}$/.test(a), `bad division code "${a}"`);
      exigir(!vistas.has(a), `division ${a} listed twice`);
      vistas.add(a);
      seccion.divisiones.push(a);
    }
    if (b !== "") {
      exigir(/^\d{3}$/.test(b) && b.startsWith(seccion.divisiones.at(-1) ?? "xx"), `bad group code "${b}"`);
      grupoActual = b;
      grupos++;
    }
    if (c !== "") {
      exigir(/^\d{4}$/.test(c), `bad class code "${c}"`);
      exigir(c.startsWith(grupoActual ?? "xxx"), `class ${c} is not under group ${grupoActual}`);
      clases.push(c);
    }
  }

  const clasesOrdenadas = [...new Set(clases)].sort();
  exigir(clasesOrdenadas.length === clases.length, "a class code is listed twice");
  const rangos = secciones.map((s) => {
    exigir(s.divisiones.length > 0, `section ${s.letra} has no divisions`);
    const nums = s.divisiones.map(Number);
    for (let i = 1; i < nums.length; i++) exigir(nums[i] === nums[i - 1] + 1, `section ${s.letra}: divisions are not contiguous (${s.divisiones.join(",")})`);
    return [s.letra, s.divisiones[0], s.divisiones.at(-1)];
  });
  // Ranges must not overlap and every class must fall in exactly one of them.
  for (const cl of clasesOrdenadas) {
    const d = cl.slice(0, 2);
    const dentro = rangos.filter(([, ini, fin]) => d >= ini && d <= fin);
    exigir(dentro.length === 1, `class ${cl} falls in ${dentro.length} section ranges`);
    exigir(secciones.find((s) => s.letra === dentro[0][0]).divisiones.includes(d), `class ${cl}: division ${d} not listed in section ${dentro[0][0]}`);
  }
  exigir(rangos.length === 21 && rangos[0][0] === "A" && rangos.at(-1)[0] === "U", `${rangos.length} sections, expected 21 (A-U)`);

  return {
    json: { secciones: rangos, clases: clasesOrdenadas },
    resumen: { conteos: { secciones: rangos.length, divisiones: vistas.size, grupos, clases: clasesOrdenadas.length } },
  };
}

// ---------------------------------------------------------------------------------------------
// 3. CIIU Rev. 5 A.C. (S11). Same output shape as ciiu.json, so the engine reads both alike. The
// Rev. 5 sheet names each row's category in column A and gives the code twice: with the section
// letter (column B: "A", "A01", "A011", "A0111") and without it (column C). The section is taken
// from column B's letter, never from a range, and the ranges are then checked to be contiguous.
// ---------------------------------------------------------------------------------------------

function derivarCiiu5() {
  const filas = leerHoja(leerZip(leer(ARCHIVOS.ciiu5)));
  const cabecera = filas.find((f) => f.A === "Categoría");
  exigir(
    cabecera &&
      cabecera.B === "CIIU Rev. 5 A.C. Código, incluida la sección" &&
      cabecera.C === "CIIU Rev 5 A.C. Código" &&
      cabecera.D === "CIIU Rev 5 A.C. Título",
    "unexpected Rev. 5 xlsx header row",
  );
  const LONGITUD = { Sección: 0, División: 2, Grupo: 3, Clase: 4 };
  const secciones = []; // { letra, divisiones: [] }
  const clases = [];
  let grupos = 0;
  let grupoActual = null;
  const vistas = new Set();
  for (const f of filas.slice(filas.indexOf(cabecera) + 1)) {
    const categoria = (f.A ?? "").trim();
    if (categoria === "") continue;
    exigir(categoria in LONGITUD, `unknown category "${categoria}"`);
    const conLetra = (f.B ?? "").trim();
    const m = conLetra.match(/^([A-Z])(\d*)$/);
    exigir(m && m[2].length === LONGITUD[categoria], `bad ${categoria} code "${conLetra}"`);
    const [, letra, codigo] = m;
    // Column C repeats the code without the letter (the section repeats its letter).
    exigir((f.C ?? "").trim().padStart(codigo.length, "0") === (codigo || letra), `column C disagrees with "${conLetra}"`);
    if (categoria === "Sección") {
      exigir(secciones.length === letra.charCodeAt(0) - 65, `section ${letra} out of order`);
      secciones.push({ letra, divisiones: [] });
      grupoActual = null;
      continue;
    }
    const seccion = secciones.at(-1);
    exigir(seccion && seccion.letra === letra, `${conLetra} is not under section ${seccion?.letra}`);
    if (categoria === "División") {
      exigir(!vistas.has(codigo), `division ${codigo} listed twice`);
      vistas.add(codigo);
      seccion.divisiones.push(codigo);
    } else if (categoria === "Grupo") {
      exigir(codigo.startsWith(seccion.divisiones.at(-1) ?? "xx"), `group ${codigo} is not under its division`);
      grupoActual = codigo;
      grupos++;
    } else {
      exigir(codigo.startsWith(grupoActual ?? "xxx"), `class ${codigo} is not under group ${grupoActual}`);
      clases.push(codigo);
    }
  }
  const clasesOrdenadas = [...new Set(clases)].sort();
  exigir(clasesOrdenadas.length === clases.length, "a class code is listed twice");
  const rangos = secciones.map((s) => {
    exigir(s.divisiones.length > 0, `section ${s.letra} has no divisions`);
    const nums = s.divisiones.map(Number);
    for (let i = 1; i < nums.length; i++) exigir(nums[i] === nums[i - 1] + 1, `section ${s.letra}: divisions are not contiguous (${s.divisiones.join(",")})`);
    return [s.letra, s.divisiones[0], s.divisiones.at(-1)];
  });
  exigir(rangos.length === 22 && rangos[0][0] === "A" && rangos.at(-1)[0] === "V", `${rangos.length} sections, expected 22 (A-V)`);
  return {
    json: { secciones: rangos, clases: clasesOrdenadas },
    resumen: { conteos: { secciones: rangos.length, divisiones: vistas.size, grupos, clases: clasesOrdenadas.length } },
  };
}

// ---------------------------------------------------------------------------------------------

function escribir(nombre, objeto) {
  mkdirSync(dirSalida, { recursive: true });
  const texto = `${JSON.stringify(objeto)}\n`;
  writeFileSync(join(dirSalida, nombre), texto, "utf8");
  return sha256(Buffer.from(texto, "utf8"));
}

const DERIVAR = { divipola: derivarDivipola, ciiu: derivarCiiu, ciiu5: derivarCiiu5 };
const salidas = Object.keys(DERIVAR).filter(toca);

console.log("Input SHA-256:");
for (const salida of salidas)
  for (const fuente of FUENTES_DE[salida]) console.log(`  ${sha256(leer(ARCHIVOS[fuente]))}  ${ARCHIVOS[fuente]}`);

for (const salida of salidas) {
  const { json, resumen } = DERIVAR[salida]();
  console.log(`\n${salida}.json  ${escribir(`${salida}.json`, json)}`);
  console.log(JSON.stringify(resumen, null, 2));
}
console.log(`\nWritten to ${dirSalida}`);
