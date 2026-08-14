// P8 — `/bitacora`: la memoria de lo que has tratado.
//
// **Esto es un andamio de la Fase 0 y lo dice en pantalla.** La ruta nace vacía a propósito, por la
// lección que el S2 y el S3 pagaron dos veces: una ruta que entra al gate de Lighthouse el día del
// PR llega tarde para arreglarla. `/transformar` cayó a 0,88 por llevar el motor en el bundle y
// `/regreso` a 0,90 por un salto de contenido de 0,107 — los dos números aparecieron cuando ya
// había pantalla que rehacer. Aquí el número de partida se conoce antes de escribir una línea de
// producto, y la Fase 4 construye sabiendo cuánto margen tiene.
//
// El contenido de verdad —abrir una bitácora cifrada, leer sus entradas, añadir la del tratamiento
// recién hecho— llega en la Fase 4. Mientras tanto la pantalla no finge: no hay controles muertos
// ni un esqueleto gris que insinúe una función que todavía no existe.

export default function PaginaDeBitacora() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <p className="etiqueta">La bitácora</p>
      <h1 className="font-display text-tinta mt-2 text-[clamp(1.75rem,5vw,2.25rem)] leading-tight font-semibold text-balance">
        Qué has tratado, y cuándo
      </h1>
      <p className="text-tinta-suave mt-3 max-w-prose leading-relaxed text-pretty">
        En construcción. Aquí vivirá tu bitácora: un archivo cifrado, tuyo, que
        recuerda qué archivos anonimizaste, con qué política y con qué riesgo
        resultante. Como la bóveda, se guarda donde tú decidas — no en este
        navegador.
      </p>
    </main>
  );
}
