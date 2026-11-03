// ALTO VOLUMEN (S8): un CSV más grande de lo que cabe en la pestaña, leído por pasadas.
//
// En memoria, Velo guarda la tabla entera: un código por celda más el diccionario de cada columna.
// Con millones de filas y columnas casi únicas (cédulas, correos, nombres), eso no cabe. Aquí no se
// guarda la tabla: se vuelve a leer el archivo, por trozos, cada vez que hace falta, y de cada
// pasada se queda solo lo que la siguiente necesita.
//
// **El principio: el mismo motor; lo que cambia es de dónde salen los conteos.** Cada técnica corre
// con la MISMA función que en memoria, sobre lo mismo que vería en memoria:
//
//   · una técnica por valor (enmascarar, generalizar, seudonimizar), sobre el diccionario de la
//     columna en orden de primera aparición, que es el que tendría la tabla —o sobre un solo valor
//     cuando el diccionario no cabe, porque cada valor de salida depende solo del suyo—;
//   · el ruido, celda por celda, con el índice ABSOLUTO de la fila y la huella del archivo;
//   · Mondrian y la óptima, sobre una tabla REAL que solo trae las columnas del reparto (y las de la
//     ℓ): `aplicarPolitica` sin cambios. Mondrian no se reescribió con pesos: su mediana es
//     posicional, y reescribirlo arriesgaba los bytes (ADR-015).
//
// Así «por trozos = en memoria» se cumple por construcción, y el gate lo comprueba byte a byte.
//
// Las pasadas, y lo que cada una deja:
//
//   A · diagnóstico: los diccionarios (con tope), la muestra de las primeras filas para clasificar y
//       la proyección de los cuasi-identificadores, de la que sale el riesgo EXACTO.
//   B · el reparto (solo si la política lo pide): la tabla de sus columnas y su resultado.
//   M · medir: las columnas transformadas que el balance necesita, sin escribir nada.
//   C · escribir: fila a fila, al destino.
//
// Este módulo no conoce `self` ni manda mensajes: es lo que lo deja probarse en Node.

import { balanceDelTratamiento } from "@/engine/balance";
import {
  clasificar,
  type Diagnostico,
  posicionesDeMuestra,
} from "@/engine/clasificador";
import {
  ConstructorColumnar,
  type ColumnaColumnar,
  type TablaColumnar,
} from "@/engine/columnar";
import { filaDeCsv } from "@/engine/csv";
import { medirDiversidad } from "@/engine/diversidad";
import { FILAS_DE_MUESTRA } from "@/engine/muestra";
import {
  columnasDeMondrian,
  esDeRuido,
  esReversible,
  tecnicaDe,
  type Politica,
  type Tecnica,
} from "@/engine/politica";
import type { Boveda, EntradaDeBoveda } from "@/engine/boveda";
import {
  cerrarRestauracion,
  contarCelda,
  decidirRestauracion,
  type DecisionDeColumna,
  type Restauracion,
} from "@/engine/restaurar";
import {
  aconsejarQis,
  clasesDeEquivalencia,
  riesgoProsecutor,
  type AdvisorDeQis,
  type ClasesDeEquivalencia,
  type RiesgoExacto,
} from "@/engine/riesgo";
import {
  informeDelRuido,
  prepararRuido,
  ruidoDeCelda,
  type InformeDeRuido,
  type RuidoDeColumna,
} from "@/engine/ruido";
import {
  aplicarPolitica,
  transformarDiccionario,
  type ColisionEnColumna,
  type TablaTransformada,
} from "@/engine/tecnicas";
import { mensaje } from "@/lib/idioma";
import type { Idioma } from "@/lib/idioma";

import { lotesDeCsv } from "./csv";

// ── Los topes ───────────────────────────────────────────────────────────────────────────────────

/**
 * Celdas (filas × columnas) por encima de las cuales un CSV se lee en alto volumen. Es una
 * constante de BUILD, no una medida del equipo ni del reloj: el mismo archivo entra por el mismo
 * camino en cualquier máquina. Las pruebas la pasan baja para forzar el camino. El mismo número que
 * el tope de celdas del JSON (ADR-011), medido para que la tabla en memoria quede cerca de 1,3 GB.
 */
export const TOPE_DE_CELDAS_EN_MEMORIA = 20_000_000;

/**
 * Todos por debajo de 2²⁴ (16 777 216): es el máximo de entradas de un `Map` de V8, y por encima
 * lanza `RangeError` en vez de crecer. Medidos con el CSV de 5 M de filas (ADR-015).
 */
