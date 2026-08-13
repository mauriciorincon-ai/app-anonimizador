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

import { useRef, useState } from "react";
import Link from "next/link";

import { Boton, clasesDeBoton } from "@/components/boton";
import { Panel } from "@/components/panel";
import { MarcaDeSello } from "@/components/sello";
import { numero, porcentaje } from "@/lib/formato";
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
import type {
  MotivoDeBoveda,
  MotivoDeError,
  ResumenDelRegreso,
} from "@/workers/contrato";

const MINIMO = 12;

/** Cada fallo con su frase. «Archivo inválido» no le dice a nadie qué hacer. */
const FALLOS_DE_BOVEDA: Record<MotivoDeBoveda, string> = {
  "no-es-una-boveda":
    "Ese archivo no es una bóveda de Velo. Busca el que termina en .velo.",
  "version-distinta":
    "Esa bóveda la hizo otra versión de Velo y esta no sabe leerla.",
  "frase-incorrecta":
    "La frase no abre esta bóveda. También sale este mensaje si el archivo se dañó o lo modificaron.",
  "costo-inaceptable":
    "La bóveda declara un costo de descifrado fuera de lo razonable: está dañada o la modificaron.",
  "contenido-invalido":
    "La bóveda se abrió, pero su contenido no tiene la forma que Velo espera.",
  "lectura-fallida": "No se pudo leer el archivo.",
};

/**
 * Cada fallo del archivo devuelto con su frase, por el mismo motivo que los de la bóveda.
 *
 * Hasta la auditoría de este sprint el estado guardaba el motivo y la pantalla pintaba siempre
 * «comprueba que sea un CSV» — cierto para uno de los casos y desorientador para el resto: a quien
 * suelta un archivo vacío se le decía que revisara el formato, que es lo único que NO tenía mal.
 *
 * El caso de Excel se dice aquí y no se soporta a medias: `.xlsx` es un zip y PapaParse lo lee como
 * texto binario, así que el fallo llega como archivo ilegible o vacío según el caso. Guiar a CSV es
 * la respuesta honesta —la misma que el S1 dio para la entrada— y no cuesta código nuevo.
 */
const FALLOS_DEL_DEVUELTO: Partial<Record<MotivoDeError, string>> = {
  "archivo-vacio":
    "Ese archivo no tiene filas que restaurar. Comprueba que sea el que te devolvieron y que no esté vacío.",
  "formato-no-soportado":
    "Velo no sabe leer ese formato aquí. El archivo devuelto tiene que ser CSV: si te lo devolvieron en Excel, ábrelo y guárdalo como CSV.",
  "lectura-fallida":
    "No se pudo leer ese archivo. Tiene que ser un CSV: si te lo devolvieron en Excel, ábrelo y guárdalo como CSV.",
};

const FALLO_DEL_DEVUELTO_POR_DEFECTO =
  "No se pudo usar ese archivo. Tiene que ser el CSV que te devolvió el tercero.";

export function Regreso() {
  const estado = useRegreso();

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
          Empezar de nuevo
        </button>
        <p className="text-tinta-tenue mt-3 max-w-prose text-[0.8125rem] leading-relaxed">
          Al salir de aquí no queda nada. La bóveda y el archivo viven en la
          memoria de esta pestaña y mueren con ella: no hay copia en este
          navegador, ni en un servidor.
        </p>
      </div>
    </>
  );
}

