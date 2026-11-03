// La sesión de Velo — en memoria y nada más.
//
// No hay `localStorage`, ni `sessionStorage`, ni IndexedDB, ni OPFS, ni cookies. Cerrar la pestaña
// no "borra" el informe: es que no había dónde borrarlo. Recargar `/diagnostico` sin haber cargado
// un archivo enseña un estado vacío que dice exactamente eso, porque esa pérdida es la prueba
// visible de la promesa, no un error de la aplicación.
//
// (La bóveda cifrada del Sprint 003 será la ÚNICA excepción, con una acción explícita del usuario
// y una llave que solo él tiene. Hasta entonces, cero persistencia.)
//
// El worker se crea al soltar el archivo y NO antes: si se instanciara al montar la página, el
// bundle del parser entraría al load inicial y reventaría el presupuesto de Lighthouse.

import { useSyncExternalStore } from "react";

import {
  columnasDeMondrian,
  type JerarquiaDeLaPolitica,
  type Politica,
} from "@/engine/politica";
import { serializarCanonico } from "@/engine/serializacion";
import type { RiesgoEstimado } from "@/engine/riesgo-estimado";
import { excelGrande, formatoDeArchivo, motivoDelTope } from "@/lib/archivo";
import { idiomaActual } from "@/lib/idioma/estado";
import { generarSal } from "@/lib/llave";
import type {
  ComparacionDeGeneralizacion,
  EtapaDelWorker,
  FormatoDeArchivo,
  Informe,
  InformeDeMetadatos,
  MensajeDelWorker,
  MotivoDeError,
  ResultadoDeTransformacion,
  ResumenDeLimpieza,
} from "@/workers/contrato";

export type EstadoDeSesion =
  | { fase: "vacio" }
  | {
      fase: "analizando";
      nombre: string;
      bytes: number;
      formato: FormatoDeArchivo;
      /** Excel por encima del umbral de aviso: entra, pero avisando y con la salida a mano. */
      avisoDeTamano: boolean;
      etapa: EtapaDelWorker;
      filas: number;
      bytesLeidos: number;
      bytesTotales: number;
    }
  | { fase: "listo"; informe: Informe }
  /**
   * Un PDF o una imagen ya leídos (S6). Fase propia y no un `listo` con otro informe: así ninguna
   * pantalla de tablas puede recibir uno por accidente —el tipo no se lo deja— y la que lo recibe
   * sabe desde la primera línea que aquí no hay filas ni riesgo que medir.
   */
  | { fase: "metadatos"; informe: InformeDeMetadatos }
  | { fase: "error"; motivo: MotivoDeError; nombre: string; linea?: number };

/**
 * El taller — el estado de la transformación, al lado de la sesión y no dentro.
 *
 * Va aparte porque tiene otro ciclo de vida: la sesión nace al soltar el archivo y muere al
 * descartarlo; el taller nace y muere muchas veces mientras tanto, cada vez que el usuario cambia
 * la política. Meterlo dentro de `EstadoDeSesion` habría obligado a reconstruir el informe entero
 * en cada tecleo del editor.
 */
export type EstadoDeLlave =
  | { fase: "sin-llave" }
  | { fase: "derivando" }
  | { fase: "lista"; huella: string; sal: string };

export type EstadoDeTransformacion =
  | { fase: "sin-hacer" }
  | { fase: "transformando" }
  | { fase: "hecha"; resultado: ResultadoDeTransformacion }
  | { fase: "fallo"; motivo: MotivoDeError };

/**
 * La bóveda del tratamiento (S3). Solo existe si la política marcó alguna columna como reversible.
 *
 * La frase de paso de la bóveda **no está aquí**, ni en ningún otro estado de la página: entra al
 * worker por `postMessage` y no vuelve. Lo que queda es el asa del archivo sellado.
 */
export type EstadoDeBoveda =
  { fase: "sin-sellar" } | { fase: "sellando" } | { fase: "sellada" };

