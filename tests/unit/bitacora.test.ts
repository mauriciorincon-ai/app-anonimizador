// La bitácora — el registro que el usuario tiene para sí mismo.
//
// Dos propiedades mandan aquí, y las dos son de confianza más que de función:
//
//   1. **Una entrada vieja no cambia porque llegue una nueva.** Un registro que se reescribe deja de
//      ser un registro. Se prueba sobre la serialización EN CLARO, porque el archivo cifrado cambia
//      entero cada vez por diseño (IV único).
//   2. **El archivo en disco no delata nada.** Una bitácora es una lista de nombres de archivo del
//      usuario, y `pacientes-oncologia-2026.csv` cuenta de qué va el contenido antes de que nadie
//      lo abra. Se barren los bytes buscando cualquier resto en claro.

import { describe, expect, it } from "vitest";

import {
  anadirEntrada,
  bitacoraVacia,
  deserializarBitacora,
  huellaDeBitacora,
  serializarBitacora,
  VERSION_DE_BITACORA,
  type Bitacora,
  type EntradaDeBitacora,
} from "@/engine/bitacora";
import { magiaDe, sellarCifrado } from "@/lib/archivo-cifrado";
import {
  abrirBitacora,
  EXTENSION_DE_BITACORA,
  sellarBitacora,
} from "@/lib/bitacora-archivo";
import { sellarBoveda } from "@/lib/boveda-archivo";
import { construirBoveda } from "@/engine/boveda";

const FRASE = "una frase larga para la bitacora";

function entrada(n: number): EntradaDeBitacora {
  return {
    fecha: `1${n} de agosto de 2026, 9:00 a. m.`,
    archivo: `pacientes-oncologia-${n}.csv`,
    hashDePolitica: String(n).repeat(64).slice(0, 64),
    tecnicas: ["seudonimizar", "enmascarar"],
    filas: 2_000 + n,
    unicosAntes: 0.31,
    unicosDespues: 0.02,
    esTitular: true,
    huellaDeEntrada: "a".repeat(64),
    huellaDeSalida: "b".repeat(64),
  };
}

function conEntradas(cuantas: number): Bitacora {
  let bitacora = bitacoraVacia();
  for (let i = 1; i <= cuantas; i++)
    bitacora = anadirEntrada(bitacora, entrada(i));
  return bitacora;
}

describe("añadir una entrada no reescribe las anteriores", () => {
  it("la serialización de las N previas es byte-idéntica tras añadir la N+1", () => {
    // El corazón de la fase. «Append lógico» no puede probarse sobre el archivo cifrado —cambia
    // entero cada vez, con su IV nuevo—, así que se prueba donde el significado vive: en claro.
    const tres = conEntradas(3);
    const cuatro = anadirEntrada(tres, entrada(4));

    expect(
      serializarBitacora({ ...cuatro, entradas: cuatro.entradas.slice(0, 3) }),
    ).toBe(serializarBitacora(tres));
    expect(cuatro.entradas).toHaveLength(4);
  });

  it("no muta la bitácora que recibe", () => {
    // Si `anadirEntrada` mutara, el test de arriba pasaría comparando un objeto consigo mismo.
    const tres = conEntradas(3);
    const antes = serializarBitacora(tres);
    anadirEntrada(tres, entrada(99));
    expect(serializarBitacora(tres)).toBe(antes);
    expect(tres.entradas).toHaveLength(3);
  });

  it("conserva el ORDEN de registro, que es lo que la vuelve una bitácora", () => {
    const cinco = conEntradas(5);
    expect(cinco.entradas.map((e) => e.archivo)).toEqual([
      "pacientes-oncologia-1.csv",
      "pacientes-oncologia-2.csv",
      "pacientes-oncologia-3.csv",
      "pacientes-oncologia-4.csv",
      "pacientes-oncologia-5.csv",
    ]);
  });
});

describe("la identidad de la bitácora es estable", () => {
  it("dos serializaciones de la misma bitácora dan exactamente los mismos bytes", () => {
    const a = serializarBitacora(conEntradas(3));
    const b = serializarBitacora(conEntradas(3));
    expect(a).toBe(b);
    expect(huellaDeBitacora(conEntradas(3))).toBe(
      huellaDeBitacora(conEntradas(3)),
    );
  });

  it("una entrada más cambia la huella — si no, no distinguiría nada", () => {
    expect(huellaDeBitacora(conEntradas(3))).not.toBe(
      huellaDeBitacora(conEntradas(4)),
    );
  });
});

