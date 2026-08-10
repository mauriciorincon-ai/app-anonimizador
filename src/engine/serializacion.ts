// Serialización canónica — el instrumento del gate de determinismo.
//
// `JSON.stringify` conserva el orden de inserción de las claves, así que dos objetos con el mismo
// contenido construidos por caminos distintos producen cadenas distintas. Para una app cuyo
// argumento central es "mismo input ⇒ misma salida byte por byte", comparar con `JSON.stringify`
// sería comparar con una regla que se mueve.
//
// Esto ordena las claves en todos los niveles y fija la representación de los casos que JSON deja
// ambiguos, de modo que la igualdad de cadenas signifique igualdad de contenido y nada más.

function normalizarNumero(valor: number): string {
  if (Number.isNaN(valor)) return '"NaN"';
  if (!Number.isFinite(valor)) return valor > 0 ? '"Infinity"' : '"-Infinity"';
  // -0 y 0 son el mismo número para cualquier lectura del diagnóstico, pero JSON los distingue.
  if (Object.is(valor, -0)) return "0";
  return JSON.stringify(valor);
}

/**
 * JSON con claves ordenadas en todos los niveles. El orden es alfabético por punto de código
 * (`localeCompare` depende del locale y haría que la salida cambiara según la máquina — justo lo
 * contrario de lo que este archivo existe para garantizar).
 */
export function serializarCanonico(valor: unknown): string {
  if (valor === null) return "null";
  if (typeof valor === "number") return normalizarNumero(valor);
  if (typeof valor === "boolean" || typeof valor === "string")
    return JSON.stringify(valor);
  if (typeof valor === "bigint") return JSON.stringify(valor.toString());
  if (Array.isArray(valor))
    return `[${valor.map(serializarCanonico).join(",")}]`;

  if (typeof valor === "object") {
    // Los typed arrays se serializan como lista de números; sin esto, JSON los volvería objetos
    // con claves "0", "1", "2"… y el diagnóstico sería ilegible además de frágil.
    if (ArrayBuffer.isView(valor) && !(valor instanceof DataView)) {
      return `[${Array.from(valor as unknown as ArrayLike<number>)
        .map(normalizarNumero)
        .join(",")}]`;
    }
    const registro = valor as Record<string, unknown>;
    const claves = Object.keys(registro)
      .filter((clave) => registro[clave] !== undefined)
      .sort();
    const pares = claves.map(
      (clave) =>
        `${JSON.stringify(clave)}:${serializarCanonico(registro[clave])}`,
    );
    return `{${pares.join(",")}}`;
  }

  // undefined, funciones y símbolos no tienen representación estable: se omiten arriba o, si
  // llegan sueltos, se marcan en vez de desaparecer en silencio.
  return "null";
}

/** Huella corta y estable de cualquier estructura. Para comparar dos corridas de un vistazo. */
export function huella(valor: unknown): string {
  const texto = serializarCanonico(valor);
  // FNV-1a de 32 bits: no es criptográfico y no pretende serlo (el SHA-256 del reporte sí lo es);
  // aquí solo hace falta un identificador corto y reproducible para los mensajes de test.
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