export interface TopesDelAltoVolumen {
  /** Valores distintos que se guardan de UNA columna; con más, la columna se trata por valor. */
  readonly distintosPorColumna: number;
  /** Valores distintos guardados entre TODAS las columnas: lo que pesan los diccionarios juntos. */
  readonly distintosEnTotal: number;
  /** Filas de la tabla del reparto (Mondrian, la óptima, la ℓ). */
  readonly filasDelReparto: number;
  /** Filas con que se clasifica (la orden: «sobre las primeras filas, en orden fijo»). */
  readonly filasParaClasificar: number;
  /**
   * Combinaciones distintas de cuasi-identificadores que el riesgo exacto puede contar. Por encima,
   * Velo dice cuántas hay y NO estima: un riesgo «aproximado» presentado como exacto es justo lo que
   * la regla dura 4 prohíbe.
   */
  readonly combinacionesDelRiesgo: number;
  /** El trozo de bytes del lector. Solo las pruebas lo cambian. */
  readonly trozo?: number;
}

export const TOPES_DEL_ALTO_VOLUMEN: TopesDelAltoVolumen = {
  distintosPorColumna: 1 << 21,
  distintosEnTotal: 1 << 23,
  filasDelReparto: 16_000_000,
  filasParaClasificar: 5_000,
  combinacionesDelRiesgo: (1 << 24) - 1,
};

/** Algo que el alto volumen no puede hacer con este archivo, dicho con su clave y su conteo. */
export class NoCabeEnAltoVolumen extends Error {
  constructor(
    readonly motivo:
      | "alto-volumen-boveda-no-cabe"
      | "alto-volumen-reparto-no-cabe"
      | "alto-volumen-histograma-no-cabe"
      | "alto-volumen-devuelto-no-cabe",
    readonly cuantos: number,
  ) {
    super(motivo);
    this.name = "NoCabeEnAltoVolumen";
  }
}

// ── Pasada A · el diagnóstico ───────────────────────────────────────────────────────────────────

/** El diccionario de una columna, como lo tendría la tabla: el vacío y los distintos en orden. */
export interface DiccionarioDeColumna {
  readonly nombre: string;
  valores: string[];
  indice: Map<string, number>;
  /** ¿Están TODOS los valores distintos? Si no, la columna se trata por valor y se dice. */
  completo: boolean;
  /** Distintos vistos hasta que se pasó del tope (o todos, si está completo). */
  distintos: number;
  noVacios: number;
}

export interface PasadaDeDiagnostico {
  /** Los nombres de las columnas, como los pondría la tabla (`columna_N` si venía vacío). */
  readonly nombres: readonly string[];
  readonly encabezado: readonly string[];
  readonly filas: number;
  readonly diccionarios: readonly DiccionarioDeColumna[];
  readonly diagnostico: Diagnostico;
  /** Los cuasi-identificadores, TODAS las filas, con su diccionario: el riesgo exacto sale de aquí. */
  readonly proyeccion: TablaColumnar;
  readonly riesgo: RiesgoExacto;
  readonly advisor: AdvisorDeQis;
}

/** Los nombres que pondría `ConstructorColumnar`: el mismo encabezado, sin ninguno vacío. */
function nombresDe(encabezado: readonly string[]): string[] {
  return encabezado.map((nombre, i) => nombre || `columna_${i + 1}`);
}

/** La fila con el ancho del encabezado: las cortas se completan, las largas se truncan. */
function normalizar(fila: readonly string[], ancho: number): string[] {
  const salida = new Array<string>(ancho);
  for (let i = 0; i < ancho; i++) salida[i] = fila[i] ?? "";
  return salida;
}

export interface OpcionesDeLaPasada {
  readonly topes?: TopesDelAltoVolumen;
  readonly huella?: string;
  readonly alAvanzar?: (filas: number, bytes: number, total: number) => void;
}

/** Las filas del archivo, ya normalizadas, en lotes; la primera llamada trae el encabezado. */
async function* filasDelArchivo(
  archivo: Blob,
  opciones: OpcionesDeLaPasada,
): AsyncGenerator<
  | { readonly encabezado: readonly string[] }
  | { readonly filas: readonly string[][]; readonly desde: number }