describe("el viaje completo: sellar, abrir, leer", () => {
  it("tres entradas sobreviven cifrar y descifrar, en orden", async () => {
    const original = conEntradas(3);
    const bytes = await sellarBitacora(original, FRASE);
    const abierta = await abrirBitacora(bytes, FRASE);

    expect(abierta.ok).toBe(true);
    if (!abierta.ok) return;
    expect(serializarBitacora(abierta.bitacora)).toBe(
      serializarBitacora(original),
    );
    expect(abierta.bitacora.entradas.map((e) => e.archivo)).toEqual(
      original.entradas.map((e) => e.archivo),
    );
  });

  it("la frase incorrecta se rechaza, y no dice en qué te equivocaste", async () => {
    const bytes = await sellarBitacora(conEntradas(2), FRASE);
    const abierta = await abrirBitacora(bytes, "otra frase cualquiera larga");

    expect(abierta.ok).toBe(false);
    if (abierta.ok) return;
    expect(abierta.motivo).toBe("frase-incorrecta");
    // El mensaje nombra la otra causa posible en vez de afirmar la primera.
    expect(abierta.detalle).toMatch(/dañó o lo modificaron/);
  });

  it("dos sellados de la MISMA bitácora dan bytes distintos — y eso es correcto", async () => {
    // AES-GCM exige IV único: reusar el par (llave, IV) rompe el modo por completo. Lo
    // byte-idéntico es el claro, que tiene su test arriba.
    const bitacora = conEntradas(2);
    const a = await sellarBitacora(bitacora, FRASE);
    const b = await sellarBitacora(bitacora, FRASE);
    expect(Array.from(a)).not.toEqual(Array.from(b));
    expect(a.length).toBe(b.length);
  });
});

describe("el archivo en disco no delata nada", () => {
  it("no contiene NI UN nombre de archivo en claro", async () => {
    // La razón de que la bitácora vaya cifrada, comprobada: un nombre como
    // `pacientes-oncologia-1.csv` cuenta de qué va el contenido antes de que nadie lo abra.
    const bytes = await sellarBitacora(conEntradas(3), FRASE);
    const texto = new TextDecoder("latin1").decode(bytes);

    for (const e of conEntradas(3).entradas) {
      expect(texto).not.toContain(e.archivo);
      expect(texto).not.toContain(e.hashDePolitica);
    }
    // Ni las palabras de la estructura: si `"entradas"` apareciera, el JSON estaría en claro.
    expect(texto).not.toContain("entradas");
    expect(texto).not.toContain("seudonimizar");
    expect(texto).not.toContain("oncologia");
  });

  it("empieza por su palabra mágica, que es lo ÚNICO legible", async () => {
    const bytes = await sellarBitacora(conEntradas(1), FRASE);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("VLOG");
  });
});

describe("una bóveda no es una bitácora, y se dice sin descifrar nada", () => {
  it("un .velo en el sitio de la bitácora se rechaza por su palabra mágica", async () => {
    // El error más probable del usuario: dos archivos cifrados de la misma app, guardados el mismo
    // día. Merece un mensaje que diga cuál es cuál, no un «frase incorrecta» que le haría dudar de
    // la frase y probar diez veces.
    const boveda = construirBoveda(
      {
        huellaDeLlave: "a1b2c3d4e5f6",
        salDeLlave: "sal",
        hashDePolitica: "c".repeat(64),
      },
      [
        {
          columna: "cedula",
          originales: ["1032456789"],
          seudonimos: ["19001"],
        },
      ],
    );
    const bytes = await sellarBoveda(boveda, FRASE);
    const abierta = await abrirBitacora(bytes, FRASE);

    expect(abierta.ok).toBe(false);
    if (abierta.ok) return;
    expect(abierta.motivo).toBe("no-es-una-bitacora");
    expect(abierta.detalle).toContain("una bitácora de Velo");
  });

  it("un archivo cualquiera se rechaza igual, y sin gastar tiempo en derivar", async () => {
    const csv = new TextEncoder().encode("cedula,ciudad\n1032456789,Bogota\n");
    const abierta = await abrirBitacora(csv, FRASE);
    expect(abierta.ok).toBe(false);
    if (abierta.ok) return;
    expect(abierta.motivo).toBe("no-es-una-bitacora");
  });
});

