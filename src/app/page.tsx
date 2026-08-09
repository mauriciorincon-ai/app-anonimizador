// Marcador de posición de la Fase 0. La aduana de verdad —zona de arrastre, carga por teclado,
// progreso real y los cinco estados diseñados— se construye en la Fase 3, después de que
// design-system.md fije el lenguaje visual ("bóveda serena"). Aquí no hay diseño todavía, a
// propósito: lo que hay es una página honesta, en español, sin una sola petición externa.

export default function Aduana() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <main className="flex max-w-xl flex-col items-center gap-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">
          Sprint 001 · en construcción
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance">
          Velo — la aduana de tus datos
        </h1>
        <p className="text-lg leading-relaxed text-zinc-600 dark:text-zinc-400 text-pretty">
          Velo para entregar. Desvelo para recuperar. Aquí pasarán tus tablas
          antes de viajar a una IA, a una herramienta en la nube o al computador
          de un tercero.
        </p>
        <p className="text-sm text-zinc-500">
          Todo ocurre dentro de este navegador: tus datos no suben a ningún
          servidor, ni al nuestro.
        </p>
      </main>
    </div>
  );
}
