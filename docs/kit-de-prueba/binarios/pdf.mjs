// PDF sintético con metadatos falsos — para probar la limpieza, no para parecer un informe.
//
// Un PDF 1.7 válido de una página (Helvetica, una línea de texto), escrito a mano con los
// desplazamientos EXACTOS de cada tabla xref. Lo que lo hace útil es lo que esconde:
//
//   simple          una revisión; solo el diccionario Info (Author con cédula, Creator, Producer…).
//   con-revisiones  dos revisiones. La 1.ª trae Info, un flujo XMP, `/PieceInfo` y `/Thumb` en la
//                   página, una anotación de texto, un comentario huérfano y `/ID [<A> <A>]`. La 2.ª
//                   es una ACTUALIZACIÓN INCREMENTAL añadida al final: un Info nuevo con OTRO
//                   Author, un Catálogo y un XMP actualizados, el comentario huérfano LIBERADO y
//                   `/Prev` + `/ID [<A> <B>]`. Lo «reemplazado» sigue estando en los bytes de la
//                   revisión anterior: eso es lo que un editor no te dice.
//   cifrado         el trailer trae `/Encrypt` (la estructura está; las cadenas NO están cifradas de
//                   verdad: no hace falta que abra, solo que Velo lo reconozca y se niegue).
//   firmado         un campo `/FT /Sig` cuyo `/V` es un `/Type /Sig` con `/ByteRange` exacto y
//                   `/Contents` de ceros (la firma no es válida criptográficamente; la estructura sí).

import { crearFicha, crearRegistro, construirXmp } from "./comun.mjs";

/** La línea de texto de la página: es el CONTENIDO, lo único que la limpieza no debe tocar. */
export const TEXTO_DEL_PDF = "Documento sintetico de prueba - Velo";

export const PERFILES_PDF = ["simple", "con-revisiones", "cifrado", "firmado"];

/** Espacio reservado para la firma: 2048 bytes = 4096 dígitos hexadecimales. */
const LARGO_DE_LA_FIRMA_EN_HEX = 4096;

/** Cadena literal de PDF. Todo lo que el kit escribe aquí es ASCII, así que basta escapar `\ ( )`. */
const cadena = (texto) => `(${texto.replace(/([\\()])/g, "\\$1")})`;

const diez = (n) => String(n).padStart(10, "0");
const cinco = (n) => String(n).padStart(5, "0");

/** Acumula bytes y recuerda dónde empezó cada objeto: de ahí salen los xref exactos. */
class Escritor {
  constructor() {
    this.partes = [];
    this.largo = 0;
  }

  escribir(dato) {
    const bytes = typeof dato === "string" ? Buffer.from(dato, "latin1") : dato;
    this.partes.push(bytes);
    this.largo += bytes.length;
  }

  /** Escribe `N 0 obj … endobj` y devuelve el desplazamiento donde empezó. */
  objeto(numero, cuerpo) {
    const desplazamiento = this.largo;
    this.escribir(`${numero} 0 obj\n`);
    this.escribir(cuerpo);
    this.escribir("\nendobj\n");
    return desplazamiento;
  }

  bytes() {
    return Buffer.concat(this.partes);
  }
}

/** Un flujo: diccionario con `/Length` exacto, `stream`, los datos y `endstream`. */
function flujo(diccionario, datos) {
  return Buffer.concat([
    Buffer.from(
      `<<${diccionario ? ` ${diccionario}` : ""} /Length ${datos.length} >>\nstream\n`,
      "latin1",
    ),
    datos,
    Buffer.from("\nendstream", "latin1"),
  ]);
}

/**
 * Una tabla xref. `secciones`: `[{ inicio, entradas: [{ desplazamiento, generacion }
 * | { libre: true, siguiente, generacion }] }]`. Cada entrada mide 20 bytes exactos.
 */
function tablaXref(secciones) {
  let texto = "xref\n";
  for (const { inicio, entradas } of secciones) {
    texto += `${inicio} ${entradas.length}\n`;
    for (const e of entradas) {
      texto += e.libre
        ? `${diez(e.siguiente)} ${cinco(e.generacion)} f \n`
        : `${diez(e.desplazamiento)} ${cinco(e.generacion)} n \n`;
    }
  }
  return texto;
}

