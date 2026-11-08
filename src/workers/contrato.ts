// Contrato de la frontera: lo ÚNICO que puede cruzar del worker a la interfaz.
//
// Vive en su propio archivo, y no dentro del worker, por una razón práctica: la UI necesita estos
// tipos, y si los importara del worker arrastraría PapaParse y el motor al bundle de la página.
// Los tipos se borran al compilar; el código no.
//
// Léase como una lista de lo permitido, no como una definición de tipos: aquí viajan conteos,
// nombres de columna, proporciones y muestras YA enmascaradas. No viaja ni una celda del archivo.

import type { BalanceDelTratamiento } from "@/engine/balance";
import type { EntradaDeBitacora } from "@/engine/bitacora";
import type { Diagnostico } from "@/engine/clasificador";
import type { GeneralizacionAplicada } from "@/engine/optima";
import type { InformeDePrivacidad } from "@/engine/ruido";
import type { JerarquiaDeLaPolitica, Politica } from "@/engine/politica";
import type {
  CeldasDeColumna,
  ColumnaRestaurada,
  ReconocimientoDeBoveda,
  SalvedadDelRegreso,
} from "@/engine/restaurar";
import type { EstructuraJson, MotivoJson } from "@/engine/json/tipos";
import type {
  Aviso,
  CampoDeMetadato,
  Elemento,
  FormatoBinario,
  MotivoDeMetadatos,
  RevisionesDePdf,
} from "@/engine/metadatos/tipos";
import type { AdvisorDeQis, RiesgoExacto } from "@/engine/riesgo";
import type { RiesgoEstimado } from "@/engine/riesgo-estimado";
import type { Utilidad } from "@/engine/utilidad";
import type { Idioma } from "@/lib/idioma";
import type { MensajeDeMotor } from "@/lib/idioma/mensajes";

/**
 * `json` cubre un arreglo de objetos Y JSON Lines (`.json`, `.jsonl`, `.ndjson`): cuál de las dos
 * formas es lo decide el worker mirando el contenido (`EstructuraJson.forma`), no la extensión.
 */
// `pdf` e `imagen` (S6) no son tablas: Velo les limpia los METADATOS, no el contenido. La extensión
// solo decide por qué puerta entran; qué son de verdad lo deciden sus bytes (`FormatoBinario`).
export type FormatoDeArchivo = "csv" | "excel" | "json" | "pdf" | "imagen";