function PanelDeBoveda({ estado }: { estado: EstadoDelRegreso }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [frase, setFrase] = useState("");
  const { boveda } = estado;

  if (boveda.fase === "abierta") {
    const { resumen } = boveda;
    return (
      <Panel
        etiqueta="Paso 1 · la bóveda"
        titulo="Bóveda abierta"
        nota={
          <>
            La huella es el SHA-256 de su contenido. Sirve para reconocer que es
            la bóveda de aquel tratamiento y no otra.
          </>
        }
      >
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="etiqueta">Huella de la bóveda</dt>
            <dd className="text-tinta mt-1 font-mono text-[0.8125rem] break-all">
              {resumen.huella}
            </dd>
          </div>
          <div>
            <dt className="etiqueta">Llave del proyecto</dt>
            <dd className="text-tinta mt-1 font-mono text-[0.9375rem]">
              {resumen.huellaDeLlave}
            </dd>
          </div>
          <div>
            <dt className="etiqueta">Correspondencias</dt>
            <dd className="text-tinta mt-1 text-[0.9375rem]">
              {numero(resumen.pares)}
            </dd>
          </div>
          <div>
            <dt className="etiqueta">Columnas que puede devolver</dt>
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
      etiqueta="Paso 1 · la bóveda"
      titulo="El archivo que guardaste al anonimizar"
      nota={
        <>
          Termina en <code className="font-mono">.velo</code>. Va cifrado: sin
          su frase de paso no se abre, ni aquí ni en ninguna parte.
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <Boton
          type="button"
          variante="discreto"
          onClick={() => entrada.current?.click()}
        >
          Elegir la bóveda
        </Boton>
        <input
          ref={entrada}
          type="file"
          accept=".velo,application/octet-stream"
          className="sr-only"
          aria-label="Elegir el archivo de bóveda"
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
            Ningún archivo elegido todavía.
          </p>
        )}
      </div>

      <div className="mt-5">
        <label
          htmlFor="frase-de-la-boveda"
          className="text-tinta text-[0.9375rem]"
        >
          Frase de paso de la bóveda
        </label>
        <input
          id="frase-de-la-boveda"
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
          {abriendo ? "Abriendo…" : "Abrir la bóveda"}
        </Boton>
        {abriendo ? (
          <p role="status" className="text-tinta-suave text-[0.875rem]">
            Derivando la llave de cifrado y comprobando el archivo.
          </p>
        ) : null}
      </div>

      {boveda.fase === "rechazada" ? (
        <p
          role="alert"
          className="text-alerta mt-4 text-[0.875rem] leading-relaxed"
        >
          {FALLOS_DE_BOVEDA[boveda.motivo]}
        </p>
      ) : null}
    </Panel>
  );
}

