"use client";

// P3 — el taller: aquí Velo deja de mirar y transforma.
//
// La página es una secuencia, no un formulario: política → llave (si hace falta) → transformar →
// vista previa → balance → descarga. Cada paso aparece cuando el anterior tiene sentido, y ninguno
// se adelanta — enseñar una vista previa vacía o un balance de una política que ya cambió sería
// enseñar una cifra cierta de otro archivo.
//
// La tabla nunca llega hasta aquí. Todo lo que se ve son agregados, muestras enmascaradas y, al
// final, un asa opaca al archivo (ADR-005). Este componente no podría leer los datos aunque
// quisiera, y esa es la forma fuerte de la promesa.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { BalanceEnPantalla } from "@/components/balance-en-pantalla";
import { clasesDeBoton, Boton } from "@/components/boton";
import { DescargaDelArchivo } from "@/components/descarga-del-archivo";
import { EditorDePolitica } from "@/components/editor-de-politica";
import { LlaveDelProyecto } from "@/components/llave-del-proyecto";
import { MarcaDeSello } from "@/components/sello";
import { VistaPrevia } from "@/components/vista-previa";
import { VERSION_DE_POLITICA, type Politica } from "@/engine/politica";
import { requiereLlave } from "@/engine/tecnicas";
import { numero } from "@/lib/formato";
import {
  derivarLlaveDelProyecto,
  invalidarTransformacion,
  prepararArchivo,
  transformar,
  useSesion,
  useTaller,
} from "@/lib/sesion";
import type { MotivoDeError } from "@/workers/contrato";

const POLITICA_VACIA: Politica = {
  version: VERSION_DE_POLITICA,
  origen: "manual",
  reglas: [],
  kObjetivo: null,
};

/** Los fallos de la transformación dicen QUÉ HACER, igual que los de la aduana. */
const FALLOS: Partial<Record<MotivoDeError, string>> = {
  "sin-tabla":
    "El archivo ya no está en memoria. Vuelve a la aduana y suéltalo otra vez.",
  "sin-llave":
    "La política pide seudónimos y todavía no hay llave. Deriva la llave y vuelve a intentarlo.",
  "transformacion-fallida":
    "Algo falló al aplicar la política. Revisa que las técnicas encajen con el tipo de cada columna — una fecha no se puede agrupar de 10 en 10.",
};

export default function PaginaDeTransformacion() {
  const estado = useSesion();
  const taller = useTaller();
  const router = useRouter();
  const [politica, setPolitica] = useState<Politica>(POLITICA_VACIA);

  if (estado.fase !== "listo") return <SinDatos />;

  const { informe } = estado;
  const pideLlave = requiereLlave(politica);
  const llaveLista = taller.llave.fase === "lista";
  const puedeTransformar =
    politica.reglas.length > 0 &&
    (!pideLlave || llaveLista) &&
    taller.transformacion.fase !== "transformando";

  function cambiarPolitica(siguiente: Politica): void {
    setPolitica(siguiente);
    // Un balance de la política de hace tres clics tiene todas sus cifras bien calculadas y habla
    // de otro archivo. Se descarta en cuanto se toca algo.
    invalidarTransformacion();
  }

  const hecha =
    taller.transformacion.fase === "hecha"
      ? taller.transformacion.resultado
      : null;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <p className="etiqueta">El taller</p>
      <h1 className="font-display text-tinta mt-1.5 text-[clamp(1.75rem,5vw,2.25rem)] leading-tight font-semibold text-balance">
        Ahora sí, transformar
      </h1>
      <p className="text-tinta-suave mt-3 leading-relaxed text-pretty">
        {numero(informe.diagnostico.filas)} filas y{" "}
        {numero(informe.diagnostico.columnas.length)} columnas de{" "}
        <span className="font-mono text-[0.9375rem]">
          {informe.archivo.nombre}
        </span>
        . Todo lo que sigue ocurre en esta pestaña, igual que el diagnóstico.
      </p>

      <div className="mt-8 space-y-6">
        <EditorDePolitica
          columnas={informe.diagnostico.columnas}
          politica={politica}
          onCambio={cambiarPolitica}
        />

        {pideLlave ? (
          <LlaveDelProyecto
            llave={taller.llave}
            onDerivar={derivarLlaveDelProyecto}
          />
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Boton
            type="button"
            disabled={!puedeTransformar}
            onClick={() => transformar(politica)}
          >
            {taller.transformacion.fase === "transformando"
              ? "Transformando…"
              : "Transformar"}
          </Boton>
          {politica.reglas.length === 0 ? (
            <p className="text-tinta-tenue text-[0.875rem]">
              Elige qué hacer con al menos una columna, o aplica una política de
              fábrica.
            </p>
          ) : pideLlave && !llaveLista ? (
            <p className="text-tinta-tenue text-[0.875rem]">
              La política pide seudónimos: hace falta la llave.
            </p>
          ) : null}
          {taller.transformacion.fase === "transformando" ? (
            <p role="status" className="text-tinta-suave text-[0.875rem]">
              {taller.etapa === "midiendo-el-despues"
                ? "Midiendo el riesgo del archivo que sale…"
                : "Aplicando la política en el hilo donde viven los datos…"}
            </p>
          ) : null}
        </div>

        {taller.transformacion.fase === "fallo" ? (
          <div
            role="alert"
            className="rounded-3 border-alerta/35 bg-alerta-tenue border px-5 py-4"
          >
            <p className="etiqueta text-alerta">No se pudo transformar</p>
            <p className="text-tinta mt-2 text-[0.9375rem] leading-relaxed">
              {FALLOS[taller.transformacion.motivo] ??
                "Vuelve a la aduana y suelta el archivo otra vez."}
            </p>
          </div>
        ) : null}

        {hecha ? (
          <>
            <VistaPrevia
              muestras={hecha.muestras}
              filas={informe.diagnostico.filas}
            />
            <BalanceEnPantalla balance={hecha.balance} />
            <DescargaDelArchivo
              archivo={taller.archivo}
              preparando={taller.etapa === "escribiendo"}
              filas={informe.diagnostico.filas}
              suprimidas={hecha.suprimidas}
              onPreparar={prepararArchivo}
            />
          </>
        ) : null}
      </div>

      <div className="border-borde mt-10 border-t pt-6">
        <button
          type="button"
          className={clasesDeBoton("discreto")}
          onClick={() => router.push("/diagnostico")}
        >
          Volver al diagnóstico
        </button>
      </div>
    </main>
  );
}

function SinDatos() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start px-6 py-20">
      <MarcaDeSello clase="text-tinta-tenue size-8" />
      <h1 className="font-display text-tinta mt-5 text-[clamp(1.75rem,5vw,2.25rem)] leading-tight font-semibold text-balance">
        No hay nada que transformar
      </h1>
      <p className="text-tinta-suave mt-4 leading-relaxed text-pretty">
        El taller trabaja sobre el archivo que tengas cargado en esta pestaña, y
        ahora mismo no hay ninguno. No se perdió: nunca se guardó en ningún
        sitio, que es la misma razón por la que tus datos no se filtran.
      </p>
      <Link href="/" className={`${clasesDeBoton("principal")} mt-8`}>
        Volver a la aduana
      </Link>
    </main>
  );
}
