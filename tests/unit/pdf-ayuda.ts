// PDF sintéticos hechos a mano para los tests del escáner y de la limpieza (ADR-010).
//
// Se escriben byte a byte, sin pdf-lib, por dos razones: (1) lo que se prueba es justo lo que un
// escritor de PDF de verdad deja en el archivo y pdf-lib no escribiría nunca —revisiones añadidas
// con `/Prev`, un objeto «liberado» que sigue en los bytes, un `/ID` heredado, una revisión guardada
// en flujos de objetos—; y (2) un constructor que usara la misma biblioteca que la limpieza haría
// que el test se pareciera demasiado a lo que prueba.
//
// Regla dura 5: todo dato es inventado. La cédula `1032456789` es el número sintético de siempre
// del kit de prueba; los nombres, los UUID y los textos centinela no existen fuera de este archivo.

/** Bytes de un texto, uno por carácter (latin1). Lo que no cabe en un byte se trunca a propósito. */
export function latin1(texto: string): Uint8Array {
  const bytes = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i++) bytes[i] = texto.charCodeAt(i) & 0xff;
  return bytes;
}

/** Los bytes como texto latin1, para buscar en ellos. */
export function comoTexto(bytes: Uint8Array): string {
  let texto = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    texto += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return texto;
}

/** Cuántas veces aparece `aguja` en los bytes. */
export function cuenta(bytes: Uint8Array, aguja: string): number {
  return comoTexto(bytes).split(aguja).length - 1;
}

function relleno(n: number, ancho: number): string {
  return String(n).padStart(ancho, "0");
}

interface Entrada {
  readonly tipo: "en-uso" | "libre" | "comprimido";
  readonly a: number;
  readonly b: number;
}

/**
 * Un escritor de PDF de bajo nivel. Cada objeto que se escribe queda anotado para la tabla de
 * referencias de la revisión en curso; `cerrar` (tabla clásica) o `cerrarConFlujo` (flujo `/XRef`)
 * la escriben con su trailer, `startxref` y `%%EOF`, y empiezan la siguiente revisión.
 */
export class EscritorDePdf {
  private readonly partes: Uint8Array[] = [];
  private posicion = 0;
  private entradas = new Map<number, Entrada>();
  private ultimoXref = -1;
  private mayor = 0;

  get largo(): number {
    return this.posicion;
  }

  crudo(bytes: Uint8Array): this {
    this.partes.push(bytes);
    this.posicion += bytes.length;
    return this;
  }

  texto(texto: string): this {
    return this.crudo(latin1(texto));
  }

  cabecera(version = "1.7"): this {
    return this.texto(`%PDF-${version}\n%\xe2\xe3\xcf\xd3\n`);
  }

  private anotar(numero: number, entrada: Entrada) {
    this.entradas.set(numero, entrada);
    this.mayor = Math.max(this.mayor, numero);
  }

  objeto(numero: number, cuerpo: string, generacion = 0): this {
    this.anotar(numero, { tipo: "en-uso", a: this.posicion, b: generacion });
    return this.texto(`${numero} ${generacion} obj\n${cuerpo}\nendobj\n`);
  }

  /** Un flujo sin filtro, con `/Length` directo (o el que se pase en `largo`, para mentir). */
  flujo(
    numero: number,
    diccionario: string,
    contenido: string | Uint8Array,
    largo?: string,
  ): this {
    const datos = typeof contenido === "string" ? latin1(contenido) : contenido;
    this.anotar(numero, { tipo: "en-uso", a: this.posicion, b: 0 });
    this.texto(
      `${numero} 0 obj\n<< ${diccionario} /Length ${largo ?? datos.length} >>\nstream\n`,
    );
    this.crudo(datos);
    return this.texto("\nendstream\nendobj\n");
  }

  /** Un flujo de objetos (`/ObjStm`) sin comprimir con estos objetos dentro (§ 7.5.7). */
  flujoDeObjetos(
    numero: number,
    objetos: readonly (readonly [number, string])[],
  ): this {
    let cuerpo = "";
    const indice: string[] = [];
    for (const [n, texto] of objetos) {
      indice.push(`${n} ${cuerpo.length}`);
      cuerpo += `${texto}\n`;
    }
    const cabeza = `${indice.join(" ")}\n`;
    this.flujo(
      numero,
      `/Type /ObjStm /N ${objetos.length} /First ${cabeza.length}`,
      cabeza + cuerpo,
    );
    objetos.forEach(([n], i) =>
      this.anotar(n, { tipo: "comprimido", a: numero, b: i }),
    );
    return this;
  }

