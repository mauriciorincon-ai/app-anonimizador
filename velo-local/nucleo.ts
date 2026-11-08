// VELO LOCAL (S9, ADR-017) — el núcleo: el MISMO motor de la web, sin pantalla.
//
// Aquí no hay un motor nuevo. Cada paso llama a la función que llama el worker del navegador: el
// camino en memoria (`src/workers/en-memoria.ts`) o el de pasadas (`src/workers/alto-volumen.ts`),
// elegidos con la MISMA regla —el tope de celdas en memoria, una constante de build—, y después el
// motor de siempre (`src/engine/`) para la bóveda, la bitácora y el certificado. Lo único propio de
// este archivo es de dónde salen las filas (una `Fuente`: un CSV o una tabla) y adónde van (un
// `Destino`), que es justo lo que en la web resuelven el `File` y el `Blob`.
//
// Por eso «Velo local = navegador» se cumple por construcción —el mismo archivo da el mismo
// anonimizado, la misma bóveda y el mismo certificado—, y dos gates lo comprueban byte a byte
// (`tests/unit/determinismo-local.test.ts` y el e2e `local-igual-navegador.spec.ts`).

import {
  anadirEntrada,
  bitacoraVacia,
  privacidadDeLaEntrada,
  type Bitacora,
  type EntradaDeBitacora,
} from "@/engine/bitacora";
import { construirBoveda, type Boveda } from "@/engine/boveda";
import { clasificar, type Diagnostico } from "@/engine/clasificador";
import { ConstructorColumnar, type TablaColumnar } from "@/engine/columnar";
import { filasDeCsv, nombreDelArchivoAnonimizado } from "@/engine/csv";
import {
  hashDePolitica,
  importarPolitica,
  type Politica,
} from "@/engine/politica";
import {
  construirPolitica,
  informeDelRgpd,
  POLITICAS_DE_FABRICA,
} from "@/engine/politicas-de-fabrica";
import { construirReporte, nombreDelCertificado } from "@/engine/reporte";
import {
  evaluarRiesgo,
  type AdvisorDeQis,
  type RiesgoExacto,
} from "@/engine/riesgo";
import { TOPE_DE_CELDAS_EN_MEMORIA } from "@/lib/archivo";
import { decirMensaje } from "@/lib/idioma/mensajes";
import { LOCALE, type Idioma } from "@/lib/idioma";
import { derivarLlave, generarSal, type LlaveDeProyecto } from "@/lib/llave";
import { Sha256 } from "@/lib/sha256";
import {
  escribirCsv,
  pasadaDeDiagnostico,
  pasadaDeMedida,
  pasadaDelDevuelto,
  prepararTransformacion,
  restaurarPorTrozos,
  resultadoDelAltoVolumen,
  type Destino,
  type Fuente,
  type FuenteDeFilas,
  type OpcionesDeLaPasada,
  type PasadaDeDiagnostico,
} from "@/workers/alto-volumen";
import { tablaDeCsv, transformarEnMemoria } from "@/workers/en-memoria";

import { ErrorDeVelo } from "./textos";

/** Lo que se sabe del origen antes de leerlo: su nombre, su tamaño y su huella. */
export interface Origen {
  /** El nombre del archivo, o «PostgreSQL · esquema.tabla» para una tabla. */
  readonly nombre: string;
  readonly bytes: number;
  /** SHA-256 de los bytes del archivo, o de los bytes canónicos de la tabla en el orden de su llave. */
  readonly sha256: string;
}

/** Adonde van los bytes. Un archivo, una respuesta HTTP, una tabla: el núcleo no lo sabe. */
export interface Sumidero {
  escribir(bytes: Uint8Array): Promise<void>;
}

/**
 * El `Destino` de las pasadas, con la huella de salida calculada sobre los MISMOS bytes que se
 * escriben: igual que el `destinoDe` del worker. Sin esto, el certificado no certificaría nada.
 */
export class DestinoConHuella implements Destino {
  private readonly huella = new Sha256();
  private readonly codificador = new TextEncoder();
  bytes = 0;

  constructor(private readonly sumidero: Sumidero) {}

  async escribir(texto: string): Promise<void> {
    const trozo = this.codificador.encode(texto);
    this.huella.actualizar(trozo);
    this.bytes += trozo.length;
    await this.sumidero.escribir(trozo);
  }

  terminar(): string {
    return this.huella.terminar();
  }
}

/** La fecha del documento, con la convención del idioma: la misma que pone la pantalla. */
export function fechaDelDocumento(idioma: Idioma, ahora: Date): string {
  return new Intl.DateTimeFormat(LOCALE[idioma], {
    dateStyle: "long",
    timeStyle: "short",
  }).format(ahora);
}

