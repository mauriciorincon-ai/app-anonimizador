"use client";

// P7 — el regreso, cargado bajo demanda.
//
// Vive fuera de `page.tsx` por la razón que el S2 pagó caro: `/transformar` nació con el motor
// entero en el bundle de la página, sacó 0,88 en Lighthouse el día del PR y hubo que rehacer la
// carga a última hora. Aquí la ruta nace medida (0,93 estando vacía, que es el piso común de la
// app) y todo lo pesado entra bajo demanda.
//
// El orden de la pantalla NO es de maquetación: es el contrato de honestidad del sprint.
//
//   1. La bóveda, primero. Sin ella no hay nada que hacer.
//   2. El archivo devuelto.
//   3. **El aviso de ambigüedad, ANTES del botón de restaurar.** La bóveda sabe cuántos seudónimos
//      tienen dos originales antes de mirar el archivo, así que el usuario puede saberlo antes de
//      decidir. Ponerlo después sería contarle el precio cuando ya pagó.
//   4. El informe, con sus salvedades encima de la cifra.
//   5. Las descargas.

import { useId, useRef, useState } from "react";
import Link from "next/link";

import { Boton, clasesDeBoton } from "@/components/boton";
import {
  IconoAbrir,
  IconoArchivador,
  IconoAtras,
  IconoDescargar,
  IconoDocumento,
  IconoReiniciar,
  IconoTabla,
  IconoVolver,
} from "@/components/iconos";
import { Panel } from "@/components/panel";
import { MarcaDeSello } from "@/components/sello";
import { Rico, useT } from "@/components/texto";
import { numero, porcentaje } from "@/lib/formato";
import { LOCALE, plural, type Texto } from "@/lib/idioma";
import { REGRESO } from "@/lib/idioma/textos/regreso";
import {
  abrirLaBoveda,
  cargarDevuelto,
  descartarRegreso,
  prepararInformeDelRegreso,
  prepararRestaurado,
  restaurarAhora,
  useRegreso,
  type EstadoDelRegreso,
} from "@/lib/regreso";
import type { MotivoDeError, ResumenDelRegreso } from "@/workers/contrato";

const MINIMO = 12;

/**
 * Cada fallo del archivo devuelto con su frase (`REGRESO.devuelto.fallos`), por el mismo motivo que
 * los de la bóveda.
 *
 * Hasta la auditoría de este sprint el estado guardaba el motivo y la pantalla pintaba siempre
 * «comprueba que sea un CSV» — cierto para uno de los casos y desorientador para el resto: a quien
 * suelta un archivo vacío se le decía que revisara el formato, que es lo único que NO tenía mal.
 *
 * El caso de Excel se dice allí y no se soporta a medias: `.xlsx` es un zip y PapaParse lo lee como
 * texto binario, así que el fallo llega como archivo ilegible o vacío según el caso. Guiar a CSV es
 * la respuesta honesta —la misma que el S1 dio para la entrada— y no cuesta código nuevo.
 */
const FALLOS_DEL_DEVUELTO: Partial<Record<MotivoDeError, Texto>> =
  REGRESO.devuelto.fallos;

export function Regreso() {
  const estado = useRegreso();
  const { t } = useT();

  return (
    <>
      <div className="space-y-6">
        <PanelDeBoveda estado={estado} />
        {estado.boveda.fase === "abierta" ? (
          <PanelDelDevuelto estado={estado} />
        ) : null}
        {estado.boveda.fase === "abierta" &&
        estado.devuelto.fase === "listo" ? (
          <PanelDeConfirmacion estado={estado} />
        ) : null}
        {estado.restauracion.fase === "hecha" ? (
          <>
            <InformeEnPantalla resumen={estado.restauracion.resumen} />
            <PanelDeDescargas estado={estado} />
          </>
        ) : null}
      </div>

      <div className="border-borde mt-10 border-t pt-6">
        <button
          type="button"
          className={clasesDeBoton("discreto")}
          onClick={descartarRegreso}
        >
          <IconoReiniciar />
          {t(REGRESO.reiniciar.boton)}
        </button>
        <p className="text-tinta-tenue mt-3 max-w-prose text-[0.8125rem] leading-relaxed">
          <Rico texto={REGRESO.reiniciar.nota} />
        </p>
      </div>
    </>
  );
}

