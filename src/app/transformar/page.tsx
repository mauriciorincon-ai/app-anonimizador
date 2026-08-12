"use client";

// P3 — `/transformar`: la puerta del taller.
//
// Esta página hace UNA cosa: decidir si hay archivo. Si lo hay, carga el taller bajo demanda; si no,
// enseña el callejón sin salida y no descarga ni un byte de la maquinaria. La razón está escrita en
// `src/components/taller.tsx`, y es medida.

import dynamic from "next/dynamic";
import Link from "next/link";

import { clasesDeBoton } from "@/components/boton";
import { MarcaDeSello } from "@/components/sello";
import { useSesion } from "@/lib/sesion";

const Taller = dynamic(
  () => import("@/components/taller").then((m) => m.Taller),
  {
    ssr: false,
    loading: () => (
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <p className="etiqueta">El taller</p>
        <p className="text-tinta-suave mt-3" role="status">
          Abriendo el taller…
        </p>
      </main>
    ),
  },
);

export default function PaginaDeTransformacion() {
  const estado = useSesion();
  if (estado.fase !== "listo") return <SinDatos />;
  return <Taller informe={estado.informe} />;
}

function SinDatos() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start px-6 py-20">
      <MarcaDeSello clase="text-tinta-tenue size-8" />
      <h1 className="font-display text-tinta mt-5 text-[clamp(1.75rem,5vw,2.25rem)] leading-tight font-semibold text-balance">
        No hay nada que transformar
      </h1>
      <p className="text-tinta-suave mt-4 leading-relaxed text-pretty">
        El taller trabaja sobre el archivo que tengas cargado en esta pestaña, y
        ahora mismo no hay ninguno. No se perdió: nunca se guardó en ningún
        sitio, que es la misma razón por la que tus datos no se filtran.
      </p>
      <Link href="/" className={`${clasesDeBoton("principal")} mt-8`}>
        Volver a la aduana
      </Link>
    </main>
  );
}
