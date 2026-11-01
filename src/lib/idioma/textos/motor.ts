// El catálogo del motor, ensamblado. Un archivo por área (`motor-*.ts`) para que cada pantalla
// pueda crecer sin tocar a las demás; aquí se juntan en una sola tabla de claves.
//
// `ClaveDeMotor` es la unión de todas las claves: un `mensaje("clave.que.no.existe")` no compila.
// `tests/unit/idioma.test.ts` comprueba además que ninguna clave se repita entre áreas (con el
// `...` la última ganaría en silencio).

import type { Texto } from "../index";

import { MOTOR_DIAGNOSTICO } from "./motor-diagnostico";
import { MOTOR_REGRESO } from "./motor-regreso";
import { MOTOR_TRANSFORMAR } from "./motor-transformar";

export const MOTOR = {
  ...MOTOR_DIAGNOSTICO,
  ...MOTOR_TRANSFORMAR,
  ...MOTOR_REGRESO,
} as const satisfies Readonly<Record<string, Texto>>;

export type ClaveDeMotor = keyof typeof MOTOR;
