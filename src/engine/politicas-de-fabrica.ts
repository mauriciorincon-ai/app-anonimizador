// Políticas de fábrica — Habeas Data y HIPAA, como DATOS con su fuente citada.
//
// Igual que los validadores del S1: el criterio vive en el código, citable, no en un documento
// aparte que puede envejecer sin que nadie lo note.
//
// **La advertencia que estas políticas obligan a hacer, y que la UI tiene que mostrar:** una
// política de fábrica es la *interpretación de Velo* de una guía, aplicada a las columnas que Velo
// alcanzó a reconocer. No es una certificación de cumplimiento, no la emite la SIC ni HHS, y no
// hay forma de que un programa que solo ve una tabla decida si un tratamiento es lícito. Lo que sí
// puede hacer —y hace— es decir exactamente qué tocó y qué no.
//
// De ahí la tabla `cobertura`: cada identificador de la fuente, con **cómo lo ve Velo o por qué no
// lo ve**. Un clic que dijera «HIPAA aplicado» sin esa tabla sería justo la mentira por
// composición que este sprint tiene prohibida: cada regla correcta, y el conjunto afirmando un
// cumplimiento que nadie verificó.

import type { CategoriaLey1581, TipoDetectado } from "./validadores/tipos";
import type { Politica, Tecnica } from "./politica";

/** Cómo Velo alcanza (o no) a reconocer un identificador de la fuente. */
export type Deteccion =
  | { via: "validador"; tipos: readonly TipoDetectado[] }
  | { via: "nombre-de-columna"; nota: string }
  | { via: "ninguna"; porque: string };

export interface CoberturaDeIdentificador {
  /** La letra del literal en la norma, cuando la norma los enumera. */
  readonly referencia: string;
  readonly identificador: string;
  readonly deteccion: Deteccion;
}

export interface PoliticaDeFabrica {
  readonly id: "habeas-data" | "hipaa";
  readonly nombre: string;
  readonly fuente: string;
  /** Qué promete y qué no. Va a la UI tal cual: no es una nota al pie opcional. */
  readonly advertencia: string;
  readonly porTipo: Partial<Record<TipoDetectado, Tecnica>>;
  readonly porCategoria: Record<CategoriaLey1581, Tecnica>;
  readonly kObjetivo: number | null;
  readonly cobertura: readonly CoberturaDeIdentificador[];
}

// ── Habeas Data (Colombia) ────────────────────────────────────────────────────────────────────

/**
 * La ley colombiana **no trae una lista tipo Safe Harbor**: define principios (art. 4), la
 * categoría estrecha de dato sensible (art. 5) y deja las técnicas a la guía. Así que esta
 * política es un criterio de tratamiento, no una checklist que se pueda tildar.
 *
 * El criterio: los identificadores directos se seudonimizan **conservando formato** para que el
 * archivo siga sirviendo del otro lado; los cuasi-identificadores entran a Mondrian con k=5; y los
 * datos sensibles del art. 5 **se conservan**, porque son justamente lo que el análisis quiere
 * medir — y quedan protegidos por el k de los cuasi-identificadores, que es el modelo entero de
 * k-anonimato. Suprimir el dato sensible sería anonimizar destruyendo el propósito.
 */
export const HABEAS_DATA: PoliticaDeFabrica = {
  id: "habeas-data",
  nombre: "Habeas Data (Colombia)",
  fuente:
    "Ley 1581 de 2012 (art. 4 principios; art. 5 datos sensibles) y Decreto 1377 de 2013, " +
    "con las técnicas de la guía de anonimización AGN + SIC",
  advertencia:
    "Es la interpretación de Velo de la guía, aplicada a las columnas que Velo reconoció. No es " +
    "una certificación: la SIC no la emite y ningún programa que solo ve una tabla puede decidir " +
    "si un tratamiento es lícito. Revisa columna por columna antes de entregar.",
  porTipo: {
    cedula: { tipo: "seudonimizar-con-formato", formato: "cedula" },
    nit: { tipo: "seudonimizar-con-formato", formato: "nit" },
    fecha: { tipo: "generalizar-fecha", precision: "mes" },
  },
  porCategoria: {
    "identificador-directo": { tipo: "seudonimizar", longitud: 16 },
    "cuasi-identificador": { tipo: "generalizar-automatico" },
    // El dato sensible es el atributo objetivo del análisis, no la llave por la que se enlaza.
    "dato-sensible": { tipo: "conservar" },
    "no-personal": { tipo: "conservar" },
  },
  kObjetivo: 5,
  cobertura: [
    {
      referencia: "art. 5",
      identificador:
        "Datos sensibles (salud, origen étnico, convicciones, vida sexual, biometría)",
      deteccion: {
        via: "nombre-de-columna",
        nota: "No existe algoritmo que mire «J45.9» y sepa que es un diagnóstico: solo el encabezado lo sugiere, y Velo lo marca con certeza «sin confirmar».",
      },
    },
    {
      referencia: "identificadores",
      identificador: "Cédula, NIT, teléfonos, correo, placa, tarjeta, IBAN, IP",
      deteccion: {
        via: "validador",
        tipos: [
          "cedula",
          "nit",
          "celular-co",
          "fijo-co",
          "email",
          "placa-co",
          "tarjeta",
          "iban",
          "ip",
        ],
      },
    },
    {
      referencia: "identificadores",
      identificador: "Nombres y apellidos",
      deteccion: {
        via: "validador",
        tipos: ["nombre"],
      },
    },
    {
      referencia: "—",
      identificador:
        "Códigos internos de la organización (historia clínica, afiliado, contrato)",
      deteccion: {
        via: "ninguna",
        porque:
          "Un consecutivo propio no tiene forma reconocible ni checksum público. Si tu tabla lleva uno, márcalo tú: Velo no puede saberlo.",
      },
    },
  ],
};

