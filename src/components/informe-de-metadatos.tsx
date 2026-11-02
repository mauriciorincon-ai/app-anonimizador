"use client";

// P2 — el diagnóstico de un PDF o una imagen, en su forma presentacional.
//
// Recibe el informe y lo pinta. No sabe de workers, de rutas ni de sesión: los estados de esta
// pantalla se prueban con un informe de mentira y sin levantar un navegador.
//
// Un PDF o una imagen no es una tabla: no tiene filas, ni riesgo de reidentificación, ni consejero.
// Fingir que sí sería enseñar ceros que no significan nada, así que esta pantalla es otra y empieza
// por lo que más pesa: **el límite**. Velo limpia lo que el archivo dice DE SÍ MISMO y no toca el
// texto de las páginas ni lo que se ve en la imagen; si eso se descubriera después de entregar el
// archivo, sería la mentira más cara de todo el producto. Por eso va arriba, antes de la tabla, con
// su propio símbolo y no en una nota al pie.
//
// El orden, después: los campos (la evidencia), lo que se quita y lo que se conserva, los avisos
// (lo que Velo enseña y NO limpia) y, en un PDF, la historia de versiones.

import { useId } from "react";

import { Panel } from "@/components/panel";
import {
  SeccionDeElementos,
  TablaDeMetadatos,
} from "@/components/tabla-de-metadatos";
import { Rico, useT } from "@/components/texto";
import type {
  Aviso,
  ClaveDeAviso,
  RevisionesDePdf,
} from "@/engine/metadatos/tipos";
import { bytes, milisegundos, NOMBRE_DEL_FORMATO, numero } from "@/lib/formato";
import { plural, type Texto } from "@/lib/idioma";
import { DIAGNOSTICO } from "@/lib/idioma/textos/diagnostico";
import { METADATOS } from "@/lib/idioma/textos/metadatos";
import type { InformeDeMetadatos as DatosDelInforme } from "@/workers/contrato";

const M = METADATOS;

/** Los avisos que dicen «esto NO se limpia» o «esto se rompe»: el resto informa. */
const AVISOS_QUE_ALERTAN: ReadonlySet<ClaveDeAviso> = new Set([
  "pdf-firmado",
  "pdf-anotaciones",
  "pdf-adjuntos",
  "pdf-formularios",
  "pdf-javascript",
]);

/** Un aviso con cuenta trae dos frases: la que dice el número y la que no puede. */
const AVISOS: Record<
  ClaveDeAviso,
  Texto | { readonly con: Texto; readonly sin: Texto }
> = M.avisos.tipos;

