// El ruido con garantía (S7): lo que la pantalla y el certificado dicen después de transformar.
//
// Las dos caras se redactan, no se traducen. Reglas que este texto no puede romper: toda cifra de
// privacidad lleva su ε y su ALCANCE (por valor de un campo, no del archivo); nada se llama
// «garantizado» (el copy prohibido lo vigila en los dos idiomas); la perturbación simple se rotula
// «sin garantía formal» siempre; el k y ε no se suman, y se dice.

export const PRIVACIDAD = {
  etiqueta: { es: "Ruido con garantía", en: "Noise with a guarantee" },
  titulo: {
    es: "Privacidad diferencial local",
    en: "Local differential privacy",
  },
  intro: {
    es:
      "Cada valor de estas columnas recibió ruido de una distribución exacta. **ε mide cuánto " +
      "puede saber de UN valor de UN campo quien ve el archivo**: a menor ε, más protección y más " +
      "ruido. Lo que ε no cubre: las demás columnas; el k, que se mide aparte y no se suma con ε; " +
      "y las entregas repetidas: cada archivo distinto que entregues con los mismos datos gasta su " +
      "propio ε, y los ε se suman.",
    en:
      "Each value in these columns received noise from an exact distribution. **ε measures how " +
      "much someone who sees the file can learn about ONE value of ONE field**: the lower the ε, " +
      "the more protection and the more noise. What ε does not cover: the other columns; k, which " +
      "is measured apart and does not add up with ε; and repeated deliveries: each different file " +
      "you hand over with the same data spends its own ε, and the ε add up.",
  },
  porFila: {
    es: "ε por fila: **{epsilon}**, la suma de las columnas con ε (así se componen).",
    en: "ε per row: **{epsilon}**, the sum over the columns with ε (that is how they compose).",
  },
  // Sin ninguna columna con ε (solo perturbación, o una técnica con ε que no se pudo aplicar), el
  // panel no se llama «privacidad diferencial» ni habla de ε: no hay ninguno que leer.
  sinEpsilon: {
    etiqueta: {
      es: "Ruido sin garantía formal",
      en: "Noise with no formal guarantee",
    },
    titulo: { es: "Sin privacidad diferencial", en: "No differential privacy" },
    intro: {
      es:
        "**Ninguna columna de este archivo lleva privacidad diferencial**, así que aquí no hay un ε " +
        "que leer. La perturbación porcentual mueve cada número al azar, sin una garantía formal: " +
        "no promete nada medible. Una técnica con ε que no se pudo aplicar dejó su columna " +
        "intacta, y su fila lo dice. El k se mide aparte, en el balance.",
      en:
        "**No column in this file carries differential privacy**, so there is no ε to read here. " +
        "Percentage perturbation moves each number at random, with no formal guarantee: it " +
        "promises nothing measurable. A technique with ε that could not be applied left its " +
        "column untouched, and its row says so. k is measured apart, in the balance.",
    },
    fuente: {
      es:
        "El azar sale de la llave del proyecto: el mismo archivo con la misma llave y la misma " +
        "técnica da el mismo ruido, y no se puede promediar; otro porcentaje da otro ruido, " +
        "independiente.",
      en:
        "The randomness comes from the project key: the same file with the same key and the same " +
        "technique gets the same noise, and it cannot be averaged away; another percentage gets " +
        "other noise, independent.",
    },
  },
  encabezados: {
    columna: { es: "Columna", en: "Column" },
    mecanismo: { es: "Mecanismo", en: "Mechanism" },
    epsilon: { es: "ε (efectivo)", en: "ε (effective)" },
    celdas: { es: "Celdas con ruido", en: "Cells with noise" },
    notas: { es: "Notas", en: "Notes" },
  },
  mecanismos: {
    laplace: { es: "Laplace discreto", en: "Discrete Laplace" },
    "respuesta-aleatorizada": {
      es: "Respuesta aleatorizada",
      en: "Randomized response",
    },
    perturbar: {
      es: "Perturbación porcentual, sin garantía formal",
      en: "Percentage perturbation, no formal guarantee",
    },
  },
  efectivo: {
    es: "{efectivo} (pedido: {pedido})",
    en: "{efectivo} (asked: {pedido})",
  },
  sinGarantia: { es: "sin ε", en: "no ε" },
  notas: {
    recortes: {
      es: "{n} fuera del rango declarado, recortadas antes del ruido",
      en: "{n} outside the declared range, clipped before the noise",
    },
    noNumericas: {
      es: "{n} sin un número, intactas",
      en: "{n} without a number, untouched",
    },
    dominio: {
      es: "dominio de {n} valores, sacado del archivo: aparecer en él no está protegido por ε",
      en: "a domain of {n} values, taken from the file: appearing in it is not protected by ε",
    },
    noAplicada: {
      es: "no se aplicó: {n} valores distintos, más de {maximo}; la columna salió intacta",
      en: "not applied: {n} distinct values, more than {maximo}; the column came out untouched",
    },
    // Alto volumen (S8): la columna no cupo entera, y solo se sabe que pasa de {n}.
    noAplicadaAlMenos: {
      es: "no se aplicó: más de {n} valores distintos (son más de {maximo}); la columna salió intacta",
      en: "not applied: more than {n} distinct values (over {maximo}); the column came out untouched",
    },
  },
  fuente: {
    es:
      "Muestreo exacto, sin coma flotante: Canonne, Kamath y Steinke, «The Discrete Gaussian for " +
      "Differential Privacy», NeurIPS 2020 (algoritmos 1 y 2). El azar sale de la llave del " +
      "proyecto: el mismo archivo con la misma llave y la misma técnica da el mismo ruido, y no se " +
      "puede promediar; otro ε u otro rango da otro ruido, independiente.",
    en:
      "Exact sampling, with no floating point: Canonne, Kamath and Steinke, “The Discrete " +
      "Gaussian for Differential Privacy”, NeurIPS 2020 (algorithms 1 and 2). The randomness comes " +
      "from the project key: the same file with the same key and the same technique gets the " +
      "same noise, and it cannot be averaged away; another ε or range gets other noise, " +
      "independent.",
  },
} as const;