// ── Leer y diagnosticar: el mismo camino que elegiría la web ──────────────────────────────────

/** Lo que dejó la lectura: la tabla entera (cabe) o la pasada A (no cabe). */
export type Lectura =
  | {
      readonly modo: "memoria";
      readonly tabla: TablaColumnar;
      readonly diagnostico: Diagnostico;
      readonly riesgo: RiesgoExacto;
      readonly advisor: AdvisorDeQis;
      readonly filas: number;
    }
  | {
      readonly modo: "alto-volumen";
      readonly pasada: PasadaDeDiagnostico;
      readonly diagnostico: Diagnostico;
      readonly riesgo: RiesgoExacto;
      readonly advisor: AdvisorDeQis;
      readonly filas: number;
    };

function esFuenteDeFilas(fuente: Fuente): fuente is FuenteDeFilas {
  return typeof (fuente as FuenteDeFilas).lotes === "function";
}

/** Las filas de una tabla de base a una tabla en memoria, con el MISMO tope que un CSV. */
async function tablaDeFilas(
  fuente: FuenteDeFilas,
  tope: number,
): Promise<TablaColumnar | "alto-volumen" | "vacio"> {
  let constructor: ConstructorColumnar | null = null;
  let filas = 0;
  for await (const lote of fuente.lotes()) {
    let desde = 0;
    if (!constructor) {
      constructor = new ConstructorColumnar(lote[0] ?? [], 1 << 16);
      desde = 1;
    }
    for (let i = desde; i < lote.length; i++) constructor.agregarFila(lote[i]);
    filas += lote.length - desde;
    if (filas * (lote[0]?.length ?? 0) > tope) return "alto-volumen";
  }
  return constructor ? constructor.finalizar() : "vacio";
}

/**
 * Lee la fuente como la leería el worker: entera si cabe, por pasadas si pasa del tope. El
 * diagnóstico en memoria es el de `diagnosticar` del worker: `clasificar` y `evaluarRiesgo` sobre la
 * tabla entera.
 */
export async function leer(
  fuente: Fuente,
  origen: Origen,
  opciones: OpcionesDeLaPasada & { readonly topeDeCeldas?: number } = {},
): Promise<Lectura> {
  const tope = opciones.topeDeCeldas ?? TOPE_DE_CELDAS_EN_MEMORIA;
  const tabla = esFuenteDeFilas(fuente)
    ? await tablaDeFilas(fuente, tope)
    : await tablaDeCsv(fuente, {
        huellaEsperada: origen.sha256,
        topeDeCeldas: tope,
      });
  if (tabla === "vacio") throw new ErrorDeVelo("sinArchivo");
  if (tabla !== "alto-volumen") {
    if (tabla.filas === 0) throw new ErrorDeVelo("sinArchivo");
    const diagnostico = clasificar(tabla);
    const { riesgo, advisor } = evaluarRiesgo(tabla, diagnostico);
    return {
      modo: "memoria",
      tabla,
      diagnostico,
      riesgo,
      advisor,
      filas: tabla.filas,
    };
  }
  const pasada = await pasadaDeDiagnostico(fuente, {
    ...opciones,
    huella: origen.sha256,
  });
  if (pasada.filas === 0) throw new ErrorDeVelo("sinArchivo");
  return {
    modo: "alto-volumen",
    pasada,
    diagnostico: pasada.diagnostico,
    riesgo: pasada.riesgo,
    advisor: pasada.advisor,
    filas: pasada.filas,
  };
}

/** El informe del diagnóstico: el mismo que cruza a la pantalla en la web (y con `modo`). */
export async function diagnosticar(
  fuente: Fuente,
  origen: Origen,
  opciones: OpcionesDeLaPasada = {},
) {
  const lectura = await leer(fuente, origen, opciones);
  return {
    lectura,
    informe: {
      archivo: origen,
      diagnostico: lectura.diagnostico,
      riesgo: lectura.riesgo,
      advisor: lectura.advisor,
      modo: lectura.modo,
    },
  };
}

// ── La política ───────────────────────────────────────────────────────────────────────────────

/**
 * Una política de fábrica por su nombre (`habeas-data`, `hipaa`, `rgpd`), aplicada a las columnas
 * del diagnóstico con `construirPolitica` —el mismo clic de la pantalla—, o el texto de una política
 * exportada desde la web, validado por su esquema Zod.
 */
