// Mensajes del motor — lo que el motor dice al transformar — políticas de fábrica, utilidad, salvedades y avisos de la política.
//
// Cada clave es una frase que el motor o el worker NOMBRAN sin escribir: devuelven
// `mensaje("area.clave", { datos })` y la interfaz, o el documento que se descarga, la convierte en
// texto en el idioma que corresponde. Claves planas con punto (`area.cosa`); los números viajan
// crudos en `datos` y se formatean al decirlos (`{n}` o `{n:2}`), jamás dentro del motor.
//
// El español de aquí es el que ya tenían los motores y las pruebas — se conserva palabra por palabra.
// El inglés se redacta al lado: no se traduce frase a frase si una construcción natural pide otra.
//
// Áreas de este archivo:
//   · `fabrica.*`  — las dos políticas de fábrica: su fuente, su advertencia y la tabla de cobertura
//                    (cómo ve Velo cada identificador de la norma, o por qué no lo ve). Ninguna de
//                    estas frases entra al JSON que el usuario exporta ni a su hash: la identidad de
//                    una política es su `origen` ("habeas-data", "hipaa") y sus reglas, no su prosa.
//   · `politica.*` — la nota del archivo exportado y los motivos por los que una política importada
//                    se rechaza.
//   · `utilidad.*` — por qué una columna quedó fuera del cruce de correlaciones.
//   · `tecnica.*`  — el nombre llano de cada técnica (la bitácora guarda la CLAVE de la técnica, no
//                    este nombre: ver `src/lib/tecnicas-en-palabras.ts`).
//   · `salida.*`   — lo que Velo ESCRIBE DENTRO del archivo anonimizado (los dos rótulos de un
//                    intervalo de Mondrian). Siguen el idioma del TRABAJO —el de la pantalla al
//                    pulsar «transformar»—, que queda escrito en el certificado. Llevan sus espacios
//                    de borde a propósito (`" a "`, `" (o vacío)"`): `decir` no recorta, y el
//                    español de aquí es byte por byte el que el archivo siempre llevó. En inglés
//                    son ASCII a propósito: un guion choca con negativos y fechas ISO, una coma con
//                    las comillas del CSV, y un guion largo con el CSV sin BOM.
//
// Los nombres propios (Habeas Data, HIPAA, Safe Harbor, SIC, AGN, HHS, CFR) se escriben igual en los
// dos idiomas.

import type { Texto } from "../index";

