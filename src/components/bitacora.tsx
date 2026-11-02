"use client";

// P8 — la bitácora, cargada bajo demanda.
//
// Vive fuera de `page.tsx` por la lección que el S2 pagó con `/transformar` y el S3 repitió con
// `/regreso`: lo que se ve primero se sirve primero, lo que pesa se carga cuando hace falta. Aquí
// lo pesado es la criptografía del worker, y no hace falta hasta que el usuario suelta un archivo.
//
// ── El orden de la pantalla, que no es maquetación ────────────────────────────────────────────
//
//   1. **La anotación pendiente, primero.** Si el usuario llegó del taller es a lo que viene, y
//      enterrarla bajo un formulario de apertura le haría buscar su propio recado.
//   2. Abrir la bitácora que ya tiene, o empezar la primera.
//   3. Las entradas, de la más reciente a la más antigua.
//
// ── Lo que esta pantalla NO hace ──────────────────────────────────────────────────────────────
//
// No guarda nada por su cuenta. Sella un archivo y te lo ofrece; dónde vive es cosa tuya, igual que
// la bóveda. Y **no recuerda la frase**: hay que escribirla otra vez para volver a sellar, porque
// el worker no la retiene entre mensajes.

import { useId, useRef, useState } from "react";

import { Boton, clasesDeBoton } from "@/components/boton";
import {
  IconoAbrir,
  IconoCuaderno,
  IconoDescargar,
  IconoEquis,
  IconoMas,
} from "@/components/iconos";
import { Panel } from "@/components/panel";
import { MarcaDeSello } from "@/components/sello";
import { Rico, useT } from "@/components/texto";
import type { EntradaDeBitacora } from "@/engine/bitacora";
import {
  abrirArchivoDeBitacora,
  cerrarBitacora,
  descartarAnotacion,
  guardarBitacora,
  useBitacora,
} from "@/lib/bitacora";
import { NOMBRE_DEL_FORMATO, numero, porcentaje } from "@/lib/formato";
import { plural } from "@/lib/idioma";
import { BITACORA } from "@/lib/idioma/textos/bitacora";
import { nombreDeTecnica } from "@/lib/tecnicas-en-palabras";

/** El mismo mínimo que la bóveda y la llave: una frase corta no la salva el PBKDF2. */
const MINIMO = 12;

export function Bitacora() {
  const { t } = useT();
  const estado = useBitacora();
  const abierta =
    estado.archivo.fase === "abierta" ? estado.archivo.contenido : null;

  return (
    <div className="space-y-8">
      {estado.pendiente ? (
        <Anotacion
          entrada={estado.pendiente}
          yaTiene={abierta?.entradas.length ?? null}
          sellando={estado.sellando}
          guardado={estado.guardado}
        />
      ) : null}

      {estado.guardado && !estado.pendiente ? (
        <Panel
          etiqueta={t(BITACORA.lista.etiqueta)}
          titulo={t(BITACORA.lista.titulo)}
        >
          <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
            <Rico texto={BITACORA.lista.nota} />
          </p>
          <a
            href={estado.guardado.url}
            download={estado.guardado.nombre}
            className={`${clasesDeBoton("principal")} mt-4`}
          >
            <IconoDescargar />
            {t(BITACORA.guardar)}
          </a>
        </Panel>
      ) : null}

      <Apertura estado={estado.archivo} />

      {abierta ? (
        <Entradas entradas={abierta.entradas} huella={abierta.huella} />
      ) : null}
    </div>
  );
}

// ── 1 · La anotación que trae del taller ──────────────────────────────────────────────────────