export type MensajeAlWorker =
  | { tipo: "analizar"; archivo: File }
  /**
   * La frase de paso entra al worker y NO vuelve a salir. La llave se deriva aquí y se queda aquí:
   * la página recibe únicamente la huella de 12 hex, que es el HMAC de una constante y no sirve
   * para invertir nada. Así ningún componente, ningún estado de React y ningún reporte de error
   * puede tener una `CryptoKey` en la mano.
   */
  | { tipo: "derivar-llave"; frase: string; sal: string }
  /**
   * `idioma` es el del TRABAJO: el de la pantalla al pulsar «transformar». Decide los rótulos que
   * Velo escribe dentro del archivo (los de un intervalo de Mondrian) y queda en el resultado y en
   * el certificado. NO es parte de la política —ni de su hash, ni de la bóveda, ni del nombre del
   * archivo— y `construir-archivo` no lleva ninguno: la tabla guardada ya nació en ese idioma.
   */
  | { tipo: "transformar"; politica: Politica; idioma: Idioma }
  /**
   * S7: Mondrian y la generalización óptima, lado a lado, sobre las columnas del reparto de esta
   * política (con las jerarquías que trae, o las que la pantalla propone). No necesita llave: las
   * columnas del reparto no llevan técnica por columna. Lo que vuelve son cifras y niveles.
   */
  | {
      tipo: "comparar-generalizacion";
      politica: Politica;
      jerarquias: Readonly<Record<string, JerarquiaDeLaPolitica>>;
      idioma: Idioma;
    }
  /**
   * `destino` (S8, alto volumen): el archivo que el usuario eligió en el selector del sistema. El
   * worker escribe en él y la página no lee nada: pasa el asa y recibe la huella. Sin `destino`, el
   * archivo vuelve como `Blob`, como siempre.
   */
  | { tipo: "construir-archivo"; destino?: FileSystemFileHandle }
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
  | { tipo: "construir-restaurado"; destino?: FileSystemFileHandle }
  /**
   * El informe del regreso es un documento que se descarga: se escribe en el idioma de la pantalla
   * donde se pidió. El idioma entra como dato, igual que la fecha, para que el documento siga
   * siendo una función pura de lo que recibe.
   */
  | { tipo: "construir-informe-del-regreso"; fecha: string; idioma: Idioma }
  /**
   * Estima el riesgo poblacional del archivo que va a salir, con la población que el usuario
   * declaró. `null` es un caso legítimo y frecuente —no la declaró— y el motor contesta con su
   * «no calculable» razonado, que es lo que la pantalla enseña.
   *
   * Se calcula aquí y no en la página porque necesita las clases de equivalencia de la tabla
   * transformada, que es el archivo entero. Lo que cruza es el veredicto.
   */
  | { tipo: "estimar-riesgo"; poblacion: number | null }
  /**
   * Abre un `.velolog`. Igual que la bóveda: el `File` viaja **entero al worker** y ningún
   * componente lo toca, porque el gate de privacidad veta `.arrayBuffer()` fuera de `src/workers/`.
   */
  | { tipo: "abrir-bitacora"; archivo: File; frase: string }
  /**
   * Sella la bitácora abierta, opcionalmente con una entrada nueva al final. Si no hay ninguna
   * abierta, empieza una.
   *
   * **La frase se pide siempre, también al añadir a una bitácora que se acaba de abrir.** Podría
   * guardarse tras `abrir-bitacora` y ahorrarle al usuario escribirla otra vez; no se hace, porque
   * la regla del S2 y del S3 es que la frase entra y **no se queda**. Una frase retenida «por
   * comodidad» es una frase que vive en memoria durante toda la sesión.
   */
  | {
      tipo: "sellar-bitacora";
      frase: string;
      entrada: EntradaDeBitacora | null;
    }
  /**
   * Limpia los metadatos del PDF o la imagen que se diagnosticó. No lleva nada: el archivo ya está
   * en el worker, y la limpieza no tiene opciones — se quita todo lo que no hace falta para ver la
   * imagen o abrir el documento, y la pantalla dijo antes qué era.
   */
  | { tipo: "limpiar" };

/** Etapas del trabajo, en el orden en que ocurren. La UI las nombra tal cual. */
export type EtapaDelWorker =
  | "huella"
  | "leyendo"
  /** S8: un archivo más grande que lo que cabe en memoria se lee otra vez, por pasadas. */
  | "alto-volumen"
  | "clasificando"
  | "midiendo-riesgo"
  | "derivando-llave"
  | "transformando"
  | "comparando"
  | "midiendo-el-despues"
  | "escribiendo"
  | "sellando-boveda"
  | "abriendo-boveda"
  | "restaurando"
  | "abriendo-bitacora"
  | "sellando-bitacora"
  | "leyendo-metadatos"
  | "limpiando"
  /** El lector vuelve a correr sobre el archivo LIMPIO: es la prueba, no una formalidad. */
  | "comprobando";

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

/** Por qué no se pudo abrir un `.velolog`. Mismos motivos que la bóveda, y por eso otro tipo. */
export type MotivoDeBitacora =
  | "no-es-una-bitacora"
  | "version-distinta"
  | "frase-incorrecta"
  | "costo-inaceptable"
  | "contenido-invalido"
  | "lectura-fallida";

