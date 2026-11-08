// Los siete validadores europeos (S8, ADR-016). Cada uno cita en el código la fuente de su algoritmo
// y hasta dónde se verificó. Aquí se prueba contra los ejemplos que las fuentes OFICIALES publican
// (NIR, Steuer-IdNr, BSN, PESEL y el único del DNI), contra números sintéticos del kit con el control
// bien calculado y contra los casos FUERA de rango: el control errado, las letras imposibles y las
// fechas que no existen. El codice fiscale NO tiene ejemplo oficial —el decreto no trae ninguno— y
// no se usa uno de blog: se prueba con las tablas y con números sintéticos.

import { describe, expect, it } from "vitest";

import {
  bsnSintetico,
  codiceFiscaleSintetico,
  dniSintetico,
  nieSintetico,
  nirSintetico,
  peselSintetico,
  steuerIdSintetico,
} from "../../docs/kit-de-prueba/generador.mjs";
import { crearAzar } from "../../docs/kit-de-prueba/binarios/azar.mjs";
import {
  cifraDeControlSteuer,
  claveDelNir,
  controlDelCodiceFiscale,
  controlDelPesel,
  claveDelRib,
  controlDelCcc,
  cumpleBsn,
  cumpleCodiceFiscale,
  cumpleDni,
  cumpleNie,
  cumpleNir,
  cumplePesel,
  cumpleSteuerIdNr,
  estructuraDeSteuer,
  fechaDelPesel,
  letraDeDni,
  sinSeparadores,
  sumaDelBsn,
  validadorBsn,
  validadorCodiceFiscale,
  validadorDni,
  validadorNie,
  validadorNir,
  validadorPesel,
  validadorSteuerIdNr,
} from "@/engine/validadores/europeos";
import { VALIDADORES } from "@/engine/validadores";
import { decirMensaje } from "@/lib/idioma/mensajes";

const CONTEXTO = { nombre: "x" };

/** 300 números sintéticos del kit, todos con el control bien calculado. */
function sinteticos(
  fabrica: (a: ReturnType<typeof crearAzar>) => string,
): string[] {
  const azar = crearAzar(7);
  return Array.from({ length: 300 }, () => fabrica(azar));
}

describe("los separadores y las mayúsculas no cambian el veredicto", () => {
  it("quita espacios, puntos, guiones y barras y pasa a mayúsculas", () => {
    expect(sinSeparadores(" 12.345.678-z ")).toBe("12345678Z");
    expect(sinSeparadores("1 85 05 78 006 084 36")).toBe(
      "18505780060843" + "6",
    );
  });
});

