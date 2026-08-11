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
//   3. **Determinista.** Mismo informe + misma fecha ⇒ mismo archivo, byte por byte. La fecha se
//      inyecta desde afuera precisamente por eso: es lo único que cambiaría solo.
//
// Y una regla de escritura: todo lo que venga del archivo del usuario —el nombre del archivo, los
// nombres de columna, las muestras— se escapa. Este documento lo va a abrir alguien más, y una
// columna llamada `<script>` no puede convertirse en un script.

import type { BalanceDelTratamiento, Salvedad } from "./balance";
import type { Diagnostico, HallazgoDeColumna } from "./clasificador";
import type { AdvisorDeQis, RiesgoExacto } from "./riesgo";
import type { Utilidad } from "./utilidad";
import type { CategoriaLey1581 } from "./validadores/tipos";

export interface DatosDelTratamiento {
  balance: BalanceDelTratamiento;
  utilidad: Utilidad;
  /** Identidad de la política aplicada: mismo hash ⇒ mismo tratamiento. */
  hashDePolitica: string;
  suprimidas: readonly string[];
}

export interface DatosDelReporte {
  archivo: { nombre: string; bytes: number; sha256: string };
  diagnostico: Diagnostico;
  riesgo: RiesgoExacto;
  advisor: AdvisorDeQis;
  /** Fecha ya formateada por quien llama. Inyectada para que el reporte sea reproducible. */
  fecha: string;
  /** Presente solo cuando el archivo se transformó. Sin él, el reporte es el diagnóstico del S1. */
  tratamiento?: DatosDelTratamiento;
}

const ETIQUETAS_DE_CATEGORIA: Record<CategoriaLey1581, string> = {
  "identificador-directo": "Identificador directo",
  "cuasi-identificador": "Cuasi-identificador",
  "dato-sensible": "Dato sensible · Ley 1581 art. 5",
  "no-personal": "No personal",
};

const ETIQUETAS_DE_CERTEZA: Record<HallazgoDeColumna["certeza"], string> = {
  "algoritmo-oficial": "Confirmado por el algoritmo oficial",
  estructural: "Reconocido por su forma",
  "sin-confirmar": "Sin confirmar — se apoya en el nombre de la columna",
};

