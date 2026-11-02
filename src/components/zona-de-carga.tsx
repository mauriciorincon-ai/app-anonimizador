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
import { IconoLupa, IconoReiniciar, IconoTabla } from "@/components/iconos";
import { Rico, useT } from "@/components/texto";
import { bytes as enBytes, porcentaje } from "@/lib/formato";
import { plural, type Texto } from "@/lib/idioma";
import { INICIO } from "@/lib/idioma/textos/inicio";
import type { EstadoDeSesion } from "@/lib/sesion";
import {
  esDeMetadatos,
  TOPE_EXCEL_BYTES,
  TOPE_IMAGEN_BYTES,
  TOPE_PDF_BYTES,
} from "@/lib/archivo";
import { TOPES_JSON } from "@/engine/json/tipos";
import type { EtapaDelWorker, MotivoDeError } from "@/workers/contrato";

// Solo las etapas del ANÁLISIS. Las de la transformación viven en `/transformar`, que es donde se
// ven: un `Record` completo obligaría a esta pantalla a tener texto para trabajos que nunca hace.
const ETAPAS: Partial<Record<EtapaDelWorker, Texto>> = {
  huella: INICIO.carga.etapas.huella,
  leyendo: INICIO.carga.etapas.leyendo,
  clasificando: INICIO.carga.etapas.clasificando,
  "midiendo-riesgo": INICIO.carga.etapas.midiendoRiesgo,
  "leyendo-metadatos": INICIO.carga.etapas.leyendoMetadatos,
};

/** Los errores dicen QUÉ HACER. Decir "error al procesar" es dejar al usuario donde estaba. */
const ERRORES: Partial<
  Record<MotivoDeError, { titulo: Texto; salida: Texto }>
> = {
  "formato-no-soportado": INICIO.carga.errores.formatoNoSoportado,
  "archivo-vacio": INICIO.carga.errores.archivoVacio,
  "excel-excede-tope": INICIO.carga.errores.excelExcedeTope,
  "excel-excede-memoria": INICIO.carga.errores.excelExcedeMemoria,
  "lectura-fallida": INICIO.carga.errores.lecturaFallida,
  // JSON (S6): seis motivos del lector y el de «el contenido no es lo que dice el nombre».
  "json-invalido": INICIO.carga.errores.jsonInvalido,
  "json-no-es-registros": INICIO.carga.errores.jsonNoEsRegistros,
  "json-demasiado-profundo": INICIO.carga.errores.jsonDemasiadoProfundo,
  "json-demasiado-ancho": INICIO.carga.errores.jsonDemasiadoAncho,
  "json-claves-duplicadas": INICIO.carga.errores.jsonClavesDuplicadas,
  "json-excede-tope": INICIO.carga.errores.jsonExcedeTope,
  "formato-no-coincide": INICIO.carga.errores.formatoNoCoincide,
  // PDF e imágenes (S6): el cifrado, lo ilegible y los topes por bytes. `limpieza-incompleta` nace
  // limpiando, en `/transformar`, y allá tiene su pantalla; aquí solo llegaría con la sesión ya
  // devuelta a la aduana, y tiene que decir lo mismo en vez de un «se perdió el archivo».
  "limpieza-incompleta": INICIO.carga.errores.limpiezaIncompleta,
  "pdf-cifrado": INICIO.carga.errores.pdfCifrado,
  "pdf-ilegible": INICIO.carga.errores.pdfIlegible,
  "imagen-ilegible": INICIO.carga.errores.imagenIlegible,
  "imagen-no-soportada": INICIO.carga.errores.imagenNoSoportada,
  "pdf-excede-tope": INICIO.carga.errores.pdfExcedeTope,
  "imagen-excede-tope": INICIO.carga.errores.imagenExcedeTope,
};

/** Los topes, citados de la fuente: el mismo número del worker, no una copia que envejezca. */
function topes(idioma: Parameters<typeof enBytes>[1]) {
  return {
    tope: enBytes(TOPE_EXCEL_BYTES, idioma),
    topePdf: enBytes(TOPE_PDF_BYTES, idioma),
    topeImagen: enBytes(TOPE_IMAGEN_BYTES, idioma),
  };
}

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
  const { t, idioma } = useT();

  function soltar(evento: React.DragEvent<HTMLDivElement>) {
    evento.preventDefault();
    setArrastrando(false);
    const archivo = evento.dataTransfer.files?.[0];
    if (archivo) onArchivo(archivo);
  }

  if (
    estado.fase === "analizando" ||
    estado.fase === "listo" ||
    estado.fase === "metadatos"
  ) {
    return <EnCurso estado={estado} />;
  }

  if (estado.fase === "error") {
    return (
      <Fallo
        motivo={estado.motivo}
        nombre={estado.nombre}
        linea={estado.linea}
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
          {t(
            arrastrando ? INICIO.carga.sueltaloAqui : INICIO.carga.traeTuTabla,
          )}
        </p>
        <p className="text-tinta-suave mt-1.5 text-[0.9375rem]">
          {t(INICIO.carga.instruccion)}
        </p>
      </div>

      <div>
        <input
          id="archivo"
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,.json,.jsonl,.ndjson,application/json,.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
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
          <IconoTabla />
          {t(INICIO.carga.elegirArchivo)}
        </label>
      </div>

      <p className="text-tinta-tenue text-[0.8125rem]">
        {t(INICIO.carga.formatos, topes(idioma))}
      </p>
    </div>
  );
}

