// Lo que comparten las jerarquías genéricas y las de fábrica, aparte para que no se importen en círculo.

/** El valor que no dice nada: el último nivel de toda jerarquía. */
export const SUPRIMIDO = "*";

/** Un nivel: de un valor del archivo a su versión en ese nivel. */
export type Nivel = (valor: string) => string;