/** Escapa lo que venga del archivo del usuario. Sin excepciones ni "es solo un número". */
export function escapar(texto: string): string {
  return texto
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const ENTERO = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

function numero(valor: number): string {
  return ENTERO.format(valor);
}

/** Misma regla que `src/lib/formato.ts`: un porcentaje que redondea a cero se dice con palabras. */
function porcentaje(proporcion: number): string {
  const valor = proporcion * 100;
  if (valor > 0 && valor < 0.05) return "menos de 0,1 %";
  const decimales = valor > 0 && valor < 10 ? 1 : 0;
  return `${new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(valor)} %`;
}

function megabytes(valor: number): string {
  if (valor < 1024 * 1024) {
    return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(valor / 1024)} KB`;
  }
  const mb = valor / (1024 * 1024);
  return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: mb < 10 ? 1 : 0 }).format(mb)} MB`;
}

// El sello, dibujado a mano en el propio documento. Ver `src/components/sello.tsx`: si viniera de
// una URL, la marca que promete que nada salió del navegador estaría hecha de algo que sí salió.
const SELLO = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
<circle cx="12" cy="12" r="10.25" fill="none" stroke="currentColor" stroke-width="1.2"/>
<circle cx="12" cy="12" r="7.75" fill="none" stroke="currentColor" stroke-width=".7" stroke-dasharray="1.1 1.9" stroke-linecap="round" opacity=".65"/>
<path d="M7.6 9.9h8.8M9.4 12h5.2M7.6 14.1h8.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;

// Tipografía del sistema: una fuente web obligaría a una petición, y embeberla en base64 hincharía
// el archivo por pura decoración. Georgia y la mono del sistema conservan el carácter sin costo.
const ESTILOS = `
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
/* El ancho mínimo no es cosmético: sin él la columna se estrecha tanto que un nombre como
   cedula_titular se parte a la mitad ("cedula_ti / tular") y deja de ser reconocible, que es
   justo lo único que esa celda tiene que lograr. overflow-wrap parte solo si de verdad no cabe.
   (Sin comillas invertidas aquí dentro: esto vive en una plantilla de JavaScript.) */
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
/* Las salvedades van antes que la cifra, y se ven antes que la cifra. Que la descalificante pese
   más que la que solo matiza no es decoración: es la diferencia entre "esto desmiente el número"
   y "esto lo acompaña". */
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

function filaDeColumna(columna: HallazgoDeColumna): string {
  const porQue = columna.evidencia
    .map((evidencia) => {
      if (evidencia.origen === "validador") {
        const proporcion =
          evidencia.muestreados > 0
            ? evidencia.aciertos / evidencia.muestreados
            : 0;
        return `<p class="por-que">${porcentaje(proporcion)} de los ${numero(
          evidencia.muestreados,
        )} valores revisados cumplen.<br><code>${escapar(evidencia.fuente)}</code></p>`;
      }
      return `<p class="por-que">${escapar(evidencia.nota)}</p>`;
    })
    .join("");

  const muestra =
    columna.muestra === null
      ? "<em>columna vacía</em>"
      : columna.muestra.omitida
        ? "<em>sin muestra</em>"
        : `<code>${escapar(columna.muestra.texto)}</code>`;

  return `<tr>
<td class="col">${escapar(columna.nombre)}<br><small style="color:var(--tinta-tenue)">${numero(
    columna.cardinalidad,
  )} valores distintos</small></td>
<td><b>${escapar(columna.etiqueta)}</b><br><small>${ETIQUETAS_DE_CERTEZA[columna.certeza]}</small>${porQue}</td>
<td><span class="chip c-${columna.categoria}">${ETIQUETAS_DE_CATEGORIA[columna.categoria]}</span></td>
<td>${muestra}</td>
</tr>`;
}

function seccionDeRiesgo(
  riesgo: RiesgoExacto,
  identificadoresDirectos: number,
  hayTratamiento: boolean,
): string {
  // Con un tratamiento en el documento, esta sección deja de ser «el riesgo» y pasa a ser «el
  // riesgo del archivo que entró». Sin decirlo, sus cifras se leerían como las del archivo que se
  // descarga — la misma composición que este sprint tiene prohibida, cometida por omisión.
  const deQue = hayTratamiento ? " · el archivo ORIGINAL" : "";
  if (riesgo.qis.length === 0) {
    return `<section>
<p class="etiqueta">Riesgo de reidentificación${deQue}</p>
<h2>No hay ningún cruce que medir</h2>
<p>Velo no clasificó ninguna columna como cuasi-identificador, así que no existe una combinación
sobre la cual contar clases de equivalencia. Eso no vuelve anónimo el archivo: quiere decir que no
se reconocieron columnas cruzables.</p>
</section>`;
  }

  return `<section>
<p class="etiqueta">Riesgo de reidentificación · cifras exactas${deQue}</p>
<h2>Cuánta gente queda sola${hayTratamiento ? " en el archivo original" : ""}</h2>
<p class="cifrota ${tonoDelRiesgo(riesgo)}">${porcentaje(riesgo.proporcionUnicos)}</p>
<p>de los registros son <b>únicos</b>: nadie más comparte su combinación de valores en las columnas
cruzadas. Son ${numero(riesgo.unicos)} de ${numero(riesgo.filas)} registros.</p>${
    identificadoresDirectos > 0
      ? `\n<p class="por-que">Esta cifra <b>no cuenta</b> ${numero(identificadoresDirectos)} ${
          identificadoresDirectos === 1
            ? "columna que identifica"
            : "columnas que identifican"
        } sin ayuda de ninguna otra: a esas personas no hay que cruzarlas con nada para saber quiénes son.</p>`
      : ""
  }
<dl class="datos">
<div><dt>Grupo más pequeño (k)</dt><dd>${numero(riesgo.kMinimo)} <small>${
    riesgo.kMinimo === 1 ? "persona" : "personas"
  }</small></dd></div>
<div><dt>Riesgo del más expuesto</dt><dd>1 en ${numero(Math.round(1 / riesgo.riesgoMaximo))}</dd></div>
<div><dt>Riesgo promedio</dt><dd>1 en ${numero(Math.round(1 / riesgo.riesgoPromedio))}</dd></div>
<div><dt>Grupos distintos</dt><dd>${numero(riesgo.clases)}</dd></div>
</dl>
<p class="por-que" style="margin-top:14px">Columnas cruzadas: ${riesgo.qis
    .map((qi) => `<code>${escapar(qi)}</code>`)
    .join(" · ")}</p>
<p class="por-que">Modelo <b>prosecutor</b>: se supone que quien ataca ya sabe que la persona está
en la tabla y solo busca cuál de las filas es. Es el escenario más adverso, y el único que se puede
calcular exacto sobre los datos. Todas las cifras de esta sección son exactas, contadas registro
por registro — no estimadas.</p>
</section>`;
}

function seccionDelAdvisor(advisor: AdvisorDeQis, filas: number): string {
  const solas = advisor.identificanSolas.length
    ? `<h2 style="margin-top:18px;font-size:1.05rem">Columnas que delatan solas</h2>
<ul class="limpia">${advisor.identificanSolas
        .map(
          (columna) =>
            `<li class="sola"><code>${escapar(columna.nombre)}</code><span><b>${porcentaje(
              columna.proporcionUnicos,
            )}</b> solos · ${numero(columna.unicos)} de ${numero(filas)}</span></li>`,
        )
        .join("")}</ul>`
    : "";

  const combinaciones = advisor.combinaciones.length
    ? `<h2 style="margin-top:18px;font-size:1.05rem">Combinaciones más delatoras</h2>
<ul class="limpia">${advisor.combinaciones
        .slice(0, 10)
        .map(
          (combinacion) =>
            `<li><code>${combinacion.columnas.map(escapar).join(" + ")}</code><span><b>${porcentaje(
              combinacion.proporcionUnicos,
            )}</b> solos · grupo más pequeño: ${numero(combinacion.k)}</span></li>`,
        )
        .join("")}</ul>`
    : "<p>No quedaron columnas suficientes para proponer un cruce.</p>";

  const excluidas = advisor.excluidas.length
    ? `<p class="por-que" style="margin-top:14px">Quedaron fuera: ${advisor.excluidas
        .map((e) => `<code>${escapar(e.nombre)}</code> (${escapar(e.motivo)})`)
        .join("; ")}.</p>`
    : "";

  return `<section>
<p class="etiqueta">Consejero de cruces</p>
${solas}
${combinaciones}
<p class="por-que" style="margin-top:14px">Velo evaluó ${numero(
    advisor.combinacionesEvaluadas,
  )} combinaciones de las ${numero(advisor.candidatos.length)} columnas candidatas. El tope es
${numero(advisor.tope.candidatosMaximos)} columnas y grupos de hasta ${numero(
    advisor.tope.tamanoMaximo,
  )}: no es el universo entero de cruces posibles.</p>
${excluidas}
</section>`;
}

// ── El tratamiento ────────────────────────────────────────────────────────────────────────────
//
// El orden de este bloque ES el contrato, no una preferencia de maquetación: las salvedades se
// escriben ANTES que la cifra de reducción. Un lector que se detenga en el primer párrafo tiene que
// haber leído lo que descalifica el número, no el número. `tests/unit/reporte.test.ts` compara las
// posiciones en el documento — un test de composición, no de cifra.

function itemDeSalvedad(salvedad: Salvedad): string {
  const cuerpo = (() => {
    switch (salvedad.tipo) {
      case "identificadores-sin-tratar":
        return `La política deja <b>intactas</b> ${numero(salvedad.columnas.length)}
${salvedad.columnas.length === 1 ? "columna que señala" : "columnas que señalan"} a la persona sin
ayuda de ninguna otra: ${salvedad.columnas
          .map((c) => `<code>${escapar(c)}</code>`)
          .join(
            " · ",
          )}. Mientras estén en el archivo, ninguna cifra de esta página describe datos
tratados.`;
      case "reparto-sin-k":
        return `${
          salvedad.columnas.length === 1
            ? "Una columna salió <b>intacta</b>"
            : `${numero(salvedad.columnas.length)} columnas salieron <b>intactas</b>`
        }: la política las marcó para generalización automática y no fijó un grupo mínimo (k), así
que no había hasta dónde generalizar. ${salvedad.columnas
          .map((c) => `<code>${escapar(c)}</code>`)
          .join(" · ")}.`;
      case "unicos-restantes":
        return `Después del tratamiento, <b>${numero(salvedad.cuantos)}</b> registros
(${porcentaje(salvedad.proporcion)}) siguen <b>solos</b> en su combinación de valores: nadie más
en la tabla comparte la suya.`;
      case "k-no-alcanzado":
        return `La política pidió grupos de al menos <b>${numero(salvedad.kObjetivo)}</b> y el
reparto llegó a <b>${numero(salvedad.kAlcanzado)}</b>. El archivo no cumple el k que declara.`;
      case "k-del-reparto-no-es-el-del-archivo":
        return `El reparto alcanzó k=<b>${numero(salvedad.kDelReparto)}</b> sobre las columnas que
generaliza, pero el archivo completo tiene grupos de <b>${numero(salvedad.kDelArchivo)}</b>: hay
cuasi-identificadores fuera del reparto que parten esos grupos. <b>El número que vale es el del
archivo</b>, no el del reparto.`;
      case "clases-homogeneas":
        return `<b>${numero(salvedad.filas)}</b> registros están en grupos donde todo el mundo
comparte el mismo valor de <code>${escapar(salvedad.atributo)}</code>. Dar con el grupo basta para
saber el dato, aunque no se sepa cuál de las filas es la persona.`;
      case "colisiones-de-seudonimo":
        return `En <code>${escapar(salvedad.columna)}</code>, <b>${numero(salvedad.cuantas)}</b>
${salvedad.cuantas === 1 ? "par de valores distintos recibió" : "pares de valores distintos recibieron"}
el mismo seudónimo. Conservar el formato reduce el espacio disponible y algunos chocan: dos
entidades distintas se ven como una.`;
    }
  })();
  return `<li class="s-${salvedad.gravedad}">${cuerpo}</li>`;
}

export function seccionDelTratamiento(datos: DatosDelTratamiento): string {
  const { balance, hashDePolitica, suprimidas } = datos;
  const { antes, despues, reduccion, salvedades } = balance;

  const bloqueDeSalvedades = salvedades.length
    ? `<ul class="salvedades limpia">${salvedades.map(itemDeSalvedad).join("")}</ul>`
    : `<p class="por-que">Velo no encontró salvedades que matizar sobre las columnas que revisó.
Eso no vuelve anónimo el archivo: quiere decir que las comprobaciones que Velo sabe hacer salieron
limpias.</p>`;

  const cifra = (() => {
    if (reduccion === null) {
      return `<p>Antes del tratamiento no había ningún registro único en las columnas cruzadas, así
que no hay reducción que medir. La cifra que importa es la de abajo: cuántos hay <b>ahora</b>.</p>`;
    }
    if (balance.esTitular) {
      return `<p class="cifrota">−<b class="reduccion">${porcentaje(reduccion)}</b></p>
<p>de registros únicos respecto del archivo original, sobre las ${numero(antes.qis.length)} columnas
cruzadas. Pasó de ${numero(antes.unicos)} a ${numero(despues.unicos)} de ${numero(antes.filas)}
registros.</p>`;
    }
    return `<p>La proporción de registros únicos bajó de ${porcentaje(antes.proporcionUnicos)} a
${porcentaje(despues.proporcionUnicos)} — una reducción del
<b class="reduccion">${porcentaje(reduccion)}</b>. <b class="alerta">Esa cifra no describe un
archivo tratado</b> mientras siga en pie lo de arriba: se refiere solo al cruce de
cuasi-identificadores, y no cuenta nada de lo que quedó sin tocar.</p>`;
  })();

  return `<section>
<p class="etiqueta">Balance del tratamiento</p>
<h2>Qué cambió, y qué sigue igual</h2>
${bloqueDeSalvedades}
${cifra}
<dl class="datos" style="margin-top:16px">
<div><dt>Registros únicos, antes</dt><dd>${numero(antes.unicos)} <small>${porcentaje(
    antes.proporcionUnicos,
  )}</small></dd></div>
<div><dt>Registros únicos, después</dt><dd class="${
    despues.unicos > 0 ? "alerta" : ""
  }">${numero(despues.unicos)} <small>${porcentaje(despues.proporcionUnicos)}</small></dd></div>
