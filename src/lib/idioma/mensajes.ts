// De un `Mensaje` del motor a una frase.
//
// Los motores y el worker no escriben texto: nombran lo que quieren decir (`mensaje("clave", datos)`)
// y esta función lo dice en el idioma que se pida. Sirve igual a la interfaz (que además pinta el
// énfasis) y a los documentos que se descargan (que lo reciben en llano).

import { interpolar, sinMarcado, type Idioma, type Mensaje, type Texto } from "./index";
import { MOTOR, type ClaveDeMotor } from "./textos/motor";

export type MensajeDeMotor = Mensaje<ClaveDeMotor>;

const TABLA: Readonly<Record<string, Texto>> = MOTOR;

/** La frase con su énfasis (`**así**`) todavía marcado. Una clave desconocida se ve: no se esconde. */
export function interpolarMensaje(m: MensajeDeMotor, idioma: Idioma): string {
  const texto = TABLA[m.clave];
  return texto ? interpolar(texto[idioma], idioma, m.datos) : `⟦${m.clave}⟧`;
}

/** La frase en llano, sin marcas de énfasis. */
export function decirMensaje(m: MensajeDeMotor, idioma: Idioma): string {
  return sinMarcado(interpolarMensaje(m, idioma));
}
