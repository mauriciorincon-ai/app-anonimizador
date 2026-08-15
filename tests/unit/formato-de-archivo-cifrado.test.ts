// La regresión que protege lo único irreparable de Velo: **que un archivo sellado ayer siga
// abriéndose mañana.**
//
// Nace de la auditoría del S4. El sprint refactorizó la cripto de la bóveda del S3 a
// `lib/archivo-cifrado.ts` y la cabecera no cambió — pero **ningún test podía haberlo dicho**:
// todas las pruebas de cripto del repo sellan y abren con el MISMO código, así que un refactor que
// moviera un byte pasaría en verde mientras deja ilegible cada `.velo` y cada `.velolog` que
// alguien tenga guardado. El propio `archivo-cifrado.ts` lo dice con todas las letras: «un archivo
// que deja de abrirse es la pérdida total que el producto promete evitar».
//
// Estos dos archivos se sellaron **una vez**, el 2026-08-15, con el código de ese día, y viven aquí
// en base64 para siempre. Si alguna vez este test se pone rojo, la pregunta NO es «cómo arreglo el
// test»: es **«acabo de romper todos los archivos de los usuarios, ¿lo hago a propósito?»**. Si la
// respuesta es sí, el camino es subir `VERSION_DEL_ARCHIVO` y escribir la migración, no regenerar
// estas constantes.
//
// La frase de paso es una constante de prueba, no un secreto: abre dos archivos de datos
// sintéticos que están en este mismo archivo, en un repositorio público.
import { describe, expect, it } from "vitest";

import { VERSION_DE_BITACORA } from "@/engine/bitacora";
import { VERSION_DE_BOVEDA } from "@/engine/boveda";
import { abrirBitacora } from "@/lib/bitacora-archivo";
import { abrirBoveda } from "@/lib/boveda-archivo";

const FRASE = "una frase de prueba para el formato";

/** Bóveda sellada el 2026-08-15. Datos sintéticos: una columna, dos seudónimos. */
const VELO_GOLDEN =
  "VkVMTwEACSfA0fEBbrmeFW9MUlLFL9TZEBSDvhGp0aYRuFgvEftynqMWigLX/k+blE99lggtp6havI7lSm3VDpiM54x4ohbiREmL3Sf4fZMfzXUsN71PFopVD2pJDA7v3nM0dW+oFQzaL5X/bOjCc5hDo16TNPzY/ugBS03VvLSgKt68A/NY/KSAfVmvj76plR3Lz7F+En4eVq5sP0H2jutfc4sKTkkbyqebGjlgRgzTXPJ3kEevtCa76eEcfUdrnfvAuqbnfXr2mahcQI7PI21LbBwb0PjvVL5QoglI9pApTTuuQ9Np0yGBLqS2B5/ZTBt7J/tFj2I1mezWfqU8UhtA03zGBDQgz6vLXvPGPbNfOEPVhA1KabdYsCbm/CcxUrW2SNj40R2U+PvK5d7wkfVSlz2oiy3f1saHMHzQUG5eI6UndGgbSLEszIatHn1LkSdS5i1ptzt9Cp6ei0OJsnqFRw==";

/** Bitácora sellada el 2026-08-15. Una entrada, con nombre de archivo sintético. */
const VLOG_GOLDEN =
  "VkxPRwEACSfApmD8OzgzeHOe4IY9RS2UGMLhd+fiD11ba07DIfxz8QVYSiokDjNJS+BXtuALjIY72c0Lj6d3EshIysdCxEcKQYwKfdoOmp/RZ6GPRVcd6airjQh8JAc+stUFfqNNheKW8xldy8lFaIt12VZFSLn7BnP3W5J3uR46xnlgE+YWSFMoSCJnNtNAKBb3fhQaWvb+Chfim1KQsfv/rCRf0x9Lwfx7G42OHh1tbSk4S8z2lggsX6VtBzpDxVFJohRuna988x55fe8xcGKd6aaUe0+idtJW1EdFe+PEA6bZqz9fF+6iA3ToQxsACQxQCi/vBTMqXZq7/RQ2whGuZbZiwX1IS59SL7u5HD+Efhhcq7oW0MmoME4FtO6VSU82JKgSJHYQF73n8MjQvzfLwh0N4awFeMrW21IoMLesDdmtji4CAC9l5/sC9pEWcFXU0UjKOe1EqTYlzkobbchfatbUDjNXTmxE7qfDOxmsXvc0mqas+LnyRE7La/kw4pmN7HeOU8LhAUJi3c0OI+wEUU0w8HfgrRx3ohdrmf3kOEqJhrCePUyhziSZUhYwC/ZVxC4n8FnS5jKGrXdzYM9pIsMYSdp/zAV7SEtrumW/kGHKZayxme60s29+ABqR2ehMQcaTF0v53fBUZT+oXcwJ8KDq+gnVssk=";

function bytesDe(base64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(base64, "base64"));
}

