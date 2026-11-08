// UNA TABLA COMO SI FUERA UN ARCHIVO (S9, ADR-017).
//
// El motor del S8 trabaja sobre filas de texto en lotes. Una tabla se convierte en eso con tres
// piezas, y nada más:
//
//   · `fuenteDeTabla`: las filas por lotes ORDENADOS POR LA LLAVE PRIMARIA, cada celda como texto
//     (el NULL, como vacío). Es la `FuenteDeFilas` que `src/workers/alto-volumen.ts` acepta además
//     del `Blob` de un CSV. Cada pasada recalcula la huella de lo que lee y, si no es la de la
//     primera lectura, se niega: una tabla viva que cambia entre pasadas no se promete.
//   · `SumideroDeTabla`: lo que el motor escribe como CSV (el mismo que escribiría a un archivo, con
//     los mismos bytes y la misma huella de salida) se parte en filas y se inserta en la tabla NUEVA.
//   · `anonimizarTabla` y `restaurarTabla`: todo, dentro de UNA transacción en UNA conexión. La
//     tabla de origen jamás recibe una escritura, y su huella antes y después tiene que ser la misma.
//
// La huella de una tabla es el SHA-256 de su CSV canónico: el encabezado y cada fila, en el orden de
// la llave, con las celdas como texto. Quien exporte la tabla a CSV en ese orden obtiene la misma.

import Papa from "papaparse";

import { filaDeCsv } from "@/engine/csv";
import type { Boveda } from "@/engine/boveda";
import type { Politica } from "@/engine/politica";
import { nombreDelCertificado } from "@/engine/reporte";
import type { Idioma } from "@/lib/idioma";
import type { LlaveDeProyecto } from "@/lib/llave";
import { Sha256 } from "@/lib/sha256";
import type { FuenteDeFilas } from "@/workers/alto-volumen";

import {
  anonimizar,
  DestinoConHuella,
  leer,
  resolverPolitica,
  restaurar,
  type Origen,
  type ResultadoDeAnonimizar,
  type Sumidero,
} from "../nucleo";
import { ErrorDeVelo } from "../textos";
import {
  COLUMNA_DE_FILA,
  LARGO_MAXIMO_DE_NOMBRE,
  SUFIJO_ANONIMIZADA,
  SUFIJO_RESTAURADA,
  type Conexion,
  type TablaValidada,
} from "./motor";

/** Filas por consulta. Más grande no es más rápido; más chico, más viajes a la base. */
const FILAS_POR_LOTE = 5_000;

const ETIQUETA_DE_MOTOR = {
  postgres: "PostgreSQL",
  mssql: "SQL Server",
} as const;

// ── Reconocer la tabla ────────────────────────────────────────────────────────────────────────

/**
 * La tabla, tal como la ve la base: existe, se puede leer y tiene llave primaria. Las columnas de
 * datos no incluyen la de fila de Velo (la que llevan las tablas que Velo escribe).
 */
export async function validarTabla(
  conexion: Conexion,
  esquema: string,
  tabla: string,
): Promise<TablaValidada> {
  const { columnas, llave } = await conexion.describir(esquema, tabla);
  if (columnas.length === 0)
    throw new ErrorDeVelo("tablaDesconocida", { tabla: `${esquema}.${tabla}` });
  if (llave.length === 0)
    throw new ErrorDeVelo("sinLlavePrimaria", { tabla: `${esquema}.${tabla}` });
  const esDeVelo = llave.length === 1 && llave[0] === COLUMNA_DE_FILA;
  if (!esDeVelo && columnas.some((c) => c.nombre === COLUMNA_DE_FILA))
    throw new ErrorDeVelo("columnaReservada", { columna: COLUMNA_DE_FILA });
  return {
    esquema,
    tabla,
    columnas: columnas.filter((c) => c.nombre !== COLUMNA_DE_FILA),
    llave,
  };
}

/** El nombre de la tabla nueva, y que quepa: PostgreSQL trunca en silencio y Velo prefiere negarse. */
export function nombreDeLaNueva(
  origen: string,
  sufijo: string,
  conexion: Conexion,
): string {
  const base =
    sufijo === SUFIJO_RESTAURADA && origen.endsWith(SUFIJO_ANONIMIZADA)
      ? origen.slice(0, -SUFIJO_ANONIMIZADA.length)
      : origen;
  const nombre = `${base}${sufijo}`;
  if (Buffer.byteLength(nombre) > LARGO_MAXIMO_DE_NOMBRE[conexion.motor])
    throw new ErrorDeVelo("nombreLargo", {
      maximo: LARGO_MAXIMO_DE_NOMBRE[conexion.motor],
    });
  return nombre;
}

// ── Leer: la tabla como filas de texto ────────────────────────────────────────────────────────