/**
 * Lo que la página sabe de una bitácora abierta: **sus entradas, enteras**.
 *
 * Es la única estructura de Velo cuyo contenido cruza la frontera sin recortar, y conviene decir
 * por qué no contradice la regla. Lo que el worker guarda para sí son los **datos de otras
 * personas** —celdas, valores originales, correspondencias de la bóveda—. Una bitácora no tiene
 * nada de eso: son los apuntes del propio usuario sobre su propio trabajo, y la pantalla que pidió
 * abrirlos existe justamente para enseñárselos. Nombres de archivo ya cruzaban desde el S1
 * (`Informe.archivo.nombre`).
 *
 * Lo que sí sigue sin cruzar es la **frase de paso**, que entra al worker y no vuelve.
 */
export interface ContenidoDeBitacora {
  readonly version: number;
  readonly entradas: readonly EntradaDeBitacora[];
  /** SHA-256 de la serialización EN CLARO — la identidad estable, nunca la del archivo cifrado. */
  readonly huella: string;
}

/** Para qué es el archivo que el worker acaba de construir. El asa es la misma; el destino no. */
export type PropositoDelArchivo =
  "anonimizado" | "boveda" | "restaurado" | "informe-del-regreso" | "bitacora";

export type MotivoDeError =
  | "formato-no-soportado"
  | "archivo-vacio"
  | "excel-excede-tope"
  | "excel-excede-memoria"
  /** Los de `MotivoJson`: un JSON que no se puede tratar. Son claves; el error no cita contenido. */
  | MotivoJson
  /**
   * Un `.pdf` o una imagen cuyos bytes no son ninguno de los cinco formatos que Velo limpia. Un
   * `.json` que no es JSON sale como `json-invalido`, no como este.
   */
  | "formato-no-coincide"
  | "lectura-fallida"
  /**
   * S10: falló ESCRIBIR el archivo de salida (el disco se llenó, se retiró el permiso del archivo
   * elegido, no cupo el `Blob`), no leer el de entrada. No tumba nada: la transformación o la
   * restauración siguen hechas, con su política y su llave, y se puede volver a preparar.
   */
  | "escritura-fallida"
  | "sin-tabla"
  | "sin-llave"
  | "transformacion-fallida"
  | "sin-boveda"
  | "sin-devuelto"
  | "restauracion-fallida"
  | "sin-bitacora"
  /** Los de `MotivoDeMetadatos`: un PDF cifrado o ilegible, una imagen rota, una limpieza incompleta. */
  | MotivoDeMetadatos
  | "pdf-excede-tope"
  | "imagen-excede-tope"
  /** La página cortó una limpieza que pasó de su límite de reloj: terminó el worker, no el archivo. */
  | "tiempo-agotado"
  /**
   * S8: lo que el alto volumen no puede hacer con este archivo, y lo dice en vez de estimar o de
   * escribir a medias: más combinaciones de cuasi-identificadores que las que el riesgo exacto
   * cuenta; una columna reversible demasiado grande para su bóveda; más filas que las que el
   * reparto admite; una columna devuelta con demasiados valores distintos para restaurarla.
   */
  | "alto-volumen-histograma-no-cabe"
  | "alto-volumen-boveda-no-cabe"
  | "alto-volumen-reparto-no-cabe"
  | "alto-volumen-devuelto-no-cabe";

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
  /**
   * Solo en un JSON: qué rutas se tratan, cuáles NO (las listas) y cuáles no están en todos los
   * registros. Ausente en CSV y Excel. La interfaz lo lee en `informe-de-diagnostico.tsx`.
   */
  estructura?: EstructuraJson;
  /**
   * S8: `"alto-volumen"` cuando el archivo pasó del tope de celdas en memoria y se leyó por
   * pasadas. Cambia tres cosas, y la pantalla las dice: se clasifica con las primeras filas, el
   * advisor solo combina cuasi-identificadores y la utilidad no se mide. Ausente en memoria.
   */
  modo?: "alto-volumen";
  /** Lo que costó, medido. Se enseña porque un instrumento honesto muestra su propio trabajo. */
  medicion: {
    msLectura: number;
    msDiagnostico: number;
    /** Heap del worker en MB. Solo Chromium lo expone; en el resto, null. */
    heapMb: number | null;
  };
}