> {
  let ancho = -1;
  let contadas = 0;
  let bytes = 0;
  for await (const lote of lotesDeCsv(archivo, {
    trozo: opciones.topes?.trozo,
    huellaEsperada: opciones.huella,
    alAvanzar: (b) => (bytes = b),
  })) {
    let inicio = 0;
    if (ancho < 0) {
      const encabezado = lote[0] ?? [];
      ancho = encabezado.length;
      yield { encabezado };
      inicio = 1;
    }
    const filas = lote.slice(inicio).map((f) => normalizar(f, ancho));
    yield { filas, desde: contadas };
    contadas += filas.length;
    opciones.alAvanzar?.(contadas, bytes, archivo.size);
  }
}

/**
 * La pasada A. Clasifica sobre las primeras `filasParaClasificar` filas (en memoria es una muestra
 * a saltos sobre el archivo entero: el diagnóstico puede diferir, y la pantalla lo dice), cuenta
 * exacto el resto y arma la proyección de los cuasi-identificadores para el riesgo exacto.
 */
export async function pasadaDeDiagnostico(
  archivo: Blob,
  opciones: OpcionesDeLaPasada = {},
): Promise<PasadaDeDiagnostico> {
  const topes = opciones.topes ?? TOPES_DEL_ALTO_VOLUMEN;
  let encabezado: readonly string[] = [];
  let nombres: string[] = [];
  let diccionarios: DiccionarioDeColumna[] = [];
  let enTotal = 0;
  let filas = 0;
  let muestra: ConstructorColumnar | null = null;
  let filasDeMuestra: string[][] = [];
  let diagnostico: Diagnostico | null = null;
  let proyeccion: ConstructorColumnar | null = null;
  let indicesQi: number[] = [];

  const empezarProyeccion = (tablaDeMuestra: TablaColumnar) => {
    diagnostico = clasificar(tablaDeMuestra);
    const qis = new Set(
      diagnostico.columnas
        .filter((c) => c.categoria === "cuasi-identificador")
        .map((c) => c.nombre),
    );
    indicesQi = nombres
      .map((n, i) => (qis.has(n) ? i : -1))
      .filter((i) => i >= 0);
    proyeccion = new ConstructorColumnar(
      indicesQi.map((i) => nombres[i]),
      1 << 16,
    );
    for (const fila of filasDeMuestra)
      proyeccion.agregarFila(indicesQi.map((i) => fila[i]));
    filasDeMuestra = [];
  };

  for await (const parte of filasDelArchivo(archivo, opciones)) {
    if ("encabezado" in parte) {
      encabezado = parte.encabezado;
      nombres = nombresDe(encabezado);
      diccionarios = nombres.map((nombre) => ({
        nombre,
        valores: [""],
        indice: new Map([["", 0]]),
        completo: true,
        distintos: 0,
        noVacios: 0,
      }));
      muestra = new ConstructorColumnar(encabezado, topes.filasParaClasificar);
      continue;
    }
    for (const fila of parte.filas) {
      for (let c = 0; c < fila.length; c++) {
        const valor = fila[c];
        const d = diccionarios[c];
        if (valor !== "") d.noVacios++;
        if (!d.completo || d.indice.has(valor)) continue;
        if (
          d.distintos + 1 > topes.distintosPorColumna ||
          enTotal + 1 > topes.distintosEnTotal
        ) {
          // Se suelta lo guardado: una columna que no cabe se trata por valor, y su diccionario
          // a medias no le sirve a nadie (ni para la bóveda, que necesita todos).
          d.completo = false;
          enTotal -= d.distintos;
          d.valores = [];
          d.indice = new Map();
          d.distintos = topes.distintosPorColumna;
          continue;
        }
        d.indice.set(valor, d.valores.length);
        d.valores.push(valor);
        d.distintos++;
        enTotal++;
      }
      if (filas < topes.filasParaClasificar) {
        muestra!.agregarFila(fila);
        filasDeMuestra.push(fila);
      } else {
        if (diagnostico === null) empezarProyeccion(muestra!.finalizar());
        proyeccion!.agregarFila(indicesQi.map((i) => fila[i]));
      }
      filas++;
    }
  }
  if (muestra === null) throw new Error("archivo-vacio");
  if (diagnostico === null) empezarProyeccion(muestra.finalizar());

  const tablaQi = proyeccion!.finalizar();
  const dx = diagnostico! as Diagnostico;
  // El diagnóstico se hizo con la muestra; las cifras por columna son las del archivo ENTERO.
  const ajustado: Diagnostico = {
    ...dx,
    filas,
    columnas: dx.columnas.map((h, c) => ({
      ...h,
      filas,
      filasNoVacias: diccionarios[c].noVacios,
      cardinalidad: diccionarios[c].distintos,
      ...(diccionarios[c].completo ? {} : { cardinalidadAlMenos: true }),
    })),
  };

  // Más combinaciones distintas que las que cabe contar: se dice con el conteo, y no se estima.
  let clases: ClasesDeEquivalencia;
  try {
    clases = clasesDeEquivalencia(tablaQi.columnas, filas);
  } catch (error) {
    if (error instanceof RangeError)
      throw new NoCabeEnAltoVolumen("alto-volumen-histograma-no-cabe", 1 << 24);
    throw error;
  }
  if (clases.tamanos.length > topes.combinacionesDelRiesgo)
    throw new NoCabeEnAltoVolumen(
      "alto-volumen-histograma-no-cabe",
      clases.tamanos.length,
    );
  const riesgo: RiesgoExacto = riesgoProsecutor(
    clases,
    tablaQi.columnas.map((c) => c.nombre),
    filas,
  );

  return {
    nombres,
    encabezado,
    filas,
    diccionarios,
    diagnostico: ajustado,
    proyeccion: tablaQi,
    riesgo,
    advisor: consejeroDeAltoVolumen(tablaQi, ajustado),
  };
}

