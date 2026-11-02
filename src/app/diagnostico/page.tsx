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
import { Rico } from "@/components/texto";
import { DIAGNOSTICO } from "@/lib/idioma/textos/diagnostico";
import { descartar, useSesion } from "@/lib/sesion";

export default function PaginaDeDiagnostico() {
  const estado = useSesion();
  const router = useRouter();

  if (estado.fase !== "listo") return <SinDatos />;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <InformeDeDiagnostico informe={estado.informe} />

      <div className="border-borde mt-10 border-t pt-6">
        <Link href="/transformar" className={clasesDeBoton("principal")}>
          <Rico texto={DIAGNOSTICO.pagina.transformar} />
        </Link>
        <p className="text-tinta-suave mt-3 text-[0.9375rem] leading-relaxed">
          <Rico texto={DIAGNOSTICO.pagina.explicacion} />
        </p>
      </div>

      <div className="border-borde mt-8 border-t pt-6">
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
          <Rico texto={DIAGNOSTICO.pagina.otroArchivo} />
        </button>
        <p className="text-tinta-tenue mt-3 text-[0.8125rem] leading-relaxed">
          <Rico texto={DIAGNOSTICO.pagina.descarte} />
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
        <Rico texto={DIAGNOSTICO.pagina.sinDatos.titulo} />
      </h1>
      <p className="text-tinta-suave mt-4 leading-relaxed text-pretty">
        <Rico texto={DIAGNOSTICO.pagina.sinDatos.porQue} />
      </p>
      <p className="text-tinta-suave mt-3 leading-relaxed text-pretty">
        <Rico texto={DIAGNOSTICO.pagina.sinDatos.motivo} />
      </p>
      <Link href="/" className={`${clasesDeBoton("principal")} mt-8`}>
        <Rico texto={DIAGNOSTICO.pagina.sinDatos.volver} />
      </Link>
    </main>
  );
}
