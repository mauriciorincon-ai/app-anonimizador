// Ruido con garantía (S7): tres técnicas por celda, y lo que cada una promete y lo que NO.
//
//   · `laplace` — privacidad diferencial LOCAL, ε por valor de este campo. El número se recorta al
//     rango que la política DECLARA (no al del archivo: un rango sacado de los datos ya delataría
//     algo), se pasa a la rejilla de sus decimales, se le suma Laplace discreto exacto de escala
//     (máximo − mínimo)/ε y se vuelve a recortar, que es posproceso y no gasta privacidad.
//   · `respuesta-aleatorizada` — privacidad diferencial LOCAL, ε efectivo exacto ≤ ε pedido. El
//     dominio son los valores distintos de la columna (hasta 64), y eso se dice: los valores
//     POSIBLES salen del archivo, así que aparecer en el dominio no está protegido por ε.
//   · `perturbar` — ±x % de ruido uniforme. **Sin garantía formal**, y se rotula así en todas partes.
//
// Lo que ninguna promete: ε protege el valor de UN campo de UNA fila frente a quien ve la salida;
// no dice nada de las demás columnas, ni se compone con el k (que se mide aparte), ni sobrevive a
// entregar el mismo dato varias veces (cada entrega gasta su ε; la composición es la suma). El
// vacío sigue vacío, y lo que no es un número en una columna con Laplace se queda y se cuenta.

import { ConstructorColumnar, type ColumnaColumnar } from "../columnar";
import type { Tecnica } from "../politica";
import { serializarCanonico } from "../serializacion";
import { AzarSembrado, semillaDeCelda, TOPE_UNIFORME } from "./azar";
import {
  DOS_A_LA_32,
  EPSILONES,
  epsilonEfectivo,
  laplaceDiscreto,
  pesoDelAzar,
  type ClaveDeEpsilon,
} from "./muestreo";

export type TecnicaDeRuido = Extract<
  Tecnica,
  { tipo: "laplace" | "respuesta-aleatorizada" | "perturbar" }
>;

import { DOMINIO_MAXIMO } from "./limites";

export { DOMINIO_MAXIMO };

/** Lo que se aplicó a una columna, para la pantalla, el certificado y la bitácora. */
export interface InformeDeRuido {
  readonly columna: string;
  readonly mecanismo: TecnicaDeRuido["tipo"];
  /** El ε pedido; null en `perturbar`, que no tiene. */
  readonly epsilon: number | null;
  /** El ε que de verdad se garantiza (≤ el pedido); null en `perturbar` y si no se aplicó. */
  readonly epsilonEfectivo: number | null;
  /** Celdas que recibieron ruido (las no vacías que se pudieron tratar). */
  readonly tratadas: number;
  /** Laplace: valores que cayeron fuera del rango declarado y se recortaron antes del ruido. */
  readonly recortes: number;
  /** Laplace y perturbar: celdas que no eran un número y se quedaron como estaban. */
  readonly noNumericas: number;
  /** Respuesta aleatorizada: el número de valores del dominio. */
  readonly dominio: number | null;
  /**
   * Solo en alto volumen (S8), cuando la columna no cupo entera: `dominio` es un MÍNIMO (hay más),
   * y lo único que se sabe es que pasa de 64. Ausente en memoria, donde la cifra es exacta.
   */
  readonly dominioAlMenos?: true;
  /** false cuando NO se aplicó (un dominio de más de 64 valores): la columna salió intacta. */
  readonly aplicado: boolean;
}

// ── Números exactos en una rejilla decimal ─────────────────────────────────────────────────────

const NUMERO = /^(-?)(\d+)(?:[.,](\d+))?$/;

/** `"37,25"` con 1 decimal → 373 (redondeo mitad hacia arriba, sobre los dígitos: sin flotantes). */
export function aUnidades(texto: string, decimales: number): number | null {
  const m = NUMERO.exec(texto.trim());
  if (!m) return null;
  const fraccion = (m[3] ?? "").padEnd(decimales + 1, "0");
  let unidades =
    Number(m[2]) * 10 ** decimales +
    Number(fraccion.slice(0, decimales) || "0");
  if (Number(fraccion[decimales]) >= 5) unidades += 1;
  if (!Number.isSafeInteger(unidades)) return null;
  return m[1] === "-" && unidades !== 0 ? -unidades : unidades;
}

/** 373 con 1 decimal → `"37.3"`. El separador de salida es siempre el punto. */
export function deUnidades(unidades: number, decimales: number): string {
  const signo = unidades < 0 ? "-" : "";
  const absoluto = Math.abs(unidades);
  if (decimales === 0) return `${signo}${absoluto}`;
  const escala = 10 ** decimales;
  const entera = Math.floor(absoluto / escala);
  const fraccion = String(absoluto % escala).padStart(decimales, "0");
  return `${signo}${entera}.${fraccion}`;
}

/** Los decimales con que vino escrito un número (`"37,25"` → 2). */
function decimalesDe(texto: string): number {
  return NUMERO.exec(texto.trim())?.[3]?.length ?? 0;
}