function PanelDeBoveda({ estado }: { estado: EstadoDelRegreso }) {
  const { t, idioma } = useT();
  const idDeFrase = useId();
  const entrada = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [frase, setFrase] = useState("");
  const { boveda } = estado;

  if (boveda.fase === "abierta") {
    const { resumen } = boveda;
    return (
      <Panel
        etiqueta={t(REGRESO.boveda.paso)}
        titulo={t(REGRESO.boveda.abierta.titulo)}
        nota={<Rico texto={REGRESO.boveda.abierta.nota} />}
      >
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="etiqueta">{t(REGRESO.boveda.abierta.huella)}</dt>
            <dd className="text-tinta mt-1 font-mono text-[0.8125rem] break-all">
              {resumen.huella}
            </dd>
          </div>
          <div>
            <dt className="etiqueta">{t(REGRESO.boveda.abierta.llave)}</dt>
            <dd className="text-tinta mt-1 font-mono text-[0.9375rem]">
              {resumen.huellaDeLlave}
            </dd>
          </div>
          <div>
            <dt className="etiqueta">
              {t(REGRESO.boveda.abierta.correspondencias)}
            </dt>
            <dd className="text-tinta mt-1 text-[0.9375rem]">
              {numero(resumen.pares, idioma)}
            </dd>
          </div>
          <div>
            <dt className="etiqueta">{t(REGRESO.boveda.abierta.columnas)}</dt>
            <dd className="text-tinta mt-1 text-[0.9375rem]">
              {resumen.columnas.map((nombre, i) => (
                <span key={nombre}>
                  {i > 0 ? " · " : ""}
                  <code className="font-mono text-[0.8125rem]">{nombre}</code>
                </span>
              ))}
            </dd>
          </div>
        </dl>
      </Panel>
    );
  }

  const abriendo = boveda.fase === "abriendo";

  return (
    <Panel
      etiqueta={t(REGRESO.boveda.paso)}
      titulo={t(REGRESO.boveda.sinAbrir.titulo)}
      nota={<Rico texto={REGRESO.boveda.sinAbrir.nota} />}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Boton
          type="button"
          variante="discreto"
          onClick={() => entrada.current?.click()}
        >
          <IconoArchivador />
          {t(REGRESO.boveda.sinAbrir.elegir)}
        </Boton>
        <input
          ref={entrada}
          type="file"
          accept=".velo,application/octet-stream"
          className="sr-only"
          aria-label={t(REGRESO.boveda.sinAbrir.ariaArchivo)}
          onChange={(evento) => {
            setArchivo(evento.target.files?.[0] ?? null);
            evento.target.value = "";
          }}
        />
        {archivo ? (
          <p className="text-tinta text-[0.875rem]">
            <code className="font-mono text-[0.8125rem]">{archivo.name}</code>
          </p>
        ) : (
          <p className="text-tinta-tenue text-[0.875rem]">
            {t(REGRESO.ningunArchivo)}
          </p>
        )}
      </div>

      <div className="mt-5">
        <label
          htmlFor={idDeFrase}
          className="text-tinta block text-[0.9375rem]"
        >
          {t(REGRESO.boveda.sinAbrir.frase)}
        </label>
        <input
          id={idDeFrase}
          type="password"
          value={frase}
          disabled={abriendo}
          autoComplete="off"
          className="rounded-1 border-borde-control bg-superficie text-tinta mt-2 w-full max-w-md border px-3 py-2 text-[0.9375rem]"
          onChange={(evento) => setFrase(evento.target.value)}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Boton
          type="button"
          disabled={!archivo || frase.length < MINIMO || abriendo}
          onClick={() => {
            if (!archivo) return;
            abrirLaBoveda(archivo, frase);
            // La frase deja de existir en esta pantalla en cuanto sale hacia el worker.
            setFrase("");
          }}
        >
          <IconoAbrir />
          {abriendo
            ? t(REGRESO.boveda.sinAbrir.abriendo)
            : t(REGRESO.boveda.sinAbrir.abrir)}
        </Boton>
        {abriendo ? (
          <p role="status" className="text-tinta-suave text-[0.875rem]">
            <Rico texto={REGRESO.boveda.sinAbrir.derivando} />
          </p>
        ) : null}
      </div>

      {boveda.fase === "rechazada" ? (
        <p
          role="alert"
          className="text-alerta mt-4 text-[0.875rem] leading-relaxed"
        >
          <Rico texto={REGRESO.boveda.fallos[boveda.motivo]} />
        </p>
      ) : null}
    </Panel>
  );
}

