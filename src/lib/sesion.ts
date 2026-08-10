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

import { excedeElTope, excelGrande, formatoDeArchivo } from "@/lib/archivo";
import type {
  EtapaDelWorker,
  FormatoDeArchivo,
  Informe,
  MensajeDelWorker,
  MotivoDeError,
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

const VACIO: EstadoDeSesion = { fase: "vacio" };

let estadoActual: EstadoDeSesion = VACIO;
let worker: Worker | null = null;
const oyentes = new Set<() => void>();

function publicar(siguiente: EstadoDeSesion): void {
  estadoActual = siguiente;
  for (const oyente of oyentes) oyente();
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

/** Mata el worker y con él la tabla. Es la única forma de "borrar": dejar de tenerlo. */
export function descartar(): void {
  worker?.terminate();
  worker = null;
  publicar(VACIO);
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
  return { fase: "error", motivo: mensaje.motivo, nombre };
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
  const siguiente = siguienteEstado(estadoActual, mensaje, nombre);
  if (siguiente !== estadoActual) publicar(siguiente);
}
