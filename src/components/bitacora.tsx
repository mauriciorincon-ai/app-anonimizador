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

import { useId, useState } from "react";

import { Boton, clasesDeBoton } from "@/components/boton";
import { Panel } from "@/components/panel";
import { MarcaDeSello } from "@/components/sello";
import type { EntradaDeBitacora } from "@/engine/bitacora";
import {
  abrirArchivoDeBitacora,
  cerrarBitacora,
  descartarAnotacion,
  guardarBitacora,
  useBitacora,
} from "@/lib/bitacora";
import { numero, porcentaje } from "@/lib/formato";
import { nombreDeTecnica } from "@/lib/tecnicas-en-palabras";
import type { MotivoDeBitacora } from "@/workers/contrato";

/** El mismo mínimo que la bóveda y la llave: una frase corta no la salva el PBKDF2. */
const MINIMO = 12;

/**
 * Cada fallo con su frase.
 *
 * La primera es la que más trabajo hace: **abrir una bóveda donde se esperaba una bitácora** es el
 * error más probable del usuario —dos archivos cifrados de la misma app, guardados el mismo día— y
 * responderle «frase incorrecta» lo mandaría a probar frases media hora. La palabra mágica del
 * archivo permite distinguirlo sin descifrar nada, así que se distingue.
 */
const FALLOS: Record<MotivoDeBitacora, string> = {
  "no-es-una-bitacora":
    "Ese archivo no es una bitácora de Velo. Busca el que termina en .velolog — si el tuyo termina en .velo, esa es la bóveda, y se abre en El regreso.",
  "version-distinta":
    "Esa bitácora la hizo otra versión de Velo y esta no sabe leerla.",
  "frase-incorrecta":
    "La frase no abre esta bitácora. También sale este mensaje si el archivo se dañó o lo modificaron.",
  "costo-inaceptable":
    "La bitácora declara un costo de descifrado fuera de lo razonable: está dañada o la modificaron.",
  "contenido-invalido":
    "El archivo se descifró, pero lo que hay dentro no tiene la forma de una bitácora de Velo.",
  "lectura-fallida": "No se pudo leer el archivo.",
};

