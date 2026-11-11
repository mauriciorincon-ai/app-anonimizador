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
import { Rico, useT } from "@/components/texto";
import { LLAVES } from "@/lib/idioma/textos/llaves";
import { ITERACIONES_PBKDF2, normalizarSal, SAL_VALIDA } from "@/lib/llave";
import type { EstadoDeLlave } from "@/lib/sesion";

const L = LLAVES.llave;

/** Mínimo para que la frase valga la pena. Corta y el PBKDF2 no la salva. */
const MINIMO = 12;

export function LlaveDelProyecto({
  llave,
  onDerivar,
}: {
  llave: EstadoDeLlave;
  onDerivar: (frase: string, sal?: string) => void;
}) {
  const idDeFrase = useId();
  const idDeAyuda = useId();
  const idDeSal = useId();
  const idDeAyudaDeSal = useId();
  const idDeErrorDeSal = useId();
  const { t } = useT();
  const [frase, setFrase] = useState("");
  // La sal pegada vive solo aquí, en el estado del componente: ni almacenamiento ni evento.
  const [sal, setSal] = useState("");

  if (llave.fase === "lista") {
    return (
      <Panel
        etiqueta={t(L.etiqueta)}
        titulo={t(L.lista.titulo)}
        nota={<Rico texto={L.lista.nota} />}
      >
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="etiqueta">{t(L.lista.huella)}</dt>
            <dd className="text-tinta mt-1 font-mono text-[0.9375rem]">
              {llave.huella}
            </dd>
          </div>
          <div>
            <dt className="etiqueta">{t(L.lista.sal)}</dt>
            <dd className="text-tinta mt-1 font-mono text-[0.8125rem] break-all">
              {llave.sal}
            </dd>
          </div>
        </dl>
        <p className="text-tinta-suave mt-4 text-[0.875rem] leading-relaxed">
          <Rico texto={L.lista.explicacion} />
        </p>
      </Panel>
    );
  }

  const derivando = llave.fase === "derivando";
  const corta = frase.length > 0 && frase.length < MINIMO;
  const salPegada = normalizarSal(sal);
  const salMala = salPegada.length > 0 && !SAL_VALIDA.test(salPegada);

  return (
    <Panel
      etiqueta={t(L.etiqueta)}
      titulo={t(L.pedir.titulo)}
      nota={<Rico texto={L.pedir.nota} />}
    >
      <ul className="text-tinta-suave space-y-2 text-[0.9375rem] leading-relaxed">
        {[L.pedir.misma, L.pedir.perderla, L.pedir.filtrarla].map((punto) => (
          <li key={punto.titulo.es}>
            <strong className="text-tinta font-medium">
              {t(punto.titulo)}
            </strong>{" "}
            <Rico texto={punto.cuerpo} />
          </li>
        ))}
      </ul>

      <div className="mt-5">
        <label
          htmlFor={idDeFrase}
          className="text-tinta block text-[0.9375rem]"
        >
          {t(L.pedir.campo)}
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
          <Rico texto={L.pedir.ayuda} datos={{ minimo: MINIMO }} />
        </p>
      </div>

      <div className="mt-5">
        <label htmlFor={idDeSal} className="text-tinta block text-[0.9375rem]">
          {t(L.pedir.sal.campo)}
        </label>
        <input
          id={idDeSal}
          type="text"
          value={sal}
          disabled={derivando}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-describedby={
            salMala ? `${idDeAyudaDeSal} ${idDeErrorDeSal}` : idDeAyudaDeSal
          }
          aria-invalid={salMala}
          className="rounded-1 border-borde-control bg-superficie text-tinta mt-2 w-full max-w-md border px-3 py-2 font-mono text-[0.875rem]"
          onChange={(evento) => setSal(evento.target.value)}
        />
        <p
          id={idDeAyudaDeSal}
          className="text-tinta-tenue mt-2 text-[0.8125rem]"
        >
          {t(L.pedir.sal.ayuda)}
        </p>
        {salMala ? (
          <p
            id={idDeErrorDeSal}
            role="alert"
            className="text-tinta mt-2 text-[0.8125rem] font-medium"
          >
            <span aria-hidden="true">⚠ </span>
            {t(L.pedir.sal.error)}
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Boton
          type="button"
          disabled={frase.length < MINIMO || salMala || derivando}
          onClick={() => {
            if (salPegada.length > 0) onDerivar(frase, salPegada);
            else onDerivar(frase);
            // La frase deja de existir en esta pantalla en cuanto sale hacia el worker.
            setFrase("");
            setSal("");
          }}
        >
          <IconoAdelante />
          {derivando ? t(L.pedir.derivando) : t(L.pedir.derivar)}
        </Boton>
        {derivando ? (
          <p role="status" className="text-tinta-suave text-[0.875rem]">
            <Rico texto={L.pedir.progreso} datos={{ n: ITERACIONES_PBKDF2 }} />
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
