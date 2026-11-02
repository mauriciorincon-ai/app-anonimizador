"use client";

// P1 — La aduana.
//
// La pantalla tiene UNA cosa que hacer, y todo lo demás retrocede para dejarla hacerla: traer el
// archivo. La promesa de privacidad va arriba porque es la razón por la que alguien se atreve a
// soltar una tabla con datos de personas; los tres pasos van abajo porque se leen después de
// decidir, no antes.

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { clasesDeBoton } from "@/components/boton";
import { IconoCuaderno, IconoVolver } from "@/components/iconos";
import { Sello } from "@/components/sello";
import { Rico } from "@/components/texto";
import { ZonaDeCarga } from "@/components/zona-de-carga";
import { INICIO } from "@/lib/idioma/textos/inicio";
import { analizar, descartar, useSesion } from "@/lib/sesion";

export default function Aduana() {
  const estado = useSesion();
  const router = useRouter();
  // Solo se navega en la TRANSICIÓN a "listo". Si se navegara cada vez que el estado es "listo",
  // volver a la aduana con el botón «atrás» rebotaría de vuelta al diagnóstico y el usuario
  // quedaría atrapado entre las dos pantallas.
  const faseAnterior = useRef(estado.fase);

  useEffect(() => {
    if (estado.fase === "listo" && faseAnterior.current !== "listo") {
      router.push("/diagnostico");
    }
    faseAnterior.current = estado.fase;
  }, [estado.fase, router]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12 sm:py-16">
      <h1 className="font-display text-tinta text-[clamp(1.875rem,5vw,2.75rem)] leading-[1.1] font-semibold text-balance">
        <Rico texto={INICIO.titulo} />
      </h1>
      <p className="text-tinta-suave mt-4 text-lg leading-relaxed text-pretty">
        <Rico texto={INICIO.bajada} />
      </p>

      <div className="mt-10">
        <ZonaDeCarga
          estado={estado}
          onArchivo={analizar}
          onReintentar={descartar}
        />
      </div>

      {/* La promesa va pegada al control, que es donde el usuario la necesita: en el segundo en
          que está a punto de soltar una tabla con datos de personas reales. */}
      <div className="mt-4">
        <Sello />
      </div>

      <section aria-labelledby="como-funciona" className="mt-16">
        <h2 id="como-funciona" className="etiqueta">
          <Rico texto={INICIO.como} />
        </h2>
        <ol className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {INICIO.pasos.map((paso, i) => (
            <li key={i}>
              <p className="cifra font-display text-tinta-tenue text-2xl leading-none">
                {i + 1}
              </p>
              <h3 className="text-tinta mt-2 font-semibold">
                <Rico texto={paso.titulo} />
              </h3>
              <p className="text-tinta-suave mt-1.5 text-[0.9375rem] leading-relaxed">
                <Rico texto={paso.texto} />
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* El regreso va en bloque aparte y NO como quinto paso de la rejilla, por dos razones que
          apuntan al mismo sitio. La de forma: la rejilla es de cuatro y un quinto ítem quedaría
          colgado solo en la fila. La de fondo, que es la que manda: los pasos 1 a 4 ocurren de una
          sentada y **este ocurre semanas después, en otra sesión, con otro archivo**. Ponerlo en la
          misma fila diría que es el siguiente clic, y no lo es. Aquí vive además el ÚNICO enlace a
          `/regreso` desde la puerta de entrada: quien vuelve tres semanas después aterriza en esta
          pantalla sin nada cargado, y sin este enlace no tendría dónde hacer clic. */}
      <section
        aria-labelledby="el-regreso"
        className="border-borde mt-10 border-t pt-6"
      >
        <h2 id="el-regreso" className="etiqueta">
          <Rico texto={INICIO.regreso.titulo} />
        </h2>
        {/* El énfasis de este párrafo va en `text-tinta` (más oscuro que el párrafo): la variante
            lo aplica a la negrita que pinta `Rico`, sin partir la frase en tres claves. */}
        <p className="text-tinta-suave [&_strong]:text-tinta mt-2 text-[0.9375rem] leading-relaxed text-pretty">
          <Rico texto={INICIO.regreso.texto} />
        </p>
        <Link href="/regreso" className={`${clasesDeBoton("discreto")} mt-4`}>
          <IconoVolver />
          <Rico texto={INICIO.regreso.enlace} />
        </Link>
      </section>

      {/* La bitácora tiene el mismo problema de alcance que el regreso, y por eso está aquí y no
          escondida detrás de un tratamiento: se consulta MESES después, cuando alguien pregunta qué
          entregaste, y quien llega a preguntárselo abre la portada sin nada cargado. El S3 aprendió
          esto por las malas —la función existía, la prueba de que era ALCANZABLE no existía— y ese
          es el patrón que este sprint tenía delante: lo que ninguna fase mire, no lo mira nadie. */}
      <section
        aria-labelledby="la-bitacora"
        className="border-borde mt-8 border-t pt-6"
      >
        <h2 id="la-bitacora" className="etiqueta">
          <Rico texto={INICIO.bitacora.titulo} />
        </h2>
        <p className="text-tinta-suave [&_strong]:text-tinta mt-2 text-[0.9375rem] leading-relaxed text-pretty">
          <Rico texto={INICIO.bitacora.texto} />
        </p>
        <Link href="/bitacora" className={`${clasesDeBoton("discreto")} mt-4`}>
          <IconoCuaderno />
          <Rico texto={INICIO.bitacora.enlace} />
        </Link>
      </section>

      <p className="text-tinta-tenue mt-10 text-[0.8125rem] leading-relaxed">
        <Rico texto={INICIO.cierre} />
      </p>
    </main>
  );
}