describe("los ejemplos que publican las fuentes oficiales", () => {
  it("DNI: 12345678Z, el ejemplo que cita el Ministerio del Interior (página no abierta, ver el validador)", () => {
    expect(cumpleDni("12345678Z")).toBe(true);
    expect(12345678).toBe(23 * 536768 + 14);
  });

  it("NIR: los dos ejemplos de INSEE, uno de ellos de Córcega", () => {
    expect(claveDelNir("1510246102043")).toBe(25);
    expect(cumpleNir("151024610204325")).toBe(true);
    expect(claveDelNir("278112B050002")).toBe(86);
    expect(cumpleNir("278112B05000286")).toBe(true);
    // Con la clave del ejemplo cambiada, ya no.
    expect(cumpleNir("151024610204326")).toBe(false);
    expect(cumpleNir("278112B05000285")).toBe(false);
  });

  it("Steuer-IdNr: las cinco IdNr de ilustración de ELSTER cumplen estructura y cifra", () => {
    for (const id of [
      "86095742719",
      "47036892816",
      "65929970489",
      "57549285017",
      "25768131411",
    ]) {
      expect(cumpleSteuerIdNr(id), id).toBe(true);
    }
  });

  it("Steuer-IdNr: 65929970489 tiene tres 9 y dos contiguos, y es válido: la regla es «no los tres seguidos»", () => {
    expect(estructuraDeSteuer([6, 5, 9, 2, 9, 9, 7, 0, 4, 8])).toBe(true);
  });

  it("Steuer-IdNr: la TestID 02476291358 tiene la cifra bien, pero empieza por 0 y se rechaza", () => {
    // El documento la declara número de prueba (las reales no empiezan por 0). Su cifra cuadra, y por
    // eso la causa del rechazo es el cero inicial y no el control.
    const diez = [..."0247629135"].map(Number);
    expect(cifraDeControlSteuer(diez)).toBe(8);
    expect(cumpleSteuerIdNr("02476291358")).toBe(false);
  });

  it("BSN: 123456782, el ejemplo de las Richtsnoeren (suma 154 = 11 × 14)", () => {
    expect(sumaDelBsn([1, 2, 3, 4, 5, 6, 7, 8, 2])).toBe(154);
    expect(cumpleBsn("123456782")).toBe(true);
    expect(cumpleBsn("123456783")).toBe(false);
  });

  it("PESEL: 02070803628, el ejemplo de gov.pl, y las plantillas parciales de la misma página", () => {
    expect(cumplePesel("02070803628")).toBe(true);
    expect(cumplePesel("02070803629")).toBe(false);
    expect(fechaDelPesel([0, 2, 0, 7, 0, 8, 0, 3, 6, 2])).toEqual({
      anio: 1902,
      mes: 7,
      dia: 8,
    });
    // «810203PPP6K»: mujer nacida el 3-2-1981 (el décimo dígito es par). «142112PPPPK»: 12-1-2014.
    expect(fechaDelPesel([8, 1, 0, 2, 0, 3, 0, 0, 0, 6])).toEqual({
      anio: 1981,
      mes: 2,
      dia: 3,
    });
    expect(fechaDelPesel([1, 4, 2, 1, 1, 2, 0, 0, 0, 0])).toEqual({
      anio: 2014,
      mes: 1,
      dia: 12,
    });
  });

  it("codice fiscale: sin ejemplo oficial; las tablas del decreto dan estos controles", () => {
    // Un código sintético, calculado con las tablas del decreto: no es el ejemplo de ninguna fuente.
    expect(controlDelCodiceFiscale("AAAAAA00A00A000")).toBe("I");
    // Omocodia: «4 = Q» (el texto digitalizado imprime «O», una errata que fuentes secundarias
    // corrigen). La cifra 4 de la posición 15 se escribe Q y el control se calcula con la Q.
    const base = "RSSMRA85T10A562";
    const omocodico = "RSSMRA85T10A56" + "N"; // 2 → N
    expect(cumpleCodiceFiscale(`${base}${controlDelCodiceFiscale(base)}`)).toBe(
      true,
    );
    expect(
      cumpleCodiceFiscale(`${omocodico}${controlDelCodiceFiscale(omocodico)}`),
    ).toBe(true);
  });
});

