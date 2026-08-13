// El regreso — el estado de «cargar lo que devolvió el tercero y recuperar los originales».
//
// **Vive aparte de `sesion.ts` a propósito, y no por tamaño.** La sesión del S1 está construida
// alrededor de UN archivo con UN diagnóstico: `EstadoDeSesion` tiene `vacio|analizando|listo|error`
// y el worker guarda su tabla y su informe. El regreso es otro flujo — otro archivo, sin
// diagnóstico, con una bóveda — y meterlo en aquella máquina de estados habría roto el diagnóstico
// para ganar una carpeta menos.
//
// Tiene **su propio worker**, instancia aparte del mismo `parser.worker.ts`. Se reutiliza el parser
// —leer un CSV es leer un CSV— y no el pipeline de diagnóstico. Que sea otra instancia es lo que
// permite restaurar en una pestaña donde nunca se cargó un original, que es el caso real: el
// archivo vuelve semanas después, en otra sesión.
//
// Cero persistencia, igual que la sesión: recargar `/regreso` no recupera nada. Lo único durable es
// el archivo `.velo` que el usuario guardó, y ese lo tiene él.

import { useSyncExternalStore } from "react";

import { asaDeArchivo, type AsaDeArchivo } from "@/lib/sesion";
import type {
  EtapaDelWorker,
  MensajeDelWorker,
  MotivoDeBoveda,
  MotivoDeError,
  ResumenDeBoveda,
  ResumenDelRegreso,
} from "@/workers/contrato";

export type EstadoDeLaBoveda =
  | { fase: "sin-boveda" }
  | { fase: "abriendo" }
  | { fase: "abierta"; resumen: ResumenDeBoveda }
  | { fase: "rechazada"; motivo: MotivoDeBoveda; detalle: string };

export type EstadoDelDevuelto =
  | { fase: "sin-archivo" }
  | { fase: "analizando"; nombre: string; bytes: number; filas: number }
  | {
      fase: "listo";
      nombre: string;
      bytes: number;
      filas: number;
      columnas: number;
      sha256: string;
    }
  | { fase: "error"; motivo: MotivoDeError; nombre: string };

export type EstadoDeRestauracion =
  | { fase: "sin-hacer" }
  | { fase: "restaurando" }
  | { fase: "hecha"; resumen: ResumenDelRegreso }
  | { fase: "fallo"; motivo: MotivoDeError };

export interface EstadoDelRegreso {
  readonly boveda: EstadoDeLaBoveda;
  readonly devuelto: EstadoDelDevuelto;
  readonly restauracion: EstadoDeRestauracion;
  readonly etapa: EtapaDelWorker | null;
  /** El CSV restaurado, como asa opaca (ADR-005). */
  readonly archivo: AsaDeArchivo | null;
  /** El informe HTML del regreso, también como asa. */
  readonly informe: AsaDeArchivo | null;
}

const VACIO: EstadoDelRegreso = {
  boveda: { fase: "sin-boveda" },
  devuelto: { fase: "sin-archivo" },
  restauracion: { fase: "sin-hacer" },
  etapa: null,
  archivo: null,
  informe: null,
};

let estado: EstadoDelRegreso = VACIO;
let worker: Worker | null = null;
let nombreDelDevuelto = "";
const oyentes = new Set<() => void>();

function publicar(cambio: Partial<EstadoDelRegreso>): void {
  estado = { ...estado, ...cambio };
  for (const oyente of oyentes) oyente();
}

function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

export function useRegreso(): EstadoDelRegreso {
  return useSyncExternalStore(
    suscribir,
    () => estado,
    () => VACIO,
  );
}

/** Suelta los bytes de lo preparado. Mientras la URL viva, ocupan memoria (ADR-005). */
function soltarArchivos(): void {
  if (estado.archivo) URL.revokeObjectURL(estado.archivo.url);
  if (estado.informe) URL.revokeObjectURL(estado.informe.url);
}

/**
 * Mata el worker y con él la bóveda, la tabla devuelta y la restauración. Es la única forma de
 * «borrar»: dejar de tenerlo.
 */
export function descartarRegreso(): void {
  worker?.terminate();
  worker = null;
  soltarArchivos();
  estado = VACIO;
  for (const oyente of oyentes) oyente();
}

function asegurarWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("../workers/parser.worker.ts", import.meta.url));
  worker.addEventListener("message", (evento: MessageEvent<MensajeDelWorker>) =>
    recibir(evento.data),
  );
  worker.addEventListener("error", (evento) => {
    // El texto del evento NO se usa: como cualquier mensaje de excepción aquí, puede citar
    // contenido del archivo o de la bóveda.
    evento.preventDefault();
    publicar({
      devuelto: {
        fase: "error",
        motivo: "lectura-fallida",
        nombre: nombreDelDevuelto,
      },
      etapa: null,
    });
  });
  return worker;
}

/**
 * Abre la bóveda. La frase de paso entra al worker y **no vuelve a salir**: misma frontera que la
 * llave del S2. A la página solo cruzan huellas y conteos.
 */
export function abrirLaBoveda(archivo: File, frase: string): void {
  publicar({ boveda: { fase: "abriendo" }, etapa: "abriendo-boveda" });
  // El `File` viaja entero al worker. Ningún componente lo abre: una bóveda contiene los valores
  // ORIGINALES del usuario, y el gate de privacidad veta `.arrayBuffer()` fuera de `src/workers/`.
  asegurarWorker().postMessage({ tipo: "abrir-boveda", archivo, frase });
}

export function cargarDevuelto(archivo: File): void {
  nombreDelDevuelto = archivo.name;
  soltarArchivos();
  publicar({
    devuelto: {
      fase: "analizando",
      nombre: archivo.name,
      bytes: archivo.size,
      filas: 0,
    },
    restauracion: { fase: "sin-hacer" },
    archivo: null,
    informe: null,
    etapa: "leyendo",
  });
  asegurarWorker().postMessage({ tipo: "analizar-devuelto", archivo });
}

export function restaurarAhora(): void {
  if (!worker) return;
  soltarArchivos();
  publicar({
    restauracion: { fase: "restaurando" },
    archivo: null,
    informe: null,
    etapa: "restaurando",
  });
  worker.postMessage({ tipo: "restaurar" });
}

export function prepararRestaurado(): void {
  if (!worker) return;
  publicar({ etapa: "escribiendo" });
  worker.postMessage({ tipo: "construir-restaurado" });
}

export function prepararInformeDelRegreso(fecha: string): void {
  if (!worker) return;
  publicar({ etapa: "escribiendo" });
  worker.postMessage({ tipo: "construir-informe-del-regreso", fecha });
}

function recibir(mensaje: MensajeDelWorker): void {
  switch (mensaje.tipo) {
    case "boveda-abierta":
      publicar({
        boveda: { fase: "abierta", resumen: mensaje.resumen },
        etapa: null,
      });
      return;
    case "boveda-rechazada":
      publicar({
        boveda: {
          fase: "rechazada",
          motivo: mensaje.motivo,
          detalle: mensaje.detalle,
        },
        etapa: null,
      });
      return;
    case "devuelto-listo":
      publicar({
        devuelto: {
          fase: "listo",
          nombre: mensaje.nombre,
          bytes: mensaje.bytes,
          filas: mensaje.filas,
          columnas: mensaje.columnas,
          sha256: mensaje.sha256,
        },
        etapa: null,
      });
      return;
    case "restaurado":
      publicar({
        restauracion: { fase: "hecha", resumen: mensaje.resumen },
        etapa: null,
      });
      return;
    case "archivo":
      // El `Blob` se envuelve AQUÍ y no se guarda en ningún sitio: a partir de esta línea la única
      // forma de llegar a él es pedirle una URL.
      if (mensaje.proposito === "restaurado") {
        publicar({
          archivo: asaDeArchivo(mensaje.blob, mensaje.nombre),
          etapa: null,
        });
      } else if (mensaje.proposito === "informe-del-regreso") {
        publicar({
          informe: asaDeArchivo(mensaje.blob, mensaje.nombre),
          etapa: null,
        });
      }
      return;
    case "progreso":
      publicar({ etapa: mensaje.etapa });
      return;
    case "error":
      if (mensaje.motivo === "restauracion-fallida") {
        publicar({
          restauracion: { fase: "fallo", motivo: mensaje.motivo },
          etapa: null,
        });
        return;
      }
      publicar({
        devuelto: {
          fase: "error",
          motivo: mensaje.motivo,
          nombre: nombreDelDevuelto,
        },
        etapa: null,
      });
      return;
    default:
      // Los mensajes del otro flujo —informe del diagnóstico, llave, transformación— no llegan
      // aquí: este worker nunca recibe esos encargos.
      return;
  }
}
