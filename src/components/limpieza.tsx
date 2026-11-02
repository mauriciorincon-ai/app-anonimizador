"use client";

// La limpieza de metadatos, cargada bajo demanda — la pantalla de `/transformar` para un PDF o una
// imagen.
//
// Vive fuera de `page.tsx` por la misma razón que el taller: a esta pantalla se llega después de leer
// el archivo, y la maquinaria que solo tiene sentido con uno delante (el certificado, la anotación de
// la bitácora, las tablas de bloques) no tiene por qué viajar con quien abre la ruta sin nada.
//
// Hace UNA cosa, y la hace sin opciones: «Limpiar». Lo que se quita lo dijo antes el diagnóstico, y
// la lista blanca del contenedor no se negocia pantalla por pantalla. Lo que sí hace es enseñar su
// trabajo: qué quitó (con tamaños), qué conservó, y la poscomprobación dicha como un HECHO con su
// cifra —Velo volvió a leer el archivo limpio y encontró N campos con nombre—, que es lo único de
// toda la pantalla que alguien puede volver a comprobar.
//
// Y la advertencia que no se calla, antes y después: Velo no toca el texto de las páginas ni lo que
// se ve en la imagen. Un archivo «limpio» al que se le atribuye más que eso es la peor consecuencia
// posible de esta función, así que el límite está junto al botón y vuelve en el resultado.
//
// El archivo limpio sale por un `<a download>` real y su `Blob` nunca pasa por aquí: la página recibe
// una cadena, la URL `blob:` (ADR-005; ver `asaDeArchivo` en `src/lib/sesion.ts`).

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import { Boton, clasesDeBoton } from "@/components/boton";
import {
  IconoAtras,
  IconoDescargar,
  IconoReiniciar,
  IconoTransformar,
} from "@/components/iconos";
import { Panel } from "@/components/panel";
import { SeccionDeElementos } from "@/components/tabla-de-metadatos";
import { Rico, useT } from "@/components/texto";
import type { EntradaDeBitacora } from "@/engine/bitacora";
import { bytes, numero } from "@/lib/formato";
import { plural, type Texto } from "@/lib/idioma";
import { DIAGNOSTICO } from "@/lib/idioma/textos/diagnostico";
import { METADATOS } from "@/lib/idioma/textos/metadatos";
import { TRANSFORMAR } from "@/lib/idioma/textos/transformar";
import { descartar, limpiar, useTaller, type AsaDeArchivo } from "@/lib/sesion";
import type {
  InformeDeMetadatos,
  MotivoDeError,
  ResumenDeLimpieza,
} from "@/workers/contrato";

const M = METADATOS;
const R = M.limpieza.resultado;

/**
 * El certificado se carga cuando hace falta: arrastra la plantilla entera del documento, con su CSS
 * y su texto, y solo aparece DESPUÉS de limpiar. Mismo patrón que en el taller.
 */
const DescargaDelCertificadoDeLimpieza = dynamic(
  () =>
    import("@/components/descarga-del-certificado-de-limpieza").then(
      (m) => m.DescargaDelCertificadoDeLimpieza,
    ),
  { ssr: false },
);

/** Mismo motivo: solo aparece tras limpiar, y arrastra el estado propio de la bitácora. */
const AnotarEnBitacora = dynamic(
  () =>
    import("@/components/anotar-en-bitacora").then((m) => m.AnotarEnBitacora),
  { ssr: false },
);

/**
 * Los fallos de la limpieza dicen QUÉ HACER, igual que los de la aduana y los del taller. El que más
 * peso lleva es `limpieza-incompleta`: Velo se negó a entregar un archivo que su propia comprobación
 * no encontró limpio, y la pantalla tiene que decir que NO lo use, no solo que algo falló.
 */
const FALLOS: Partial<Record<MotivoDeError, Texto>> = {
  "limpieza-incompleta": M.limpieza.fallo.limpiezaIncompleta,
  "pdf-ilegible": M.limpieza.fallo.ilegible,
  "imagen-ilegible": M.limpieza.fallo.ilegible,
  "lectura-fallida": M.limpieza.fallo.perdido,
};

