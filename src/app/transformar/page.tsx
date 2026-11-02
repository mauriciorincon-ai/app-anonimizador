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
import { Rico } from "@/components/texto";
import { TRANSFORMAR } from "@/lib/idioma/textos/transformar";
import { useSesion } from "@/lib/sesion";

const Taller = dynamic(
  () => import("@/components/taller").then((m) => m.Taller),
  {
    ssr: false,
    loading: () => (
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <p className="etiqueta">
          <Rico texto={TRANSFORMAR.taller.etiqueta} />
        </p>
        <p className="text-tinta-suave mt-3" role="status">
          <Rico texto={TRANSFORMAR.puerta.abriendo} />
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
        <Rico texto={TRANSFORMAR.puerta.vacio.titulo} />
      </h1>
      <p className="text-tinta-suave mt-4 leading-relaxed text-pretty">
        <Rico texto={TRANSFORMAR.puerta.vacio.detalle} />
      </p>
      <Link href="/" className={`${clasesDeBoton("principal")} mt-8`}>
        <Rico texto={TRANSFORMAR.puerta.vacio.volver} />
      </Link>
    </main>
  );
}
