// Contrato de la frontera: lo ÚNICO que puede cruzar del worker a la interfaz.
//
// Vive en su propio archivo, y no dentro del worker, por una razón práctica: la UI necesita estos
// tipos, y si los importara del worker arrastraría PapaParse y el motor al bundle de la página.
// Los tipos se borran al compilar; el código no.
//
// Léase como una lista de lo permitido, no como una definición de tipos: aquí viajan conteos,
// nombres de columna, proporciones y muestras YA enmascaradas. No viaja ni una celda del archivo.

import type { BalanceDelTratamiento } from "@/engine/balance";
import type { Diagnostico } from "@/engine/clasificador";
import type { MedidaDeDiversidad } from "@/engine/diversidad";
import type { ResultadoDeMondrian } from "@/engine/mondrian";
import type { Politica } from "@/engine/politica";
import type {
  CeldasDeColumna,
  ColumnaRestaurada,
  ReconocimientoDeBoveda,
  SalvedadDelRegreso,
} from "@/engine/restaurar";
import type { AdvisorDeQis, RiesgoExacto } from "@/engine/riesgo";
import type { ColisionEnColumna } from "@/engine/tecnicas";
import type { Utilidad } from "@/engine/utilidad";

export type FormatoDeArchivo = "csv" | "excel";

export type MensajeAlWorker =
  | { tipo: "analizar"; archivo: File }
  /**
   * La frase de paso entra al worker y NO vuelve a salir. La llave se deriva aquí y se queda aquí:
   * la página recibe únicamente la huella de 12 hex, que es el HMAC de una constante y no sirve
   * para invertir nada. Así ningún componente, ningún estado de React y ningún reporte de error
   * puede tener una `CryptoKey` en la mano.
   */
  | { tipo: "derivar-llave"; frase: string; sal: string }
  | { tipo: "transformar"; politica: Politica }
  | { tipo: "construir-archivo" }
  /**
   * Sella la bóveda del tratamiento que se acaba de hacer. La frase de paso entra y **no vuelve a
   * salir**, igual que la de la llave: se deriva aquí, se usa aquí y muere con el worker.
   */
  | { tipo: "sellar-boveda"; frase: string }
  /**
   * Abre un `.velo`. El `File` viaja **entero al worker** y ningún componente lo toca: una bóveda
   * contiene los valores ORIGINALES del usuario, que es exactamente el contenido que no puede
   * pasar por la página. La defensa es estructural — el gate de privacidad veta `.arrayBuffer()`
   * fuera de `src/workers/`, así que solo aquí se pueden sacar sus bytes.
   */
  | { tipo: "abrir-boveda"; archivo: File; frase: string }
  /** El archivo que devolvió el tercero. Se parsea, **no se diagnostica**: es otro flujo. */
  | { tipo: "analizar-devuelto"; archivo: File }
  | { tipo: "restaurar" }
  | { tipo: "construir-restaurado" }
  | { tipo: "construir-informe-del-regreso"; fecha: string };

/** Etapas del trabajo, en el orden en que ocurren. La UI las nombra tal cual. */
export type EtapaDelWorker =
  | "huella"
  | "leyendo"
  | "clasificando"
  | "midiendo-riesgo"
  | "derivando-llave"
  | "transformando"
  | "midiendo-el-despues"
  | "escribiendo"
  | "sellando-boveda"
  | "abriendo-boveda"
  | "restaurando";

/**
 * Lo que la página sabe de una bóveda abierta. **Ni un par de la correspondencia cruza** — eso son
 * los valores originales del usuario, el material más sensible que Velo llega a tener. Cruzan
 * conteos, nombres de columna y huellas.
 */
export interface ResumenDeBoveda {
  /** SHA-256 de la serialización en claro. La identidad que el usuario reconoce. */
  readonly huella: string;
  /** Huella de la llave HMAC con la que se hizo. Permite decir «esta bóveda es de otra llave». */
  readonly huellaDeLlave: string;
  readonly hashDePolitica: string;
  readonly columnas: readonly string[];
  readonly pares: number;
  /** Seudónimos con más de un original. La cifra que hay que decir ANTES de restaurar. */
  readonly colisiones: number;
}

/**
 * El resultado de la restauración **sin su tabla**.
 *
 * Se copian los campos UNO A UNO en vez de con un `Omit`, igual que con el reparto de Mondrian en
 * el S2: así la frontera es literal, y el día que `Restauracion` gane un campo nuevo no cruza
 * solo — hay que escribirlo aquí y mirarlo.
 */
export interface ResumenDelRegreso {
  readonly columnas: readonly ColumnaRestaurada[];
  readonly reconocimiento: ReconocimientoDeBoveda;
  // `sinAparecer` y `fueraDeAlcance` de `Restauracion` NO cruzan, y su ausencia es el hallazgo M1
  // de la auditoría de este sprint: cruzaban, y no los leía nadie. Lo que la pantalla y el informe
  // necesitan ya viaja mejor dicho — las columnas que faltan van en la salvedad
  // `columnas-sin-aparecer`, con su explicación, y las de fuera de alcance salen de `columnas`,
  // marcadas una a una. Un campo del contrato nace con su lector o no nace.
  readonly totales: CeldasDeColumna;
  readonly proporcionRestaurada: number | null;
  readonly salvedades: readonly SalvedadDelRegreso[];
  readonly esTitular: boolean;
  readonly filas: number;
}

/** Por qué no se pudo abrir un `.velo`. Cada uno necesita su propio mensaje en pantalla. */
export type MotivoDeBoveda =
  | "no-es-una-boveda"
  | "version-distinta"
  | "frase-incorrecta"
  | "costo-inaceptable"
  | "contenido-invalido"
  | "lectura-fallida";