function Anotacion({
  entrada,
  yaTiene,
  sellando,
  guardado,
}: {
  entrada: EntradaDeBitacora;
  /** Cuántas entradas tiene la bitácora abierta, o `null` si no hay ninguna abierta. */
  yaTiene: number | null;
  sellando: boolean;
  guardado: { url: string; nombre: string } | null;
}) {
  const { t } = useT();
  const idDeFrase = useId();
  const idDeAyuda = useId();
  const [frase, setFrase] = useState("");
  const primera = yaTiene === null;

  if (guardado) {
    return (
      <Panel
        etiqueta={t(BITACORA.anotacion.guardada.etiqueta)}
        titulo={t(BITACORA.anotacion.guardada.titulo)}
        nota={<Rico texto={BITACORA.anotacion.guardada.nota} />}
      >
        <a
          href={guardado.url}
          download={guardado.nombre}
          className={clasesDeBoton("principal")}
        >
          <IconoDescargar />
          {t(BITACORA.guardar)}
        </a>
        <p className="text-tinta-suave mt-3 text-[0.875rem] leading-relaxed">
          <code className="font-mono text-[0.8125rem]">{guardado.nombre}</code>{" "}
          <Rico texto={BITACORA.anotacion.guardada.sustituye} />
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      etiqueta={t(BITACORA.anotacion.etiqueta)}
      titulo={
        primera
          ? t(BITACORA.anotacion.tituloPrimera)
          : t(
              plural(
                yaTiene,
                BITACORA.anotacion.tituloSiguienteUna,
                BITACORA.anotacion.tituloSiguienteVarias,
              ),
              { n: yaTiene },
            )
      }
      nota={
        <Rico
          texto={
            primera
              ? BITACORA.anotacion.notaPrimera
              : BITACORA.anotacion.notaSiguiente
          }
        />
      }
    >
      <ResumenDeEntrada entrada={entrada} />

      <div className="mt-5">
        <label
          htmlFor={idDeFrase}
          className="text-tinta block text-[0.9375rem]"
        >
          {primera
            ? t(BITACORA.anotacion.fraseNueva)
            : t(BITACORA.anotacion.fraseExistente)}
        </label>
        <input
          id={idDeFrase}
          type="password"
          value={frase}
          disabled={sellando}
          autoComplete="off"
          aria-describedby={idDeAyuda}
          aria-invalid={frase.length > 0 && frase.length < MINIMO}
          className="rounded-1 border-borde-control bg-superficie text-tinta mt-2 w-full max-w-md border px-3 py-2 text-[0.9375rem]"
          onChange={(evento) => setFrase(evento.target.value)}
        />
        <p id={idDeAyuda} className="text-tinta-tenue mt-2 text-[0.8125rem]">
          <Rico
            texto={
              primera
                ? BITACORA.anotacion.ayudaPrimera
                : BITACORA.anotacion.ayudaSiguiente
            }
            datos={{ minimo: MINIMO }}
          />
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Boton
          type="button"
          disabled={frase.length < MINIMO || sellando}
          onClick={() => {
            guardarBitacora(frase);
            // La frase deja de existir en esta pantalla en cuanto sale hacia el worker.
            setFrase("");
          }}
        >
          <IconoMas />
          {sellando
            ? t(BITACORA.anotacion.cifrando)
            : primera
              ? t(BITACORA.anotacion.cifrarPrimera)
              : t(BITACORA.anotacion.anadir)}
        </Boton>
        <Boton type="button" variante="discreto" onClick={descartarAnotacion}>
          <IconoEquis />
          {t(BITACORA.anotacion.descartar)}
        </Boton>
        {sellando ? (
          <p role="status" className="text-tinta-suave text-[0.875rem]">
            <Rico texto={BITACORA.anotacion.derivando} />
          </p>
        ) : null}
      </div>
    </Panel>
  );
}

// ── 2 · Abrir la que ya existe ────────────────────────────────────────────────────────────────

function Apertura({
  estado,
}: {
  estado: ReturnType<typeof useBitacora>["archivo"];
}) {
  const { t } = useT();
  const idDeFrase = useId();
  const entrada = useRef<HTMLInputElement>(null);
  const [frase, setFrase] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);

  if (estado.fase === "abierta") return null;

  const abriendo = estado.fase === "abriendo";

  return (
    <Panel
      etiqueta={t(BITACORA.apertura.etiqueta)}
      titulo={t(BITACORA.apertura.titulo)}
      nota={<Rico texto={BITACORA.apertura.nota} />}
    >
      {/* El input va escondido detrás de un botón propio, como en `/regreso`. No es capricho: el
          control nativo escribe «Choose File / No file chosen» en el idioma del NAVEGADOR, no en el
          de la página, y ese texto es chrome del navegador — no se puede traducir ni desde `lang`
          ni desde el pseudo-elemento `file:`, que solo pinta el botón. Era la única pantalla de las
          cinco con inglés a la vista, y el § 6 del sistema de diseño veta el inglés residual.

          El input sigue siendo REAL y navegable por teclado (`sr-only` no lo saca del orden de
          tabulación), y conserva su `aria-label`: lo que cambia es lo que se ve, no lo que se
          puede hacer. */}
      <div className="flex flex-wrap items-center gap-3">
        <Boton
          type="button"
          variante="discreto"
          disabled={abriendo}
          onClick={() => entrada.current?.click()}
        >
          <IconoCuaderno />
          {t(BITACORA.apertura.elegir)}
        </Boton>
        <input
          ref={entrada}
          type="file"
          accept=".velolog"
          disabled={abriendo}
          aria-label={t(BITACORA.apertura.ariaArchivo)}
          className="sr-only"
          onChange={(evento) => {
            setArchivo(evento.target.files?.[0] ?? null);
            // Se limpia para que volver a elegir EL MISMO archivo dispare el cambio otra vez.
            evento.target.value = "";
          }}
        />
        {archivo ? (
          <p className="text-tinta text-[0.875rem]">
            <code className="font-mono text-[0.8125rem]">{archivo.name}</code>
          </p>
        ) : (
          <p className="text-tinta-tenue text-[0.875rem]">
            {t(BITACORA.apertura.ningunArchivo)}
          </p>
        )}
      </div>

      <div className="mt-4">
        <label
          htmlFor={idDeFrase}
          className="text-tinta block text-[0.9375rem]"
        >
          {t(BITACORA.apertura.frase)}
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
          disabled={!archivo || frase.length === 0 || abriendo}
          onClick={() => {
            if (!archivo) return;
            abrirArchivoDeBitacora(archivo, frase);
            setFrase("");
          }}
        >
          <IconoAbrir />
          {abriendo
            ? t(BITACORA.apertura.descifrando)
            : t(BITACORA.apertura.abrir)}
        </Boton>
        {abriendo ? (
          <p role="status" className="text-tinta-suave text-[0.875rem]">
            <Rico texto={BITACORA.apertura.derivando} />
          </p>
        ) : null}
      </div>

      {estado.fase === "rechazada" ? (
        <p
          role="alert"
          className="text-alerta mt-4 text-[0.875rem] leading-relaxed"
        >
          <Rico texto={BITACORA.apertura.fallos[estado.motivo]} />
        </p>
      ) : null}
    </Panel>
  );
}

