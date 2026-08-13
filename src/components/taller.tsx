"use client";

// El taller, cargado bajo demanda — todo lo que solo tiene sentido con un archivo delante.
//
// Vive fuera de `page.tsx` por una razón medida, no por orden: `/transformar` **sin archivo** es un
// callejón sin salida que dice «no hay nada que transformar», y cargar ahí el editor de política
// con las dos políticas de fábrica, la llave, la vista previa y el balance son ~140 KB de JavaScript
// que nadie va a ejecutar. El gate de Lighthouse del cierre del S2 lo cobró con el único estado que
// puede medir —el vacío—: LCP simulado de 3,6 s y la categoría en 0,88, por debajo del 0,90.
//
// El costo en el camino real es despreciable y conviene decirlo: a esta pantalla se llega **después
// de parsear el archivo**, que tarda segundos. Un trozo más de JavaScript pedido al mismo origen,
// justo después de esa espera, no se nota.

import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useState } from "react";

import { BalanceEnPantalla } from "@/components/balance-en-pantalla";
import { BovedaDelTratamiento } from "@/components/boveda-del-tratamiento";
import { clasesDeBoton, Boton } from "@/components/boton";
import { DescargaDelArchivo } from "@/components/descarga-del-archivo";
import { EditorDePolitica } from "@/components/editor-de-politica";
import { LlaveDelProyecto } from "@/components/llave-del-proyecto";
import { VistaPrevia } from "@/components/vista-previa";
import {
  esReversible,
  requiereLlave,
  VERSION_DE_POLITICA,
  type Politica,
} from "@/engine/politica";
import { numero } from "@/lib/formato";
import {
  derivarLlaveDelProyecto,
  invalidarTransformacion,
  prepararArchivo,
  sellarLaBoveda,
  transformar,
  useTaller,
} from "@/lib/sesion";
import type { Informe, MotivoDeError } from "@/workers/contrato";

/**
 * El reporte se carga cuando hace falta, no al abrir el taller.
 *
 * `DescargaDelReporte` arrastra `@/engine/reporte` entero —la plantilla del documento, con su CSS y
 * su texto— y aquí solo aparece **después** de transformar. Mismo patrón que SheetJS en el worker:
 * lo que solo se usa en una rama, se carga en esa rama.
 */
const DescargaDelReporte = dynamic(
  () =>
    import("@/components/descarga-del-reporte").then(
      (m) => m.DescargaDelReporte,
    ),
  { ssr: false },
);

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

export function Taller({ informe }: { informe: Informe }) {
  const taller = useTaller();
  const router = useRouter();
  const [politica, setPolitica] = useState<Politica>(POLITICA_VACIA);
  const columnasReversibles = politica.reglas
    .filter((regla) => esReversible(regla.tecnica))
    .map((regla) => regla.columna);

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
              hashDePolitica={hecha.hashDePolitica}
              onPreparar={prepararArchivo}
            />
            {/* El archivo no puede salir solo. Un CSV anonimizado sin un documento que diga qué se
                le hizo obliga a quien lo recibe a creer; y el reporte del diagnóstico, que describe
                el archivo ORIGINAL, mandado junto al tratado es la mentira por composición de este
                sprint a nivel de artefacto. Hallazgo A2 de la auditoría. */}
            <DescargaDelReporte
              informe={informe}
              tratamiento={{
                balance: hecha.balance,
                utilidad: hecha.utilidad,
                hashDePolitica: hecha.hashDePolitica,
                suprimidas: hecha.suprimidas,
              }}
            />
            {/* Solo si la política pidió columnas reversibles. Ofrecer una bóveda cuando no hay
                correspondencia que guardar prometería una vuelta que no existe. */}
            {columnasReversibles.length > 0 ? (
              <BovedaDelTratamiento
                boveda={taller.boveda}
                archivo={taller.archivoDeBoveda}
                columnas={columnasReversibles}
                onSellar={sellarLaBoveda}
              />
            ) : null}
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