<div><dt>Grupo más pequeño, antes</dt><dd>${numero(antes.kMinimo)}</dd></div>
<div><dt>Grupo más pequeño, después</dt><dd>${numero(despues.kMinimo)}</dd></div>
</dl>
<p class="por-que" style="margin-top:14px">Las dos medidas salen del mismo cálculo del S1, corrido
sobre el archivo original y sobre el que se descarga. Las columnas cruzadas «después» son las de
«antes» menos ${
    suprimidas.length
      ? `las suprimidas (${suprimidas.map((s) => `<code>${escapar(s)}</code>`).join(" · ")})`
      : "ninguna, porque no se suprimió ninguna columna"
  }: quien reciba el archivo no las tendrá.</p>
<p class="por-que">Identidad del tratamiento (SHA-256 de la política aplicada):</p>
<p class="huella">${escapar(hashDePolitica)}</p>
</section>`;
}

function seccionDeUtilidad(utilidad: Utilidad): string {
  const perdidas = utilidad.columnas.filter((c) => c.estado !== "intacta");
  const filas = perdidas
    .map(
      (columna) => `<tr>
<td class="col">${escapar(columna.nombre)}</td>
<td>${
        columna.estado === "suprimida"
          ? "<b>suprimida</b>"
          : `${numero(columna.cardinalidadAntes)} → <b>${numero(columna.cardinalidadDespues)}</b>`
      }</td>
