// GATE DE DETERMINISMO, EXTENDIDO A LAS TRANSFORMACIONES CON LLAVE (regla dura nº3, S2).
//
// El gate del S1 verificaba el diagnóstico: mismo archivo ⇒ mismo informe. Este sprint añade algo
// que el S1 no tenía: una **llave**. Y con ella, la promesa se vuelve doble y hay que probar las
// dos direcciones, porque cada una atrapa un defecto que la otra deja pasar:
//
//   · **misma llave ⇒ archivo byte-idéntico.** Atrapa el azar sin semilla, el orden de iteración
//     que cambia, el `Date.now()` colado.
//   · **llave distinta ⇒ archivo distinto.** Atrapa lo contrario, que es peor porque no se ve: un
//     HMAC mal cableado que ignorara la llave, o que devolviera una constante, pasaría la primera
//     dirección con nota perfecta y dejaría a todos los usuarios con los mismos seudónimos.

import { beforeAll, describe, expect, it } from "vitest";

import { generarFilas } from "../../docs/kit-de-prueba/generador.mjs";
import { ConstructorColumnar, type TablaColumnar } from "@/engine/columnar";
import { serializarCsv } from "@/engine/csv";
import { hashDePolitica, type Politica } from "@/engine/politica";
import { aplicarPolitica } from "@/engine/tecnicas";
import { sha256 } from "@/lib/sha256";

const OPCIONES = {
  filas: 1_500,
  seed: 42,
  perfil: "clinico",
  tasaInvalida: 0.08,
  tasaVacia: 0.03,
} as const;

/** Construye la tabla alimentando el constructor en bloques del tamaño dado (como el parser). */
function tablaPorBloques(tamano: number): TablaColumnar {
  const [encabezado, ...datos] = [...generarFilas(OPCIONES)];
  const constructor = new ConstructorColumnar(encabezado, tamano);
  for (let i = 0; i < datos.length; i += tamano) {
    for (const fila of datos.slice(i, i + tamano))
      constructor.agregarFila(fila);
  }
  return constructor.finalizar();
}

const POLITICA: Politica = {
  version: 1,
  origen: "manual",
  kObjetivo: null,
  reglas: [
    {
      columna: "cedula_titular",
      tecnica: { tipo: "seudonimizar-con-formato", formato: "cedula" },
    },
    {
      columna: "nit_empresa",
      tecnica: { tipo: "seudonimizar-con-formato", formato: "nit" },
    },
    { columna: "correo", tecnica: { tipo: "seudonimizar", longitud: 16 } },
    { columna: "celular", tecnica: { tipo: "enmascarar" } },
    {
      columna: "fecha_nacimiento",
      tecnica: { tipo: "generalizar-fecha", precision: "anio" },
    },
    { columna: "nombre_completo", tecnica: { tipo: "suprimir" } },
  ],
};

async function llaveDe(semilla: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(semilla.padEnd(32, ".")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/** El archivo de salida, tal cual se descarga, resumido con SHA-256. */
async function huellaDelArchivo(
  tabla: TablaColumnar,
  llave: CryptoKey,
): Promise<string> {
  const { tabla: transformada } = await aplicarPolitica(tabla, POLITICA, llave);
  return sha256(new TextEncoder().encode(serializarCsv(transformada)));
}

let llaveA: CryptoKey;
let llaveB: CryptoKey;
beforeAll(async () => {
  llaveA = await llaveDe("llave-del-proyecto-a");
  llaveB = await llaveDe("llave-del-proyecto-b");
});

describe("misma tabla + misma política + misma llave ⇒ archivo byte-idéntico", () => {
  it("dos corridas dan el mismo SHA-256", async () => {
    const primera = await huellaDelArchivo(tablaPorBloques(500), llaveA);
    const segunda = await huellaDelArchivo(tablaPorBloques(500), llaveA);
    expect(segunda).toBe(primera);
    expect(primera).toMatch(/^[0-9a-f]{64}$/);
  });

  it("el tamaño de los trozos del parser no cambia el archivo de salida", async () => {
    // PapaParse corta por bytes, no por filas: la frontera depende del archivo y del navegador. Si
    // el resultado dependiera de dónde cae el corte, dos computadores producirían archivos
    // distintos a partir del mismo CSV.
    const conTrozosChicos = await huellaDelArchivo(tablaPorBloques(7), llaveA);
    const conTrozoUnico = await huellaDelArchivo(
      tablaPorBloques(100_000),
      llaveA,
    );
    expect(conTrozoUnico).toBe(conTrozosChicos);
  });
});

describe("llave distinta ⇒ archivo distinto", () => {
  it("la otra dirección, que es la que atrapa un HMAC mal cableado", async () => {
    const tabla = tablaPorBloques(500);
    expect(await huellaDelArchivo(tabla, llaveB)).not.toBe(
      await huellaDelArchivo(tabla, llaveA),
    );
  });

  it("y CADA columna seudonimizada cambió, no solo el archivo en conjunto", async () => {
    // Un archivo distinto podría deberse a una sola columna. La promesa es más fuerte: toda
    // columna que dependa de la llave tiene que cambiar con ella.
    const tabla = tablaPorBloques(500);
    const conA = await aplicarPolitica(tabla, POLITICA, llaveA);
    const conB = await aplicarPolitica(tabla, POLITICA, llaveB);

    for (const nombre of ["cedula_titular", "nit_empresa", "correo"]) {
      const a = conA.tabla.columnas.find((c) => c.nombre === nombre)!;
      const b = conB.tabla.columnas.find((c) => c.nombre === nombre)!;
      expect(b.valores.slice(1), nombre).not.toEqual(a.valores.slice(1));
    }
  });

  it("lo que NO depende de la llave se queda igual con las dos", async () => {
    // El complemento del test anterior: si `celular` (enmascarado) o `fecha_nacimiento`
    // (generalizada) cambiaran con la llave, algo estaría leyendo la llave donde no debe.
    const tabla = tablaPorBloques(500);
    const conA = await aplicarPolitica(tabla, POLITICA, llaveA);
    const conB = await aplicarPolitica(tabla, POLITICA, llaveB);

    for (const nombre of ["celular", "fecha_nacimiento", "municipio"]) {
      const a = conA.tabla.columnas.find((c) => c.nombre === nombre)!;
      const b = conB.tabla.columnas.find((c) => c.nombre === nombre)!;
      expect(b.valores, nombre).toEqual(a.valores);
    }
  });
});

describe("el gate no está comparando constantes", () => {
  it("otra política sobre la misma tabla da otro archivo", async () => {
    const tabla = tablaPorBloques(500);
    const otra: Politica = {
      ...POLITICA,
      reglas: [
        ...POLITICA.reglas.filter((r) => r.columna !== "fecha_nacimiento"),
        {
          columna: "fecha_nacimiento",
          tecnica: { tipo: "generalizar-fecha", precision: "mes" },
        },
      ],
    };
    expect(hashDePolitica(otra)).not.toBe(hashDePolitica(POLITICA));

    const { tabla: conOtra } = await aplicarPolitica(tabla, otra, llaveA);
    const huellaOtra = sha256(new TextEncoder().encode(serializarCsv(conOtra)));
    expect(huellaOtra).not.toBe(await huellaDelArchivo(tabla, llaveA));
  });

  it("el archivo de salida ya no lleva la columna suprimida, en ninguna parte", async () => {
    const { tabla: transformada } = await aplicarPolitica(
      tablaPorBloques(500),
      POLITICA,
      llaveA,
    );
    const csv = serializarCsv(transformada);
    expect(csv).not.toContain("nombre_completo");
  });
});