export function resolverPolitica(
  pedida: { readonly fabrica: string } | { readonly texto: string },
  diagnostico: Diagnostico,
  idioma: Idioma,
): Politica {
  if ("fabrica" in pedida) {
    const fabrica = POLITICAS_DE_FABRICA.find((f) => f.id === pedida.fabrica);
    if (!fabrica)
      throw new ErrorDeVelo("politicaInvalida", { detalle: pedida.fabrica });
    return construirPolitica(
      fabrica,
      diagnostico.columnas.map((c) => ({
        nombre: c.nombre,
        tipo: c.tipo,
        categoria: c.categoria,
      })),
    );
  }
  const importada = importarPolitica(pedida.texto);
  if (!importada.ok)
    throw new ErrorDeVelo("politicaInvalida", {
      detalle: decirMensaje(importada.detalle, idioma),
    });
  return importada.politica;
}

/** ¿Es el nombre de una política de fábrica? Si no, es la ruta de un archivo. */
export function esDeFabrica(nombre: string): boolean {
  return POLITICAS_DE_FABRICA.some((f) => f.id === nombre);
}

// ── La llave ──────────────────────────────────────────────────────────────────────────────────

const SAL_VALIDA = /^[0-9a-f]{32}$/;

/** La llave del proyecto: la misma `derivarLlave` de la web. Sin sal, una nueva, como en la web. */
export async function llaveDelProyecto(
  frase: string,
  sal?: string,
): Promise<LlaveDeProyecto> {
  const laSal = sal ?? generarSal();
  if (!SAL_VALIDA.test(laSal)) throw new ErrorDeVelo("salInvalida");
  return derivarLlave(frase, laSal);
}

// ── Anonimizar ────────────────────────────────────────────────────────────────────────────────

export interface PedidoDeAnonimizar {
  readonly fuente: Fuente;
  readonly origen: Origen;
  /** La lectura, si ya se hizo (la política de fábrica la necesita antes). */
  readonly lectura?: Lectura;
  readonly politica: Politica;
  readonly llave: LlaveDeProyecto;
  readonly idioma: Idioma;
  readonly destino: DestinoConHuella;
  /** La fecha ya formateada (`fechaDelDocumento`): el motor no mira el reloj. */
  readonly fecha: string;
  /** El nombre del archivo que sale; por defecto, el mismo que pone la web. */
  readonly nombreDeSalida?: string;
  readonly opciones?: OpcionesDeLaPasada;
}

export interface ResultadoDeAnonimizar {
  readonly modo: Lectura["modo"];
  readonly hashDePolitica: string;
  readonly nombreDeSalida: string;
  readonly sha256DeSalida: string;
  readonly bytesDeSalida: number;
  readonly filas: number;
  readonly unicosAntes: number;
  readonly unicosDespues: number;
  /** `null` si la política no pidió columnas reversibles: no hay vuelta que guardar. */
  readonly boveda: Boveda | null;
  /** El certificado, en HTML, con las dos huellas. */
  readonly certificado: string;
  readonly nombreDelCertificado: string;
  /** La entrada para la bitácora: qué se hizo, sin nombres de columna. */
  readonly entrada: EntradaDeBitacora;
}

/** Cuántas filas se juntan antes de entregar un trozo al destino. Las mismas que el worker. */
const FILAS_POR_TROZO = 20_000;

/** En memoria: la tabla transformada, a CSV, con `filasDeCsv` y los trozos del worker. */
async function escribirTabla(
  tabla: TablaColumnar,
  destino: Destino,
): Promise<void> {
  let acumulado = "";
  let filas = 0;
  for (const fila of filasDeCsv(tabla)) {
    acumulado += fila;
    if (++filas % FILAS_POR_TROZO === 0) {
      await destino.escribir(acumulado);
      acumulado = "";
    }
  }
  if (acumulado) await destino.escribir(acumulado);
}

/**
 * Transformar, medir y escribir, por el camino de la lectura. **No hay un modo rápido:** la medida
 * del riesgo DESPUÉS corre siempre, y el certificado sale siempre con ella.
 */
