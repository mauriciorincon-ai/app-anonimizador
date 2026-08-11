// El reporte es el único artefacto de Velo que sale del navegador — a un correo, a un ticket, a
// la carpeta de alguien más. Así que se prueba con esa desconfianza: que no llame a ningún
// servidor al abrirse, que no lleve una sola fila del archivo, y que no se pueda convertir en un
// script porque alguien nombró así una columna.

import { describe, expect, it } from "vitest";

import { generarFilas } from "../../docs/kit-de-prueba/generador.mjs";
import { clasificar } from "@/engine/clasificador";
import { ConstructorColumnar } from "@/engine/columnar";
import {
  construirReporte,
  escapar,
  nombreDelReporte,
  seccionDelTratamiento,
  type DatosDelReporte,
} from "@/engine/reporte";
import { evaluarRiesgo } from "@/engine/riesgo";
import { balanceDelTratamiento } from "@/engine/balance";
import { hashDePolitica, type Politica } from "@/engine/politica";
import { aplicarPolitica } from "@/engine/tecnicas";
import { medirUtilidad } from "@/engine/utilidad";

const FECHA = "9 de agosto de 2026, 7:42 p. m.";

function datosDe(perfil: string, filas = 400): DatosDelReporte {
  const todas = [
    ...generarFilas({
      filas,
      seed: 42,
      perfil,
      tasaInvalida: 0.08,
      tasaVacia: 0.03,
    }),
  ];
  const [encabezado, ...cuerpo] = todas;
  const constructor = new ConstructorColumnar(encabezado, filas);
  for (const fila of cuerpo) constructor.agregarFila(fila);
  const tabla = constructor.finalizar();
  const diagnostico = clasificar(tabla);
  const { riesgo, advisor } = evaluarRiesgo(tabla, diagnostico);

  return {
    archivo: {
      nombre: `${perfil}.csv`,
      bytes: 815_899,
      sha256:
        "50ad22651a462bb3d5ebf08f1adf34486799384aef4688c7724d5a934f988f1c",
    },
    diagnostico,
    riesgo,
    advisor,
    fecha: FECHA,
  };
}

describe("el reporte se abre solo, sin internet", () => {
  const html = construirReporte(datosDe("clinico"));

  it("no pide un solo recurso externo", () => {
    // Un `<link>` a un CDN convertiría un documento que promete que nada salió del navegador en
    // uno que le avisa a un servidor cada vez que alguien lo abre — y delata a quién y cuándo.
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/@import/i);
    expect(html).not.toMatch(/\burl\(/i);
    expect(html).not.toMatch(/<img\b/i);
    expect(html).not.toMatch(/<iframe\b/i);
  });

  it("es un documento HTML completo, no un fragmento", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<html lang="es-CO">');
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
  });
});

describe("lleva el diagnóstico, no los datos", () => {
  const datos = datosDe("clinico");
  const html = construirReporte(datos);

  it("ata el reporte a UN archivo con su SHA-256 y dice cómo comprobarlo", () => {
    expect(html).toContain(datos.archivo.sha256);
    expect(html).toMatch(/sha256sum/);
    expect(html).toMatch(/shasum -a 256/);
  });

  it("trae la fecha que se le inyectó", () => {
    expect(html).toContain(FECHA);
  });

  it("lleva las cifras exactas con su denominador", () => {
    expect(html).toContain("Cuánta gente queda sola");
    expect(html).toMatch(
      new RegExp(`${datos.riesgo.unicos.toLocaleString("es-CO")} de`),
    );
    expect(html).toMatch(/no estimadas/);
  });

  it("nombra cada columna con su categoría y su certeza", () => {
    for (const columna of datos.diagnostico.columnas) {
      expect(html).toContain(columna.nombre);
    }
    expect(html).toContain("Confirmado por el algoritmo oficial");
    expect(html).toContain("Dato sensible · Ley 1581 art. 5");
  });

  it("las muestras van enmascaradas y las sensibles ni eso", () => {
    // Ninguna muestra del reporte puede ser un valor completo: todas pasan por la máscara.
    const muestras = [...html.matchAll(/<code>([^<]*\*\*\*[^<]*)<\/code>/g)];
    expect(muestras.length).toBeGreaterThan(3);
    expect(html).toContain("sin muestra");
    expect(html).toMatch(/no lleva ninguna fila del archivo/i);
  });

  it("declara el alcance del advisor en vez de dejarlo en silencio", () => {
    expect(html).toMatch(/no es el universo entero de cruces posibles/);
    expect(html).toMatch(/Quedaron fuera:/);
  });

  it("dice que la cifra de riesgo no cuenta a quienes identifican solos", () => {
    // Quien reciba este documento lo lee fuera de contexto. La cifra se calcula solo sobre
    // cuasi-identificadores, y un porcentaje bajo junto a una columna de cédulas se lee como
    // tranquilidad si nadie dice a quién dejó fuera la cuenta.
    expect(datos.diagnostico.resumen["identificador-directo"]).toBeGreaterThan(
      0,
    );
    expect(html).toMatch(/no cuenta/);
    expect(html).toMatch(/sin ayuda de ninguna otra/);
  });

  it("no promete lo que Velo no puede cumplir", () => {
    expect(html).not.toMatch(/anonimato garantizad/i);
    expect(html).not.toMatch(/100\s*%?\s*segur/i);
    expect(html).not.toMatch(/imposible de reidentificar/i);
    expect(html).toMatch(/no lo elimina y\s*no declara el archivo anónimo/);
  });
});

