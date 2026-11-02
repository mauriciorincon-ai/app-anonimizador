// De lo que leyó un lector a lo que puede ver la página: el valor ENMASCARADO y lo que un validador
// confirmó de él.
//
// Es la misma regla que el diagnóstico de una tabla (S1): la muestra va enmascarada y la conclusión
// sale de un algoritmo con fuente, no de una impresión. Un metadato no es una columna —es UN valor—,
// así que aquí no hay proporciones: el validador cuadra o no cuadra con ese valor.
//
// Un autor escrito como `Ana Pérez · CC 1032456789` no es una cédula entera, pero LLEVA una. Por eso,
// si el valor entero no cuadra con nada que identifique, se prueba por partes (separadas por espacios
// y signos), y la detección dice `dentro: true`: «aquí dentro hay una cédula», no «esto es una cédula».

import { enmascarar } from "../mascara";
import { VALIDADORES } from "../validadores";
import type { Validador } from "../validadores/tipos";
import type { CampoCrudo, CampoDeMetadato, Deteccion } from "./tipos";

/**
 * Lo que no se reporta como detección: decir «es un número» o «es un texto» de un metadato no le
 * cuenta nada a nadie. Una fecha sí se reporta: en un metadato es CUÁNDO, y eso es lo que revela.
 */
const NO_DICEN_NADA = new Set(["numero", "texto", "categoria"]);

/** Cuántas partes de un valor se prueban como mucho. Un valor tiene `LARGO_MAXIMO_DE_VALOR`. */
const MAXIMO_DE_PARTES = 64;

function aDeteccion(validador: Validador, dentro: boolean): Deteccion {
  return {
    tipo: validador.id,
    etiqueta: validador.etiqueta,
    certeza: validador.certeza,
    categoria: validador.categoria,
    dentro,
  };
}

/** El primer validador (en el orden fijo del registro) que cuadra con este valor. */
function validadorDe(valor: string, clave: string): Validador | null {
  for (const validador of VALIDADORES) {
    if (NO_DICEN_NADA.has(validador.id)) continue;
    if (validador.valida(valor, { nombre: clave })) return validador;
  }
  return null;
}

export function detectar(valor: string, clave: string): Deteccion | null {
  const entero = validadorDe(valor, clave);
  if (entero) return aDeteccion(entero, false);

  // Por partes: espacios y los separadores que la gente escribe entre un nombre y un número. El
  // punto NO separa: está dentro de un correo, de una coordenada y de una cédula con miles.
  const partes = valor
    .split(/[\s,;|·/()[\]]+/)
    .filter((p) => p.length >= 3)
    .slice(0, MAXIMO_DE_PARTES);
  if (partes.length < 2) return null;
  for (const parte of partes) {
    const validador = validadorDe(parte, clave);
    // Un nombre no se busca por partes: cualquier palabra suelta de un título parecería uno.
    if (validador && validador.id !== "nombre")
      return aDeteccion(validador, true);
  }
  return null;
}

/** El campo como puede cruzar: valor enmascarado, detección y nada más. */
export function campoParaLaPagina(campo: CampoCrudo): CampoDeMetadato {
  return {
    clave: campo.clave,
    origen: campo.origen,
    revela: campo.revela,
    muestra: enmascarar(campo.valor),
    deteccion: detectar(campo.valor, campo.clave),
  };
}