/** Las filas de la tabla en orden de llave, por lotes; la primera fila del primer lote es el encabezado. */
async function* recorrer(
  conexion: Conexion,
  tabla: TablaValidada,
): AsyncGenerator<string[][]> {
  const ancho = tabla.columnas.length;
  let despuesDe: string[] | null = null;
  let primero = true;
  for (;;) {
    const filas = await conexion.leer(tabla, despuesDe, FILAS_POR_LOTE);
    const lote: string[][] = primero
      ? [tabla.columnas.map((c) => c.nombre)]
      : [];
    primero = false;
    for (const f of filas)
      lote.push(f.slice(0, ancho).map((v) => (v === null ? "" : String(v))));
    if (filas.length > 0) {
      const ultima = filas[filas.length - 1];
      despuesDe = ultima.slice(ancho).map((v) => String(v));
    }
    if (lote.length > 0) yield lote;
    if (filas.length < FILAS_POR_LOTE) return;
  }
}

export interface HuellaDeTabla {
  readonly sha256: string;
  readonly bytes: number;
  /** Filas de datos, sin el encabezado. */
  readonly filas: number;
}

/** La huella canónica de la tabla: el SHA-256 de su CSV en el orden de la llave. */
export async function huellaDeTabla(
  conexion: Conexion,
  tabla: TablaValidada,
): Promise<HuellaDeTabla> {
  const acumulador = new Sha256();
  const codificador = new TextEncoder();
  let bytes = 0;
  let filas = 0;
  for await (const lote of recorrer(conexion, tabla)) {
    for (const fila of lote) {
      const trozo = codificador.encode(filaDeCsv(fila));
      acumulador.actualizar(trozo);
      bytes += trozo.length;
      filas++;
    }
  }
  return {
    sha256: acumulador.terminar(),
    bytes,
    filas: Math.max(0, filas - 1),
  };
}

/**
 * La tabla como `FuenteDeFilas`. Cada vez que se recorre entera, su huella tiene que ser `esperada`:
 * si la tabla cambió entre una pasada y otra, el certificado habría atado la huella de otra cosa.
 */
export function fuenteDeTabla(
  conexion: Conexion,
  tabla: TablaValidada,
  esperada: HuellaDeTabla,
): FuenteDeFilas {
  return {
    bytes: esperada.bytes,
    async *lotes() {
      const acumulador = new Sha256();
      const codificador = new TextEncoder();
      for await (const lote of recorrer(conexion, tabla)) {
        for (const fila of lote)
          acumulador.actualizar(codificador.encode(filaDeCsv(fila)));
        yield lote;
      }
      if (acumulador.terminar() !== esperada.sha256)
        throw new ErrorDeVelo("tablaCambio");
    },
  };
}

// ── Escribir: el CSV del motor, a una tabla nueva ─────────────────────────────────────────────

/**
 * Recibe los bytes que el motor escribiría a un archivo. Cada llamada trae filas COMPLETAS (la
 * primera, el encabezado, solo o con las primeras filas), así que se puede partir con un lector de
 * CSV sin guardar nada entre una llamada y otra, salvo el número de fila.
 */
export class SumideroDeTabla implements Sumidero {
  private encabezado: string[] | null = null;
  private fila = 1;
  private readonly decodificador = new TextDecoder();

  constructor(
    private readonly conexion: Conexion,
    private readonly esquema: string,
    private readonly tabla: string,
    private readonly reemplazar: boolean,
  ) {}

  async escribir(bytes: Uint8Array): Promise<void> {
    const texto = this.decodificador.decode(bytes);
    const leidas = Papa.parse<string[]>(texto, {
      delimiter: ",",
      newline: "\n",
      skipEmptyLines: false,
    }).data;
    // El texto termina en salto de línea: el lector ve una fila vacía de más al final.
    if (texto.endsWith("\n")) leidas.pop();
    if (this.encabezado === null) {
      this.encabezado = leidas.shift() ?? [];
      await this.conexion.crear(
        this.esquema,
        this.tabla,
        this.encabezado,
        this.reemplazar,
      );
    }
    if (leidas.length === 0) return;
    await this.conexion.insertar(
      this.esquema,
      this.tabla,
      this.encabezado,
      this.fila,
      leidas,
    );
    this.fila += leidas.length;
  }
}

// ── Anonimizar y restaurar una tabla ──────────────────────────────────────────────────────────

export interface PedidoDeTabla {
  readonly conexion: Conexion;
  readonly esquema: string;
  readonly tabla: string;
  readonly idioma: Idioma;
  readonly fecha: string;
  readonly reemplazar: boolean;
}

export interface TablaTratada {
  readonly nombreDeLaNueva: string;
  /** La huella de la tabla de origen: la misma antes y después, o no se confirma nada. */
  readonly huellaDeOrigen: HuellaDeTabla;
}

