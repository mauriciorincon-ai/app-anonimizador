// La regla de exposición de la vista previa — nacida de dos hallazgos de la auditoría del S2.
//
// Estas pruebas no existían porque la función vivía dentro del worker, donde ninguna la alcanzaba.
// Ahí se le coló A3: decidía **por columna** lo que es una regla **del valor**, y las filas que una
// generalización deja intactas salían a la pantalla con el dato crudo completo.

import { describe, expect, it } from "vitest";

import { ConstructorColumnar, type TablaColumnar } from "@/engine/columnar";
import { columnaCambio, muestraDeColumna } from "@/engine/muestra";
import type { Politica } from "@/engine/politica";
import { aplicarPolitica } from "@/engine/tecnicas";

function tablaDe(encabezado: string[], filas: string[][]): TablaColumnar {
  const constructor = new ConstructorColumnar(encabezado, filas.length);
  for (const fila of filas) constructor.agregarFila(fila);
  return constructor.finalizar();
}

function columna(tabla: TablaColumnar, nombre: string) {
  return tabla.columnas.find((c) => c.nombre === nombre)!;
}

function politicaDe(tecnica: Politica["reglas"][number]["tecnica"]): Politica {
  return {
    version: 1,
    origen: "manual",
    kObjetivo: null,
    reglas: [{ columna: "ciudad", tecnica }],
  };
}

/**
 * El fixture de A3: un prefijo de 2 caracteres **no toca** los valores que ya miden 2. En la misma
 * columna conviven filas cambiadas y filas intactas, que es la situación que el código anterior no
 * sabía distinguir.
 */
const CIUDADES = [["Bogota"], ["CA"], ["Medellin"], ["NY"], ["Cali"], ["QX"]];

describe("A3 — el «después» se decide por valor, no por columna", () => {
  it("una fila que no cambió sale ENMASCARADA aunque la columna sí cambiara", async () => {
    // Este es el defecto exacto: `Bogota → Bo` cambió, así que la columna «cambió», y con la regla
    // vieja las tres filas intactas (CA, NY, QX) se imprimían completas — el dato crudo del
    // usuario, en pantalla, por culpa de una fila vecina.
    const tabla = tablaDe(["ciudad"], CIUDADES);
    const politica = politicaDe({ tipo: "generalizar-prefijo", caracteres: 2 });
    const nueva = await aplicarPolitica(tabla, politica, null);

    const muestra = muestraDeColumna(
      columna(tabla, "ciudad"),
      columna(nueva.tabla, "ciudad"),
      politica,
      "cuasi-identificador",
      tabla.filas,
    );

    const despues = muestra.filas.map((f) => f.despues);

    // Las que cambiaron salen completas: un prefijo ya no es el dato de nadie.
    expect(despues).toContain("Bo");
    expect(despues).toContain("Me");
    expect(despues).toContain("Ca");

    // Las que NO cambiaron salen enmascaradas: siguen siendo el valor original. El contraste está
    // en el par `Cali → Ca` (derivado, se enseña) contra `CA → ***` (original, se tapa) — dos
    // cadenas casi idénticas en pantalla y en lados opuestos de la regla.
    for (const crudo of ["CA", "NY", "QX"])
      expect(despues).not.toContain(crudo);
    for (const fila of muestra.filas) {
      if (!["Bo", "Me", "Ca"].includes(fila.despues)) {
        expect(fila.despues).toBe(fila.antes);
      }
    }
  });

  it("cuando NADA cambió, todo va enmascarado y la columna se marca como tal", async () => {
    const tabla = tablaDe(["ciudad"], CIUDADES);
    const politica = politicaDe({ tipo: "conservar" });
    const nueva = await aplicarPolitica(tabla, politica, null);

    const muestra = muestraDeColumna(
      columna(tabla, "ciudad"),
      columna(nueva.tabla, "ciudad"),
      politica,
      "cuasi-identificador",
      tabla.filas,
    );

    expect(muestra.despuesEnmascarado).toBe(true);
    for (const fila of muestra.filas) expect(fila.despues).toBe(fila.antes);
  });

  it("una columna suprimida no enseña ni el antes", async () => {
    const tabla = tablaDe(["ciudad"], CIUDADES);
    const politica = politicaDe({ tipo: "suprimir" });

    const muestra = muestraDeColumna(
      columna(tabla, "ciudad"),
      undefined,
      politica,
      "cuasi-identificador",
      tabla.filas,
    );

    expect(muestra).toMatchObject({ suprimida: true, filas: [] });
  });
});

describe("M1 — el cambio se mide sobre el archivo, no sobre las 6 filas de la muestra", () => {
  it("detecta un cambio que ocurre FUERA de las filas que se enseñan", async () => {
    // 500 filas, y solo la número 300 tiene un valor que el prefijo recorta. La muestra enseña 6
    // filas repartidas; con la regla vieja —que miraba solo esas 6— la columna se declaraba
    // intacta y el «N de M columnas cambian» de la pantalla contaba una columna de menos.
    const filas = Array.from({ length: 500 }, (_, i) => [
      i === 300 ? "Villavicencio" : "XY",
    ]);
    const tabla = tablaDe(["ciudad"], filas);
    const politica = politicaDe({ tipo: "generalizar-prefijo", caracteres: 2 });
    const nueva = await aplicarPolitica(tabla, politica, null);

    expect(
      columnaCambio(columna(tabla, "ciudad"), columna(nueva.tabla, "ciudad")),
    ).toBe(true);
  });

  it("y una columna sensible que cambió fuera de la muestra deja de esconderse", async () => {
    // La consecuencia grave de lo anterior: con la regla vieja, una columna del artículo 5 que sí
    // se trató se marcaba `omitida` —«dato sensible sin cambios»— y el usuario no veía la prueba
    // de que su columna más delicada había cambiado.
    const filas = Array.from({ length: 500 }, (_, i) => [
      i === 300 ? "Hipertension arterial" : "AB",
    ]);
    const tabla = tablaDe(["ciudad"], filas);
    const politica = politicaDe({ tipo: "generalizar-prefijo", caracteres: 2 });
    const nueva = await aplicarPolitica(tabla, politica, null);

    const muestra = muestraDeColumna(
      columna(tabla, "ciudad"),
      columna(nueva.tabla, "ciudad"),
      politica,
      "dato-sensible",
      tabla.filas,
    );

    expect(muestra.omitida).toBe(false);
    expect(muestra.despuesEnmascarado).toBe(false);
  });

  it("una columna sensible intacta sigue sin enseñarse", async () => {
    const tabla = tablaDe(["ciudad"], CIUDADES);
    const politica = politicaDe({ tipo: "conservar" });
    const nueva = await aplicarPolitica(tabla, politica, null);

    const muestra = muestraDeColumna(
      columna(tabla, "ciudad"),
      columna(nueva.tabla, "ciudad"),
      politica,
      "dato-sensible",
      tabla.filas,
    );

    expect(muestra).toMatchObject({ omitida: true, filas: [] });
  });
});