<td>${columna.bitsAntes.toFixed(1)} → <b>${columna.bitsDespues.toFixed(1)}</b> bits</td>
<td>${porcentaje(columna.celdasCambiadas)}</td>
</tr>`,
    )
    .join("");

  const cruces = utilidad.correlaciones
    .slice(0, 8)
    .map(
      (cruce) =>
        `<li><code>${escapar(cruce.columnas[0])} + ${escapar(cruce.columnas[1])}</code><span>V ${cruce.antes.toFixed(
          2,
        )} → <b>${cruce.despues.toFixed(2)}</b></span></li>`,
    )
    .join("");

  return `<section>
<p class="etiqueta">Lo que el archivo perdió</p>
<h2>El otro lado de la balanza</h2>
<p>Cada bit de riesgo que se quita sale de un bit de información que alguien iba a usar. Estas son
las cifras del intercambio; qué tanto duele cada una lo sabe quien conoce para qué era el archivo.</p>
<dl class="datos">
<div><dt>Información total, antes</dt><dd>${utilidad.bitsAntes.toFixed(1)} <small>bits</small></dd></div>
<div><dt>Información total, después</dt><dd>${utilidad.bitsDespues.toFixed(1)} <small>bits</small></dd></div>
<div><dt>Columnas tocadas</dt><dd>${numero(perdidas.length)} <small>de ${numero(
    utilidad.columnas.length,
  )}</small></dd></div>
