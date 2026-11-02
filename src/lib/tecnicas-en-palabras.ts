// Los nombres de las técnicas en castellano llano —y en inglés—, en un sitio del que puedan leer dos pantallas.
//
// Vivían dentro de `vista-previa.tsx`. Salieron cuando la bitácora del S4 necesitó los mismos
// nombres: importar el componente para llegar al mapa habría arrastrado la vista previa entera al
// bundle de `/bitacora`, que es exactamente el bulto que este repo lleva tres sprints quitando.
//
// **La bitácora guarda la CLAVE, no la etiqueta** (`seudonimizar`, no «seudónimo»). Es una decisión
// de formato de archivo: un registro se lee meses o años después, quizá con otra versión de Velo, y
// las etiquetas de pantalla se reescriben mientras que las claves son el identificador estable. La
// traducción es cosa de quien pinta, no de quien guarda — y por eso el `??` de abajo devuelve la
// clave tal cual cuando no la conoce, en vez de esconder que hay algo que no sabe nombrar.
//
// El nombre de cada técnica vive en el catálogo del motor (`tecnica.<clave>` en
// `textos/motor-transformar.ts`): aquí solo se busca, en el idioma que pide quien pinta. Una entrada
// de bitácora guarda la clave, así que se lee en el idioma de la pantalla de ahora, no en el de
// cuando se anotó.

import { claveDeEscalera } from "@/engine/jerarquias/sugerencia";
import type { JerarquiaDeLaPolitica } from "@/engine/politica";
import { numero } from "@/lib/formato";
import { decir, type Idioma, type Texto } from "@/lib/idioma";
import { GENERALIZACION } from "@/lib/idioma/textos/generalizacion";
import { MOTOR_TRANSFORMAR } from "@/lib/idioma/textos/motor-transformar";

const NOMBRES: Readonly<Record<string, Texto>> = MOTOR_TRANSFORMAR;

export function nombreDeTecnica(clave: string, idioma: Idioma): string {
  const texto = NOMBRES[`tecnica.${clave}`];
  return texto ? decir(texto, idioma) : clave;
}

// ── Las escaleras de la generalización óptima (S7) ────────────────────────────────────────────
//
// Las mismas dos pantallas que comparten nombres de técnicas comparten estos: el panel «Cómo llegar
// al k» y el certificado. El motor entrega CLAVES de nivel (`quinquenio`, `rango-10`); aquí se dicen.

/** Una clave de nivel (`quinquenio`, `rango-10`, `prefijo-2`…) dicha en el idioma pedido; `null` = Mondrian. */
export function nivelEnPalabras(clave: string | null, idioma: Idioma): string {
  if (clave === null) return decir(GENERALIZACION.tabla.local, idioma);
  const conNumero = /^(rango|prefijo)-(\d+)$/.exec(clave);
  if (conNumero)
    return decir(
      GENERALIZACION.niveles[conNumero[1] as "rango" | "prefijo"],
      idioma,
      { n: numero(Number(conNumero[2]), idioma) },
    );
  const texto = (GENERALIZACION.niveles as Record<string, Texto>)[clave];
  return texto ? decir(texto, idioma) : clave;
}

/** El nombre de una escalera: el de las ofrecidas en pantalla, o «la de la política importada». */
export function escaleraEnPalabras(
  jerarquia: JerarquiaDeLaPolitica,
  idioma: Idioma,
): string {
  const clave = claveDeEscalera(jerarquia);
  return decir(GENERALIZACION.escaleras.opciones[clave ?? "propia"], idioma);
}