  /** Marca objetos como libres en la tabla de la revisión en curso (siguen en los bytes). */
  liberar(...numeros: number[]): this {
    for (const n of numeros) this.anotar(n, { tipo: "libre", a: 0, b: 1 });
    return this;
  }

  private subsecciones(): (readonly [number, Entrada[]])[] {
    const numeros = [...this.entradas.keys()].sort((a, b) => a - b);
    const grupos: [number, Entrada[]][] = [];
    for (const n of numeros) {
      const ultimo = grupos[grupos.length - 1];
      const entrada = this.entradas.get(n) as Entrada;
      if (ultimo && ultimo[0] + ultimo[1].length === n) ultimo[1].push(entrada);
      else grupos.push([n, [entrada]]);
    }
    return grupos;
  }

  private prev(): string {
    return this.ultimoXref >= 0 ? ` /Prev ${this.ultimoXref}` : "";
  }

  /** Tabla de referencias clásica, trailer, `startxref` y `%%EOF`. */
  cerrar(trailer: string): this {
    if (this.ultimoXref < 0) this.anotar(0, { tipo: "libre", a: 0, b: 65535 });
    const xref = this.posicion;
    let tabla = "xref\n";
    for (const [desde, lista] of this.subsecciones()) {
      tabla += `${desde} ${lista.length}\n`;
      for (const e of lista)
        tabla +=
          e.tipo === "en-uso"
            ? `${relleno(e.a, 10)} ${relleno(e.b, 5)} n \n`
            : `${relleno(0, 10)} ${relleno(e.b, 5)} f \n`;
    }
    this.texto(
      `${tabla}trailer\n<< /Size ${this.mayor + 1} ${trailer}${this.prev()} >>\nstartxref\n${xref}\n%%EOF\n`,
    );
    this.ultimoXref = xref;
    this.entradas = new Map();
    return this;
  }

  /** Flujo de referencias (`/Type /XRef`, § 7.5.8) en vez de tabla: anchos `[1 4 2]`, sin filtro. */
  cerrarConFlujo(numero: number, trailer: string): this {
    if (this.ultimoXref < 0) this.anotar(0, { tipo: "libre", a: 0, b: 65535 });
    const xref = this.posicion;
    this.anotar(numero, { tipo: "en-uso", a: xref, b: 0 });
    const grupos = this.subsecciones();
    const filas: number[] = [];
    for (const [, lista] of grupos)
      for (const e of lista) {
        const tipo = e.tipo === "libre" ? 0 : e.tipo === "en-uso" ? 1 : 2;
        filas.push(
          tipo,
          (e.a >>> 24) & 255,
          (e.a >>> 16) & 255,
          (e.a >>> 8) & 255,
          e.a & 255,
          (e.b >>> 8) & 255,
          e.b & 255,
        );
      }
    const indice = grupos
      .map(([desde, lista]) => `${desde} ${lista.length}`)
      .join(" ");
    this.texto(
      `${numero} 0 obj\n<< /Type /XRef /Size ${this.mayor + 1} /W [1 4 2] /Index [${indice}] ${trailer}${this.prev()} /Length ${filas.length} >>\nstream\n`,
    );
    this.crudo(Uint8Array.from(filas));
    this.texto(`\nendstream\nendobj\nstartxref\n${xref}\n%%EOF\n`);
    this.ultimoXref = xref;
    this.entradas = new Map();
    return this;
  }

  resultado(): Uint8Array {
    const salida = new Uint8Array(this.posicion);
    let i = 0;
    for (const parte of this.partes) {
      salida.set(parte, i);
      i += parte.length;
    }
    return salida;
  }
}

// ── El documento de prueba ────────────────────────────────────────────────────────────────────

/** Lo que dibuja la página. La limpieza debe copiarlo byte a byte. */
export const CONTENIDO_DE_PAGINA = "BT /F1 12 Tf 20 100 Td (Hola mundo) Tj ET";

export const CEDULA = "1032456789";
export const ID_ORIGINAL = "A1A1A1A1A1A1A1A1A1A1A1A1A1A1A1A1";

/** El autor que cada revisión escribe en su `Info`. La cédula vive SOLO en la primera. */
export function autorDeLaRevision(revision: number): string {
  return revision === 1
    ? `Autora Uno CC ${CEDULA}`
    : `Autora Revision ${revision}`;
}