/** Elige el nombre de la nueva y comprueba que no exista (salvo `reemplazar`). */
async function destinoLibre(p: PedidoDeTabla, sufijo: string): Promise<string> {
  const nombre = nombreDeLaNueva(p.tabla, sufijo, p.conexion);
  if (!p.reemplazar && (await p.conexion.existe(p.esquema, nombre)))
    throw new ErrorDeVelo("tablaDestinoExiste", {
      tabla: `${p.esquema}.${nombre}`,
    });
  return nombre;
}

export async function anonimizarTabla(
  p: PedidoDeTabla & {
    readonly politica:
      { readonly fabrica: string } | { readonly texto: string };
    readonly llave: LlaveDeProyecto;
    /**
     * Lo último antes del COMMIT, con todo ya comprobado: la orden escribe aquí el certificado, la
     * bóveda y la bitácora. Si falla (un archivo que ya existe), se hace ROLLBACK: no queda una
     * tabla nueva sin su certificado.
     */
    readonly antesDeConfirmar?: (
      resultado: ResultadoDeAnonimizar,
      nombreDeLaNueva: string,
    ) => Promise<void>;
  },
): Promise<
  TablaTratada & {
    readonly resultado: ResultadoDeAnonimizar;
    readonly politicaAplicada: Politica;
    readonly nombreDelCertificado: string;
  }
> {
  const { conexion } = p;
  await conexion.empezar();
  try {
    const nombre = await destinoLibre(p, SUFIJO_ANONIMIZADA);
    const tabla = await validarTabla(conexion, p.esquema, p.tabla);
    const antes = await huellaDeTabla(conexion, tabla);
    if (antes.filas === 0) throw new ErrorDeVelo("sinArchivo");
    const origen: Origen = {
      nombre: `${ETIQUETA_DE_MOTOR[conexion.motor]} · ${conexion.baseDeDatos} · ${p.esquema}.${p.tabla}`,
      bytes: antes.bytes,
      sha256: antes.sha256,
    };
    const fuente = fuenteDeTabla(conexion, tabla, antes);
    const lectura = await leer(fuente, origen);
    const politicaAplicada = resolverPolitica(
      p.politica,
      lectura.diagnostico,
      p.idioma,
    );
    const resultado = await anonimizar({
      fuente,
      origen,
      lectura,
      politica: politicaAplicada,
      llave: p.llave,
      idioma: p.idioma,
      destino: new DestinoConHuella(
        new SumideroDeTabla(conexion, p.esquema, nombre, p.reemplazar),
      ),
      fecha: p.fecha,
      nombreDeSalida: `${p.esquema}.${nombre}`,
    });
    const despues = await huellaDeTabla(conexion, tabla);
    if (despues.sha256 !== antes.sha256) throw new ErrorDeVelo("tablaCambio");
    await p.antesDeConfirmar?.(resultado, nombre);
    await conexion.terminar();
    return {
      nombreDeLaNueva: nombre,
      huellaDeOrigen: antes,
      resultado,
      politicaAplicada,
      nombreDelCertificado: nombreDelCertificado(
        `${p.esquema}-${p.tabla}`,
        p.idioma,
      ),
    };
  } catch (error) {
    await conexion.deshacer();
    throw error;
  }
}

export async function restaurarTabla(
  p: PedidoDeTabla & { readonly boveda: Boveda },
): Promise<
  TablaTratada & {
    readonly sha256DeSalida: string;
    readonly filas: number;
    readonly restauradas: number;
  }
> {
  const { conexion } = p;
  await conexion.empezar();
  try {
    const nombre = await destinoLibre(p, SUFIJO_RESTAURADA);
    const tabla = await validarTabla(conexion, p.esquema, p.tabla);
    const antes = await huellaDeTabla(conexion, tabla);
    if (antes.filas === 0) throw new ErrorDeVelo("sinArchivo");
    const origen: Origen = {
      nombre: `${ETIQUETA_DE_MOTOR[conexion.motor]} · ${conexion.baseDeDatos} · ${p.esquema}.${p.tabla}`,
      bytes: antes.bytes,
      sha256: antes.sha256,
    };
    const resultado = await restaurar(
      fuenteDeTabla(conexion, tabla, antes),
      origen,
      p.boveda,
      new DestinoConHuella(
        new SumideroDeTabla(conexion, p.esquema, nombre, p.reemplazar),
      ),
    );
    const despues = await huellaDeTabla(conexion, tabla);
    if (despues.sha256 !== antes.sha256) throw new ErrorDeVelo("tablaCambio");
    await conexion.terminar();
    return {
      nombreDeLaNueva: nombre,
      huellaDeOrigen: antes,
      sha256DeSalida: resultado.sha256DeSalida,
      filas: resultado.filas,
      restauradas: resultado.totales.restauradas,
    };
  } catch (error) {
    await conexion.deshacer();
    throw error;
  }
}