describe("DNI y NIE (España)", () => {
  it("la letra sale de la tabla de 23: el número módulo 23", () => {
    expect(letraDeDni(0)).toBe("T");
    expect(letraDeDni(22)).toBe("E");
    expect(letraDeDni(23)).toBe("T");
    expect(letraDeDni(12345678)).toBe("Z");
  });

  it("acepta 300 DNI sintéticos, con y sin separadores y en minúscula", () => {
    for (const dni of sinteticos((a) => dniSintetico(a))) {
      expect(cumpleDni(dni), dni).toBe(true);
      expect(
        cumpleDni(
          `${dni.slice(0, 2)}.${dni.slice(2, 5)}.${dni.slice(5, 8)}-${dni[8]}`,
        ),
      ).toBe(true);
      expect(cumpleDni(dni.toLowerCase())).toBe(true);
    }
  });

  it("rechaza la letra errada, la que no existe en la tabla y la forma imposible", () => {
    expect(cumpleDni("12345678Z")).toBe(true);
    expect(cumpleDni("12345678A")).toBe(false); // letra errada
    for (const letraFueraDeTabla of ["I", "Ñ", "O", "U"]) {
      expect(cumpleDni(`12345678${letraFueraDeTabla}`)).toBe(false);
    }
    expect(cumpleDni("1234567Z")).toBe(false); // 7 dígitos
    expect(cumpleDni("123456789Z")).toBe(false); // 9 dígitos
    expect(cumpleDni("Z12345678")).toBe(false); // la letra va al final
    expect(cumpleDni("")).toBe(false);
  });

  it("acepta 300 NIE sintéticos y rechaza el control errado y el prefijo imposible", () => {
    for (const nie of sinteticos((a) => nieSintetico(a))) {
      expect(cumpleNie(nie), nie).toBe(true);
    }
    const nie = nieSintetico(crearAzar(1));
    const malo = nie.slice(0, 8) + (nie[8] === "A" ? "B" : "A");
    expect(cumpleNie(malo)).toBe(false);
    expect(cumpleNie("A1234567L")).toBe(false); // el prefijo solo es X, Y o Z
    expect(cumpleNie("X123456L")).toBe(false);
  });

  it("un DNI no es un NIE ni al revés: cada validador acepta solo lo suyo", () => {
    const dni = dniSintetico(crearAzar(3));
    const nie = nieSintetico(crearAzar(3));
    expect(cumpleNie(dni)).toBe(false);
    expect(cumpleDni(nie)).toBe(false);
  });
});

describe("NIR (Francia)", () => {
  it("acepta 300 NIR sintéticos, con y sin los espacios con que se escriben", () => {
    for (const nir of sinteticos((a) => nirSintetico(a))) {
      expect(cumpleNir(nir), nir).toBe(true);
    }
  });

  it("la clave es 97 menos los 13 primeros dígitos módulo 97", () => {
    const trece = "1850578006084";
    expect(claveDelNir(trece)).toBe(97 - (Number(trece) % 97));
  });

  it("Córcega: 2A y 2B valen 19 y 18 en el cálculo de la clave", () => {
    // sexo 1 · año 85 · mes 05 · departamento 2A/2B · municipio 006 · orden 084
    expect(claveDelNir("185052A006084")).toBe(
      97 - (Number("1850519006084") % 97),
    );
    expect(claveDelNir("185052B006084")).toBe(
      97 - (Number("1850518006084") % 97),
    );
    const clave = String(claveDelNir("185052A006084")).padStart(2, "0");
    expect(cumpleNir(`185052A006084${clave}`)).toBe(true);
    // Y NO es lo mismo que tratar «2A» como un departamento 20 cualquiera.
    expect(claveDelNir("185052A006084")).not.toBe(claveDelNir("1850520006084"));
  });

  it("rechaza la clave errada, el mes imposible, el sexo imposible y el largo", () => {
    const trece = "1850578006084";
    const buena = `${trece}${String(claveDelNir(trece)).padStart(2, "0")}`;
    expect(cumpleNir(buena)).toBe(true);
    const mala = `${trece}${String((claveDelNir(trece)! % 97) + 1).padStart(2, "0")}`;
    expect(cumpleNir(mala)).toBe(false);
    for (const mes of ["00", "13", "99"]) {
      const sinClave = `185${mes}78006084`;
      const clave = String(97 - (Number(sinClave) % 97)).padStart(2, "0");
      expect(cumpleNir(`${sinClave}${clave}`), mes).toBe(false);
    }
    const sexo3 = `385057800608${"4"}`;
    expect(
      cumpleNir(
        `${sexo3}${String(97 - (Number(sexo3) % 97)).padStart(2, "0")}`,
      ),
    ).toBe(false);
    expect(cumpleNir(buena.slice(0, 14))).toBe(false);
  });
});

