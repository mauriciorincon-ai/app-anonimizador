// Contrato de los validadores de Velo.
//
// El producto promete algo fuerte: "si lo marca, es porque el algoritmo oficial lo confirma". Ese
// contrato solo es honesto si el código distingue lo que de verdad se confirma de lo que apenas se
// reconoce por su forma — y lo dice. De ahí sale `certeza`:
//
//   · "algoritmo-oficial" → hay un dígito de verificación que se recomputa y cuadra (NIT con el
//     mod 11 de la DIAN, tarjetas con Luhn, IBAN con el 97-10). Un valor así no es una sospecha.
//   · "estructural"       → no existe checksum público y solo se puede verificar la forma
//     (una cédula colombiana no tiene DV publicado; un correo tampoco). Se marca igual, pero la
//     UI no puede presentarlo con la misma seguridad.
//
// Mezclar las dos cosas bajo una sola palabra ("detectado") sería exactamente la clase de
// exageración que la regla de honestidad medida prohíbe.

/** Tipo de dato que un validador reconoce. */
export type TipoDetectado =
  | "nit"
  | "cedula"
  | "celular-co"
  | "fijo-co"
  | "placa-co"
  | "tarjeta"
  | "iban"
  | "email"
  | "ip"
  | "coordenada"
  | "fecha"
  | "nombre"
  | "categoria"
  | "numero"
  | "texto";

/**
 * Categorías de la Ley 1581 de 2012, en su sentido EXACTO.
 *
 * El art. 5 define "dato sensible" de forma estrecha: los que revelan origen racial o étnico,
 * orientación política, convicciones religiosas o filosóficas, pertenencia a sindicatos u
 * organizaciones, datos de salud, de vida sexual y biométricos. Una cédula NO es un dato sensible:
 * es un dato personal, y además un identificador directo. Meter la cédula bajo "sensible" sería
 * cómodo para pintar la UI de rojo y falso ante cualquiera que conozca la ley.
 *
 * Por eso la escala no es alto/medio/bajo: son cuatro categorías con significado jurídico propio.
 * El RIESGO —que sí es una magnitud— vive aparte, en el motor que lo mide.
 */
export type CategoriaLey1581 =
  | "identificador-directo"
  | "cuasi-identificador"
  | "dato-sensible"
  | "no-personal";

export type Certeza = "algoritmo-oficial" | "estructural";

/**
 * Contexto de la columna que se está validando.
 *
 * Casi todos los validadores se bastan con el valor. La excepción es honesta y necesaria: hay
 * formas que NO son distinguibles mirando solo el dato. Una cédula histórica de 7 dígitos tiene
 * exactamente la misma forma que un monto en pesos, y como la cédula colombiana no tiene checksum
 * público, ningún cálculo puede separarlas. En esos casos el encabezado es la única señal
 * disponible — y el validador la pide en vez de adivinar.
 */
export interface ContextoDeColumna {
  readonly nombre: string;
}

export interface Validador {
  /** Identificador estable; se usa en la UI, en los tests y en la serialización canónica. */
  readonly id: TipoDetectado;
  /** Nombre en español llano para la interfaz. */
  readonly etiqueta: string;
  /** Fuente oficial del algoritmo. Va al código, no solo a la documentación. */
  readonly fuente: string;
  readonly certeza: Certeza;
  readonly categoria: CategoriaLey1581;
  /**
   * Prioridad ante empates: gana el más específico. Un número de tarjeta pasa Luhn Y parece un
   * número; sin prioridad, el desempate dependería del orden de iteración — y ahí se va el
   * determinismo.
   */
  readonly prioridad: number;
  /** ¿este valor concreto cumple? Recibe el valor tal como vino, sin normalizar. */
  valida(valor: string, contexto: ContextoDeColumna): boolean;
}
