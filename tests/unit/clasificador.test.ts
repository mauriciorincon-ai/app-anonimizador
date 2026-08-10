// Tests del clasificador.
//
// El oráculo NO lo escribe este archivo: lo declara el generador del kit de prueba, columna por
// columna (`esperadoPorColumna`). Así el test no puede acomodarse al comportamiento del motor —
// si el motor cambia y deja de coincidir con lo que el kit dice que debería detectar, falla.

import { describe, expect, it } from "vitest";

import {
  esperadoPorColumna,
  generarFilas,
} from "../../docs/kit-de-prueba/generador.mjs";
import {
  ConstructorColumnar,
  type TablaColumnar,
} from "../../src/engine/columnar";
import {
  clasificar,
  cuasiIdentificadores,
  type HallazgoDeColumna,
} from "../../src/engine/clasificador";

const OPCIONES = {
  filas: 3_000,
  seed: 42,
  perfil: "clinico",
  tasaInvalida: 0.08,
  tasaVacia: 0.03,
} as const;

function construirDesdeElKit(
  opciones: Record<string, unknown> = {},
): TablaColumnar {
  const filas = [...generarFilas({ ...OPCIONES, ...opciones })];
  const [encabezado, ...datos] = filas;
  const constructor = new ConstructorColumnar(encabezado, datos.length);
  for (const fila of datos) constructor.agregarFila(fila);
  return constructor.finalizar();
}

const diagnostico = clasificar(construirDesdeElKit());
const porNombre = new Map(diagnostico.columnas.map((c) => [c.nombre, c]));

function columna(nombre: string): HallazgoDeColumna {
  const hallazgo = porNombre.get(nombre);
  if (!hallazgo) throw new Error(`el kit no generó la columna ${nombre}`);
  return hallazgo;
}

describe("clasificar — contra el oráculo del kit de prueba", () => {
  const oraculo = esperadoPorColumna("clinico");

  for (const [nombre, esperado] of Object.entries(oraculo)) {
    it(`${nombre} → ${esperado.tipo} · ${esperado.categoria}`, () => {
      const hallazgo = columna(nombre);
      expect(hallazgo.tipo).toBe(esperado.tipo);
      expect(hallazgo.categoria).toBe(esperado.categoria);
    });
  }

  it("diagnostica las 24 columnas del perfil clínico", () => {
    expect(diagnostico.columnas).toHaveLength(24);
    expect(diagnostico.filas).toBe(3_000);
  });
});

describe("el POR QUÉ de cada detección", () => {
  it("cita la fuente oficial cuando el algoritmo confirma", () => {
    const nit = columna("nit_empresa");
    expect(nit.certeza).toBe("algoritmo-oficial");
    const evidencia = nit.evidencia[0];
    expect(evidencia.origen).toBe("validador");
    if (evidencia.origen !== "validador")
      throw new Error("evidencia inesperada");
    expect(evidencia.fuente).toMatch(/DIAN/);
    expect(evidencia.aciertos).toBeGreaterThan(0);
    expect(evidencia.aciertos).toBeLessThanOrEqual(evidencia.muestreados);
  });

  it("distingue lo confirmado por algoritmo de lo reconocido por forma", () => {
    // La diferencia que sostiene toda la promesa del producto: con el NIT Velo AFIRMA (hay
    // checksum); con la cédula RECONOCE una forma (no hay checksum público). La UI necesita
    // poder decirlo distinto, así que el motor tiene que distinguirlo.
    expect(columna("nit_empresa").certeza).toBe("algoritmo-oficial");
    expect(columna("cuenta_iban").certeza).toBe("algoritmo-oficial");
    expect(columna("tarjeta_pago").certeza).toBe("algoritmo-oficial");
    expect(columna("cedula_titular").certeza).toBe("estructural");
    expect(columna("celular").certeza).toBe("estructural");
  });

  it("marca los datos sensibles SIN afirmar que los confirmó", () => {
    // Ningún algoritmo puede mirar "J45.9" y concluir que es salud. Solo el encabezado lo sugiere.
    // Velo lo marca —callarlo sería peor— pero con la certeza en "sin-confirmar" y la evidencia
    // diciendo que fue el nombre de la columna, no el dato.
    for (const nombre of ["diagnostico", "aseguradora", "grupo_etnico"]) {
      const hallazgo = columna(nombre);
      expect(hallazgo.categoria).toBe("dato-sensible");
      expect(hallazgo.certeza).toBe("sin-confirmar");
      const porNombreDeColumna = hallazgo.evidencia.find(
        (e) => e.origen === "nombre-de-columna",
      );
      expect(porNombreDeColumna).toBeDefined();
      expect(
        porNombreDeColumna?.origen === "nombre-de-columna" &&
          porNombreDeColumna.nota,
      ).toMatch(/art\. 5/);
    }
  });

  it("el encabezado sube la categoría pero no cambia el tipo detectado", () => {
    // Los valores dicen "esto es una fecha"; el encabezado dice "es de nacimiento". Lo primero es
    // el tipo, lo segundo la categoría — y la evidencia lleva las dos señales.
    const nacimiento = columna("fecha_nacimiento");
    expect(nacimiento.tipo).toBe("fecha");
    expect(nacimiento.categoria).toBe("cuasi-identificador");
    expect(nacimiento.evidencia).toHaveLength(2);
    expect(nacimiento.evidencia[0].origen).toBe("validador");
    expect(nacimiento.evidencia[1].origen).toBe("nombre-de-columna");

    // La misma forma con otro encabezado NO sube: una fecha de atención no delata a nadie.
    expect(columna("fecha_atencion").tipo).toBe("fecha");
    expect(columna("fecha_atencion").categoria).toBe("no-personal");
  });

  it("el encabezado nunca BAJA la categoría", () => {
    // Si los valores confirman un NIT, que la columna se llamara "codigo" no lo volvería inocuo.
    const tabla = new ConstructorColumnar(["codigo_generico"], 4);
    // NITs sintéticos con su DV recomputado (811002345: 8×41+1×37+1×29+2×17+3×13+4×7+5×3 = 510;
    // 510 mod 11 = 4 → DV = 11 − 4 = 7).
    for (const valor of [
      "900123456-8",
      "811002345-7",
      "830112233-1",
      "901555777-4",
    ]) {
      tabla.agregarFila([valor]);
    }
    const hallazgo = clasificar(tabla.finalizar()).columnas[0];
    expect(hallazgo.tipo).toBe("nit");
    expect(hallazgo.categoria).toBe("identificador-directo");
  });
});

