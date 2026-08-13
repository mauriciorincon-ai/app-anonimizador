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
import { Panel } from "@/components/panel";
import { numero } from "@/lib/formato";
import type { AsaDeArchivo, EstadoDeBoveda } from "@/lib/sesion";

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
  const [frase, setFrase] = useState("");

  if (archivo) {
    return (
      <Panel
        etiqueta="Paso 4 · la bóveda"
        titulo="Guarda la bóveda, o no habrá regreso"
        nota={
          <>
            Este archivo lleva tus valores <strong>originales</strong>,
            cifrados. No lo mandes por el mismo correo que el archivo
            anonimizado: juntos son el archivo sin anonimizar.
          </>
        }
      >
        <a
          href={archivo.url}
          download={archivo.nombre}
          className={clasesDeBoton("principal")}
        >
          Guardar la bóveda
        </a>
        <p className="text-tinta-suave mt-3 text-[0.875rem] leading-relaxed">
          <code className="font-mono text-[0.8125rem]">{archivo.nombre}</code> ·{" "}
          {numero(Math.max(1, Math.round(archivo.bytes / 1024)))} KB. Cubre{" "}
          {columnas.length === 1
            ? "una columna"
            : `${numero(columnas.length)} columnas`}
          :{" "}
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
            Cuando te devuelvan el archivo trabajado, vuelve con esta bóveda y
            su frase.
          </p>
          <Link href="/regreso" className={`${clasesDeBoton("discreto")} mt-3`}>
            Ir al regreso
          </Link>
        </div>
      </Panel>
    );
  }

  const sellando = boveda.fase === "sellando";
  const corta = frase.length > 0 && frase.length < MINIMO;

  return (
    <Panel
      etiqueta="Paso 4 · la bóveda"
      titulo="La correspondencia para poder deshacerlo"
      nota={
        <>
          Marcaste{" "}
          {columnas.length === 1
            ? "una columna reversible"
            : `${numero(columnas.length)} columnas reversibles`}
          . La bóveda es un archivo cifrado con la correspondencia entre cada
          seudónimo y su valor original.
        </>
      }
    >
      <ul className="text-tinta-suave space-y-2 text-[0.9375rem] leading-relaxed">
        <li>
          <strong className="text-tinta font-medium">
            Lleva tus datos originales.
          </strong>{" "}
          Es el archivo más sensible que sale de Velo. Guárdalo donde guardarías
          el original — nunca junto al anonimizado.
        </li>
        <li>
          <strong className="text-tinta font-medium">
            Sin la frase no hay recuperación.
          </strong>{" "}
          Ni Velo, ni nadie. Es la contrapartida de que nadie más pueda abrirla.
        </li>
        <li>
          <strong className="text-tinta font-medium">
            Puede ser otra frase, y es mejor que lo sea.
          </strong>{" "}
          La llave del proyecto decide los seudónimos; esta solo abre el
          archivo. Separarlas significa que filtrar una no entrega la otra.
        </li>
      </ul>

      <div className="mt-5">
        <label htmlFor={idDeFrase} className="text-tinta text-[0.9375rem]">
          Frase de paso de la bóveda
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
          Al menos {MINIMO} caracteres. Apúntala en tu gestor de contraseñas
          antes de continuar: no hay forma de recuperarla.
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
          {sellando ? "Cifrando la bóveda…" : "Cifrar y preparar la bóveda"}
        </Boton>
        {sellando ? (
          <p role="status" className="text-tinta-suave text-[0.875rem]">
            Derivando la llave de cifrado y sellando el archivo.
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
