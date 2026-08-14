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
import { Panel } from "@/components/panel";
import type { EntradaDeBitacora } from "@/engine/bitacora";
import { anotarTratamiento } from "@/lib/bitacora";
import { nombreDeTecnica } from "@/lib/tecnicas-en-palabras";

const FORMATO_DE_FECHA = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "long",
  timeStyle: "short",
});

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

  return (
    <Panel
      etiqueta="Paso 8 · la bitácora"
      titulo="Anótalo, para acordarte dentro de seis meses"
      nota={
        <>
          El certificado prueba <strong className="font-medium">este</strong>{" "}
          tratamiento ante quien lo reciba. La bitácora es para ti: qué has
          entregado, cuándo y con qué criterio, cuando alguien te lo pregunte
          más adelante.
        </>
      }
    >
      <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
        Se anotan el nombre del archivo, la fecha, las técnicas que aplicaste
        —sin decir a qué columnas—, las dos huellas y las proporciones de
        registros únicos antes y después.{" "}
        {entrada.tecnicas.length > 0 ? (
          <>Aquí: {entrada.tecnicas.map(nombreDeTecnica).join(", ")}.</>
        ) : null}
      </p>

      <Boton
        type="button"
        variante="discreto"
        className="mt-4"
        onClick={() => {
          anotarTratamiento({
            ...entrada,
            fecha: FORMATO_DE_FECHA.format(new Date()),
          });
          router.push("/bitacora");
        }}
      >
        Anotar en mi bitácora
      </Boton>

      <p className="text-tinta-tenue mt-3 text-[0.875rem] leading-relaxed">
        Te lleva a tu bitácora con la anotación lista. Allí eliges la frase, o
        abres la que ya tienes para añadírsela al final.
      </p>
    </Panel>
  );
}
