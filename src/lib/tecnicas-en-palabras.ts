// Los nombres de las técnicas en castellano llano, en un sitio del que puedan leer dos pantallas.
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

const NOMBRE_DE_TECNICA: Record<string, string> = {
  conservar: "sin cambios",
  suprimir: "quitada",
  enmascarar: "enmascarada",
  seudonimizar: "seudónimo",
  "seudonimizar-con-formato": "seudónimo con formato",
  "generalizar-rango": "agrupada en rangos",
  "generalizar-fecha": "fecha recortada",
  "generalizar-prefijo": "recortada",
  "generalizar-automatico": "generalizada hasta el k",
};

export function nombreDeTecnica(clave: string): string {
  return NOMBRE_DE_TECNICA[clave] ?? clave;
}
