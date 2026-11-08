// EN MEMORIA (S9): lo que el worker hace con un CSV que cabe entero en la pestaña, sin `self`.
//
// Hasta el S8 vivía dentro de `parser.worker.ts`, enredado con sus mensajes. Velo local (ADR-017)
// necesita lo MISMO —el mismo archivo tiene que dar el mismo certificado en la web y en el equipo—,
// así que sale aquí y los dos lo llaman. Como `alto-volumen.ts`, este módulo no conoce `self` ni
// manda mensajes: es lo que lo deja correr en Node.

import { balanceDelTratamiento } from "@/engine/balance";
import type { Diagnostico } from "@/engine/clasificador";
import { ConstructorColumnar, type TablaColumnar } from "@/engine/columnar";
import { medirDiversidad } from "@/engine/diversidad";
import { muestraDeColumna } from "@/engine/muestra";
import { generalizacionAplicada, TOPE_DE_NODOS } from "@/engine/optima";
import type { Politica } from "@/engine/politica";
import { DOMINIO_MAXIMO, informeDePrivacidad } from "@/engine/ruido";
import { aplicarPolitica } from "@/engine/tecnicas";
import { medirUtilidad } from "@/engine/utilidad";
import { TOPE_DE_CELDAS_EN_MEMORIA } from "@/lib/archivo";
import type { Idioma } from "@/lib/idioma";

import { lotesDeCsv, type OpcionesDeLectura } from "./csv";

/**
 * El CSV a una tabla; `"alto-volumen"` si pasa del tope de celdas en memoria —entonces va por
 * pasadas (ADR-015)—, o `"vacio"` si no trae ni el encabezado. El tope es una constante de build: el mismo archivo entra por el mismo camino en
 * cualquier equipo, en la web y en Velo local.
 */
export async function tablaDeCsv(
  archivo: Blob,
  opciones: OpcionesDeLectura & {
    readonly alLeerFilas?: (filas: number) => void;
    /** Solo las pruebas lo bajan, para recorrer el camino por pasadas con un archivo chico. */
    readonly topeDeCeldas?: number;
  } = {},
): Promise<TablaColumnar | "alto-volumen" | "vacio"> {
  let constructor: ConstructorColumnar | null = null;
  // El ancho es el del ENCABEZADO: la primera fila de un lote posterior puede venir corta o larga.
  let ancho = 0;
  let filas = 0;
  for await (const lote of lotesDeCsv(archivo, opciones)) {
    let desde = 0;
    if (!constructor) {
      constructor = new ConstructorColumnar(lote[0] ?? [], 1 << 16);
      ancho = lote[0]?.length ?? 0;
      desde = 1;
    }
    for (let i = desde; i < lote.length; i++) constructor.agregarFila(lote[i]);
    filas += lote.length - desde;
    if (filas * ancho > (opciones.topeDeCeldas ?? TOPE_DE_CELDAS_EN_MEMORIA))
      return "alto-volumen";
    opciones.alLeerFilas?.(filas);
  }
  if (!constructor) return "vacio";
  return constructor.finalizar();
}

/**
 * La transformación en memoria y todo lo que se mide de ella: `aplicarPolitica` sobre la tabla
 * entera, el balance, la utilidad, la vista previa, la óptima aplicada y el ruido con su ε.
 */
export async function transformarEnMemoria(
  original: TablaColumnar,
  diagnostico: Diagnostico,
  politica: Politica,
  llave: CryptoKey | null,
  idioma: Idioma,
  huella: string,
) {
  // El idioma del trabajo llega como dato y se queda en el resultado. La huella del archivo de
  // entrada entra a la semilla del ruido (S7, `ruido/azar.ts`).
  const resultado = await aplicarPolitica(
    original,
    politica,
    llave,
    idioma,
    huella,
  );

  const sensibles = diagnostico.columnas
    .filter((c) => c.categoria === "dato-sensible")
    .map((c) => c.nombre)
    .filter((n) => !resultado.suprimidas.includes(n));
  const qis = diagnostico.columnas
    .filter((c) => c.categoria === "cuasi-identificador")
    .map((c) => c.nombre)
    .filter((n) => !resultado.suprimidas.includes(n));
  const diversidad = medirDiversidad(resultado.tabla, qis, sensibles);
  // Una retícula que pasó del tope no se recorrió: no hay nada aplicado que contar.
  const optimaAplicada =
    resultado.optima?.motivo === "excede-tope" ? null : resultado.optima;

  const balance = balanceDelTratamiento({
    tablaOriginal: original,
    tablaTransformada: resultado.tabla,
    diagnostico,
    politica,
    suprimidas: resultado.suprimidas,
    colisiones: resultado.colisiones,
    // La salvedad del k habla del k: una óptima que llegó al k y no a la ℓ pedida no es un «k no
    // alcanzado». La ℓ la cuenta el certificado, en la sección de la generalización.
    mondrian:
      resultado.mondrian ??
      (optimaAplicada
        ? {
            ...optimaAplicada,
            alcanzado: optimaAplicada.kAlcanzado >= optimaAplicada.kObjetivo,
          }
        : null),
    diversidad,
    pendientesDeMondrian: resultado.pendientesDeMondrian,
    ruidoNoAplicado: {
      columnas: resultado.ruido
        .filter((r) => !r.aplicado)
        .map((r) => r.columna),
      maximo: DOMINIO_MAXIMO,
    },
    reticulaExcedida:
      resultado.optima?.motivo === "excede-tope"
        ? {
            dimensiones: resultado.optima.dimensiones,
            nodos: resultado.optima.nodosEnLaReticula,
            tope: TOPE_DE_NODOS,
          }
        : null,
  });

  const porNombre = new Map(resultado.tabla.columnas.map((c) => [c.nombre, c]));
  const categorias = new Map(
    diagnostico.columnas.map((c) => [c.nombre, c.categoria as string]),
  );
  const muestras = original.columnas.map((columna) =>
    muestraDeColumna(
      columna,
      porNombre.get(columna.nombre),
      politica,
      categorias.get(columna.nombre) ?? "no-personal",
      original.filas,
    ),
  );

  return {
    resultado,
    qis,
    balance,
    utilidad: medirUtilidad(
      original,
      resultado.tabla,
      new Set(
        politica.reglas
          .filter(
            (r) =>
              r.tecnica.tipo === "laplace" || r.tecnica.tipo === "perturbar",
          )
          .map((r) => r.columna),
      ),
    ),
    muestras,
    generalizacion:
      optimaAplicada && politica.generalizacion
        ? generalizacionAplicada(optimaAplicada, politica.generalizacion)
        : null,
    privacidad: informeDePrivacidad(resultado.ruido),
  };
}
