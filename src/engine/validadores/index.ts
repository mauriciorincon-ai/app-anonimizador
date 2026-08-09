// Registro de validadores. El ORDEN de esta lista es parte del contrato de determinismo: cuando
// dos validadores empatan en aciertos y en prioridad, gana el que aparece primero aquí. Sin un
// orden fijo, el desempate dependería del recorrido de un objeto y dos corridas podrían clasificar
// distinto — que es justo lo que la regla dura nº3 prohíbe.

import { validadorNombre } from "../diccionarios/nombres";
import {
  validadorCedula,
  validadorCelular,
  validadorFijo,
  validadorNit,
  validadorPlaca,
} from "./colombianos";
import type { Validador } from "./tipos";
import {
  validadorCoordenada,
  validadorEmail,
  validadorFecha,
  validadorIban,
  validadorIp,
  validadorNumero,
  validadorTarjeta,
} from "./universales";

export const VALIDADORES: readonly Validador[] = [
  // Primero los que confirman con un algoritmo oficial: si uno de estos cuadra, no es sospecha.
  validadorNit,
  validadorIban,
  validadorTarjeta,
  // Después los estructurales, del más específico al más genérico.
  validadorIp,
  validadorEmail,
  validadorPlaca,
  validadorCoordenada,
  validadorCelular,
  validadorFijo,
  validadorNombre,
  validadorCedula,
  validadorFecha,
  validadorNumero,
];

export * from "./tipos";
export { digitoVerificacionNit } from "./colombianos";
export { cumpleIban, cumpleLuhn } from "./universales";
export { pareceNombreDePersona } from "../diccionarios/nombres";