describe("las columnas-trampa del kit", () => {
  it("NO marca como tarjeta una referencia de recaudo que pasa Luhn", () => {
    // Trampa vencida por una regla oficial, no por una heurística: el MII 9 de ISO/IEC 7812-1
    // está reservado a asignación nacional y ninguna tarjeta de pago empieza por ahí.
    const referencia = columna("referencia_pago");
    expect(referencia.tipo).toBe("numero");
    expect(referencia.categoria).toBe("no-personal");
  });

  it("NO marca como cédula una columna de montos", () => {
    // Un monto de 6–7 dígitos tiene exactamente la forma de una cédula histórica. Sin checksum
    // público, la única señal disponible es el encabezado — y `monto` no lo respalda.
    const monto = columna("monto");
    expect(monto.tipo).toBe("numero");
    expect(monto.categoria).toBe("no-personal");
  });

  it("SÍ marca como cédula un consecutivo interno de 10 dígitos — y es un límite, no un error", () => {
    // La trampa que NO se puede vencer: la cédula colombiana no tiene dígito de verificación
    // público, así que un consecutivo en el rango del NUIP es indistinguible de una cédula para
    // cualquier motor determinista. Este test fija el falso positivo por escrito en vez de
    // esconderlo: lo que Velo debe garantizar es que la certeza diga "estructural" para que el
    // usuario sepa que ahí hay algo que revisar.
    const codigo = columna("codigo_interno");
    expect(codigo.tipo).toBe("cedula");
    expect(codigo.certeza).toBe("estructural");
  });
});

describe("muestras enmascaradas", () => {
  it("enseña un ejemplo enmascarado, nunca el valor completo", () => {
    const cedula = columna("cedula_titular");
    expect(cedula.muestra?.omitida).toBe(false);
    expect(cedula.muestra?.texto).toMatch(/^.{3}\*\*\*.{2}$/);
  });

  it("NO enseña muestra de las columnas sensibles", () => {
    // Con tres valores posibles, ninguna máscara esconde nada: "I******a" es "Indígena".
    for (const nombre of ["diagnostico", "grupo_etnico", "aseguradora"]) {
      expect(columna(nombre).muestra?.omitida).toBe(true);
      expect(columna(nombre).muestra?.texto).toBe("");
    }
  });
});

describe("resumen y cuasi-identificadores", () => {
  it("cuenta cada columna en una sola categoría", () => {
    const total = Object.values(diagnostico.resumen).reduce((a, b) => a + b, 0);
    expect(total).toBe(diagnostico.columnas.length);
  });

  it("entrega al motor de riesgo la lista de cuasi-identificadores", () => {
    const qis = cuasiIdentificadores(diagnostico);
    expect(qis).toEqual(
      expect.arrayContaining([
        "ip_registro",
        "fecha_nacimiento",
        "sexo",
        "municipio",
        "estrato",
        "latitud",
        "longitud",
      ]),
    );
    expect(qis).not.toContain("cedula_titular"); // es identificador directo, no cuasi
    expect(qis).not.toContain("monto");
  });
});

describe("casos de borde", () => {
  it("no se cae con una columna completamente vacía", () => {
    const constructor = new ConstructorColumnar(["vacia"], 3);
    for (let i = 0; i < 3; i++) constructor.agregarFila([""]);
    const hallazgo = clasificar(constructor.finalizar()).columnas[0];

    expect(hallazgo.tipo).toBe("texto");
    expect(hallazgo.filasNoVacias).toBe(0);
    expect(hallazgo.muestra).toBeNull();
    expect(hallazgo.evidencia).toEqual([]);
  });

  it("no se cae con una tabla sin filas", () => {
    const diagnosticoVacio = clasificar(
      new ConstructorColumnar(["a", "b"], 0).finalizar(),
    );
    expect(diagnosticoVacio.filas).toBe(0);
    expect(diagnosticoVacio.columnas).toHaveLength(2);
  });

  it("no adjudica la columna cuando ningún validador llega al umbral", () => {
    // Mitad correos, mitad basura: ni "email" ni nada más alcanza el 85%.
    const constructor = new ConstructorColumnar(["mezcla"], 10);
    for (let i = 0; i < 5; i++)
      constructor.agregarFila([`persona${i}@ejemplo.com`]);
    for (let i = 0; i < 5; i++) constructor.agregarFila([`?!${i}?!`]);
    const hallazgo = clasificar(constructor.finalizar()).columnas[0];

    expect(hallazgo.tipo).toBe("texto");
    expect(hallazgo.categoria).toBe("no-personal");
  });

  it("el perfil limpio no reporta un solo dato personal", () => {
    // El estado "archivo limpio" de la interfaz tiene que ser alcanzable de verdad.
    const limpio = clasificar(
      construirDesdeElKit({ perfil: "limpio", filas: 500 }),
    );
    expect(limpio.resumen["identificador-directo"]).toBe(0);
    expect(limpio.resumen["dato-sensible"]).toBe(0);
  });
});