const CABECERA_LIBRE = { libre: true, siguiente: 0, generacion: 65535 };

function diccionarioInfo({
  titulo,
  autor,
  asunto,
  palabras,
  creador,
  productor,
  creacion,
  modificacion,
}) {
  return (
    `<< /Title ${cadena(titulo)} /Author ${cadena(autor)} /Subject ${cadena(asunto)}` +
    ` /Keywords ${cadena(palabras)} /Creator ${cadena(creador)} /Producer ${cadena(productor)}` +
    ` /CreationDate ${cadena(creacion)} /ModDate ${cadena(modificacion)} >>`
  );
}

/** El paquete XMP del documento. En la 2.ª revisión cambia la autoría, la instancia y la fecha. */
function xmpDelDocumento(ficha, registro, revision) {
  const segunda = revision === 2;
  return construirXmp({
    atributos: [
      ["xmpMM", "DocumentID", registro.agregar(ficha.ids.documento)],
      [
        "xmpMM",
        "InstanceID",
        registro.agregar(segunda ? ficha.ids.instancia2 : ficha.ids.instancia),
      ],
      ["xmpMM", "OriginalDocumentID", registro.agregar(ficha.ids.original)],
    ],
    elementos: [
      [
        "dc",
        "creator",
        {
          seq: [
            registro.agregar(
              segunda ? ficha.propietario.completo : ficha.autor.completo,
            ),
          ],
        },
      ],
      [
        "dc",
        "title",
        { alt: registro.agregar(`Informe sintetico ${ficha.expediente}`) },
      ],
      ["xmp", "CreatorTool", registro.agregar(ficha.software)],
      ["xmp", "CreateDate", registro.agregar(ficha.fechas.captura.iso)],
      [
        "xmp",
        "ModifyDate",
        registro.agregar(
          segunda ? ficha.fechas.modificada.iso : ficha.fechas.captura.iso,
        ),
      ],
      [
        "pdf",
        "Producer",
        registro.agregar(segunda ? ficha.productorDos : ficha.productorUno),
      ],
    ],
    relleno: 256,
  });
}

/** El texto del ByteRange con anchura fija, para poder rellenarlo sin mover un solo byte. */
const byteRange = (a, b, c) =>
  `/ByteRange [0 ${String(a).padEnd(10)} ${String(b).padEnd(10)} ${String(c).padEnd(10)}]`;

/**
 * Genera un PDF con metadatos falsos.
 *
 * @param {{ semilla: number, perfil?: "simple" | "con-revisiones" | "cifrado" | "firmado" }} opciones
 * @returns {{ bytes: Buffer, centinelas: string[], detalle: import("./comun.mjs").DetalleDePdf }}
 */