describe("archivo sin cuasi-identificadores", () => {
  const datos = datosDe("sin-personales", 300);
  const html = construirReporte({
    ...datos,
    archivo: { ...datos.archivo, bytes: 32_624 },
  });

  it("no finge un riesgo que no se puede medir", () => {
    expect(datos.riesgo.qis).toHaveLength(0);
    expect(html).toContain("No hay ningún cruce que medir");
    expect(html).not.toContain("Cuánta gente queda sola");
  });

  it("y aun así aclara que eso no lo vuelve anónimo", () => {
    expect(html).toMatch(/no vuelve anónimo el archivo/);
  });

  it("escribe los tamaños pequeños en kilobytes", () => {
    expect(html).toMatch(/32 KB/);
  });
});

describe("determinismo", () => {
  it("mismo informe y misma fecha ⇒ mismo archivo, byte por byte", () => {
    expect(construirReporte(datosDe("clinico"))).toBe(
      construirReporte(datosDe("clinico")),
    );
  });

  it("la fecha es lo único que se inyecta desde afuera", () => {
    const a = construirReporte(datosDe("clinico"));
    const b = construirReporte({ ...datosDe("clinico"), fecha: "otro día" });
    expect(a).not.toBe(b);
    expect(a.replace(FECHA, "otro día")).toBe(b);
  });
});