export const MOTOR_TRANSFORMAR = {
  // ── Habeas Data (Colombia) ─────────────────────────────────────────────────────────────────
  "fabrica.habeas.fuente": {
    es:
      "Ley 1581 de 2012 (art. 4 principios; art. 5 datos sensibles) y Decreto 1377 de 2013, " +
      "con las técnicas de la guía de anonimización AGN + SIC",
    en:
      "Colombia's Law 1581 of 2012 (art. 4 principles; art. 5 sensitive data) and Decree 1377 of " +
      "2013, with the techniques from the AGN + SIC anonymization guide",
  },
  "fabrica.habeas.advertencia": {
    es:
      "Es la interpretación de Velo de la guía, aplicada a las columnas que Velo reconoció. No es " +
      "una certificación: la SIC no la emite y ningún programa que solo ve una tabla puede decidir " +
      "si un tratamiento es lícito. Revisa columna por columna antes de entregar.",
    en:
      "This is Velo's interpretation of the guide, applied to the columns Velo recognized. It is " +
      "not a certification: the SIC does not issue it, and no program that only sees a table can " +
      "decide whether data processing is lawful. Review it column by column before handing the " +
      "file over.",
  },
  "fabrica.habeas.cob.sensibles.id": {
    es: "Datos sensibles (salud, origen étnico, convicciones, vida sexual, biometría)",
    en: "Sensitive data (health, ethnic origin, beliefs, sex life, biometrics)",
  },
  "fabrica.habeas.cob.sensibles.nota": {
    es:
      "No existe algoritmo que mire «J45.9» y sepa que es un diagnóstico: solo el encabezado lo " +
      "sugiere, y Velo lo marca con certeza «sin confirmar».",
    en:
      "No algorithm can look at “J45.9” and know it is a diagnosis: only the header suggests it, " +
      "and Velo marks it with “unconfirmed” certainty.",
  },
  "fabrica.habeas.cob.identificadores.id": {
    es: "Cédula, NIT, teléfonos, correo, placa, tarjeta, IBAN, IP",
    en: "Cédula, NIT, phone numbers, email, license plate, card, IBAN, IP address",
  },
  "fabrica.habeas.cob.nombres.id": {
    es: "Nombres y apellidos",
    en: "First and last names",
  },
  "fabrica.habeas.cob.internos.id": {
    es: "Códigos internos de la organización (historia clínica, afiliado, contrato)",
    en: "Internal organization codes (medical record, member, contract)",
  },
  "fabrica.habeas.cob.internos.porque": {
    es:
      "Un consecutivo propio no tiene forma reconocible ni checksum público. Si tu tabla lleva " +
      "uno, márcalo tú: Velo no puede saberlo.",
    en:
      "A custom sequence number has no recognizable shape or public checksum. If your table has " +
      "one, mark it yourself: Velo can't know.",
  },

  // ── HIPAA · Safe Harbor (Estados Unidos) ───────────────────────────────────────────────────
  "fabrica.hipaa.fuente": {
    es: "45 CFR §164.514(b)(2)(i)(A)–(R) — los 18 identificadores del método Safe Harbor",
    en: "45 CFR §164.514(b)(2)(i)(A)–(R) — the 18 identifiers of the Safe Harbor method",
  },
  "fabrica.hipaa.advertencia": {
    es:
      "Safe Harbor exige ELIMINAR los 18 identificadores, no seudonimizarlos: un código derivado " +
      "del propio valor —como un HMAC— no cumple el §164.514(c). Por eso esta política suprime, y " +
      "el archivo pierde sus llaves de cruce. Y no es una certificación: Velo no reconoce todos los " +
      "identificadores por sí solo, así que revisa la tabla de abajo y marca a mano los que le faltan.",
    en:
      "Safe Harbor requires REMOVING all 18 identifiers, not pseudonymizing them: a code derived " +
      "from the value itself —like an HMAC— does not satisfy §164.514(c). That is why this policy " +
      "removes them, and the file loses its join keys. It is also not a certification: Velo does " +
      "not recognize every identifier on its own, so review the table below and mark by hand the " +
      "ones it misses.",
  },
  "fabrica.hipaa.cob.A.id": { es: "Nombres", en: "Names" },
  "fabrica.hipaa.cob.B.id": {
    es: "Subdivisiones geográficas menores que un estado (dirección, ciudad, condado, código postal)",
    en: "Geographic subdivisions smaller than a state (address, city, county, ZIP code)",
  },
  "fabrica.hipaa.cob.B.nota": {
    es:
      "Velo reconoce el encabezado (dirección, municipio, ciudad), no el valor. La regla de los " +
      "20.000 habitantes para los 3 primeros dígitos del ZIP es de censo estadounidense y Velo no " +
      "la puede verificar.",
    en:
      "Velo recognizes the column header (dirección, municipio, ciudad), not the value. The " +
      "20,000-inhabitant rule for the first 3 digits of the ZIP code comes from US census data, " +
      "and Velo cannot verify it.",
  },
  "fabrica.hipaa.cob.C.id": {
    es: "Todos los elementos de fechas salvo el año, y todas las edades por encima de 89",
    en: "All elements of dates except the year, and all ages over 89",
  },
  "fabrica.hipaa.cob.D.id": {
    es: "Números de teléfono",
    en: "Telephone numbers",
  },
  "fabrica.hipaa.cob.E.id": { es: "Números de fax", en: "Fax numbers" },
  "fabrica.hipaa.cob.E.porque": {
    es:
      "Un fax tiene exactamente la misma forma que un fijo: Velo lo marcará como teléfono, que " +
      "basta para suprimirlo, pero no puede distinguir cuál es cuál.",
    en:
      "A fax number has exactly the same shape as a landline: Velo will flag it as a phone " +
      "number, which is enough to remove it, but it cannot tell which is which.",
  },
  "fabrica.hipaa.cob.F.id": {
    es: "Direcciones de correo electrónico",
    en: "Email addresses",
  },
  "fabrica.hipaa.cob.G.id": {
    es: "Números de seguridad social",
    en: "Social Security numbers",
  },
  "fabrica.hipaa.cob.G.porque": {
    es: "El SSN es estadounidense y Velo valida documentos colombianos. Márcalo tú.",
    en: "The SSN is a US number and Velo validates Colombian documents. Mark it yourself.",
  },
  "fabrica.hipaa.cob.H.id": {
    es: "Números de historia clínica",
    en: "Medical record numbers",
  },
  "fabrica.hipaa.cob.H.porque": {
    es: "Es un consecutivo interno de cada institución: sin forma reconocible ni checksum.",
    en: "It is an internal sequence number of each institution: no recognizable shape or checksum.",
  },
  "fabrica.hipaa.cob.I.id": {
    es: "Números de afiliado a plan de salud",
    en: "Health plan beneficiary numbers",
  },
  "fabrica.hipaa.cob.I.porque": {
    es: "Formato propio de cada asegurador.",
    en: "Each insurer uses its own format.",
  },
  "fabrica.hipaa.cob.J.id": { es: "Números de cuenta", en: "Account numbers" },
  "fabrica.hipaa.cob.K.id": {
    es: "Números de certificado o licencia",
    en: "Certificate or license numbers",
  },
  "fabrica.hipaa.cob.K.porque": {
    es: "Formato propio de cada entidad emisora.",
    en: "Each issuing body uses its own format.",
  },
  "fabrica.hipaa.cob.L.id": {
    es: "Identificadores de vehículo, incluida la placa",
    en: "Vehicle identifiers, including license plates",
  },
  "fabrica.hipaa.cob.M.id": {
    es: "Identificadores y seriales de dispositivos",
    en: "Device identifiers and serial numbers",
  },
  "fabrica.hipaa.cob.M.porque": {
    es: "Serial arbitrario del fabricante.",
    en: "An arbitrary serial number set by the manufacturer.",
  },
  "fabrica.hipaa.cob.N.id": { es: "URLs", en: "Web addresses (URLs)" },
  "fabrica.hipaa.cob.N.porque": {
    es: "Velo no trae validador de URL en el S1. Si tu tabla las lleva, márcalas tú.",
    en: "Velo does not include a URL validator in this version. If your table has them, mark them yourself.",
  },
  "fabrica.hipaa.cob.O.id": { es: "Direcciones IP", en: "IP addresses" },
  "fabrica.hipaa.cob.P.id": {
    es: "Identificadores biométricos (huellas dactilares, de voz)",
    en: "Biometric identifiers (fingerprints and voiceprints)",
  },
  "fabrica.hipaa.cob.P.nota": {
    es: "Solo por el encabezado: un vector biométrico en una celda es una cadena sin forma reconocible.",
    en: "By header only: a biometric vector in a cell is a string with no recognizable shape.",
  },
  "fabrica.hipaa.cob.Q.id": {
    es: "Fotografías de cara completa e imágenes comparables",
    en: "Full-face photographs and comparable images",
  },
  "fabrica.hipaa.cob.Q.porque": {
    es: "Velo lee tablas, no imágenes. Una columna con rutas a fotos no la reconoce.",
    en: "Velo reads tables, not images. It will not recognize a column of file paths to photos.",
  },
  "fabrica.hipaa.cob.R.id": {
    es: "Cualquier otro número, característica o código único de identificación",
    en: "Any other unique identifying number, characteristic or code",
  },
  "fabrica.hipaa.cob.R.porque": {
    es:
      "Es una cláusula de cierre: por definición no tiene forma. Es lo que hace que Safe Harbor " +
      "no se pueda automatizar del todo, y por eso esta lista existe.",
    en:
      "It is a catch-all clause: by definition it has no shape. It is what keeps Safe Harbor " +
      "from being fully automatable, and that is why this list exists.",
  },

  // ── El archivo de política: lo que se exporta y lo que se rechaza al importar ───────────────
  // La nota del archivo exportado se escribe en LOS DOS idiomas, siempre, en este orden
  // («es / en»): el JSON que alguien exporta y su hash no pueden depender del idioma de su pantalla.
  "politica.notaDelArchivo": {
    es: "El hash se recalcula al importar; el de aquí es informativo.",
    en: "The hash is recomputed on import; the one here is informational.",
  },
  "politica.importar.jsonInvalido": {
    es: "El archivo no es un JSON que se pueda leer.",
    en: "The file is not a JSON that can be read.",
  },
  "politica.importar.versionDistinta": {
    es: "La política es de la versión {version} y esta Velo entiende la {esperada}.",
    en: "The policy is version {version} and this Velo understands version {esperada}.",
  },
  "politica.importar.formaInvalida": {
    // `{problema}` es el mensaje de la librería de validación, tal cual: son datos, no copy de Velo.
    es: "{ruta}: {problema}",
    en: "{ruta}: {problema}",
  },
  "politica.importar.formaInvalidaRaiz": {
    es: "la política: {problema}",
    en: "the policy: {problema}",
  },
  "politica.importar.sinForma": {
    es: "La forma del archivo no corresponde a una política.",
    en: "The structure of the file does not match a policy.",
  },

  // ── Utilidad: por qué una columna quedó fuera del cruce de correlaciones ────────────────────
  "utilidad.fuera.suprimida": {
    es: "suprimida: no queda nada con qué cruzarla",
    en: "removed: nothing is left to cross it with",
  },
  "utilidad.fuera.cardinalidad": {
    es:
      "más de {tope} valores distintos: la tabla de contingencia quedaría casi vacía y la cifra " +
      "saldría inflada",
    en:
      "more than {tope} distinct values: the contingency table would be almost empty and the " +
      "figure would come out inflated",
  },
  "utilidad.fuera.sobrante": {
    es: "fuera de las {tope} columnas con más valores distintos",
    en: "outside the {tope} columns with the most distinct values",
  },

  // ── Técnicas: el nombre llano que se pinta junto a cada columna ────────────────────────────
  "tecnica.conservar": { es: "sin cambios", en: "unchanged" },
  "tecnica.suprimir": { es: "quitada", en: "removed" },
  "tecnica.enmascarar": { es: "enmascarada", en: "masked" },
  "tecnica.seudonimizar": { es: "seudónimo", en: "pseudonym" },
  "tecnica.seudonimizar-con-formato": {
    es: "seudónimo con formato",
    en: "format-preserving pseudonym",
  },
  "tecnica.generalizar-rango": {
    es: "agrupada en rangos",
    en: "grouped into ranges",
  },
  "tecnica.generalizar-fecha": { es: "fecha recortada", en: "date trimmed" },
  "tecnica.generalizar-prefijo": { es: "recortada", en: "trimmed" },
  "tecnica.generalizar-automatico": {
    es: "generalizada hasta el k",
    en: "generalized up to k",
  },

  // ── Salida: lo que se escribe dentro del archivo anonimizado ───────────────────────────────
  "salida.mondrian.separador": {
    // Entre los extremos de un intervalo OBSERVADO: «18 a 39», «18 to 39».
    es: " a ",
    en: " to ",
  },
  "salida.mondrian.sufijoVacio": {
    // Cuando el intervalo también cubre celdas vacías: «0 a 5 (o vacío)», «0 to 5 (or empty)».
    es: " (o vacío)",
    en: " (or empty)",
  },
} as const satisfies Readonly<Record<string, Texto>>;