function PanelDelDevuelto({ estado }: { estado: EstadoDelRegreso }) {
  const { t } = useT();
  const entrada = useRef<HTMLInputElement>(null);
  const { devuelto } = estado;

  return (
    <Panel
      etiqueta={t(REGRESO.devuelto.paso)}
      titulo={t(REGRESO.devuelto.titulo)}
      nota={<Rico texto={REGRESO.devuelto.nota} />}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Boton
          type="button"
          variante="discreto"
          onClick={() => entrada.current?.click()}
        >
          <IconoTabla />
          {t(REGRESO.devuelto.elegir)}
        </Boton>
        <input
          ref={entrada}
          type="file"
          accept=".csv,text/csv,.json,.jsonl,.ndjson,application/json"
          className="sr-only"
          aria-label={t(REGRESO.devuelto.ariaArchivo)}
          onChange={(evento) => {
            const elegido = evento.target.files?.[0];
            if (elegido) cargarDevuelto(elegido);
            evento.target.value = "";
          }}
        />
        {devuelto.fase === "analizando" ? (
          <p role="status" className="text-tinta-suave text-[0.875rem]">
            {t(REGRESO.devuelto.leyendo)}{" "}
            <code className="font-mono">{devuelto.nombre}</code>…
          </p>
        ) : null}
        {devuelto.fase === "sin-archivo" ? (
          <p className="text-tinta-tenue text-[0.875rem]">
            {t(REGRESO.ningunArchivo)}
          </p>
        ) : null}
      </div>

      {devuelto.fase === "listo" ? (
        <p className="text-tinta mt-4 text-[0.9375rem] leading-relaxed">
          <code className="font-mono text-[0.8125rem]">{devuelto.nombre}</code>{" "}
          <Rico
            texto={REGRESO.devuelto.resumen}
            datos={{
              filas: devuelto.filas,
              unidadFilas: t(
                plural(
                  devuelto.filas,
                  REGRESO.unidades.fila,
                  REGRESO.unidades.filas,
                ),
              ),
              columnas: devuelto.columnas,
              unidadColumnas: t(
                plural(
                  devuelto.columnas,
                  REGRESO.unidades.columna,
                  REGRESO.unidades.columnas,
                ),
              ),
            }}
          />
        </p>
      ) : null}

      {devuelto.fase === "error" ? (
        <p
          role="alert"
          className="text-alerta mt-4 text-[0.875rem] leading-relaxed"
        >
          <Rico
            texto={
              FALLOS_DEL_DEVUELTO[devuelto.motivo] ??
              REGRESO.devuelto.falloPorDefecto
            }
          />
        </p>
      ) : null}
    </Panel>
  );
}

/**
 * El aviso de ambigüedad, **antes** de restaurar.
 *
 * La bóveda sabe cuántos seudónimos tienen dos originales sin haber mirado el archivo devuelto, así
 * que el número se puede dar ANTES de que el usuario pulse. Decirlo después sería contarle el precio
 * cuando ya pagó — y es exactamente la composición engañosa que este producto persigue.
 */
function PanelDeConfirmacion({ estado }: { estado: EstadoDelRegreso }) {
  const { t } = useT();
  if (estado.boveda.fase !== "abierta") return null;
  const { colisiones } = estado.boveda.resumen;
  const restaurando = estado.restauracion.fase === "restaurando";

  return (
    <Panel
      etiqueta={t(REGRESO.confirmacion.paso)}
      titulo={
        colisiones > 0
          ? t(REGRESO.confirmacion.tituloConColisiones)
          : t(REGRESO.confirmacion.tituloListo)
      }
    >
      {colisiones > 0 ? (
        <div className="text-tinta space-y-2 text-[0.9375rem] leading-relaxed">
          <p>
            <Rico
              texto={plural(
                colisiones,
                REGRESO.confirmacion.colisionUna,
                REGRESO.confirmacion.colisionVarias,
              )}
              datos={{ n: colisiones }}
            />
          </p>
          <p className="text-tinta-suave">
            <Rico texto={REGRESO.confirmacion.sinResolver} />
          </p>
        </div>
      ) : (
        <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
          <Rico texto={REGRESO.confirmacion.sinColisiones} />
        </p>
      )}

      <div className="mt-5">
        <Boton type="button" disabled={restaurando} onClick={restaurarAhora}>
          <IconoVolver />
          {restaurando
            ? t(REGRESO.confirmacion.restaurando)
            : t(REGRESO.confirmacion.restaurar)}
        </Boton>
      </div>

      {estado.restauracion.fase === "fallo" ? (
        <p role="alert" className="text-alerta mt-4 text-[0.875rem]">
          <Rico texto={REGRESO.confirmacion.fallo} />
        </p>
      ) : null}
    </Panel>
  );
}