/**
 * El consejero de combinaciones, sobre los cuasi-identificadores: en memoria mira también las
 * columnas no personales, que aquí no se guardan enteras. Las que habría mirado salen en
 * `excluidas` con su motivo, en vez de desaparecer.
 */
function consejeroDeAltoVolumen(
  proyeccion: TablaColumnar,
  diagnostico: Diagnostico,
): AdvisorDeQis {
  const advisor = aconsejarQis(proyeccion, diagnostico);
  const enLaProyeccion = new Set(proyeccion.columnas.map((c) => c.nombre));
  const fuera = diagnostico.columnas
    .filter(
      (h) =>
        !enLaProyeccion.has(h.nombre) &&
        h.categoria !== "identificador-directo" &&
        h.categoria !== "dato-sensible",
    )
    .map((h) => ({
      nombre: h.nombre,
      motivo: mensaje("riesgo.excluida.altoVolumen"),
    }));
  return { ...advisor, excluidas: [...advisor.excluidas, ...fuera] };
}

// ── El plan: qué le pasa a cada columna ────────────────────────────────────────────────────────

type PlanDeColumna =
  | { readonly tipo: "suprimida" }
  | { readonly tipo: "igual" }
  /** La columna ya transformada en la pasada B (reparto o ℓ): se lee por fila. */
  | { readonly tipo: "tabla"; readonly columna: ColumnaColumnar }
  | {
      readonly tipo: "diccionario";
      readonly indice: ReadonlyMap<string, number>;
      readonly nuevos: readonly string[];
    }
  | { readonly tipo: "por-valor"; readonly tecnica: Tecnica }
  | {
      readonly tipo: "ruido";
      readonly tecnica: Tecnica;
      readonly dominio: readonly string[];
      readonly distintos: number;
    };

export interface PlanDeTransformacion {
  readonly nombres: readonly string[];
  readonly planes: readonly PlanDeColumna[];
  readonly suprimidas: readonly string[];
  readonly colisiones: readonly ColisionEnColumna[];
  /** Columnas cuyo seudónimo se calculó por valor: sus colisiones no se pudieron contar. */
  readonly colisionesSinMedir: readonly string[];
  readonly correspondencias: readonly EntradaDeBoveda[];
  readonly reparto: TablaTransformada | null;
  readonly pendientesDeMondrian: readonly string[];
  readonly llave: CryptoKey | null;
  readonly huella: string;
}

/**
 * ¿Hay reparto, y con qué columnas del archivo? La MISMA regla que `aplicarPolitica`: las marcadas
 * para el reparto que no se suprimen, y un k. La tabla de la pasada B lleva esas y las sensibles de
 * la ℓ (también las suprimidas: así la óptima dice cuáles descartó, como en memoria).
 */
function elReparto(politica: Politica, nombres: readonly string[]) {
  const suprimidas = new Set(
    nombres.filter((n) => tecnicaDe(politica, n).tipo === "suprimir"),
  );
  const paraMondrian = columnasDeMondrian(politica).filter(
    (n) => !suprimidas.has(n),
  );
  const conReparto = paraMondrian.length > 0 && politica.kObjetivo !== null;
  const pedidas = new Set([
    ...columnasDeMondrian(politica),
    ...(politica.generalizacion?.diversidad?.columnas ?? []),
  ]);
  return {
    conReparto,
    paraMondrian,
    columnas: conReparto ? nombres.filter((n) => pedidas.has(n)) : [],
  };
}