/** Lo que no puede quedar en la salida limpia (las anotaciones se informan y no se limpian). */
export const CENTINELAS = [
  "Autora Uno",
  "Autora Revision",
  CEDULA,
  "Generador Sintetico",
  "Informe trimestral",
  "TEXTO HUERFANO",
  "PRIVADO DE ILLUSTRATOR",
  "uuid:0a0a0a0a",
  "uuid:0b0b0b0b",
  "Editor Sintetico",
  "D:2026",
  ID_ORIGINAL,
] as const;

function xmp(revision: number): string {
  return (
    '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    '<rdf:Description rdf:about="" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" ' +
    `xmpMM:DocumentID="uuid:0a0a0a0a-0000-4000-8000-00000000000${revision}" ` +
    `xmpMM:InstanceID="uuid:0b0b0b0b-0000-4000-8000-00000000000${revision}" ` +
    `xmp:CreatorTool="Editor Sintetico ${revision}"/>` +
    '</rdf:RDF></x:xmpmeta><?xpacket end="w"?>'
  );
}

function info(revision: number): string {
  return `<< /Author (${autorDeLaRevision(revision)}) /Title (Informe trimestral) /Producer (Generador Sintetico ${revision}) /CreationDate (D:20260101000000Z) /ModDate (D:2026020${revision}000000Z) >>`;
}

export interface OpcionesDePdf {
  /** 1 = nunca editado. Cada revisión de más redefine el `Info` (y el XMP, si lo hay). */
  readonly revisiones?: number;
  readonly xmp?: boolean;
  /** `/ID` en el primer trailer; cada revisión hereda el primer elemento. */
  readonly id?: boolean;
  /** Un objeto que la segunda revisión «libera» y que sigue en los bytes. */
  readonly huerfano?: boolean;
  /** `/Encrypt` en el primer trailer. */
  readonly cifrado?: boolean;
  readonly firma?: boolean;
  /** Una anotación de texto con autor (`/T`). */
  readonly anotacion?: boolean;
  readonly adjunto?: boolean;
  readonly javascript?: boolean;
  /** `/PieceInfo` (con un objeto privado) y `/Thumb` en la página. */
  readonly piezas?: boolean;
  /** Número de la revisión (≥ 2) que guarda su `Info` en un `/ObjStm` con un flujo `/XRef`. */
  readonly comprimida?: number;
}