/**
 * La limpieza de un PDF o una imagen (S6). El archivo limpio llega con su resumen en el mismo
 * mensaje, así que aquí también viven juntos: no hay un estado con archivo y sin resumen.
 */
export type EstadoDeLimpieza =
  | { fase: "sin-hacer" }
  | { fase: "limpiando" }
  | { fase: "hecha"; resumen: ResumenDeLimpieza; archivo: AsaDeArchivo }
  | { fase: "fallo"; motivo: MotivoDeError };

export interface EstadoDelTaller {
  readonly llave: EstadoDeLlave;
  readonly transformacion: EstadoDeTransformacion;
  /** La etapa que el worker está corriendo ahora mismo, para poder nombrarla en pantalla. */
  readonly etapa: EtapaDelWorker | null;
  /** El archivo listo para guardar, como asa opaca. Ver `AsaDeArchivo`. */
  readonly archivo: AsaDeArchivo | null;
  /**
   * S8: el archivo que el worker escribió directamente en el que el usuario eligió (alto volumen).
   * Ya está en su equipo: no hay asa ni URL, solo su nombre y su tamaño para decirlo.
   */
  readonly archivoEnDisco: {
    readonly nombre: string;
    readonly bytes: number;
  } | null;
  /**
   * SHA-256 del archivo anonimizado, calculado en el worker sobre los bytes que forman el `Blob`.
   *
   * **Viaja aparte del asa, y no dentro de ella, porque no es lo mismo.** `AsaDeArchivo` es la
   * referencia opaca del ADR-005 —nombre, tamaño y una URL— y su contrato es justamente que no se
   * puede mirar lo que hay dentro. La huella sí es contenido: es lo que permite comprobar que el
   * archivo es ese. Meterla en el asa habría confundido las dos ideas.
   *
   * `null` hasta que el archivo existe, y por eso **el certificado no puede ofrecerse antes**: sin
   * archivo generado no hay huella de salida, y sin huella de salida el certificado sería otra vez
   * el documento del S2 disculpándose por no tenerla.
   */
  readonly huellaDeSalida: string | null;
  readonly boveda: EstadoDeBoveda;
  /** El `.velo` listo para guardar, también como asa. */
  readonly archivoDeBoveda: AsaDeArchivo | null;
  /**
   * El veredicto de los estimadores poblacionales, o `null` mientras nadie los ha pedido.
   *
   * **Vive aparte del balance y no dentro de él**, y esa separación es la regla de honestidad del
   * S4 puesta en el estado: `BalanceDelTratamiento` es todo exacto —se contó registro por registro—
   * y colgarle un campo estimado habría hecho que la primera pantalla distraída los pintara juntos.
   * Son dos planos, viajan por caminos distintos y se pintan en paneles distintos.
   */
  readonly estimacion: RiesgoEstimado | null;
  /** La población que el usuario declaró, para que la pantalla la recuerde entre intentos. */
  readonly poblacionDeclarada: number | null;
  /** Solo para un PDF o una imagen: la limpieza de sus metadatos. */
  readonly limpieza: EstadoDeLimpieza;
  /** S7: Mondrian y la generalización óptima lado a lado, sobre la política en pantalla. */
  readonly comparacion: EstadoDeComparacion;
}

/**
 * La comparación lleva la FIRMA de lo que comparó (`firmaDeComparacion`): la pantalla la enseña solo
 * mientras lo que tiene delante firme igual. Elegir Mondrian o la óptima no cambia lo comparado (los
 * dos caminos ya están calculados); cambiar el k, una escalera, una columna del reparto o la ℓ, sí.
 */
export type EstadoDeComparacion =
  | { readonly fase: "sin-hacer" }
  | { readonly fase: "comparando"; readonly firma: string }
  | {
      readonly fase: "hecha";
      readonly comparacion: ComparacionDeGeneralizacion;
      readonly firma: string;
    }
  | { readonly fase: "fallo"; readonly firma: string };