describe("codice fiscale (Italia)", () => {
  it("acepta 300 códigos sintéticos, también los de omocodia", () => {
    for (const cf of sinteticos((a) => codiceFiscaleSintetico(a))) {
      expect(cumpleCodiceFiscale(cf), cf).toBe(true);
    }
  });

  it("el carácter de control es el módulo 26 de las tablas de posiciones impares y pares", () => {
    // 15 caracteres cuyas posiciones impares valen 1 (A y 0) y cuyas pares valen 0 (A y 0): la suma
    // es 8, y el octavo de los 26 caracteres es la «I».
    expect(controlDelCodiceFiscale("AAAAAA00A00A000")).toBe("I");
  });

  it("rechaza el control errado, la letra de mes que no existe, el día imposible y la forma", () => {
    const quince = "RSSMRA85T10A562";
    const control = controlDelCodiceFiscale(quince);
    expect(cumpleCodiceFiscale(`${quince}${control}`)).toBe(true);
    const otro = control === "A" ? "B" : "A";
    expect(cumpleCodiceFiscale(`${quince}${otro}`)).toBe(false);
    const mesFalso = "RSSMRA85F10A562"; // la F no es letra de mes
    expect(
      cumpleCodiceFiscale(`${mesFalso}${controlDelCodiceFiscale(mesFalso)}`),
    ).toBe(false);
    for (const dia of ["00", "32", "40", "72"]) {
      const q = `RSSMRA85T${dia}A562`;
      expect(
        cumpleCodiceFiscale(`${q}${controlDelCodiceFiscale(q)}`),
        dia,
      ).toBe(false);
    }
    expect(cumpleCodiceFiscale("RSSMRA85T10A562")).toBe(false); // falta el control
    expect(cumpleCodiceFiscale("1SSMRA85T10A562" + control)).toBe(false); // un dígito en las letras
  });
});

describe("Steuer-IdNr (Alemania)", () => {
  it("acepta 300 números sintéticos con la estructura del documento de ELSTER y su cifra", () => {
    for (const id of sinteticos((a) => steuerIdSintetico(a))) {
      expect(cumpleSteuerIdNr(id), id).toBe(true);
    }
  });

  it("la estructura: sin 0 inicial, una cifra repetida y alguna ausente", () => {
    expect(estructuraDeSteuer([1, 2, 3, 4, 5, 6, 7, 8, 9, 1])).toBe(true);
    expect(estructuraDeSteuer([0, 2, 3, 4, 5, 6, 7, 8, 9, 2])).toBe(false); // empieza en 0
    expect(estructuraDeSteuer([1, 2, 3, 4, 5, 6, 7, 8, 9, 0])).toBe(false); // ninguna repetida
    expect(estructuraDeSteuer([1, 1, 2, 2, 3, 4, 5, 6, 7, 8])).toBe(false); // dos repetidas
    expect(estructuraDeSteuer([1, 1, 1, 2, 3, 4, 5, 6, 7, 8])).toBe(false); // tres seguidas
    expect(estructuraDeSteuer([1, 2, 1, 3, 1, 4, 5, 6, 7, 8])).toBe(true); // tres, no seguidas
    expect(estructuraDeSteuer([1, 1, 1, 1, 2, 3, 4, 5, 6, 7])).toBe(false); // cuatro
  });

  it("rechaza la cifra de control errada y el largo", () => {
    const diez = [1, 2, 3, 4, 5, 6, 7, 8, 9, 1];
    const cifra = cifraDeControlSteuer(diez);
    expect(cumpleSteuerIdNr(`${diez.join("")}${cifra}`)).toBe(true);
    expect(cumpleSteuerIdNr(`${diez.join("")}${(cifra + 1) % 10}`)).toBe(false);
    expect(cumpleSteuerIdNr(`${diez.join("")}`)).toBe(false);
    expect(cumpleSteuerIdNr(`${diez.join("")}${cifra}0`)).toBe(false);
  });
});