export function InformeDeMetadatos({ informe }: { informe: DatosDelInforme }) {
  const { t, idioma } = useT();
  const { archivo, metadatos, medicion } = informe;
  const esPdf = archivo.formato === "pdf";

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="etiqueta">{t(M.informe.etiqueta)}</p>
        {/* El nombre en mono, como en el de una tabla: es una cadena literal del usuario. */}
        <h1 className="text-tinta mt-1.5 font-mono text-[clamp(1.375rem,4vw,1.875rem)] leading-tight font-semibold break-all">
          {archivo.nombre}
        </h1>
        <p className="cifra text-tinta-suave mt-2 text-[0.9375rem]">
          {t(M.informe.tamano, {
            peso: bytes(archivo.bytes, idioma),
            formato: NOMBRE_DEL_FORMATO[archivo.formato],
          })}
        </p>
        <p className="cifra text-tinta-tenue mt-1 text-[0.75rem]">
          {medicion.heapMb !== null
            ? t(DIAGNOSTICO.informe.lecturaConMemoria, {
                lectura: milisegundos(medicion.msLectura, idioma),
                analisis: milisegundos(medicion.msDiagnostico, idioma),
                mb: numero(medicion.heapMb, idioma),
              })
            : t(DIAGNOSTICO.informe.lecturaSinMemoria, {
                lectura: milisegundos(medicion.msLectura, idioma),
                analisis: milisegundos(medicion.msDiagnostico, idioma),
              })}
        </p>
        {/* La huella ata este diagnóstico a UN archivo: se puede comparar con `sha256sum`. */}
        <p className="text-tinta-tenue mt-2 text-[0.6875rem]">
          <span className="etiqueta mr-1.5 text-[0.6875rem] tracking-[0.14em]">
            SHA-256
          </span>
          <code className="font-mono break-all">{archivo.sha256}</code>
        </p>
      </header>

      <LimiteHonesto esPdf={esPdf} />

      <Panel
        etiqueta={t(M.campos.etiqueta)}
        titulo={t(M.campos.titulo)}
        nota={<Rico texto={M.campos.nota} />}
      >
        {metadatos.campos.length === 0 ? (
          <SinCampos />
        ) : (
          <TablaDeMetadatos campos={metadatos.campos} />
        )}
        {metadatos.otrasEtiquetas > 0 ? (
          <p className="text-tinta-suave mt-4 text-[0.875rem] leading-relaxed">
            {t(
              plural(
                metadatos.otrasEtiquetas,
                M.campos.otrasUna,
                M.campos.otrasVarias,
              ),
              { n: metadatos.otrasEtiquetas },
            )}
          </p>
        ) : null}
      </Panel>

      <Panel
        etiqueta={t(M.elementos.etiqueta)}
        titulo={t(M.elementos.titulo)}
        nota={<Rico texto={M.elementos.nota} />}
      >
        <div className="flex flex-col gap-8">
          <SeccionDeElementos
            titulo={M.elementos.quitar.titulo}
            descripcion={M.elementos.quitar.descripcion}
            ninguno={M.elementos.quitar.ninguno}
            elementos={metadatos.quitables}
          />
          <SeccionDeElementos
            titulo={M.elementos.conservar.titulo}
            descripcion={M.elementos.conservar.descripcion}
            ninguno={M.elementos.conservar.ninguno}
            elementos={metadatos.conservables}
          />
        </div>
      </Panel>

      {metadatos.avisos.length > 0 ? (
        <Panel etiqueta={t(M.avisos.etiqueta)} titulo={t(M.avisos.titulo)}>
          <ul className="flex flex-col gap-3">
            {metadatos.avisos.map((aviso, i) => (
              <FilaDeAviso key={`${aviso.clave}-${i}`} aviso={aviso} />
            ))}
          </ul>
        </Panel>
      ) : null}

      {esPdf && metadatos.revisiones ? (
        <HistoriaDelPdf revisiones={metadatos.revisiones} />
      ) : null}
    </div>
  );
}

// ── El límite ───────────────────────────────────────────────────────────────────────────────────

/**
 * Lo que Velo NO toca, con el mismo peso que lo que sí hace. Va como aviso fuerte y con su símbolo:
 * el color solo no basta, y una advertencia en una nota al pie se lee como un trámite.
 */
function LimiteHonesto({ esPdf }: { esPdf: boolean }) {
  const { t } = useT();
  const idDelTitulo = useId();
  return (
    <section
      aria-labelledby={idDelTitulo}
      className="rounded-3 border-alerta/35 bg-alerta-tenue flex items-start gap-3 border px-5 py-4"
    >
      <span
        aria-hidden="true"
        className="border-alerta text-alerta mt-0.5 flex size-6 flex-none items-center justify-center rounded-full border text-[0.875rem] font-semibold"
      >
        !
      </span>
      <div>
        <h2
          id={idDelTitulo}
          className="text-alerta text-[0.9375rem] font-semibold"
        >
          {t(M.limite.titulo)}
        </h2>
        <p className="text-tinta mt-1 text-[0.9375rem] leading-relaxed">
          <Rico texto={M.limite.principal} />
        </p>
        <p className="text-tinta-suave mt-2 text-[0.9375rem] leading-relaxed">
          <Rico texto={esPdf ? M.limite.pdf : M.limite.imagen} />
        </p>
        <p className="text-tinta-suave mt-2 text-[0.9375rem] leading-relaxed">
          <Rico texto={M.limite.consejo} />
        </p>
      </div>
    </section>
  );
}

