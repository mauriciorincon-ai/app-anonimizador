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

import { decir, type Idioma, type Texto } from "@/lib/idioma";
import { MOTOR_TRANSFORMAR } from "@/lib/idioma/textos/motor-transformar";

const NOMBRES: Readonly<Record<string, Texto>> = MOTOR_TRANSFORMAR;

export function nombreDeTecnica(clave: string, idioma: Idioma): string {
  const texto = NOMBRES[`tecnica.${clave}`];
  return texto ? decir(texto, idioma) : clave;
}
