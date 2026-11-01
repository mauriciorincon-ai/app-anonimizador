"use client";

import dynamic from "next/dynamic";

import { Rico } from "@/components/texto";
import { BITACORA } from "@/lib/idioma/textos/bitacora";

// P8 — `/bitacora`: la memoria de lo que has tratado.
//
// **El encabezado se pinta aquí y NO dentro del componente diferido.** Es la lección que el S3 midió
// en `/regreso`: con la página entera detrás del `dynamic`, el elemento más grande de la pantalla
// —el título— no existe hasta que llega el chunk, así que el LCP lo marca la red y no el render.
// Aquella ruta sacó 0,90 clavada en el umbral por eso mismo.
//
// La ruta nació vacía en la Fase 0 de este sprint, con su número de partida medido antes de escribir
// una línea de producto — para no repetir el arreglo a última hora que costaron `/transformar` (0,88
// por llevar el motor en el bundle) y `/regreso` (0,90 por el LCP diferido).
//
// El `min-h` de abajo tampoco es maquetación defensiva: reserva el alto del primer panel para que el
// intercambio de «Abriendo…» por el contenido real no empuje el pie de la página. En `/regreso` ese
// salto se cobró como **CLS 0,107** contra un tope de 0,1.

const Bitacora = dynamic(
  () => import("@/components/bitacora").then((m) => m.Bitacora),
  {
    ssr: false,
    loading: () => (
      <p className="text-tinta-suave" role="status">
        <Rico texto={BITACORA.pagina.abriendo} />
      </p>
    ),
  },
);

export default function PaginaDeBitacora() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <p className="etiqueta">
        <Rico texto={BITACORA.pagina.etiqueta} />
      </p>
      <h1 className="font-display text-tinta mt-2 text-[clamp(1.75rem,5vw,2.25rem)] leading-tight font-semibold text-balance">
        <Rico texto={BITACORA.pagina.titulo} />
      </h1>
      <p className="text-tinta-suave mt-3 leading-relaxed text-pretty">
        <Rico texto={BITACORA.pagina.intro} />
      </p>
      <div className="mt-8 min-h-[30rem]">
        <Bitacora />
      </div>
    </main>
  );
}
