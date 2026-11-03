// El reporte exportable — un archivo HTML que se abre solo, en cualquier computador, sin internet.
//
// Es el entregable que sale de Velo y entra en un correo, un ticket o una carpeta compartida. De
// ahí sus tres reglas:
//
//   1. **Autocontenido de verdad.** Ni una fuente, ni una hoja de estilos, ni una imagen que
//      venga de fuera. Un `<link>` a un CDN convertiría un documento que promete que nada salió
//      del navegador en uno que pide permiso a un servidor cada vez que se abre — y delataría a
//      quién lo abre, y cuándo. `tests/unit/reporte.test.ts` lo verifica barriendo el HTML.
//   2. **Ninguna fila del archivo.** Van nombres de columna, tipos, categorías, cifras y muestras
//      YA enmascaradas. Lo dice el propio reporte, para que quien lo reciba no tenga que confiar.
//   3. **Determinista.** Mismo informe + misma fecha + mismo idioma ⇒ mismo archivo, byte por byte.
//      La fecha y el idioma se inyectan desde afuera precisamente por eso: la fecha es lo único que
//      cambiaría solo, y el idioma (que además queda escrito dentro del documento) lo elige quien
//      lo descarga. Cada idioma es una redacción propia, no una traducción mecánica del otro.
//
// Y una regla de escritura: todo lo que venga del archivo del usuario —el nombre del archivo, los
// nombres de columna, las muestras— se escapa. Este documento lo va a abrir alguien más, y una
// columna llamada `<script>` no puede convertirse en un script.

import {
  epsilon as epsilonEnTexto,
  numero,
  porcentaje,
  unoEn,
} from "@/lib/formato";
import {
  decir,
  formatoNumerico,
  interpolar,
  LOCALE,
  plural,
  tramos,
  type Datos,
  type Idioma,
  type Texto,
} from "@/lib/idioma";
import { decirMensaje } from "@/lib/idioma/mensajes";
import { DOCUMENTOS as D } from "@/lib/idioma/textos/documentos";
import { MOTOR_TRANSFORMAR as M } from "@/lib/idioma/textos/motor-transformar";
import { PRIVACIDAD as P } from "@/lib/idioma/textos/privacidad";
import {
  escaleraEnPalabras,
  nivelEnPalabras,
} from "@/lib/tecnicas-en-palabras";

import type { BalanceDelTratamiento, Salvedad } from "./balance";
import type { JerarquiaDeFabrica } from "./jerarquias/fabrica";
import { FUENTES, FUENTES_DE_LA_ESCALERA } from "./jerarquias/fuentes";
import type { GeneralizacionAplicada } from "./optima";
import type { InformeDePrivacidad } from "./ruido";
import { DOMINIO_MAXIMO } from "./ruido/limites";
import type { Diagnostico, HallazgoDeColumna } from "./clasificador";
import type {
  ColumnaRestaurada,
  Restauracion,
  SalvedadDelRegreso,
} from "./restaurar";
import type { AdvisorDeQis, RiesgoExacto } from "./riesgo";
import type { Utilidad } from "./utilidad";
import type { CategoriaLey1581 } from "./validadores/tipos";

export interface DatosDelTratamiento {
  balance: BalanceDelTratamiento;
  /** `null` en alto volumen (S8): no se mide, y la sección lo dice. */
  utilidad: Utilidad | null;
  /** Identidad de la política aplicada: mismo hash ⇒ mismo tratamiento. */
  hashDePolitica: string;
  /**
   * El idioma del TRABAJO: el de la pantalla cuando se pulsó «transformar», con el que Velo
   * escribió los rótulos de dentro del archivo (los de un intervalo de Mondrian). Sale del
   * resultado de la transformación, **no** del idioma del documento: este puede ser otro (se pide
   * al descargar, y decide en qué idioma se redacta el certificado), y por eso el certificado lo
   * declara — quien reciba el archivo sabe en qué idioma leer sus rótulos.
   */
  idiomaDelTrabajo: Idioma;
  suprimidas: readonly string[];
  /**
   * SHA-256 del archivo que SALE, calculado en el worker sobre los bytes del `Blob`.
   *
   * **Es lo que convierte este documento de una declaración en un certificado** (S4). Hasta el S3
   * el documento llevaba una sola huella —la del archivo que entró— y un párrafo explicando que no
   * era la del archivo entregado; sincero, y por eso mismo la prueba de que faltaba algo. Con las
   * dos, quien reciba el archivo tratado puede recalcular su huella y comprobar **que este
   * documento habla de la copia que tiene en la mano**, no de otra parecida.
   */
  sha256DeSalida: string;
  /** Nombre del archivo tratado. Va en el comando de verificación, para poder copiarlo y pegarlo. */
  nombreDeSalida: string;
  /** S7: la generalización óptima tal como se aplicó; ausente o `null` con Mondrian. */
  generalizacion?: GeneralizacionAplicada | null;
  /** S7: el ruido con garantía de cada columna y el ε por fila; ausente o `null` sin ruido. */
  privacidad?: InformeDePrivacidad | null;
}

export interface DatosDelReporte {
  archivo: { nombre: string; bytes: number; sha256: string };
  diagnostico: Diagnostico;
  riesgo: RiesgoExacto;
  advisor: AdvisorDeQis;
  /** Fecha ya formateada por quien llama. Inyectada para que el reporte sea reproducible. */
  fecha: string;
  /**
   * El idioma del documento. Entra como dato, igual que la fecha, y por la misma razón: el
   * documento es una función pura de lo que recibe. Mismo informe + misma fecha + mismo idioma ⇒
   * mismo archivo, byte por byte; el idioma queda además escrito dentro del documento (`lang`).
   */
  idioma: Idioma;
  /** Presente solo cuando el archivo se transformó. Sin él, el reporte es el diagnóstico del S1. */
  tratamiento?: DatosDelTratamiento;
}