// ── Sin campos con nombre ───────────────────────────────────────────────────────────────────────

function SinCampos() {
  const { t } = useT();
  return (
    <div>
      <p className="text-tinta text-[0.9375rem] font-medium">
        {t(M.campos.ninguno.titulo)}
      </p>
      <p className="text-tinta-suave mt-1.5 text-[0.9375rem] leading-relaxed">
        {t(M.campos.ninguno.detalle)}
      </p>
    </div>
  );
}

// ── Avisos ──────────────────────────────────────────────────────────────────────────────────────

function textoDeAviso(aviso: Aviso): Texto {
  const tipo = AVISOS[aviso.clave];
  if ("es" in tipo) return tipo;
  return aviso.n === undefined ? tipo.sin : tipo.con;
}

/** Icono + texto, siempre los dos: el tono (alerta o aviso) nunca va solo en el color. */
function FilaDeAviso({ aviso }: { aviso: Aviso }) {
  const alerta = AVISOS_QUE_ALERTAN.has(aviso.clave);
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className={`mt-0.5 flex size-6 flex-none items-center justify-center rounded-full border text-[0.875rem] font-semibold ${
          alerta
            ? "border-alerta text-alerta"
            : "border-borde-control text-tinta-suave"
        }`}
      >
        {alerta ? "!" : "i"}
      </span>
      <p className="text-tinta text-[0.9375rem] leading-relaxed">
        <Rico
          texto={textoDeAviso(aviso)}
          datos={aviso.n === undefined ? undefined : { n: aviso.n }}
        />
      </p>
    </li>
  );
}

// ── La historia de un PDF ───────────────────────────────────────────────────────────────────────

function HistoriaDelPdf({ revisiones }: { revisiones: RevisionesDePdf }) {
  const { t, idioma } = useT();
  const conHistoria = revisiones.revisiones > 1;
  const anteriores = revisiones.revisiones - 1;

  return (
    <Panel
      etiqueta={t(M.revisiones.etiqueta)}
      titulo={
        conHistoria
          ? t(M.revisiones.tituloVarias, { n: revisiones.revisiones })
          : t(M.revisiones.tituloUna)
      }
    >
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
        <Cifra etiqueta={t(M.revisiones.cifras.versiones)}>
          {numero(revisiones.revisiones, idioma)}
        </Cifra>
        <Cifra etiqueta={t(M.revisiones.cifras.redefinidos)}>
          {numero(revisiones.objetosRedefinidos, idioma)}
        </Cifra>
        <Cifra etiqueta={t(M.revisiones.cifras.id)} pequena>
          {t(
            revisiones.conId
              ? M.revisiones.cifras.conId
              : M.revisiones.cifras.sinId,
          )}
        </Cifra>
      </dl>

      <p className="text-tinta-suave mt-5 text-[0.9375rem] leading-relaxed">
        {conHistoria ? (
          <>
            <Rico texto={M.revisiones.conHistoria} />{" "}
            <Rico
              texto={plural(
                anteriores,
                M.revisiones.anterioresUna,
                M.revisiones.anterioresVarias,
              )}
              datos={{ anteriores }}
            />
          </>
        ) : (
          <Rico texto={M.revisiones.sinHistoria} />
        )}
      </p>
      <p className="text-tinta-tenue mt-3 text-[0.875rem] leading-relaxed">
        <Rico texto={M.revisiones.idNota} />
      </p>
    </Panel>
  );
}

function Cifra({
  etiqueta,
  pequena = false,
  children,
}: {
  etiqueta: string;
  pequena?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="etiqueta">{etiqueta}</dt>
      <dd
        className={`cifra text-tinta mt-1.5 font-semibold ${
          pequena ? "text-[0.9375rem] leading-snug" : "text-2xl"
        }`}
      >
        {children}
      </dd>
    </div>
  );
}
