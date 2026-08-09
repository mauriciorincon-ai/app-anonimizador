// GATE DE DETERMINISMO — regla dura nº3 del producto, en forma de test.
//
// Velo promete que el mismo archivo produce el mismo diagnóstico, byte por byte. No es una
// aspiración de calidad: es la razón por la que un certificado de Velo significa algo y por la que
// el producto puede prescindir de IA. Este archivo es el gate que lo hace cumplir en cada PR.
//
// Verifica tres cosas distintas, porque el determinismo se rompe por tres caminos distintos:
//   1. Correr dos veces sobre el mismo input.
//   2. Llegar al mismo input por otro camino (los chunks de un CSV en streaming no caen siempre
//      en la misma frontera).
//   3. Que no se cuele en el motor una fuente de no-determinismo (Math.random, la hora del reloj).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { generarFilas } from "../../docs/kit-de-prueba/generador.mjs";
import { clasificar } from "../../src/engine/clasificador";
import {
  ConstructorColumnar,
  type TablaColumnar,
} from "../../src/engine/columnar";
import { evaluarRiesgo } from "../../src/engine/riesgo";
import { serializarCanonico } from "../../src/engine/serializacion";

const OPCIONES = {
  filas: 2_000,
  seed: 42,
  perfil: "clinico",
  tasaInvalida: 0.08,
  tasaVacia: 0.03,
} as const;

/** Construye la tabla alimentando el constructor en bloques del tamaño dado. */
function construirPorBloques(tamanoDeBloque: number): TablaColumnar {
  const filas = [...generarFilas(OPCIONES)];
  const [encabezado, ...datos] = filas;
  const constructor = new ConstructorColumnar(encabezado, tamanoDeBloque);
  for (let i = 0; i < datos.length; i += tamanoDeBloque) {
    for (const fila of datos.slice(i, i + tamanoDeBloque))
      constructor.agregarFila(fila);
  }
  return constructor.finalizar();
}

describe("el diagnóstico es byte-idéntico entre corridas", () => {
  it("dos corridas sobre el mismo archivo dan la MISMA salida serializada", () => {
    const primera = serializarCanonico(clasificar(construirPorBloques(500)));
    const segunda = serializarCanonico(clasificar(construirPorBloques(500)));

    expect(segunda).toBe(primera);
    expect(primera.length).toBeGreaterThan(1_000); // que no esté comparando dos vacíos
  });

  it("el diagnóstico COMPLETO —detección y riesgo— es byte-idéntico", () => {
    // El gate tiene que cubrir todo lo que el usuario ve, no solo la clasificación: el riesgo y
    // el ranking del advisor son igual de sensibles a un desempate mal fijado, y un ranking que
    // cambie de orden entre corridas rompe la promesa igual que un tipo mal detectado.
    const completo = (bloque: number) => {
      const tabla = construirPorBloques(bloque);
      const diagnostico = clasificar(tabla);
      return serializarCanonico({
        diagnostico,
        ...evaluarRiesgo(tabla, diagnostico),
      });
    };

    expect(completo(311)).toBe(completo(311));
    expect(completo(1_999)).toBe(completo(311));
  });

  it("el tamaño de los chunks del parser NO cambia el resultado", () => {
    // PapaParse corta el archivo por bytes, no por filas: la frontera de chunk depende del tamaño
    // del archivo y del navegador. Si el diagnóstico dependiera de dónde cae el corte, dos
    // computadores darían resultados distintos sobre el mismo CSV.
    const bloquePequeno = serializarCanonico(
      clasificar(construirPorBloques(7)),
    );
    const bloqueGrande = serializarCanonico(
      clasificar(construirPorBloques(1_999)),
    );
    const bloqueUnico = serializarCanonico(
      clasificar(construirPorBloques(100_000)),
    );

    expect(bloqueGrande).toBe(bloquePequeno);
    expect(bloqueUnico).toBe(bloquePequeno);
  });

  it("la tabla columnar en sí es idéntica, no solo el diagnóstico", () => {
    // El diagnóstico podría coincidir por casualidad aunque los códigos internos difirieran.
    // Comparar la tabla cierra esa puerta.
    const a = construirPorBloques(13);
    const b = construirPorBloques(997);

    expect(serializarCanonico(b.columnas)).toBe(serializarCanonico(a.columnas));
  });

  it("una semilla distinta SÍ cambia la salida — el gate no está comparando constantes", () => {
    // Un test de determinismo que pasa siempre no prueba nada. Este verifica que el instrumento
    // de verdad distingue.
    const conSemilla42 = serializarCanonico(
      clasificar(construirPorBloques(500)),
    );
    const filas = [...generarFilas({ ...OPCIONES, seed: 7 })];
    const [encabezado, ...datos] = filas;
    const constructor = new ConstructorColumnar(encabezado, datos.length);
    for (const fila of datos) constructor.agregarFila(fila);
    const conSemilla7 = serializarCanonico(clasificar(constructor.finalizar()));

    expect(conSemilla7).not.toBe(conSemilla42);
  });
});

describe("el motor no contiene fuentes de no-determinismo", () => {
  const RAIZ_DEL_MOTOR = join(process.cwd(), "src", "engine");

  function archivosDelMotor(directorio: string): string[] {
    return readdirSync(directorio).flatMap((entrada) => {
      const ruta = join(directorio, entrada);
      if (statSync(ruta).isDirectory()) return archivosDelMotor(ruta);
      return ruta.endsWith(".ts") ? [ruta] : [];
    });
  }

  const archivos = archivosDelMotor(RAIZ_DEL_MOTOR);

  it("encuentra el motor donde debe estar", () => {
    expect(archivos.length).toBeGreaterThan(5);
  });

  for (const ruta of archivos) {
    const relativa = ruta.slice(process.cwd().length + 1);

    it(`${relativa} — sin azar ni reloj`, () => {
      // Un `Math.random()` o un `new Date()` dentro del motor rompe la promesa central sin que
      // ningún test de comportamiento lo note: el resultado sigue siendo plausible, solo deja de
      // ser reproducible. Por eso el gate mira el código fuente, no solo la salida.
      const codigo = readFileSync(ruta, "utf8");
      const sinComentarios = codigo
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

      expect(sinComentarios).not.toMatch(/Math\.random/);
      expect(sinComentarios).not.toMatch(/Date\.now/);
      expect(sinComentarios).not.toMatch(/new Date\(\s*\)/);
      expect(sinComentarios).not.toMatch(/crypto\.getRandomValues/);
      // `localeCompare` ordena según el idioma del sistema: la misma lista sale en distinto orden
      // en dos máquinas. Donde haga falta comparar texto, se compara por punto de código.
      expect(sinComentarios).not.toMatch(/localeCompare/);
    });
  }
});