/** Sensibilidad en unidades de la rejilla y escala t del Laplace, o null si no caben exactas. */
export function escalaDelLaplace(
  tecnica: Extract<TecnicaDeRuido, { tipo: "laplace" }>,
): { minimo: number; maximo: number; s: number; t: number } | null {
  const minimo = aUnidades(String(tecnica.minimo), tecnica.decimales);
  const maximo = aUnidades(String(tecnica.maximo), tecnica.decimales);
  if (minimo === null || maximo === null || maximo <= minimo) return null;
  const [a, b] = EPSILONES[clave(tecnica.epsilon)];
  const t = b * (maximo - minimo);
  return t <= TOPE_UNIFORME ? { minimo, maximo, s: a, t } : null;
}

function clave(epsilon: number): ClaveDeEpsilon {
  return String(epsilon) as ClaveDeEpsilon;
}

/** Recorta a [minimo, maximo]. */
const recortar = (x: number, minimo: number, maximo: number) =>
  Math.min(maximo, Math.max(minimo, x));

// ── Las tres técnicas ───────────────────────────────────────────────────────────────────────────

/**
 * Lo que una columna con ruido necesita ANTES de tocar una celda: el dominio de la respuesta
 * aleatorizada (sus valores distintos, en orden de primera aparición), su peso, la escala del
 * Laplace y la firma de la técnica para la semilla. Y los contadores, que suben celda a celda.
 *
 * Existe aparte (S8) para que el alto volumen aplique el ruido fila a fila, sin la columna entera en
 * memoria, con EXACTAMENTE el mismo código que `aplicarRuido`: la columna, celda por celda, y el
 * informe, del mismo sitio.
 */
export interface RuidoDeColumna {
  readonly nombre: string;
  readonly tecnica: TecnicaDeRuido;
  readonly huella: string;
  readonly firma: string;
  readonly dominio: readonly string[];
  /** Cuántos valores distintos tiene la columna: `dominio.length`, salvo que no quepa entera (S8). */
  readonly distintos: number;
  /** ¿`distintos` es solo un mínimo? (alto volumen, columna que no cupo entera). */
  readonly alMenos: boolean;
  readonly peso: number;
  readonly escala: ReturnType<typeof escalaDelLaplace>;
  /** Falso solo para una respuesta aleatorizada con más de `DOMINIO_MAXIMO` valores. */
  readonly aplicable: boolean;
  tratadas: number;
  recortes: number;
  noNumericas: number;
}

/**
 * `dominio` son los valores distintos de la columna, sin el vacío, en orden de primera aparición.
 * `distintos` es cuántos son: lo mismo que `dominio.length`, salvo en alto volumen cuando la columna
 * no cupo entera (S8) y se sabe solo que tiene más de los que cabían, que ya es más de 64.
 */
export function prepararRuido(
  nombre: string,
  dominio: readonly string[],
  tecnica: TecnicaDeRuido,
  huella: string,
  distintos = dominio.length,
  alMenos = false,
): RuidoDeColumna {
  const aplicable = !(
    tecnica.tipo === "respuesta-aleatorizada" && distintos > DOMINIO_MAXIMO
  );
  const peso =
    aplicable && tecnica.tipo === "respuesta-aleatorizada"
      ? pesoDelAzar(dominio.length, clave(tecnica.epsilon))
      : 0;
  const escala = tecnica.tipo === "laplace" ? escalaDelLaplace(tecnica) : null;
  if (tecnica.tipo === "laplace" && escala === null)
    // El esquema de la política ya lo impide; si llega, es un defecto nuestro y suena.
    throw new Error("laplace: rango que no cabe exacto");
  return {
    nombre,
    tecnica,
    huella,
    // Los parámetros entran a la semilla: otra técnica, otro azar (ver `azar.ts`).
    firma: serializarCanonico(tecnica),
    dominio,
    distintos,
    alMenos,
    peso,
    escala,
    aplicable,
    tratadas: 0,
    recortes: 0,
    noNumericas: 0,
  };
}

/**
 * El valor con ruido de UNA celda no vacía, en la fila `f` (absoluta: la del archivo entero). La
 * semilla sale de la llave, la huella del archivo, la técnica, la columna y la fila.
 */