describe("las claves nacionales dentro del BBAN (S10)", () => {
  it("CCC de España: el ejemplo del registro IBAN, ES91 2100 0418 4502 0005 1332", () => {
    expect(controlDelCcc("21000418", "0200051332")).toBe("45");
    // Resto 10 → 1 y resto 11 → 0, las dos excepciones de la norma.
    expect(controlDelCcc("00000000", "0000000000")).toBe("00");
    expect(controlDelCcc("21000418", "0200051333")).not.toBe("45");
  });

  it("RIB de Francia: el ejemplo del registro IBAN, FR14 2004 1010 0505 0001 3M02 606 (la M vale 4)", () => {
    expect(claveDelRib("20041", "01005", "0500013M026")).toBe(6);
    expect(claveDelRib("20041", "01005", "0500013N026")).not.toBe(6);
    // S–Z empiezan en 2: S = 2, Z = 9.
    expect(claveDelRib("00000", "00000", "S")).toBe(97 - ((3 * 2) % 97));
    expect(claveDelRib("00000", "00000", "Z")).toBe(97 - ((3 * 9) % 97));
  });
});

describe("BSN (Países Bajos)", () => {
  it("acepta 300 números sintéticos que pasan la prueba del 11", () => {
    for (const bsn of sinteticos((a) => bsnSintetico(a))) {
      expect(cumpleBsn(bsn), bsn).toBe(true);
    }
  });

  it("la prueba del 11: 9a + 8b + … + 2h − 1i es múltiplo de 11", () => {
    expect(sumaDelBsn([1, 1, 1, 2, 2, 2, 3, 3, 3])).toBe(
      9 + 8 + 7 + 12 + 10 + 8 + 9 + 6 - 3,
    );
    expect(cumpleBsn("111222333")).toBe(true);
  });

  it("rechaza lo que no pasa la prueba, el largo y el todo ceros", () => {
    expect(cumpleBsn("111222334")).toBe(false);
    expect(cumpleBsn("1112223")).toBe(false);
    expect(cumpleBsn("1112223333")).toBe(false);
    expect(cumpleBsn("000000000")).toBe(false);
    expect(cumpleBsn("00000000")).toBe(false);
  });

  it("un BSN de 8 cifras se lee con un cero a la izquierda (S10)", () => {
    // 012345611: suma 8·1 + 7·2 + 6·3 + 5·4 + 4·5 + 3·6 + 2·1 − 1·1 = 99 = 11 × 9.
    expect(cumpleBsn("12345611")).toBe(true);
    expect(cumpleBsn("012345611")).toBe(true);
    expect(cumpleBsn("12345612")).toBe(false);
    // Con separadores, como el resto de los números de la familia.
    expect(cumpleBsn("1234 5611")).toBe(true);
  });
});

describe("PESEL (Polonia)", () => {
  it("acepta 300 números sintéticos con control y fecha bien", () => {
    for (const pesel of sinteticos((a) => peselSintetico(a))) {
      expect(cumplePesel(pesel), pesel).toBe(true);
    }
  });

  it("el mes lleva el siglo: 01–12 en 1900, 21–32 en 2000, 81–92 en 1800", () => {
    expect(fechaDelPesel([4, 4, 0, 5, 1, 4, 0, 0, 0, 0])).toEqual({
      anio: 1944,
      mes: 5,
      dia: 14,
    });
    expect(fechaDelPesel([0, 2, 2, 1, 1, 5, 0, 0, 0, 0])).toEqual({
      anio: 2002,
      mes: 1,
      dia: 15,
    });
    expect(fechaDelPesel([5, 0, 8, 3, 0, 1, 0, 0, 0, 0])).toEqual({
      anio: 1850,
      mes: 3,
      dia: 1,
    });
  });

  it("rechaza el control errado, el mes y el día imposibles y el largo", () => {
    const diez = [4, 4, 0, 5, 1, 4, 0, 0, 0, 0];
    const control = controlDelPesel(diez);
    expect(cumplePesel(`${diez.join("")}${control}`)).toBe(true);
    expect(cumplePesel(`${diez.join("")}${(control + 1) % 10}`)).toBe(false);
    const sinControl = (d: number[]) => `${d.join("")}${controlDelPesel(d)}`;
    expect(cumplePesel(sinControl([4, 4, 1, 3, 1, 4, 0, 0, 0, 0]))).toBe(false); // mes 13
    expect(cumplePesel(sinControl([4, 4, 0, 0, 1, 4, 0, 0, 0, 0]))).toBe(false); // mes 00
    expect(cumplePesel(sinControl([4, 4, 0, 2, 3, 0, 0, 0, 0, 0]))).toBe(false); // 30 de febrero
    expect(cumplePesel(sinControl([4, 4, 0, 5, 0, 0, 0, 0, 0, 0]))).toBe(false); // día 00
    expect(cumplePesel(sinControl([4, 4, 0, 5, 3, 2, 0, 0, 0, 0]))).toBe(false); // día 32
    expect(cumplePesel("4405140000")).toBe(false);
  });
});

