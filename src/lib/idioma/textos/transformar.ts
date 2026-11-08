// El taller — la pantalla `/transformar`: la política, la vista previa, el balance y la entrega.
//
// El glosario que mantiene las dos versiones hablando de lo mismo está en el encabezado de
// `comun.ts`. Aquí, lo que más importa recordar:
//
//   · taller → workshop · política → policy · bóveda → vault · bitácora → log · regreso → return
//   · tratamiento → treatment (solo «processing» cuando cita la ley: Habeas Data) · huella → fingerprint
//   · «de fábrica» → built-in · «salvedad» → caveat · «reparto» (Mondrian) → partitioning
//   · «correspondencia» (seudónimo ↔ valor original) → mapping
//
// Las frases de las llaves y la bóveda (la frase de paso y su pérdida irreversible) viven en
// `llaves.ts`; las de las políticas de fábrica y los motivos del motor, en `motor-transformar.ts`.
//
// Donde una frase lleva en medio un nombre de columna o de archivo (datos del usuario), se parte en
// dos claves y el nombre se pinta aparte: un nombre con `**` o con comillas invertidas no puede
// convertirse en énfasis. Los textos que cambian de forma según la cantidad (una columna / varias)
// son dos claves, `uno` y `varias`, y las elige quien las pinta.

import type { Catalogo } from "../index";

