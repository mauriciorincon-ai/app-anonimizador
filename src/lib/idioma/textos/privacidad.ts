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
  sinEpsilon: {
    es: "Ninguna columna lleva privacidad diferencial: lo que hay es perturbación, sin garantía formal.",
    en: "No column carries differential privacy: what there is is perturbation, with no formal guarantee.",
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
      es: "Perturbación ±%, sin garantía formal",
      en: "±% perturbation, no formal guarantee",
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
  },
  fuente: {
    es:
      "Muestreo exacto, sin coma flotante: Canonne, Kamath y Steinke, «The Discrete Gaussian for " +
      "Differential Privacy», NeurIPS 2020 (algoritmos 1 y 2). El azar sale de la llave del " +
      "proyecto: el mismo archivo con la misma llave da el mismo ruido, y no se puede promediar.",
    en:
      "Exact sampling, with no floating point: Canonne, Kamath and Steinke, “The Discrete " +
      "Gaussian for Differential Privacy”, NeurIPS 2020 (algorithms 1 and 2). The randomness comes " +
      "from the project key: the same file with the same key gets the same noise, and it cannot " +
      "be averaged away.",
  },
} as const;
