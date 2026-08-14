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

import type { Politica } from "@/engine/politica";
import type { RiesgoEstimado } from "@/engine/riesgo-estimado";
import { excedeElTope, excelGrande, formatoDeArchivo } from "@/lib/archivo";
import { generarSal } from "@/lib/llave";
import type {
  EtapaDelWorker,
  FormatoDeArchivo,
  Informe,
  MensajeDelWorker,
  MotivoDeError,
  ResultadoDeTransformacion,
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
  | { fase: "error"; motivo: MotivoDeError; nombre: string };

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

export interface EstadoDelTaller {
  readonly llave: EstadoDeLlave;
  readonly transformacion: EstadoDeTransformacion;
  /** La etapa que el worker está corriendo ahora mismo, para poder nombrarla en pantalla. */
  readonly etapa: EtapaDelWorker | null;
  /** El archivo listo para guardar, como asa opaca. Ver `AsaDeArchivo`. */
  readonly archivo: AsaDeArchivo | null;
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
}

const VACIO: EstadoDeSesion = { fase: "vacio" };
const TALLER_VACIO: EstadoDelTaller = {
  llave: { fase: "sin-llave" },
  transformacion: { fase: "sin-hacer" },
  etapa: null,
  archivo: null,
  huellaDeSalida: null,
  boveda: { fase: "sin-sellar" },
  archivoDeBoveda: null,
  estimacion: null,
  poblacionDeclarada: null,
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
  if (
    tallerActual.transformacion.fase === "sin-hacer" &&
    tallerActual.archivo === null
  ) {
    return;
  }
  soltarArchivo();
  publicarTaller({
    transformacion: { fase: "sin-hacer" },
    archivo: null,
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
    huellaDeSalida: null,
    etapa: "transformando",
  });
  worker.postMessage({ tipo: "transformar", politica });
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

export function prepararArchivo(): void {
  if (!worker) return;
  publicarTaller({ etapa: "escribiendo" });
  worker.postMessage({ tipo: "construir-archivo" });
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
  if (mensaje.tipo === "error")
    return { fase: "error", motivo: mensaje.motivo, nombre };
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
  if (excedeElTope(formato, archivo.size)) {
    // Se rechaza ANTES de abrirlo: abrir un .xlsx enorme es justo la operación que tumba la
    // pestaña, así que la decisión se toma con el único dato disponible sin abrirlo, su tamaño.
    publicar({
      fase: "error",
      motivo: "excel-excede-tope",
      nombre: archivo.name,
    });
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
  if (mensaje.tipo === "riesgo-estimado") {
    publicarTaller({ estimacion: mensaje.estimacion });
    return;
  }
  if (mensaje.tipo === "archivo") {
    // El `Blob` se envuelve AQUÍ y no se guarda en ningún sitio: a partir de esta línea, la única
    // forma de llegar a él es pedirle una URL.
    if (mensaje.proposito === "boveda") {
      publicarTaller({
        archivoDeBoveda: asaDeArchivo(mensaje.blob, mensaje.nombre),
        boveda: { fase: "sellada" },
        etapa: null,
      });
      return;
    }
    publicarTaller({
      archivo: asaDeArchivo(mensaje.blob, mensaje.nombre),
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
      tallerActual.llave.fase === "derivando"
    )
      publicarTaller({ etapa: mensaje.etapa });
  }
  if (
    mensaje.tipo === "error" &&
    (mensaje.motivo === "sin-tabla" ||
      mensaje.motivo === "sin-llave" ||
      mensaje.motivo === "sin-boveda" ||
      mensaje.motivo === "transformacion-fallida")
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