// ── 3 · Las entradas ──────────────────────────────────────────────────────────────────────────

function Entradas({
  entradas,
  huella,
}: {
  entradas: readonly EntradaDeBitacora[];
  huella: string;
}) {
  const { t, idioma } = useT();
  // De la más reciente a la más antigua: al abrir la bitácora, lo que se busca casi siempre es lo
  // último. El ARCHIVO las guarda en orden de registro —la primera es la más antigua— y esa es la
  // que no se toca; el orden de lectura es cosa de la pantalla.
  const recientesPrimero = [...entradas].reverse();
  const [abierta, setAbierta] = useState<string | null>(null);

  return (
    <Panel
      etiqueta={t(BITACORA.entradas.etiqueta)}
      titulo={t(
        plural(
          entradas.length,
          BITACORA.entradas.tituloUna,
          BITACORA.entradas.tituloVarias,
        ),
        { n: entradas.length },
      )}
      nota={<Rico texto={BITACORA.entradas.nota} />}
    >
      <ul className="divide-borde divide-y">
        {recientesPrimero.map((entrada, indice) => {
          const clave = `${entrada.huellaDeSalida}-${indice}`;
          const desplegada = abierta === clave;
          return (
            <li key={clave} className="py-3 first:pt-0 last:pb-0">
              <button
                type="button"
                aria-expanded={desplegada}
                onClick={() => setAbierta(desplegada ? null : clave)}
                className="hover:text-tinta w-full text-left"
              >
                <span className="text-tinta block text-[0.9375rem] font-medium">
                  {entrada.archivo}
                </span>
                <span className="text-tinta-tenue mt-0.5 block text-[0.8125rem]">
                  {entrada.metadatos
                    ? t(BITACORA.entradas.lineaMetadatos, {
                        fecha: entrada.fecha,
                        formato: NOMBRE_DEL_FORMATO[entrada.metadatos.formato],
                      })
                    : t(BITACORA.entradas.linea, {
                        fecha: entrada.fecha,
                        filas: entrada.filas,
                        unidadFilas: t(
                          plural(
                            entrada.filas,
                            BITACORA.unidades.fila,
                            BITACORA.unidades.filas,
                          ),
                        ),
                        tecnicas:
                          entrada.tecnicas.length === 0
                            ? t(BITACORA.entradas.sinTecnicas)
                            : entrada.tecnicas
                                .map((clave) => nombreDeTecnica(clave, idioma))
                                .join(", "),
                      })}
                </span>
              </button>
              {desplegada ? (
                <div className="mt-3 pl-1">
                  <ResumenDeEntrada entrada={entrada} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="border-borde mt-5 border-t pt-4">
        <p className="text-tinta-tenue text-[0.8125rem] leading-relaxed">
          <Rico texto={BITACORA.entradas.huellaAntes} />{" "}
          <code className="font-mono text-[0.75rem]">
            {huella.slice(0, 16)}…
          </code>{" "}
          <Rico texto={BITACORA.entradas.huellaDespues} />
        </p>
        {/* Cerrarla es la única forma de abrir otra, y hace falta de verdad: mata el worker, y con
            él la bitácora descifrada. Sin este botón, `cerrarBitacora` sería un exportado sin
            llamador — justo lo que la regla §5 existe para impedir. */}
        <Boton
          type="button"
          variante="discreto"
          className="mt-4"
          onClick={cerrarBitacora}
        >
          <IconoEquis />
          {t(BITACORA.entradas.cerrar)}
        </Boton>
      </div>
      <MarcaDeSello clase="text-tinta-tenue size-8" />
    </Panel>
  );
}

/** El detalle de una entrada. Lo usan la anotación pendiente y la lista, para que digan lo mismo. */
function ResumenDeEntrada({ entrada }: { entrada: EntradaDeBitacora }) {
  const { t, idioma } = useT();
  // Una limpieza de metadatos (S6) tiene su propio detalle: nunca las líneas de filas, técnicas y
  // riesgo, que en ella son ceros que no significan nada y se leerían como una medición.
  if (entrada.metadatos) return <ResumenDeLimpieza entrada={entrada} />;
  return (
    <dl className="text-[0.875rem] leading-relaxed">
      <Dato termino={t(BITACORA.detalle.archivo)} valor={entrada.archivo} />
      <Dato termino={t(BITACORA.detalle.fecha)} valor={entrada.fecha} />
      <Dato
        termino={t(BITACORA.detalle.filas)}
        valor={`${numero(entrada.filas, idioma)} ${t(
          plural(
            entrada.filas,
            BITACORA.unidades.fila,
            BITACORA.unidades.filas,
          ),
        )}`}
      />
      <Dato
        termino={t(BITACORA.detalle.tecnicas)}
        valor={
          entrada.tecnicas.length === 0
            ? t(BITACORA.detalle.ninguna)
            : entrada.tecnicas
                .map((clave) => nombreDeTecnica(clave, idioma))
                .join(", ")
        }
      />
      {/* Las DOS puntas del riesgo, nunca la reducción entre ellas. Es la decisión del ADR-007 y
          viene de la lección más cara del S2: «bajó del 30 % al 2 %» es cierta y puede engañar, y
          una bitácora se lee meses después, sin la pantalla al lado que la matice. */}
      <Dato
        termino={t(BITACORA.detalle.unicos)}
        valor={t(BITACORA.detalle.unicosValor, {
          antes: porcentaje(entrada.unicosAntes, idioma),
          despues: porcentaje(entrada.unicosDespues, idioma),
        })}
      />
      <Dato
        termino={t(BITACORA.detalle.politica)}
        valor={
          <code className="font-mono text-[0.8125rem]">
            {entrada.hashDePolitica.slice(0, 8)}
          </code>
        }
      />
      <Dato
        termino={t(BITACORA.detalle.huellaDeEntrada)}
        valor={
          <code className="font-mono text-[0.75rem]">
            {entrada.huellaDeEntrada.slice(0, 16)}…
          </code>
        }
      />
      <Dato
        termino={t(BITACORA.detalle.huellaDeSalida)}
        valor={
          <code className="font-mono text-[0.75rem]">
            {entrada.huellaDeSalida.slice(0, 16)}…
          </code>
        }
      />
      {!entrada.esTitular ? (
        <div className="text-aviso mt-2 text-[0.8125rem] leading-relaxed">
          <Rico texto={BITACORA.detalle.salvedades} />
        </div>
      ) : null}
    </dl>
  );
}

/** El detalle de una LIMPIEZA de metadatos: qué formato, qué se quitó, y las dos huellas. */
function ResumenDeLimpieza({ entrada }: { entrada: EntradaDeBitacora }) {
  const { t, idioma } = useT();
  const L = BITACORA.detalle.limpieza;
  const metadatos = entrada.metadatos;
  if (!metadatos) return null;
  return (
    <dl className="text-[0.875rem] leading-relaxed">
      <Dato termino={t(BITACORA.detalle.archivo)} valor={entrada.archivo} />
      <Dato termino={t(BITACORA.detalle.fecha)} valor={entrada.fecha} />
      <Dato termino={t(L.tratamiento)} valor={t(L.tratamientoValor)} />
      <Dato
        termino={t(L.formato)}
        valor={NOMBRE_DEL_FORMATO[metadatos.formato]}
      />
      <Dato termino={t(L.campos)} valor={numero(metadatos.campos, idioma)} />
      <Dato
        termino={t(L.bloques)}
        valor={numero(metadatos.elementos, idioma)}
      />
      {metadatos.formato === "pdf" ? (
        <Dato
          termino={t(L.versiones)}
          valor={numero(metadatos.revisionesQuitadas, idioma)}
        />
      ) : null}
      <Dato
        termino={t(BITACORA.detalle.huellaDeEntrada)}
        valor={
          <code className="font-mono text-[0.75rem]">
            {entrada.huellaDeEntrada.slice(0, 16)}…
          </code>
        }
      />
      <Dato
        termino={t(BITACORA.detalle.huellaDeSalida)}
        valor={
          <code className="font-mono text-[0.75rem]">
            {entrada.huellaDeSalida.slice(0, 16)}…
          </code>
        }
      />
      <p className="text-tinta-tenue mt-2 text-[0.8125rem] leading-relaxed">
        {t(L.nota)}
      </p>
    </dl>
  );
}

function Dato({ termino, valor }: { termino: string; valor: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2 py-0.5">
      <dt className="text-tinta-tenue min-w-[10rem]">{termino}</dt>
      <dd className="text-tinta-suave">{valor}</dd>
    </div>
  );
}
