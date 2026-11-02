// Los informes de mentira de las pruebas de metadatos (S6): un PDF, una foto y un archivo sin nada.
//
// Todo es SINTÉTICO y está escrito a mano con la forma exacta de lo que cruza el worker: nombres de
// campo, valores YA enmascarados, conteos y tamaños. Ningún dato real (regla dura nº5), y ningún
// valor completo — que es justo lo que una pantalla de metadatos no puede recibir (regla dura nº7).

import { mensaje } from "@/lib/idioma";
import type { InformeDeMetadatos, ResumenDeLimpieza } from "@/workers/contrato";

export const HUELLA_DEL_PDF = "a".repeat(64);
export const HUELLA_DE_LA_FOTO = "c".repeat(64);
export const HUELLA_LIMPIA = "b".repeat(64);

export const INFORME_PDF: InformeDeMetadatos = {
  archivo: {
    nombre: "informe-trimestral.pdf",
    bytes: 2_400_000,
    formato: "pdf",
    sha256: HUELLA_DEL_PDF,
  },
  metadatos: {
    campos: [
      {
        clave: "Author",
        origen: "pdf-info",
        revela: "autoria",
        muestra: "Ana Pér***",
        deteccion: null,
      },
      {
        clave: "Author",
        origen: "pdf-revision-anterior",
        revela: "autoria",
        muestra: "Luc***",
        deteccion: null,
      },
      {
        clave: "Subject",
        origen: "pdf-info",
        revela: "descripcion",
        // Un nombre y una cédula en el mismo valor: la cédula está DENTRO, no es el valor entero.
        muestra: "Ana Pér*** · CC 103***89",
        deteccion: {
          tipo: "cedula",
          etiqueta: mensaje("validador.cedula.etiqueta"),
          certeza: "estructural",
          categoria: "identificador-directo",
          dentro: true,
        },
      },
      {
        clave: "Producer",
        origen: "pdf-info",
        revela: "software",
        muestra: "Editor de ejemplo 4.***",
        deteccion: null,
      },
      {
        clave: "xmpMM:DocumentID",
        origen: "pdf-xmp",
        revela: "identificador",
        muestra: "uuid:1b4e28ba-2fa1-***",
        deteccion: null,
      },
    ],
    otrasEtiquetas: 0,
    quitables: [
      { clase: "pdf-info", marcador: "/Info", bytes: null, cuantos: 1 },
      { clase: "pdf-xmp", marcador: "/Metadata", bytes: 3_210, cuantos: 1 },
      {
        clase: "pdf-revisiones",
        marcador: "startxref",
        bytes: 18_000,
        cuantos: 2,
      },
    ],
    conservables: [],
    avisos: [
      { clave: "pdf-firmado" },
      { clave: "pdf-anotaciones", n: 3 },
      { clave: "pdf-adjuntos" },
      { clave: "pdf-flujos-de-objetos" },
    ],
    revisiones: { revisiones: 3, objetosRedefinidos: 7, conId: true },
  },
  medicion: { msLectura: 120, msDiagnostico: 30, heapMb: null },
};

export const INFORME_FOTO: InformeDeMetadatos = {
  archivo: {
    nombre: "fachada.jpg",
    bytes: 5_100_000,
    formato: "jpeg",
    sha256: HUELLA_DE_LA_FOTO,
  },
  metadatos: {
    campos: [
      {
        clave: "Make",
        origen: "exif",
        revela: "dispositivo",
        muestra: "Cámara de ej***",
        deteccion: null,
      },
      {
        clave: "GPSLatitude",
        origen: "gps",
        revela: "ubicacion",
        muestra: "4.71***",
        deteccion: {
          tipo: "coordenada",
          etiqueta: mensaje("validador.coordenada.etiqueta"),
          certeza: "estructural",
          categoria: "cuasi-identificador",
          dentro: false,
        },
      },
      {
        clave: "DateTimeOriginal",
        origen: "exif",
        revela: "fecha",
        muestra: "2026:03:***",
        deteccion: null,
      },
    ],
    otrasEtiquetas: 14,
    quitables: [
      { clase: "exif", marcador: "APP1 (Exif)", bytes: 11_400, cuantos: 1 },
      { clase: "xmp", marcador: "APP1 (XMP)", bytes: 4_096, cuantos: 1 },
      { clase: "miniatura", marcador: "EXIF IFD1", bytes: 9_800, cuantos: 1 },
    ],
    conservables: [
      {
        clase: "perfil-de-color",
        marcador: "APP2 (ICC)",
        bytes: 3_144,
        cuantos: 1,
      },
      { clase: "orientacion", marcador: "APP1 (Exif)", bytes: 36, cuantos: 1 },
    ],
    avisos: [
      { clave: "orientacion-conservada" },
      { clave: "extension-distinta" },
    ],
    revisiones: null,
  },
  medicion: { msLectura: 40, msDiagnostico: 8, heapMb: 64 },
};

/** Un archivo que no declara nada con nombre, y que aun así la limpieza va a pasar por la lista blanca. */
export const INFORME_SIN_CAMPOS: InformeDeMetadatos = {
  archivo: {
    nombre: "limpio.png",
    bytes: 800,
    formato: "png",
    sha256: "d".repeat(64),
  },
  metadatos: {
    campos: [],
    otrasEtiquetas: 1,
    quitables: [],
    conservables: [],
    avisos: [],
    revisiones: null,
  },
  medicion: { msLectura: 3, msDiagnostico: 1, heapMb: null },
};

export const RESUMEN_PDF: ResumenDeLimpieza = {
  formato: "pdf",
  quitados: [
    { clase: "pdf-info", marcador: "/Info", bytes: null, cuantos: 1 },
    { clase: "pdf-xmp", marcador: "/Metadata", bytes: 3_210, cuantos: 1 },
    {
      clase: "pdf-revisiones",
      marcador: "startxref",
      bytes: 18_000,
      cuantos: 2,
    },
  ],
  conservados: [],
  campos: 5,
  revisionesQuitadas: 2,
  idNuevo: "0123456789abcdef0123456789abcdef",
  poscomprobacion: { campos: 0, revisiones: 1 },
  sha256: HUELLA_LIMPIA,
  bytes: 2_300_000,
  ms: 410,
};

export const RESUMEN_FOTO: ResumenDeLimpieza = {
  formato: "jpeg",
  quitados: [
    { clase: "exif", marcador: "APP1 (Exif)", bytes: 11_400, cuantos: 1 },
    { clase: "xmp", marcador: "APP1 (XMP)", bytes: 4_096, cuantos: 1 },
    { clase: "texto", marcador: "tEXt", bytes: 300, cuantos: 2 },
  ],
  conservados: [
    { clase: "orientacion", marcador: "APP1 (Exif)", bytes: 36, cuantos: 1 },
  ],
  campos: 3,
  revisionesQuitadas: 0,
  idNuevo: null,
  poscomprobacion: { campos: 0, revisiones: null },
  sha256: HUELLA_LIMPIA,
  bytes: 5_070_000,
  ms: 90,
};