/**
 * Lo que una comparación compara: el k, las columnas del reparto, la escalera de cada una y la ℓ
 * pedida. Lo demás de la política (el camino elegido, las técnicas de otras columnas) no la mueve.
 */
export function firmaDeComparacion(
  politica: Politica,
  jerarquias: Readonly<Record<string, JerarquiaDeLaPolitica>>,
): string {
  const reparto = columnasDeMondrian(politica)
    .slice()
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return serializarCanonico({
    k: politica.kObjetivo,
    reparto,
    jerarquias: Object.fromEntries(
      reparto.map((c) => [c, jerarquias[c] ?? { tipo: "supresion" }]),
    ),
    diversidad: politica.generalizacion?.diversidad ?? null,
  });
}

/** La firma de la comparación que el worker está calculando (la que se pidió). */
function firmaPendiente(): string {
  return tallerActual.comparacion.fase === "comparando"
    ? tallerActual.comparacion.firma
    : "";
}

/**
 * El archivo anonimizado, como **asa opaca** (ADR-005).
 *
 * El `Blob` no está aquí, y no está en ninguna otra parte de la interfaz: se convierte en URL
 * dentro de `asaDeArchivo` y su referencia se pierde ahí mismo. Lo que llega a los componentes es
 * una **cadena**, así que no existe un objeto sobre el que se pudiera llamar `.text()` ni aunque
 * alguien lo intentara. No es una convención que haya que recordar ni una regla que un gate de
 * texto tenga que perseguir: es que la referencia no existe.
 */
export interface AsaDeArchivo {
  readonly nombre: string;
  readonly bytes: number;
  /** URL `blob:` lista para un `<a download>`. Es lo ÚNICO que la página recibe del archivo. */
  readonly url: string;
}

/**
 * Envuelve el `Blob` y **pierde su referencia aquí mismo**.
 *
 * Se exporta para que el regreso (S3) use ESTA función y no una copia: la propiedad del ADR-005 es
 * que exista un solo sitio en toda la app donde un `Blob` del usuario deja de ser alcanzable. Dos
 * implementaciones serían dos sitios que auditar, y una de las dos acabaría divergiendo.
 */
/**
 * El asa del archivo de un mensaje que trae su `Blob`: todos, salvo el que el worker escribió en el
 * archivo que el usuario eligió (S8), que no tiene nada que descargar y se trata aparte.
 */
export function asaDelMensaje(mensaje: {
  readonly blob?: Blob;
  readonly nombre: string;
}): AsaDeArchivo {
  if (!mensaje.blob) throw new Error("el archivo no viene como Blob");
  return asaDeArchivo(mensaje.blob, mensaje.nombre);
}

export function asaDeArchivo(blob: Blob, nombre: string): AsaDeArchivo {
  // El `Blob` se convierte en URL aquí mismo y la referencia se pierde al salir de esta función.
  // A partir de este punto ni siquiera existe un objeto sobre el que se pudiera llamar `.text()`:
  // lo que viaja a la interfaz es una cadena. El navegador guarda los bytes en su propio registro
  // y los suelta cuando se revoca la URL.
  return { nombre, bytes: blob.size, url: URL.createObjectURL(blob) };
}

/** Suelta los bytes de lo preparado. Mientras la URL viva, ocupan memoria (ADR-005). */
function soltarArchivo(): void {
  if (tallerActual.archivo) URL.revokeObjectURL(tallerActual.archivo.url);
  if (tallerActual.archivoDeBoveda)
    URL.revokeObjectURL(tallerActual.archivoDeBoveda.url);
  if (tallerActual.limpieza.fase === "hecha")
    URL.revokeObjectURL(tallerActual.limpieza.archivo.url);
}