export function generarPdf({ semilla, perfil = "con-revisiones" }) {
  if (!PERFILES_PDF.includes(perfil)) {
    throw new Error(
      `perfil desconocido: «${String(perfil)}» (los válidos: ${PERFILES_PDF.join(", ")})`,
    );
  }
  const ficha = crearFicha(semilla);
  const registro = crearRegistro();
  const f = ficha.fechas;
  const conRevisiones = perfil === "con-revisiones";
  const firmado = perfil === "firmado";

  // ── Los centinelas que esconde el diccionario Info (revisión 1) ──
  registro.agregar(ficha.cedula);
  registro.agregar(ficha.autor.completo);
  const info = {
    titulo: registro.agregar(`Informe sintetico ${ficha.expediente}`),
    autor: registro.agregar(ficha.autorPdf),
    asunto: registro.agregar(`Asunto reservado de ${ficha.municipio}`),
    palabras: registro.agregar(
      `${ficha.expediente}, interno, ${ficha.municipio.toLowerCase()}`,
    ),
    creador: registro.agregar(ficha.software),
    productor: registro.agregar(ficha.productorUno),
    creacion: registro.agregar(f.captura.pdf),
    modificacion: registro.agregar(f.captura.pdf),
  };

  const escritor = new Escritor();
  escritor.escribir("%PDF-1.7\n");
  escritor.escribir(Buffer.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // comentario binario: «%âãÏÓ»

  // ── Objetos de la revisión 1 ──
  const contenido = Buffer.from(
    `BT /F1 18 Tf 72 700 Td (${TEXTO_DEL_PDF}) Tj ET`,
    "latin1",
  );
  const desplazamientos = new Map();
  const objeto = (numero, cuerpo) =>
    desplazamientos.set(numero, escritor.objeto(numero, cuerpo));

  // Solo se arma (y se registra su ruta) donde de verdad se escribe: un centinela es lo que HAY.
  const pieceInfo = () =>
    `/PieceInfo << /AplicacionFicticia << /LastModified ${cadena(f.captura.pdf)}` +
    ` /Private << /Origen ${cadena(registro.agregar(ficha.ruta))} >> >> >>`;

  if (conRevisiones) {
    objeto(1, "<< /Type /Catalog /Pages 2 0 R /Metadata 7 0 R >>");
  } else if (firmado) {
    objeto(
      1,
      "<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [7 0 R] /SigFlags 3 >> >>",
    );
  } else {
    objeto(1, "<< /Type /Catalog /Pages 2 0 R >>");
  }
  objeto(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  objeto(
    3,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R" +
      " /Resources << /Font << /F1 5 0 R >> >>" +
      (conRevisiones ? ` /Annots [8 0 R] /Thumb 10 0 R ${pieceInfo()}` : "") +
      (firmado ? " /Annots [7 0 R]" : "") +
      " >>",
  );
  objeto(4, flujo("", contenido));
  objeto(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objeto(6, diccionarioInfo(info));

  let tamano = 7;
  if (conRevisiones) {
    const xmp = xmpDelDocumento(ficha, registro, 1);
    objeto(7, flujo("/Type /Metadata /Subtype /XML", xmp));
    // Anotación de texto con OTRA persona como autora del comentario.
    objeto(
      8,
      `<< /Type /Annot /Subtype /Text /Rect [100 100 120 120] /P 3 0 R /Open false` +
        ` /T ${cadena(registro.agregar(ficha.comentarista.completo))}` +
        ` /Contents ${cadena(registro.agregar(ficha.comentario))} /M ${cadena(f.captura.pdf)} >>`,
    );
    // Comentario huérfano: nadie lo referencia y la 2.ª revisión lo libera, pero sus bytes quedan.
    objeto(
      9,
      `<< /Type /Annot /Subtype /Text /Rect [200 200 220 220]` +
        ` /T ${cadena(registro.agregar(ficha.revisor.completo))}` +
        ` /Contents ${cadena(registro.agregar(ficha.comentarioRetirado))} >>`,
    );
    // Miniatura de la página: una imagen RGB de 4×4 con las bandas de color.
    const miniatura = Buffer.alloc(48);
    for (let i = 0; i < 16; i++) miniatura.set([200, 40, 40], 3 * i);
    objeto(
      10,
      flujo(
        "/Type /XObject /Subtype /Image /Width 4 /Height 4 /ColorSpace /DeviceRGB /BitsPerComponent 8",
        miniatura,
      ),
    );
    tamano = 11;
  } else if (perfil === "cifrado") {
    // La estructura de /Encrypt (RC4 de 128 bits, R3) con O y U arbitrarios: Velo la detecta; no abre.
    objeto(
      7,
      `<< /Filter /Standard /V 2 /R 3 /Length 128 /P -3904 /O <${ficha.propietarioDeLaClave}> /U <${ficha.verificadorDeClave}> >>`,
    );
    tamano = 8;
  } else if (firmado) {
    objeto(
      7,
      "<< /Type /Annot /Subtype /Widget /FT /Sig /T (Firma1) /Rect [0 0 0 0] /F 132 /P 3 0 R /V 8 0 R >>",
    );
    objeto(
      8,
      `<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached ${byteRange(0, 0, 0)}` +
        ` /Contents <${"0".repeat(LARGO_DE_LA_FIRMA_EN_HEX)}>` +
        ` /M ${cadena(f.captura.pdf)} /Name ${cadena(registro.agregar(ficha.propietario.completo))}` +
        ` /Reason (Aprobacion del documento sintetico)` +
        ` /Location ${cadena(registro.agregar(ficha.municipio))}` +
        ` /ContactInfo ${cadena(registro.agregar(ficha.correo))} >>`,
    );
    tamano = 9;
  }

  // ── xref y trailer de la revisión 1 ──
  const xref1 = escritor.largo;
  const numeros = [...Array(tamano).keys()].slice(1);
  escritor.escribir(
    tablaXref([
      {
        inicio: 0,
        entradas: [
          CABECERA_LIBRE,
          ...numeros.map((n) => ({
            desplazamiento: desplazamientos.get(n),
            generacion: 0,
          })),
        ],
      },
    ]),
  );
  const idUno = `/ID [<${registro.agregar(ficha.idA)}> <${ficha.idA}>]`;
  escritor.escribir(
    `trailer\n<< /Size ${tamano} /Root 1 0 R /Info 6 0 R${perfil === "cifrado" ? " /Encrypt 7 0 R" : ""} ${idUno} >>\n` +
      `startxref\n${xref1}\n%%EOF\n`,
  );

  // ── Revisión 2: actualización incremental, solo en `con-revisiones` ──
  if (conRevisiones) {
    const nuevos = new Map();
    const reemplazar = (numero, cuerpo) =>
      nuevos.set(numero, escritor.objeto(numero, cuerpo));
    reemplazar(
      1,
      "<< /Type /Catalog /Pages 2 0 R /Metadata 7 0 R /Lang (es-CO) /PageMode /UseNone >>",
    );
    reemplazar(
      6,
      diccionarioInfo({
        ...info,
        autor: registro.agregar(ficha.autorPdfDos),
        productor: registro.agregar(ficha.productorDos),
        modificacion: registro.agregar(f.modificada.pdf),
      }),
    );
    reemplazar(
      7,
      flujo(
        "/Type /Metadata /Subtype /XML",
        xmpDelDocumento(ficha, registro, 2),
      ),
    );
    registro.agregar(ficha.cedulaDelPropietario);

    const xref2 = escritor.largo;
    escritor.escribir(
      tablaXref([
        // 0 apunta ahora al primer objeto libre (el 9); 1 es el Catálogo nuevo.
        {
          inicio: 0,
          entradas: [
            { libre: true, siguiente: 9, generacion: 65535 },
            { desplazamiento: nuevos.get(1), generacion: 0 },
          ],
        },
        {
          inicio: 6,
          entradas: [
            { desplazamiento: nuevos.get(6), generacion: 0 },
            { desplazamiento: nuevos.get(7), generacion: 0 },
          ],
        },
        // El comentario huérfano pasa a libre: generación + 1 y fin de la lista de libres.
        { inicio: 9, entradas: [{ libre: true, siguiente: 0, generacion: 1 }] },
      ]),
    );
    escritor.escribir(
      `trailer\n<< /Size ${tamano} /Root 1 0 R /Info 6 0 R /Prev ${xref1} /ID [<${ficha.idA}> <${registro.agregar(ficha.idB)}>] >>\n` +
        `startxref\n${xref2}\n%%EOF\n`,
    );
  }

  const bytes = escritor.bytes();

  // ── Firma: ahora que se conoce el archivo, el ByteRange exacto ──
  if (firmado) {
    const marcador = Buffer.from("/Contents <", "latin1");
    const abre = bytes.indexOf(marcador) + marcador.length - 1; // posición del «<»
    const cierra = abre + 1 + LARGO_DE_LA_FIRMA_EN_HEX; // posición del «>»
    const despues = cierra + 1;
    const rango = Buffer.from(
      byteRange(abre, despues, bytes.length - despues),
      "latin1",
    );
    const lugar = bytes.indexOf(Buffer.from(byteRange(0, 0, 0), "latin1"));
    rango.copy(bytes, lugar);
  }

  return {
    bytes,
    centinelas: registro.lista,
    detalle: {
      autor: ficha.autor.completo,
      autorDeLaRevisionDos: conRevisiones ? ficha.propietario.completo : null,
      cedula: ficha.cedula,
      correo: ficha.correo,
      perfil,
      revisiones: conRevisiones ? 2 : 1,
    },
  };
}