describe("leer una bitácora que no cuadra", () => {
  it("un JSON ilegible se dice como tal", () => {
    const leida = deserializarBitacora("{esto no es json");
    expect(leida.ok).toBe(false);
    if (leida.ok) return;
    expect(leida.motivo).toBe("json-invalido");
  });

  it("otra versión se nombra por su número, no por sus campos", () => {
    const leida = deserializarBitacora(
      JSON.stringify({ version: 99, entradas: [] }),
    );
    expect(leida.ok).toBe(false);
    if (leida.ok) return;
    expect(leida.motivo).toBe("version-distinta");
    expect(leida.detalle).toContain("99");
  });

  it("una entrada a la que le falta un campo invalida el archivo entero", () => {
    // A medias no: una bitácora con una entrada rota no se puede presentar como completa.
    const rota = {
      version: VERSION_DE_BITACORA,
      entradas: [{ ...entrada(1), huellaDeSalida: undefined }],
    };
    const leida = deserializarBitacora(JSON.stringify(rota));
    expect(leida.ok).toBe(false);
    if (leida.ok) return;
    expect(leida.motivo).toBe("forma-invalida");
  });

  it("una proporción fuera de 0..1 no pasa: no es un riesgo posible", () => {
    const imposible = {
      version: VERSION_DE_BITACORA,
      entradas: [{ ...entrada(1), unicosAntes: 1.4 }],
    };
    const leida = deserializarBitacora(JSON.stringify(imposible));
    expect(leida.ok).toBe(false);
  });

  it("una bitácora vacía es válida — es como empieza toda bitácora", () => {
    const leida = deserializarBitacora(serializarBitacora(bitacoraVacia()));
    expect(leida.ok).toBe(true);
    if (!leida.ok) return;
    expect(leida.bitacora.entradas).toEqual([]);
  });
});

describe("un archivo que se descifra pero no es una bitácora", () => {
  it("se distingue de la frase incorrecta, porque no es lo mismo", async () => {
    // El caso raro y el más confuso si se contestara mal: la frase era la BUENA —el descifrado
    // funcionó, la etiqueta cuadró— pero dentro no hay una bitácora. Decir «frase incorrecta» aquí
    // mandaría al usuario a probar frases durante media hora. Se sella con la palabra mágica de la
    // bitácora un contenido que no lo es, que es la única forma de llegar a este camino.
    const bytes = await sellarCifrado(
      magiaDe("VLOG"),
      1,
      JSON.stringify({ version: 1, entradas: "esto debería ser una lista" }),
      FRASE,
    );
    const abierta = await abrirBitacora(bytes, FRASE);

    expect(abierta.ok).toBe(false);
    if (abierta.ok) return;
    expect(abierta.motivo).toBe("contenido-invalido");
    expect(abierta.motivo).not.toBe("frase-incorrecta");
  });

  it("un contenido de otra versión conserva su motivo al salir del sobre", async () => {
    const bytes = await sellarCifrado(
      magiaDe("VLOG"),
      1,
      JSON.stringify({ version: 77, entradas: [] }),
      FRASE,
    );
    const abierta = await abrirBitacora(bytes, FRASE);

    expect(abierta.ok).toBe(false);
    if (abierta.ok) return;
    // El sobre es de la v1 y se abrió bien; lo que es de otra versión es el CONTENIDO, y el motivo
    // tiene que sobrevivir a la traducción entre las dos capas.
    expect(abierta.motivo).toBe("version-distinta");
    expect(abierta.detalle).toContain("77");
  });
});

describe("la palabra mágica es una invariante del código, no del usuario", () => {
  it("una magia que no mide cuatro bytes revienta al construirse", () => {
    // No es validación de entrada: ningún usuario llega aquí. Es que un formato con la cabecera
    // corrida no falla al escribirse — falla al abrirse, meses después y sin pista de por qué.
    expect(() => magiaDe("VEL")).toThrow(/4 caracteres/);
    expect(() => magiaDe("VELOZ")).toThrow(/4 caracteres/);
    expect(magiaDe("VLOG")).toHaveLength(4);
  });
});

describe("la extensión", () => {
  it("no es la de la bóveda: el selector de archivos filtra antes de que el usuario se equivoque", () => {
    expect(EXTENSION_DE_BITACORA).toBe(".velolog");
    expect(EXTENSION_DE_BITACORA).not.toBe(".velo");
  });
});