const VACIO: EstadoDeSesion = { fase: "vacio" };
const TALLER_VACIO: EstadoDelTaller = {
  llave: { fase: "sin-llave" },
  transformacion: { fase: "sin-hacer" },
  etapa: null,
  archivo: null,
  archivoEnDisco: null,
  huellaDeSalida: null,
  boveda: { fase: "sin-sellar" },
  archivoDeBoveda: null,
  estimacion: null,
  poblacionDeclarada: null,
  limpieza: { fase: "sin-hacer" },
  comparacion: { fase: "sin-hacer" },
};

let estadoActual: EstadoDeSesion = VACIO;
let tallerActual: EstadoDelTaller = TALLER_VACIO;
let worker: Worker | null = null;
const oyentes = new Set<() => void>();

function avisarATodos(): void {
  for (const oyente of oyentes) oyente();
}

function publicar(siguiente: EstadoDeSesion): void {
  estadoActual = siguiente;
  avisarATodos();
}

function publicarTaller(cambio: Partial<EstadoDelTaller>): void {
  tallerActual = { ...tallerActual, ...cambio };
  avisarATodos();
}

function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

function leer(): EstadoDeSesion {
  return estadoActual;
}

/** En el servidor la sesión SIEMPRE está vacía: no hay nada del usuario que renderizar allá. */
function leerEnServidor(): EstadoDeSesion {
  return VACIO;
}

export function useSesion(): EstadoDeSesion {
  return useSyncExternalStore(suscribir, leer, leerEnServidor);
}

export function useTaller(): EstadoDelTaller {
  return useSyncExternalStore(
    suscribir,
    () => tallerActual,
    () => TALLER_VACIO,
  );
}

/**
 * Mata el worker y con él la tabla. Es la única forma de "borrar": dejar de tenerlo.
 *
 * Se lleva también la llave, que vive dentro del worker: terminarlo es lo que garantiza que no
 * queda ni una `CryptoKey` viva en ninguna parte del navegador.
 */
export function descartar(): void {
  worker?.terminate();
  worker = null;
  soltarArchivo();
  tallerActual = TALLER_VACIO;
  publicar(VACIO);
}

/**
 * Invalida el resultado anterior. Se llama al tocar la política, y no es cosmético: dejar en
 * pantalla un balance calculado con la política de hace tres clics es exactamente la clase de
 * mentira que este sprint persigue — cada cifra sería cierta, pero de otro archivo.
 */
export function invalidarTransformacion(): void {
  // La comparación NO se olvida aquí: lleva su firma, y la pantalla la esconde en cuanto lo que
  // tiene delante firma distinto (ver `EstadoDeComparacion`). Olvidarla con cada toque de la
  // política la borraba justo al elegir el camino que se acababa de comparar.
  if (
    tallerActual.transformacion.fase === "sin-hacer" &&
    tallerActual.archivo === null &&
    tallerActual.archivoEnDisco === null
  ) {
    return;
  }
  soltarArchivo();
  publicarTaller({
    transformacion: { fase: "sin-hacer" },
    archivo: null,
    archivoEnDisco: null,
    huellaDeSalida: null,
    etapa: null,
    // La bóveda también caduca: describe la correspondencia de una política que ya no es la que
    // está en pantalla. Dejarla sería ofrecer la vuelta de un tratamiento que no se hizo.
    boveda: { fase: "sin-sellar" },
    archivoDeBoveda: null,
  });
}

/** Deriva la llave del proyecto. La frase entra al worker y no vuelve a salir. */
export function derivarLlaveDelProyecto(frase: string): void {
  if (!worker) return;
  const sal = generarSal();
  publicarTaller({ llave: { fase: "derivando" }, etapa: "derivando-llave" });
  worker.postMessage({ tipo: "derivar-llave", frase, sal });
  // La sal se guarda para poder enseñarla: sin ella, la misma frase daría otra llave el mes que
  // viene y los seudónimos dejarían de cuadrar. No es secreta — su trabajo es que dos derivaciones
  // de la misma frase no den la misma llave por accidente entre proyectos distintos.
  salPendiente = sal;
}