/** El documento de prueba: una página, y todo lo que las opciones le agreguen. */
export function pdfDePrueba(opciones: OpcionesDePdf = {}): Uint8Array {
  const revisiones = opciones.revisiones ?? 1;
  const w = new EscritorDePdf().cabecera("1.4");

  const catalogo = [
    "/Type /Catalog /Pages 2 0 R",
    opciones.xmp ? "/Metadata 7 0 R" : "",
    opciones.firma ? "/AcroForm << /Fields [10 0 R] /SigFlags 3 >>" : "",
    opciones.adjunto
      ? "/Names << /EmbeddedFiles << /Names [(nota.txt) 13 0 R] >> >>"
      : "",
    opciones.javascript
      ? "/OpenAction << /S /JavaScript /JS (app.alert\\(1\\)) >>"
      : "",
  ].filter(Boolean);
  const anotaciones = [
    opciones.firma ? "10 0 R" : "",
    opciones.anotacion ? "12 0 R" : "",
  ].filter(Boolean);
  const pagina = [
    "/Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >>",
    anotaciones.length > 0 ? `/Annots [${anotaciones.join(" ")}]` : "",
    opciones.piezas
      ? "/PieceInfo << /Illustrator << /LastModified (D:20260101000000Z) /Private 15 0 R >> >> /Thumb 16 0 R"
      : "",
  ].filter(Boolean);

  w.objeto(1, `<< ${catalogo.join(" ")} >>`);
  w.objeto(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  w.objeto(3, `<< ${pagina.join(" ")} >>`);
  w.flujo(4, "", CONTENIDO_DE_PAGINA);
  w.objeto(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  w.objeto(6, info(1));
  if (opciones.xmp) w.flujo(7, "/Type /Metadata /Subtype /XML", xmp(1));
  if (opciones.huerfano)
    w.objeto(8, "<< /Comentario (TEXTO HUERFANO QUE SIGUE EN LOS BYTES) >>");
  if (opciones.cifrado)
    w.objeto(9, "<< /Filter /Standard /V 1 /R 2 /O <00> /U <00> /P -4 >>");
  if (opciones.firma) {
    w.objeto(
      10,
      "<< /FT /Sig /T (Firma1) /V 11 0 R /Type /Annot /Subtype /Widget /Rect [0 0 0 0] /P 3 0 R >>",
    );
    w.objeto(
      11,
      "<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [0 100 200 300] /Contents <0000> >>",
    );
  }
  if (opciones.anotacion)
    w.objeto(
      12,
      `<< /Type /Annot /Subtype /Text /Rect [10 10 30 30] /T (Revisora Sintetica) /Contents (Nota de revision) >>`,
    );
  if (opciones.adjunto) {
    w.objeto(
      13,
      "<< /Type /Filespec /F (nota.txt) /UF (nota.txt) /EF << /F 14 0 R >> >>",
    );
    w.flujo(14, "/Type /EmbeddedFile", "contenido adjunto sintetico");
  }
  if (opciones.piezas) {
    w.objeto(15, "<< /Datos (PRIVADO DE ILLUSTRATOR) >>");
    w.flujo(
      16,
      "/Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8",
      "\x80",
    );
  }

  const id = (revision: number) =>
    opciones.id ? ` /ID [<${ID_ORIGINAL}> <${relleno(revision, 32)}>]` : "";
  const cifrado = opciones.cifrado ? " /Encrypt 9 0 R" : "";
  w.cerrar(`/Root 1 0 R /Info 6 0 R${id(1)}${cifrado}`);

  for (let revision = 2; revision <= revisiones; revision++) {
    if (revision === opciones.comprimida) {
      w.flujoDeObjetos(20 + revision, [[6, info(revision)]]);
      w.cerrarConFlujo(30 + revision, `/Root 1 0 R /Info 6 0 R${id(revision)}`);
      continue;
    }
    w.objeto(6, info(revision));
    if (opciones.xmp)
      w.flujo(7, "/Type /Metadata /Subtype /XML", xmp(revision));
    if (opciones.huerfano && revision === 2) w.liberar(8);
    w.cerrar(`/Root 1 0 R /Info 6 0 R${id(revision)}`);
  }
  return w.resultado();
}

/**
 * Un PDF con forma de linealizado (ISO 32000-1, anexo F): diccionario `/Linearized` primero, una
 * sección de la primera página que cierra con `startxref 0 %%EOF`, el flujo de pistas al que
 * apunta `/H`, y el resto. Dos `%%EOF` y UNA revisión. Con `editado`, una actualización encima.
 */
export function pdfLinealizado(editado = false): Uint8Array {
  const construir = (pistas: number, largoTotal: number) => {
    const w = new EscritorDePdf().cabecera();
    w.objeto(
      20,
      `<< /Linearized 1 /L ${relleno(largoTotal, 10)} /H [ ${relleno(pistas, 10)} 12 ] /O 22 /E 0000000000 /N 1 /T 0000000000 >>`,
    );
    w.objeto(21, "<< /Type /Catalog /Pages 2 0 R >>");
    w.objeto(
      22,
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    );
    const posicionDePistas = w.largo;
    w.flujo(23, "", "\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b");
    // La sección de la primera página: su `startxref` apunta a 0, como en un linealizado real.
    w.texto(
      `trailer\n<< /Size 24 /Root 21 0 R /Info 6 0 R /ID [<${ID_ORIGINAL}> <${ID_ORIGINAL}>] >>\nstartxref\n0\n%%EOF\n`,
    );
    w.objeto(2, "<< /Type /Pages /Kids [22 0 R] /Count 1 >>");
    w.flujo(4, "", CONTENIDO_DE_PAGINA);
    w.objeto(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    w.objeto(6, info(1));
    w.cerrar("/Root 21 0 R /Info 6 0 R");
    if (editado) {
      w.objeto(6, info(2));
      w.cerrar(
        `/Root 21 0 R /Info 6 0 R /ID [<${ID_ORIGINAL}> <${relleno(2, 32)}>]`,
      );
    }
    return { bytes: w.resultado(), posicionDePistas };
  };
  const borrador = construir(0, 0);
  return construir(borrador.posicionDePistas, borrador.bytes.length).bytes;
}

/** Generador congruencial lineal mínimo (Numerical Recipes): azar SEMBRADO, igual en cada corrida. */
export function lcg(semilla: number): () => number {
  let estado = semilla >>> 0;
  return () => {
    estado = (Math.imul(estado, 1664525) + 1013904223) >>> 0;
    return estado / 0x1_0000_0000;
  };
}
