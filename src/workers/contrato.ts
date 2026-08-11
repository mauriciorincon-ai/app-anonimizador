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
  | { tipo: "construir-archivo" };

/** Etapas del trabajo, en el orden en que ocurren. La UI las nombra tal cual. */
export type EtapaDelWorker =
  | "huella"
  | "leyendo"
  | "clasificando"
  | "midiendo-riesgo"
  | "derivando-llave"
  | "transformando"
  | "midiendo-el-despues"
  | "escribiendo";

export type MotivoDeError =
  | "formato-no-soportado"
  | "archivo-vacio"
  | "excel-excede-tope"
  | "excel-excede-memoria"
  | "lectura-fallida"
  | "sin-tabla"
  | "sin-llave"
  | "transformacion-fallida";

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
  | { tipo: "archivo"; blob: Blob; nombre: string; bytes: number }
  | { tipo: "error"; motivo: MotivoDeError };
