"use client";

import dynamic from "next/dynamic";

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
        Abriendo…
      </p>
    ),
  },
);

export default function PaginaDeBitacora() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <p className="etiqueta">La bitácora</p>
      <h1 className="font-display text-tinta mt-2 text-[clamp(1.75rem,5vw,2.25rem)] leading-tight font-semibold text-balance">
        Qué has tratado, y cuándo
      </h1>
      <p className="text-tinta-suave mt-3 max-w-prose leading-relaxed text-pretty">
        Tu historial de tratamientos, en un archivo cifrado que guardas tú: qué
        anonimizaste, cuándo, con qué política y con qué riesgo resultante. Va
        cifrado porque el nombre de un archivo ya cuenta de qué va su contenido.
        Como la bóveda, vive donde tú decidas — no en este navegador.
      </p>
      <div className="mt-8 min-h-[30rem]">
        <Bitacora />
      </div>
    </main>
  );
}
