"use client";

// P2 — el diagnóstico.
//
// Esta página no puede recuperarse a sí misma tras una recarga, y no es un defecto: el informe vive
// en memoria porque en ningún momento se escribió en disco. El estado "sin datos" es la prueba
// visible de la promesa del producto, así que está diseñado como una pantalla más y no como un
// error.

import Link from "next/link";
import { useRouter } from "next/navigation";

import { clasesDeBoton } from "@/components/boton";
import { InformeDeDiagnostico } from "@/components/informe-de-diagnostico";
import { MarcaDeSello } from "@/components/sello";
import { descartar, useSesion } from "@/lib/sesion";

export default function PaginaDeDiagnostico() {
  const estado = useSesion();
  const router = useRouter();

  if (estado.fase !== "listo") return <SinDatos />;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <InformeDeDiagnostico informe={estado.informe} />

      <div className="border-borde mt-10 border-t pt-6">
        <button
          type="button"
          className={clasesDeBoton("discreto")}
          onClick={() => {
            // Descartar antes de navegar no es cortesía: apaga el worker, y con él muere la única
            // copia de la tabla. Volver a la aduana con el informe todavía cargado dejaría los
            // datos vivos en una pestaña que ya no los está mostrando.
            descartar();
            router.push("/");
          }}
        >
          Analizar otro archivo
        </button>
        <p className="text-tinta-tenue mt-3 text-[0.8125rem] leading-relaxed">
          Al salir de aquí el informe se descarta. No hay copia en ningún lado —
          ni en este navegador, ni en un servidor.
        </p>
      </div>
    </main>
  );
}

function SinDatos() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start px-6 py-20">
      <MarcaDeSello clase="text-tinta-tenue size-8" />
      <h1 className="font-display text-tinta mt-5 text-[clamp(1.75rem,5vw,2.25rem)] leading-tight font-semibold text-balance">
        No quedó nada, y es a propósito
      </h1>
      <p className="text-tinta-suave mt-4 leading-relaxed text-pretty">
        El diagnóstico vivía en la memoria de esta pestaña. Al recargar la
        página se fue, porque nunca se guardó en ningún sitio: ni en tu disco,
        ni en una base de datos, ni en un servidor nuestro.
      </p>
      <p className="text-tinta-suave mt-3 leading-relaxed text-pretty">
        Es el mismo motivo por el que tus datos no se filtran. Vuelve a la
        aduana y suelta el archivo otra vez: tarda lo mismo que la primera.
      </p>
      <Link href="/" className={`${clasesDeBoton("principal")} mt-8`}>
        Volver a la aduana
      </Link>
    </main>
  );
}