let salPendiente = "";

export function transformar(politica: Politica): void {
  if (!worker) return;
  soltarArchivo();
  publicarTaller({
    transformacion: { fase: "transformando" },
    archivo: null,
    archivoEnDisco: null,
    huellaDeSalida: null,
    etapa: "transformando",
  });
  // El idioma del trabajo se lee AQUÍ, al pulsar, y viaja como dato (igual que el del informe del
  // regreso): el worker no conoce la pantalla y el motor no puede leerlo de ningún sitio.
  worker.postMessage({
    tipo: "transformar",
    politica,
    idioma: idiomaActual(),
  });
}

/**
 * Sella la bóveda del tratamiento. La frase entra al worker y no vuelve a salir — no se guarda en
 * ningún estado, ni siquiera un instante.
 */
export function sellarLaBoveda(frase: string): void {
  if (!worker) return;
  if (tallerActual.archivoDeBoveda)
    URL.revokeObjectURL(tallerActual.archivoDeBoveda.url);
  publicarTaller({
    boveda: { fase: "sellando" },
    archivoDeBoveda: null,
    etapa: "sellando-boveda",
  });
  worker.postMessage({ tipo: "sellar-boveda", frase });
}

/**
 * Compara Mondrian con la generalización óptima sobre las columnas del reparto de `politica`, con
 * `jerarquias` (las de la política o las que la pantalla propone). No pide llave.
 */
export function compararGeneralizacion(
  politica: Politica,
  jerarquias: Readonly<Record<string, JerarquiaDeLaPolitica>>,
): void {
  if (!worker) return;
  publicarTaller({
    comparacion: {
      fase: "comparando",
      firma: firmaDeComparacion(politica, jerarquias),
    },
    etapa: "comparando",
  });
  worker.postMessage({
    tipo: "comparar-generalizacion",
    politica,
    jerarquias,
    idioma: idiomaActual(),
  });
}

/**
 * Pide la estimación poblacional con la población que el usuario declaró.
 *
 * `null` es una petición legítima —«ya no quiero declararla»— y el motor contesta con su «no
 * calculable» razonado, que es lo que la pantalla enseña. No se filtra aquí: quien decide si una
 * entrada permite estimar es el motor, que tiene los criterios y sus fuentes.
 */
export function pedirEstimacion(poblacion: number | null): void {
  if (!worker) return;
  publicarTaller({ poblacionDeclarada: poblacion });
  worker.postMessage({ tipo: "estimar-riesgo", poblacion });
}

/**
 * `destino` (S8): el archivo que el usuario eligió con el selector del sistema, en alto volumen. La
 * página solo pasa el asa: el worker escribe en él, y la página nunca lee lo escrito.
 */
export function prepararArchivo(destino?: FileSystemFileHandle): void {
  if (!worker) return;
  publicarTaller({ etapa: "escribiendo" });
  worker.postMessage(
    destino
      ? { tipo: "construir-archivo", destino }
      : { tipo: "construir-archivo" },
  );
}

/** Limpia los metadatos del PDF o la imagen cargados. Sin opciones: ver el mensaje `limpiar`. */
export function limpiar(): void {
  if (!worker) return;
  if (tallerActual.limpieza.fase === "hecha")
    URL.revokeObjectURL(tallerActual.limpieza.archivo.url);
  publicarTaller({ limpieza: { fase: "limpiando" }, etapa: "limpiando" });
  worker.postMessage({ tipo: "limpiar" });
}

/**
 * La transición de estado ante un mensaje del worker, como función pura.
 *
 * Vive separada del cableado porque es la parte que puede equivocarse: un progreso que llega
 * tarde y resucita una sesión ya descartada, un error que pierde el nombre del archivo. Aparte se
 * puede probar entera sin instanciar un `Worker`.
 */
