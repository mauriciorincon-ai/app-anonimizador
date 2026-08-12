// l-diversity y t-closeness — lo que k-anonimato NO cubre, medido sobre la partición ya formada.
//
// k-anonimato responde «¿con cuánta gente me confundo?». No responde qué se aprende de mí una vez
// dentro del grupo. Si las 5 personas de mi clase tienen el mismo diagnóstico, saber cuál soy deja
// de importar: el atributo sensible se revela igual. Es el **ataque de homogeneidad**, y es la
// razón por la que estas dos métricas existen.
//
//   · **l-diversity** — Machanavajjhala, Kifer, Gehrke & Venkitasubramaniam, *ℓ-Diversity: Privacy
//     Beyond k-Anonymity*, ICDE 2006 / TKDD 2007. https://doi.org/10.1145/1217299.1217302
//     Aquí se mide la variante **distinta** (cuántos valores sensibles diferentes hay en la clase
//     más pobre), no la entrópica ni la recursiva (c,ℓ). Es la más conservadora de leer y la única
//     que se puede explicar en una línea a quien no estudió el paper.
//
//   · **t-closeness** — Li, Li & Venkatasubramanian, *t-Closeness: Privacy Beyond k-Anonymity and
//     ℓ-Diversity*, ICDE 2007. https://doi.org/10.1109/ICDE.2007.367856
//     Distancia entre la distribución del atributo dentro de la clase y la del archivo entero. Una
//     clase puede tener 5 valores distintos (ℓ=5, aprobado) y aun así ser un 90 % de un diagnóstico
//     que en el archivo completo es el 2 %: eso también delata, y ℓ no lo ve.
//
// ⚠️ **Límites declarados, no escondidos.** El ADR-002 §4 las dejó explícitamente como «no
// medidas»; este módulo las **mide y las reporta — no las optimiza**. Optimizarlas es NP-hard
// (arXiv:0912.5426); verificarlas sobre una partición ya hecha es lineal, que es exactamente lo que
// se hace aquí. Y la distancia es la de **variación total**, propia de atributos categóricos: para
// atributos con orden natural el paper usa EMD ordenada, que Velo no implementa. Un diagnóstico
// CIE-10 no tiene orden, así que la métrica encaja con el caso real — pero si alguien marcara como
// sensible una columna ordenada, el número saldría más optimista de lo que debería. Queda dicho.

import { type ColumnaColumnar, type TablaColumnar } from "./columnar";
import { clasesDeEquivalencia } from "./riesgo";

export interface MedidaDeDiversidad {
  readonly atributo: string;
  readonly clases: number;
  /** ℓ distinta: valores sensibles diferentes en la clase MÁS POBRE. 1 = alguien queda expuesto. */
  readonly l: number;
  /** Clases donde todo el mundo comparte el mismo valor sensible: el ataque de homogeneidad. */
  readonly clasesHomogeneas: number;
  /** Filas que viven en una de esas clases. Es el número que le importa a una persona. */
  readonly filasEnClasesHomogeneas: number;
  /** t: la MAYOR distancia entre la distribución de una clase y la del archivo. 0 = idénticas. */
  readonly t: number;
  readonly metrica: "variacion-total";
}

/**
 * Mide ℓ y t de cada atributo sensible sobre las clases que forman los cuasi-identificadores dados.
 *
 * La celda vacía cuenta como un valor más del atributo. No es un descuido: una clase donde todo el
 * mundo tiene el diagnóstico en blanco es tan homogénea como una donde todos tienen el mismo, y
 * tratar el vacío como «ausencia» la dejaría pasar por diversa.
 */
export function medirDiversidad(
  tabla: TablaColumnar,
  nombresQi: readonly string[],
  nombresSensibles: readonly string[],
): MedidaDeDiversidad[] {
  const porNombre = new Map(tabla.columnas.map((c) => [c.nombre, c]));
  const columnasQi = nombresQi
    .map((nombre) => porNombre.get(nombre))
    .filter((c): c is ColumnaColumnar => c !== undefined);

  const { ids, tamanos } = clasesDeEquivalencia(columnasQi, tabla.filas);

  // Filas agrupadas por clase con un counting sort: un pase para los desplazamientos y otro para
  // colocarlas. Sin él, recorrer «las filas de la clase c» costaría un barrido por clase, y con
  // 65.000 clases sobre 500.000 filas eso es tiempo cuadrático disfrazado.
  const desplazamiento = new Uint32Array(tamanos.length + 1);
  for (let c = 0; c < tamanos.length; c++) {
    desplazamiento[c + 1] = desplazamiento[c] + tamanos[c];
  }
  const cursor = Uint32Array.from(desplazamiento.subarray(0, tamanos.length));
  const filasPorClase = new Uint32Array(tabla.filas);
  for (let f = 0; f < tabla.filas; f++) filasPorClase[cursor[ids[f]]++] = f;

  return nombresSensibles
    .map((nombre) => porNombre.get(nombre))
    .filter((c): c is ColumnaColumnar => c !== undefined)
    .map((columna) =>
      medirColumna(
        columna,
        tamanos,
        desplazamiento,
        filasPorClase,
        tabla.filas,
      ),
    );
}

function medirColumna(
  columna: ColumnaColumnar,
  tamanos: Uint32Array,
  desplazamiento: Uint32Array,
  filasPorClase: Uint32Array,
  filas: number,
): MedidaDeDiversidad {
  const cardinalidad = columna.valores.length;
  const global = new Float64Array(cardinalidad);
  for (let f = 0; f < filas; f++) global[columna.codigos[f]]++;
  for (let v = 0; v < cardinalidad; v++) global[v] /= filas || 1;

  const cuenta = new Uint32Array(cardinalidad);
  const presentes: number[] = [];
  let l = Number.POSITIVE_INFINITY;
  let homogeneas = 0;
  let filasHomogeneas = 0;
  let t = 0;

  for (let c = 0; c < tamanos.length; c++) {
    const enLaClase = tamanos[c];
    presentes.length = 0;
    for (let i = desplazamiento[c]; i < desplazamiento[c + 1]; i++) {
      const codigo = columna.codigos[filasPorClase[i]];
      if (cuenta[codigo] === 0) presentes.push(codigo);
      cuenta[codigo]++;
    }

    if (presentes.length < l) l = presentes.length;
    if (presentes.length === 1) {
      homogeneas++;
      filasHomogeneas += enLaClase;
    }

    // Distancia de variación total = ½·Σ|p−q| sobre TODO el dominio. Los valores ausentes de la
    // clase aportan q entero, así que su suma es (1 − Σq de los presentes): eso evita recorrer un
    // dominio de 112.000 valores por cada una de 65.000 clases.
    let suma = 0;
    let qPresente = 0;
    for (const codigo of presentes) {
      suma += Math.abs(cuenta[codigo] / enLaClase - global[codigo]);
      qPresente += global[codigo];
      cuenta[codigo] = 0;
    }
    const distancia = (suma + Math.max(0, 1 - qPresente)) / 2;
    if (distancia > t) t = distancia;
  }

  return {
    atributo: columna.nombre,
    clases: tamanos.length,
    l: Number.isFinite(l) ? l : 0,
    clasesHomogeneas: homogeneas,
    filasEnClasesHomogeneas: filasHomogeneas,
    t,
    metrica: "variacion-total",
  };
}
