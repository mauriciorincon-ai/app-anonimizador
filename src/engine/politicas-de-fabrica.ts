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

import { mensaje } from "@/lib/idioma";
import type { MensajeDeMotor } from "@/lib/idioma/mensajes";

import type { CategoriaLey1581, TipoDetectado } from "./validadores/tipos";
import type { Politica, Tecnica } from "./politica";

/** Cómo Velo alcanza (o no) a reconocer un identificador de la fuente. */
export type Deteccion =
  | { via: "validador"; tipos: readonly TipoDetectado[] }
  | { via: "nombre-de-columna"; nota: MensajeDeMotor }
  | { via: "ninguna"; porque: MensajeDeMotor };

export interface CoberturaDeIdentificador {
  /** La letra del literal en la norma, cuando la norma los enumera. */
  readonly referencia: string;
  readonly identificador: MensajeDeMotor;
  readonly deteccion: Deteccion;
}

export interface PoliticaDeFabrica {
  readonly id: "habeas-data" | "hipaa";
  /** Nombre propio: se escribe igual en los dos idiomas, así que no es un mensaje. */
  readonly nombre: string;
  /**
   * Prosa en `MensajeDeMotor`, no en `string`: el motor no escribe frases. Ninguno de estos campos
   * entra a la `Politica` que se exporta ni a su hash (`construirPolitica` solo copia `id`,
   * `kObjetivo` y las reglas), así que cambiar de idioma no cambia la identidad de nada.
   */
  readonly fuente: MensajeDeMotor;
  /** Qué promete y qué no. Va a la UI tal cual: no es una nota al pie opcional. */
  readonly advertencia: MensajeDeMotor;
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
  fuente: mensaje("fabrica.habeas.fuente"),
  advertencia: mensaje("fabrica.habeas.advertencia"),
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
      identificador: mensaje("fabrica.habeas.cob.sensibles.id"),
      deteccion: {
        via: "nombre-de-columna",
        nota: mensaje("fabrica.habeas.cob.sensibles.nota"),
      },
    },
    {
      referencia: "identificadores",
      identificador: mensaje("fabrica.habeas.cob.identificadores.id"),
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
      identificador: mensaje("fabrica.habeas.cob.nombres.id"),
      deteccion: {
        via: "validador",
        tipos: ["nombre"],
      },
    },
    {
      referencia: "—",
      identificador: mensaje("fabrica.habeas.cob.internos.id"),
      deteccion: {
        via: "ninguna",
        porque: mensaje("fabrica.habeas.cob.internos.porque"),
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
  fuente: mensaje("fabrica.hipaa.fuente"),
  advertencia: mensaje("fabrica.hipaa.advertencia"),
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
      identificador: mensaje("fabrica.hipaa.cob.A.id"),
      deteccion: { via: "validador", tipos: ["nombre"] },
    },
    {
      referencia: "B",
      identificador: mensaje("fabrica.hipaa.cob.B.id"),
      deteccion: {
        via: "nombre-de-columna",
        nota: mensaje("fabrica.hipaa.cob.B.nota"),
      },
    },
    {
      referencia: "C",
      identificador: mensaje("fabrica.hipaa.cob.C.id"),
      deteccion: {
        via: "validador",
        tipos: ["fecha"],
      },
    },
    {
      referencia: "D",
      identificador: mensaje("fabrica.hipaa.cob.D.id"),
      deteccion: { via: "validador", tipos: ["celular-co", "fijo-co"] },
    },
    {
      referencia: "E",
      identificador: mensaje("fabrica.hipaa.cob.E.id"),
      deteccion: {
        via: "ninguna",
        porque: mensaje("fabrica.hipaa.cob.E.porque"),
      },
    },
    {
      referencia: "F",
      identificador: mensaje("fabrica.hipaa.cob.F.id"),
      deteccion: { via: "validador", tipos: ["email"] },
    },
    {
      referencia: "G",
      identificador: mensaje("fabrica.hipaa.cob.G.id"),
      deteccion: {
        via: "ninguna",
        porque: mensaje("fabrica.hipaa.cob.G.porque"),
      },
    },
    {
      referencia: "H",
      identificador: mensaje("fabrica.hipaa.cob.H.id"),
      deteccion: {
        via: "ninguna",
        porque: mensaje("fabrica.hipaa.cob.H.porque"),
      },
    },
    {
      referencia: "I",
      identificador: mensaje("fabrica.hipaa.cob.I.id"),
      deteccion: {
        via: "ninguna",
        porque: mensaje("fabrica.hipaa.cob.I.porque"),
      },
    },
    {
      referencia: "J",
      identificador: mensaje("fabrica.hipaa.cob.J.id"),
      deteccion: {
        via: "validador",
        tipos: ["iban", "tarjeta"],
      },
    },
    {
      referencia: "K",
      identificador: mensaje("fabrica.hipaa.cob.K.id"),
      deteccion: {
        via: "ninguna",
        porque: mensaje("fabrica.hipaa.cob.K.porque"),
      },
    },
    {
      referencia: "L",
      identificador: mensaje("fabrica.hipaa.cob.L.id"),
      deteccion: { via: "validador", tipos: ["placa-co"] },
    },
    {
      referencia: "M",
      identificador: mensaje("fabrica.hipaa.cob.M.id"),
      deteccion: {
        via: "ninguna",
        porque: mensaje("fabrica.hipaa.cob.M.porque"),
      },
    },
    {
      referencia: "N",
      identificador: mensaje("fabrica.hipaa.cob.N.id"),
      deteccion: {
        via: "ninguna",
        porque: mensaje("fabrica.hipaa.cob.N.porque"),
      },
    },
    {
      referencia: "O",
      identificador: mensaje("fabrica.hipaa.cob.O.id"),
      deteccion: { via: "validador", tipos: ["ip"] },
    },
    {
      referencia: "P",
      identificador: mensaje("fabrica.hipaa.cob.P.id"),
      deteccion: {
        via: "nombre-de-columna",
        nota: mensaje("fabrica.hipaa.cob.P.nota"),
      },
    },
    {
      referencia: "Q",
      identificador: mensaje("fabrica.hipaa.cob.Q.id"),
      deteccion: {
        via: "ninguna",
        porque: mensaje("fabrica.hipaa.cob.Q.porque"),
      },
    },
    {
      referencia: "R",
      identificador: mensaje("fabrica.hipaa.cob.R.id"),
      deteccion: {
        via: "ninguna",
        porque: mensaje("fabrica.hipaa.cob.R.porque"),
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
 *
 * **Con una excepción que costó un hallazgo:** si la política declara un `kObjetivo`, los
 * cuasi-identificadores entran al reparto aunque tengan regla por tipo. La versión anterior dejaba
 * que `fecha_nacimiento` recibiera «recortar al año» —correcto por sí solo, y recomendado por la
 * guía— y con eso la sacaba de Mondrian: el reparto alcanzaba k=7 sobre las columnas que sí
 * miraba, y el archivo entregado quedaba en **k=1**, porque la fecha recortada seguía partiendo las
 * clases. La política prometía un k que sus propias reglas impedían cumplir.
 *
 * No es una preferencia de implementación: **k-anonimato es una propiedad del conjunto de
 * cuasi-identificadores**, así que un QI fuera del reparto no es una excepción al k — es su
 * negación. Las reglas por tipo siguen mandando en todo lo demás (`fecha_atencion`, que es no
 * personal, se sigue recortando al año).
 */
export function construirPolitica(
  fabrica: PoliticaDeFabrica,
  columnas: readonly ColumnaParaPolitica[],
): Politica {
  const conK = fabrica.kObjetivo !== null;
  return {
    version: 1,
    origen: fabrica.id,
    kObjetivo: fabrica.kObjetivo,
    reglas: columnas.map((columna) => ({
      columna: columna.nombre,
      tecnica:
        conK && columna.categoria === "cuasi-identificador"
          ? fabrica.porCategoria["cuasi-identificador"]
          : (fabrica.porTipo[columna.tipo] ??
            fabrica.porCategoria[columna.categoria]),
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