export function siguienteEstado(
  actual: EstadoDeSesion,
  mensaje: MensajeDelWorker,
  nombre: string,
): EstadoDeSesion {
  if (mensaje.tipo === "progreso") {
    // Un progreso rezagado —el worker ya lo había encolado cuando el usuario descartó— no puede
    // devolver la sesión a "analizando". Los mensajes viajan; el estado manda.
    if (actual.fase !== "analizando") return actual;
    return {
      ...actual,
      etapa: mensaje.etapa,
      filas: mensaje.filas,
      bytesLeidos: mensaje.bytesLeidos,
      bytesTotales: mensaje.bytesTotales,
    };
  }
  if (mensaje.tipo === "listo")
    return { fase: "listo", informe: mensaje.informe };
  if (mensaje.tipo === "metadatos-listos")
    return { fase: "metadatos", informe: mensaje.informe };
  if (mensaje.tipo === "error")
    return {
      fase: "error",
      motivo: mensaje.motivo,
      nombre,
      linea: mensaje.linea,
    };
  // Los mensajes del taller —llave, transformación, archivo— no tocan la sesión: el informe del
  // análisis sigue siendo el mismo mientras se transforma. Se atienden en `recibir`.
  return actual;
}

export function analizar(archivo: File): void {
  const formato = formatoDeArchivo(archivo.name);
  if (formato === null) {
    publicar({
      fase: "error",
      motivo: "formato-no-soportado",
      nombre: archivo.name,
    });
    return;
  }
  const tope = motivoDelTope(formato, archivo.size);
  if (tope) {
    // Se rechaza ANTES de abrirlo: abrir un .xlsx enorme es justo la operación que tumba la
    // pestaña, así que la decisión se toma con el único dato disponible sin abrirlo, su tamaño. Un
    // PDF o una imagen (S6) se abren enteros por la misma razón, y tienen el suyo.
    publicar({ fase: "error", motivo: tope, nombre: archivo.name });
    return;
  }

  worker?.terminate();
  worker = new Worker(new URL("../workers/parser.worker.ts", import.meta.url));
  worker.addEventListener("message", (evento: MessageEvent<MensajeDelWorker>) =>
    recibir(evento.data, archivo.name),
  );
  // Sin esto, un fallo del worker mismo —el chunk que no carga, una excepción que se escapa del
  // try— dejaría la pantalla girando en "analizando" para siempre. El texto del evento NO se
  // usa: como cualquier mensaje de excepción aquí, puede citar contenido del archivo.
  worker.addEventListener("error", (evento) => {
    evento.preventDefault();
    publicar({
      fase: "error",
      motivo: "lectura-fallida",
      nombre: archivo.name,
    });
  });

  publicar({
    fase: "analizando",
    nombre: archivo.name,
    bytes: archivo.size,
    formato,
    avisoDeTamano: excelGrande(formato, archivo.size),
    etapa: "leyendo",
    filas: 0,
    bytesLeidos: 0,
    bytesTotales: archivo.size,
  });
  worker.postMessage({ tipo: "analizar", archivo });
}

