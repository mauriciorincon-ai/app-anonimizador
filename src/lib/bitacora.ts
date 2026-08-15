// La bitácora — el estado de «abrir mi historial, anotar lo que acabo de hacer, y volver a
// guardarlo».
//
// **Vive aparte de `sesion.ts` por la misma razón que `regreso.ts`, y con el mismo patrón.** La
// sesión está construida alrededor de UN archivo con UN diagnóstico; la bitácora es otro flujo,
// sobre otro archivo, sin tabla y sin diagnóstico. Meterla en aquella máquina de estados habría
// roto el diagnóstico para ganar una carpeta menos — y el S3 ya pagó ese aprendizaje una vez.
//
// Tiene **su propio worker**, instancia aparte del mismo `parser.worker.ts`. Que sea otra instancia
// es lo que permite abrir la bitácora en una pestaña donde nunca se cargó un archivo, que es el
// caso real: se consulta meses después, para responderle a alguien.
//
// ── La anotación pendiente, y por qué existe ──────────────────────────────────────────────────
//
// El taller sabe QUÉ anotar —tiene el balance, las dos huellas y el hash de la política— pero la
// bitácora es un archivo cifrado con su propia frase, que es trabajo de otra pantalla. Así que el
// taller deja la entrada aquí, montada, y `/bitacora` es quien la guarda.
//
// La anotación pendiente **no sobrevive a recargar la página**, igual que todo lo demás en Velo.
// Es la misma consecuencia de no tener servidor, y la pantalla lo dice en vez de fingir memoria.
//
// Cero persistencia: lo único durable es el `.velolog` que el usuario guardó, y ese lo tiene él.

import { useSyncExternalStore } from "react";

import type { EntradaDeBitacora } from "@/engine/bitacora";
import { asaDeArchivo, type AsaDeArchivo } from "@/lib/sesion";
import type {
  ContenidoDeBitacora,
  EtapaDelWorker,
  MensajeDelWorker,
  MotivoDeBitacora,
} from "@/workers/contrato";

export type EstadoDelArchivo =
  | { fase: "sin-archivo" }
  | { fase: "abriendo" }
  | { fase: "abierta"; contenido: ContenidoDeBitacora }
  | { fase: "rechazada"; motivo: MotivoDeBitacora; detalle: string };

export interface EstadoDeBitacora {
  readonly archivo: EstadoDelArchivo;
  /** Lo que el taller dejó listo para anotar y todavía no se ha guardado. */
  readonly pendiente: EntradaDeBitacora | null;
  readonly sellando: boolean;
  /** El `.velolog` recién sellado, como asa opaca (ADR-005). */
  readonly guardado: AsaDeArchivo | null;
  readonly etapa: EtapaDelWorker | null;
}

const VACIO: EstadoDeBitacora = {
  archivo: { fase: "sin-archivo" },
  pendiente: null,
  sellando: false,
  guardado: null,
  etapa: null,
};

let estado: EstadoDeBitacora = VACIO;
let worker: Worker | null = null;
const oyentes = new Set<() => void>();

function publicar(cambio: Partial<EstadoDeBitacora>): void {
  estado = { ...estado, ...cambio };
  for (const oyente of oyentes) oyente();
}

function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

export function useBitacora(): EstadoDeBitacora {
  return useSyncExternalStore(
    suscribir,
    () => estado,
    () => VACIO,
  );
}

/** Suelta los bytes del archivo sellado. Mientras la URL viva, ocupan memoria (ADR-005). */
function soltarArchivo(): void {
  if (estado.guardado) URL.revokeObjectURL(estado.guardado.url);
}

function asegurarWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("../workers/parser.worker.ts", import.meta.url));
  worker.addEventListener("message", (evento: MessageEvent<MensajeDelWorker>) =>
    recibir(evento.data),
  );
  worker.addEventListener("error", (evento) => {
    // El texto del evento NO se usa: como cualquier mensaje de excepción aquí, puede citar el
    // contenido del archivo del usuario.
    evento.preventDefault();
    publicar({
      archivo: {
        fase: "rechazada",
        motivo: "lectura-fallida",
        detalle: "No se pudo leer el archivo.",
      },
      sellando: false,
      etapa: null,
    });
  });
  return worker;
}

/**
 * El taller deja aquí lo que hay que anotar. No abre nada ni pide frases: solo prepara.
 *
 * Se llama al terminar el tratamiento, cuando ya existen las dos huellas — antes no, porque una
 * entrada sin la huella de salida no se podría atar nunca a su certificado.
 */
export function anotarTratamiento(entrada: EntradaDeBitacora): void {
  publicar({ pendiente: entrada });
}

/** Descarta la anotación sin guardarla. Decisión del usuario, y sin insistir. */
export function descartarAnotacion(): void {
  publicar({ pendiente: null });
}

/**
 * Abre un `.velolog`. La frase entra al worker y **no vuelve a salir**: misma frontera que la
 * bóveda del S3 y que la llave del S2.
 */
export function abrirArchivoDeBitacora(archivo: File, frase: string): void {
  publicar({ archivo: { fase: "abriendo" }, etapa: "abriendo-bitacora" });
  asegurarWorker().postMessage({ tipo: "abrir-bitacora", archivo, frase });
}

/**
 * Sella la bitácora con la anotación pendiente al final y la deja lista para guardar.
 *
 * **La frase se pide también cuando la bitácora ya está abierta.** Es deliberado: el worker no la
 * retiene entre mensajes, así que escribirla otra vez es el precio de que no exista en memoria
 * durante toda la sesión.
 */
export function guardarBitacora(frase: string): void {
  soltarArchivo();
  publicar({ sellando: true, guardado: null, etapa: "sellando-bitacora" });
  asegurarWorker().postMessage({
    tipo: "sellar-bitacora",
    frase,
    entrada: estado.pendiente,
  });
}

/** Mata el worker y con él la bitácora abierta. Es la única forma de «cerrarla»: no tenerla. */
export function cerrarBitacora(): void {
  worker?.terminate();
  worker = null;
  soltarArchivo();
  estado = { ...VACIO, pendiente: estado.pendiente };
  for (const oyente of oyentes) oyente();
}

function recibir(mensaje: MensajeDelWorker): void {
  switch (mensaje.tipo) {
    case "bitacora-abierta":
      publicar({
        archivo: { fase: "abierta", contenido: mensaje.contenido },
        // Si la anotación pendiente acaba de entrar en el archivo sellado, deja de estar
        // pendiente. Se compara por la huella de salida, que es lo que hace única a una entrada.
        pendiente:
          estado.pendiente &&
          mensaje.contenido.entradas.some(
            (e) => e.huellaDeSalida === estado.pendiente?.huellaDeSalida,
          )
            ? null
            : estado.pendiente,
        sellando: false,
        etapa: null,
      });
      return;
    case "bitacora-rechazada":
      publicar({
        archivo: {
          fase: "rechazada",
          motivo: mensaje.motivo,
          detalle: mensaje.detalle,
        },
        sellando: false,
        etapa: null,
      });
      return;
    case "archivo":
      if (mensaje.proposito === "bitacora") {
        // El `Blob` se envuelve AQUÍ y no se guarda: a partir de esta línea la única forma de
        // llegar a él es pedirle una URL.
        publicar({
          guardado: asaDeArchivo(mensaje.blob, mensaje.nombre),
          etapa: null,
        });
      }
      return;
    case "progreso":
      publicar({ etapa: mensaje.etapa });
      return;
    case "error":
      publicar({ sellando: false, etapa: null });
      return;
    default:
      // Los mensajes de los otros flujos no llegan aquí: este worker nunca recibe esos encargos.
      return;
  }
}