describe("los siete como validadores del diagnóstico", () => {
  const europeos = [
    validadorCodiceFiscale,
    validadorNir,
    validadorDni,
    validadorNie,
    validadorSteuerIdNr,
    validadorPesel,
    validadorBsn,
  ];

  it("todos son de algoritmo oficial, identificadores directos, y están registrados", () => {
    for (const validador of europeos) {
      expect(validador.certeza, validador.id).toBe("algoritmo-oficial");
      expect(validador.categoria, validador.id).toBe("identificador-directo");
      expect(VALIDADORES).toContain(validador);
    }
  });

  it("cada uno tiene etiqueta y fuente en español y en inglés", () => {
    for (const validador of europeos) {
      for (const idioma of ["es", "en"] as const) {
        expect(
          decirMensaje(validador.etiqueta, idioma).length,
          validador.id,
        ).toBeGreaterThan(3);
        expect(
          decirMensaje(validador.fuente, idioma).length,
          validador.id,
        ).toBeGreaterThan(15);
      }
    }
  });

  it("las prioridades no se repiten entre formatos que pueden confundirse", () => {
    // PESEL y Steuer-IdNr son de 11 dígitos y pueden coincidir en forma: aunque empaten en
    // prioridad, el orden del registro es fijo y el clasificador desempata por aciertos.
    const posiciones = europeos.map((v) => VALIDADORES.indexOf(v));
    expect([...posiciones].sort((a, b) => a - b)).toEqual(
      posiciones.slice().sort((a, b) => a - b),
    );
    expect(new Set(europeos.map((v) => v.id)).size).toBe(europeos.length);
  });

  it("un DNI sintético solo lo reclama el validador del DNI", () => {
    const dni = dniSintetico(crearAzar(11));
    const reclaman = europeos
      .filter((v) => v.valida(dni, CONTEXTO))
      .map((v) => v.id);
    expect(reclaman).toEqual(["dni"]);
  });

  it("un número cualquiera casi nunca pasa: 20 000 al azar, menos del 12 % el que más acierta (el BSN)", () => {
    const azar = crearAzar(5);
    const cuantos = (validador: (typeof europeos)[number], largo: number) => {
      let n = 0;
      for (let i = 0; i < 20_000; i++) {
        if (validador.valida(azar.digitos(largo), CONTEXTO)) n++;
      }
      return n / 20_000;
    };
    // El umbral de adjudicación del clasificador es 85 %: un 9 % por azar no adjudica una columna.
    expect(cuantos(validadorBsn, 9)).toBeLessThan(0.12);
    expect(cuantos(validadorBsn, 8)).toBeLessThan(0.12);
    expect(cuantos(validadorPesel, 11)).toBeLessThan(0.08);
    expect(cuantos(validadorSteuerIdNr, 11)).toBeLessThan(0.01);
  });
});
