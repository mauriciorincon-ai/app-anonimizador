// Generalizar — bajar la resolución del dato hasta que deje de señalar a una persona.
//
// Es la familia más delicada de las cuatro, porque es la única que **conserva significado**: un
// rango de edad sigue sirviendo para analizar, y una fecha truncada al año todavía ordena. De ahí
// que la medida de utilidad de la Fase 4 tenga sentido justo aquí.
//
// Regla común a las tres: un valor que no se puede generalizar **se deja como está**. Devolver
// vacío escondería que ahí había algo, y sustituirlo por una marca inventaría un dato que nadie
// escribió. Lo que sí hace la UI es decir cuántos quedaron sin generalizar.

/**
 * Números a intervalos: 37 con amplitud 10 → `30-39`.
 *
 * `Math.floor` y no truncamiento: con negativos, truncar mandaría −5 y 5 al mismo balde `0-9`.
 */
export function generalizarRango(valor: string, amplitud: number): string {
  const numero = Number(valor.trim().replace(",", "."));
  if (!Number.isFinite(numero)) return valor;
  const piso = Math.floor(numero / amplitud) * amplitud;
  return `${piso}-${piso + amplitud - 1}`;
}

/** ISO (`1987-03-14`) y el formato local (`14/03/1987`), que es como la gente escribe fechas. */
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL = /^(\d{2})[/-](\d{2})[/-](\d{4})$/;

/**
 * Fechas recortadas: `1987-03-14` → `1987-03` (mes) o `1987` (año).
 *
 * La salida es SIEMPRE ISO, aunque la entrada viniera en formato local: una columna generalizada
 * que mezclara `1987` con `03/1987` no se podría ni ordenar ni agrupar, que es justo para lo que
 * se generaliza.
 */
export function generalizarFecha(
  valor: string,
  precision: "anio" | "mes",
): string {
  const limpio = valor.trim();
  const iso = ISO.exec(limpio);
  const local = iso ? null : LOCAL.exec(limpio);
  if (!iso && !local) return valor;

  const anio = iso ? iso[1] : local![3];
  const mes = iso ? iso[2] : local![2];
  return precision === "anio" ? anio : `${anio}-${mes}`;
}

/**
 * Los primeros N caracteres. Con códigos DIVIPOLA (5 dígitos), los 2 primeros son el departamento:
 * `05001` (Medellín) → `05` (Antioquia). Con nombres de municipio no sirve, y por eso la UI ofrece
 * esta técnica por lo que es —un prefijo— y no como «municipio a departamento», que prometería una
 * traducción que Velo no tiene.
 */
export function generalizarPrefijo(valor: string, caracteres: number): string {
  const limpio = valor.trim();
  return limpio.length <= caracteres ? limpio : limpio.slice(0, caracteres);
}