function recibir(mensaje: MensajeDelWorker, nombre: string): void {
  if (mensaje.tipo === "limpiado") {
    publicarTaller({
      limpieza: {
        fase: "hecha",
        resumen: mensaje.resumen,
        // El `Blob` se envuelve AQUÍ, en el mismo sitio que el anonimizado (ADR-005).
        archivo: asaDelMensaje(mensaje),
      },
      etapa: null,
    });
    return;
  }
  if (mensaje.tipo === "error" && tallerActual.limpieza.fase === "limpiando") {
    // Un fallo limpiando no tumba el diagnóstico: el archivo sigue leído y la pantalla puede decir
    // qué pasó —la limpieza no se pudo comprobar, el PDF no se dejó reescribir— sin pedirlo otra vez.
    publicarTaller({
      limpieza: { fase: "fallo", motivo: mensaje.motivo },
      etapa: null,
    });
    return;
  }
  if (mensaje.tipo === "llave-lista") {
    publicarTaller({
      llave: { fase: "lista", huella: mensaje.huella, sal: salPendiente },
      etapa: null,
    });
    return;
  }
  if (mensaje.tipo === "transformado") {
    publicarTaller({
      transformacion: { fase: "hecha", resultado: mensaje.resultado },
      // Un tratamiento nuevo invalida la estimación del anterior: describía otra tabla. Dejarla
      // en pantalla sería la composición prohibida en su forma más tonta —una cifra correcta
      // sobre un archivo que ya no existe.
      estimacion: null,
      etapa: null,
    });
    return;
  }
  if (mensaje.tipo === "comparacion") {
    publicarTaller({
      comparacion:
        mensaje.comparacion === null
          ? { fase: "fallo", firma: firmaPendiente() }
          : {
              fase: "hecha",
              comparacion: mensaje.comparacion,
              firma: firmaPendiente(),
            },
      etapa: null,
    });
    return;
  }
  if (mensaje.tipo === "riesgo-estimado") {
    publicarTaller({ estimacion: mensaje.estimacion });
    return;
  }
  if (mensaje.tipo === "archivo") {
    // El `Blob` se envuelve AQUÍ y no se guarda en ningún sitio: a partir de esta línea, la única
    // forma de llegar a él es pedirle una URL.
    if (mensaje.proposito === "boveda") {
      publicarTaller({
        archivoDeBoveda: asaDelMensaje(mensaje),
        boveda: { fase: "sellada" },
        etapa: null,
      });
      return;
    }
    if (mensaje.enDisco) {
      publicarTaller({
        archivoEnDisco: { nombre: mensaje.nombre, bytes: mensaje.bytes },
        huellaDeSalida: mensaje.sha256 ?? null,
        etapa: null,
      });
      return;
    }
    publicarTaller({
      archivo: asaDelMensaje(mensaje),
      // `?? null` y no un `!`: el contrato declara la huella opcional porque solo el archivo
      // anonimizado la trae, y este camino es justamente ese. Afirmarlo con `!` sería fiarse de una
      // correspondencia que el tipo no garantiza.
      huellaDeSalida: mensaje.sha256 ?? null,
      etapa: null,
    });
    return;
  }
  if (mensaje.tipo === "progreso") {
    // El progreso del taller no cambia la sesión pero sí la etiqueta que se lee en pantalla.
    if (
      tallerActual.transformacion.fase !== "sin-hacer" ||
      tallerActual.llave.fase === "derivando" ||
      tallerActual.limpieza.fase === "limpiando"
    )
      publicarTaller({ etapa: mensaje.etapa });
  }
  if (
    mensaje.tipo === "error" &&
    (mensaje.motivo === "sin-tabla" ||
      mensaje.motivo === "sin-llave" ||
      mensaje.motivo === "sin-boveda" ||
      mensaje.motivo === "transformacion-fallida" ||
      // S8: lo que el alto volumen no puede transformar se dice en el taller, sin tumbar el informe.
      mensaje.motivo === "alto-volumen-boveda-no-cabe" ||
      mensaje.motivo === "alto-volumen-reparto-no-cabe")
  ) {
    // Un fallo transformando NO tumba el informe: el archivo original sigue analizado y la
    // pantalla puede decir qué pasó sin obligar a cargarlo de nuevo.
    if (mensaje.motivo === "sin-boveda") {
      // Un fallo sellando no tumba la transformación: el archivo tratado sigue listo y la pantalla
      // puede decir que la bóveda no salió sin obligar a rehacerlo todo.
      publicarTaller({ boveda: { fase: "sin-sellar" }, etapa: null });
      return;
    }
    publicarTaller({
      transformacion: { fase: "fallo", motivo: mensaje.motivo },
      etapa: null,
    });
    return;
  }

  const siguiente = siguienteEstado(estadoActual, mensaje, nombre);
  if (siguiente !== estadoActual) publicar(siguiente);
}
