import type { Metadata } from "next";
import Link from "next/link";

import { clasesDeBoton } from "@/components/boton";
import { MarcaDeSello } from "@/components/sello";

// P4 — `/regreso`: la vuelta del archivo. ANDAMIO DE LA FASE 0.
//
// Existe desde el primer commit del sprint por una razón medida, no por orden: en el S2 la ruta
// `/transformar` nació y se midió el día del PR, salió en 0,88 de rendimiento por arrastrar el
// motor entero en el bundle, y hubo que rehacer la carga a última hora. Aquí la ruta entra a
// `lighthouse-urls.json` estando vacía para tener el número de partida ANTES de construir, y para
// que cualquier caída se lea contra él.
//
// Hoy dice la verdad —no está construida— y no promete nada. La Fase 5 sustituye este cuerpo por
// el componente real, cargado bajo demanda igual que el taller.

export const metadata: Metadata = {
  title: "El regreso — Velo",
  description:
    "Carga el archivo que te devolvieron y recupera los valores originales con tu bóveda. " +
    "Todo dentro de tu navegador.",
};

export default function PaginaDelRegreso() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start px-6 py-20">
      <MarcaDeSello clase="text-tinta-tenue size-8" />
      <h1 className="font-display text-tinta mt-5 text-[clamp(1.75rem,5vw,2.25rem)] leading-tight font-semibold text-balance">
        El regreso todavía no está aquí
      </h1>
      <p className="text-tinta-suave mt-4 leading-relaxed text-pretty">
        Esta pantalla es donde vas a cargar el archivo que te devolvió el
        tercero para recuperar los valores originales. Se está construyendo
        ahora mismo y aún no funciona: preferimos decirlo a enseñar una caja
        vacía que parezca rota.
      </p>
      <Link href="/" className={`${clasesDeBoton("principal")} mt-8`}>
        Volver a la aduana
      </Link>
    </main>
  );
}