/** Para qué es el archivo que el worker acaba de construir. El asa es la misma; el destino no. */
export type PropositoDelArchivo =
  "anonimizado" | "boveda" | "restaurado" | "informe-del-regreso";

export type MotivoDeError =
  | "formato-no-soportado"
  | "archivo-vacio"
  | "excel-excede-tope"
  | "excel-excede-memoria"
  | "lectura-fallida"
  | "sin-tabla"
  | "sin-llave"
  | "transformacion-fallida"
  | "sin-boveda"
  | "sin-devuelto"
  | "restauracion-fallida";

export interface Informe {
  archivo: {
    nombre: string;
    bytes: number;
    formato: FormatoDeArchivo;
    /**
     * SHA-256 del archivo tal como está en el disco del usuario, en hexadecimal minúscula.
     *
     * Es lo que ata el reporte a UN archivo concreto: quien lo reciba puede correr `sha256sum`
     * sobre el suyo y comprobar que el diagnóstico habla de ese y no de otro. Se calcula sobre
     * los bytes crudos, antes de parsear nada.
     */
    sha256: string;
  };
  diagnostico: Diagnostico;
  riesgo: RiesgoExacto;
  advisor: AdvisorDeQis;
  /** Lo que costó, medido. Se enseña porque un instrumento honesto muestra su propio trabajo. */
  medicion: {
    msLectura: number;
    msDiagnostico: number;
    /** Heap del worker en MB. Solo Chromium lo expone; en el resto, null. */
    heapMb: number | null;
  };
}

/**
 * El reparto de Mondrian **sin su tabla**.
 *
 * `ResultadoDeMondrian` lleva dentro la `TablaColumnar` generalizada — o sea, el archivo entero.
 * Reenviarlo tal cual por `postMessage` habría tirado la frontera por la ventana en el sprint que
 * la pone a prueba, y el defecto sería invisible: la pantalla se vería idéntica. El `Omit` es el
 * gate en forma de tipo, y `tests/unit/privacidad.test.ts` lo comprueba también sobre el objeto.
 */
export type ResumenDeMondrian = Omit<ResultadoDeMondrian, "tabla">;

/**
 * Una columna en la vista previa, con la regla de exposición que la gobierna.
 *
 * `antes` va SIEMPRE enmascarado: es el dato crudo del usuario y la regla del S1 no se relaja
 * porque ahora estemos transformando. `despues` va **completo solo si ese valor cambió** — un
 * seudónimo o un intervalo no son el dato de nadie, y enseñarlos a medias haría inútil la única
 * pantalla cuyo trabajo es responder «¿qué va a recibir el otro?». Si el valor no cambió, el de
 * después ES el de antes, y entonces se enmascara igual. **La regla es del valor, no de la
 * columna** (auditoría del S2, A3): una generalización deja filas intactas dentro de una columna
 * que sí cambió, y decidir por columna las imprimía en claro.
 */
export interface MuestraDeTransformacion {
  readonly nombre: string;
  readonly tecnica: string;
  /** Vacío cuando la columna es sensible y no cambió: ahí no hay nada que enseñar. */
  readonly filas: readonly { antes: string; despues: string }[];
  /**
   * La columna entera va enmascarada porque NINGÚN valor cambió. Se mide sobre el archivo
   * completo, no sobre las filas de la muestra: es lo que sostiene el «N de M columnas cambian»
   * de la vista previa, que se lee como una cifra exacta y ahora lo es.
   */
  readonly despuesEnmascarado: boolean;
  readonly omitida: boolean;
  readonly suprimida: boolean;
}

export interface ResultadoDeTransformacion {
  /** Identidad del tratamiento: mismo hash ⇒ mismo trato. */
  readonly hashDePolitica: string;
  readonly balance: BalanceDelTratamiento;
  readonly utilidad: Utilidad;
  readonly mondrian: ResumenDeMondrian | null;
  readonly diversidad: readonly MedidaDeDiversidad[];
  readonly suprimidas: readonly string[];
  readonly colisiones: readonly ColisionEnColumna[];
  readonly pendientesDeMondrian: readonly string[];
  readonly muestras: readonly MuestraDeTransformacion[];
  readonly ms: number;
}

export type MensajeDelWorker =
  | {
      tipo: "progreso";
      etapa: EtapaDelWorker;
      filas: number;
      bytesLeidos: number;
      bytesTotales: number;
    }
  | { tipo: "listo"; informe: Informe }
  | { tipo: "llave-lista"; huella: string }
  | { tipo: "transformado"; resultado: ResultadoDeTransformacion }
  /**
   * El archivo, como **asa opaca**. Un `Blob` no es el contenido: es una referencia que el
   * navegador resuelve al guardarlo. La página hace `createObjectURL` y jamás lo lee — ver
   * `decisions/005-la-frontera-y-la-descarga.md`, y el test que lo verifica.
   */
  | {
      tipo: "archivo";
      blob: Blob;
      nombre: string;
      bytes: number;
      proposito: PropositoDelArchivo;
    }
  | { tipo: "boveda-abierta"; resumen: ResumenDeBoveda }
  | { tipo: "boveda-rechazada"; motivo: MotivoDeBoveda; detalle: string }
  /** El archivo devuelto, ya parseado. Viajan metadatos y conteos; ninguna celda. */
  | {
      tipo: "devuelto-listo";
      nombre: string;
      bytes: number;
      filas: number;
      columnas: number;
      sha256: string;
    }
  | { tipo: "restaurado"; resumen: ResumenDelRegreso }
  | { tipo: "error"; motivo: MotivoDeError };