export async function anonimizar(
  pedido: PedidoDeAnonimizar,
): Promise<ResultadoDeAnonimizar> {
  const { fuente, origen, politica, llave, idioma, destino, fecha } = pedido;
  const opciones = pedido.opciones ?? {};
  const lectura = pedido.lectura ?? (await leer(fuente, origen, opciones));

  let tratado;
  if (lectura.modo === "memoria") {
    const hecho = await transformarEnMemoria(
      lectura.tabla,
      lectura.diagnostico,
      politica,
      llave.clave,
      idioma,
      origen.sha256,
    );
    await escribirTabla(hecho.resultado.tabla, destino);
    tratado = {
      ...hecho,
      suprimidas: hecho.resultado.suprimidas,
      correspondencias: hecho.resultado.correspondencias,
    };
  } else {
    const { pasada } = lectura;
    const plan = await prepararTransformacion(
      fuente,
      pasada,
      politica,
      llave.clave,
      idioma,
      origen.sha256,
      opciones,
    );
    const medida = await pasadaDeMedida(fuente, pasada, plan, opciones);
    // Medirla exige las dos tablas enteras, que en alto volumen no existen: no se finge (S8).
    tratado = {
      ...resultadoDelAltoVolumen(pasada, plan, medida, politica),
      utilidad: null,
      suprimidas: plan.suprimidas,
      correspondencias: plan.correspondencias,
    };
    await escribirCsv(fuente, plan, destino, opciones);
  }
  const {
    balance,
    muestras,
    generalizacion,
    privacidad,
    utilidad,
    suprimidas,
  } = tratado;

  const hash = hashDePolitica(politica);
  const nombreDeSalida =
    pedido.nombreDeSalida ?? nombreDelArchivoAnonimizado(hash);
  const sha256DeSalida = destino.terminar();
  const rgpd = informeDelRgpd(politica, suprimidas);

  const certificado = construirReporte({
    archivo: origen,
    diagnostico: lectura.diagnostico,
    riesgo: lectura.riesgo,
    advisor: lectura.advisor,
    fecha,
    idioma,
    tratamiento: {
      balance,
      utilidad,
      hashDePolitica: hash,
      idiomaDelTrabajo: idioma,
      suprimidas,
      sha256DeSalida,
      nombreDeSalida,
      generalizacion,
      privacidad,
      rgpd,
    },
  });

  const boveda =
    tratado.correspondencias.length > 0
      ? construirBoveda(
          {
            huellaDeLlave: llave.huella,
            salDeLlave: llave.sal,
            hashDePolitica: hash,
          },
          tratado.correspondencias,
        )
      : null;

  const entrada: EntradaDeBitacora = {
    fecha,
    archivo: origen.nombre,
    hashDePolitica: hash,
    tecnicas: [
      ...new Set(muestras.filter((m) => !m.omitida).map((m) => m.tecnica)),
    ],
    filas: lectura.filas,
    unicosAntes: balance.antes.proporcionUnicos,
    unicosDespues: balance.despues.proporcionUnicos,
    esTitular: balance.esTitular,
    huellaDeEntrada: origen.sha256,
    huellaDeSalida: sha256DeSalida,
    ...(privacidad ? { privacidad: privacidadDeLaEntrada(privacidad) } : {}),
    ...(rgpd && rgpd.seudonimizadas.length > 0
      ? {
          rgpd: {
            seudonimizadas: rgpd.seudonimizadas.length,
            generalizadas: rgpd.generalizadas.length,
          },
        }
      : {}),
  };

  return {
    modo: lectura.modo,
    hashDePolitica: hash,
    nombreDeSalida,
    sha256DeSalida,
    bytesDeSalida: destino.bytes,
    filas: lectura.filas,
    unicosAntes: balance.antes.proporcionUnicos,
    unicosDespues: balance.despues.proporcionUnicos,
    boveda,
    certificado,
    nombreDelCertificado: nombreDelCertificado(origen.nombre, idioma),
    entrada,
  };
}

/** La bitácora con la entrada nueva al final; sin bitácora previa, una nueva. */
export function anotar(
  bitacora: Bitacora | null,
  entrada: EntradaDeBitacora,
): Bitacora {
  return anadirEntrada(bitacora ?? bitacoraVacia(), entrada);
}

// ── Restaurar ─────────────────────────────────────────────────────────────────────────────────

/**
 * El regreso por trozos del S8: las dos pasadas R1 y R2, con la MISMA decisión por columna que en
 * memoria (`decidirRestauracion`), y los mismos bytes (el gate del S8 lo comprueba).
 */
export async function restaurar(
  fuente: Fuente,
  origen: Origen,
  boveda: Boveda,
  destino: DestinoConHuella,
  opciones: OpcionesDeLaPasada = {},
) {
  const devuelto = await pasadaDelDevuelto(fuente, {
    ...opciones,
    huella: origen.sha256,
  });
  const resultado = await restaurarPorTrozos(
    fuente,
    devuelto,
    boveda,
    origen.sha256,
    destino,
    opciones,
  );
  return { ...resultado, sha256DeSalida: destino.terminar() };
}
