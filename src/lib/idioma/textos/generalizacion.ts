// «Cómo llegar al k» (S7): Mondrian y la generalización óptima, lado a lado, en el taller.
//
// Las dos caras se redactan, no se traducen. Reglas que este texto no puede romper: ninguna cifra de
// aquí es «del archivo entero» (se mide sobre las columnas del reparto, y se dice); nada promete
// anonimato; el color nunca va solo (cada veredicto lleva su símbolo y su palabra).

export const GENERALIZACION = {
  titulo: { es: "Cómo llegar al k", en: "How to reach k" },
  explicacion: {
    es:
      "Hay dos caminos. **Mondrian** corta el archivo por regiones y generaliza distinto en cada " +
      "una: es rápido y pierde poco donde hay muchos datos. **La generalización óptima** sube cada " +
      "columna por su escalera —edad en quinquenios, municipio en departamentos— **igual en todo " +
      "el archivo**, y de todas las combinaciones elige la que cumple k perdiendo menos " +
      "información. Compáralas y elige.",
    en:
      "There are two roads. **Mondrian** cuts the file into regions and generalizes each one " +
      "differently: it is fast and loses little where there is a lot of data. **The optimal " +
      "generalization** moves each column up its own ladder —age into five-year groups, " +
      "municipality into departments— **the same across the whole file**, and out of every " +
      "combination it picks the one that meets k losing the least information. Compare them and " +
      "choose.",
  },
  algoritmo: {
    leyenda: { es: "El camino", en: "The road" },
    mondrian: {
      es: "Mondrian (el de siempre)",
      en: "Mondrian (the usual one)",
    },
    optima: {
      es: "La generalización óptima",
      en: "The optimal generalization",
    },
  },
  escaleras: {
    titulo: {
      es: "La escalera de cada columna",
      en: "Each column's ladder",
    },
    nota: {
      es:
        "La propuesta sale del tipo y del nombre de la columna; cámbiala si no encaja. Las de " +
        "fábrica usan fuentes oficiales —el DANE, y la Ley 2056 de 2020 para las regiones—, con " +
        "su fuente y su fecha en el certificado.",
      en:
        "The suggestion comes from the column's type and name; change it if it does not fit. The " +
        "built-in ones use official sources —DANE, and Ley 2056 de 2020 for the regions—, with " +
        "their source and date in the certificate.",
    },
    aria: {
      es: "Escalera de generalización para la columna {columna}",
      en: "Generalization ladder for the column {columna}",
    },
    // Las opciones: lo que cada una hace, en una línea.
    opciones: {
      "rango-5": {
        es: "Rangos de 5, 10, 20 y 40",
        en: "Ranges of 5, 10, 20 and 40",
      },
      "rango-10": {
        es: "Rangos de 10, 100, 1.000 y 10.000",
        en: "Ranges of 10, 100, 1,000 and 10,000",
      },
      fecha: {
        es: "Fecha: mes, trimestre, año",
        en: "Date: month, quarter, year",
      },
      prefijo: {
        es: "Primeros 3, 2 y 1 caracteres",
        en: "First 3, 2 and 1 characters",
      },
      supresion: {
        es: "Solo el valor o nada",
        en: "The value or nothing",
      },
      divipola: {
        es: "Municipio, departamento, región (DIVIPOLA, DANE)",
        en: "Municipality, department, region (DIVIPOLA, DANE)",
      },
      "edad-dane": {
        es: "Edad: quinquenios, grandes grupos (DANE)",
        en: "Age: five-year groups, broad groups (DANE)",
      },
      ciiu: {
        es: "Actividad económica: grupo, división, sección (CIIU, DANE)",
        en: "Economic activity: group, division, section (CIIU, DANE)",
      },
      propia: {
        es: "La de la política importada",
        en: "The one in the imported policy",
      },
    },
  },
  diversidad: {
    etiqueta: {
      es: "ℓ distinta (opcional) sobre {columnas}",
      en: "Distinct ℓ (optional) over {columnas}",
    },
    nota: {
      es:
        "Pide que en cada grupo haya al menos ℓ valores distintos del dato sensible, para que " +
        "estar en el grupo no lo delate. Solo la generalización óptima lo exige; de Mondrian se " +
        "mide.",
      en:
        "Asks that every group holds at least ℓ different values of the sensitive data, so " +
        "being in the group does not give it away. Only the optimal generalization enforces it; " +
        "for Mondrian it is measured.",
    },
  },
  comparar: { es: "Comparar los dos caminos", en: "Compare the two roads" },
  comparando: { es: "Comparando…", en: "Comparing…" },
  fallo: {
    es: "No se pudo comparar. Revisa que haya columnas en el reparto y un k fijado.",
    en: "The comparison could not be made. Check that there are columns in the partition and a k set.",
  },
  tabla: {
    titulo: {
      es: "Los dos caminos, lado a lado",
      en: "The two roads, side by side",
    },
    alcance: {
      es:
        "Medido sobre las columnas del reparto ({columnas}), no sobre el archivo entero: el " +
        "balance completo llega al transformar.",
      en:
        "Measured over the columns of the partition ({columnas}), not over the whole file: the " +
        "full balance arrives when you transform.",
    },
    // La ℓ pedida sobre una sensible que la política suprime: el archivo no la lleva, así que no hay
    // diversidad que exigir sobre ella. Se dice, para que nadie crea que la ℓ se cumplió.
    lDescartadas: {
      es:
        "La ℓ no se exige sobre {columnas}: la política suprime esa columna y el archivo no la " +
        "lleva.",
      en:
        "ℓ is not required over {columnas}: the policy suppresses that column and the file " +
        "does not carry it.",
    },
    encabezados: {
      medida: { es: "Medida", en: "Measure" },
      mondrian: { es: "Mondrian", en: "Mondrian" },
      optima: { es: "Óptima", en: "Optimal" },
    },
    filas: {
      cumple: {
        es: "¿Llega al k pedido ({k})?",
        en: "Does it reach the k asked for ({k})?",
      },
      k: { es: "Grupo más pequeño (k)", en: "Smallest group (k)" },
      // La comparación mide la ℓ sobre los valores ORIGINALES de la sensible (no usa la llave); el
      // certificado la mide sobre los del archivo, que pueden llevar una técnica. Se dice aquí.
      l: {
        es: "ℓ distinta, sobre los valores originales (pedida: {l})",
        en: "Distinct ℓ, over the original values (asked: {l})",
      },
      clases: { es: "Grupos distintos", en: "Distinct groups" },
      unicos: {
        es: "Registros solos en su grupo",
        en: "Records alone in their group",
      },
      riesgo: { es: "Riesgo del más expuesto", en: "Risk of the most exposed" },
      bits: {
        es: "Información que queda (bits)",
        en: "Information left (bits)",
      },
      nodos: {
        es: "Combinaciones revisadas",
        en: "Combinations checked",
      },
      tiempo: {
        es: "Tiempo de cálculo",
        en: "Calculation time",
      },
    },
    si: { es: "Sí", en: "Yes" },
    no: { es: "No", en: "No" },
    noDisponible: {
      es: "Sin calcular: la retícula pasa del tope",
      en: "Not computed: the lattice is over the limit",
    },
    deCuantas: { es: "{n} de {total}", en: "{n} of {total}" },
    deBits: { es: "{despues} de {antes}", en: "{despues} of {antes}" },
    columna: { es: "Cómo queda {columna}", en: "How {columna} ends up" },
    local: { es: "cortes locales", en: "local cuts" },
    distintos: { es: "{n} valores", en: "{n} values" },
  },
  // La clave de cada nivel, dicha. `rango-N` y `prefijo-N` se arman con el número.
  niveles: {
    valor: { es: "sin generalizar", en: "not generalized" },
    suprimido: { es: "suprimido (*)", en: "suppressed (*)" },
    mes: { es: "mes", en: "month" },
    trimestre: { es: "trimestre", en: "quarter" },
    anio: { es: "año", en: "year" },
    departamento: { es: "departamento", en: "department" },
    region: { es: "región", en: "region" },
    quinquenio: { es: "quinquenio", en: "five-year group" },
    "gran-grupo": { es: "gran grupo de edad", en: "broad age group" },
    grupo: { es: "grupo CIIU", en: "ISIC group" },
    division: { es: "división CIIU", en: "ISIC division" },
    seccion: { es: "sección CIIU", en: "ISIC section" },
    rango: { es: "rangos de {n}", en: "ranges of {n}" },
    prefijo: { es: "primeros {n} caracteres", en: "first {n} characters" },
  },
} as const;