</dl>
${
  filas
    ? `<table style="margin-top:16px">
<thead><tr><th>Columna</th><th>Valores distintos</th><th>Información</th><th>Celdas cambiadas</th></tr></thead>
<tbody>${filas}</tbody></table>`
    : '<p class="por-que" style="margin-top:14px">Ninguna columna cambió.</p>'
}
${
  cruces
    ? `<h2 style="margin-top:18px;font-size:1.05rem">Relaciones entre columnas</h2>
<p class="por-que">V de Cramér antes y después, de la que más se perdió a la que menos. Una relación
que desaparece se lleva con ella el análisis que dependía de ella — y eso no se ve mirando las
columnas por separado.</p>
<ul class="limpia">${cruces}</ul>`
    : ""
}
${
  utilidad.fueraDelCruce.length
    ? `<p class="por-que" style="margin-top:14px">Fuera del cruce: ${utilidad.fueraDelCruce
        .map((f) => `<code>${escapar(f.nombre)}</code> (${escapar(f.motivo)})`)
        .join("; ")}. El tope es ${numero(
        utilidad.tope.columnasMaximas,
      )} columnas de hasta ${numero(
        utilidad.tope.cardinalidadMaxima,
      )} valores distintos: no es el universo entero de cruces posibles.</p>`
    : ""
}
</section>`;
}

/** Nombre sugerido para el archivo descargado. Sin caracteres que peleen con un sistema de archivos. */
export function nombreDelReporte(nombreDelArchivo: string): string {
  const base = nombreDelArchivo
    .replace(/\.[^.]+$/, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `velo-diagnostico-${base || "archivo"}.html`;
}

export function construirReporte(datos: DatosDelReporte): string {
  const { archivo, diagnostico, riesgo, advisor, fecha, tratamiento } = datos;
  const resumen = diagnostico.resumen;
  const hayTratamiento = tratamiento !== undefined;

  return `<!doctype html>
<html lang="es-CO">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${hayTratamiento ? "Tratamiento" : "Diagnóstico"} de ${escapar(archivo.nombre)} — Velo</title>
<style>${ESTILOS}</style>
</head>
<body>
<div class="hoja">
<p class="sello">${SELLO}Nada salió de ese navegador</p>
<p class="etiqueta" style="margin-top:18px">${
    hayTratamiento
      ? "Diagnóstico y tratamiento de datos personales"
      : "Diagnóstico de datos personales"
  }</p>
<h1>${escapar(archivo.nombre)}</h1>
<p style="color:var(--tinta-suave);margin:4px 0 0">${numero(diagnostico.filas)} filas ·
${numero(diagnostico.columnas.length)} columnas · ${megabytes(archivo.bytes)} · ${escapar(fecha)}</p>

