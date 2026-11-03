// El diagnóstico — la pantalla donde se ve qué hay en la tabla y cuánta gente queda sola.
//
// Reúne lo que se lee en `/diagnostico`: la página y su estado «sin datos», el informe, la tabla de
// columnas con su evidencia, el riesgo exacto, el consejero de cruces, las insignias de categoría y
// de certeza, y el panel del riesgo ESTIMADO (que también aparece en `/transformar`).
//
// Lo que el motor dice (el tipo de cada columna, su fuente, los motivos del consejero, la prosa de
// los estimadores) NO está aquí: viaja como `Mensaje` y vive en `motor-diagnostico.ts`.
//
// Regla dura nº4 (honestidad medida): lo exacto se presenta como exacto y lo estimado SIEMPRE lleva
// la palabra «estimado» / «estimated». Aquí no hay un «seguro» ni un «garantizado» de más.
//
// El español es el que ya tenía la pantalla, palabra por palabra: las pruebas lo buscan. El inglés
// se redacta al lado, no se calca.

import type { Catalogo } from "../index";

export const DIAGNOSTICO = {
  // ── La página ───────────────────────────────────────────────────────────────────────────────
  pagina: {
    transformar: {
      es: "Transformar este archivo",
      en: "Transform this file",
    },
    explicacion: {
      es:
        "El diagnóstico dice qué te delata. El taller lo cambia: eliges qué se le hace a cada " +
        "columna, ves el antes y el después, y te llevas el archivo tratado. Sin salir de esta " +
        "pestaña.",
      en:
        "The diagnosis tells you what gives you away. The workshop changes it: you choose what " +
        "is done to each column, see the before and the after, and take away the treated file. " +
        "Without leaving this tab.",
    },
    // Un PDF o una imagen (S6) no se transforma: se limpia. Viven aquí y no en `metadatos.ts` porque
    // la página del diagnóstico los pinta sin esperar al chunk del informe, y ese catálogo no
    // tiene por qué viajar con un CSV.
    abriendoMetadatos: {
      es: "Abriendo el diagnóstico…",
      en: "Opening the diagnosis…",
    },
    limpiar: {
      es: "Limpiar este archivo",
      en: "Clean this file",
    },
    explicacionLimpieza: {
      es:
        "El diagnóstico dice qué guarda el archivo de sí mismo. La limpieza no tiene opciones: " +
        "quita todo lo que no hace falta para verlo o abrirlo, vuelve a leer la copia para " +
        "comprobarlo y te la entrega. Sin salir de esta pestaña.",
      en:
        "The diagnosis says what the file keeps about itself. The cleaning has no options: it " +
        "removes everything not needed to view or open it, reads the copy again to check it and " +
        "hands it to you. Without leaving this tab.",
    },
    otroArchivo: {
      es: "Analizar otro archivo",
      en: "Analyze another file",
    },
    descarte: {
      es:
        "Al salir de aquí el informe se descarta. No hay copia en ningún lado — ni en este " +
        "navegador, ni en un servidor.",
      en:
        "When you leave here the report is discarded. There is no copy anywhere — not in this " +
        "browser, not on a server.",
    },
    sinDatos: {
      titulo: {
        es: "No quedó nada, y es a propósito",
        en: "Nothing was left, and that is on purpose",
      },
      porQue: {
        es:
          "El diagnóstico vivía en la memoria de esta pestaña. Al recargar la página se fue, " +
          "porque nunca se guardó en ningún sitio: ni en tu disco, ni en una base de datos, ni " +
          "en un servidor nuestro.",
        en:
          "The diagnosis lived in this tab's memory. When the page was reloaded it was gone, " +
          "because it was never saved anywhere: not on your disk, not in a database, not on a " +
          "server of ours.",
      },
      motivo: {
        es:
          "Es el mismo motivo por el que tus datos no se filtran. Vuelve a la aduana y suelta " +
          "el archivo otra vez: tarda lo mismo que la primera.",
        en:
          "It is the same reason your data does not leak. Go back to the customs checkpoint and " +
          "drop the file in again: it takes as long as the first time.",
      },
      volver: {
        es: "Volver a la aduana",
        en: "Back to the customs checkpoint",
      },
    },
  },

  // ── El informe ──────────────────────────────────────────────────────────────────────────────
  informe: {
    etiqueta: { es: "Diagnóstico", en: "Diagnosis" },
    tamano: {
      es: "{filas} filas · {columnas} columnas · {peso}",
      en: "{filas} rows · {columnas} columns · {peso}",
    },
    // Un JSON no tiene filas ni columnas de nacimiento: tiene registros y rutas.
    tamanoJson: {
      es: "{filas} registros · {columnas} rutas tratadas · {peso}",
      en: "{filas} records · {columnas} treated paths · {peso}",
    },
    lecturaConMemoria: {
      es:
        "Leído en {lectura} y analizado en {analisis}, dentro de esta pestaña · {mb} MB de " +
        "memoria.",
      en: "Read in {lectura} and analyzed in {analisis}, inside this tab · {mb} MB of memory.",
    },
    lecturaSinMemoria: {
      es: "Leído en {lectura} y analizado en {analisis}, dentro de esta pestaña.",
      en: "Read in {lectura} and analyzed in {analisis}, inside this tab.",
    },
    // S8: el archivo pasó del tope de celdas en memoria y se leyó por pasadas. Lo que cambia se dice.
    altoVolumen: {
      etiqueta: { es: "Alto volumen", en: "High volume" },
      titulo: {
        es: "Este archivo se leyó por pasadas",
        en: "This file was read in passes",
      },
      texto: {
        es:
          "Pasa de **{celdas} celdas**, lo que Velo guarda en memoria, así que lo leyó por pasadas, " +
          "sin tenerlo entero en la pestaña. El riesgo de abajo es **exacto**: sale de todas las " +
          "filas. Tres cosas cambian: la clasificación mira las **primeras {filas} filas** (en un " +
          "archivo más chico, una muestra repartida por todo el archivo); el consejero combina solo " +
          "los cuasi-identificadores; y lo que el archivo pierde al tratarlo **no se mide**.",
        en:
          "It has more than **{celdas} cells**, what Velo keeps in memory, so it was read in passes, " +
          "without holding it whole in the tab. The risk below is **exact**: it comes from every " +
          "row. Three things change: the classification looks at the **first {filas} rows** (in a " +
          "smaller file, a sample spread across the whole file); the advisor combines only the " +
          "quasi-identifiers; and what the file loses when treated **is not measured**.",
      },
    },
    sinHallazgos: {
      etiqueta: { es: "Sin hallazgos", en: "No findings" },
      titulo: {
        es: "Velo no reconoció datos personales aquí",
        en: "Velo did not recognize personal data here",
      },
      nota: {
        es:
          "«No reconocimos datos personales» no es lo mismo que «este archivo es anónimo». Velo " +
          "detecta lo que sabe detectar: documentos, contactos, ubicaciones y atributos " +
          "demográficos. Un código interno de tu organización, un identificador de historia " +
          "clínica o una combinación de columnas propia de tu dominio pueden seguir señalando a " +
          "una persona sin que ningún algoritmo público lo note.",
        en:
          "“We did not recognize personal data” is not the same as “this file is anonymous”. " +
          "Velo detects what it knows how to detect: ID documents, contact details, locations " +
          "and demographic attributes. An internal code of your organization, a medical-record " +
          "identifier or a combination of columns specific to your field can still point to a " +
          "person without any public algorithm noticing.",
      },
      detalle: {
        es:
          "Ninguna de las {n} columnas quedó clasificada como identificador directo, " +
          "cuasi-identificador o dato sensible del artículo 5.",
        en:
          "None of the {n} columns was classified as a direct identifier, quasi-identifier or " +
          "sensitive data under article 5.",
      },
    },
    columnas: {
      etiqueta: { es: "Columna por columna", en: "Column by column" },
      titulo: {
        es: "Qué hay en tu tabla, y por qué lo creemos",
        en: "What is in your table, and why we believe it",
      },
      nota: {
        es:
          "Se revisaron hasta {n} valores por columna, repartidos a zancada fija a lo largo de " +
          "todo el archivo — no los primeros, que en una tabla ordenada por fecha o por región " +
          "no representan al resto. Las muestras se enseñan enmascaradas.",
        en:
          "Up to {n} values per column were checked, spread at a fixed stride across the whole " +
          "file — not the first ones, which in a table sorted by date or by region do not " +
          "represent the rest. Samples are shown masked.",
      },
    },
  },

  // ── La tabla de columnas ────────────────────────────────────────────────────────────────────
  tabla: {
    desplaza: {
      es: "La tabla se desplaza en horizontal.",
      en: "The table scrolls horizontally.",
    },
    detalle: {
      es: "Detalle de las columnas del archivo",
      en: "Details of the file's columns",
    },
    encabezados: {
      columna: { es: "Columna", en: "Column" },
      encontramos: { es: "Qué encontramos", en: "What we found" },
      categoria: { es: "Categoría", en: "Category" },
      muestra: { es: "Muestra", en: "Sample" },
    },
    valorDistinto: { es: "{n} valor distinto", en: "{n} distinct value" },
    valoresDistintos: {
      es: "{n} valores distintos",
      en: "{n} distinct values",
    },
    // S8: en alto volumen, una columna que no cupo entera: se sabe un mínimo, no la cifra.
    masDeValoresDistintos: {
      es: "más de {n} valores distintos",
      en: "more than {n} distinct values",
    },
    conDato: { es: "{pct} con dato", en: "{pct} with data" },
    cumplen: {
      es: "{pct} de los {n} valores revisados cumplen.",
      en: "{pct} of the {n} values checked match.",
    },
    columnaVacia: { es: "columna vacía", en: "empty column" },
    sinMuestra: { es: "sin muestra", en: "no sample" },
    sinMuestraTitulo: {
      es:
        "Los valores de una columna sensible son pocos y muy repetidos ('Indígena', 'J45.9'): " +
        "ninguna máscara los protege de verdad.",
      en:
        "The values of a sensitive column are few and highly repeated ('Indigenous', 'J45.9'): " +
        "no mask really protects them.",
    },
    sinMuestraLector: {
      es: "— es una columna de datos sensibles y enmascararla no la protegería.",
      en: "— it is a sensitive-data column, and masking it would not protect it.",
    },
  },

  // ── La estructura de un JSON (S6) ───────────────────────────────────────────────────────────
  // Solo aparece si el archivo es un JSON. Dice qué rutas se tratan como columnas, cuáles NO (las
  // listas, que salen tal cual) y cuáles no están en todos los registros. Honestidad medida: lo que
  // Velo no toca se declara con el mismo peso que lo que sí.
  estructura: {
    etiqueta: { es: "Estructura del JSON", en: "JSON structure" },
    titulo: {
      es: "Qué se trató y qué no en este JSON",
      en: "What was treated, and what was not, in this JSON",
    },
    nota: {
      es:
        "Velo lee cada ruta de un registro —`paciente.contacto.correo`— como una columna. Lo que " +
        "no cabe en una columna, las listas, no se aplana ni se trata: se declara aquí y se " +
        "copia al archivo tal cual.",
      en:
        "Velo reads each path of a record —`patient.contact.email`— as a column. What does not " +
        "fit in a column, lists, is neither flattened nor treated: it is declared here and " +
        "copied into the file as it is.",
    },
    cifras: {
      registros: { es: "Registros", en: "Records" },
      rutasTratadas: {
        es: "Rutas tratadas (columnas)",
        en: "Treated paths (columns)",
      },
      profundidad: { es: "Profundidad máxima", en: "Maximum depth" },
      forma: { es: "Forma del archivo", en: "Shape of the file" },
    },
    forma: {
      arreglo: { es: "Arreglo de objetos", en: "Array of objects" },
      lineas: {
        es: "JSON Lines (un objeto por línea)",
        en: "JSON Lines (one object per line)",
      },
    },

    noTratadas: {
      titulo: {
        es: "Listas que salen tal cual",
        en: "Lists that come out as they are",
      },
      ninguna: {
        es: "Ninguna lista dentro de los registros: cada ruta es una columna y se trata como tal.",
        en: "No lists inside the records: every path is a column and is treated as one.",
      },
      avisoTitulo: {
        es: "Estas rutas salen sin tocar",
        en: "These paths come out untouched",
      },
      aviso: {
        es:
          "!!Velo no trata los valores de estas listas: los copia al archivo tal cual.!! Pueden " +
          "llevar correos, teléfonos, documentos u otros datos personales, y la política que " +
          "elijas **no las alcanza**. Por ejemplo, `{ejemplo}` saldrá tal cual. Antes de entregar " +
          "el archivo, trátalas tú o quítalas de su origen.",
        en:
          "!!Velo does not treat the values inside these lists: it copies them into the file as " +
          "they are.!! They may hold emails, phone numbers, ID numbers or other personal data, " +
          "and the policy you choose **does not reach them**. For example, `{ejemplo}` will come " +
          "out as is. Before handing the file over, treat them yourself or remove them at the " +
          "source.",
      },
      descripcion: {
        es: "Listas dentro de los registros que Velo no trata",
        en: "Lists inside the records that Velo does not treat",
      },
      detalle: {
        es: "Detalle de las listas que salen sin tratar",
        en: "Details of the lists that come out untreated",
      },
      encabezados: {
        ruta: { es: "Ruta", en: "Path" },
        queEs: { es: "Qué es", en: "What it is" },
        registros: { es: "En cuántos registros", en: "In how many records" },
        campos: { es: "Campos vistos dentro", en: "Fields seen inside" },
      },
      motivo: {
        lista: { es: "Lista de valores", en: "List of values" },
        listaDeObjetos: { es: "Lista de objetos", en: "List of objects" },
      },
      presencia: {
        es: "{n} de {total}",
        en: "{n} of {total}",
      },
      sinCampos: {
        es: "sin campos con nombre",
        en: "no named fields",
      },
      nota: {
        es:
          "Los campos vistos son solo nombres, nunca valores, y pueden ser una muestra de los " +
          "que hay: la lista puede traer más.",
        en:
          "The fields seen are names only, never values, and may be just a sample of what is " +
          "there: the list may hold more.",
      },
    },

    heterogeneas: {
      titulo: {
        es: "Rutas que faltan en algunos registros o cambian de tipo",
        en: "Paths missing from some records or that change type",
      },
      ninguna: {
        es: "Todas las rutas están en todos los registros y mantienen un solo tipo.",
        en: "Every path is in every record and keeps a single type.",
      },
      intro: {
        es:
          "Donde un registro no trae la ruta, Velo no la crea por su cuenta. Una celda que la " +
          "política cambie sale como texto, aunque el original fuera un número.",
        en:
          "Where a record lacks the path, Velo does not create it on its own. A cell that the " +
          "policy changes comes out as text, even if the original was a number.",
      },
      descripcion: {
        es: "Rutas que no están en todos los registros o que cambian de tipo",
        en: "Paths that are not in every record or that change type",
      },
      detalle: {
        es: "Detalle de las rutas irregulares",
        en: "Details of the irregular paths",
      },
      encabezados: {
        ruta: { es: "Ruta", en: "Path" },
        presencia: { es: "Dónde aparece", en: "Where it appears" },
        tipos: { es: "Tipos vistos", en: "Types seen" },
      },
      presencia: {
        es: "{n} de {total} registros",
        en: "{n} of {total} records",
      },
      tipo: {
        texto: { es: "texto", en: "text" },
        numero: { es: "número", en: "number" },
        booleano: { es: "verdadero o falso", en: "true or false" },
        nulo: { es: "nulo", en: "null" },
        objeto: { es: "objeto", en: "object" },
        lista: { es: "lista", en: "list" },
      },
    },
  },

  // ── El riesgo exacto ────────────────────────────────────────────────────────────────────────
  riesgo: {
    etiqueta: {
      es: "Riesgo de reidentificación",
      en: "Re-identification risk",
    },
    sinCruce: {
      titulo: {
        es: "No hay ningún cruce que medir",
        en: "There is no crossing to measure",
      },
      nota: {
        es:
          "Que no haya cuasi-identificadores detectados no vuelve anónimo el archivo: quiere " +
          "decir que Velo no reconoció columnas que se puedan cruzar entre sí. Un código propio " +
          "de tu organización puede seguir señalando a una persona sin que ningún algoritmo " +
          "público lo sepa.",
        en:
          "Having no quasi-identifiers detected does not make the file anonymous: it means Velo " +
          "did not recognize columns that can be crossed with one another. A code specific to " +
          "your organization can still point to a person without any public algorithm knowing.",
      },
      detalle: {
        es:
          "Velo no clasificó ninguna columna como cuasi-identificador, así que no existe una " +
          "combinación de columnas sobre la cual contar clases de equivalencia.",
        en:
          "Velo did not classify any column as a quasi-identifier, so there is no combination " +
          "of columns over which to count equivalence classes.",
      },
    },
    titulo: {
      es: "Cuánta gente queda sola en tu tabla",
      en: "How many people end up alone in your table",
    },
    nota: {
      es:
        "Modelo **prosecutor**: se supone que quien ataca ya sabe que la persona está en la " +
        "tabla y solo busca cuál de las filas es. Es el escenario más adverso, y el único que " +
        "se puede calcular exacto sobre tus datos.",
      en:
        "**Prosecutor** model: the attacker is assumed to already know the person is in the " +
        "table and only looks for which of the rows it is. It is the most adverse scenario, " +
        "and the only one that can be calculated exactly over your data.",
    },
    unicosUna: {
      es:
        "de tus registros son **únicos**: nadie más en el archivo comparte su combinación de " +
        "esa columna.",
      en:
        "of your records are **unique**: no one else in the file shares their value in that " +
        "column.",
    },
    unicosVarias: {
      es:
        "de tus registros son **únicos**: nadie más en el archivo comparte su combinación de " +
        "esas {n} columnas.",
      en:
        "of your records are **unique**: no one else in the file shares their combination of " +
        "those {n} columns.",
    },
    registros: { es: "{cifra} registros.", en: "{cifra} records." },
    // El español del singular («las 1 columna que identifica») es el de siempre y se conserva.
    noCuentaUna: {
      es:
        "Esta cifra **no cuenta** las {n} columna que identifica sin ayuda de ninguna otra: a " +
        "esa gente no hay que cruzarla con nada para saber quién es.",
      en:
        "This figure **does not count** the {n} column that identifies people without any " +
        "other's help: those people do not need to be crossed with anything to know who they are.",
    },
    noCuentaVarias: {
      es:
        "Esta cifra **no cuenta** las {n} columnas que identifican sin ayuda de ninguna otra: a " +
        "esa gente no hay que cruzarla con nada para saber quién es.",
      en:
        "This figure **does not count** the {n} columns that identify people without any " +
        "other's help: those people do not need to be crossed with anything to know who they are.",
    },
    grupoMasPequeno: { es: "Grupo más pequeño", en: "Smallest group" },
    persona: { es: "persona", en: "person" },
    personas: { es: "personas", en: "people" },
    grupoMasPequenoExplicacion: {
      es: "El k real del archivo: el tamaño de la clase de equivalencia más chica.",
      en: "The file's actual k: the size of the smallest equivalence class.",
    },
    masExpuesto: {
      es: "Riesgo del más expuesto",
      en: "Risk for the most exposed",
    },
    masExpuestoExplicacion: {
      es: "Probabilidad de acertar quién es, para el registro peor protegido.",
      en: "Probability of guessing who it is, for the worst-protected record.",
    },
    promedio: { es: "Riesgo promedio", en: "Average risk" },
    promedioExplicacion: {
      es: "Promedio de 1/k sobre todos los registros.",
      en: "Average of 1/k over all records.",
    },
    gruposDistintos: { es: "Grupos distintos", en: "Distinct groups" },
    gruposDistintosExplicacion: {
      es: "Cuántas combinaciones de valores diferentes hay entre esas columnas.",
      en: "How many different combinations of values exist among those columns.",
    },
    columnasCruzadas: { es: "Columnas cruzadas", en: "Columns crossed" },
    cifraExacta: { es: "Cifra exacta.", en: "Exact figure." },
    cifraExactaDetalle: {
      es:
        "Se contó registro por registro sobre tus {n} filas. No hay modelo, ni muestreo, ni " +
        "estimación de por medio.",
      en:
        "It was counted record by record over your {n} rows. There is no model, no sampling " +
        "and no estimation involved.",
    },
  },

  // ── El consejero de cruces ──────────────────────────────────────────────────────────────────
  advisor: {
    etiqueta: { es: "Consejero de cruces", en: "Crossing advisor" },
    titulo: {
      es: "Qué columnas delatan al juntarse",
      en: "Which columns give you away when combined",
    },
    solasTitulo: {
      es: "Estas no necesitan compañía",
      en: "These need no company",
    },
    solasExplicacion: {
      es:
        "Cada una, por sí sola, ya deja solo a casi todo el mundo. No entran a las " +
        "combinaciones de abajo porque cualquier cruce que las incluya heredaría su unicidad " +
        "sin decir nada nuevo.",
      en:
        "Each one, on its own, already leaves almost everyone alone. They do not enter the " +
        "combinations below because any crossing that includes them would inherit their " +
        "uniqueness without saying anything new.",
    },
    solos: { es: "{pct} solos", en: "{pct} alone" },
    sinCombinaciones: {
      es:
        "No quedaron columnas suficientes para proponer un cruce. Eso pasa cuando casi todas " +
        "son identificadores directos, datos sensibles o columnas con un solo valor — el " +
        "detalle está abajo.",
      en:
        "Not enough columns were left to propose a crossing. That happens when almost all of " +
        "them are direct identifiers, sensitive data or columns with a single value — the " +
        "detail is below.",
    },
    solosYGrupo: {
      es: "solos · grupo más pequeño: {k}",
      en: "alone · smallest group: {k}",
    },
    // El alcance se cuenta en cuatro tramos porque entre ellos van elementos con su propio
    // aspecto (la cifra en `cifra`) y un tramo opcional.
    alcanceInicio: { es: "Velo evaluó", en: "Velo evaluated" },
    // El español del singular («las 1 columna candidata») es el de siempre y se conserva tal cual.
    alcanceCombinacionesUna: {
      es: "combinaciones de las {n} columna candidata",
      en: "combinations of the {n} candidate column",
    },
    alcanceCombinacionesVarias: {
      es: "combinaciones de las {n} columnas candidatas",
      en: "combinations of the {n} candidate columns",
    },
    alcanceArriba: {
      es: "— arriba están las {n} que dejan sola a más gente",
      en: "— the {n} that leave the most people alone are shown above",
    },
    alcanceTope: {
      es:
        ". El tope es {candidatos} columnas (las de más valores distintos) y grupos de hasta " +
        "{tamano}: no es el universo entero de cruces posibles, y por eso lo dice aquí.",
      en:
        ". The limit is {candidatos} columns (the ones with the most distinct values) and " +
        "groups of up to {tamano}: this is not the whole universe of possible crossings, which " +
        "is why it says so here.",
    },
    fueraUna: {
      es: "{n} columna quedó fuera, y por qué",
      en: "{n} column was left out, and why",
    },
    fueraVarias: {
      es: "{n} columnas quedaron fuera, y por qué",
      en: "{n} columns were left out, and why",
    },
  },

  // ── Insignias ───────────────────────────────────────────────────────────────────────────────
  insignias: {
    categoria: {
      identificadorDirecto: {
        es: "Identificador directo",
        en: "Direct identifier",
      },
      cuasiIdentificador: {
        es: "Cuasi-identificador",
        en: "Quasi-identifier",
      },
      datoSensible: {
        es: "Dato sensible · art. 5",
        en: "Sensitive data · art. 5",
      },
      noPersonal: { es: "No personal", en: "Not personal" },
    },
    certeza: {
      confirmado: {
        etiqueta: { es: "Confirmado", en: "Confirmed" },
        explicacion: {
          es: "El algoritmo oficial del dato (dígito de verificación) se recalculó y cuadra.",
          en: "The official algorithm for this data type (check digit) was recomputed and it matches.",
        },
      },
      porSuForma: {
        etiqueta: { es: "Por su forma", en: "By its shape" },
        explicacion: {
          es:
            "No existe un dígito de verificación público para este dato: solo se pudo comprobar " +
            "la forma.",
          en: "There is no public check digit for this data type: only its shape could be checked.",
        },
      },
      sinConfirmar: {
        etiqueta: { es: "Sin confirmar", en: "Unconfirmed" },
        explicacion: {
          es:
            "La conclusión se apoya en el nombre de la columna, no en los valores. Ningún " +
            "cálculo puede confirmarla.",
          en:
            "The conclusion rests on the column's name, not on its values. No calculation can " +
            "confirm it.",
        },
      },
    },
  },

  // ── El riesgo estimado ──────────────────────────────────────────────────────────────────────
  estimado: {
    etiqueta: {
      es: "Paso 5 · el riesgo estimado",
      en: "Step 5 · the estimated risk",
    },
    titulo: {
      es: "Y en la población entera, ¿cuánto?",
      en: "And across the whole population, how much?",
    },
    nota: {
      es:
        "El balance es **exacto** y habla de tu archivo; esta sección es **estimada** y habla " +
        "de la población de la que salió. No se suman ni se promedian entre sí.",
      en:
        "The balance is **exact** and speaks about your file; this section is **estimated** and " +
        "speaks about the population it came from. They are neither added nor averaged " +
        "together.",
    },
    pregunta: {
      es: "¿De cuántas personas salió este archivo? (opcional)",
      en: "How many people did this file come from? (optional)",
    },
    ejemplo: {
      es: "por ejemplo, 2400000",
      en: "for example, 2400000",
    },
    quitar: { es: "Quitar la estimación", en: "Remove the estimate" },
    estimar: { es: "Estimar", en: "Estimate" },
    ayuda: {
      es:
        "El total de personas del que este archivo es una muestra —los afiliados de la EPS, los " +
        "habitantes del municipio, los empleados de la empresa—. Velo no puede saberlo, y **no " +
        "se lo inventa**: sin este dato no hay estimador poblacional que valga.",
      en:
        "The total number of people this file is a sample of —the members of the health insurer, " +
        "the residents of the municipality, the employees of the company—. Velo cannot know it, " +
        "and it **does not make it up**: without this figure no population estimator is worth " +
        "anything.",
    },
    individual: {
      titulo: {
        es: "Si alguien intenta emparejar una fila con una persona",
        en: "If someone tries to match a row to a person",
      },
      solo: {
        es: "para el registro más expuesto (uno que está solo en el archivo); {promedio} de media.",
        en: "for the most exposed record (one that is alone in the file); {promedio} on average.",
      },
      comparte: {
        es:
          "para el registro más expuesto, que comparte valores con otros {otros}; {promedio} de " +
          "media.",
        en:
          "for the most exposed record, which shares values with {otros} others; {promedio} on " +
          "average.",
      },
    },
    poblacional: {
      titulo: {
        es: "De tus registros únicos, cuántos lo serían en la población",
        en: "Of your unique records, how many would be unique in the population",
      },
      detalle: {
        es:
          "de las filas del archivo —unas {registros} de {unicos} únicos— seguirían siendo " +
          "únicas entre todas esas personas.",
        en:
          "of the file's rows —about {registros} of the {unicos} unique ones— would still be " +
          "unique among all those people.",
      },
    },
    cifraEstimada: { es: "Cifra estimada", en: "Estimated figure" },
    procedencia: {
      es: "· modelo: {modelo} · supone que {supuesto} · {fuente}",
      en: "· model: {modelo} · assumes that {supuesto} · {fuente}",
    },
    noCalculable: { es: "No calculable.", en: "Not calculable." },
    intervalo: {
      es: "(el modelo lo sitúa entre {desde} y {hasta}, al {confianza})",
      en: "(the model places it between {desde} and {hasta}, at {confianza} confidence)",
    },
  },
} as const satisfies Catalogo;