/**
 * Prepara la transformación: aplica cada técnica por valor a su diccionario (como en memoria) y,
 * si la política tiene reparto, hace la pasada B y corre `aplicarPolitica` sobre la tabla de sus
 * columnas.
 */
export async function prepararTransformacion(
  archivo: Blob,
  pasada: PasadaDeDiagnostico,
  politica: Politica,
  llave: CryptoKey | null,
  idioma: Idioma,
  huella: string,
  opciones: OpcionesDeLaPasada = {},
): Promise<PlanDeTransformacion> {
  const topes = opciones.topes ?? TOPES_DEL_ALTO_VOLUMEN;
  const { nombres, diccionarios } = pasada;

  // La pasada B: una tabla de verdad, con solo las columnas del reparto.
  const {
    conReparto,
    paraMondrian,
    columnas: delReparto,
  } = elReparto(politica, nombres);
  let reparto: TablaTransformada | null = null;
  if (conReparto) {
    if (pasada.filas > topes.filasDelReparto)
      throw new NoCabeEnAltoVolumen(
        "alto-volumen-reparto-no-cabe",
        topes.filasDelReparto,
      );
    const indices = delReparto.map((n) => nombres.indexOf(n));
    let constructor: ConstructorColumnar | null = null;
    for await (const parte of filasDelArchivo(archivo, {
      ...opciones,
      huella,
    })) {
      if ("encabezado" in parte) {
        constructor = new ConstructorColumnar(
          indices.map((i) => parte.encabezado[i]),
          1 << 16,
        );
        continue;
      }
      for (const fila of parte.filas)
        constructor!.agregarFila(indices.map((i) => fila[i]));
    }
    reparto = await aplicarPolitica(
      constructor!.finalizar(),
      politica,
      llave,
      idioma,
      huella,
    );
  }

  const enElReparto = new Map(
    (reparto?.tabla.columnas ?? []).map((c) => [c.nombre, c]),
  );
  const planes: PlanDeColumna[] = [];
  const suprimidas: string[] = [];
  const colisiones: ColisionEnColumna[] = [];
  const colisionesSinMedir: string[] = [];
  const correspondencias: EntradaDeBoveda[] = [];
  const delRepartoTransformadas = new Map(
    (reparto?.correspondencias ?? []).map((e) => [e.columna, e]),
  );
  const colisionesDelReparto = new Map(
    (reparto?.colisiones ?? []).map((c) => [c.columna, c]),
  );

  for (let c = 0; c < nombres.length; c++) {
    const nombre = nombres[c];
    const tecnica = tecnicaDe(politica, nombre);
    if (tecnica.tipo === "suprimir") {
      suprimidas.push(nombre);
      planes.push({ tipo: "suprimida" });
      continue;
    }
    if (reparto !== null && delReparto.includes(nombre)) {
      planes.push({ tipo: "tabla", columna: enElReparto.get(nombre)! });
      const colision = colisionesDelReparto.get(nombre);
      if (colision) colisiones.push(colision);
      const entrada = delRepartoTransformadas.get(nombre);
      if (entrada) correspondencias.push(entrada);
      continue;
    }
    if (
      tecnica.tipo === "conservar" ||
      tecnica.tipo === "generalizar-automatico"
    ) {
      planes.push({ tipo: "igual" });
      continue;
    }
    const d = diccionarios[c];
    if (esDeRuido(tecnica)) {
      // El dominio de la respuesta aleatorizada son los valores distintos: si la columna no cupo
      // entera, tiene más que el tope, que ya es más que los 64 que admite: no se aplica.
      planes.push({
        tipo: "ruido",
        tecnica,
        dominio: d.completo ? d.valores.slice(1) : [],
        distintos: d.distintos,
      });
      continue;
    }
    if (!d.completo) {
      if (esReversible(tecnica))
        throw new NoCabeEnAltoVolumen(
          "alto-volumen-boveda-no-cabe",
          topes.distintosPorColumna,
        );
      planes.push({ tipo: "por-valor", tecnica });
      if (
        tecnica.tipo === "seudonimizar" ||
        tecnica.tipo === "seudonimizar-con-formato"
      )
        colisionesSinMedir.push(nombre);
      continue;
    }
    const resultado = await transformarDiccionario(
      nombre,
      d.valores,
      tecnica,
      llave,
    );
    if (resultado.colisiones > 0)
      colisiones.push({ columna: nombre, cuantas: resultado.colisiones });
    if (resultado.correspondencia)
      correspondencias.push(resultado.correspondencia);
    planes.push(
      resultado.valores === null
        ? { tipo: "igual" }
        : { tipo: "diccionario", indice: d.indice, nuevos: resultado.valores },
    );
  }

  return {
    nombres,
    planes,
    suprimidas,
    colisiones,
    colisionesSinMedir,
    correspondencias,
    reparto,
    // Como en memoria: sin reparto (sin k), las marcadas quedan pendientes y el balance lo dice.
    pendientesDeMondrian: conReparto ? [] : paraMondrian,
    llave,
    huella,
  };
}

