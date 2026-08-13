"use client";

import dynamic from "next/dynamic";

// P7 — `/regreso`: la vuelta del archivo.
//
// **El encabezado se pinta aquí, en el servidor, y NO dentro del componente diferido.** No es una
// preferencia de organización: es el arreglo de una caída medida. Con la página entera detrás del
// `dynamic`, el elemento más grande de la pantalla —el título— no existe hasta que llega el chunk
// de JavaScript, así que el LCP lo marca la red y no el render. Medido: **0,90 de rendimiento**,
// clavado en el umbral del gate, contra 0,93 de la misma ruta cuando estaba vacía.
//
// Es la misma lección del S2 con `/transformar`, en su segunda forma: allá el bulto era el motor en
// el bundle, aquí es el contenido visible detrás de una carga diferida. La regla que sale de las
// dos: **lo que se ve primero se sirve primero; lo que pesa se carga cuando hace falta.**
//
// `"use client"` no impide que el encabezado se sirva ya pintado: un componente cliente igual se
// renderiza en el servidor para el HTML inicial. Lo que NO se renderiza allá es lo que va detrás de
// un `dynamic` con `ssr: false` — y por eso el título tiene que estar fuera de él. (Además, `dynamic`
// con `ssr: false` no está permitido dentro de un Server Component, así que la directiva es también
// un requisito del framework.)
//
// A diferencia de `/transformar`, aquí no hay un estado «sin archivo» que evitar: el regreso empieza
// vacío siempre. El archivo devuelto llega semanas después, en otra sesión, sin nada cargado — que
// es justamente por qué esto es una ruta y no un paso más del taller.

const Regreso = dynamic(
  () => import("@/components/regreso").then((m) => m.Regreso),
  {
    ssr: false,
    loading: () => (
      <p className="text-tinta-suave" role="status">
        Abriendo…
      </p>
    ),
  },
);

export default function PaginaDelRegreso() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <p className="etiqueta">El regreso</p>
      <h1 className="font-display text-tinta mt-2 text-[clamp(1.75rem,5vw,2.25rem)] leading-tight font-semibold text-balance">
        Recupera lo que entregaste
      </h1>
      <p className="text-tinta-suave mt-3 max-w-prose leading-relaxed text-pretty">
        Carga la bóveda que guardaste y el archivo que te devolvieron. Velo pone
        los valores originales de vuelta —por valor, no por posición— y respeta
        el trabajo que hicieron encima. Todo dentro de esta pestaña.
      </p>
      {/* La altura mínima NO es maquetación defensiva: es el arreglo de un salto medido.
          El contenido diferido sustituye a «Abriendo…» y empuja todo lo que viene debajo — el pie
          de la página—, y Lighthouse lo cobró con **CLS 0,107** contra el 0 de `/transformar` y el
          tope de 0,1 del presupuesto. Reservar el alto del primer panel hace que el intercambio no
          mueva nada. Un salto de contenido no es una métrica: es la pantalla bailándole a alguien
          que ya estaba leyendo. */}
      <div className="mt-8 min-h-[30rem]">
        <Regreso />
      </div>
    </main>
  );
}
