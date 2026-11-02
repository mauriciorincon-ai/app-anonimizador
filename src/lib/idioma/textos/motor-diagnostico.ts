// Mensajes del motor — lo que el motor dice al leer la tabla — tipos, evidencias, fuentes, riesgo exacto y estimado.
//
// Cada clave es una frase que el motor o el worker NOMBRAN sin escribir: devuelven
// `mensaje("area.clave", { datos })` y la interfaz, o el documento que se descarga, la convierte en
// texto en el idioma que corresponde. Claves planas con punto (`area.cosa`); los números viajan
// crudos en `datos` y se formatean al decirlos (`{n}` o `{n:2}`), jamás dentro del motor.
//
// El español de aquí es el que ya tenían los motores y las pruebas — se conserva palabra por palabra.
// El inglés se redacta al lado: no se traduce frase a frase si una construcción natural pide otra.
//
// Una `fuente` es una CITA del algoritmo oficial: los nombres propios (DIAN, Registraduría Nacional,
// CRC, ISO/IEC 7812-1, RFC 5322, Zayatz (1991)…) se escriben igual en los dos idiomas; solo la parte
// descriptiva se redacta en inglés. Las unidades matemáticas (`Prob(1_p|1_s)`, μ-ARGUS, NB(f_k, p))
// tampoco se traducen.

import type { Texto } from "../index";

