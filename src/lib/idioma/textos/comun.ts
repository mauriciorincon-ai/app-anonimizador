// Lo que todas las pantallas comparten: el marco de la página, el sello y el conmutador de idioma.
//
// GLOSARIO — las palabras que mantienen las dos versiones del producto hablando de lo mismo. Cada
// catálogo lo sigue; si una palabra de aquí cambia, cambia en todos o en ninguno.
//
//   bóveda            vault              (el archivo `.velo` con los valores originales, cifrado)
//   bitácora          log                (el archivo `.velolog`; «la bitácora» = «the log»)
//   frase de paso     passphrase
//   llave             key                (la llave del proyecto = the project key)
//   sal               salt
//   huella            fingerprint        (SHA-256 del archivo o de la política)
//   tratamiento       treatment          (lo que se le hizo al archivo; «processing» solo si cita la ley)
//   política          policy
//   seudónimo         pseudonym          (seudonimizar = pseudonymize)
//   regreso           return             (la pantalla donde se restauran los valores reales)
//   taller            workshop           (la pantalla donde se decide qué se le hace a cada columna)
//   diagnóstico       diagnosis          (la pantalla donde se ve qué hay en la tabla)
//   aduana            customs checkpoint
//   identificador directo / cuasi-identificador / dato sensible / no personal
//                     direct identifier / quasi-identifier / sensitive data / not personal
//   riesgo exacto     exact risk         (clases de equivalencia sobre el archivo)
//   estimado          estimated          (SIEMPRE etiquetado: regla dura nº4)
//   certificado       certificate
//
// Tono: el mismo en los dos idiomas — llano, directo, sin jerga que el usuario no pidió, y sin
// prometer lo que Velo no puede cumplir (regla dura nº4). El inglés se redacta, no se calca: donde
// una frase en español pide dos oraciones en inglés, son dos oraciones.

import type { Catalogo } from "../index";

export const COMUN = {
  documento: {
    titulo: {
      es: "Velo — la aduana de tus datos",
      en: "Velo — the customs checkpoint for your data",
    },
    descripcion: {
      es:
        "Anonimiza y des-anonimiza tus tablas antes de entregarlas. Todo ocurre dentro de tu " +
        "navegador: tus datos no suben a ningún servidor, ni al nuestro.",
      en:
        "Anonymize your tables before you hand them over, and restore them afterwards. " +
        "Everything happens inside your browser: your data never goes up to any server, " +
        "including ours.",
    },
  },
  saltar: {
    es: "Saltar al contenido",
    en: "Skip to content",
  },
  pie: {
    lema: {
      es: "Velo para entregar. Desvelo para recuperar.",
      en: "Veil it to hand it over. Unveil it to get it back.",
    },
    honestidad: {
      es:
        "Velo mide el riesgo de reidentificación y lo muestra tal como es. Reducir ese riesgo no " +
        "es lo mismo que eliminarlo: ninguna técnica de anonimización lo lleva a cero, y esta " +
        "herramienta no dice lo contrario.",
      en:
        "Velo measures re-identification risk and shows it as it is. Reducing that risk is not " +
        "the same as removing it: no anonymization technique takes it to zero, and this tool " +
        "does not claim otherwise.",
    },
  },
  sello: {
    compacto: {
      es: "Nada sale de este navegador",
      en: "Nothing leaves this browser",
    },
    titulo: {
      es: "Nada sale de este navegador.",
      en: "Nothing leaves this browser.",
    },
    detalle: {
      es:
        "El archivo se abre aquí mismo, en esta pestaña y en un hilo aparte. No hay subida, no " +
        "hay servidor que lo reciba y no queda copia cuando cierras.",
      en:
        "Your file opens right here, in this tab and on a separate thread. There is no upload, " +
        "no server to receive it, and no copy is left behind when you close the tab.",
    },
  },
  // Frases cortas que el formateo de números necesita (`src/lib/formato.ts`). Viven aquí porque son
  // texto: un «de» entre dos cifras o el espacio antes del signo de porcentaje cambian con el idioma.
  formato: {
    porcentaje: { es: "{valor} %", en: "{valor}%" },
    menosDeUnDecimo: { es: "menos de 0,1 %", en: "under 0.1%" },
    deCada: { es: "{parte} de {total}", en: "{parte} of {total}" },
    unoEn: { es: "1 en {n}", en: "1 in {n}" },
  },
  conmutador: {
    // Este nombre es BILINGÜE a propósito: quien llegó a una pantalla que no entiende tiene que
    // poder reconocer dónde se cambia el idioma sin leerla.
    grupo: {
      es: "Idioma · Language",
      en: "Idioma · Language",
    },
  },
} as const satisfies Catalogo;