function PanelDelDevuelto({ estado }: { estado: EstadoDelRegreso }) {
  const entrada = useRef<HTMLInputElement>(null);
  const { devuelto } = estado;

  return (
    <Panel
      etiqueta="Paso 2 · el archivo devuelto"
      titulo="Lo que te devolvió el tercero"
      nota={
        <>
          CSV. Puede traer las filas en otro orden, columnas nuevas, columnas
          borradas y valores corregidos: nada de eso estorba, porque la
          restauración es <strong>por valor</strong> y no por posición.
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <Boton
          type="button"
          variante="discreto"
          onClick={() => entrada.current?.click()}
        >
          Elegir el archivo devuelto
        </Boton>
        <input
          ref={entrada}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          aria-label="Elegir el archivo que devolvió el tercero"
          onChange={(evento) => {
            const elegido = evento.target.files?.[0];
            if (elegido) cargarDevuelto(elegido);
            evento.target.value = "";
          }}
        />
        {devuelto.fase === "analizando" ? (
          <p role="status" className="text-tinta-suave text-[0.875rem]">
            Leyendo <code className="font-mono">{devuelto.nombre}</code>…
          </p>
        ) : null}
        {devuelto.fase === "sin-archivo" ? (
          <p className="text-tinta-tenue text-[0.875rem]">
            Ningún archivo elegido todavía.
          </p>
        ) : null}
      </div>

      {devuelto.fase === "listo" ? (
        <p className="text-tinta mt-4 text-[0.9375rem] leading-relaxed">
          <code className="font-mono text-[0.8125rem]">{devuelto.nombre}</code>{" "}
          · {numero(devuelto.filas)} filas · {numero(devuelto.columnas)}{" "}
          columnas.
        </p>
      ) : null}

      {devuelto.fase === "error" ? (
        <p
          role="alert"
          className="text-alerta mt-4 text-[0.875rem] leading-relaxed"
        >
          {FALLOS_DEL_DEVUELTO[devuelto.motivo] ??
            FALLO_DEL_DEVUELTO_POR_DEFECTO}
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
  if (estado.boveda.fase !== "abierta") return null;
  const { colisiones } = estado.boveda.resumen;
  const restaurando = estado.restauracion.fase === "restaurando";

  return (
    <Panel
      etiqueta="Paso 3 · antes de restaurar"
      titulo={
        colisiones > 0
          ? "Hay valores que no van a poder volver"
          : "Todo listo para restaurar"
      }
    >
      {colisiones > 0 ? (
        <div className="text-tinta space-y-2 text-[0.9375rem] leading-relaxed">
          <p>
            <strong className="font-medium">
              {numero(colisiones)}{" "}
              {colisiones === 1
                ? "seudónimo de esta bóveda corresponde"
                : "seudónimos de esta bóveda corresponden"}{" "}
              a más de un valor original.
            </strong>{" "}
            Conservar el formato reduce el espacio disponible y dos valores
            distintos chocaron en el mismo seudónimo.
          </p>
          <p className="text-tinta-suave">
            Las celdas que los usen van a salir <strong>sin resolver</strong>,
            con el seudónimo intacto. Velo no elige por ti: escribir uno de los
            dos candidatos devolvería el dato de otra persona sin que nada lo
            indicara.
          </p>
        </div>
      ) : (
        <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
          Ningún seudónimo de esta bóveda corresponde a dos valores, así que no
          hay celdas ambiguas que resolver. Lo que no vuelva será porque el
          tercero lo cambió.
        </p>
      )}

      <div className="mt-5">
        <Boton type="button" disabled={restaurando} onClick={restaurarAhora}>
          {restaurando ? "Restaurando…" : "Restaurar los valores originales"}
        </Boton>
      </div>

      {estado.restauracion.fase === "fallo" ? (
        <p role="alert" className="text-alerta mt-4 text-[0.875rem]">
          La restauración falló. Comprueba que el archivo devuelto sea el que
          corresponde a esta bóveda.
        </p>
      ) : null}
    </Panel>
  );
}

const RECONOCIMIENTO: Record<ResumenDelRegreso["reconocimiento"], string> = {
  completo: "Todas las columnas de la bóveda aparecieron",
  parcial: "Algunas columnas de la bóveda no aparecieron",
  ninguno: "Esta bóveda no corresponde a este archivo",
};

/**
 * El informe en pantalla. **Las salvedades van arriba de la cifra**, igual que en el documento
 * exportado: el orden es la decisión, no el adorno.
 */
function InformeEnPantalla({ resumen }: { resumen: ResumenDelRegreso }) {
  const conContenido =
    resumen.totales.restauradas +
    resumen.totales.ambiguas +
    resumen.totales.desconocidas;

  return (
    <Panel
      etiqueta="Paso 4 · el resultado"
      titulo={RECONOCIMIENTO[resumen.reconocimiento]}
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
              {textoDeSalvedad(salvedad)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
          Todas las celdas que la bóveda cubría volvieron a su valor original.
        </p>
      )}

      {resumen.proporcionRestaurada === null ? (
        <p className="text-tinta mt-5 text-[0.9375rem] leading-relaxed">
          No hubo ninguna celda que restaurar.
        </p>
      ) : resumen.esTitular ? (
        <p className="text-tinta mt-5 text-[1.5rem] leading-tight font-semibold">
          {porcentaje(resumen.proporcionRestaurada)}
          <span className="text-tinta-suave block text-[0.9375rem] font-normal">
            de las celdas con contenido volvieron a su valor original:{" "}
            {numero(resumen.totales.restauradas)} de {numero(conContenido)}.
          </span>
        </p>
      ) : (
        <p className="text-tinta mt-5 text-[0.9375rem] leading-relaxed">
          Volvieron {numero(resumen.totales.restauradas)} de{" "}
          {numero(conContenido)} celdas con contenido —{" "}
          {porcentaje(resumen.proporcionRestaurada)}—.{" "}
          <strong className="text-alerta font-medium">
            Esa cifra no describe un archivo recuperado del todo
          </strong>{" "}
          mientras siga en pie lo de arriba.
        </p>
      )}

      <dl className="border-borde mt-5 grid gap-4 border-t pt-4 sm:grid-cols-3">
        <div>
          <dt className="etiqueta">Restauradas</dt>
          <dd className="text-tinta mt-1 text-[0.9375rem]">
            {numero(resumen.totales.restauradas)}
          </dd>
        </div>
        <div>
          <dt className="etiqueta">Ambiguas</dt>
          <dd
            className={`mt-1 text-[0.9375rem] ${
              resumen.totales.ambiguas > 0 ? "text-alerta" : "text-tinta"
            }`}
          >
            {numero(resumen.totales.ambiguas)}
          </dd>
        </div>
        <div>
          <dt className="etiqueta">Las cambió el tercero</dt>
          <dd className="text-tinta mt-1 text-[0.9375rem]">
            {numero(resumen.totales.desconocidas)}
          </dd>
        </div>
      </dl>
    </Panel>
  );
}

function textoDeSalvedad(
  salvedad: ResumenDelRegreso["salvedades"][number],
): string {
  switch (salvedad.tipo) {
    case "celdas-ambiguas":
      return `${numero(salvedad.cuantas)} ${
        salvedad.cuantas === 1 ? "celda volvió" : "celdas volvieron"
      } sin resolver: su seudónimo corresponde a más de un valor original y Velo conservó el seudónimo en vez de elegir.`;
    case "boveda-no-corresponde":
      return "Ninguna columna de la bóveda apareció en este archivo. O la bóveda es de otro tratamiento, o este no es el archivo que salió de Velo.";
    case "columnas-sin-aparecer":
      return `La bóveda guarda ${
        salvedad.columnas.length === 1
          ? "una columna que no apareció"
          : "columnas que no aparecieron"
      } en el archivo devuelto: ${salvedad.columnas.join(" · ")}. El porcentaje no ${
        salvedad.columnas.length === 1 ? "la cuenta" : "las cuenta"
      }.`;
    case "columna-a-medias":
      return `${salvedad.columna} tiene valores de la bóveda, pero solo el ${porcentaje(
        salvedad.proporcion,
      )} de los suyos: por debajo del mínimo para restaurarla, así que salió intacta.`;
    case "celdas-desconocidas":
      return `${numero(salvedad.cuantas)} ${
        salvedad.cuantas === 1 ? "celda no estaba" : "celdas no estaban"
      } en la bóveda: el tercero ${
        salvedad.cuantas === 1
          ? "la escribió o la cambió"
          : "las escribió o las cambió"
      }. Salieron tal cual.`;
  }
}

function PanelDeDescargas({ estado }: { estado: EstadoDelRegreso }) {
  const preparando = estado.etapa === "escribiendo";

  return (
    <Panel
      etiqueta="Paso 5 · llévatelo"
      titulo="El archivo restaurado y su informe"
      nota={
        <>
          El informe no lleva ninguna celda: solo nombres de columna, cifras y
          huellas. El archivo restaurado sí lleva tus datos — trátalo como el
          original, porque lo es.
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        {estado.archivo ? (
          <a
            href={estado.archivo.url}
            download={estado.archivo.nombre}
            className={clasesDeBoton("principal")}
          >
            Guardar el archivo restaurado
          </a>
        ) : (
          <Boton
            type="button"
            disabled={preparando}
            onClick={prepararRestaurado}
          >
            {preparando ? "Preparando…" : "Preparar el archivo restaurado"}
          </Boton>
        )}

        {estado.informe ? (
          <a
            href={estado.informe.url}
            download={estado.informe.nombre}
            className={clasesDeBoton("discreto")}
          >
            Guardar el informe
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
                new Intl.DateTimeFormat("es-CO", { dateStyle: "long" }).format(
                  new Date(),
                ),
              )
            }
          >
            Preparar el informe
          </Boton>
        )}
      </div>

      <p className="text-tinta-suave mt-4 text-[0.875rem] leading-relaxed">
        <MarcaDeSello clase="text-tinta-tenue mr-1.5 inline size-4 align-[-2px]" />
        Los dos se arman dentro de esta pestaña. No hubo servidor, ni carga, ni
        copia.
      </p>

      <div className="border-borde mt-5 border-t pt-4">
        <Link href="/" className={clasesDeBoton("discreto")}>
          Volver a la aduana
        </Link>
      </div>
    </Panel>
  );
}
