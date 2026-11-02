"use client";

// P8 — «anótalo en tu bitácora», desde el taller.
//
// **Aquí se prepara, en `/bitacora` se guarda**, y la frontera entre las dos cosas es deliberada.
// El taller es quien SABE qué anotar —tiene el balance, las dos huellas y el hash de la política—;
// la bitácora es un archivo cifrado con su propia frase de paso, y pedir esa frase aquí habría
// metido un cuarto secreto en la pantalla que ya gestiona la llave del proyecto y la de la bóveda.
//
// Aparece **después del archivo**, por la misma razón que el certificado: una entrada sin la huella
// de salida no se podría atar nunca al certificado que la acompaña, y una bitácora que no se puede
// contrastar con nada es un diario, no un registro.
//
// La entrada se arma aquí y no en el worker porque no es material sensible de nadie: son conteos,
// huellas y el nombre del archivo del propio usuario. Lo que sí vive solo en el worker es la
// criptografía, y eso no se toca.

import { useRouter } from "next/navigation";

import { Boton } from "@/components/boton";
import { IconoCuaderno } from "@/components/iconos";
import { Panel } from "@/components/panel";
import { Rico, useT } from "@/components/texto";
import type { EntradaDeBitacora } from "@/engine/bitacora";
import { anotarTratamiento } from "@/lib/bitacora";
import { LOCALE } from "@/lib/idioma";
import { TRANSFORMAR } from "@/lib/idioma/textos/transformar";
import { nombreDeTecnica } from "@/lib/tecnicas-en-palabras";

const A = TRANSFORMAR.anotar;

/**
 * La entrada, menos su fecha.
 *
 * La fecha se pone al pulsar y no al renderizar, por dos razones: el motor tiene prohibido mirar el
 * reloj (hay un test que lee el código fuente), y un `new Date()` en el render cambiaría en cada
 * repintado, así que la entrada no sería la misma de un segundo al otro.
 */
type EntradaSinFecha = Omit<EntradaDeBitacora, "fecha">;

export function AnotarEnBitacora({ entrada }: { entrada: EntradaSinFecha }) {
  const router = useRouter();
  const { t, idioma } = useT();

  return (
    <Panel
      etiqueta={t(A.etiqueta)}
      titulo={t(A.titulo)}
      nota={<Rico texto={A.nota} />}
    >
      <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
        <Rico texto={A.cuerpo} />{" "}
        {entrada.tecnicas.length > 0 ? (
          <>
            {t(A.aqui)}{" "}
            {entrada.tecnicas
              .map((clave) => nombreDeTecnica(clave, idioma))
              .join(", ")}
            .
          </>
        ) : null}
      </p>

      <Boton
        type="button"
        variante="discreto"
        className="mt-4"
        onClick={() => {
          // La fecha se escribe YA, en el idioma de ahora, y así se guarda: es un dato del usuario.
          // Una entrada vieja se queda en el idioma en que se anotó; cambiar de idioma después no
          // la reescribe.
          anotarTratamiento({
            ...entrada,
            fecha: new Intl.DateTimeFormat(LOCALE[idioma], {
              dateStyle: "long",
              timeStyle: "short",
            }).format(new Date()),
          });
          router.push("/bitacora");
        }}
      >
        <IconoCuaderno />
        {t(A.boton)}
      </Boton>

      <p className="text-tinta-tenue mt-3 text-[0.875rem] leading-relaxed">
        <Rico texto={A.despues} />
      </p>
    </Panel>
  );
}