/**
 * Lo que la página sabe de un PDF o una imagen (S6). No es un `Informe` con huecos: un archivo que
 * no es tabla no tiene filas, ni riesgo de reidentificación, ni consejero, y fingir que sí sería
 * enseñar ceros que no significan nada. Va por otro mensaje (`metadatos-listos`) y vive en otra fase
 * de la sesión, así que ningún componente de tablas lo recibe por accidente.
 *
 * Cruzan NOMBRES de campo y valores ENMASCARADOS (`CampoDeMetadato`), tamaños y avisos. El valor
 * completo de un metadato —el autor, las coordenadas— se queda en el worker.
 */
export interface InformeDeMetadatos {
  readonly archivo: {
    readonly nombre: string;
    readonly bytes: number;
    /** Por los bytes, no por la extensión. Si no coinciden, `avisos` lleva `extension-distinta`. */
    readonly formato: FormatoBinario;
    /** SHA-256 del archivo tal como está en el disco, igual que el de una tabla. */
    readonly sha256: string;
  };
  readonly metadatos: DiagnosticoDeMetadatos;
  readonly medicion: {
    readonly msLectura: number;
    readonly msDiagnostico: number;
    readonly heapMb: number | null;
  };
}

export interface DiagnosticoDeMetadatos {
  readonly campos: readonly CampoDeMetadato[];
  /** Etiquetas técnicas sin nada personal (exposición, ISO…): se quitan con el bloque y se cuentan. */
  readonly otrasEtiquetas: number;
  readonly quitables: readonly Elemento[];
  readonly conservables: readonly Elemento[];
  readonly avisos: readonly Aviso[];
  /** Solo en un PDF: cuántas versiones guarda dentro. */
  readonly revisiones: RevisionesDePdf | null;
}

/**
 * Lo que hizo la limpieza, para la pantalla y para el certificado. **La poscomprobación viaja
 * aquí como cifra**: el lector volvió a correr sobre el archivo limpio y esto es lo que encontró.
 * Un archivo en el que encontrara campos no se entrega (`limpieza-incompleta`), así que entregado
 * siempre dice 0 — y dicho, porque es la parte que alguien puede volver a comprobar.
 */
export interface ResumenDeLimpieza {
  readonly formato: FormatoBinario;
  readonly quitados: readonly Elemento[];
  readonly conservados: readonly Elemento[];
  /** Campos con nombre que tenía el original (los de la tabla del diagnóstico). */
  readonly campos: number;
  /** Solo en un PDF: las versiones anteriores que había dentro y ya no están. */
  readonly revisionesQuitadas: number;
  /** Solo en un PDF: el `/ID` nuevo, derivado del contenido limpio (32 hex). */
  readonly idNuevo: string | null;
  readonly poscomprobacion: {
    /** Campos con nombre hallados en la SALIDA. */
    readonly campos: number;
    /** Solo en un PDF: revisiones de la SALIDA (1 = ninguna anterior). */
    readonly revisiones: number | null;
  };
  /** SHA-256 del archivo limpio, sobre los mismos bytes del `Blob`. */
  readonly sha256: string;
  readonly bytes: number;
  readonly ms: number;
}

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