// ── Una fila transformada ─────────────────────────────────────────────────────────────────────

/** El contexto del ruido de cada columna, fresco por pasada: sus contadores son de esa pasada. */
function contextosDeRuido(
  plan: PlanDeTransformacion,
): (RuidoDeColumna | null)[] {
  return plan.planes.map((p, c) =>
    p.tipo === "ruido"
      ? prepararRuido(
          plan.nombres[c],
          p.dominio,
          p.tecnica as Parameters<typeof prepararRuido>[2],
          plan.huella,
          p.distintos,
          p.dominio.length === 0 && p.distintos > 0,
        )
      : null,
  );
}

/**
 * Transforma un lote de filas; `desde` es el índice ABSOLUTO de la primera (el del archivo entero:
 * el ruido y el reparto lo necesitan). Las HMAC del lote corren juntas y vuelven en su sitio.
 */
async function transformarLote(
  plan: PlanDeTransformacion,
  ruidos: readonly (RuidoDeColumna | null)[],
  filas: readonly string[][],
  desde: number,
): Promise<string[][]> {
  const salida = filas.map(() => new Array<string>(plan.planes.length));
  const pendientes: Promise<void>[] = [];
  for (let c = 0; c < plan.planes.length; c++) {
    const p = plan.planes[c];
    for (let i = 0; i < filas.length; i++) {
      const valor = filas[i][c];
      switch (p.tipo) {
        case "suprimida":
          break;
        case "igual":
          salida[i][c] = valor;
          break;
        case "tabla":
          salida[i][c] = p.columna.valores[p.columna.codigos[desde + i]];
          break;
        case "diccionario":
          salida[i][c] = p.nuevos[p.indice.get(valor)!];
          break;
        case "por-valor":
          if (valor === "") salida[i][c] = "";
          else
            pendientes.push(
              transformarDiccionario(
                plan.nombres[c],
                ["", valor],
                p.tecnica,
                plan.llave,
              ).then((r) => {
                salida[i][c] = r.valores === null ? valor : r.valores[1];
              }),
            );
          break;
        case "ruido": {
          const ruido = ruidos[c]!;
          if (valor === "" || !ruido.aplicable) salida[i][c] = valor;
          else
            pendientes.push(
              ruidoDeCelda(ruido, plan.llave!, valor, desde + i).then((y) => {
                salida[i][c] = y;
              }),
            );
          break;
        }
      }
    }
  }
  await Promise.all(pendientes);
  return salida;
}

// ── Pasada M · medir ──────────────────────────────────────────────────────────────────────────

export interface MedidaDelAltoVolumen {
  readonly transformadaQi: TablaColumnar;
  readonly ruido: readonly InformeDeRuido[];
  readonly cambio: readonly boolean[];
  /** Las filas de la vista previa (a saltos sobre N), antes y después, por columna. */
  readonly muestras: readonly { antes: string[]; despues: string[] }[];
  readonly clasesDespues: ClasesDeEquivalencia;
  readonly qisDespues: readonly string[];
}

/**
 * La pasada M: recorre las filas transformadas sin escribirlas. Deja las columnas que el balance
 * mide (los cuasi-identificadores y las sensibles, ya transformados), si cada columna cambió en
 * ALGUNA celda (sobre el archivo entero, como `columnaCambio`), las filas de la vista previa y los
 * contadores del ruido.
 */