<section>
<p class="etiqueta">Identidad del archivo</p>
<h2>Este reporte habla de un archivo concreto</h2>
<p style="margin:0 0 6px">SHA-256 del archivo ${
    hayTratamiento ? "que ENTRÓ a Velo" : "analizado"
  }:</p>
<p class="huella">${escapar(archivo.sha256)}</p>
${
  hayTratamiento
    ? `<p class="por-que"><b>Esta huella no es la del archivo que se entrega.</b> Es la del original,
la copia sobre la que se midió todo lo de abajo. El archivo tratado es otro archivo y tiene otra
huella; se reconoce por el hash de la política que lleva en el nombre
(<code>velo-anonimizado-…</code>), y ese hash está en la sección siguiente. Quien reciba los dos
puede comprobar con <code>sha256sum</code> (Linux), <code>shasum -a 256</code> (macOS) o
<code>Get-FileHash</code> (Windows) que el original es el que dice este documento.</p>`
    : `<p class="por-que">Quien reciba este documento puede comprobar que corresponde a su copia
ejecutando <code>sha256sum</code> (Linux), <code>shasum -a 256</code> (macOS) o
<code>Get-FileHash</code> (Windows) sobre el archivo y comparando el texto de arriba.</p>`
}
<dl class="datos" style="margin-top:14px">
<div><dt>Identificadores directos</dt><dd>${numero(resumen["identificador-directo"])}</dd></div>
<div><dt>Datos sensibles (art. 5)</dt><dd>${numero(resumen["dato-sensible"])}</dd></div>
<div><dt>Cuasi-identificadores</dt><dd>${numero(resumen["cuasi-identificador"])}</dd></div>
<div><dt>No personales</dt><dd>${numero(resumen["no-personal"])}</dd></div>
</dl>
</section>

${tratamiento ? seccionDelTratamiento(tratamiento) : ""}

${seccionDeRiesgo(riesgo, resumen["identificador-directo"], hayTratamiento)}

<section>
<p class="etiqueta">Columna por columna</p>
<h2>Qué hay en la tabla, y por qué</h2>
<table>
<thead><tr><th>Columna</th><th>Qué se encontró</th><th>Categoría</th><th>Muestra</th></tr></thead>
<tbody>${diagnostico.columnas.map(filaDeColumna).join("")}</tbody>
</table>
</section>

${tratamiento ? seccionDeUtilidad(tratamiento.utilidad) : ""}

${seccionDelAdvisor(advisor, diagnostico.filas)}

<footer>
<p><b>Qué lleva este documento y qué no.</b> Lleva nombres de columna, tipos detectados,
categorías, cifras agregadas y muestras <b>enmascaradas</b> (por ejemplo <code>103***89</code>).
No lleva ninguna fila del archivo, y las columnas de datos sensibles del artículo 5 no llevan
muestra siquiera.</p>
<p><b>Qué significan las cifras.</b> Todas son exactas: se contaron registro por registro sobre el
archivo completo. No hay muestreo ni estimación. La detección de tipos, en cambio, se hizo sobre
una muestra de hasta 5.000 valores por columna, y cada columna dice con qué certeza se concluyó.</p>
<p><b>Qué NO afirma Velo.</b> Este ${
    hayTratamiento ? "documento" : "diagnóstico"
  } mide el riesgo de reidentificación; no lo elimina y
no declara el archivo anónimo. El modelo k-anonimato es atacable y se degrada al añadir columnas.
Un identificador propio de una organización puede señalar a una persona sin que ningún algoritmo
público lo reconozca.</p>${
    hayTratamiento
      ? `\n<p><b>Sobre el tratamiento.</b> Las cifras de reducción se calculan sobre las columnas que
Velo reconoció como cuasi-identificadores, y solo sobre ellas. Una columna que Velo no supo leer no
entra a ninguna de estas cuentas — ni a la de antes ni a la de después—, así que la reducción no
describe el archivo entero sino el cruce medido. Las salvedades del balance no son advertencias de
cortesía: cada una nombra algo que la cifra no cubre.</p>`
      : ""
  }
<p>Generado por <b>Velo</b> — la aduana de datos. El análisis ocurrió íntegramente dentro del
navegador de quien cargó el archivo: no hubo servidor, ni carga, ni copia.</p>
</footer>
</div>
</body>
</html>
`;
}
