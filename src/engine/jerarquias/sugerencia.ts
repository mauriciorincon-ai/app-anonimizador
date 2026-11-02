// La escalera que la pantalla propone para una columna (S7), y las que ofrece.
//
// Vive aparte de `jerarquias/index.ts` por peso, igual que `requiereLlave` vive en la política: la
// página necesita proponer y nombrar escaleras, pero no las tablas de fábrica (DIVIPOLA, CIIU), que
// solo usa el worker. Este archivo no importa nada que no sea un tipo.
//
// La propuesta sale del TIPO que el clasificador detectó y del NOMBRE de la columna, jamás de sus
// valores (la página no los tiene). Es una propuesta: el usuario la cambia en un desplegable.

import type { HallazgoDeColumna } from "../clasificador";
import type { JerarquiaDeLaPolitica } from "../politica";

/** Las escaleras que el desplegable ofrece, con su clave estable. */
export const ESCALERAS = {
  "rango-5": { tipo: "rango", amplitudes: [5, 10, 20, 40] },
  "rango-10": { tipo: "rango", amplitudes: [10, 100, 1000, 10000] },
  fecha: { tipo: "fecha" },
  prefijo: { tipo: "prefijo", largos: [3, 2, 1] },
  supresion: { tipo: "supresion" },
  divipola: { tipo: "divipola" },
  "edad-dane": { tipo: "edad-dane" },
  ciiu: { tipo: "ciiu" },
} as const satisfies Record<string, JerarquiaDeLaPolitica>;

export type ClaveDeEscalera = keyof typeof ESCALERAS;

/** La clave de una escalera de la política, o null si no es ninguna de las ofrecidas (importada). */
export function claveDeEscalera(
  jerarquia: JerarquiaDeLaPolitica,
): ClaveDeEscalera | null {
  const texto = JSON.stringify(jerarquia);
  for (const [clave, escalera] of Object.entries(ESCALERAS))
    if (JSON.stringify(escalera) === texto) return clave as ClaveDeEscalera;
  return null;
}

/** El nombre de la columna sin tildes, en minúsculas: «Código_DANE» y «codigo_dane» son lo mismo. */
function plano(nombre: string): string {
  return nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** La escalera que se propone para una columna. Ver el encabezado: tipo y nombre, nunca valores. */
export function escaleraSugerida(
  columna: Pick<HallazgoDeColumna, "nombre" | "tipo">,
): ClaveDeEscalera {
  const n = plano(columna.nombre);
  if (/\bedad\b|edad/.test(n) && columna.tipo !== "fecha") return "edad-dane";
  if (columna.tipo === "fecha" || /fecha|nacimiento/.test(n)) return "fecha";
  if (/municipio|ciudad|departamento|divipola|cod(?:igo)?.?dane/.test(n))
    return "divipola";
  if (/ciiu|actividad.?econ/.test(n)) return "ciiu";
  if (columna.tipo === "numero") return "rango-5";
  return "supresion";
}