// ── HIPAA Safe Harbor (Estados Unidos) ────────────────────────────────────────────────────────

/**
 * **Safe Harbor es SUPRESIÓN, no seudonimización**, y esa diferencia decide el diseño de esta
 * política. 45 CFR §164.514(b)(2) pide *eliminar* los 18 identificadores. El §164.514(c) permite
 * conservar un código de reidentificación, pero con una condición que aquí no se cumple: el código
 * **no puede derivarse de la información**. Un HMAC del valor se deriva del valor — así que
 * seudonimizar una cédula deja el archivo FUERA de Safe Harbor, por muy irreversible que sea.
 *
 * Por eso esta política suprime donde la norma dice suprimir, aunque el archivo pierda sus llaves
 * de cruce. Si necesitas conservar el cruce, la política de Habeas Data lo hace — y entonces el
 * resultado no es Safe Harbor, y Velo lo dice en vez de dejarlo creer.
 */
export const HIPAA: PoliticaDeFabrica = {
  id: "hipaa",
  nombre: "HIPAA · Safe Harbor",
  fuente:
    "45 CFR §164.514(b)(2)(i)(A)–(R) — los 18 identificadores del método Safe Harbor",
  advertencia:
    "Safe Harbor exige ELIMINAR los 18 identificadores, no seudonimizarlos: un código derivado " +
    "del propio valor —como un HMAC— no cumple el §164.514(c). Por eso esta política suprime, y " +
    "el archivo pierde sus llaves de cruce. Y no es una certificación: Velo no reconoce todos los " +
    "identificadores por sí solo, así que revisa la tabla de abajo y marca a mano los que le faltan.",
  porTipo: {
    // Fechas: Safe Harbor permite el AÑO. Cualquier precisión mayor sale.
    fecha: { tipo: "generalizar-fecha", precision: "anio" },
  },
  porCategoria: {
    "identificador-directo": { tipo: "suprimir" },
    "cuasi-identificador": { tipo: "generalizar-automatico" },
    "dato-sensible": { tipo: "conservar" },
    "no-personal": { tipo: "conservar" },
  },
  kObjetivo: 5,
  cobertura: [
    {
      referencia: "A",
      identificador: "Nombres",
      deteccion: { via: "validador", tipos: ["nombre"] },
    },
    {
      referencia: "B",
      identificador:
        "Subdivisiones geográficas menores que un estado (dirección, ciudad, condado, código postal)",
      deteccion: {
        via: "nombre-de-columna",
        nota: "Velo reconoce el encabezado (dirección, municipio, ciudad), no el valor. La regla de los 20.000 habitantes para los 3 primeros dígitos del ZIP es de censo estadounidense y Velo no la puede verificar.",
      },
    },
    {
      referencia: "C",
      identificador:
        "Todos los elementos de fechas salvo el año, y todas las edades por encima de 89",
      deteccion: {
        via: "validador",
        tipos: ["fecha"],
      },
    },
    {
      referencia: "D",
      identificador: "Números de teléfono",
      deteccion: { via: "validador", tipos: ["celular-co", "fijo-co"] },
    },
    {
      referencia: "E",
      identificador: "Números de fax",
      deteccion: {
        via: "ninguna",
        porque:
          "Un fax tiene exactamente la misma forma que un fijo: Velo lo marcará como teléfono, que basta para suprimirlo, pero no puede distinguir cuál es cuál.",
      },
    },
    {
      referencia: "F",
      identificador: "Direcciones de correo electrónico",
      deteccion: { via: "validador", tipos: ["email"] },
    },
    {
      referencia: "G",
      identificador: "Números de seguridad social",
      deteccion: {
        via: "ninguna",
        porque:
          "El SSN es estadounidense y Velo valida documentos colombianos. Márcalo tú.",
      },
    },
    {
      referencia: "H",
      identificador: "Números de historia clínica",
      deteccion: {
        via: "ninguna",
        porque:
          "Es un consecutivo interno de cada institución: sin forma reconocible ni checksum.",
      },
    },
    {
      referencia: "I",
      identificador: "Números de afiliado a plan de salud",
      deteccion: {
        via: "ninguna",
        porque: "Formato propio de cada asegurador.",
      },
    },
    {
      referencia: "J",
      identificador: "Números de cuenta",
      deteccion: {
        via: "validador",
        tipos: ["iban", "tarjeta"],
      },
    },
    {
      referencia: "K",
      identificador: "Números de certificado o licencia",
      deteccion: {
        via: "ninguna",
        porque: "Formato propio de cada entidad emisora.",
      },
    },
    {
      referencia: "L",
      identificador: "Identificadores de vehículo, incluida la placa",
      deteccion: { via: "validador", tipos: ["placa-co"] },
    },
    {
      referencia: "M",
      identificador: "Identificadores y seriales de dispositivos",
      deteccion: {
        via: "ninguna",
        porque: "Serial arbitrario del fabricante.",
      },
    },
    {
      referencia: "N",
      identificador: "URLs",
      deteccion: {
        via: "ninguna",
        porque:
          "Velo no trae validador de URL en el S1. Si tu tabla las lleva, márcalas tú.",
      },
    },
    {
      referencia: "O",
      identificador: "Direcciones IP",
      deteccion: { via: "validador", tipos: ["ip"] },
    },
    {
      referencia: "P",
      identificador: "Identificadores biométricos (huellas dactilares, de voz)",
      deteccion: {
        via: "nombre-de-columna",
        nota: "Solo por el encabezado: un vector biométrico en una celda es una cadena sin forma reconocible.",
      },
    },
    {
      referencia: "Q",
      identificador: "Fotografías de cara completa e imágenes comparables",
      deteccion: {
        via: "ninguna",
        porque:
          "Velo lee tablas, no imágenes. Una columna con rutas a fotos no la reconoce.",
      },
    },
    {
      referencia: "R",
      identificador:
        "Cualquier otro número, característica o código único de identificación",
      deteccion: {
        via: "ninguna",
        porque:
          "Es una cláusula de cierre: por definición no tiene forma. Es lo que hace que Safe Harbor no se pueda automatizar del todo, y por eso esta lista existe.",
      },
    },
  ],
};