export async function ruidoDeCelda(
  ruido: RuidoDeColumna,
  llave: CryptoKey,
  valor: string,
  f: number,
): Promise<string> {
  const { tecnica } = ruido;
  const azar = new AzarSembrado(
    await semillaDeCelda(llave, ruido.huella, ruido.firma, ruido.nombre, f),
  );

  if (tecnica.tipo === "respuesta-aleatorizada") {
    ruido.tratadas++;
    const alAzar = azar.uniforme(DOS_A_LA_32) < ruido.peso;
    return alAzar ? ruido.dominio[azar.uniforme(ruido.dominio.length)] : valor;
  }

  if (tecnica.tipo === "laplace") {
    const x = aUnidades(valor, tecnica.decimales);
    if (x === null) {
      ruido.noNumericas++;
      return valor;
    }
    const { minimo, maximo, s, t } = ruido.escala!;
    const dentro = recortar(x, minimo, maximo);
    if (dentro !== x) ruido.recortes++;
    ruido.tratadas++;
    const y = recortar(dentro + laplaceDiscreto(azar, s, t), minimo, maximo);
    return deUnidades(y, tecnica.decimales);
  }

  // perturbar: x · (1 + r), con r uniforme en [−p %, +p %] a pasos de 0,01 %, en los decimales
  // con que vino escrito el valor. BigInt para que el producto no pierda dígitos.
  const decimales = decimalesDe(valor);
  const x = aUnidades(valor, decimales);
  if (x === null) {
    ruido.noNumericas++;
    return valor;
  }
  ruido.tratadas++;
  const pasos = tecnica.porcentaje * 100;
  const r = azar.uniforme(2 * pasos + 1) - pasos;
  const producto = BigInt(x) * BigInt(10_000 + r);
  const y = Number(redondear(producto, BigInt(10_000)));
  return deUnidades(y, decimales);
}

/** Lo que se aplicó, con los contadores que dejaron las celdas. */
export function informeDelRuido(ruido: RuidoDeColumna): InformeDeRuido {
  const { tecnica } = ruido;
  const base = {
    columna: ruido.nombre,
    mecanismo: tecnica.tipo,
    epsilon: tecnica.tipo === "perturbar" ? null : tecnica.epsilon,
  };
  if (!ruido.aplicable)
    return {
      ...base,
      epsilonEfectivo: null,
      tratadas: 0,
      recortes: 0,
      noNumericas: 0,
      dominio: ruido.distintos,
      ...(ruido.alMenos ? { dominioAlMenos: true as const } : {}),
      aplicado: false,
    };
  return {
    ...base,
    epsilonEfectivo:
      tecnica.tipo === "laplace"
        ? tecnica.epsilon
        : tecnica.tipo === "respuesta-aleatorizada"
          ? epsilonEfectivo(ruido.dominio.length, ruido.peso)
          : null,
    tratadas: ruido.tratadas,
    recortes: ruido.recortes,
    noNumericas: ruido.noNumericas,
    dominio:
      tecnica.tipo === "respuesta-aleatorizada" ? ruido.dominio.length : null,
    aplicado: true,
  };
}

/**
 * Aplica una técnica de ruido a una columna, celda por celda. `huella` es el SHA-256 del archivo de
 * entrada (ver `azar.ts`: hace independiente el ruido de dos archivos distintos).
 */
export async function aplicarRuido(
  columna: ColumnaColumnar,
  tecnica: TecnicaDeRuido,
  llave: CryptoKey,
  huella: string,
): Promise<{ columna: ColumnaColumnar; informe: InformeDeRuido }> {
  // La respuesta aleatorizada necesita su dominio ANTES de tocar una celda.
  const ruido = prepararRuido(
    columna.nombre,
    columna.valores.slice(1),
    tecnica,
    huella,
  );
  if (!ruido.aplicable) return { columna, informe: informeDelRuido(ruido) };

  const filas = columna.codigos.length;
  const salida = new ConstructorColumnar([columna.nombre], filas || 1);
  for (let f = 0; f < filas; f++) {
    const valor = columna.valores[columna.codigos[f]];
    salida.agregarFila([
      valor === "" ? "" : await ruidoDeCelda(ruido, llave, valor, f),
    ]);
  }

  const nueva = salida.finalizar().columnas[0];
  return {
    columna:
      columna.ruta === undefined ? nueva : { ...nueva, ruta: columna.ruta },
    informe: informeDelRuido(ruido),
  };
}

/** a / b redondeado a la mitad hacia arriba en valor absoluto, entero. */
function redondear(a: bigint, b: bigint): bigint {
  const cero = BigInt(0);
  const dos = BigInt(2);
  const negativo = a < cero;
  const absoluto = negativo ? -a : a;
  const q = (absoluto * dos + b) / (dos * b);
  return negativo ? -q : q;
}

/** Lo que cruza a la página: cada columna con ruido, y el ε por fila que suman. */
export interface InformeDePrivacidad {
  readonly columnas: readonly InformeDeRuido[];
  /**
   * La suma del ε efectivo de las columnas con privacidad diferencial que SÍ se aplicaron: lo que
   * una fila entera revela, por composición (la suma es la cota de la composición secuencial).
   * `perturbar` no suma: no tiene ε.
   */
  readonly epsilonPorFila: number;
}

export function informeDePrivacidad(
  ruido: readonly InformeDeRuido[],
): InformeDePrivacidad | null {
  if (ruido.length === 0) return null;
  const epsilonPorFila = ruido.reduce(
    (suma, r) =>
      r.aplicado && r.epsilonEfectivo !== null
        ? suma + r.epsilonEfectivo
        : suma,
    0,
  );
  return { columnas: ruido, epsilonPorFila };
}