describe("el archivo del usuario no puede volverse código", () => {
  it("escapa lo que venga de afuera", () => {
    expect(escapar('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
    expect(escapar("a & b")).toBe("a &amp; b");
    expect(escapar("O'Brien")).toBe("O&#39;Brien");
  });

  it("una columna llamada <script> no ejecuta nada", () => {
    // El reporte lo abre alguien más, en su computador. Una tabla con una columna llamada
    // `<script>…` no puede convertirse en un script en la máquina de quien la recibe.
    const datos = datosDe("limpio", 200);
    const envenenado: DatosDelReporte = {
      ...datos,
      archivo: {
        ...datos.archivo,
        nombre: '<img src=x onerror="alert(1)">.csv',
      },
      diagnostico: {
        ...datos.diagnostico,
        columnas: datos.diagnostico.columnas.map((columna, i) =>
          i === 0
            ? { ...columna, nombre: "<script>alert('xss')</script>" }
            : columna,
        ),
      },
    };
    const html = construirReporte(envenenado);

    // Se comprueba sobre el DOM ya parseado, no sobre el texto: buscar "onerror=" en la cadena
    // daría un falso positivo con el texto ESCAPADO, que es inofensivo — lo que importa es que el
    // navegador no construya ni un elemento ni un atributo a partir del archivo del usuario.
    const documento = new DOMParser().parseFromString(html, "text/html");
    expect(
      documento.querySelectorAll("script, img, iframe, object"),
    ).toHaveLength(0);
    const manejadores = [...documento.querySelectorAll("*")].flatMap((el) =>
      [...el.attributes].map((a) => a.name).filter((n) => n.startsWith("on")),
    );
    expect(manejadores).toEqual([]);

    // Y el nombre envenenado sí aparece, como texto visible y literal.
    expect(documento.body.textContent).toContain(
      "<script>alert('xss')</script>",
    );
    expect(documento.title).toContain('<img src=x onerror="alert(1)">.csv');
  });
});

describe("nombre del archivo descargado", () => {
  it("sale del nombre original, sin caracteres que peleen con el sistema de archivos", () => {
    expect(nombreDelReporte("pacientes 2026.csv")).toBe(
      "velo-diagnostico-pacientes-2026.html",
    );
    expect(nombreDelReporte("informe/raro*.xlsx")).toBe(
      "velo-diagnostico-informe-raro.html",
    );
    expect(nombreDelReporte("ñandú.csv")).toBe("velo-diagnostico-ñandú.html");
    expect(nombreDelReporte("***.csv")).toBe("velo-diagnostico-archivo.html");
  });
});

// ── EL CRITERIO DE ACEPTACIÓN DE LA FASE 4 ────────────────────────────────────────────────────
//
// Este bloque no comprueba ninguna cifra. Comprueba el ORDEN en que se leen: una reducción del
// 87 % impresa encima de «la cédula sigue intacta» son dos verdades cuya suma dice algo falso. El
// reporte se abre fuera de contexto, en el correo de alguien que no estuvo en la pantalla, así que
// el orden del documento es lo único que decide qué se lee primero.

async function reporteConTratamiento(politica: Politica) {
  const filas = 600;
  const todas = [
    ...generarFilas({
      filas,
      seed: 42,
      perfil: "clinico",
      tasaInvalida: 0.08,
      tasaVacia: 0.03,
    }),
  ];
  const [encabezado, ...cuerpo] = todas;
  const constructor = new ConstructorColumnar(encabezado, filas);
  for (const fila of cuerpo) constructor.agregarFila(fila);
  const tabla = constructor.finalizar();

  const diagnostico = clasificar(tabla);
  const transformada = await aplicarPolitica(tabla, politica, null);
  const balance = balanceDelTratamiento({
    tablaOriginal: tabla,
    tablaTransformada: transformada.tabla,
    diagnostico,
    politica,
    suprimidas: transformada.suprimidas,
    colisiones: transformada.colisiones,
    mondrian: transformada.mondrian,
    diversidad: [],
  });

  return {
    balance,
    seccion: seccionDelTratamiento({
      balance,
      utilidad: medirUtilidad(tabla, transformada.tabla),
      hashDePolitica: hashDePolitica(politica),
      suprimidas: transformada.suprimidas,
    }),
    datos: {
      ...datosDe("clinico", filas),
      tratamiento: {
        balance,
        utilidad: medirUtilidad(tabla, transformada.tabla),
        hashDePolitica: hashDePolitica(politica),
        suprimidas: transformada.suprimidas,
      },
    } satisfies DatosDelReporte,
  };
}

/** Trata los cuasi-identificadores a fondo y NO toca la cédula: el caso prohibido. */
const CON_CEDULA_INTACTA: Politica = {
  version: 1,
  origen: "manual",
  kObjetivo: null,
  reglas: ["fecha_nacimiento", "latitud", "longitud", "ip_registro"].map(
    (columna) => ({ columna, tecnica: { tipo: "suprimir" as const } }),
  ),
};

describe("la advertencia va ANTES que el porcentaje, en el orden del documento", () => {
  it("con una cédula sin tratar, la salvedad precede a la cifra de reducción", async () => {
    const { seccion, balance } = await reporteConTratamiento(CON_CEDULA_INTACTA);

    // El instrumento mide algo real: hay una reducción grande que podría lucirse (del 100 % de
    // registros únicos al 21 %). Si no la hubiera, el test pasaría sin haber probado nada.
    expect(balance.reduccion).toBeGreaterThan(0.75);

    const salvedades = seccion.indexOf('class="salvedades');
    const cifra = seccion.indexOf('class="reduccion"');
    expect(salvedades).toBeGreaterThanOrEqual(0);
    expect(cifra).toBeGreaterThanOrEqual(0);
    expect(salvedades).toBeLessThan(cifra);
  });

  it("y la cifra NO se presenta como titular", async () => {
    const { seccion } = await reporteConTratamiento(CON_CEDULA_INTACTA);
    // `cifrota` es el titular grande del reporte. Aquí no puede aparecer.
    expect(seccion).not.toContain("cifrota");
    expect(seccion).toContain("Esa cifra no describe un");
  });

  it("la salvedad NOMBRA la columna que quedó intacta", async () => {
    const { seccion } = await reporteConTratamiento(CON_CEDULA_INTACTA);
    const salvedades = seccion.indexOf('class="salvedades');
    expect(seccion.indexOf("cedula_titular")).toBeGreaterThan(salvedades);
    expect(seccion.indexOf("cedula_titular")).toBeLessThan(
      seccion.indexOf('class="reduccion"'),
    );
  });

  it("en el documento completo, el balance va antes que el riesgo del original", async () => {
    // Si el riesgo del archivo que ENTRÓ se leyera primero, sus cifras se tomarían por las del
    // archivo que sale. El balance manda; el diagnóstico original queda debajo y dice que lo es.
    const { datos } = await reporteConTratamiento(CON_CEDULA_INTACTA);
    const html = construirReporte(datos);

    expect(html.indexOf("Balance del tratamiento")).toBeLessThan(
      html.indexOf("Riesgo de reidentificación"),
    );
    expect(html).toContain("el archivo ORIGINAL");
    expect(html).toContain("Diagnóstico y tratamiento de datos personales");
  });

  it("sin tratamiento, el reporte sigue siendo el diagnóstico del S1, sin balance", () => {
    const html = construirReporte(datosDe("clinico", 300));
    expect(html).not.toContain("Balance del tratamiento");
    expect(html).not.toContain("el archivo ORIGINAL");
    expect(html).toContain("Diagnóstico de datos personales");
  });
});

describe("el reporte con tratamiento conserva las reglas del S1", () => {
  it("sigue sin pedir un solo recurso externo", async () => {
    const { datos } = await reporteConTratamiento(CON_CEDULA_INTACTA);
    const html = construirReporte(datos);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/\burl\(/i);
  });

  it("es determinista: dos construcciones dan el mismo archivo", async () => {
    const { datos } = await reporteConTratamiento(CON_CEDULA_INTACTA);
    expect(construirReporte(datos)).toBe(construirReporte(datos));
  });
});

describe("el complemento: cuando nada la descalifica, la cifra SÍ es titular", () => {
  // Sin esto, un `cifrota` que jamás se emitiera pasaría el test de arriba sin haber probado nada.
  const balanceLimpio = {
    antes: {
      naturaleza: "exacto",
      qis: ["municipio", "estrato"],
      filas: 100,
      clases: 40,
      kMinimo: 1,
      riesgoMaximo: 1,
      riesgoPromedio: 0.4,
      unicos: 30,
      proporcionUnicos: 0.3,
    },
    despues: {
      naturaleza: "exacto",
      qis: ["municipio", "estrato"],
      filas: 100,
      clases: 10,
      kMinimo: 8,
      riesgoMaximo: 0.125,
      riesgoPromedio: 0.1,
      unicos: 0,
      proporcionUnicos: 0,
    },
    reduccion: 1,
    salvedades: [],
    esTitular: true,
  } as const;

  const seccion = seccionDelTratamiento({
    balance: balanceLimpio,
    utilidad: medirUtilidad(
      new ConstructorColumnar([], 1).finalizar(),
      new ConstructorColumnar([], 1).finalizar(),
    ),
    hashDePolitica: "a".repeat(64),
    suprimidas: [],
  });

  it("emite el titular grande con su cifra", () => {
    expect(seccion).toContain("cifrota");
    expect(seccion).toContain('class="reduccion"');
  });

  it("y aun así declara sobre qué columnas está calculada", () => {
    // «Toda cifra declara en su misma línea a quién no cuenta», también cuando son buenas noticias.
    expect(seccion).toContain("columnas");
    expect(seccion).toContain("Velo no encontró salvedades");
  });
});

describe("cada salvedad se escribe, y dice lo suyo", () => {
  // Una salvedad mal redactada no rompe ningún test de cálculo: sale un párrafo plausible con el
  // número equivocado. Aquí se rinde cada una y se comprueba que nombra lo que tiene que nombrar.
  const seccion = seccionDelTratamiento({
    balance: {
      antes: {
        naturaleza: "exacto",
        qis: ["municipio"],
        filas: 100,
        clases: 50,
        kMinimo: 1,
        riesgoMaximo: 1,
        riesgoPromedio: 0.5,
        unicos: 40,
        proporcionUnicos: 0.4,
      },
      despues: {
        naturaleza: "exacto",
        qis: ["municipio"],
        filas: 100,
        clases: 20,
        kMinimo: 2,
        riesgoMaximo: 0.5,
        riesgoPromedio: 0.2,
        unicos: 4,
        proporcionUnicos: 0.04,
      },
      reduccion: 0.9,
      esTitular: false,
      salvedades: [
        {
          gravedad: "descalifica",
          tipo: "identificadores-sin-tratar",
          columnas: ["cedula", "correo"],
        },
        {
          gravedad: "descalifica",
          tipo: "unicos-restantes",
          cuantos: 4,
          proporcion: 0.04,
        },
        {
          gravedad: "descalifica",
          tipo: "k-no-alcanzado",
          kObjetivo: 10,
          kAlcanzado: 2,
        },
        {
          gravedad: "descalifica",
          tipo: "k-del-reparto-no-es-el-del-archivo",
          kDelReparto: 5,
          kDelArchivo: 2,
        },
        {
          gravedad: "matiza",
          tipo: "clases-homogeneas",
          atributo: "diagnostico",
          filas: 37,
        },
        {
          gravedad: "matiza",
          tipo: "colisiones-de-seudonimo",
          columna: "nit_empresa",
          cuantas: 1,
        },
      ],
    },
    utilidad: medirUtilidad(
      new ConstructorColumnar([], 1).finalizar(),
      new ConstructorColumnar([], 1).finalizar(),
    ),
    hashDePolitica: "b".repeat(64),
    suprimidas: ["telefono"],
  });

  it("nombra las columnas intactas y cuenta los que siguen solos", () => {
    expect(seccion).toContain("<code>cedula</code>");
    expect(seccion).toContain("<code>correo</code>");
    expect(seccion).toContain("siguen <b>solos</b>");
  });

  it("dice los DOS números del k que no se alcanzó", () => {
    expect(seccion).toContain("al menos <b>10</b>");
    expect(seccion).toContain("llegó a <b>2</b>");
  });

  it("dice que el k del reparto no es el del archivo, y cuál manda", () => {
    expect(seccion).toContain("k=<b>5</b>");
    expect(seccion).toContain("El número que vale es el del");
  });

  it("cuenta la gente de las clases homogéneas, no las clases", () => {
    expect(seccion).toContain("<b>37</b> registros están en grupos");
    expect(seccion).toContain("<code>diagnostico</code>");
  });

  it("concuerda el singular de las colisiones", () => {
    expect(seccion).toContain("par de valores distintos recibió");
    expect(seccion).not.toContain("pares de valores distintos recibieron");
  });

  it("sin riesgo previo dice que no hay reducción que medir, en vez de un 0 %", () => {
    const sinRiesgoPrevio = seccionDelTratamiento({
      balance: {
        antes: {
          naturaleza: "exacto",
          qis: ["municipio"],
          filas: 100,
          clases: 4,
          kMinimo: 25,
          riesgoMaximo: 0.04,
          riesgoPromedio: 0.04,
          unicos: 0,
          proporcionUnicos: 0,
        },
        despues: {
          naturaleza: "exacto",
          qis: ["municipio"],
          filas: 100,
          clases: 2,
          kMinimo: 50,
          riesgoMaximo: 0.02,
          riesgoPromedio: 0.02,
          unicos: 0,
          proporcionUnicos: 0,
        },
        reduccion: null,
        esTitular: false,
        salvedades: [],
      },
      utilidad: medirUtilidad(
        new ConstructorColumnar([], 1).finalizar(),
        new ConstructorColumnar([], 1).finalizar(),
      ),
      hashDePolitica: "c".repeat(64),
      suprimidas: [],
    });

    expect(sinRiesgoPrevio).toContain("no hay reducción que medir");
    expect(sinRiesgoPrevio).not.toContain('class="reduccion"');
    expect(sinRiesgoPrevio).not.toContain("cifrota");
  });

  it("las descalificantes se marcan distinto de las que matizan", () => {
    expect(seccion.indexOf("s-descalifica")).toBeLessThan(
      seccion.indexOf("s-matiza"),
    );
    expect(seccion.split("s-descalifica").length - 1).toBe(4);
    expect(seccion.split("s-matiza").length - 1).toBe(2);
  });
});