function EnCurso({
  estado,
}: {
  estado: Extract<
    EstadoDeSesion,
    { fase: "analizando" | "listo" | "metadatos" }
  >;
}) {
  const { t, idioma } = useT();
  const terminado = estado.fase !== "analizando";
  // Un PDF o una imagen (S6) no tienen filas: ni se cuentan al leer ni se resumen al terminar.
  // Decir «0 filas leídas» sería contar algo que no está pasando.
  const sinFilas =
    estado.fase === "metadatos" ||
    (estado.fase === "analizando" && esDeMetadatos(estado.formato));
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
  const textoDeEtapa = ETAPAS[etapa];

  return (
    <div className="rounded-3 border-borde bg-superficie shadow-1 flex flex-col gap-4 border px-6 py-10">
      <div>
        <p className="etiqueta">{t(INICIO.carga.analizando)}</p>
        {/* La región viva es SOLO el nombre de la etapa, que cambia tres veces en todo el proceso.
            Si abarcara la tarjeta entera, un lector de pantalla leería el porcentaje en voz alta
            cada 25.000 filas —veinte veces seguidas en un archivo grande— y el aviso útil se
            perdería entre el ruido. El avance numérico ya viaja por el `progressbar`, que se
            consulta cuando se quiere y no se anuncia solo. */}
        <p
          role="status"
          className="font-display text-tinta mt-1.5 text-2xl font-semibold"
        >
          {terminado
            ? t(INICIO.carga.listo)
            : textoDeEtapa
              ? t(textoDeEtapa)
              : undefined}
        </p>
        <p className="text-tinta-suave mt-1 font-mono text-[0.8125rem] break-all">
          {nombre}
        </p>
      </div>

      {conBarra ? (
        <div>
          <div
            role="progressbar"
            aria-label={textoDeEtapa ? t(textoDeEtapa) : undefined}
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
            {porcentaje(avance, idioma)}
            {/* Durante la huella todavía no se ha leído una sola fila: decir "0 filas leídas"
                sería contar algo que no está pasando. */}
            {etapa === "leyendo"
              ? ` · ${t(INICIO.carga.filasLeidas, { n: estado.filas })}`
              : ""}
          </p>
        </div>
      ) : (
        <p className="cifra text-tinta-tenue text-[0.8125rem]">
          {estado.fase === "metadatos"
            ? t(
                plural(
                  estado.informe.metadatos.campos.length,
                  INICIO.carga.camposEncontradosUno,
                  INICIO.carga.camposEncontrados,
                ),
                { n: estado.informe.metadatos.campos.length },
              )
            : sinFilas
              ? t(INICIO.carga.leyendoBinario)
              : estado.fase === "listo"
                ? t(INICIO.carga.filasRevisadas, {
                    n: estado.informe.diagnostico.filas,
                  })
                : t(INICIO.carga.filasLeidas, { n: estado.filas })}
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
          <IconoLupa />
          {t(INICIO.carga.verDiagnostico)}
        </Link>
      ) : null}

      {!terminado && estado.avisoDeTamano ? (
        <p className="rounded-2 border-aviso/30 bg-aviso-tenue text-aviso border px-3 py-2 text-[0.8125rem] leading-relaxed">
          {t(INICIO.carga.avisoDeTamano, {
            peso: enBytes(estado.bytes, idioma),
          })}
        </p>
      ) : null}
    </div>
  );
}

function Fallo({
  motivo,
  nombre,
  linea,
  onReintentar,
}: {
  motivo: MotivoDeError;
  nombre: string;
  /** Solo la dan los motivos del lector de JSON, y es un número: jamás el contenido de la línea. */
  linea?: number;
  onReintentar: () => void;
}) {
  const { t, idioma } = useT();
  // Los tres motivos de la transformación (`sin-tabla`, `sin-llave`, `transformacion-fallida`) no
  // pueden nacer en la aduana: se producen en `/transformar` y allá tienen su propio texto. Si uno
  // llegara aquí sería por una navegación rara, y la salida honesta es la misma de siempre —
  // volver a soltar el archivo—, no un «error inesperado» que deja al usuario donde estaba.
  const { titulo, salida } = ERRORES[motivo] ?? INICIO.carga.errores.perdido;
  // Los topes del lector de JSON son los mismos en el worker y aquí: el mensaje los cita de la
  // fuente, no los copia, para que un cambio de tope no deje una cifra vieja en pantalla.
  const datos = {
    ...topes(idioma),
    profundidad: TOPES_JSON.profundidad,
    rutas: TOPES_JSON.rutas,
    celdas: TOPES_JSON.celdas,
    largoClave: TOPES_JSON.largoDeClave,
    largoTexto: TOPES_JSON.largoDeTexto,
  };
  return (
    <div
      role="alert"
      aria-labelledby="titulo-de-error"
      className="rounded-3 border-alerta/35 bg-alerta-tenue flex flex-col items-start gap-3 border px-6 py-8"
    >
      <p className="etiqueta text-alerta">{t(INICIO.carga.noSePudoAbrir)}</p>
      <h2
        id="titulo-de-error"
        className="font-display text-tinta text-2xl font-semibold"
      >
        {t(titulo, datos)}
      </h2>
      <p className="text-tinta-suave font-mono text-[0.8125rem] break-all">
        {nombre}
      </p>
      <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
        <Rico texto={salida} datos={datos} />
      </p>
      {linea !== undefined ? (
        // Como cadena y no como número: una línea no lleva separador de miles.
        <p className="text-tinta-suave cifra text-[0.8125rem]">
          {t(INICIO.carga.lineaDelError, { linea: String(linea) })}
        </p>
      ) : null}
      <button
        type="button"
        onClick={onReintentar}
        className={`${clasesDeBoton("discreto")} mt-1`}
      >
        <IconoReiniciar />
        {t(INICIO.carga.elegirOtro)}
      </button>
    </div>
  );
}
