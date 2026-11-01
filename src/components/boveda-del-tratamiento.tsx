"use client";

// P6 — la bóveda del tratamiento: el archivo que hace posible el regreso.
//
// Aparece **solo** si la política marcó alguna columna como reversible. Sin eso no hay nada que
// guardar, y un panel que ofreciera guardar una bóveda vacía prometería una vuelta que no existe.
//
// Las dos cosas que esta pantalla tiene que dejar dichas ANTES de que el usuario elija una frase:
//
//   1. **La bóveda contiene los valores originales.** Es el archivo más sensible que Velo produce
//      —una tabla de identificadores sin nada alrededor— y por eso sale cifrado. Decirlo aquí es lo
//      que hace que el usuario lo guarde donde debe, y no en la misma carpeta compartida que el
//      archivo anonimizado.
//   2. **Sin la frase no hay recuperación.** Ni Velo, ni nadie. Es la contrapartida de que nadie más
//      pueda abrirla, y se dice antes, no en una nota al pie después de perderla.
//
// La frase entra al worker por `postMessage` y **no vuelve a salir**: no se guarda en el estado de
// la sesión ni en el de este componente más allá del instante en que se escribe.

import { useId, useState } from "react";
import Link from "next/link";

import { Boton, clasesDeBoton } from "@/components/boton";
import {
  IconoArchivador,
  IconoDescargar,
  IconoVolver,
} from "@/components/iconos";
import { Panel } from "@/components/panel";
import { Rico, useT } from "@/components/texto";
import { LLAVES } from "@/lib/idioma/textos/llaves";
import type { AsaDeArchivo, EstadoDeBoveda } from "@/lib/sesion";

const B = LLAVES.boveda;

/** El mismo mínimo que la llave del proyecto: una frase corta no la salva el PBKDF2. */
const MINIMO = 12;

export function BovedaDelTratamiento({
  boveda,
  archivo,
  columnas,
  onSellar,
}: {
  boveda: EstadoDeBoveda;
  archivo: AsaDeArchivo | null;
  /** Columnas reversibles: lo que esta bóveda va a poder devolver. */
  columnas: readonly string[];
  onSellar: (frase: string) => void;
}) {
  const idDeFrase = useId();
  const idDeAyuda = useId();
  const { t } = useT();
  const [frase, setFrase] = useState("");

  if (archivo) {
    return (
      <Panel
        etiqueta={t(B.etiqueta)}
        titulo={t(B.lista.titulo)}
        nota={<Rico texto={B.lista.nota} />}
      >
        <a
          href={archivo.url}
          download={archivo.nombre}
          className={clasesDeBoton("principal")}
        >
          <IconoDescargar />
          {t(B.lista.guardar)}
        </a>
        <p className="text-tinta-suave mt-3 text-[0.875rem] leading-relaxed">
          <code className="font-mono text-[0.8125rem]">{archivo.nombre}</code>{" "}
          <Rico
            texto={
              columnas.length === 1 ? B.lista.cubreUna : B.lista.cubreVarias
            }
            datos={{
              kb: Math.max(1, Math.round(archivo.bytes / 1024)),
              n: columnas.length,
            }}
          />{" "}
          {columnas.map((nombre, i) => (
            <span key={nombre}>
              {i > 0 ? " · " : ""}
              <code className="font-mono text-[0.8125rem]">{nombre}</code>
            </span>
          ))}
          .
        </p>
        <div className="border-borde mt-4 border-t pt-4">
          <p className="text-tinta-suave text-[0.875rem] leading-relaxed">
            <Rico texto={B.lista.cuando} />
          </p>
          <Link href="/regreso" className={`${clasesDeBoton("discreto")} mt-3`}>
            <IconoVolver />
            {t(B.lista.irAlRegreso)}
          </Link>
        </div>
      </Panel>
    );
  }

  const sellando = boveda.fase === "sellando";
  const corta = frase.length > 0 && frase.length < MINIMO;

  return (
    <Panel
      etiqueta={t(B.etiqueta)}
      titulo={t(B.sellar.titulo)}
      nota={
        <Rico
          texto={columnas.length === 1 ? B.sellar.notaUna : B.sellar.notaVarias}
          datos={{ n: columnas.length }}
        />
      }
    >
      <ul className="text-tinta-suave space-y-2 text-[0.9375rem] leading-relaxed">
        {[B.sellar.datos, B.sellar.sinFrase, B.sellar.otraFrase].map(
          (punto) => (
            <li key={punto.titulo.es}>
              <strong className="text-tinta font-medium">
                {t(punto.titulo)}
              </strong>{" "}
              <Rico texto={punto.cuerpo} />
            </li>
          ),
        )}
      </ul>

      <div className="mt-5">
        <label
          htmlFor={idDeFrase}
          className="text-tinta block text-[0.9375rem]"
        >
          {t(B.sellar.campo)}
        </label>
        <input
          id={idDeFrase}
          type="password"
          value={frase}
          disabled={sellando}
          autoComplete="off"
          aria-describedby={idDeAyuda}
          aria-invalid={corta}
          className="rounded-1 border-borde-control bg-superficie text-tinta mt-2 w-full max-w-md border px-3 py-2 text-[0.9375rem]"
          onChange={(evento) => setFrase(evento.target.value)}
        />
        <p id={idDeAyuda} className="text-tinta-tenue mt-2 text-[0.8125rem]">
          <Rico texto={B.sellar.ayuda} datos={{ minimo: MINIMO }} />
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Boton
          type="button"
          disabled={frase.length < MINIMO || sellando}
          onClick={() => {
            onSellar(frase);
            // La frase deja de existir en esta pantalla en cuanto sale hacia el worker.
            setFrase("");
          }}
        >
          <IconoArchivador />
          {sellando ? t(B.sellar.cifrando) : t(B.sellar.cifrar)}
        </Boton>
        {sellando ? (
          <p role="status" className="text-tinta-suave text-[0.875rem]">
            <Rico texto={B.sellar.progreso} />
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