export function Limpieza({ informe }: { informe: InformeDeMetadatos }) {
  const { t } = useT();
  const taller = useTaller();
  const router = useRouter();
  const { limpieza } = taller;
  const limpiando = limpieza.fase === "limpiando";

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <p className="etiqueta">
        <Rico texto={M.limpieza.etiqueta} />
      </p>
      <h1 className="font-display text-tinta mt-1.5 text-[clamp(1.75rem,5vw,2.25rem)] leading-tight font-semibold text-balance">
        <Rico texto={M.limpieza.titulo} />
      </h1>
      <p className="text-tinta-suave mt-3 leading-relaxed text-pretty">
        <Rico texto={M.limpieza.resumen.antes} />{" "}
        <span className="font-mono text-[0.9375rem] break-all">
          {informe.archivo.nombre}
        </span>
        <Rico texto={M.limpieza.resumen.despues} />
      </p>

      <div className="mt-8 space-y-6">
        {limpieza.fase === "hecha" ? null : (
          <>
            {/* El límite va pegado a la acción, que es donde se necesita: en el segundo en que se
                va a pulsar un botón que se llama «Limpiar». */}
            <div
              role="note"
              className="rounded-2 border-alerta/35 bg-alerta-tenue flex items-start gap-3 border px-4 py-3"
            >
              <span
                aria-hidden="true"
                className="border-alerta text-alerta mt-0.5 flex size-6 flex-none items-center justify-center rounded-full border text-[0.875rem] font-semibold"
              >
                !
              </span>
              <p className="text-tinta text-[0.9375rem] leading-relaxed">
                <Rico texto={M.limite.principal} />
              </p>
            </div>

            {limpieza.fase === "fallo" ? null : (
              <div className="flex flex-wrap items-center gap-3">
                <Boton type="button" disabled={limpiando} onClick={limpiar}>
                  <IconoTransformar />
                  {limpiando ? t(M.limpieza.limpiando) : t(M.limpieza.limpiar)}
                </Boton>
                {limpiando ? (
                  <p role="status" className="text-tinta-suave text-[0.875rem]">
                    {taller.etapa === "comprobando"
                      ? t(M.limpieza.progreso.comprobando)
                      : t(M.limpieza.progreso.limpiando)}
                  </p>
                ) : null}
              </div>
            )}
          </>
        )}

        {limpieza.fase === "fallo" ? (
          <div className="flex flex-col items-start gap-4">
            <div
              role="alert"
              className="rounded-3 border-alerta/35 bg-alerta-tenue border px-5 py-4"
            >
              <p className="etiqueta text-alerta">
                <Rico texto={M.limpieza.fallo.titulo} />
              </p>
              <p className="text-tinta mt-2 text-[0.9375rem] leading-relaxed">
                <Rico
                  texto={FALLOS[limpieza.motivo] ?? M.limpieza.fallo.generico}
                />
              </p>
            </div>
            {/* Reintentar daría lo mismo —la limpieza es determinista—: la salida es otro archivo,
                y esa salida tiene que estar a mano y no solo escrita. */}
            <Boton
              type="button"
              variante="discreto"
              onClick={() => {
                // Descartar antes de navegar: apaga el worker y con él la única copia en memoria.
                descartar();
                router.push("/");
              }}
            >
              <IconoReiniciar />
              <Rico texto={DIAGNOSTICO.pagina.otroArchivo} />
            </Boton>
          </div>
        ) : null}

        {limpieza.fase === "hecha" ? (
          <Resultado
            informe={informe}
            resumen={limpieza.resumen}
            archivo={limpieza.archivo}
          />
        ) : null}
      </div>

      <div className="border-borde mt-10 border-t pt-6">
        <button
          type="button"
          className={clasesDeBoton("discreto")}
          onClick={() => router.push("/diagnostico")}
        >
          <IconoAtras />
          <Rico texto={TRANSFORMAR.taller.volverAlDiagnostico} />
        </button>
      </div>
    </main>
  );
}

// ── El resultado ────────────────────────────────────────────────────────────────────────────────