export async function pasadaDeMedida(
  archivo: Blob,
  pasada: PasadaDeDiagnostico,
  plan: PlanDeTransformacion,
  opciones: OpcionesDeLaPasada = {},
): Promise<MedidaDelAltoVolumen> {
  const qis = pasada.diagnostico.columnas
    .filter((c) => c.categoria === "cuasi-identificador")
    .map((c) => c.nombre);
  const sensibles = pasada.diagnostico.columnas
    .filter((c) => c.categoria === "dato-sensible")
    .map((c) => c.nombre);
  const medidas = plan.nombres
    .map((n, i) => ({ n, i }))
    .filter(
      ({ n, i }) =>
        plan.planes[i].tipo !== "suprimida" &&
        (qis.includes(n) || sensibles.includes(n)),
    );
  const constructor = new ConstructorColumnar(
    medidas.map(({ n }) => n),
    1 << 16,
  );
  const ruidos = contextosDeRuido(plan);
  const cambio = plan.planes.map(() => false);
  const posiciones = posicionesDeMuestra(pasada.filas, FILAS_DE_MUESTRA);
  const enMuestra = new Map(posiciones.map((p, k) => [p, k]));
  const muestras = plan.nombres.map(() => ({
    antes: new Array<string>(posiciones.length).fill(""),
    despues: new Array<string>(posiciones.length).fill(""),
  }));

  for await (const parte of filasDelArchivo(archivo, {
    ...opciones,
    huella: plan.huella,
  })) {
    if ("encabezado" in parte) continue;
    const salida = await transformarLote(
      plan,
      ruidos,
      parte.filas,
      parte.desde,
    );
    for (let i = 0; i < parte.filas.length; i++) {
      const original = parte.filas[i];
      const nueva = salida[i];
      constructor.agregarFila(medidas.map(({ i: c }) => nueva[c]));
      for (let c = 0; c < nueva.length; c++)
        if (!cambio[c] && plan.planes[c].tipo !== "suprimida")
          cambio[c] = nueva[c] !== original[c];
      const k = enMuestra.get(parte.desde + i);
      if (k !== undefined)
        for (let c = 0; c < nueva.length; c++) {
          muestras[c].antes[k] = original[c];
          muestras[c].despues[k] = nueva[c] ?? "";
        }
    }
  }

  const transformadaQi = constructor.finalizar();
  const qisDespues = qis.filter((n) => !plan.suprimidas.includes(n));
  const porNombre = new Map(transformadaQi.columnas.map((c) => [c.nombre, c]));
  const ruido: InformeDeRuido[] = [];
  plan.planes.forEach((p, c) => {
    if (p.tipo === "ruido") ruido.push(informeDelRuido(ruidos[c]!));
    else if (p.tipo === "tabla") {
      const delReparto = plan.reparto?.ruido.find(
        (r) => r.columna === plan.nombres[c],
      );
      if (delReparto) ruido.push(delReparto);
    }
  });
  return {
    transformadaQi,
    ruido,
    cambio,
    muestras,
    clasesDespues: clasesDeEquivalencia(
      qisDespues.map((n) => porNombre.get(n)!).filter((c) => c !== undefined),
      pasada.filas,
    ),
    qisDespues,
  };
}

/** El balance del alto volumen: el MISMO `balanceDelTratamiento`, sobre lo que mide (los QI). */
export function balanceDelAltoVolumen(
  pasada: PasadaDeDiagnostico,
  plan: PlanDeTransformacion,
  medida: MedidaDelAltoVolumen,
  politica: Politica,
  extra: Pick<
    Parameters<typeof balanceDelTratamiento>[0],
    "mondrian" | "ruidoNoAplicado" | "reticulaExcedida"
  >,
) {
  const sensibles = pasada.diagnostico.columnas
    .filter((c) => c.categoria === "dato-sensible")
    .map((c) => c.nombre)
    .filter((n) => !plan.suprimidas.includes(n));
  return balanceDelTratamiento({
    tablaOriginal: pasada.proyeccion,
    tablaTransformada: medida.transformadaQi,
    diagnostico: pasada.diagnostico,
    politica,
    suprimidas: plan.suprimidas,
    colisiones: plan.colisiones,
    diversidad: medirDiversidad(
      medida.transformadaQi,
      medida.qisDespues,
      sensibles,
    ),
    pendientesDeMondrian: plan.pendientesDeMondrian,
    ...extra,
  });
}

// ── Pasada C · escribir ───────────────────────────────────────────────────────────────────────

/** Adonde va el archivo: un `Blob` hecho de partes, o el archivo que el usuario eligió. */
export interface Destino {
  escribir(texto: string): Promise<void>;
}

/** Cuántas filas se juntan antes de entregar un trozo al destino. Las mismas que en memoria. */
const FILAS_POR_TROZO = 20_000;

