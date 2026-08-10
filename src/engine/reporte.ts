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

import type { Diagnostico, HallazgoDeColumna } from "./clasificador";
import type { AdvisorDeQis, RiesgoExacto } from "./riesgo";
import type { CategoriaLey1581 } from "./validadores/tipos";

export interface DatosDelReporte {
  archivo: { nombre: string; bytes: number; sha256: string };
  diagnostico: Diagnostico;
  riesgo: RiesgoExacto;
  advisor: AdvisorDeQis;
  /** Fecha ya formateada por quien llama. Inyectada para que el reporte sea reproducible. */
  fecha: string;
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

function porcentaje(proporcion: number): string {
  const valor = proporcion * 100;
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

function seccionDeRiesgo(riesgo: RiesgoExacto): string {
  if (riesgo.qis.length === 0) {
    return `<section>
<p class="etiqueta">Riesgo de reidentificación</p>
<h2>No hay ningún cruce que medir</h2>
<p>Velo no clasificó ninguna columna como cuasi-identificador, así que no existe una combinación
sobre la cual contar clases de equivalencia. Eso no vuelve anónimo el archivo: quiere decir que no
se reconocieron columnas cruzables.</p>
</section>`;
  }

  return `<section>
<p class="etiqueta">Riesgo de reidentificación · cifras exactas</p>
<h2>Cuánta gente queda sola</h2>
<p class="cifrota ${tonoDelRiesgo(riesgo)}">${porcentaje(riesgo.proporcionUnicos)}</p>
<p>de los registros son <b>únicos</b>: nadie más comparte su combinación de valores en las columnas
cruzadas. Son ${numero(riesgo.unicos)} de ${numero(riesgo.filas)} registros.</p>
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
  const { archivo, diagnostico, riesgo, advisor, fecha } = datos;
  const resumen = diagnostico.resumen;

  return `<!doctype html>
<html lang="es-CO">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Diagnóstico de ${escapar(archivo.nombre)} — Velo</title>
<style>${ESTILOS}</style>
</head>
<body>
<div class="hoja">
<p class="sello">${SELLO}Nada salió de ese navegador</p>
<p class="etiqueta" style="margin-top:18px">Diagnóstico de datos personales</p>
<h1>${escapar(archivo.nombre)}</h1>
<p style="color:var(--tinta-suave);margin:4px 0 0">${numero(diagnostico.filas)} filas ·
${numero(diagnostico.columnas.length)} columnas · ${megabytes(archivo.bytes)} · ${escapar(fecha)}</p>

<section>
<p class="etiqueta">Identidad del archivo</p>
<h2>Este reporte habla de un archivo concreto</h2>
<p style="margin:0 0 6px">SHA-256 del archivo analizado:</p>
<p class="huella">${escapar(archivo.sha256)}</p>
<p class="por-que">Quien reciba este documento puede comprobar que corresponde a su copia
ejecutando <code>sha256sum</code> (Linux), <code>shasum -a 256</code> (macOS) o
<code>Get-FileHash</code> (Windows) sobre el archivo y comparando el texto de arriba.</p>
<dl class="datos" style="margin-top:14px">
<div><dt>Identificadores directos</dt><dd>${numero(resumen["identificador-directo"])}</dd></div>
<div><dt>Datos sensibles (art. 5)</dt><dd>${numero(resumen["dato-sensible"])}</dd></div>
<div><dt>Cuasi-identificadores</dt><dd>${numero(resumen["cuasi-identificador"])}</dd></div>
<div><dt>No personales</dt><dd>${numero(resumen["no-personal"])}</dd></div>
</dl>
</section>

${seccionDeRiesgo(riesgo)}

<section>
<p class="etiqueta">Columna por columna</p>
<h2>Qué hay en la tabla, y por qué</h2>
<table>
<thead><tr><th>Columna</th><th>Qué se encontró</th><th>Categoría</th><th>Muestra</th></tr></thead>
<tbody>${diagnostico.columnas.map(filaDeColumna).join("")}</tbody>
</table>
</section>

${seccionDelAdvisor(advisor, diagnostico.filas)}

<footer>
<p><b>Qué lleva este documento y qué no.</b> Lleva nombres de columna, tipos detectados,
categorías, cifras agregadas y muestras <b>enmascaradas</b> (por ejemplo <code>103***89</code>).
No lleva ninguna fila del archivo, y las columnas de datos sensibles del artículo 5 no llevan
muestra siquiera.</p>
<p><b>Qué significan las cifras.</b> Todas son exactas: se contaron registro por registro sobre el
archivo completo. No hay muestreo ni estimación. La detección de tipos, en cambio, se hizo sobre
una muestra de hasta 5.000 valores por columna, y cada columna dice con qué certeza se concluyó.</p>
<p><b>Qué NO afirma Velo.</b> Este diagnóstico mide el riesgo de reidentificación; no lo elimina y
no declara el archivo anónimo. El modelo k-anonimato es atacable y se degrada al añadir columnas.
Un identificador propio de una organización puede señalar a una persona sin que ningún algoritmo
público lo reconozca.</p>
<p>Generado por <b>Velo</b> — la aduana de datos. El análisis ocurrió íntegramente dentro del
navegador de quien cargó el archivo: no hubo servidor, ni carga, ni copia.</p>
</footer>
</div>
</body>
</html>
`;
}