export const TRANSFORMAR = {
  // ── La puerta: `/transformar` sin archivo ───────────────────────────────────────────────────
  puerta: {
    abriendo: {
      es: "Abriendo el taller…",
      en: "Opening the workshop…",
    },
    // La puerta también abre la limpieza de un PDF o una imagen (S6): su texto vive en esta
    // página, que ya la importa, y no en `metadatos.ts`, que solo viaja con quien lo necesita.
    abriendoLimpieza: {
      es: "Abriendo la limpieza…",
      en: "Opening the cleaning…",
    },
    vacio: {
      titulo: {
        es: "No hay nada que transformar",
        en: "Nothing to transform",
      },
      detalle: {
        es:
          "El taller trabaja sobre el archivo que tengas cargado en esta pestaña, y ahora mismo no " +
          "hay ninguno. No se perdió: nunca se guardó en ningún sitio, que es la misma razón por la " +
          "que tus datos no se filtran.",
        en:
          "The workshop works on whichever file is loaded in this tab, and right now there is none. " +
          "It wasn't lost: it was never stored anywhere, which is the same reason your data doesn't " +
          "leak.",
      },
      volver: {
        es: "Volver a la aduana",
        en: "Back to the customs checkpoint",
      },
    },
  },

  // ── El taller ───────────────────────────────────────────────────────────────────────────────
  taller: {
    etiqueta: {
      es: "El taller",
      en: "The workshop",
    },
    titulo: {
      es: "Ahora sí, transformar",
      en: "Time to transform",
    },
    // Va partido porque en medio está el nombre del archivo, que es del usuario.
    resumen: {
      antes: {
        es: "{filas} filas y {columnas} columnas de",
        en: "{filas} rows and {columnas} columns from",
      },
      despues: {
        es: ". Todo lo que sigue ocurre en esta pestaña, igual que el diagnóstico.",
        en: ". Everything below happens in this tab, just like the diagnosis.",
      },
    },
    transformar: { es: "Transformar", en: "Transform" },
    transformando: { es: "Transformando…", en: "Transforming…" },
    ayuda: {
      sinReglas: {
        es: "Elige qué hacer con al menos una columna, o aplica una política de fábrica.",
        en: "Choose what to do with at least one column, or apply a built-in policy.",
      },
      sinLlave: {
        es: "La política pide seudónimos: hace falta la llave.",
        en: "The policy asks for pseudonyms: the key is required.",
      },
    },
    progreso: {
      midiendo: {
        es: "Midiendo el riesgo del archivo que sale…",
        en: "Measuring the risk of the file going out…",
      },
      aplicando: {
        es: "Aplicando la política en el hilo donde viven los datos…",
        en: "Applying the policy on the thread where your data lives…",
      },
    },
    // Los fallos de la transformación dicen QUÉ HACER, igual que los de la aduana.
    fallo: {
      titulo: {
        es: "No se pudo transformar",
        en: "Could not transform the file",
      },
      generico: {
        es: "Vuelve a la aduana y suelta el archivo otra vez.",
        en: "Go back to the customs checkpoint and drop the file again.",
      },
      sinTabla: {
        es: "El archivo ya no está en memoria. Vuelve a la aduana y suéltalo otra vez.",
        en: "The file is no longer in memory. Go back to the customs checkpoint and drop it again.",
      },
      sinLlave: {
        es: "La política pide seudónimos y todavía no hay llave. Deriva la llave y vuelve a intentarlo.",
        en: "The policy asks for pseudonyms and there is no key yet. Derive the key and try again.",
      },
      // S8: lo que el alto volumen no puede transformar, con la salida.
      bovedaNoCabe: {
        es:
          "Una columna con **«Poder deshacerlo con una bóveda»** tiene demasiados valores distintos " +
          "para guardar su bóveda en un archivo de alto volumen. Quita esa casilla en esa columna, " +
          "o divide el archivo en partes.",
        en:
          "A column with **“Be able to undo it with a vault”** has too many distinct values to keep " +
          "its vault in a high-volume file. Untick that box for that column, or split the file into " +
          "parts.",
      },
      repartoNoCabe: {
        es:
          "El archivo tiene demasiadas filas, o una de esas columnas demasiados valores distintos, " +
          "para el reparto (Mondrian o la generalización óptima) en alto volumen. Generaliza esas " +
          "columnas con una técnica por columna, o divide el archivo en partes.",
        en:
          "The file has too many rows, or one of those columns too many distinct values, for the " +
          "partition (Mondrian or the optimal generalization) in high volume. Generalize those " +
          "columns with a per-column technique, or split the file into parts.",
      },
      histogramaNoCabe: {
        es:
          "Ya transformadas, las columnas que identifican en conjunto forman más combinaciones " +
          "distintas de las que Velo puede contar para el riesgo exacto, y Velo no lo estima. " +
          "Generaliza más esas columnas o quítales el ruido, o divide el archivo en partes.",
        en:
          "Once transformed, the columns that identify together form more distinct combinations " +
          "than Velo can count for the exact risk, and Velo does not estimate it. Generalize those " +
          "columns further or take the noise off them, or split the file into parts.",
      },
      transformacionFallida: {
        es:
          "Algo falló al aplicar la política. Revisa que las técnicas encajen con el tipo de cada " +
          "columna — una fecha no se puede agrupar de 10 en 10.",
        en:
          "Something went wrong while applying the policy. Check that the techniques fit each " +
          "column's type — a date can't be grouped in tens.",
      },
    },
    volverAlDiagnostico: {
      es: "Volver al diagnóstico",
      en: "Back to the diagnosis",
    },
  },

  // ── Paso 1: el editor de política ───────────────────────────────────────────────────────────
  editor: {
    panel: {
      etiqueta: { es: "Paso 1 · la política", en: "Step 1 · the policy" },
      titulo: {
        es: "Qué se le hace a cada columna",
        en: "What happens to each column",
      },
      nota: {
        es:
          "La política no se guarda en ningún lado. Si la quieres para el mes que viene, " +
          "**expórtala como archivo** — lleva los nombres de tus columnas, que son datos tuyos, y " +
          "por eso no entra a la memoria de este navegador.",
        en:
          "The policy isn't saved anywhere. If you want it for next month, **export it as a " +
          "file** — it carries your column names, which are your data, and that's why it doesn't " +
          "go into this browser's memory.",
      },
    },
    exportar: { es: "Exportar", en: "Export" },
    importar: { es: "Importar", en: "Import" },
    importarArchivo: {
      es: "Importar una política desde un archivo",
      en: "Import a policy from a file",
    },
    errorAlImportar: {
      es: "No se pudo importar: {detalle}",
      en: "Could not import: {detalle}",
    },
    tabla: {
      descripcion: {
        es: "Una fila por columna del archivo, con la técnica que se le aplica",
        en: "One row per column in the file, with the technique applied to it",
      },
      columna: { es: "Columna", en: "Column" },
      queSeLeHace: { es: "Qué se le hace", en: "What happens to it" },
      tecnicaDeLaColumna: {
        es: "Técnica para la columna {columna}",
        en: "Technique for column {columna}",
      },
    },
    // Los textos son cortos por una razón medida (pasada de capturas del S3): en 412 px el
    // desplegable cerrado deja ~19 caracteres visibles y las opciones de seudónimo tienen que seguir
    // siendo distinguibles aunque se trunquen.
    opcion: {
      conservar: { es: "Dejar como está", en: "Leave as is" },
      enmascarar: { es: "Enmascarar (103***89)", en: "Mask (103***89)" },
      seudonimizar: { es: "Seudónimo (hex)", en: "Pseudonym (hex)" },
      // Un texto por formato de seudónimo, indexado por la misma lista que el esquema de la política
      // (`FORMATOS_DE_SEUDONIMO`). Los europeos (S8) empiezan por el documento y no por «seudónimo»:
      // en 412 px el desplegable cerrado deja ~19 caracteres, y lo que distingue una opción de otra
      // tiene que caber en ellos.
      seudonimizarFormato: {
        cedula: { es: "Seudónimo de cédula", en: "Cédula pseudonym" },
        nit: { es: "Seudónimo de NIT", en: "NIT pseudonym" },
        iban: { es: "IBAN · seudónimo", en: "IBAN · pseudonym" },
        dni: { es: "DNI · seudónimo", en: "DNI · pseudonym" },
        nie: { es: "NIE · seudónimo", en: "NIE · pseudonym" },
        nir: { es: "NIR · seudónimo", en: "NIR · pseudonym" },
        "codice-fiscale": {
          es: "Cod. fiscale · seudón.",
          en: "Codice fiscale · pseud.",
        },
        "steuer-idnr": {
          es: "Steuer-IdNr · seudón.",
          en: "Steuer-IdNr · pseud.",
        },
        bsn: { es: "BSN · seudónimo", en: "BSN · pseudonym" },
        pesel: { es: "PESEL · seudónimo", en: "PESEL · pseudonym" },
      },
      generalizarAnio: {
        es: "Fecha: dejar solo el año",
        en: "Date: keep only the year",
      },
      generalizarMes: {
        es: "Fecha: dejar año y mes",
        en: "Date: keep year and month",
      },
      generalizarRango: {
        es: "Número: agrupar de 10 en 10",
        en: "Number: group in tens",
      },
      generalizarPrefijo: {
        es: "Dejar los 2 primeros caracteres",
        en: "Keep the first 2 characters",
      },
      generalizarAutomatico: {
        es: "Generalizar hasta alcanzar el k",
        en: "Generalize until k is reached",
      },
      suprimir: { es: "Quitar la columna", en: "Remove the column" },
      // S7: cortas por la misma razón que las de arriba (412 px); el detalle va debajo del menú.
      laplace: { es: "Ruido de Laplace (ε)", en: "Laplace noise (ε)" },
      respuestaAleatorizada: {
        es: "Respuesta aleatorizada (ε)",
        en: "Randomized response (ε)",
      },
      perturbar: { es: "Perturbar ±%", en: "Perturb ±%" },
    },
    // S7: los parámetros del ruido, debajo del menú de la columna.
    ruido: {
      epsilon: {
        es: "ε de {columna}",
        en: "ε for {columna}",
      },
      minimo: {
        es: "Mínimo posible de {columna}",
        en: "Lowest possible {columna}",
      },
      maximo: {
        es: "Máximo posible de {columna}",
        en: "Highest possible {columna}",
      },
      decimales: { es: "Decimales de {columna}", en: "Decimals of {columna}" },
      porcentaje: {
        es: "Cuánto puede moverse {columna} (%)",
        en: "How far {columna} may move (%)",
      },
      etiquetas: {
        epsilon: { es: "ε", en: "ε" },
        minimo: { es: "mín.", en: "min" },
        maximo: { es: "máx.", en: "max" },
        decimales: { es: "decimales", en: "decimals" },
        porcentaje: { es: "± %", en: "± %" },
      },
      notaLaplace: {
        es:
          "**Privacidad diferencial local, ε = {epsilon} por valor de este campo.** El rango es el " +
          "que el dato PUEDE tener, no el que tiene el archivo: sacarlo de los datos ya delataría " +
          "algo. Lo que cae fuera se recorta y se cuenta. A menor ε, más ruido.",
        en:
          "**Local differential privacy, ε = {epsilon} per value of this field.** The range is the " +
          "one the data CAN take, not the one the file has: taking it from the data would already " +
          "give something away. What falls outside is clipped and counted. The lower the ε, the " +
          "more noise.",
      },
      notaRespuesta: {
        es:
          "**Privacidad diferencial local, ε efectivo ≤ {epsilon} por valor de este campo.** Cada " +
          "celda responde a veces un valor al azar entre los que tiene la columna (hasta 64). Esos " +
          "valores posibles salen del archivo: que un valor aparezca no está protegido por ε.",
        en:
          "**Local differential privacy, effective ε ≤ {epsilon} per value of this field.** Each " +
          "cell sometimes answers a random value among the ones the column holds (up to 64). Those " +
          "possible values come from the file: that a value shows up is not protected by ε.",
      },
      notaPerturbar: {
        es:
          "**Perturbación, sin garantía formal.** Cada número se mueve al azar hasta ±{porcentaje} %. " +
          "No es privacidad diferencial: no tiene ε y no promete nada medible.",
        en:
          "**Perturbation, with no formal guarantee.** Each number moves at random up to " +
          "±{porcentaje} %. It is not differential privacy: it has no ε and promises nothing " +
          "measurable.",
      },
      invalido: {
        es: "El máximo tiene que ser mayor que el mínimo, con esos decimales y en un rango que quepa.",
        en: "The maximum must be greater than the minimum, with those decimals and in a range that fits.",
      },
    },
    categoria: {
      "identificador-directo": {
        es: "Identificador directo",
        en: "Direct identifier",
      },
      "cuasi-identificador": {
        es: "Cuasi-identificador",
        en: "Quasi-identifier",
      },
      "dato-sensible": { es: "Dato sensible", en: "Sensitive data" },
      "no-personal": { es: "No personal", en: "Not personal" },
    },
    casilla: {
      titulo: {
        es: "Poder deshacerlo con una bóveda",
        en: "Make it undoable with a vault",
      },
      detalle: {
        es: "Guarda la correspondencia en un archivo cifrado. Sin la bóveda, el seudónimo sigue sin vuelta.",
        en: "Saves the mapping in an encrypted file. Without the vault, the pseudonym can't be reversed.",
      },
    },
    vuelta: {
      aviso: {
        es:
          "Con al menos una columna reversible, al transformar vas a poder **guardar una " +
          "bóveda**: un archivo cifrado con la correspondencia, para recuperar los originales " +
          "cuando te devuelvan el trabajo.",
        en:
          "With at least one reversible column, after transforming you'll be able to **save a " +
          "vault**: an encrypted file holding the mapping, so you can recover the originals when " +
          "the work comes back to you.",
      },
      // Va partido porque en medio está la lista de columnas, que son del usuario.
      sinVuelta: {
        antes: {
          es: "Lo que **no** va a volver, tengas o no la bóveda:",
          en: "What **won't** come back, whether or not you have the vault:",
        },
        despues: {
          es:
            ". Enmascarar, generalizar y quitar una columna **destruyen** información: no hay " +
            "tabla que lo deshaga porque los datos que faltan ya no existen en ninguna parte.",
          en:
            ". Masking, generalizing and removing a column **destroy** information: there is no " +
            "table to undo it because the missing data no longer exists anywhere.",
        },
      },
    },
    k: {
      etiqueta: {
        es: "Grupo mínimo (k) para las columnas que se generalizan solas",
        en: "Minimum group size (k) for the columns that generalize automatically",
      },
      // Solo lo alcanza una política importada: elegir la opción en esta pantalla ya fija el k.
      sinK: {
        es:
          "Esta política pide generalización automática y **no fija un k**. Sin él no hay hasta " +
          "dónde generalizar: esas columnas saldrían intactas. Escribe un número arriba.",
        en:
          "This policy asks for automatic generalization and **doesn't set a k**. Without one " +
          "there's no limit to generalize up to: those columns would come out untouched. Enter a " +
          "number above.",
      },
      conK: {
        es:
          "Con k = {k}, Velo generaliza esas columnas hasta que nadie quede en un grupo de menos " +
          "de {k} registros. Cuanto más alto el k, menos preciso queda el dato. Si no se puede " +
          "alcanzar sin borrar filas, Velo lo dice y no borra nada.",
        en:
          "With k = {k}, Velo generalizes those columns until nobody is left in a group of fewer " +
          "than {k} records. The higher the k, the less precise the data. If it can't be reached " +
          "without deleting rows, Velo says so and deletes nothing.",
      },
    },
    origen: {
      // `{nombre}` es el nombre propio de la política de fábrica (Habeas Data, HIPAA), no del usuario.
      editada: {
        es:
          "**Ya no es {nombre}.** Partiste de esa plantilla y la cambiaste, así que el reporte va " +
          "a decir que la política es tuya. Es lo correcto: la guía oficial no respalda una " +
          "decisión que no tomó.",
        en:
          "**It's no longer {nombre}.** You started from that template and changed it, so the " +
          "report will say the policy is yours. That's as it should be: the official guidance " +
          "doesn't back a decision it didn't make.",
      },
      // Las políticas que citan artículo por artículo (el RGPD): una línea por punto, con cómo lo
      // ve Velo, la fuente y la fecha en que se consultó.
      citas: {
        titulo: {
          es: "Qué cubre, artículo por artículo",
          en: "What it covers, article by article",
        },
        linea: {
          es: "**{articulo}** · {identificador} — {como}. Fuente: {fuente}; consultada el {fecha}.",
          en: "**{articulo}** · {identificador} — {como}. Source: {fuente}; consulted on {fecha}.",
        },
        porContenido: {
          es: "Velo lo reconoce por el contenido de la columna",
          en: "Velo recognizes it by the contents of the column",
        },
        porNombre: {
          es: "Velo lo reconoce solo por el nombre de la columna",
          en: "Velo recognizes it only by the column name",
        },
        sinReconocer: {
          es: "Velo no lo reconoce",
          en: "Velo does not recognize it",
        },
      },
      cobertura: {
        es:
          "Velo resume esa fuente en {total} puntos: **{automaticos}** los reconoce por el " +
          "contenido de la columna, **{porNombre}** solo por su nombre, y **{manuales}** no los " +
          "puede reconocer ningún programa que solo vea la tabla — esos los tienes que marcar " +
          "tú, abajo.",
        en:
          "Velo summarizes that source in {total} points. It recognizes **{automaticos}** by the " +
          "contents of the column and **{porNombre}** by the column name alone; **{manuales}** " +
          "can't be recognized by any program that only sees the table — you have to mark those " +
          "yourself, below.",
      },
    },
  },

  // ── Paso 3: la vista previa ─────────────────────────────────────────────────────────────────
  vista: {
    panel: {
      etiqueta: { es: "Paso 3 · la vista previa", en: "Step 3 · the preview" },
      titulo: {
        es: "Qué va a recibir la otra persona",
        en: "What the other person will receive",
      },
      nota: {
        es:
          "{cambian} de {total} columnas cambian. Los valores de la izquierda van enmascarados " +
          "porque siguen siendo tus datos; los de la derecha van completos cuando ya no lo son.",
        en:
          "{cambian} of {total} columns change. The values on the left are masked because they " +
          "are still your data; the ones on the right are shown in full once they no longer are.",
      },
    },
    region: {
      es: "Comparación antes y después, columna por columna",
      en: "Before and after comparison, column by column",
    },
    descripcion: {
      es: "Muestra de {n} filas repartidas por todo el archivo, antes y después del tratamiento",
      en: "Sample of {n} rows spread across the whole file, before and after the treatment",
    },
    columna: { es: "Columna", en: "Column" },
    antes: { es: "Antes", en: "Before" },
    despues: { es: "Después", en: "After" },
    suprimida: {
      es: "la columna no va en el archivo",
      en: "the column is not in the file",
    },
    omitida: {
      es: "dato sensible sin cambios: no se muestra",
      en: "sensitive data, unchanged: not shown",
    },
    vacio: { es: "(vacío)", en: "(empty)" },
  },

  // ── Paso 4: el balance ──────────────────────────────────────────────────────────────────────
  balance: {
    panel: {
      etiqueta: { es: "Paso 4 · el balance", en: "Step 4 · the balance" },
      titulo: {
        es: "Qué cambió, y qué sigue igual",
        en: "What changed, and what stays the same",
      },
      nota: {
        es:
          "Las dos medidas salen del mismo cálculo, corrido sobre el archivo que entró y sobre " +
          "el que vas a descargar. Se refieren solo al cruce de cuasi-identificadores: una " +
          "columna que Velo no supo leer no entra a ninguna de las dos cuentas.",
        en:
          "Both measurements come from the same calculation, run on the file that went in and on " +
          "the one you're about to download. They only refer to the cross-check of " +
          "quasi-identifiers: a column Velo couldn't read isn't part of either count.",
      },
    },
    // Cada salvedad que lleva columnas del usuario va partida: lo de antes de la lista y lo de después.
    sinTratar: {
      uno: {
        es: "**La política deja intacta una columna que señala** a la persona sin ayuda de ninguna otra:",
        en: "**The policy leaves one column untouched that singles out** a person without help from any other column:",
      },
      varias: {
        es: "**La política deja intactas {n} columnas que señalan** a la persona sin ayuda de ninguna otra:",
        en: "**The policy leaves {n} columns untouched that single out** a person without help from any other column:",
      },
      cierre: {
        es: ". Mientras estén en el archivo, ninguna cifra de aquí abajo describe datos tratados.",
        en: ". As long as they remain in the file, none of the figures below describes treated data.",
      },
    },
    ruidoNoAplicado: {
      es:
        "**{n} columnas salieron intactas**: la política pide respuesta aleatorizada y tienen más " +
        "de {maximo} valores distintos, que es lo que esa técnica acepta. Usa Laplace si son " +
        "números, generaliza antes o suprímelas:",
      en:
        "**{n} columns came out untouched**: the policy asks for randomized response and they " +
        "have more than {maximo} distinct values, which is what that technique accepts. Use " +
        "Laplace if they are numbers, generalize them first or suppress them:",
    },
    reticulaExcedeTope: {
      es:
        "**{n} columnas salieron intactas**: la política pide la generalización óptima y sus " +
        "jerarquías dan {nodos} combinaciones de niveles, más de las {tope} que Velo recorre. " +
        "Quita una columna del reparto, usa una jerarquía con menos niveles o elige Mondrian:",
      en:
        "**{n} columns came out untouched**: the policy asks for the optimal generalization and " +
        "their hierarchies give {nodos} combinations of levels, more than the {tope} Velo walks " +
        "through. Take a column out of the partition, use a hierarchy with fewer levels or choose " +
        "Mondrian:",
    },
    repartoSinK: {
      uno: {
        es:
          "**Una columna salió intacta**: las marcaste para que Velo decidiera cuánto " +
          "generalizarlas y la política no fijó un grupo mínimo (k), así que no había hasta " +
          "dónde generalizar.",
        en:
          "**One column came out untouched**: you marked it so Velo would decide how far to " +
          "generalize it, and the policy set no minimum group size (k), so there was no limit to " +
          "generalize up to.",
      },
      varias: {
        es:
          "**{n} columnas salieron intactas**: las marcaste para que Velo decidiera cuánto " +
          "generalizarlas y la política no fijó un grupo mínimo (k), así que no había hasta " +
          "dónde generalizar.",
        en:
          "**{n} columns came out untouched**: you marked them so Velo would decide how far to " +
          "generalize them, and the policy set no minimum group size (k), so there was no limit " +
          "to generalize up to.",
      },
    },
    unicosRestantes: {
      uno: {
        es:
          "**{cuantos} registro** ({proporcion}) sigue **solo** en su combinación de valores: " +
          "nadie más en la tabla comparte la suya.",
        en:
          "**{cuantos} record** ({proporcion}) is still **alone** in its combination of values: " +
          "nobody else in the table shares theirs.",
      },
      varios: {
        es:
          "**{cuantos} registros** ({proporcion}) siguen **solos** en su combinación de valores: " +
          "nadie más en la tabla comparte la suya.",
        en:
          "**{cuantos} records** ({proporcion}) are still **alone** in their combination of " +
          "values: nobody else in the table shares theirs.",
      },
    },
    kNoAlcanzado: {
      es:
        "Pediste grupos de al menos **{kObjetivo}** y el reparto llegó a **{kAlcanzado}**. El " +
        "archivo no cumple el k que declara.",
      en:
        "You asked for groups of at least **{kObjetivo}** and the partitioning reached " +
        "**{kAlcanzado}**. The file doesn't meet the k it declares.",
    },
    kDelReparto: {
      es:
        "El reparto alcanzó k={kDelReparto} sobre las columnas que generaliza, pero el archivo " +
        "completo tiene grupos de **{kDelArchivo}**: hay cuasi-identificadores fuera del reparto " +
        "que los parten. **El número que vale es el del archivo.**",
      en:
        "The partitioning reached k={kDelReparto} on the columns it generalizes, but the whole " +
        "file has groups of **{kDelArchivo}**: there are quasi-identifiers outside the " +
        "partitioning that split them. **The number that counts is the file's.**",
    },
    homogeneas: {
      antes: {
        es: "**{filas}** registros están en grupos donde todos comparten el mismo valor de",
        en: "**{filas}** records are in groups where everyone shares the same value of",
      },
      despues: {
        es:
          ". Dar con el grupo basta para saber el dato, aunque no se sepa cuál de las filas es " +
          "la persona.",
        en:
          ". Finding the group is enough to learn the value, even if you can't tell which row " +
          "is the person.",
      },
    },
    colisionesSinMedir: {
      es:
        "**Colisiones sin contar**: el seudónimo de estas columnas se calculó valor por valor, porque " +
        "tienen demasiados valores distintos para guardarlos en un archivo de alto volumen. Si " +
        "conservan el formato, dos entidades distintas pueden haber recibido el mismo seudónimo:",
      en:
        "**Collisions not counted**: the pseudonym of these columns was computed value by value, " +
        "because they have too many distinct values to keep in a high-volume file. If they keep " +
        "the format, two different entities may have received the same pseudonym:",
    },
    colisiones: {
      antes: { es: "En", en: "In" },
      uno: {
        es:
          ", **{cuantas}** par de valores distintos recibió el mismo seudónimo. Conservar el " +
          "formato reduce el espacio disponible y algunos chocan: dos entidades distintas se ven " +
          "como una.",
        en:
          ", **{cuantas}** pair of different values received the same pseudonym. Preserving the " +
          "format shrinks the available space and some collide: two different entities look " +
          "like one.",
      },
      varias: {
        es:
          ", **{cuantas}** pares de valores distintos recibieron el mismo seudónimo. Conservar " +
          "el formato reduce el espacio disponible y algunos chocan: dos entidades distintas se " +
          "ven como una.",
        en:
          ", **{cuantas}** pairs of different values received the same pseudonym. Preserving " +
          "the format shrinks the available space and some collide: two different entities " +
          "look like one.",
      },
    },
    sinSalvedades: {
      es:
        "Velo no encontró salvedades que matizar sobre las columnas que revisó. Eso no vuelve " +
        "anónimo el archivo: quiere decir que las comprobaciones que Velo sabe hacer salieron " +
        "limpias.",
      en:
        "Velo found no caveats to flag on the columns it checked. That doesn't make the file " +
        "anonymous: it means the checks Velo knows how to run came out clean.",
    },
    sinReduccion: {
      es:
        "Antes del tratamiento no había ningún registro único en las columnas cruzadas, así que " +
        "no hay reducción que medir. La cifra que importa es la de abajo: cuántos hay **ahora**.",
      en:
        "Before the treatment there were no unique records in the cross-checked columns, so " +
        "there is no reduction to measure. The figure that matters is the one below: how many " +
        "there are **now**.",
    },
    titular: {
      es:
        "de registros únicos respecto del archivo original, sobre las {qis} columnas cruzadas. " +
        "Pasó de {antes} a {despues} de {filas} registros.",
      en:
        "of unique records compared with the original file, across the {qis} cross-checked " +
        "columns. It went from {antes} to {despues} out of {filas} records.",
    },
    noTitular: {
      antes: {
        es: "La proporción de registros únicos bajó de {antes} a {despues} — una reducción del",
        en: "The share of unique records fell from {antes} to {despues} — a reduction of",
      },
      aviso: {
        es: "Esa cifra no describe un archivo tratado",
        en: "That figure doesn't describe a treated file",
      },
      despues: {
        es:
          "mientras siga en pie lo de arriba: se refiere solo al cruce de cuasi-identificadores, " +
          "y no cuenta nada de lo que quedó sin tocar.",
        en:
          "as long as what's above still stands: it refers only to the cross-check of " +
          "quasi-identifiers, and counts nothing of what was left untouched.",
      },
    },
    cifras: {
      unicosAntes: { es: "Únicos, antes", en: "Unique, before" },
      unicosDespues: { es: "Únicos, después", en: "Unique, after" },
      kAntes: { es: "Grupo mínimo, antes", en: "Minimum group, before" },
      kDespues: { es: "Grupo mínimo, después", en: "Minimum group, after" },
    },
  },

  // ── Paso 6: la entrega del archivo ──────────────────────────────────────────────────────────
  entrega: {
    panel: {
      etiqueta: { es: "Paso 6 · la entrega", en: "Step 6 · the delivery" },
      titulo: { es: "Llévate el archivo", en: "Take your file" },
      nota: {
        es:
          "El nombre no repite el del original: empieza por `velo-anonimizado-`. Un nombre " +
          "como `pacientes-2026.csv` cuenta de qué va el contenido antes de que nadie lo abra, " +
          "y ese nombre viaja en el asunto de un correo.",
        en:
          "The name doesn't repeat the original's: it starts with `velo-anonimizado-`. A name " +
          "like `pacientes-2026.csv` tells what the contents are about before anyone opens it, " +
          "and that name travels in an email's subject line.",
      },
    },
    // «Un CSV con N filas» + [«y sin la columna X»] + «. Separado por comas…». La lista de columnas
    // suprimidas es del usuario, así que va aparte. La primera y la última frase siguen a lo que el
    // worker escribe: un JSON sale como JSON (el panel decía CSV para todo; hallazgo A1 del S6).
    salida: {
      csv: {
        filas: {
          es: "Un CSV con {filas} filas",
          en: "A CSV with {filas} rows",
        },
        formato: {
          es:
            ". Separado por comas, terminado en salto de línea y sin BOM — si Excel en Windows " +
            "te pregunta por la codificación, es UTF-8.",
          en:
            ". Comma-separated, ending in a line break and with no BOM — if Excel on Windows " +
            "asks about the encoding, it's UTF-8.",
        },
      },
      json: {
        filas: {
          es: "Un JSON con {filas} registros",
          en: "A JSON file with {filas} records",
        },
        formato: {
          es:
            ". Es un arreglo con un registro compacto por línea y las claves en el orden del " +
            "original, en UTF-8 y sin BOM.",
          en:
            ". One array, one compact record per line, keys in the order the original had them, " +
            "UTF-8 with no BOM.",
        },
      },
      jsonl: {
        filas: {
          es: "Un JSON Lines con {filas} registros",
          en: "A JSON Lines file with {filas} records",
        },
        formato: {
          es:
            ". Un registro compacto por línea, con las claves en el orden del original, en UTF-8 " +
            "y sin BOM.",
          en:
            ". One compact record per line, keys in the order the original had them, UTF-8 with " +
            "no BOM.",
        },
      },
    },
    sinUna: { es: "y sin la columna", en: "and without the column" },
    sinVarias: {
      es: "y sin las {n} columnas",
      en: "and without the {n} columns",
    },
    // Los 8 caracteres del nombre no son un número de serie: son el principio del SHA-256 de la
    // política. Va partido porque en medio están los 8 caracteres.
    huella: {
      antes: {
        es: "Los ocho caracteres del nombre —",
        en: "The eight characters in the name —",
      },
      despues: {
        es:
          "— son el principio del SHA-256 de la política. Dos archivos que lo compartan " +
          "recibieron exactamente el mismo tratamiento; el reporte lleva el hash completo.",
        en:
          "— are the start of the policy's SHA-256. Two files that share it received exactly " +
          "the same treatment; the report carries the full hash.",
      },
    },
    // Solo se muestra cuando el idioma de la pantalla ya no es el del trabajo (se cambió DESPUÉS de
    // transformar): el archivo se escribió en el idioma de entonces y no se reescribe solo.
    idiomaDelTrabajo: {
      es:
        "Este archivo se escribió en **{idioma}**, el idioma que tenías al transformar: los " +
        "rótulos de un intervalo agrupado salen en él. Si lo quieres en el otro idioma, cámbialo " +
        "y vuelve a transformar.",
      en:
        "This file was written in **{idioma}**, the language you had when you transformed: the " +
        "labels of a grouped range come out in it. If you want it in the other language, switch " +
        "and transform again.",
    },
    preparar: { es: "Preparar el archivo", en: "Prepare the file" },
    preparando: { es: "Escribiendo el archivo…", en: "Writing the file…" },
    escrituraFallida: {
      es:
        "**No se pudo escribir el archivo.** Puede que el disco esté lleno o que el archivo " +
        "elegido ya no deje escribir. La transformación, la política y la llave siguen aquí: libera " +
        "espacio o elige otro destino, y vuelve a prepararlo.",
      en:
        "**The file could not be written.** The disk may be full, or the chosen file may no " +
        "longer allow writing. The transformation, the policy and the key are still here: free " +
        "some space or pick another destination, and prepare it again.",
    },
    guardar: { es: "Guardar", en: "Save" },
    // S8: alto volumen. El archivo se escribe por trozos en el que el usuario elige.
    elegirDestino: {
      es: "Elegir dónde guardarlo",
      en: "Choose where to save it",
    },
    elegirDestinoNota: {
      es:
        "Es un archivo de alto volumen: Velo lo escribe por trozos directamente en el archivo que " +
        "elijas, sin armarlo entero en la memoria de la pestaña. Nada sale de tu equipo.",
      en:
        "It is a high-volume file: Velo writes it in chunks straight into the file you choose, " +
        "without building it whole in the tab's memory. Nothing leaves your computer.",
    },
    enMemoriaNota: {
      es:
        "Es un archivo de alto volumen, y este navegador no deja elegir un archivo de destino: Velo " +
        "lo arma en la memoria de la pestaña antes de guardarlo. Con un archivo muy grande puede no " +
        "caber; en Chrome o Edge se escribe por trozos.",
      en:
        "It is a high-volume file, and this browser does not let you choose a destination file: " +
        "Velo builds it in the tab's memory before saving it. A very large file may not fit; in " +
        "Chrome or Edge it is written in chunks.",
    },
    guardadoEnTuEquipo: {
      es: "Guardado en tu equipo: **{nombre}** · {tamano}",
      en: "Saved on your computer: **{nombre}** · {tamano}",
    },
    escribeTuNavegador: {
      es: "{tamano} · lo escribe tu navegador, no un servidor",
      en: "{tamano} · written by your browser, not by a server",
    },
  },

  // ── Paso 6/7: el certificado (y el reporte del diagnóstico, que es el mismo componente) ─────
  certificado: {
    pendiente: {
      etiqueta: {
        es: "Paso 7 · el certificado",
        en: "Step 7 · the certificate",
      },
      titulo: {
        es: "Primero el archivo, después su certificado",
        en: "First the file, then its certificate",
      },
      // «SHA-256» va aparte (en negrita y en tinta plena): el nombre propio no es copy.
      antes: {
        es: "El certificado lleva la huella",
        en: "The certificate carries the",
      },
      despues: {
        es:
          "del archivo tratado, y esa huella no existe hasta que el archivo existe. Genera el " +
          "archivo en el paso de arriba y el certificado aparece aquí.",
        en:
          "fingerprint of the treated file, and that fingerprint doesn't exist until the file " +
          "does. Generate the file in the step above and the certificate shows up here.",
      },
      // La diferencia entre un papel que *describe* y uno que se puede **comprobar**.
      diferencia: {
        antes: {
          es: "Es la diferencia entre un papel que",
          en: "It's the difference between a paper that",
        },
        describe: { es: "describe", en: "describes" },
        medio: {
          es: "un tratamiento y uno que se puede",
          en: "a treatment and one you can",
        },
        comprobar: { es: "comprobar", en: "verify" },
        despues: {
          es: "contra el archivo que tienes en la mano.",
          en: "against the file you have in your hands.",
        },
      },
    },
    etiqueta: {
      certificado: {
        es: "El certificado",
        en: "The certificate",
      },
      reporte: { es: "Reporte", en: "Report" },
    },
    titulo: {
      certificado: {
        es: "Llévate el certificado del tratamiento",
        en: "Take the treatment certificate with you",
      },
      reporte: {
        es: "Llévate el diagnóstico",
        en: "Take the diagnosis with you",
      },
    },
    nota: {
      certificado: {
        es:
          "Lleva las **dos huellas**: la del archivo que entró y la del que te llevas. Quien lo " +
          "reciba puede recalcular la segunda y comprobar que este documento habla de **esa " +
          "copia exacta** — el documento le explica cómo, con el comando de su sistema.",
        en:
          "It carries **both fingerprints**: the one for the file that came in and the one for " +
          "the file you take away. Whoever receives it can recompute the second and check that " +
          "this document is about **that exact copy** — the document explains how, with the " +
          "command for their system.",
      },
      reporte: {
        es:
          "El reporte lleva la huella **SHA-256** de tu archivo, así que quien lo reciba puede " +
          "comprobar que habla de esa copia exacta y no de otra.",
        en:
          "The report carries the **SHA-256** fingerprint of your file, so whoever receives it " +
          "can check that it is about that exact copy and not another.",
      },
    },
    formato: {
      es: "Un archivo HTML que se abre con doble clic en cualquier computador, sin internet y sin instalar nada.",
      en: "An HTML file that opens with a double click on any computer, with no internet and nothing to install.",
    },
    lleva: {
      etiqueta: { es: "Lleva:", en: "Carries:" },
      base: {
        es:
          "nombres de columna, qué se detectó y por qué, categorías de la Ley 1581, las cifras " +
          "de riesgo, la huella del archivo y la fecha",
        en:
          "column names, what was detected and why, Colombia's Law 1581 categories, the risk " +
          "figures, the file's fingerprint and the date",
      },
      tratamiento: {
        es:
          "— y, porque transformaste, **qué se le hizo**: el balance con sus salvedades, la " +
          "utilidad que se perdió, el hash de la política aplicada y **la huella del archivo " +
          "que sale**",
        en:
          "— and, because you transformed the file, **what was done to it**: the balance with " +
          "its caveats, the utility that was lost, the hash of the policy applied and **the " +
          "fingerprint of the file that goes out**",
      },
    },
    noLleva: {
      etiqueta: { es: "No lleva:", en: "Does not carry:" },
      cuerpo: {
        es:
          "ninguna fila de tu tabla. Las muestras van enmascaradas y las columnas sensibles no " +
          "llevan ni muestra.",
        en:
          "any row of your table. Samples are masked, and sensitive columns don't even carry a " +
          "sample.",
      },
    },
    descargar: {
      certificado: {
        es: "Descargar el certificado",
        en: "Download the certificate",
      },
      reporte: { es: "Descargar el reporte", en: "Download the report" },
      fallo: {
        es: "No se pudo armar el documento. Vuelve a intentarlo: tus datos siguen en este equipo.",
        en: "The document could not be built. Try again: your data is still on this device.",
      },
    },
    vistaPrevia: {
      ver: { es: "Ver antes de descargar", en: "Preview before downloading" },
      cerrar: { es: "Cerrar la vista", en: "Close the preview" },
      tituloCertificado: {
        es: "Vista previa del certificado",
        en: "Certificate preview",
      },
      tituloReporte: { es: "Vista previa del reporte", en: "Report preview" },
    },
  },

  // ── Paso 8: anotar en la bitácora ───────────────────────────────────────────────────────────
  anotar: {
    etiqueta: { es: "Paso 8 · la bitácora", en: "Step 8 · the log" },
    titulo: {
      es: "Anótalo, para acordarte dentro de seis meses",
      en: "Log it, so you remember six months from now",
    },
    nota: {
      es:
        "El certificado prueba **este** tratamiento ante quien lo reciba. La bitácora es para " +
        "ti: qué has entregado, cuándo y con qué criterio, cuando alguien te lo pregunte más " +
        "adelante.",
      en:
        "The certificate proves **this** treatment to whoever receives it. The log is for you: " +
        "what you've handed over, when and by what criteria, for when someone asks you later.",
    },
    cuerpo: {
      es:
        "Se anotan el nombre del archivo, la fecha, las técnicas que aplicaste —sin decir a qué " +
        "columnas—, las dos huellas y las proporciones de registros únicos antes y después.",
      en:
        "What gets logged: the file name, the date, the techniques you applied —without saying " +
        "which columns—, both fingerprints and the share of unique records before and after.",
    },
    aqui: { es: "Aquí:", en: "Here:" },
    boton: { es: "Anotar en mi bitácora", en: "Add to my log" },
    despues: {
      es:
        "Te lleva a tu bitácora con la anotación lista. Allí eliges la frase, o abres la que ya " +
        "tienes para añadírsela al final.",
      en:
        "Takes you to your log with the entry ready. There you choose the passphrase, or open " +
        "the log you already have to add it at the end.",
    },
  },
} as const satisfies Catalogo;
