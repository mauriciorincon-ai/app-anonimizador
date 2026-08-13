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
import { Sello } from "@/components/sello";
import { ZonaDeCarga } from "@/components/zona-de-carga";
import { analizar, descartar, useSesion } from "@/lib/sesion";

const PASOS = [
  {
    titulo: "Sueltas la tabla",
    texto:
      "Se abre en esta pestaña, en un hilo aparte para que el navegador no se congele. No hay carga a ningún servidor: es que no hay servidor.",
  },
  {
    titulo: "Velo la lee columna por columna",
    texto:
      "Recalcula los dígitos de verificación oficiales —el mod 11 de la DIAN para el NIT, Luhn para las tarjetas, el 97-10 del IBAN— y reconoce las formas colombianas: cédulas, celulares, placas.",
  },
  {
    titulo: "Te dice a quién delata",
    texto:
      "Cuenta cuántas personas quedan solas al cruzar unas columnas con otras. La cuenta es exacta: sale de tus filas, no de un modelo estadístico.",
  },
  {
    titulo: "Y lo transformas",
    texto:
      "Eliges qué se le hace a cada columna —o aplicas Habeas Data de un clic—, ves el antes y el después, y te llevas el archivo tratado con el documento que dice qué se le hizo.",
  },
];

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
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 sm:py-16">
      <h1 className="font-display text-tinta text-[clamp(1.875rem,5vw,2.75rem)] leading-[1.1] font-semibold text-balance">
        Mira tu tabla como la vería un extraño
      </h1>
      <p className="text-tinta-suave mt-4 text-lg leading-relaxed text-pretty">
        Antes de mandar un archivo a una IA, a una herramienta en la nube o al
        computador de un tercero, Velo te dice qué datos personales lleva
        dentro, a cuántas personas alcanza a señalar con el dedo, y te lo
        devuelve anonimizado.
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
          Cómo funciona
        </h2>
        <ol className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PASOS.map((paso, i) => (
            <li key={paso.titulo}>
              <p className="cifra font-display text-tinta-tenue text-2xl leading-none">
                {i + 1}
              </p>
              <h3 className="text-tinta mt-2 font-semibold">{paso.titulo}</h3>
              <p className="text-tinta-suave mt-1.5 text-[0.9375rem] leading-relaxed">
                {paso.texto}
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
          Y semanas después
        </h2>
        <p className="text-tinta-suave mt-2 max-w-prose text-[0.9375rem] leading-relaxed text-pretty">
          Cuando el tercero te devuelva el archivo trabajado, Velo{" "}
          <strong className="text-tinta font-medium">
            pone los valores originales de vuelta
          </strong>{" "}
          y respeta lo que hicieron encima. Para eso guardas la bóveda cifrada
          al anonimizar: sin ella el seudónimo sigue siendo irreversible —que es
          justo lo que lo hace seguro de entregar—; con ella, y solo con ella,
          vuelve.
        </p>
        <Link href="/regreso" className={`${clasesDeBoton("discreto")} mt-4`}>
          Ya tengo mi bóveda y el archivo devuelto
        </Link>
      </section>

      <p className="text-tinta-tenue mt-10 text-[0.8125rem] leading-relaxed">
        Velo reduce el riesgo de reidentificación y lo mide; no declara ningún
        archivo anónimo.
      </p>
    </main>
  );
}