/**
 * Lo que la página sabe de un tratamiento.
 *
 * **Aquí se pagó la deuda B2 del S2 (S4, fase 0), y la forma del pago importa más que el pago.**
 * Cruzaban además `mondrian`, `diversidad`, `colisiones` y `pendientesDeMondrian` — las cuatro
 * estructuras crudas que `balanceDelTratamiento` consume **dentro del worker** para producir
 * `balance.salvedades`. O sea: la frontera llevaba la materia prima **y** la conclusión sacada de
 * ella, y ningún componente leía la materia prima. Verificado antes de borrar: cero lectores en
 * `components/`, `app/` y `lib/`.
 *
 * La regla que queda, y que `tests/unit/taller.test.tsx` sostiene con una lista literal de claves:
 * **un campo del contrato nace con su lector o no nace.** Si un consumidor futuro —el certificado
 * del S4, por ejemplo— necesita una de las cuatro, vuelve con quien la lea, no «por si acaso».
 */
export type { GeneralizacionAplicada, InformeDePrivacidad };

export interface ResultadoDeTransformacion {
  /** Identidad del tratamiento: mismo hash ⇒ mismo trato. */
  readonly hashDePolitica: string;
  /**
   * El idioma del trabajo: el de la pantalla cuando se pulsó «transformar», con el que se escribió
   * el archivo. Aparte del hash a propósito: la política es la misma en los dos idiomas. El
   * certificado lo lee de aquí —no del idioma de la pantalla al descargar, que decide el idioma del
   * propio documento— y lo declara.
   */
  readonly idioma: Idioma;
  readonly balance: BalanceDelTratamiento;
  /** `null` en alto volumen (S8): medirla exige las dos tablas enteras, y no se finge. */
  readonly utilidad: Utilidad | null;
  readonly suprimidas: readonly string[];
  readonly muestras: readonly MuestraDeTransformacion[];
  readonly ms: number;
  /**
   * S7: cómo se llegó al k cuando la política pidió la generalización óptima y la retícula se
   * recorrió; `null` con Mondrian (o sin reparto). El certificado lo cuenta, con la fuente de cada
   * escalera de fábrica. Cruzan nombres de columna, escaleras, claves de nivel y cifras.
   */
  readonly generalizacion: GeneralizacionAplicada | null;
  /**
   * S7: el ruido con garantía de cada columna (mecanismo, ε pedido y efectivo, recortes, dominio) y
   * el ε por fila; `null` sin ruido. Lo leen el panel de privacidad, el certificado y la bitácora.
   */
  readonly privacidad: InformeDePrivacidad | null;
}

/**
 * S7: un lado de la comparación entre Mondrian y la generalización óptima, medido sobre las columnas
 * del reparto (no sobre el archivo entero: el balance completo llega al transformar). Cruzan cifras,
 * nombres de columna y claves de nivel; ningún valor.
 */
export interface LadoDeLaComparacion {
  /** `false` cuando no se pudo calcular (la retícula pasa del tope). Las cifras van en 0. */
  readonly disponible: boolean;
  readonly motivo: "excede-tope" | "no-alcanzable" | "sin-dimensiones" | null;
  readonly alcanzado: boolean;
  readonly kAlcanzado: number;
  /** ℓ distinta sobre las columnas sensibles pedidas (la peor), o null si no se pidió. */
  readonly lAlcanzado: number | null;
  readonly clases: number;
  readonly unicos: number;
  readonly riesgoMaximo: number;
  readonly riesgoPromedio: number;
  /** Bits de las columnas del reparto antes y después (la «non-uniform entropy» en bits). */
  readonly bitsAntes: number;
  readonly bitsDespues: number;
  /**
   * Cómo quedó cada columna. En la óptima, `nivel` es la clave del nivel elegido (`quinquenio`,
   * `departamento`, `rango-10`, `suprimido`…); en Mondrian es null (sus cortes son locales).
   */
  readonly columnas: readonly {
    readonly nombre: string;
    readonly nivel: string | null;
    readonly distintos: number;
  }[];
  /** Solo la óptima: cuántos nodos revisó de cuántos tiene la retícula. */
  readonly nodosRevisados: number | null;
  readonly nodosEnLaReticula: number | null;
  readonly ms: number;
}

