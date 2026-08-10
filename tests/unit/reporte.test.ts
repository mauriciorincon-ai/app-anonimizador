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
  type DatosDelReporte,
} from "@/engine/reporte";
import { evaluarRiesgo } from "@/engine/riesgo";

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
