"use client";

// P5 — la llave del proyecto.
//
// No es un campo de contraseña más: es la pieza cuya pérdida es irreversible y cuya filtración
// vuelve enlazables todos los seudónimos de una vez. Por eso esta pantalla dice las tres cosas que
// nadie quiere leer —y las dice ANTES de pedir la frase, no en una nota al pie después.
//
// La frase entra al worker y **no vuelve a salir**. La llave se deriva allá, es no extraíble, y de
// vuelta solo cruza una huella de 12 hex que es el HMAC de una constante. Al terminar, esta
// pantalla borra la frase de su propio estado: no porque alguien vaya a leerla, sino porque no hay
// ninguna razón para que siga ahí.
//
// Sobre el «derivando»: **la protección es el número de vueltas, no los segundos**, y esta pantalla
// lo decía al revés hasta que el S3 lo midió. PBKDF2 con 600.000 iteraciones (mínimo de OWASP) tarda
// 36 ms en Chromium sobre un portátil moderno y bastante más en un teléfono de gama baja: prometer
// «alrededor de un segundo» era prometer una espera que en la mitad de los equipos no ocurre. El
// costo deliberado es real; el tiempo no es una propiedad que se pueda anunciar.

import { useId, useState } from "react";

import { Boton } from "@/components/boton";
import { IconoAdelante } from "@/components/iconos";
import { Panel } from "@/components/panel";
import { ITERACIONES_PBKDF2 } from "@/lib/llave";
import { numero } from "@/lib/formato";
import type { EstadoDeLlave } from "@/lib/sesion";

/** Mínimo para que la frase valga la pena. Corta y el PBKDF2 no la salva. */
const MINIMO = 12;

export function LlaveDelProyecto({
  llave,
  onDerivar,
}: {
  llave: EstadoDeLlave;
  onDerivar: (frase: string) => void;
}) {
  const idDeFrase = useId();
  const idDeAyuda = useId();
  const [frase, setFrase] = useState("");

  if (llave.fase === "lista") {
    return (
      <Panel
        etiqueta="Paso 2 · la llave"
        titulo="Llave lista"
        nota={
          <>
            Guarda la frase y esta sal en tu gestor de contraseñas. Sin las dos,
            los seudónimos del mes que viene <strong>no van a cuadrar</strong>{" "}
            con los de hoy.
          </>
        }
      >
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="etiqueta">Huella de la llave</dt>
            <dd className="text-tinta mt-1 font-mono text-[0.9375rem]">
              {llave.huella}
            </dd>
          </div>
          <div>
            <dt className="etiqueta">Sal</dt>
            <dd className="text-tinta mt-1 font-mono text-[0.8125rem] break-all">
              {llave.sal}
            </dd>
          </div>
        </dl>
        <p className="text-tinta-suave mt-4 text-[0.875rem] leading-relaxed">
          La huella no revela la llave: es el resultado de firmar un texto fijo
          y conocido con ella. Sirve para reconocer, mirando dos archivos, que
          salieron de la misma llave.
        </p>
      </Panel>
    );
  }

  const derivando = llave.fase === "derivando";
  const corta = frase.length > 0 && frase.length < MINIMO;

  return (
    <Panel
      etiqueta="Paso 2 · la llave"
      titulo="Una frase que solo tú tienes"
      nota={
        <>
          Velo no la guarda, no la manda a ningún lado y no puede recuperarla.
          La frase entra al hilo donde viven tus datos, se convierte en llave
          allí, y lo único que vuelve a esta pantalla es la huella.
        </>
      }
    >
      <ul className="text-tinta-suave space-y-2 text-[0.9375rem] leading-relaxed">
        <li>
          <strong className="text-tinta font-medium">
            La misma frase da los mismos seudónimos.
          </strong>{" "}
          Es lo que permite cruzar el archivo de marzo con el de abril sin tener
          los datos reales delante.
        </li>
        <li>
          <strong className="text-tinta font-medium">
            Si la pierdes, no hay vuelta atrás.
          </strong>{" "}
          Nadie puede regenerarla. Es la contrapartida de que nadie más la
          tenga.
        </li>
        <li>
          <strong className="text-tinta font-medium">
            Si se filtra, los seudónimos se vuelven enlazables.
          </strong>{" "}
          Quien la tenga puede recalcularlos todos. Trátala como una contraseña,
          no como un ajuste.
        </li>
      </ul>

      <div className="mt-5">
        <label
          htmlFor={idDeFrase}
          className="text-tinta block text-[0.9375rem]"
        >
          Frase de paso del proyecto
        </label>
        <input
          id={idDeFrase}
          type="password"
          value={frase}
          disabled={derivando}
          autoComplete="off"
          aria-describedby={idDeAyuda}
          aria-invalid={corta}
          className="rounded-1 border-borde-control bg-superficie text-tinta mt-2 w-full max-w-md border px-3 py-2 text-[0.9375rem]"
          onChange={(evento) => setFrase(evento.target.value)}
        />
        <p id={idDeAyuda} className="text-tinta-tenue mt-2 text-[0.8125rem]">
          Al menos {MINIMO} caracteres. Una frase de varias palabras aguanta
          mucho mejor que una contraseña corta con símbolos.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Boton
          type="button"
          disabled={frase.length < MINIMO || derivando}
          onClick={() => {
            onDerivar(frase);
            // La frase deja de existir en esta pantalla en cuanto sale hacia el worker.
            setFrase("");
          }}
        >
          <IconoAdelante />
          {derivando ? "Derivando la llave…" : "Derivar la llave"}
        </Boton>
        {derivando ? (
          <p role="status" className="text-tinta-suave text-[0.875rem]">
            {numero(ITERACIONES_PBKDF2)} vueltas de PBKDF2, que es lo que
            encarece por igual cada intento de adivinarla. En un equipo rápido
            es un instante; en un teléfono, un momento.
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