export interface ComparacionDeGeneralizacion {
  readonly kObjetivo: number;
  readonly lObjetivo: number | null;
  /** Las columnas sensibles que la política suprime: la ℓ no se exige sobre ellas. */
  readonly lDescartadas: readonly string[];
  readonly dimensiones: readonly string[];
  readonly mondrian: LadoDeLaComparacion;
  readonly optima: LadoDeLaComparacion;
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
  /** Un PDF o una imagen, ya leídos: lo que llevan dentro, nombrado y enmascarado. */
  | { tipo: "metadatos-listos"; informe: InformeDeMetadatos }
  /**
   * El archivo limpio, como asa opaca (ADR-005), con lo que se le quitó. Va en UN mensaje para que
   * la pantalla nunca tenga un archivo sin su resumen ni un resumen sin su archivo.
   */
  | {
      tipo: "limpiado";
      resumen: ResumenDeLimpieza;
      blob: Blob;
      nombre: string;
    }
  | { tipo: "llave-lista"; huella: string }
  | { tipo: "transformado"; resultado: ResultadoDeTransformacion }
  /** `null`: no se pudo comparar (sin reparto o sin k). No es un error de la sesión. */
  | { tipo: "comparacion"; comparacion: ComparacionDeGeneralizacion | null }
  /**
   * El archivo, como **asa opaca**. Un `Blob` no es el contenido: es una referencia que el
   * navegador resuelve al guardarlo. La página hace `createObjectURL` y jamás lo lee — ver
   * `decisions/005-la-frontera-y-la-descarga.md`, y el test que lo verifica.
   */
  | {
      tipo: "archivo";
      /**
       * El asa del archivo. Ausente solo cuando el worker lo escribió en el archivo que el usuario
       * eligió (`enDisco`, S8): ya está en su equipo y no hay nada que descargar.
       */
      blob?: Blob;
      enDisco?: true;
      nombre: string;
      bytes: number;
      proposito: PropositoDelArchivo;
      /**
       * SHA-256 del archivo que se acaba de construir.
       *
       * **Opcional a propósito, y presente solo cuando `proposito` es `"anonimizado"`** — que es el
       * único caso con lector: el certificado del S4, que necesita las dos huellas para que un
       * tercero pueda comprobar que el documento habla de la copia que tiene en la mano.
       *
       * Podría calcularse para los cuatro propósitos casi gratis, y por eso conviene decir por qué
       * no se hace: la regla §5 de este repo es que **un campo del contrato nace con su lector o no
       * nace**, y en la fase 0 de este mismo sprint se borraron cuatro campos que cruzaban la
       * frontera sin que nadie los leyera. Añadir tres huellas «por simetría» sería reabrir esa
       * deuda el mismo día de pagarla.
       */
      sha256?: string;
    }
  | { tipo: "boveda-abierta"; resumen: ResumenDeBoveda }
  | {
      tipo: "boveda-rechazada";
      motivo: MotivoDeBoveda;
      /** Un `Mensaje`, nunca una frase: a la página solo cruzan claves y datos. */
      detalle: MensajeDeMotor;
    }
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
  /** El veredicto de los dos estimadores. Ninguno se compone con el riesgo exacto. */
  | { tipo: "riesgo-estimado"; estimacion: RiesgoEstimado }
  | { tipo: "bitacora-abierta"; contenido: ContenidoDeBitacora }
  | {
      tipo: "bitacora-rechazada";
      motivo: MotivoDeBitacora;
      /** Un `Mensaje`, nunca una frase: a la página solo cruzan claves y datos. */
      detalle: MensajeDeMotor;
    }
  | {
      tipo: "error";
      motivo: MotivoDeError;
      /**
       * Línea (1-based) donde un JSON dejó de ser válido. Es un NÚMERO, nunca un trozo del archivo:
       * solo la ponen los motivos `json-*`, y es lo que vuelve útil a JSON Lines (una línea mala se
       * localiza) sin que el error cite contenido.
       */
      linea?: number;
    };
