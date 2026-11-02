// De un `Mensaje` del motor a una frase.
//
// Los motores y el worker no escriben texto: nombran lo que quieren decir (`mensaje("clave", datos)`)
// y esta función lo dice en el idioma que se pida. Sirve igual a la interfaz (que además pinta el
// énfasis) y a los documentos que se descargan (que lo reciben en llano).

import {
  armar,
  type Idioma,
  type Mensaje,
  type Texto,
  type Tramo,
} from "./index";
import { MOTOR, type ClaveDeMotor } from "./textos/motor";

export type MensajeDeMotor = Mensaje<ClaveDeMotor>;

const TABLA: Readonly<Record<string, Texto>> = MOTOR;

/** La frase lista para pintar, con su énfasis. Una clave desconocida se ve: no se esconde. */
export function armarMensaje(m: MensajeDeMotor, idioma: Idioma): Tramo[] {
  const texto = TABLA[m.clave];
  return texto
    ? armar(texto[idioma], idioma, m.datos)
    : [{ tipo: "texto", texto: `⟦${m.clave}⟧` }];
}

/** La frase en llano, sin marcas de énfasis. */
export function decirMensaje(m: MensajeDeMotor, idioma: Idioma): string {
  return armarMensaje(m, idioma)
    .map((t) => t.texto)
    .join("");
}