/** La disposición que documenta `lib/archivo-cifrado.ts`. Cambiarla rompe todo lo ya sellado. */
const MAGIA = 4;
const VERSION = 4;
const INICIO_DE_ITERACIONES = 5;
const INICIO_DE_SAL = 9;
const INICIO_DE_IV = 25;
const BYTES_DE_CABECERA = 37;

describe("un archivo sellado ayer se abre hoy", () => {
  it("la bóveda del 2026-08-15 sigue abriéndose, con su contenido intacto", async () => {
    const resultado = await abrirBoveda(bytesDe(VELO_GOLDEN), FRASE);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    // No basta con que descifre: tiene que devolver lo MISMO. Un cambio en la serialización
    // canónica del motor pasaría el descifrado y devolvería otra cosa.
    expect(resultado.boveda).toEqual({
      version: VERSION_DE_BOVEDA,
      huellaDeLlave: "a1b2c3d4e5f6",
      salDeLlave: "0f0e0d0c0b0a09080706050403020100",
      hashDePolitica: "f".repeat(64),
      columnas: [
        {
          columna: "cedula_titular",
          seudonimos: ["VELO-0001", "VELO-0002"],
          originales: [["1000000001"], ["1000000002"]],
        },
      ],
    });
  }, 30_000);

  it("la bitácora del 2026-08-15 sigue abriéndose, con su entrada intacta", async () => {
    const resultado = await abrirBitacora(bytesDe(VLOG_GOLDEN), FRASE);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.bitacora).toEqual({
      version: VERSION_DE_BITACORA,
      entradas: [
        {
          fecha: "9 de agosto de 2026",
          archivo: "sintetico-3000.csv",
          hashDePolitica: "f".repeat(64),
          tecnicas: ["enmascarar", "seudonimizar"],
          filas: 3000,
          unicosAntes: 0.42,
          unicosDespues: 0.03,
          esTitular: true,
          huellaDeEntrada: "a".repeat(64),
          huellaDeSalida: "b".repeat(64),
        },
      ],
    });
  }, 30_000);
});

describe("la cabecera está donde el formato dice que está", () => {
  // Esto es lo que un test de ida y vuelta nunca puede comprobar: que los desplazamientos sean los
  // de la DOCUMENTACIÓN, no los que el código de hoy resulte tener.
  it("la bóveda empieza por VELO y la bitácora por VLOG, versión 1 las dos", () => {
    const velo = bytesDe(VELO_GOLDEN);
    const vlog = bytesDe(VLOG_GOLDEN);

    expect(new TextDecoder().decode(velo.slice(0, MAGIA))).toBe("VELO");
    expect(new TextDecoder().decode(vlog.slice(0, MAGIA))).toBe("VLOG");
    expect(velo[VERSION]).toBe(1);
    expect(vlog[VERSION]).toBe(1);
  });

  it("las iteraciones viajan dentro, en 32 bits big-endian, y dicen 600.000", () => {
    for (const bytes of [bytesDe(VELO_GOLDEN), bytesDe(VLOG_GOLDEN)]) {
      const vista = new DataView(
        bytes.buffer,
        bytes.byteOffset + INICIO_DE_ITERACIONES,
        4,
      );
      expect(vista.getUint32(0, false)).toBe(600_000);
    }
  });

  it("sal de 16 bytes, IV de 12, y el texto cifrado empieza en el 37", () => {
    expect(INICIO_DE_IV - INICIO_DE_SAL).toBe(16);
    expect(BYTES_DE_CABECERA - INICIO_DE_IV).toBe(12);
    // Y los dos archivos son más largos que su cabecera, con la etiqueta de 16 bytes de AES-GCM.
    for (const bytes of [bytesDe(VELO_GOLDEN), bytesDe(VLOG_GOLDEN)]) {
      expect(bytes.length).toBeGreaterThan(BYTES_DE_CABECERA + 16);
    }
  });
});

describe("y no se abre si alguien lo toca", () => {
  it("cambiar un byte de la cabecera lo rechaza en vez de descifrar con la llave equivocada", async () => {
    // La cabecera va como datos autenticados adicionales. Sin eso, alterar las iteraciones
    // derivaría otra llave y el fallo se leería como «frase incorrecta» — una mentira útil para un
    // atacante. Se toca el último byte de las iteraciones, que es el más inocente de todos.
    const alterado = bytesDe(VELO_GOLDEN);
    alterado[INICIO_DE_ITERACIONES + 3] ^= 0x01;

    const resultado = await abrirBoveda(alterado, FRASE);
    expect(resultado.ok).toBe(false);
  }, 30_000);

  it("la frase equivocada no abre la bóveda golden", async () => {
    const resultado = await abrirBoveda(
      bytesDe(VELO_GOLDEN),
      "otra frase distinta",
    );
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.motivo).toBe("frase-incorrecta");
  }, 30_000);
});