/** La pasada C: el CSV de salida, fila a fila, con la misma regla de `filasDeCsv`. */
export async function escribirCsv(
  archivo: Blob,
  plan: PlanDeTransformacion,
  destino: Destino,
  opciones: OpcionesDeLaPasada = {},
): Promise<void> {
  const vivas = plan.planes
    .map((p, c) => (p.tipo === "suprimida" ? -1 : c))
    .filter((c) => c >= 0);
  const ruidos = contextosDeRuido(plan);
  await destino.escribir(filaDeCsv(vivas.map((c) => plan.nombres[c])));
  let acumulado = "";
  let enElTrozo = 0;
  for await (const parte of filasDelArchivo(archivo, {
    ...opciones,
    huella: plan.huella,
  })) {
    if ("encabezado" in parte) continue;
    const salida = await transformarLote(
      plan,
      ruidos,
      parte.filas,
      parte.desde,
    );
    for (const fila of salida) {
      acumulado += filaDeCsv(vivas.map((c) => fila[c]));
      if (++enElTrozo === FILAS_POR_TROZO) {
        await destino.escribir(acumulado);
        acumulado = "";
        enElTrozo = 0;
      }
    }
  }
  if (acumulado) await destino.escribir(acumulado);
}

// ── El regreso por trozos ─────────────────────────────────────────────────────────────────────

export interface PasadaDelDevuelto {
  readonly nombres: readonly string[];
  readonly filas: number;
  readonly diccionarios: readonly DiccionarioDeColumna[];
}

/** R1: los diccionarios de las columnas devueltas. Sin todos sus valores, no se puede decidir. */
export async function pasadaDelDevuelto(
  archivo: Blob,
  opciones: OpcionesDeLaPasada = {},
): Promise<PasadaDelDevuelto> {
  const topes = opciones.topes ?? TOPES_DEL_ALTO_VOLUMEN;
  let nombres: string[] = [];
  let diccionarios: DiccionarioDeColumna[] = [];
  let enTotal = 0;
  let filas = 0;
  for await (const parte of filasDelArchivo(archivo, opciones)) {
    if ("encabezado" in parte) {
      nombres = nombresDe(parte.encabezado);
      diccionarios = nombres.map((nombre) => ({
        nombre,
        valores: [""],
        indice: new Map([["", 0]]),
        completo: true,
        distintos: 0,
        noVacios: 0,
      }));
      continue;
    }
    for (const fila of parte.filas) {
      for (let c = 0; c < fila.length; c++) {
        const d = diccionarios[c];
        const valor = fila[c];
        if (valor !== "") d.noVacios++;
        if (d.indice.has(valor)) continue;
        if (
          d.distintos + 1 > topes.distintosPorColumna ||
          enTotal + 1 > topes.distintosEnTotal
        )
          throw new NoCabeEnAltoVolumen(
            "alto-volumen-devuelto-no-cabe",
            topes.distintosPorColumna,
          );
        d.indice.set(valor, d.valores.length);
        d.valores.push(valor);
        d.distintos++;
        enTotal++;
      }
      filas++;
    }
  }
  return { nombres, filas, diccionarios };
}

/**
 * R2: restaura fila a fila y escribe. Las decisiones salen del diccionario de cada columna con la
 * MISMA función que en memoria; las celdas se cuentan mientras se escriben.
 */
export async function restaurarPorTrozos(
  archivo: Blob,
  devuelto: PasadaDelDevuelto,
  boveda: Boveda,
  huella: string,
  destino: Destino,
  opciones: OpcionesDeLaPasada = {},
): Promise<Omit<Restauracion, "tabla"> & { readonly filas: number }> {
  const decisiones: DecisionDeColumna[] = decidirRestauracion(
    devuelto.diccionarios.map((d) => ({
      nombre: d.nombre,
      valores: d.valores,
    })),
    boveda,
  );
  const celdas = decisiones.map(() => ({
    restauradas: 0,
    ambiguas: 0,
    desconocidas: 0,
  }));
  await destino.escribir(filaDeCsv(devuelto.nombres));
  let acumulado = "";
  let enElTrozo = 0;
  for await (const parte of filasDelArchivo(archivo, { ...opciones, huella })) {
    if ("encabezado" in parte) continue;
    for (const fila of parte.filas) {
      const campos = fila.map((valor, c) => {
        const decision = decisiones[c];
        if (decision.nuevos === null) return valor;
        const codigo = devuelto.diccionarios[c].indice.get(valor)!;
        contarCelda(celdas[c], decision.categoriaPorValor!, codigo);
        return decision.nuevos[codigo];
      });
      acumulado += filaDeCsv(campos);
      if (++enElTrozo === FILAS_POR_TROZO) {
        await destino.escribir(acumulado);
        acumulado = "";
        enElTrozo = 0;
      }
    }
  }
  if (acumulado) await destino.escribir(acumulado);
  return {
    ...cerrarRestauracion(decisiones, celdas, boveda),
    filas: devuelto.filas,
  };
}
