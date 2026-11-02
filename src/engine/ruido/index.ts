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
 * Aplica una técnica de ruido a una columna, celda por celda. `huella` es el SHA-256 del archivo de
 * entrada (ver `azar.ts`: hace independiente el ruido de dos archivos distintos).
 */
export async function aplicarRuido(
  columna: ColumnaColumnar,
  tecnica: TecnicaDeRuido,
  llave: CryptoKey,
  huella: string,
): Promise<{ columna: ColumnaColumnar; informe: InformeDeRuido }> {
  const filas = columna.codigos.length;
  const base = {
    columna: columna.nombre,
    mecanismo: tecnica.tipo,
    epsilon: tecnica.tipo === "perturbar" ? null : tecnica.epsilon,
  };

  // La respuesta aleatorizada necesita su dominio ANTES de tocar una celda.
  const dominio = columna.valores.slice(1);
  if (
    tecnica.tipo === "respuesta-aleatorizada" &&
    dominio.length > DOMINIO_MAXIMO
  )
    return {
      columna,
      informe: {
        ...base,
        epsilonEfectivo: null,
        tratadas: 0,
        recortes: 0,
        noNumericas: 0,
        dominio: dominio.length,
        aplicado: false,
      },
    };
  const peso =
    tecnica.tipo === "respuesta-aleatorizada"
      ? pesoDelAzar(dominio.length, clave(tecnica.epsilon))
      : 0;
  const escala = tecnica.tipo === "laplace" ? escalaDelLaplace(tecnica) : null;
  if (tecnica.tipo === "laplace" && escala === null)
    // El esquema de la política ya lo impide; si llega, es un defecto nuestro y suena.
    throw new Error("laplace: rango que no cabe exacto");

  let tratadas = 0;
  let recortes = 0;
  let noNumericas = 0;
  const salida = new ConstructorColumnar([columna.nombre], filas || 1);
  // Los parámetros entran a la semilla: otra técnica, otro azar (ver `azar.ts`).
  const firmaDeLaTecnica = serializarCanonico(tecnica);

  for (let f = 0; f < filas; f++) {
    const valor = columna.valores[columna.codigos[f]];
    if (valor === "") {
      salida.agregarFila([""]);
      continue;
    }
    const azar = new AzarSembrado(
      await semillaDeCelda(llave, huella, firmaDeLaTecnica, columna.nombre, f),
    );

    if (tecnica.tipo === "respuesta-aleatorizada") {
      tratadas++;
      const alAzar = azar.uniforme(DOS_A_LA_32) < peso;
      salida.agregarFila([
        alAzar ? dominio[azar.uniforme(dominio.length)] : valor,
      ]);
      continue;
    }

    if (tecnica.tipo === "laplace") {
      const x = aUnidades(valor, tecnica.decimales);
      if (x === null) {
        noNumericas++;
        salida.agregarFila([valor]);
        continue;
      }
      const { minimo, maximo, s, t } = escala!;
      const dentro = recortar(x, minimo, maximo);
      if (dentro !== x) recortes++;
      tratadas++;
      const y = recortar(dentro + laplaceDiscreto(azar, s, t), minimo, maximo);
      salida.agregarFila([deUnidades(y, tecnica.decimales)]);
      continue;
    }

    // perturbar: x · (1 + r), con r uniforme en [−p %, +p %] a pasos de 0,01 %, en los decimales
    // con que vino escrito el valor. BigInt para que el producto no pierda dígitos.
    const decimales = decimalesDe(valor);
    const x = aUnidades(valor, decimales);
    if (x === null) {
      noNumericas++;
      salida.agregarFila([valor]);
      continue;
    }
    tratadas++;
    const pasos = tecnica.porcentaje * 100;
    const r = azar.uniforme(2 * pasos + 1) - pasos;
    const producto = BigInt(x) * BigInt(10_000 + r);
    const y = Number(redondear(producto, BigInt(10_000)));
    salida.agregarFila([deUnidades(y, decimales)]);
  }

  const nueva = salida.finalizar().columnas[0];
  return {
    columna:
      columna.ruta === undefined ? nueva : { ...nueva, ruta: columna.ruta },
    informe: {
      ...base,
      epsilonEfectivo:
        tecnica.tipo === "laplace"
          ? tecnica.epsilon
          : tecnica.tipo === "respuesta-aleatorizada"
            ? epsilonEfectivo(dominio.length, peso)
            : null,
      tratadas,
      recortes,
      noNumericas,
      dominio:
        tecnica.tipo === "respuesta-aleatorizada" ? dominio.length : null,
      aplicado: true,
    },
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