/** Escapa lo que venga del archivo del usuario. Sin excepciones ni "es solo un número". */
export function escapar(texto: string): string {
  return texto
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Un texto del catálogo, como HTML.
 *
 * El texto del catálogo es de confianza; los DATOS que se interpolan en él no. Por eso el énfasis
 * se resuelve sobre la plantilla (antes de llenarla) y cada dato de cadena se escapa — una columna
 * llamada `**x**` o `<script>` es un nombre, nunca marcado. Los datos cuyo nombre termina en
 * `_html` ya son HTML armado aquí (listas de `<code>`) y pasan tal cual.
 */
export function h(texto: Texto, idioma: Idioma, datos: Datos = {}): string {
  const seguros: Record<string, string | number> = {};
  for (const [nombre, valor] of Object.entries(datos))
    seguros[nombre] =
      typeof valor === "string" && !nombre.endsWith("_html")
        ? escapar(valor)
        : valor;
  return tramos(texto[idioma])
    .map((tramo) => {
      const cuerpo = interpolar(escapar(tramo.texto), idioma, seguros);
      if (tramo.tipo === "negrita") return `<b>${cuerpo}</b>`;
      if (tramo.tipo === "codigo") return `<code>${cuerpo}</code>`;
      if (tramo.tipo === "alerta") return `<b class="alerta">${cuerpo}</b>`;
      return cuerpo;
    })
    .join("");
}

/** Una lista de nombres de columna como `<code>a</code> · <code>b</code>`. */
function listaDeCodigo(nombres: readonly string[], separador = " · "): string {
  return nombres.map((n) => `<code>${escapar(n)}</code>`).join(separador);
}

/** Un decimal fijo con la convención del idioma (los bits y la V de Cramér). */
function decimales(valor: number, cuantos: number, idioma: Idioma): string {
  return formatoNumerico(idioma, {
    minimumFractionDigits: cuantos,
    maximumFractionDigits: cuantos,
  }).format(valor);
}

export function megabytes(valor: number, idioma: Idioma): string {
  if (valor < 1024 * 1024) {
    return `${formatoNumerico(idioma, { maximumFractionDigits: 0 }).format(valor / 1024)} KB`;
  }
  const mb = valor / (1024 * 1024);
  return `${formatoNumerico(idioma, { maximumFractionDigits: mb < 10 ? 1 : 0 }).format(mb)} MB`;
}

const CATEGORIA: Record<CategoriaLey1581, Texto> = {
  "identificador-directo": D.columnas.categorias.identificadorDirecto,
  "cuasi-identificador": D.columnas.categorias.cuasiIdentificador,
  "dato-sensible": D.columnas.categorias.datoSensible,
  "no-personal": D.columnas.categorias.noPersonal,
};

const CERTEZA: Record<HallazgoDeColumna["certeza"], Texto> = {
  "algoritmo-oficial": D.columnas.certezas.algoritmoOficial,
  estructural: D.columnas.certezas.estructural,
  "sin-confirmar": D.columnas.certezas.sinConfirmar,
};

// El sello, dibujado a mano en el propio documento. Ver `src/components/sello.tsx`: si viniera de
// una URL, la marca que promete que nada salió del navegador estaría hecha de algo que sí salió.
export const SELLO = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
<circle cx="12" cy="12" r="10.25" fill="none" stroke="currentColor" stroke-width="1.2"/>
<circle cx="12" cy="12" r="7.75" fill="none" stroke="currentColor" stroke-width=".7" stroke-dasharray="1.1 1.9" stroke-linecap="round" opacity=".65"/>
<path d="M7.6 9.9h8.8M9.4 12h5.2M7.6 14.1h8.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;

// Tipografía del sistema: una fuente web obligaría a una petición, y embeberla en base64 hincharía
// el archivo por pura decoración. Georgia y la mono del sistema conservan el carácter sin costo.
// Dos decisiones de estas reglas que merecen su porqué (viven aquí y no como comentarios dentro del CSS,
// porque un comentario dentro de la plantilla viajaría escrito en cada documento descargado — también en
// el inglés — y un documento no debe llevar notas del código que lo armó):
//   · `td.col` tiene un ancho mínimo que no es cosmético: sin él la columna se estrecha tanto que un
//     nombre como cedula_titular se parte a la mitad ("cedula_ti / tular") y deja de ser reconocible, que
//     es justo lo único que esa celda tiene que lograr. `overflow-wrap` parte solo si de verdad no cabe.
//   · Las salvedades van antes que la cifra, y se ven antes que la cifra. Que la descalificante pese más
//     que la que solo matiza no es decoración: es la diferencia entre "esto desmiente el número" y "esto
//     lo acompaña".
export const ESTILOS = `
:root{--papel:#fbf9f4;--superficie:#fff;--borde:#e2dccf;--tinta:#1a211d;--tinta-suave:#4f5a55;
--tinta-tenue:#626b66;--acento:#0d6b57;--acento-tenue:#e4f0eb;--alerta:#9e3222;--alerta-tenue:#f8e9e5;
--aviso:#7c5209;--aviso-tenue:#f6eedb;--sensible:#71355c;--sensible-tenue:#f4e9f0}
@media(prefers-color-scheme:dark){:root{--papel:#0f1411;--superficie:#171d19;--borde:#2a322d;
--tinta:#ede8dc;--tinta-suave:#aab3ad;--tinta-tenue:#8b948e;--acento:#5cc7a6;--acento-tenue:#12312a;
--alerta:#ef8e78;--alerta-tenue:#35201b;--aviso:#dda945;--aviso-tenue:#322816;--sensible:#dc98c0;
--sensible-tenue:#2f1e2a}}
*{box-sizing:border-box}
body{margin:0;background:var(--papel);color:var(--tinta);font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
.hoja{max-width:820px;margin:0 auto;padding:32px 20px 72px}
h1{font-family:Georgia,"Times New Roman",serif;font-size:1.9rem;line-height:1.15;margin:6px 0 4px;font-weight:600}
h2{font-family:Georgia,serif;font-size:1.25rem;margin:0 0 10px;font-weight:600}
.etiqueta{font-family:ui-monospace,Menlo,monospace;font-size:.72rem;letter-spacing:.18em;text-transform:uppercase;color:var(--tinta-tenue);margin:0}
.sello{display:inline-flex;align-items:center;gap:8px;color:var(--acento);border:1px solid var(--acento);
border-radius:999px;padding:5px 14px 5px 10px;font-size:.85rem;font-weight:600}
section{background:var(--superficie);border:1px solid var(--borde);border-radius:12px;padding:18px 20px;margin:20px 0}
dl.datos{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px 20px;margin:0}
dt{font-size:.75rem;color:var(--tinta-tenue);margin:0}
dd{margin:2px 0 0;font-variant-numeric:tabular-nums;font-weight:600}
dd small{font-weight:400;color:var(--tinta-suave)}
.cifrota{font-family:Georgia,serif;font-size:3rem;line-height:1;font-weight:600;font-variant-numeric:tabular-nums;margin:0}
.alerta{color:var(--alerta)}.aviso{color:var(--aviso)}
table{width:100%;border-collapse:collapse;font-size:.85rem}
th,td{text-align:left;vertical-align:top;padding:8px 10px 8px 0;border-bottom:1px solid var(--borde)}
th{font-family:ui-monospace,Menlo,monospace;font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;color:var(--tinta-tenue);font-weight:400}
td.col{font-family:ui-monospace,Menlo,monospace;min-width:11rem;overflow-wrap:break-word;word-break:normal}
.chip{display:inline-block;border-radius:8px;padding:2px 7px;font-size:.72rem;font-weight:600;white-space:nowrap}
.c-identificador-directo{background:var(--alerta-tenue);color:var(--alerta)}
.c-cuasi-identificador{background:var(--aviso-tenue);color:var(--aviso)}
.c-dato-sensible{background:var(--sensible-tenue);color:var(--sensible)}
.c-no-personal{background:var(--papel);color:var(--tinta-tenue)}
.por-que{color:var(--tinta-tenue);font-size:.75rem;margin:4px 0 0}
.por-que code{font-family:ui-monospace,Menlo,monospace}
ul.limpia{list-style:none;padding:0;margin:0}
ul.limpia li{border:1px solid var(--borde);border-radius:8px;padding:7px 10px;margin-top:7px;
display:flex;flex-wrap:wrap;gap:6px 14px;justify-content:space-between;font-size:.85rem}
ul.limpia li b{font-variant-numeric:tabular-nums}
.sola{border-color:var(--alerta);background:var(--alerta-tenue)}
ul.salvedades li{display:block;line-height:1.5;border-left-width:3px}
ul.salvedades li.s-descalifica{border-color:var(--alerta);background:var(--alerta-tenue)}
ul.salvedades li.s-matiza{border-color:var(--aviso);background:var(--aviso-tenue)}
ul.salvedades code{font-family:ui-monospace,Menlo,monospace}
.huella{font-family:ui-monospace,Menlo,monospace;font-size:.78rem;word-break:break-all;color:var(--tinta-suave)}
footer{color:var(--tinta-tenue);font-size:.8rem;line-height:1.55;border-top:1px solid var(--borde);padding-top:16px;margin-top:28px}
footer p{margin:0 0 8px}
@media print{body{background:#fff}section{break-inside:avoid}}
`;

function tonoDelRiesgo(riesgo: RiesgoExacto): string {
  if (riesgo.proporcionUnicos >= 0.2) return "alerta";
  if (riesgo.unicos > 0) return "aviso";
  return "";
}

function filaDeColumna(columna: HallazgoDeColumna, idioma: Idioma): string {
  const porQue = columna.evidencia
    .map((evidencia) => {
      if (evidencia.origen === "validador") {
        const proporcion =
          evidencia.muestreados > 0
            ? evidencia.aciertos / evidencia.muestreados
            : 0;
        return `<p class="por-que">${h(D.columnas.cumplen, idioma, {
          pct: porcentaje(proporcion, idioma),
          n: evidencia.muestreados,
        })}<br><code>${escapar(decirMensaje(evidencia.fuente, idioma))}</code></p>`;
      }
      return `<p class="por-que">${escapar(decirMensaje(evidencia.nota, idioma))}</p>`;
    })
    .join("");

  const muestra =
    columna.muestra === null
      ? `<em>${h(D.columnas.vacia, idioma)}</em>`
      : columna.muestra.omitida
        ? `<em>${h(D.columnas.sinMuestra, idioma)}</em>`
        : `<code>${escapar(columna.muestra.texto)}</code>`;

  return `<tr>
<td class="col">${escapar(columna.nombre)}<br><small style="color:var(--tinta-tenue)">${h(
    columna.cardinalidadAlMenos
      ? D.columnas.masDeValoresDistintos
      : D.columnas.valoresDistintos,
    idioma,
    { n: columna.cardinalidad },
  )}</small></td>
<td><b>${escapar(decirMensaje(columna.etiqueta, idioma))}</b><br><small>${h(CERTEZA[columna.certeza], idioma)}</small>${porQue}</td>
<td><span class="chip c-${columna.categoria}">${h(CATEGORIA[columna.categoria], idioma)}</span></td>
<td>${muestra}</td>
</tr>`;
}

function seccionDeRiesgo(
  riesgo: RiesgoExacto,
  identificadoresDirectos: number,
  hayTratamiento: boolean,
  idioma: Idioma,
): string {
  // Con un tratamiento en el documento, esta sección deja de ser «el riesgo» y pasa a ser «el
  // riesgo del archivo que entró». Sin decirlo, sus cifras se leerían como las del archivo que se
  // descarga — la misma composición que este sprint tiene prohibida, cometida por omisión.
  const deQue = hayTratamiento ? decir(D.riesgo.deQueOriginal, idioma) : "";
  if (riesgo.qis.length === 0) {
    return `<section>
<p class="etiqueta">${h(D.riesgo.etiquetaSinCruce, idioma, { deQue })}</p>
<h2>${h(D.riesgo.sinCruceTitulo, idioma)}</h2>
<p>${h(D.riesgo.sinCruceTexto, idioma)}</p>
</section>`;
  }

  return `<section>
<p class="etiqueta">${h(D.riesgo.etiqueta, idioma, { deQue })}</p>
<h2>${h(hayTratamiento ? D.riesgo.tituloOriginal : D.riesgo.titulo, idioma)}</h2>
<p class="cifrota ${tonoDelRiesgo(riesgo)}">${porcentaje(riesgo.proporcionUnicos, idioma)}</p>
<p>${h(D.riesgo.unicos, idioma, { unicos: riesgo.unicos, filas: riesgo.filas })}</p>${
    identificadoresDirectos > 0
      ? `\n<p class="por-que">${h(
          plural(
            identificadoresDirectos,
            D.riesgo.noCuentaUna,
            D.riesgo.noCuentaVarias,
          ),
          idioma,
          { n: identificadoresDirectos },
        )}</p>`
      : ""
  }
<dl class="datos">
<div><dt>${h(D.riesgo.grupoMasPequeno, idioma)}</dt><dd>${numero(riesgo.kMinimo, idioma)} <small>${h(
    plural(riesgo.kMinimo, D.riesgo.persona, D.riesgo.personas),
    idioma,
  )}</small></dd></div>
<div><dt>${h(D.riesgo.masExpuesto, idioma)}</dt><dd>${unoEn(riesgo.riesgoMaximo, idioma)}</dd></div>
<div><dt>${h(D.riesgo.promedio, idioma)}</dt><dd>${unoEn(riesgo.riesgoPromedio, idioma)}</dd></div>
<div><dt>${h(D.riesgo.gruposDistintos, idioma)}</dt><dd>${numero(riesgo.clases, idioma)}</dd></div>
</dl>
<p class="por-que" style="margin-top:14px">${h(
    D.riesgo.columnasCruzadas,
    idioma,
    {
      lista_html: listaDeCodigo(riesgo.qis),
    },
  )}</p>
<p class="por-que">${h(D.riesgo.modelo, idioma)}</p>
</section>`;
}

function seccionDelAdvisor(
  advisor: AdvisorDeQis,
  filas: number,
  idioma: Idioma,
): string {
  const solas = advisor.identificanSolas.length
    ? `<h2 style="margin-top:18px;font-size:1.05rem">${h(D.advisor.solasTitulo, idioma)}</h2>
<ul class="limpia">${advisor.identificanSolas
        .map(
          (columna) =>
            `<li class="sola"><code>${escapar(columna.nombre)}</code><span>${h(
              D.advisor.sola,
              idioma,
              {
                pct: porcentaje(columna.proporcionUnicos, idioma),
                unicos: columna.unicos,
                filas,
              },
            )}</span></li>`,
        )
        .join("")}</ul>`
    : "";

  const combinaciones = advisor.combinaciones.length
    ? `<h2 style="margin-top:18px;font-size:1.05rem">${h(D.advisor.combinacionesTitulo, idioma)}</h2>
<ul class="limpia">${advisor.combinaciones
        .slice(0, 10)
        .map(
          (combinacion) =>
            `<li><code>${combinacion.columnas.map(escapar).join(" + ")}</code><span>${h(
              D.advisor.combinacion,
              idioma,
              {
                pct: porcentaje(combinacion.proporcionUnicos, idioma),
                k: combinacion.k,
              },
            )}</span></li>`,
        )
        .join("")}</ul>`
    : `<p>${h(D.advisor.sinCombinaciones, idioma)}</p>`;

  const excluidas = advisor.excluidas.length
    ? `<p class="por-que" style="margin-top:14px">${h(
        D.advisor.quedaronFuera,
        idioma,
        {
          lista_html: advisor.excluidas
            .map((e) =>
              h(D.advisor.excluida, idioma, {
                nombre: e.nombre,
                motivo: decirMensaje(e.motivo, idioma),
              }),
            )
            .join("; "),
        },
      )}</p>`
    : "";

  return `<section>
<p class="etiqueta">${h(D.advisor.etiqueta, idioma)}</p>
${solas}
${combinaciones}
<p class="por-que" style="margin-top:14px">${h(D.advisor.evaluo, idioma, {
    evaluadas: advisor.combinacionesEvaluadas,
    candidatas: advisor.candidatos.length,
    maximo: advisor.tope.candidatosMaximos,
    tamano: advisor.tope.tamanoMaximo,
  })}</p>
${excluidas}
</section>`;
}

// ── El tratamiento ────────────────────────────────────────────────────────────────────────────
//
// El orden de este bloque ES el contrato, no una preferencia de maquetación: las salvedades se
// escriben ANTES que la cifra de reducción. Un lector que se detenga en el primer párrafo tiene que
// haber leído lo que descalifica el número, no el número. `tests/unit/reporte.test.ts` compara las
// posiciones en el documento — un test de composición, no de cifra. El orden es el mismo en los
// dos idiomas: lo fija esta función, no el catálogo.

function itemDeSalvedad(salvedad: Salvedad, idioma: Idioma): string {
  const S = D.tratamiento.salvedades;
  const cuerpo = (() => {
    switch (salvedad.tipo) {
      case "identificadores-sin-tratar":
        return h(
          plural(
            salvedad.columnas.length,
            S.identificadoresSinTratarUna,
            S.identificadoresSinTratarVarias,
          ),
          idioma,
          {
            n: salvedad.columnas.length,
            lista_html: listaDeCodigo(salvedad.columnas),
          },
        );
      case "ruido-no-aplicado":
        return h(S.ruidoNoAplicado, idioma, {
          n: salvedad.columnas.length,
          maximo: numero(salvedad.maximo, idioma),
          lista_html: listaDeCodigo(salvedad.columnas),
        });
      case "reticula-excede-tope":
        return h(S.reticulaExcedeTope, idioma, {
          n: salvedad.columnas.length,
          nodos: numero(salvedad.nodos, idioma),
          tope: numero(salvedad.tope, idioma),
          lista_html: listaDeCodigo(salvedad.columnas),
        });
      case "reparto-sin-k":
        return h(
          plural(
            salvedad.columnas.length,
            S.repartoSinKUna,
            S.repartoSinKVarias,
          ),
          idioma,
          {
            n: salvedad.columnas.length,
            lista_html: listaDeCodigo(salvedad.columnas),
          },
        );
      case "unicos-restantes":
        return h(S.unicosRestantes, idioma, {
          cuantos: salvedad.cuantos,
          proporcion: porcentaje(salvedad.proporcion, idioma),
        });
      case "k-no-alcanzado":
        return h(S.kNoAlcanzado, idioma, {
          objetivo: salvedad.kObjetivo,
          alcanzado: salvedad.kAlcanzado,
        });
      case "k-del-reparto-no-es-el-del-archivo":
        return h(S.kDelRepartoNoEsDelArchivo, idioma, {
          reparto: salvedad.kDelReparto,
          archivo: salvedad.kDelArchivo,
        });
      case "clases-homogeneas":
        return h(S.clasesHomogeneas, idioma, {
          filas: salvedad.filas,
          atributo: salvedad.atributo,
        });
      case "colisiones-de-seudonimo":
        return h(
          plural(salvedad.cuantas, S.colisionesUna, S.colisionesVarias),
          idioma,
          { columna: salvedad.columna, cuantas: salvedad.cuantas },
        );
    }
  })();
  return `<li class="s-${salvedad.gravedad}">${cuerpo}</li>`;
}

export function seccionDelTratamiento(
  datos: DatosDelTratamiento,
  idioma: Idioma,
): string {
  const { balance, hashDePolitica, idiomaDelTrabajo, suprimidas } = datos;
  const { antes, despues, reduccion, salvedades } = balance;
  const T = D.tratamiento;

  const bloqueDeSalvedades = salvedades.length
    ? `<ul class="salvedades limpia">${salvedades.map((s) => itemDeSalvedad(s, idioma)).join("")}</ul>`
    : `<p class="por-que">${h(T.sinSalvedades, idioma)}</p>`;

  const cifra = (() => {
    if (reduccion === null) {
      return `<p>${h(T.sinReduccion, idioma)}</p>`;
    }
    if (balance.esTitular) {
      return `<p class="cifrota">−<b class="reduccion">${porcentaje(reduccion, idioma)}</b></p>
<p>${h(T.reduccionTitular, idioma, {
        qis: antes.qis.length,
        antes: antes.unicos,
        despues: despues.unicos,
        filas: antes.filas,
      })}</p>`;
    }
    return `<p>${h(T.reduccionConSalvedades, idioma, {
      antes: porcentaje(antes.proporcionUnicos, idioma),
      despues: porcentaje(despues.proporcionUnicos, idioma),
      reduccion_html: `<b class="reduccion">${porcentaje(reduccion, idioma)}</b>`,
    })}</p>`;
  })();

  return `<section>
<p class="etiqueta">${h(T.etiqueta, idioma)}</p>
<h2>${h(T.titulo, idioma)}</h2>
${bloqueDeSalvedades}
${cifra}
<dl class="datos" style="margin-top:16px">
<div><dt>${h(T.unicosAntes, idioma)}</dt><dd>${numero(antes.unicos, idioma)} <small>${porcentaje(
    antes.proporcionUnicos,
    idioma,
  )}</small></dd></div>
<div><dt>${h(T.unicosDespues, idioma)}</dt><dd class="${
    despues.unicos > 0 ? "alerta" : ""
  }">${numero(despues.unicos, idioma)} <small>${porcentaje(despues.proporcionUnicos, idioma)}</small></dd></div>
<div><dt>${h(T.grupoAntes, idioma)}</dt><dd>${numero(antes.kMinimo, idioma)}</dd></div>
<div><dt>${h(T.grupoDespues, idioma)}</dt><dd>${numero(despues.kMinimo, idioma)}</dd></div>
</dl>
<p class="por-que" style="margin-top:14px">${h(T.mismoCalculo, idioma, {
    suprimidas_html: suprimidas.length
      ? h(T.suprimidasLista, idioma, { lista_html: listaDeCodigo(suprimidas) })
      : h(T.ningunaSuprimida, idioma),
  })}</p>
<p class="por-que">${h(D.comun.huellaDelTratamiento, idioma)}</p>
<p class="huella">${escapar(hashDePolitica)}</p>
<p class="por-que">${h(T.idiomaDelTrabajo, idioma, {
    // El nombre del idioma va en el idioma del DOCUMENTO; los dos rótulos, tal como quedaron
    // escritos en el archivo (en el idioma del TRABAJO) y sin los espacios de borde.
    idioma: decir(
      idiomaDelTrabajo === "es"
        ? T.nombreDelIdioma.espanol
        : T.nombreDelIdioma.ingles,
      idioma,
    ),
    separador: decir(M["salida.mondrian.separador"], idiomaDelTrabajo).trim(),
    vacio: decir(M["salida.mondrian.sufijoVacio"], idiomaDelTrabajo).trim(),
  })}</p>
</section>`;
}

/**
 * Cómo se llegó al k con la generalización óptima (S7): cada columna con su escalera y el nivel
 * elegido, el k y la ℓ medidos, y la fuente y la fecha de cada escalera de fábrica que se usó.
 */
function seccionDeLaGeneralizacion(
  g: GeneralizacionAplicada,
  idioma: Idioma,
): string {
  const G = D.generalizacion;
  const filas = g.columnas
    .map(
      (c) => `<tr>
<td class="col">${escapar(c.nombre)}</td>
<td>${escapar(escaleraEnPalabras(c.jerarquia, idioma))}</td>
<td><b>${escapar(nivelEnPalabras(c.nivel, idioma))}</b></td>
</tr>`,
    )
    .join("");
  const citadas = [
    ...new Set(
      g.columnas.flatMap((c) =>
        c.jerarquia.tipo in FUENTES_DE_LA_ESCALERA
          ? FUENTES_DE_LA_ESCALERA[c.jerarquia.tipo as JerarquiaDeFabrica]
          : [],
      ),
    ),
  ];
  const fuentes = citadas
    .map(
      (clave) =>
        `<li>${h(G.fuentes[clave], idioma)} · <code>${escapar(FUENTES[clave].url)}</code> · ${h(
          G.consultada,
          idioma,
          { fecha: FUENTES[clave].consultada },
        )}</li>`,
    )
    .join("");
  const exigida =
    g.lObjetivo === null
      ? ""
      : `<p>${h(G.l, idioma, {
          columnas_html: listaDeCodigo(g.columnasSensibles),
          objetivo: g.lObjetivo,
          alcanzado: g.lAlcanzado ?? 0,
        })}</p>${
          (g.lAlcanzado ?? 0) < g.lObjetivo
            ? `<p class="alerta">${h(G.lNoAlcanzada, idioma, { objetivo: g.lObjetivo })}</p>`
            : ""
        }`;
  // La ℓ pedida sobre una columna que la política suprime no se exigió: se dice, aunque no quede
  // ninguna otra columna sobre la que exigirla.
  const descartada =
    g.lDescartadas.length === 0
      ? ""
      : `<p>${h(G.lDescartadas, idioma, { columnas_html: listaDeCodigo(g.lDescartadas) })}</p>`;
  const diversidad = exigida + descartada;

  return `<section>
<p class="etiqueta">${h(G.etiqueta, idioma)}</p>
<h2>${h(G.titulo, idioma)}</h2>
<p>${h(G.explicacion, idioma, {
    total: numero(g.nodosEnLaReticula, idioma),
    revisadas: numero(g.nodosRevisados, idioma),
  })}</p>
<p>${h(G.k, idioma, { objetivo: g.kObjetivo, alcanzado: g.kAlcanzado })}</p>
${diversidad}
<table style="margin-top:16px">
<thead><tr><th>${h(G.encabezados.columna, idioma)}</th><th>${h(G.encabezados.escalera, idioma)}</th><th>${h(G.encabezados.nivel, idioma)}</th></tr></thead>
<tbody>${filas}</tbody></table>
${
  fuentes
    ? `<h2 style="margin-top:18px;font-size:1.05rem">${h(G.fuentesTitulo, idioma)}</h2>
<ul class="limpia">${fuentes}</ul>`
    : ""
}
</section>`;
}

/**
 * El ruido con garantía (S7): cada columna con su mecanismo, su ε efectivo y su alcance, y el ε por
 * fila. Sección APARTE del balance: el k y ε no se suman, y el documento no los pone juntos.
 */
function seccionDePrivacidad(
  privacidad: InformeDePrivacidad,
  idioma: Idioma,
): string {
  const conEpsilon = privacidad.columnas.some(
    (c) => c.aplicado && c.epsilonEfectivo !== null,
  );
  const filas = privacidad.columnas
    .map((c) => {
      const notas: string[] = [];
      if (!c.aplicado)
        notas.push(
          h(
            c.dominioAlMenos ? P.notas.noAplicadaAlMenos : P.notas.noAplicada,
            idioma,
            {
              n: numero(c.dominio ?? 0, idioma),
              maximo: numero(DOMINIO_MAXIMO, idioma),
            },
          ),
        );
      else {
        if (c.dominio !== null)
          notas.push(
            h(P.notas.dominio, idioma, { n: numero(c.dominio, idioma) }),
          );
        if (c.recortes > 0)
          notas.push(
            h(P.notas.recortes, idioma, { n: numero(c.recortes, idioma) }),
          );
        if (c.noNumericas > 0)
          notas.push(
            h(P.notas.noNumericas, idioma, {
              n: numero(c.noNumericas, idioma),
            }),
          );
      }
      const valorDeEpsilon = !c.aplicado
        ? "—"
        : c.epsilonEfectivo === null
          ? h(P.sinGarantia, idioma)
          : h(P.efectivo, idioma, {
              efectivo: epsilonEnTexto(c.epsilonEfectivo, idioma),
              pedido: epsilonEnTexto(c.epsilon ?? 0, idioma),
            });
      return `<tr>
<td class="col">${escapar(c.columna)}</td>
<td>${h(P.mecanismos[c.mecanismo], idioma)}</td>
<td>${valorDeEpsilon}</td>
<td>${numero(c.tratadas, idioma)}</td>
<td>${notas.join(" · ") || "—"}</td>
</tr>`;
    })
    .join("");

  // Sin un ε aplicado, la sección no se llama «privacidad diferencial»: la perturbación no lo es.
  const textos = conEpsilon ? P : P.sinEpsilon;
  return `<section>
<p class="etiqueta">${h(textos.etiqueta, idioma)}</p>
<h2>${h(textos.titulo, idioma)}</h2>
<p>${h(textos.intro, idioma)}</p>
${
  conEpsilon
    ? `<p>${h(P.porFila, idioma, {
        epsilon: epsilonEnTexto(privacidad.epsilonPorFila, idioma),
      })}</p>`
    : ""
}
<table style="margin-top:16px">
<thead><tr><th>${h(P.encabezados.columna, idioma)}</th><th>${h(P.encabezados.mecanismo, idioma)}</th><th style="text-transform:none">${h(P.encabezados.epsilon, idioma)}</th><th>${h(P.encabezados.celdas, idioma)}</th><th>${h(P.encabezados.notas, idioma)}</th></tr></thead>
<tbody>${filas}</tbody></table>
<p class="por-que" style="margin-top:14px">${h(textos.fuente, idioma)}</p>
</section>`;
}

function seccionDeUtilidad(utilidad: Utilidad | null, idioma: Idioma): string {
  const U = D.utilidad;
  if (utilidad === null)
    return `<section>
<p class="etiqueta">${h(U.etiqueta, idioma)}</p>
<h2>${h(U.titulo, idioma)}</h2>
<p>${h(U.noMedida, idioma)}</p>
</section>`;
  const perdidas = utilidad.columnas.filter((c) => c.estado !== "intacta");
  const filas = perdidas
    .map(
      (columna) => `<tr>
<td class="col">${escapar(columna.nombre)}</td>
<td>${
        columna.estado === "suprimida"
          ? `<b>${h(U.suprimida, idioma)}</b>`
          : `${numero(columna.cardinalidadAntes, idioma)} → <b>${numero(columna.cardinalidadDespues, idioma)}</b>`
      }</td>
<td>${decimales(columna.bitsAntes, 1, idioma)} → <b>${decimales(columna.bitsDespues, 1, idioma)}</b> ${h(U.bits, idioma)}</td>
<td>${porcentaje(columna.celdasCambiadas, idioma)}</td>
</tr>`,
    )
    .join("");

  const cruces = utilidad.correlaciones
    .slice(0, 8)
    .map(
      (cruce) =>
        `<li><code>${escapar(cruce.columnas[0])} + ${escapar(cruce.columnas[1])}</code><span>V ${decimales(
          cruce.antes,
          2,
          idioma,
        )} → <b>${decimales(cruce.despues, 2, idioma)}</b></span></li>`,
    )
    .join("");

  return `<section>
<p class="etiqueta">${h(U.etiqueta, idioma)}</p>
<h2>${h(U.titulo, idioma)}</h2>
<p>${h(U.intro, idioma)}</p>
<dl class="datos">
<div><dt>${h(U.informacionAntes, idioma)}</dt><dd>${decimales(utilidad.bitsAntes, 1, idioma)} <small>${h(U.bits, idioma)}</small></dd></div>
<div><dt>${h(U.informacionDespues, idioma)}</dt><dd>${decimales(utilidad.bitsDespues, 1, idioma)} <small>${h(U.bits, idioma)}</small></dd></div>
<div><dt>${h(U.columnasTocadas, idioma)}</dt><dd>${numero(perdidas.length, idioma)} <small>${h(
    U.deTotal,
    idioma,
    {
      total: utilidad.columnas.length,
    },
  )}</small></dd></div>
</dl>
${
  filas
    ? `<table style="margin-top:16px">
<thead><tr><th>${h(U.columna, idioma)}</th><th>${h(U.valoresDistintos, idioma)}</th><th>${h(U.informacion, idioma)}</th><th>${h(U.celdasCambiadas, idioma)}</th></tr></thead>
<tbody>${filas}</tbody></table>`
    : `<p class="por-que" style="margin-top:14px">${h(U.ningunaCambio, idioma)}</p>`
}
${
  cruces
    ? `<h2 style="margin-top:18px;font-size:1.05rem">${h(U.relacionesTitulo, idioma)}</h2>
<p class="por-que">${h(U.relacionesTexto, idioma)}</p>
<ul class="limpia">${cruces}</ul>`
    : ""
}
${
  utilidad.fueraDelCruce.length
    ? `<p class="por-que" style="margin-top:14px">${h(U.fueraDelCruce, idioma, {
        lista_html: utilidad.fueraDelCruce
          .map(
            (f) =>
              `<code>${escapar(f.nombre)}</code> (${escapar(decirMensaje(f.motivo, idioma))})`,
          )
          .join("; "),
        columnas: utilidad.tope.columnasMaximas,
        cardinalidad: utilidad.tope.cardinalidadMaxima,
      })}</p>`
    : ""
}
</section>`;
}

/**
 * «Cómo verificar este certificado» — la sección sin la cual la huella de salida es un adorno.
 *
 * **Una huella que el lector no sabe comprobar no prueba nada**, y quien recibe un archivo tratado
 * no tiene por qué saber qué es SHA-256 ni abrir una terminal a menudo. Así que el documento trae
 * el comando literal, con el nombre del archivo ya puesto, para los tres sistemas — y dice qué
 * significa que coincida **y qué significa que no**, que es la mitad que se suele omitir.
 *
 * Va **después** del tratamiento y antes del detalle por columna: primero qué se hizo, luego cómo
 * comprobarlo, y solo entonces la letra pequeña.
 */
function seccionDeVerificacion(
  tratamiento: DatosDelTratamiento,
  idioma: Idioma,
): string {
  const V = D.verificacion;
  const nombre = escapar(tratamiento.nombreDeSalida);
  return `
<section>
<p class="etiqueta">${h(V.etiqueta, idioma)}</p>
<h2>${h(V.titulo, idioma)}</h2>
<p style="margin:0 0 10px">${h(V.intro, idioma)}</p>
<table>
<thead><tr><th>${h(V.sistema, idioma)}</th><th>${h(V.comando, idioma)}</th></tr></thead>
<tbody>
<tr><td>macOS</td><td><code>shasum -a 256 ${nombre}</code></td></tr>
<tr><td>Linux</td><td><code>sha256sum ${nombre}</code></td></tr>
<tr><td>Windows</td><td><code>certutil -hashfile ${nombre} SHA256</code></td></tr>
</tbody>
</table>
<p style="margin:12px 0 0">${h(V.coincide, idioma)}</p>
<p class="por-que">${h(V.noCoincide, idioma)}</p>
<p class="por-que">${h(V.queNoDemuestra, idioma)}</p>
</section>`;
}

/**
 * Las palabras que van en el NOMBRE de cada documento descargado. El nombre sigue al idioma del
 * documento: quien lo guarda en inglés encuentra `velo-certificate-…` en su carpeta, no un nombre
 * en un idioma que no lee. (Son identificadores de archivo, no frases: sin tildes ni espacios.)
 */
const NOMBRES_DE_DOCUMENTO: Record<
  Idioma,
  { reporte: string; certificado: string; informe: string; sinNombre: string }
> = {
  es: {
    reporte: "velo-diagnostico",
    certificado: "velo-certificado",
    informe: "velo-regreso",
    sinNombre: "archivo",
  },
  en: {
    reporte: "velo-diagnosis",
    certificado: "velo-certificate",
    informe: "velo-return",
    sinNombre: "file",
  },
};

export function baseDelNombre(
  nombreDelArchivo: string,
  idioma: Idioma,
): string {
  const base = nombreDelArchivo
    .replace(/\.[^.]+$/, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || NOMBRES_DE_DOCUMENTO[idioma].sinNombre;
}

/** Nombre sugerido para el archivo descargado. Sin caracteres que peleen con un sistema de archivos. */
export function nombreDelReporte(
  nombreDelArchivo: string,
  idioma: Idioma,
): string {
  return `${NOMBRES_DE_DOCUMENTO[idioma].reporte}-${baseDelNombre(nombreDelArchivo, idioma)}.html`;
}

/**
 * Nombre del certificado. Distinto del diagnóstico a propósito: son dos documentos con dos
 * autoridades distintas, y acabar con dos `velo-diagnostico-…` en la misma carpeta sería obligar a
 * abrirlos para saber cuál es cuál.
 */
export function nombreDelCertificado(
  nombreDelArchivo: string,
  idioma: Idioma,
): string {
  return `${NOMBRES_DE_DOCUMENTO[idioma].certificado}-${baseDelNombre(nombreDelArchivo, idioma)}.html`;
}

export function nombreDelInforme(
  nombreDelArchivo: string,
  idioma: Idioma,
): string {
  return `${NOMBRES_DE_DOCUMENTO[idioma].informe}-${baseDelNombre(nombreDelArchivo, idioma)}.html`;
}

export function construirReporte(datos: DatosDelReporte): string {
  const { archivo, diagnostico, riesgo, advisor, fecha, tratamiento, idioma } =
    datos;
  const resumen = diagnostico.resumen;
  const hayTratamiento = tratamiento !== undefined;
  const I = D.identidad;

  return `<!doctype html>
<html lang="${LOCALE[idioma]}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(hayTratamiento ? D.titulo.certificado : D.titulo.diagnostico, idioma, { archivo: archivo.nombre })}</title>
<style>${ESTILOS}</style>
</head>
<body>
<div class="hoja">
<p class="sello">${SELLO}${h(D.comun.sello, idioma)}</p>
<p class="etiqueta" style="margin-top:18px">${h(hayTratamiento ? D.encabezado.certificado : D.encabezado.diagnostico, idioma)}</p>
<h1>${escapar(archivo.nombre)}</h1>
<p style="color:var(--tinta-suave);margin:4px 0 0">${h(
    D.comun.filasColumnas,
    idioma,
    {
      filas: diagnostico.filas,
      columnas: diagnostico.columnas.length,
      tamano: megabytes(archivo.bytes, idioma),
      fecha,
    },
  )}</p>

<section>
<p class="etiqueta">${h(I.etiqueta, idioma)}</p>
<h2>${h(hayTratamiento ? I.tituloCertificado : I.tituloReporte, idioma)}</h2>
<p style="margin:0 0 6px">${h(hayTratamiento ? I.huellaDeEntrada : I.huellaAnalizada, idioma)}</p>
<p class="huella">${escapar(archivo.sha256)}</p>
${
  tratamiento
    ? `<p style="margin:14px 0 6px">${h(I.huellaDeSalida, idioma, { nombre: tratamiento.nombreDeSalida })}</p>
<p class="huella">${escapar(tratamiento.sha256DeSalida)}</p>
<p class="por-que">${h(I.dosArchivos, idioma)}</p>`
    : `<p class="por-que">${h(I.comoComprobar, idioma)}</p>`
}
<dl class="datos" style="margin-top:14px">
<div><dt>${h(I.directos, idioma)}</dt><dd>${numero(resumen["identificador-directo"], idioma)}</dd></div>
<div><dt>${h(I.sensibles, idioma)}</dt><dd>${numero(resumen["dato-sensible"], idioma)}</dd></div>
<div><dt>${h(I.cuasi, idioma)}</dt><dd>${numero(resumen["cuasi-identificador"], idioma)}</dd></div>
<div><dt>${h(I.noPersonales, idioma)}</dt><dd>${numero(resumen["no-personal"], idioma)}</dd></div>
</dl>
</section>

${tratamiento ? seccionDelTratamiento(tratamiento, idioma) : ""}
${tratamiento?.generalizacion ? seccionDeLaGeneralizacion(tratamiento.generalizacion, idioma) : ""}
${tratamiento?.privacidad ? seccionDePrivacidad(tratamiento.privacidad, idioma) : ""}

${seccionDeRiesgo(riesgo, resumen["identificador-directo"], hayTratamiento, idioma)}

<section>
<p class="etiqueta">${h(D.columnas.etiqueta, idioma)}</p>
<h2>${h(D.columnas.titulo, idioma)}</h2>
<table>
<thead><tr><th>${h(D.columnas.columna, idioma)}</th><th>${h(D.columnas.queSeEncontro, idioma)}</th><th>${h(D.columnas.categoria, idioma)}</th><th>${h(D.columnas.muestra, idioma)}</th></tr></thead>
<tbody>${diagnostico.columnas.map((c) => filaDeColumna(c, idioma)).join("")}</tbody>
</table>
</section>

${tratamiento ? seccionDeUtilidad(tratamiento.utilidad, idioma) : ""}

${tratamiento ? seccionDeVerificacion(tratamiento, idioma) : ""}

${seccionDelAdvisor(advisor, diagnostico.filas, idioma)}

<footer>
<p>${h(D.pie.contenido, idioma)}</p>
<p>${h(D.pie.cifras, idioma)}</p>
<p>${h(hayTratamiento ? D.pie.noAfirmaDocumento : D.pie.noAfirmaDiagnostico, idioma)}</p>${
    hayTratamiento ? `\n<p>${h(D.pie.sobreElTratamiento, idioma)}</p>` : ""
  }
<p>${h(D.comun.generado, idioma)}</p>
</footer>
</div>
</body>
</html>
`;
}

// ── El informe del regreso (S3) ───────────────────────────────────────────────────────────────
//
// Documento aparte del diagnóstico, y no una sección más, porque habla de **otro archivo**: el que
// devolvió el tercero, no el que entró a Velo. Mezclarlos obligaría a un lector a distinguir de qué
// archivo habla cada cifra, que es justo la confusión que este repo lleva tres sprints evitando.
//
// Reutiliza los estilos, el sello, el escapado y el formato de cifras del reporte del S2. Lo que NO
// reutiliza es el criterio: el orden del documento lo decide `restauracion.salvedades`, que llega
// ordenado desde el motor.

export interface DatosDelInformeDeRegreso {
  /** El archivo que devolvió el tercero. */
  archivo: { nombre: string; bytes: number; sha256: string };
  restauracion: Restauracion;
  /** Identidad de la bóveda usada: SHA-256 de su serialización en claro. */
  huellaDeBoveda: string;
  /** Hash de la política que produjo la bóveda. Ata el regreso a un tratamiento concreto. */
  hashDePolitica: string;
  /** Fecha ya formateada por quien llama. Inyectada para que el informe sea reproducible. */
  fecha: string;
  /** El idioma del documento; ver `DatosDelReporte.idioma`. */
  idioma: Idioma;
}

function itemDeSalvedadDelRegreso(
  salvedad: SalvedadDelRegreso,
  idioma: Idioma,
): string {
  const S = D.regreso.salvedades;
  const cuerpo = (() => {
    switch (salvedad.tipo) {
      case "celdas-ambiguas":
        return h(
          plural(salvedad.cuantas, S.celdasAmbiguasUna, S.celdasAmbiguasVarias),
          idioma,
          {
            cuantas: salvedad.cuantas,
            proporcion: porcentaje(salvedad.proporcion, idioma),
          },
        );
      case "boveda-no-corresponde":
        return h(S.bovedaNoCorresponde, idioma);
      case "columnas-sin-aparecer":
        return h(
          plural(
            salvedad.columnas.length,
            S.columnasSinAparecerUna,
            S.columnasSinAparecerVarias,
          ),
          idioma,
          { lista_html: listaDeCodigo(salvedad.columnas) },
        );
      case "columna-a-medias":
        return h(S.columnaAMedias, idioma, {
          columna: salvedad.columna,
          proporcion: porcentaje(salvedad.proporcion, idioma),
        });
      case "celdas-desconocidas":
        return h(
          plural(
            salvedad.cuantas,
            S.celdasDesconocidasUna,
            S.celdasDesconocidasVarias,
          ),
          idioma,
          {
            cuantas: salvedad.cuantas,
            proporcion: porcentaje(salvedad.proporcion, idioma),
          },
        );
    }
  })();
  return `<li class="s-${salvedad.gravedad}">${cuerpo}</li>`;
}

function filaDeColumnaRestaurada(
  columna: ColumnaRestaurada,
  idioma: Idioma,
): string {
  const { celdas } = columna;
  const R = D.regreso;
  return `<tr>
<td><code>${escapar(columna.columna)}</code></td>
<td>${
    columna.deLaBoveda === null
      ? `<span class="alerta">${h(R.noReconocida, idioma)}</span> <small>${h(
          R.valoresDeTotal,
          idioma,
          {
            n: columna.coincidencias,
            total: columna.distintos,
          },
        )}</small>`
      : `<code>${escapar(columna.deLaBoveda)}</code> <small>${porcentaje(
          columna.proporcionReconocida,
          idioma,
        )}</small>`
  }</td>
<td>${numero(celdas.restauradas, idioma)}</td>
<td class="${celdas.ambiguas > 0 ? "alerta" : ""}">${numero(celdas.ambiguas, idioma)}</td>
<td>${numero(celdas.desconocidas, idioma)}</td>
</tr>`;
}

export function construirInformeDeRestauracion(
  datos: DatosDelInformeDeRegreso,
): string {
  const {
    archivo,
    restauracion,
    huellaDeBoveda,
    hashDePolitica,
    fecha,
    idioma,
  } = datos;
  const { totales, salvedades, proporcionRestaurada, esTitular } = restauracion;
  const conContenido =
    totales.restauradas + totales.ambiguas + totales.desconocidas;
  const R = D.regreso;

  const bloqueDeSalvedades = salvedades.length
    ? `<ul class="salvedades limpia">${salvedades.map((s) => itemDeSalvedadDelRegreso(s, idioma)).join("")}</ul>`
    : `<p class="por-que">${h(R.todoVolvio, idioma)}</p>`;

  // La cifra va DESPUÉS de las salvedades, siempre. No es una preferencia de maquetación: el
  // porcentaje solo es la frase que este documento no puede permitirse.
  const cifra = (() => {
    if (proporcionRestaurada === null) {
      return `<p>${h(R.sinCeldas, idioma)}</p>`;
    }
    if (esTitular) {
      return `<p class="cifrota"><b class="reduccion">${porcentaje(proporcionRestaurada, idioma)}</b></p>
<p>${h(R.cifraTitular, idioma, { restauradas: totales.restauradas, total: conContenido })}</p>`;
    }
    return `<p>${h(R.cifraConSalvedades, idioma, {
      restauradas: totales.restauradas,
      total: conContenido,
      pct_html: `<b class="reduccion">${porcentaje(proporcionRestaurada, idioma)}</b>`,
    })}</p>`;
  })();

  return `<!doctype html>
<html lang="${LOCALE[idioma]}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(D.titulo.regreso, idioma, { archivo: archivo.nombre })}</title>
<style>${ESTILOS}</style>
</head>
<body>
<div class="hoja">
<p class="sello">${SELLO}${h(D.comun.sello, idioma)}</p>
<p class="etiqueta" style="margin-top:18px">${h(R.etiqueta, idioma)}</p>
<h1>${escapar(archivo.nombre)}</h1>
<p style="color:var(--tinta-suave);margin:4px 0 0">${h(
    D.comun.filasColumnas,
    idioma,
    {
      filas: restauracion.tabla.filas,
      columnas: restauracion.columnas.length,
      tamano: megabytes(archivo.bytes, idioma),
      fecha,
    },
  )}</p>

<section>
<p class="etiqueta">${h(R.antesDeLaCifra, idioma)}</p>
<h2>${h(R.titulo, idioma)}</h2>
${bloqueDeSalvedades}
${cifra}
<dl class="datos" style="margin-top:16px">
<div><dt>${h(R.celdasRestauradas, idioma)}</dt><dd>${numero(totales.restauradas, idioma)}</dd></div>
<div><dt>${h(R.celdasAmbiguas, idioma)}</dt><dd class="${totales.ambiguas > 0 ? "alerta" : ""}">${numero(
    totales.ambiguas,
    idioma,
  )}</dd></div>
<div><dt>${h(R.celdasCambiadas, idioma)}</dt><dd>${numero(totales.desconocidas, idioma)}</dd></div>
<div><dt>${h(R.columnasReconocidas, idioma)}</dt><dd>${h(
    R.reconocidasDe,
    idioma,
    {
      n: restauracion.columnas.filter((c) => c.deLaBoveda !== null).length,
      total: restauracion.columnas.length,
    },
  )}</dd></div>
</dl>
</section>

<section>
<p class="etiqueta">${h(R.identidadEtiqueta, idioma)}</p>
<h2>${h(R.identidadTitulo, idioma)}</h2>
<p style="margin:0 0 6px">${h(R.huellaDevuelto, idioma)}</p>
<p class="huella">${escapar(archivo.sha256)}</p>
<p style="margin:14px 0 6px">${h(R.huellaBoveda, idioma)}</p>
<p class="huella">${escapar(huellaDeBoveda)}</p>
<p style="margin:14px 0 6px">${h(R.identidadTratamiento, idioma)}</p>
<p class="huella">${escapar(hashDePolitica)}</p>
</section>

<section>
<p class="etiqueta">${h(D.columnas.etiqueta, idioma)}</p>
<h2>${h(R.deDondeSalio, idioma)}</h2>
<table>
<thead><tr><th>${h(D.columnas.columna, idioma)}</th><th>${h(R.correspondencia, idioma)}</th><th>${h(R.restauradas, idioma)}</th><th>${h(R.ambiguas, idioma)}</th><th>${h(R.cambiadas, idioma)}</th></tr></thead>
<tbody>${restauracion.columnas.map((c) => filaDeColumnaRestaurada(c, idioma)).join("")}</tbody>
</table>
</section>

<footer>
${totales.ambiguas > 0 ? `<p>${h(R.sobreAmbiguas, idioma, { n: totales.ambiguas })}</p>` : ""}
<p>${h(R.contenido, idioma)}</p>
<p>${h(R.comoSeRestauro, idioma)}</p>
<p>${h(R.noAfirma, idioma)}</p>
<p>${h(R.generado, idioma)}</p>
</footer>
</div>
</body>
</html>
`;
}