export const MOTOR_DIAGNOSTICO = {
  // ── Tipos que el clasificador adjudica cuando ningún validador alcanza ──────────────────────
  "clasificador.tipo.categoria": {
    es: "Categoría (pocos valores repetidos)",
    en: "Category (few, repeated values)",
  },
  "clasificador.tipo.texto": {
    es: "Texto",
    en: "Text",
  },

  // ── Reglas por nombre de columna: qué patrón coincidió y por qué sube la categoría ──────────
  "clasificador.nombre.salud.patron": {
    es: "nombre relacionado con salud",
    en: "name related to health",
  },
  "clasificador.nombre.salud.nota": {
    es: "Ley 1581 art. 5 — los datos relativos a la salud son sensibles.",
    en: "Colombia's Law 1581 of 2012, art. 5 — data concerning health is sensitive data.",
  },
  "clasificador.nombre.etnico.patron": {
    es: "nombre relacionado con origen étnico",
    en: "name related to ethnic origin",
  },
  "clasificador.nombre.etnico.nota": {
    es: "Ley 1581 art. 5 — el origen racial o étnico es dato sensible.",
    en: "Colombia's Law 1581 of 2012, art. 5 — racial or ethnic origin is sensitive data.",
  },
  "clasificador.nombre.convicciones.patron": {
    es: "nombre relacionado con convicciones, vida sexual o biometría",
    en: "name related to beliefs, sex life or biometrics",
  },
  "clasificador.nombre.convicciones.nota": {
    es: "Ley 1581 art. 5 — convicciones, vida sexual y datos biométricos son sensibles.",
    en: "Colombia's Law 1581 of 2012, art. 5 — beliefs, sex life and biometric data are sensitive data.",
  },
  "clasificador.nombre.direccion.patron": {
    es: "nombre de dirección",
    en: "address name",
  },
  "clasificador.nombre.direccion.nota": {
    es: "Una dirección ubica a la persona; se trata como identificador directo.",
    en: "An address locates the person; it is treated as a direct identifier.",
  },
  "clasificador.nombre.persona.patron": {
    es: "nombre de persona",
    en: "person's name",
  },
  "clasificador.nombre.persona.nota": {
    es: "El encabezado indica que la columna nombra a la persona.",
    en: "The header says the column names the person.",
  },
  "clasificador.nombre.nacimiento.patron": {
    es: "fecha de nacimiento o edad",
    en: "date of birth or age",
  },
  "clasificador.nombre.nacimiento.nota": {
    es: "Fecha de nacimiento + sexo + municipio identifica a buena parte de una población (Sweeney 2000; Golle 2006).",
    en: "Date of birth + sex + municipality identifies a good part of a population (Sweeney 2000; Golle 2006).",
  },
  "clasificador.nombre.demografico.patron": {
    es: "atributo demográfico",
    en: "demographic attribute",
  },
  "clasificador.nombre.demografico.nota": {
    es: "Por sí solo no identifica; combinado con otros, sí.",
    en: "On its own it does not identify anyone; combined with others, it does.",
  },

  // ── Validadores: la etiqueta que se enseña y la cita de la fuente oficial ───────────────────
  "validador.nit.etiqueta": {
    es: "NIT con dígito de verificación",
    en: "NIT with check digit",
  },
  "validador.nit.fuente": {
    es: "DIAN, Orden Administrativa 4 de 1989 — pesos primos, módulo 11",
    en: "DIAN, Administrative Order 4 of 1989 — prime weights, modulo 11",
  },
  "validador.cedula.etiqueta": {
    es: "Cédula de ciudadanía (formato)",
    en: "Colombian ID card, cédula (format)",
  },
  "validador.cedula.fuente": {
    es:
      "Registraduría Nacional — NUIP de 10 dígitos desde 1.000.000.000; series históricas ≤ 8 " +
      "dígitos. No existe dígito de verificación público: la validación es estructural.",
    en:
      "Registraduría Nacional — 10-digit NUIP from 1,000,000,000; historical series of up to 8 " +
      "digits. There is no public check digit: validation is structural.",
  },
  "validador.celularCo.etiqueta": {
    es: "Celular colombiano",
    en: "Colombian mobile number",
  },
  "validador.celularCo.fuente": {
    es: "CRC — numeración unificada a 10 dígitos (1-dic-2021); móviles inician por 3",
    en: "CRC — unified 10-digit numbering (Dec 1, 2021); mobile numbers start with 3",
  },
  "validador.fijoCo.etiqueta": {
    es: "Teléfono fijo colombiano",
    en: "Colombian landline",
  },
  "validador.fijoCo.fuente": {
    es: "CRC — numeración unificada a 10 dígitos: 60 + indicativo regional + 7 dígitos",
    en: "CRC — unified 10-digit numbering: 60 + regional area code + 7 digits",
  },
  "validador.placaCo.etiqueta": {
    es: "Placa de vehículo colombiana",
    en: "Colombian vehicle plate",
  },
  "validador.placaCo.fuente": {
    es: "Formato oficial de matrículas de Colombia — carro ABC123, moto ABC12D",
    en: "Official Colombian plate format — car ABC123, motorcycle ABC12D",
  },
  "validador.tarjeta.etiqueta": {
    es: "Tarjeta de pago (Luhn)",
    en: "Payment card (Luhn)",
  },
  "validador.tarjeta.fuente": {
    es: "Algoritmo de Luhn, módulo 10 — ISO/IEC 7812-1",
    en: "Luhn algorithm, modulo 10 — ISO/IEC 7812-1",
  },
  "validador.iban.etiqueta": {
    es: "Cuenta bancaria IBAN",
    en: "IBAN bank account",
  },
  "validador.iban.fuente": {
    es: "ISO 13616 con checksum mod 97-10 de ISO 7064",
    en: "ISO 13616 with the mod 97-10 checksum of ISO 7064",
  },
  "validador.email.etiqueta": {
    es: "Correo electrónico",
    en: "Email address",
  },
  "validador.email.fuente": {
    es: "Forma habitual del RFC 5322 (validación estructural, no checksum)",
    en: "Common form of RFC 5322 (structural validation, not a checksum)",
  },
  "validador.ip.etiqueta": {
    es: "Dirección IP",
    en: "IP address",
  },
  "validador.ip.fuente": {
    es: "IPv4 decimal punteada (RFC 791) — rango exacto por octeto",
    en: "Dotted-decimal IPv4 (RFC 791) — exact range per octet",
  },
  "validador.coordenada.etiqueta": {
    es: "Coordenada geográfica",
    en: "Geographic coordinate",
  },
  "validador.coordenada.fuente": {
    es:
      "Rango definicional común a latitud y longitud: [−180, 180]. No se distingue cuál de las dos " +
      "es, así que no se aplica el rango estrecho de la latitud",
    en:
      "Definitional range shared by latitude and longitude: [−180, 180]. There is no telling which " +
      "of the two a value is, so the narrower latitude range is not applied",
  },
  "validador.fecha.etiqueta": {
    es: "Fecha",
    en: "Date",
  },
  "validador.fecha.fuente": {
    es: "ISO 8601 (AAAA-MM-DD) y formato DD/MM/AAAA; se verifica que la fecha exista",
    en: "ISO 8601 (YYYY-MM-DD) and the DD/MM/YYYY format; the date is checked to actually exist",
  },
  "validador.nombre.etiqueta": {
    es: "Nombre de persona",
    en: "Person's name",
  },
  "validador.nombre.fuente": {
    es:
      "Diccionario de nombres y apellidos de uso corriente en Colombia (léxico, no registro de " +
      "personas). Reconoce lo frecuente; lo infrecuente se le escapa, y por eso el clasificador " +
      "combina esta señal con el nombre de la columna.",
    en:
      "Dictionary of first names and surnames in common use in Colombia (a lexicon, not a register " +
      "of people). It recognizes what is frequent and misses what is rare, which is why the " +
      "classifier combines this signal with the column name.",
  },
  "validador.numero.etiqueta": {
    es: "Número",
    en: "Number",
  },
  "validador.numero.fuente": {
    es: "Forma numérica (sin significado de dominio)",
    en: "Numeric form (no domain meaning)",
  },

  // ── Riesgo exacto: por qué el advisor deja una columna fuera ────────────────────────────────
  "riesgo.excluida.identificadorDirecto": {
    es: "identificador directo: señala a la persona sin ayuda de ninguna otra columna",
    en: "direct identifier: it points to the person without any other column's help",
  },
  "riesgo.excluida.datoSensible": {
    es: "dato sensible (art. 5): es lo que el atacante quiere averiguar, no la llave",
    en: "sensitive data (art. 5): it is what the attacker wants to find out, not the key",
  },
  "riesgo.excluida.unSoloValor": {
    es: "un solo valor distinto: no distingue a nadie",
    en: "a single distinct value: it tells no one apart",
  },
  "riesgo.excluida.fueraDelTope": {
    es: "fuera de las {n} candidatas con más valores distintos",
    en: "outside the {n} candidates with the most distinct values",
  },

  // ── Riesgo estimado: lo que cubre cada intervalo y lo que no ────────────────────────────────
  "riesgoEstimado.cubre.riesgo": {
    es:
      "recoge la incertidumbre del modelo sobre cuántas personas más comparten esos valores en la población. " +
      "NO recoge el error de suponer el modelo: si el archivo no es una muestra aleatoria simple de esa población, el intervalo tampoco vale.",
    en:
      "captures the model's uncertainty about how many more people share those values in the population. " +
      "It does NOT capture the error of assuming the model: if the file is not a simple random sample of that population, the interval does not hold either.",
  },
  "riesgoEstimado.cubre.censoRiesgo": {
    es: "en censo no hay incertidumbre de muestreo: el estimado coincide con el riesgo exacto.",
    en: "in a census there is no sampling uncertainty: the estimated figure matches the exact risk.",
  },
  "riesgoEstimado.cubre.unicos": {
    es:
      "recoge cuáles de tus registros únicos resultan serlo también en la población, bajo el modelo. " +
      "NO recoge el error del método: en la evaluación del propio Zayatz (1991) esta cifra SOBREESTIMA, y tanto más cuanto menor es la fracción de muestreo.",
    en:
      "captures which of your unique records turn out to be unique in the population too, under the model. " +
      "It does NOT capture the method's own error: in Zayatz's own evaluation (1991) this figure OVERESTIMATES, and the more so the smaller the sampling fraction.",
  },
  "riesgoEstimado.cubre.censoUnicos": {
    es: "en censo no hay incertidumbre de muestreo: el estimado coincide con el exacto.",
    en: "in a census there is no sampling uncertainty: the estimated figure matches the exact one.",
  },

  // ── Riesgo estimado: por qué un intervalo no se puede derivar ───────────────────────────────
  "riesgoEstimado.porque.colaLarga": {
    es: "con una fracción de muestreo tan pequeña y una clase tan chica, el modelo reparte la frecuencia poblacional en una cola larguísima y torcida: cualquier banda que Velo dibujara aquí sería más precisa que el conocimiento que la sostiene.",
    en: "with such a small sampling fraction and such a small class, the model spreads the population frequency over a very long, skewed tail: any band Velo drew here would be more precise than the knowledge behind it.",
  },
  "riesgoEstimado.porque.esperanza": {
    es: "es la esperanza del modelo, no una cantidad medida: fijada la fracción de muestreo, su valor es el que es. Lo que puede fallar aquí es el modelo entero, y el error de un modelo no cabe en un intervalo de confianza.",
    en: "it is the model's expected value, not a measured quantity: once the sampling fraction is fixed, its value is what it is. What can fail here is the whole model, and a model's error does not fit inside a confidence interval.",
  },
  "riesgoEstimado.porque.sinUnicos": {
    es: "no hay ni un registro único en el archivo, así que no hay nada de lo que estimar la supervivencia. Ese cero es exacto, no estimado.",
    en: "there is not a single unique record in the file, so there is nothing to estimate the survival of. That zero is exact, not estimated.",
  },
  "riesgoEstimado.porque.pocosUnicos": {
    es: "hay muy pocos registros únicos para que una banda signifique algo: la aproximación normal de la binomial pide al menos 10 de varianza y aquí no llega.",
    en: "there are too few unique records for a band to mean anything: the normal approximation to the binomial needs a variance of at least 10, and here it falls short.",
  },

  // ── Riesgo estimado: por qué no se estimó ───────────────────────────────────────────────────
  "riesgoEstimado.rechazo.archivoVacio": {
    es: "El archivo no tiene filas que medir.",
    en: "The file has no rows to measure.",
  },
  "riesgoEstimado.rechazo.sinPoblacion": {
    es:
      "Ningún estimador poblacional existe sin saber de qué población salió el archivo, y Velo solo ve el archivo. " +
      "Declara cuántas personas tiene la población entera y aparecerá la estimación; el riesgo exacto no depende de este dato.",
    en:
      "No population estimator exists without knowing which population the file came from, and Velo only sees the file. " +
      "Declare how many people the whole population has and the estimate will appear; the exact risk does not depend on this figure.",
  },
  "riesgoEstimado.rechazo.poblacionMenor": {
    es:
      "La población declarada ({poblacion}) es menor que el archivo ({filas} filas). " +
      "O el archivo no sale de esa población, o la cifra está mal escrita.",
    en:
      "The declared population ({poblacion}) is smaller than the file ({filas} rows). " +
      "Either the file does not come from that population, or the figure is mistyped.",
  },
  "riesgoEstimado.rechazo.muestraPequena": {
    es:
      "El archivo es el {pct:2} % de la población declarada, y por debajo del {minimo} % este método deja de servir: en la evaluación del propio " +
      "Zayatz (1991), con una fracción del 1 % las estimaciones llegan a errar por un factor de 10. " +
      "Velo prefiere no dar la cifra a darla débil.",
    en:
      "The file is {pct:2}% of the declared population, and below {minimo}% this method stops being useful: in Zayatz's own evaluation " +
      "(1991), with a 1% fraction the estimates can be off by a factor of 10. " +
      "Velo prefers not to give the figure rather than give a weak one.",
  },

  // ── Riesgo estimado: modelo, supuesto y fuente de cada estimador ────────────────────────────
  "riesgoEstimado.individual.modelo": {
    es: "binomial negativa: F_k | f_k ~ f_k + NB(f_k, p); el riesgo es E[1/F_k | f_k]",
    en: "negative binomial: F_k | f_k ~ f_k + NB(f_k, p); the risk is E[1/F_k | f_k]",
  },
  "riesgoEstimado.individual.supuesto": {
    es: "el archivo es una muestra aleatoria simple de la población declarada, con la misma fracción de muestreo para todas las clases (μ-ARGUS la saca de los pesos de la encuesta; Velo solo ve el archivo)",
    en: "the file is a simple random sample of the declared population, with the same sampling fraction for every class (μ-ARGUS takes it from the survey weights; Velo only sees the file)",
  },
  "riesgoEstimado.individual.fuente": {
    es: "Benedetti & Franconi (1998), el estimador de μ-ARGUS y sdcMicro. Modelo citado literalmente en Rinott & Shlomo (2007), arXiv:0708.0980 §2.2.",
    en: "Benedetti & Franconi (1998), the estimator behind μ-ARGUS and sdcMicro. Model quoted verbatim in Rinott & Shlomo (2007), arXiv:0708.0980 §2.2.",
  },
  "riesgoEstimado.poblacional.modelo": {
    es: "clases de equivalencia + Bayes con muestreo hipergeométrico: Prob(1_p|1_s) = Prob(1_p)·Prob(1_s|1_p) / Σ_C Prob(C_p)·Prob(1_s|C_p)",
    en: "equivalence classes + Bayes with hypergeometric sampling: Prob(1_p|1_s) = Prob(1_p)·Prob(1_s|1_p) / Σ_C Prob(C_p)·Prob(1_s|C_p)",
  },
  "riesgoEstimado.poblacional.supuesto": {
    es: "la distribución de tamaños de clase de la muestra aproxima la de la población, y los datos son REALES: el propio informe advierte que el método puede no funcionar sobre datos simulados con estructuras de clase atípicas",
    en: "the class-size distribution of the sample approximates the population's, and the data are REAL: the report itself warns that the method may not work on simulated data with atypical class structures",
  },
  // La cita es la misma en los dos idiomas; lo único que cambia es el estilo de comillas.
  "riesgoEstimado.poblacional.fuente": {
    es: "Zayatz, L. V. (1991), «Estimation of the Percent of Unique Population Elements on a Microdata File Using the Sample», CENSUS/SRD/RR-91/08, U.S. Bureau of the Census, §III.",
    en: "Zayatz, L. V. (1991), “Estimation of the Percent of Unique Population Elements on a Microdata File Using the Sample”, CENSUS/SRD/RR-91/08, U.S. Bureau of the Census, §III.",
  },
} as const satisfies Readonly<Record<string, Texto>>;
