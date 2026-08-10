"use client";

// P1 — La aduana.
//
// La pantalla tiene UNA cosa que hacer, y todo lo demás retrocede para dejarla hacerla: traer el
// archivo. La promesa de privacidad va arriba porque es la razón por la que alguien se atreve a
// soltar una tabla con datos de personas; los tres pasos van abajo porque se leen después de
// decidir, no antes.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

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
        computador de un tercero, Velo te dice qué datos personales lleva dentro
        y a cuántas personas alcanza a señalar con el dedo.
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
        <ol className="mt-4 grid gap-6 sm:grid-cols-3">
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

      <p className="border-borde text-tinta-tenue mt-10 border-t pt-6 text-[0.8125rem] leading-relaxed">
        Por ahora Velo <strong className="font-medium">diagnostica</strong>: te
        muestra lo que hay y lo que arriesga. Todavía no transforma el archivo —
        enmascarar, seudonimizar y devolver los datos a su forma original llegan
        después, y sin ellos no tiene sentido prometer nada sobre el resultado.
      </p>
    </main>
  );
}
