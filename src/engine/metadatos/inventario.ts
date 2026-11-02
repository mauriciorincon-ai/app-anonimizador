// El inventario de una imagen — lo que los tres lectores (JPEG, PNG, WebP) van anotando mientras
// recorren el archivo, y que al final se vuelve un `AnalisisDeMetadatos`.
//
// Vive aparte para que los tres formatos lo compartan sin importarse entre sí ni importar a
// `imagen.ts` (que los importa a ellos). Aquí se aplican, en UN solo lugar, las dos reglas que valen
// para todo campo:
//   · el valor se normaliza (espacios y caracteres de control) y se recorta a `LARGO_MAXIMO_DE_VALOR`,
//     y si algo se recortó el análisis lo avisa (`valores-recortados`);
//   · se guardan como mucho `MAXIMO_DE_CAMPOS`; los demás se CUENTAN (`campos-de-mas`), sin crecer
//     en memoria con un archivo que traiga cien mil palabras clave.
// Los elementos (lo que se quita y lo que se conserva) se agrupan por clase y marcador: tres chunks
// `tEXt` son UN elemento con `cuantos: 3` y la suma de sus bytes.

import {
  type AnalisisDeMetadatos,
  type Aviso,
  type CampoCrudo,
  type ClaseDeElemento,
  type ClaveDeAviso,
  type Elemento,
  type FormatoBinario,
  LARGO_MAXIMO_DE_VALOR,
  MAXIMO_DE_CAMPOS,
  type OrigenDeCampo,
  type Revela,
} from "./tipos";

/** Espacios y controles (`\0` incluido) colapsados en un espacio; sin bordes. */
export function normalizarValor(texto: string): string {
  return texto.replace(/[\p{Cc}\s]+/gu, " ").trim();
}

export interface CampoNuevo {
  /** `null` cuando el valor queda vacío: un campo vacío no dice nada y no se lista. */
  readonly campo: CampoCrudo | null;
  readonly recortado: boolean;
}

/**
 * Un campo listo para el inventario: normalizado y recortado. `cortado` dice que el lector ya
 * dejó bytes sin decodificar (el valor era más largo que el tope), y eso también es un recorte.
 */
export function crearCampo(
  clave: string,
  origen: OrigenDeCampo,
  revela: Revela,
  texto: string,
  cortado = false,
): CampoNuevo {
  const valor = normalizarValor(texto);
  if (valor === "") return { campo: null, recortado: false };
  const recortado = cortado || valor.length > LARGO_MAXIMO_DE_VALOR;
  return {
    campo: {
      clave,
      origen,
      revela,
      valor: valor.slice(0, LARGO_MAXIMO_DE_VALOR),
    },
    recortado,
  };
}

/** Lo que devuelve cualquier lector de un bloque (EXIF, IPTC, XMP): sus campos y si recortó. */
export interface LecturaDeCampos {
  readonly campos: readonly CampoCrudo[];
  readonly recortados: boolean;
}

interface ElementoVivo {
  clase: ClaseDeElemento;
  marcador: string;
  bytes: number;
  cuantos: number;
}

function anotar(
  grupo: Map<string, ElementoVivo>,
  clase: ClaseDeElemento,
  marcador: string,
  bytes: number,
): void {
  const clave = `${clase} ${marcador}`;
  const previo = grupo.get(clave);
  if (previo) {
    previo.bytes += bytes;
    previo.cuantos += 1;
  } else grupo.set(clave, { clase, marcador, bytes, cuantos: 1 });
}

function congelar(grupo: Map<string, ElementoVivo>): Elemento[] {
  return [...grupo.values()].map((e) => ({ ...e }));
}

export class Inventario {
  private readonly campos: CampoCrudo[] = [];
  private camposDeMas = 0;
  private recortados = false;
  private otras = 0;
  private readonly quitables = new Map<string, ElementoVivo>();
  private readonly conservables = new Map<string, ElementoVivo>();
  /** Clave → cuenta (0 = el aviso no es una cuenta). El orden es el de aparición. */
  private readonly avisos = new Map<ClaveDeAviso, number>();

  agregarCampo(campo: CampoCrudo): void {
    if (this.campos.length < MAXIMO_DE_CAMPOS) this.campos.push(campo);
    else this.camposDeMas += 1;
  }

  /** Normaliza, recorta y agrega. Un valor vacío no se agrega. */
  campo(
    clave: string,
    origen: OrigenDeCampo,
    revela: Revela,
    texto: string,
    cortado = false,
  ): void {
    const nuevo = crearCampo(clave, origen, revela, texto, cortado);
    this.recortados ||= nuevo.recortado;
    if (nuevo.campo) this.agregarCampo(nuevo.campo);
  }

  agregarLectura(lectura: LecturaDeCampos): void {
    this.recortados ||= lectura.recortados;
    for (const campo of lectura.campos) this.agregarCampo(campo);
  }

  contarOtras(n: number): void {
    this.otras += n;
  }

  quitar(clase: ClaseDeElemento, marcador: string, bytes: number): void {
    anotar(this.quitables, clase, marcador, bytes);
  }

  conservar(clase: ClaseDeElemento, marcador: string, bytes: number): void {
    anotar(this.conservables, clase, marcador, bytes);
  }

  /** Un aviso que no es una cuenta: se anota una vez aunque se pida varias. */
  avisar(clave: ClaveDeAviso): void {
    if (!this.avisos.has(clave)) this.avisos.set(clave, 0);
  }

  /** Un aviso que sí es una cuenta: cada llamada suma uno. */
  contarAviso(clave: ClaveDeAviso): void {
    this.avisos.set(clave, (this.avisos.get(clave) ?? 0) + 1);
  }

  cerrar(formato: FormatoBinario): AnalisisDeMetadatos {
    const avisos: Aviso[] = [...this.avisos].map(([clave, n]) =>
      n > 0 ? { clave, n } : { clave },
    );
    if (this.recortados) avisos.push({ clave: "valores-recortados" });
    if (this.camposDeMas > 0)
      avisos.push({ clave: "campos-de-mas", n: this.camposDeMas });
    return {
      formato,
      campos: [...this.campos],
      otrasEtiquetas: this.otras,
      quitables: congelar(this.quitables),
      conservables: congelar(this.conservables),
      avisos,
      revisiones: null,
    };
  }
}
