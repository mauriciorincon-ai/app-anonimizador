// Contrato de la frontera: lo ÚNICO que puede cruzar del worker a la interfaz.
//
// Vive en su propio archivo, y no dentro del worker, por una razón práctica: la UI necesita estos
// tipos, y si los importara del worker arrastraría PapaParse y el motor al bundle de la página.
// Los tipos se borran al compilar; el código no.
//
// Léase como una lista de lo permitido, no como una definición de tipos: aquí viajan conteos,
// nombres de columna, proporciones y muestras YA enmascaradas. No viaja ni una celda del archivo.

import type { Diagnostico } from "@/engine/clasificador";
import type { AdvisorDeQis, RiesgoExacto } from "@/engine/riesgo";

export type FormatoDeArchivo = "csv" | "excel";

export type MensajeAlWorker = { tipo: "analizar"; archivo: File };

/** Etapas del trabajo, en el orden en que ocurren. La UI las nombra tal cual. */
export type EtapaDelWorker =
  "huella" | "leyendo" | "clasificando" | "midiendo-riesgo";

export type MotivoDeError =
  | "formato-no-soportado"
  | "archivo-vacio"
  | "excel-excede-tope"
  | "excel-excede-memoria"
  | "lectura-fallida";

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

export type MensajeDelWorker =
  | {
      tipo: "progreso";
      etapa: EtapaDelWorker;
      filas: number;
      bytesLeidos: number;
      bytesTotales: number;
    }
  | { tipo: "listo"; informe: Informe }
  | { tipo: "error"; motivo: MotivoDeError };
