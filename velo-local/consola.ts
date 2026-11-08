// Los secretos: de una variable de entorno o de la consola, sin eco. Jamás de un argumento.
//
// Un argumento queda en el historial de la terminal (`~/.zsh_history`) y en la lista de procesos
// (`ps`), a la vista de cualquier otro programa del equipo. Una variable de entorno no aparece en
// `ps` de otros usuarios, y lo escrito sin eco no queda en ninguna parte.

import { createInterface } from "node:readline";

import type { Idioma, Texto } from "@/lib/idioma";

import { ErrorDeVelo, texto } from "./textos";

/** Lee una línea de la consola. Con `oculto`, lo que se escribe no se ve. */
export function preguntar(
  pregunta: string,
  oculto: boolean,
  entrada: NodeJS.ReadStream = process.stdin,
  salida: NodeJS.WriteStream = process.stderr,
): Promise<string> {
  return new Promise((resolver) => {
    const rl = createInterface({
      input: entrada,
      output: salida,
      terminal: true,
    });
    if (oculto) {
      // readline escribe cada tecla en la salida; se le cambia el escritor por uno que no escribe
      // nada mientras dura la pregunta.
      const escritor = rl as unknown as { _writeToOutput: (s: string) => void };
      salida.write(pregunta);
      escritor._writeToOutput = () => {};
    }
    rl.question(oculto ? "" : pregunta, (respuesta) => {
      rl.close();
      if (oculto) salida.write("\n");
      resolver(respuesta);
    });
  });
}

/**
 * Un secreto: de la variable, o de la consola si hay una persona delante. Sin consola y sin
 * variable, un error que dice cuál variable falta, nunca un valor por defecto.
 */
export async function secreto(
  variable: string,
  pregunta: Texto,
  idioma: Idioma,
  claveDeError: "sinFrase" | "sinConexion" = "sinFrase",
): Promise<string> {
  const delEntorno = process.env[variable];
  if (delEntorno) return delEntorno;
  if (!process.stdin.isTTY) throw new ErrorDeVelo(claveDeError, { variable });
  const leido = await preguntar(texto(pregunta, idioma), true);
  if (!leido) throw new ErrorDeVelo(claveDeError, { variable });
  return leido;
}
