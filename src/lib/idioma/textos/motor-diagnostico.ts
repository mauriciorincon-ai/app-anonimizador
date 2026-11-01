// Mensajes del motor — lo que el motor dice al leer la tabla — tipos, evidencias, fuentes, riesgo exacto y estimado.
//
// Cada clave es una frase que el motor o el worker NOMBRAN sin escribir: devuelven
// `mensaje("area.clave", { datos })` y la interfaz, o el documento que se descarga, la convierte en
// texto en el idioma que corresponde. Claves planas con punto (`area.cosa`); los números viajan
// crudos en `datos` y se formatean al decirlos (`{n}` o `{n:2}`), jamás dentro del motor.
//
// El español de aquí es el que ya tenían los motores y las pruebas — se conserva palabra por palabra.
// El inglés se redacta al lado: no se traduce frase a frase si una construcción natural pide otra.

import type { Texto } from "../index";

export const MOTOR_DIAGNOSTICO = {} as const satisfies Readonly<Record<string, Texto>>;