export function Bitacora() {
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
        <Panel etiqueta="Guardada" titulo="Tu bitácora, lista para guardar">
          <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
            Sustituye el archivo anterior: una bitácora es una sola y crece.
          </p>
          <a
            href={estado.guardado.url}
            download={estado.guardado.nombre}
            className={`${clasesDeBoton("principal")} mt-4`}
          >
            Guardar la bitácora
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
  const idDeFrase = useId();
  const idDeAyuda = useId();
  const [frase, setFrase] = useState("");
  const primera = yaTiene === null;

  if (guardado) {
    return (
      <Panel
        etiqueta="Paso 2 · guardar"
        titulo="Anotado. Ahora guarda el archivo"
        nota={
          <>
            Sin guardarlo, esta anotación se pierde al cerrar la pestaña — Velo
            no tiene dónde recordarla.
          </>
        }
      >
        <a
          href={guardado.url}
          download={guardado.nombre}
          className={clasesDeBoton("principal")}
        >
          Guardar la bitácora
        </a>
        <p className="text-tinta-suave mt-3 text-[0.875rem] leading-relaxed">
          <code className="font-mono text-[0.8125rem]">{guardado.nombre}</code>{" "}
          — sustituye al archivo anterior. Una bitácora es una sola y crece.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      etiqueta="Paso 1 · la anotación"
      titulo={
        primera
          ? "Tu primera anotación"
          : `Añadir al final de las ${numero(yaTiene)}`
      }
      nota={
        primera ? (
          <>
            No tienes ninguna bitácora abierta, así que esta empieza una. Si ya
            tenías una, ábrela primero ahí abajo y la anotación se le añade al
            final en vez de empezar otra.
          </>
        ) : (
          <>
            Se añade al final. Las anteriores no se tocan: lo que ya está
            escrito no cambia porque se escriba algo nuevo.
          </>
        )
      }
    >
      <ResumenDeEntrada entrada={entrada} />

      <div className="mt-5">
        <label htmlFor={idDeFrase} className="text-tinta text-[0.9375rem]">
          {primera
            ? "Elige la frase de paso de tu bitácora"
            : "Frase de paso de tu bitácora"}
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
          Al menos {MINIMO} caracteres.{" "}
          {primera ? (
            <>
              Que <strong className="font-medium">no sea</strong> la de la
              bóveda ni la del proyecto: son tres secretos con tres alcances, y
              reusarlos convierte la filtración de uno en la filtración de todo.
              Sin ella no hay forma de leer tu bitácora — ni Velo, ni nadie.
            </>
          ) : (
            "La misma con la que la abriste. Velo no la recuerda entre pasos, a propósito."
          )}
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
          {sellando
            ? "Cifrando…"
            : primera
              ? "Cifrar y empezar la bitácora"
              : "Añadir y cifrar"}
        </Boton>
        <Boton type="button" variante="discreto" onClick={descartarAnotacion}>
          Descartar la anotación
        </Boton>
        {sellando ? (
          <p role="status" className="text-tinta-suave text-[0.875rem]">
            Derivando la llave de cifrado y sellando el archivo.
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
  const idDeFrase = useId();
  const [frase, setFrase] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);

  if (estado.fase === "abierta") return null;

  const abriendo = estado.fase === "abriendo";

  return (
    <Panel
      etiqueta="Tu bitácora"
      titulo="Abre la bitácora que guardaste"
      nota={
        <>
          El archivo{" "}
          <code className="font-mono text-[0.8125rem]">.velolog</code> y su
          frase. Se descifra dentro de esta pestaña; nada se envía a ningún
          sitio.
        </>
      }
    >
      <input
        type="file"
        accept=".velolog"
        disabled={abriendo}
        aria-label="Archivo de bitácora"
        className="text-tinta-suave file:rounded-1 file:border-borde-control file:bg-superficie file:text-tinta block w-full max-w-md text-[0.875rem] file:mr-3 file:border file:px-3 file:py-1.5"
        onChange={(evento) => setArchivo(evento.target.files?.[0] ?? null)}
      />

      <div className="mt-4">
        <label htmlFor={idDeFrase} className="text-tinta text-[0.9375rem]">
          Frase de paso
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
          {abriendo ? "Descifrando…" : "Abrir la bitácora"}
        </Boton>
        {abriendo ? (
          <p role="status" className="text-tinta-suave text-[0.875rem]">
            Derivando la llave. Tarda lo que tiene que tardar.
          </p>
        ) : null}
      </div>

      {estado.fase === "rechazada" ? (
        <p
          role="alert"
          className="text-alerta mt-4 text-[0.875rem] leading-relaxed"
        >
          {FALLOS[estado.motivo]}
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
  // De la más reciente a la más antigua: al abrir la bitácora, lo que se busca casi siempre es lo
  // último. El ARCHIVO las guarda en orden de registro —la primera es la más antigua— y esa es la
  // que no se toca; el orden de lectura es cosa de la pantalla.
  const recientesPrimero = [...entradas].reverse();
  const [abierta, setAbierta] = useState<string | null>(null);

  return (
    <Panel
      etiqueta="Tu historial"
      titulo={
        entradas.length === 1
          ? "Un tratamiento anotado"
          : `${numero(entradas.length)} tratamientos anotados`
      }
      nota={
        <>
          De la más reciente a la más antigua. Cada una lleva las dos huellas,
          así que puedes atarla al certificado que entregaste.
        </>
      }
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
                  {entrada.fecha} · {numero(entrada.filas)}{" "}
                  {entrada.filas === 1 ? "fila" : "filas"} ·{" "}
                  {entrada.tecnicas.length === 0
                    ? "sin técnicas"
                    : entrada.tecnicas.map(nombreDeTecnica).join(", ")}
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
          Huella de la bitácora:{" "}
          <code className="font-mono text-[0.75rem]">
            {huella.slice(0, 16)}…
          </code>{" "}
          — del contenido en claro, no del archivo cifrado: ese cambia entero
          cada vez que se guarda, por diseño.
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
          Cerrar la bitácora
        </Boton>
      </div>
      <MarcaDeSello />
    </Panel>
  );
}

/** El detalle de una entrada. Lo usan la anotación pendiente y la lista, para que digan lo mismo. */
function ResumenDeEntrada({ entrada }: { entrada: EntradaDeBitacora }) {
  return (
    <dl className="text-[0.875rem] leading-relaxed">
      <Dato termino="Archivo" valor={entrada.archivo} />
      <Dato termino="Fecha" valor={entrada.fecha} />
      <Dato
        termino="Filas"
        valor={`${numero(entrada.filas)} ${entrada.filas === 1 ? "fila" : "filas"}`}
      />
      <Dato
        termino="Técnicas"
        valor={
          entrada.tecnicas.length === 0
            ? "ninguna"
            : entrada.tecnicas.map(nombreDeTecnica).join(", ")
        }
      />
      {/* Las DOS puntas del riesgo, nunca la reducción entre ellas. Es la decisión del ADR-007 y
          viene de la lección más cara del S2: «bajó del 30 % al 2 %» es cierta y puede engañar, y
          una bitácora se lee meses después, sin la pantalla al lado que la matice. */}
      <Dato
        termino="Registros únicos"
        valor={`${porcentaje(entrada.unicosAntes)} antes · ${porcentaje(entrada.unicosDespues)} después`}
      />
      <Dato
        termino="Política"
        valor={
          <code className="font-mono text-[0.8125rem]">
            {entrada.hashDePolitica.slice(0, 8)}
          </code>
        }
      />
      <Dato
        termino="Huella de entrada"
        valor={
          <code className="font-mono text-[0.75rem]">
            {entrada.huellaDeEntrada.slice(0, 16)}…
          </code>
        }
      />
      <Dato
        termino="Huella de salida"
        valor={
          <code className="font-mono text-[0.75rem]">
            {entrada.huellaDeSalida.slice(0, 16)}…
          </code>
        }
      />
      {!entrada.esTitular ? (
        <div className="text-aviso mt-2 text-[0.8125rem] leading-relaxed">
          Aquel tratamiento llevaba salvedades que descalificaban su cifra de
          reducción. Las dos proporciones de arriba son ciertas por separado;
          restarlas y presentarlo como el efecto del tratamiento, no.
        </div>
      ) : null}
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