/**
 * El informe en pantalla. **Las salvedades van arriba de la cifra**, igual que en el documento
 * exportado: el orden es la decisión, no el adorno.
 */
function InformeEnPantalla({ resumen }: { resumen: ResumenDelRegreso }) {
  const { t, idioma } = useT();
  const conContenido =
    resumen.totales.restauradas +
    resumen.totales.ambiguas +
    resumen.totales.desconocidas;

  return (
    <Panel
      etiqueta={t(REGRESO.resultado.paso)}
      titulo={t(REGRESO.resultado.reconocimiento[resumen.reconocimiento])}
    >
      {resumen.salvedades.length > 0 ? (
        <ul className="space-y-3">
          {resumen.salvedades.map((salvedad, i) => (
            <li
              key={`${salvedad.tipo}-${i}`}
              className={`text-[0.9375rem] leading-relaxed ${
                salvedad.gravedad === "descalifica"
                  ? "text-alerta"
                  : "text-tinta-suave"
              }`}
            >
              <Salvedad salvedad={salvedad} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
          <Rico texto={REGRESO.resultado.sinSalvedades} />
        </p>
      )}

      {resumen.proporcionRestaurada === null ? (
        <p className="text-tinta mt-5 text-[0.9375rem] leading-relaxed">
          <Rico texto={REGRESO.resultado.nadaQueRestaurar} />
        </p>
      ) : resumen.esTitular ? (
        <p className="text-tinta mt-5 text-[1.5rem] leading-tight font-semibold">
          {porcentaje(resumen.proporcionRestaurada, idioma)}
          <span className="text-tinta-suave block text-[0.9375rem] font-normal">
            <Rico
              texto={REGRESO.resultado.titular}
              datos={{
                restauradas: resumen.totales.restauradas,
                total: conContenido,
              }}
            />
          </span>
        </p>
      ) : (
        <p className="text-tinta mt-5 text-[0.9375rem] leading-relaxed">
          <Rico
            texto={REGRESO.resultado.conSalvedades.cifra}
            datos={{
              restauradas: resumen.totales.restauradas,
              total: conContenido,
              porcentaje: porcentaje(resumen.proporcionRestaurada, idioma),
            }}
          />{" "}
          <strong className="text-alerta font-medium">
            <Rico texto={REGRESO.resultado.conSalvedades.aviso} />
          </strong>{" "}
          <Rico texto={REGRESO.resultado.conSalvedades.mientras} />
        </p>
      )}

      <dl className="border-borde mt-5 grid gap-4 border-t pt-4 sm:grid-cols-3">
        <div>
          <dt className="etiqueta">{t(REGRESO.resultado.restauradas)}</dt>
          <dd className="text-tinta mt-1 text-[0.9375rem]">
            {numero(resumen.totales.restauradas, idioma)}
          </dd>
        </div>
        <div>
          <dt className="etiqueta">{t(REGRESO.resultado.ambiguas)}</dt>
          <dd
            className={`mt-1 text-[0.9375rem] ${
              resumen.totales.ambiguas > 0 ? "text-alerta" : "text-tinta"
            }`}
          >
            {numero(resumen.totales.ambiguas, idioma)}
          </dd>
        </div>
        <div>
          <dt className="etiqueta">{t(REGRESO.resultado.cambiadas)}</dt>
          <dd className="text-tinta mt-1 text-[0.9375rem]">
            {numero(resumen.totales.desconocidas, idioma)}
          </dd>
        </div>
      </dl>
    </Panel>
  );
}

/**
 * Una salvedad, dicha en el idioma de la pantalla. El motor las entrega como datos estructurados
 * (`SalvedadDelRegreso`) y es aquí donde se componen. El nombre de una columna del usuario va TAL
 * CUAL, fuera del catálogo: pasarlo por el énfasis (`**`, `` ` ``) podría comerse caracteres de un
 * nombre que no es nuestro.
 */
function Salvedad({
  salvedad,
}: {
  salvedad: ResumenDelRegreso["salvedades"][number];
}) {
  const { idioma } = useT();
  const S = REGRESO.resultado.salvedades;

  switch (salvedad.tipo) {
    case "celdas-ambiguas":
      return (
        <Rico
          texto={plural(
            salvedad.cuantas,
            S.celdasAmbiguasUna,
            S.celdasAmbiguasVarias,
          )}
          datos={{ n: salvedad.cuantas }}
        />
      );
    case "boveda-no-corresponde":
      return <Rico texto={S.bovedaNoCorresponde} />;
    case "columnas-sin-aparecer": {
      const una = salvedad.columnas.length === 1;
      return (
        <>
          <Rico
            texto={
              una
                ? S.columnasSinAparecerUnaAntes
                : S.columnasSinAparecerVariasAntes
            }
          />{" "}
          {salvedad.columnas.join(" · ")}
          <Rico
            texto={
              una
                ? S.columnasSinAparecerUnaDespues
                : S.columnasSinAparecerVariasDespues
            }
          />
        </>
      );
    }
    case "columna-a-medias":
      return (
        <>
          {salvedad.columna}{" "}
          <Rico
            texto={S.columnaAMedias}
            datos={{ proporcion: porcentaje(salvedad.proporcion, idioma) }}
          />
        </>
      );
    case "celdas-desconocidas":
      return (
        <Rico
          texto={plural(
            salvedad.cuantas,
            S.celdasDesconocidasUna,
            S.celdasDesconocidasVarias,
          )}
          datos={{ n: salvedad.cuantas }}
        />
      );
  }
}

function PanelDeDescargas({ estado }: { estado: EstadoDelRegreso }) {
  const { t, idioma } = useT();
  const preparando = estado.etapa === "escribiendo";

  return (
    <Panel
      etiqueta={t(REGRESO.descargas.paso)}
      titulo={t(REGRESO.descargas.titulo)}
      nota={<Rico texto={REGRESO.descargas.nota} />}
    >
      {estado.escrituraFallida && !estado.archivo ? (
        // El símbolo, la palabra y el color juntos: el color nunca va solo.
        <p
          role="alert"
          className="text-alerta mb-4 text-[0.875rem] leading-relaxed"
        >
          <span aria-hidden="true" className="mr-1.5">
            ⚠
          </span>
          <Rico texto={REGRESO.descargas.escrituraFallida} />
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {estado.archivo ? (
          <a
            href={estado.archivo.url}
            download={estado.archivo.nombre}
            className={clasesDeBoton("principal")}
          >
            <IconoDescargar />
            {t(REGRESO.descargas.guardarArchivo)}
          </a>
        ) : (
          <Boton
            type="button"
            disabled={preparando}
            onClick={() => prepararRestaurado()}
          >
            <IconoDocumento />
            {preparando
              ? t(REGRESO.descargas.preparando)
              : t(REGRESO.descargas.prepararArchivo)}
          </Boton>
        )}

        {estado.informe ? (
          <a
            href={estado.informe.url}
            download={estado.informe.nombre}
            className={clasesDeBoton("discreto")}
          >
            <IconoDescargar />
            {t(REGRESO.descargas.guardarInforme)}
          </a>
        ) : (
          <Boton
            type="button"
            variante="discreto"
            disabled={preparando}
            onClick={() =>
              prepararInformeDelRegreso(
                // La fecha se inyecta desde afuera para que el documento sea reproducible: es lo
                // único que cambiaría solo entre dos generaciones del mismo informe.
                new Intl.DateTimeFormat(LOCALE[idioma], {
                  dateStyle: "long",
                }).format(new Date()),
              )
            }
          >
            <IconoDocumento />
            {t(REGRESO.descargas.prepararInforme)}
          </Boton>
        )}
      </div>

      <p className="text-tinta-suave mt-4 text-[0.875rem] leading-relaxed">
        <MarcaDeSello clase="text-tinta-tenue mr-1.5 inline size-4 align-[-2px]" />
        <Rico texto={REGRESO.descargas.sello} />
      </p>

      <div className="border-borde mt-5 border-t pt-4">
        <Link href="/" className={clasesDeBoton("discreto")}>
          <IconoAtras />
          {t(REGRESO.descargas.volver)}
        </Link>
      </div>
    </Panel>
  );
}