function Resultado({
  informe,
  resumen,
  archivo,
}: {
  informe: InformeDeMetadatos;
  resumen: ResumenDeLimpieza;
  archivo: AsaDeArchivo;
}) {
  const { t, idioma } = useT();
  const esPdf = resumen.formato === "pdf";
  // Bloques contados uno a uno (dos `tEXt` son dos), la misma cuenta que va a la bitácora.
  const bloques = resumen.quitados.reduce((suma, e) => suma + e.cuantos, 0);
  const camposAlSalir = resumen.poscomprobacion.campos;
  const versionesAlSalir = resumen.poscomprobacion.revisiones;

  return (
    <>
      <Panel
        etiqueta={t(R.etiqueta)}
        titulo={t(R.titulo)}
        nota={<Rico texto={R.limite} />}
      >
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <Cifra etiqueta={t(R.cifras.campos)}>
            {numero(resumen.campos, idioma)}
          </Cifra>
          <Cifra etiqueta={t(R.cifras.bloques)}>
            {numero(bloques, idioma)}
          </Cifra>
          {esPdf ? (
            <Cifra etiqueta={t(R.cifras.versiones)}>
              {numero(resumen.revisionesQuitadas, idioma)}
            </Cifra>
          ) : null}
          <Cifra etiqueta={t(R.cifras.tamano)} pequena>
            {t(R.cifras.tamanoValor, {
              antes: bytes(informe.archivo.bytes, idioma),
              despues: bytes(resumen.bytes, idioma),
            })}
          </Cifra>
        </dl>

        {/* La poscomprobación es un hecho con su cifra, no una frase tranquilizadora: el lector
            volvió a correr sobre el archivo LIMPIO y esto es lo que encontró. */}
        <div className="border-borde mt-6 border-t pt-5">
          <p className="text-tinta text-[0.9375rem] leading-relaxed">
            <Rico
              texto={plural(
                camposAlSalir,
                R.comprobacionUna,
                R.comprobacionVarias,
              )}
              datos={{ n: camposAlSalir }}
            />
            {versionesAlSalir !== null ? (
              <>
                {" "}
                <Rico
                  texto={
                    versionesAlSalir <= 1
                      ? R.versionUnica
                      : R.versionesQueQuedan
                  }
                  datos={{ n: versionesAlSalir }}
                />
              </>
            ) : null}
          </p>
          <p className="text-tinta-tenue mt-2 text-[0.8125rem] leading-relaxed">
            {t(R.comprobacionLimite)}
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-8">
          <SeccionDeElementos
            titulo={R.quitado.titulo}
            descripcion={R.quitado.descripcion}
            ninguno={R.quitado.ninguno}
            elementos={resumen.quitados}
          />
          <SeccionDeElementos
            titulo={R.conservado.titulo}
            descripcion={R.conservado.descripcion}
            ninguno={R.conservado.ninguno}
            elementos={resumen.conservados}
          />
        </div>

        {resumen.idNuevo !== null ? (
          <div className="border-borde mt-6 border-t pt-5">
            <p className="etiqueta">{t(R.idNuevo.titulo)}</p>
            <code className="text-tinta mt-1.5 block font-mono text-[0.8125rem] break-all">
              {resumen.idNuevo}
            </code>
            <p className="text-tinta-tenue mt-2 text-[0.8125rem] leading-relaxed">
              {t(R.idNuevo.nota)}
            </p>
          </div>
        ) : null}
      </Panel>

      <Panel
        etiqueta={t(M.limpieza.archivo.etiqueta)}
        titulo={t(M.limpieza.archivo.titulo)}
        nota={<Rico texto={M.limpieza.archivo.nota} />}
      >
        {/* Las dos huellas, juntas: quien tenga el archivo puede recalcular la segunda con el
            comando de su sistema, y el certificado le explica cómo. */}
        <dl className="flex flex-col gap-3">
          <Huella
            etiqueta={t(M.limpieza.archivo.huellaDeEntrada)}
            valor={informe.archivo.sha256}
          />
          <Huella
            etiqueta={t(M.limpieza.archivo.huellaDeSalida)}
            valor={resumen.sha256}
          />
        </dl>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {/* Un enlace real, no un `click()` sintético: está en el árbol de accesibilidad, se
              alcanza con Tab y el navegador lo trata como lo que es. Detrás hay una URL `blob:`. */}
          <a
            href={archivo.url}
            download={archivo.nombre}
            className="rounded-1 bg-acento text-papel shadow-1 inline-flex items-center gap-2 px-5 py-2.5 text-[0.9375rem] font-medium"
          >
            <IconoDescargar />
            {t(M.limpieza.archivo.guardar)} {archivo.nombre}
          </a>
          <p className="text-tinta-tenue text-[0.875rem]">
            <Rico
              texto={M.limpieza.archivo.escribeTuNavegador}
              datos={{ tamano: bytes(archivo.bytes, idioma) }}
            />
          </p>
        </div>
      </Panel>

      <DescargaDelCertificadoDeLimpieza
        informe={informe}
        resumen={resumen}
        archivo={archivo}
      />

      <AnotarEnBitacora
        entrada={entradaDeBitacora(informe, resumen, bloques)}
      />
    </>
  );
}

/**
 * La entrada de bitácora de una limpieza. Un PDF o una imagen no tienen filas, técnicas ni riesgo:
 * esos campos van en cero y la bitácora no los enseña (muestra el bloque `metadatos`). Se guardan las
 * dos huellas, que son lo que ata la anotación al certificado que acompañó al archivo.
 */
function entradaDeBitacora(
  informe: InformeDeMetadatos,
  resumen: ResumenDeLimpieza,
  bloques: number,
): Omit<EntradaDeBitacora, "fecha"> {
  return {
    archivo: informe.archivo.nombre,
    hashDePolitica: "",
    tecnicas: [],
    filas: 0,
    unicosAntes: 0,
    unicosDespues: 0,
    esTitular: true,
    huellaDeEntrada: informe.archivo.sha256,
    huellaDeSalida: resumen.sha256,
    metadatos: {
      formato: resumen.formato,
      campos: resumen.campos,
      elementos: bloques,
      revisionesQuitadas: resumen.revisionesQuitadas,
    },
  };
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

function Huella({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="etiqueta">{etiqueta}</dt>
      <dd className="mt-1">
        <code className="text-tinta-suave font-mono text-[0.75rem] break-all">
          {valor}
        </code>
      </dd>
    </div>
  );
}
