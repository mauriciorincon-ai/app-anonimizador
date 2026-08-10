"use client";

// La zona de carga: el único control de la aduana.
//
// Dos entradas de verdad, no una con adorno: se puede **arrastrar** el archivo y se puede
// **elegirlo con el teclado**. El `<input type="file">` es real y está en el árbol de
// accesibilidad; lo que se ve es su `<label>`, y el anillo de foco viaja del uno al otro con
// `peer-focus-visible`. Un `<div role="button">` que abre un diálogo por JavaScript se vería igual
// y dejaría fuera a quien navega con teclado o lector de pantalla.
//
// Componente presentacional: recibe el estado y avisa del archivo. Quién crea el worker y quién
// navega no es asunto suyo — así los cinco estados se pueden probar sin tocar un Worker.

import Link from "next/link";
import { useState } from "react";

import { clasesDeBoton } from "@/components/boton";
import { bytes as enBytes, numero, porcentaje } from "@/lib/formato";
import type { EstadoDeSesion } from "@/lib/sesion";
import { TOPE_EXCEL_BYTES } from "@/lib/archivo";
import type { EtapaDelWorker, MotivoDeError } from "@/workers/contrato";

const ETAPAS: Record<EtapaDelWorker, string> = {
  huella: "Tomando la huella del archivo",
  leyendo: "Leyendo el archivo",
  clasificando: "Reconociendo qué hay en cada columna",
  "midiendo-riesgo": "Midiendo el riesgo de reidentificación",
};

/** Los errores dicen QUÉ HACER. Decir "error al procesar" es dejar al usuario donde estaba. */
const ERRORES: Record<MotivoDeError, { titulo: string; salida: string }> = {
  "formato-no-soportado": {
    titulo: "Velo no reconoce ese tipo de archivo",
    salida:
      "Lee tablas: CSV (.csv) y Excel (.xlsx, .xls). Si tu archivo viene de una hoja de cálculo, ábrelo y guárdalo como CSV.",
  },
  "archivo-vacio": {
    titulo: "El archivo no tiene filas para revisar",
    salida:
      "Puede que solo tenga el encabezado, o que la primera hoja del libro esté vacía. Revísalo y vuelve a soltarlo.",
  },
  "excel-excede-tope": {
    titulo: "Ese Excel es más grande de lo que Velo puede abrir",
    salida: `El tope para Excel es ${enBytes(TOPE_EXCEL_BYTES)}, porque un .xlsx hay que abrirlo entero en memoria para leerlo. Guárdalo como CSV: el CSV se lee por partes y no tiene tope.`,
  },
  "excel-excede-memoria": {
    titulo: "El navegador se quedó sin memoria abriendo ese Excel",
    salida:
      "Pasa con libros muy anchos o con muchas hojas. Guárdalo como CSV y vuelve a intentarlo: así Velo lo lee por partes en vez de completo.",
  },
  "lectura-fallida": {
    titulo: "No se pudo leer el archivo",
    salida:
      "Puede estar dañado o tener un contenido distinto al que anuncia su extensión. Ábrelo, guárdalo de nuevo como CSV e inténtalo otra vez.",
  },
};

export function ZonaDeCarga({
  estado,
  onArchivo,
  onReintentar,
}: {
  estado: EstadoDeSesion;
  onArchivo: (archivo: File) => void;
  onReintentar: () => void;
}) {
  const [arrastrando, setArrastrando] = useState(false);

  function soltar(evento: React.DragEvent<HTMLDivElement>) {
    evento.preventDefault();
    setArrastrando(false);
    const archivo = evento.dataTransfer.files?.[0];
    if (archivo) onArchivo(archivo);
  }

  if (estado.fase === "analizando" || estado.fase === "listo") {
    return <EnCurso estado={estado} />;
  }

  if (estado.fase === "error") {
    return (
      <Fallo
        motivo={estado.motivo}
        nombre={estado.nombre}
        onReintentar={onReintentar}
      />
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setArrastrando(true);
      }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={soltar}
      data-arrastrando={arrastrando ? "si" : "no"}
      className={`rounded-3 flex flex-col items-center gap-5 border border-dashed px-6 py-12 text-center transition-colors duration-[var(--mov-2)] ease-[var(--curva)] ${
        arrastrando
          ? "border-acento bg-acento-tenue shadow-2"
          : "border-borde-control bg-superficie"
      }`}
    >
      <div>
        <p className="font-display text-tinta text-2xl font-semibold">
          {arrastrando ? "Suéltalo aquí" : "Trae tu tabla"}
        </p>
        <p className="text-tinta-suave mt-1.5 text-[0.9375rem]">
          Arrástrala hasta aquí o elígela desde tu computador.
        </p>
      </div>

      <div>
        <input
          id="archivo"
          type="file"
          accept=".csv,.xlsx,.xls,text/csv"
          className="peer sr-only"
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            if (archivo) onArchivo(archivo);
          }}
        />
        <label
          htmlFor="archivo"
          className={`${clasesDeBoton("principal")} cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--acento)]`}
        >
          Elegir archivo
        </label>
      </div>

      <p className="text-tinta-tenue text-[0.8125rem]">
        CSV o Excel. El CSV no tiene tope de tamaño; el Excel sí, hasta{" "}
        {enBytes(TOPE_EXCEL_BYTES)}.
      </p>
    </div>
  );
}