export const POLITICAS_DE_FABRICA: readonly PoliticaDeFabrica[] = [
  HABEAS_DATA,
  HIPAA,
];

// ── De criterio a política concreta ───────────────────────────────────────────────────────────

/** Lo que hace falta de cada columna para decidir su técnica. Es un subconjunto del diagnóstico. */
export interface ColumnaParaPolitica {
  readonly nombre: string;
  readonly tipo: TipoDetectado;
  readonly categoria: CategoriaLey1581;
}

/**
 * Aplica el criterio de una política de fábrica a las columnas que Velo reconoció.
 *
 * El tipo manda sobre la categoría: una cédula tiene su tratamiento propio (seudónimo con formato
 * válido) que es más específico que «es un identificador directo». Sin regla por tipo, decide la
 * categoría; sin categoría reconocible, se conserva — nunca se inventa un tratamiento.
 */
export function construirPolitica(
  fabrica: PoliticaDeFabrica,
  columnas: readonly ColumnaParaPolitica[],
): Politica {
  return {
    version: 1,
    origen: fabrica.id,
    kObjetivo: fabrica.kObjetivo,
    reglas: columnas.map((columna) => ({
      columna: columna.nombre,
      tecnica:
        fabrica.porTipo[columna.tipo] ??
        fabrica.porCategoria[columna.categoria],
    })),
  };
}

/** Cuántos identificadores de la fuente reconoce Velo por sí solo, y cuántos no. */
export function resumenDeCobertura(fabrica: PoliticaDeFabrica): {
  automaticos: number;
  porNombre: number;
  manuales: number;
  total: number;
} {
  const cuenta = (via: Deteccion["via"]) =>
    fabrica.cobertura.filter((c) => c.deteccion.via === via).length;
  return {
    automaticos: cuenta("validador"),
    porNombre: cuenta("nombre-de-columna"),
    manuales: cuenta("ninguna"),
    total: fabrica.cobertura.length,
  };
}