function EnCurso({
  estado,
}: {
  estado: Extract<EstadoDeSesion, { fase: "analizando" | "listo" }>;
}) {
  const terminado = estado.fase === "listo";
  const nombre = terminado ? estado.informe.archivo.nombre : estado.nombre;
  const etapa = terminado ? "midiendo-riesgo" : estado.etapa;
  // Solo hay barra cuando hay una medida real que enseñar. Un Excel no reporta avance mientras
  // SheetJS abre el libro, y una barra inventada para llenar el hueco sería una mentira pequeña
  // en la única pantalla donde el producto está pidiendo confianza.
  const conBarra =
    !terminado &&
    (estado.etapa === "huella" || estado.etapa === "leyendo") &&
    estado.bytesLeidos > 0;
  const avance = conBarra ? estado.bytesLeidos / estado.bytesTotales : 0;

  return (
    <div className="rounded-3 border-borde bg-superficie shadow-1 flex flex-col gap-4 border px-6 py-10">
      <div>
        <p className="etiqueta">Analizando</p>
        {/* La región viva es SOLO el nombre de la etapa, que cambia tres veces en todo el proceso.
            Si abarcara la tarjeta entera, un lector de pantalla leería el porcentaje en voz alta
            cada 25.000 filas —veinte veces seguidas en un archivo grande— y el aviso útil se
            perdería entre el ruido. El avance numérico ya viaja por el `progressbar`, que se
            consulta cuando se quiere y no se anuncia solo. */}
        <p
          role="status"
          className="font-display text-tinta mt-1.5 text-2xl font-semibold"
        >
          {terminado ? "Listo" : ETAPAS[etapa]}
        </p>
        <p className="text-tinta-suave mt-1 font-mono text-[0.8125rem] break-all">
          {nombre}
        </p>
      </div>

      {conBarra ? (
        <div>
          <div
            role="progressbar"
            aria-label={ETAPAS[etapa]}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(avance * 100)}
            className="bg-papel-hundido h-1.5 w-full overflow-hidden rounded-full"
          >
            <div
              className="bg-acento h-full transition-[width] duration-[var(--mov-2)] ease-[var(--curva)]"
              style={{ width: `${Math.round(avance * 100)}%` }}
            />
          </div>
          <p className="cifra text-tinta-tenue mt-2 text-[0.8125rem]">
            {porcentaje(avance)}
            {/* Durante la huella todavía no se ha leído una sola fila: decir "0 filas leídas"
                sería contar algo que no está pasando. */}
            {etapa === "leyendo"
              ? ` · ${numero(estado.filas)} filas leídas`
              : ""}
          </p>
        </div>
      ) : (
        <p className="cifra text-tinta-tenue text-[0.8125rem]">
          {terminado
            ? `${numero(estado.informe.diagnostico.filas)} filas revisadas`
            : `${numero(estado.filas)} filas leídas`}
        </p>
      )}

      {/* En el camino normal la página navega sola al terminar y esto no se alcanza a ver. Existe
          para cuando el usuario vuelve a la aduana con el botón «atrás» del navegador y su informe
          sigue en memoria: quedarse sin salida ahí sería un callejón. */}
      {terminado ? (
        <Link
          href="/diagnostico"
          className={`${clasesDeBoton("principal")} self-start`}
        >
          Ver el diagnóstico
        </Link>
      ) : null}

      {!terminado && estado.avisoDeTamano ? (
        <p className="rounded-2 border-aviso/30 bg-aviso-tenue text-aviso border px-3 py-2 text-[0.8125rem] leading-relaxed">
          Es un Excel grande ({enBytes(estado.bytes)}). Velo lo está abriendo
          completo en memoria porque un .xlsx no se puede leer por partes. Si se
          demora demasiado o falla, guárdalo como CSV y vuelve a soltarlo.
        </p>
      ) : null}
    </div>
  );
}

function Fallo({
  motivo,
  nombre,
  onReintentar,
}: {
  motivo: MotivoDeError;
  nombre: string;
  onReintentar: () => void;
}) {
  const { titulo, salida } = ERRORES[motivo];
  return (
    <div
      role="alert"
      aria-labelledby="titulo-de-error"
      className="rounded-3 border-alerta/35 bg-alerta-tenue flex flex-col items-start gap-3 border px-6 py-8"
    >
      <p className="etiqueta text-alerta">No se pudo abrir</p>
      <h2
        id="titulo-de-error"
        className="font-display text-tinta text-2xl font-semibold"
      >
        {titulo}
      </h2>
      <p className="text-tinta-suave font-mono text-[0.8125rem] break-all">
        {nombre}
      </p>
      <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
        {salida}
      </p>
      <button
        type="button"
        onClick={onReintentar}
        className={`${clasesDeBoton("discreto")} mt-1`}
      >
        Elegir otro archivo
      </button>
    </div>
  );
}
