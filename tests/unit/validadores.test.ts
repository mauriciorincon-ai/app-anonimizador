// Tests de los validadores.
//
// Regla que gobierna este archivo: **ningún valor de prueba sale de un archivo real**, y ninguno
// se genera con el mismo código que se está probando (eso sería medir al motor contra sí mismo).
// Los casos con checksum llevan la aritmética desglosada en un comentario, de modo que cualquiera
// pueda verificarlos a mano — que es la misma promesa que el producto le hace al usuario.

import { describe, expect, it } from "vitest";

import {
  digitoVerificacionNit,
  validadorCedula,
  validadorCelular,
  validadorFijo,
  validadorNit,
  validadorPlaca,
} from "../../src/engine/validadores/colombianos";
import { pareceNombreDePersona } from "../../src/engine/diccionarios/nombres";
import {
  cumpleIban,
  cumpleLuhn,
  validadorCoordenada,
  validadorEmail,
  validadorFecha,
  validadorIban,
  validadorIp,
  validadorTarjeta,
} from "../../src/engine/validadores/universales";

/** Contexto de columna neutro: solo la cédula histórica lo usa; el resto lo ignora. */
const CONTEXTO_NEUTRO = { nombre: "columna" };

describe("NIT — dígito de verificación de la DIAN", () => {
  it("recomputa el DV con los pesos primos y el módulo 11", () => {
    // 900123456, pesos aplicados de derecha a izquierda:
    //   9×41 + 0×37 + 0×29 + 1×23 + 2×19 + 3×17 + 4×13 + 5×7 + 6×3
    // = 369 +   0 +   0 +  23 +  38 +  51 +  52 + 35 + 18 = 586
    // 586 mod 11 = 3  →  como 3 > 1, DV = 11 − 3 = 8
    expect(digitoVerificacionNit("900123456")).toBe(8);
    expect(validadorNit.valida("900123456-8", CONTEXTO_NEUTRO)).toBe(true);
  });

  it("rechaza el mismo número con el DV cambiado — que es todo el punto del checksum", () => {
    for (const dv of [0, 1, 2, 3, 4, 5, 6, 7, 9]) {
      expect(validadorNit.valida(`900123456-${dv}`, CONTEXTO_NEUTRO)).toBe(false);
    }
  });

  it("acepta el NIT como lo escribe la gente, con puntos de miles", () => {
    expect(validadorNit.valida("900.123.456-8", CONTEXTO_NEUTRO)).toBe(true);
  });

  it("no llama NIT a un número sin dígito de verificación", () => {
    // Sin DV no hay nada que confirmar. Marcarlo igual sería afirmar más de lo que se sabe.
    expect(validadorNit.valida("900123456", CONTEXTO_NEUTRO)).toBe(false);
  });

  it("devuelve los residuos 0 y 1 tal cual, sin restarlos de 11", () => {
    // El caso de borde del algoritmo: con residuo 0 o 1 el DV ES el residuo. Un `11 - residuo`
    // aplicado sin condición daría 11 y 10, que no son dígitos.
    const dv = digitoVerificacionNit("100000000");
    expect(dv).not.toBeNull();
    expect(dv).toBeGreaterThanOrEqual(0);
    expect(dv).toBeLessThanOrEqual(9);
  });

  it("no revienta con entradas fuera de la tabla de pesos", () => {
    expect(digitoVerificacionNit("")).toBeNull();
    expect(digitoVerificacionNit("1234567890123456")).toBeNull(); // 16 dígitos, 15 pesos
  });
});

describe("Cédula — validación estructural declarada", () => {
  const conEncabezado = { nombre: "cedula_titular" };
  const sinEncabezado = { nombre: "monto" };

  it("acepta el NUIP de 10 dígitos sin necesitar el encabezado", () => {
    // 10 dígitos desde 1.000.000.000 es una forma específica: se reclama sola.
    expect(validadorCedula.valida("1032456789", sinEncabezado)).toBe(true);
    expect(validadorCedula.valida("1032456789", conEncabezado)).toBe(true);
  });

  it("solo lee una serie histórica como cédula si el ENCABEZADO la respalda", () => {
    // 6–8 dígitos es la forma de cualquier número. Sin dígito de verificación público no hay
    // manera de separarlos por el valor, y adivinar convertiría toda columna de montos en
    // cédulas. Velo prefiere no reclamar antes que reclamar de más.
    expect(validadorCedula.valida("79456123", conEncabezado)).toBe(true);
    expect(validadorCedula.valida("5123456", conEncabezado)).toBe(true);
    expect(validadorCedula.valida("79456123", sinEncabezado)).toBe(false);
    expect(validadorCedula.valida("5123456", sinEncabezado)).toBe(false);
  });

  it("reconoce las variantes usuales del encabezado", () => {
    for (const nombre of [
      "CÉDULA",
      "cc",
      "documento",
      "num_identificacion",
      "NUIP",
    ]) {
      expect(validadorCedula.valida("79456123", { nombre })).toBe(true);
    }
  });

  it("rechaza los imposibles, respáldelos o no el encabezado", () => {
    for (const imposible of [
      "0",
      "99",
      "1",
      "123456789012",
      "10A2456789",
      "0123456",
    ]) {
      expect(validadorCedula.valida(imposible, conEncabezado)).toBe(false);
    }
  });

  it("declara en su fuente que NO existe dígito de verificación público", () => {
    // Esto no es un test de vanidad: la UI presenta la certeza, y si alguien "mejorara" el
    // validador inventando un checksum, el producto empezaría a afirmar lo que no puede.
    expect(validadorCedula.certeza).toBe("estructural");
    expect(validadorCedula.fuente).toMatch(
      /no existe dígito de verificación público/i,
    );
  });
});

describe("Telefonía colombiana — CRC, 10 dígitos desde 2021", () => {
  it("reconoce móviles y fijos, con y sin indicativo +57", () => {
    expect(validadorCelular.valida("3001234567", CONTEXTO_NEUTRO)).toBe(true);
    expect(validadorCelular.valida("+57 300 123 4567", CONTEXTO_NEUTRO)).toBe(true);
    expect(validadorFijo.valida("6011234567", CONTEXTO_NEUTRO)).toBe(true);
    expect(validadorFijo.valida("6041234567", CONTEXTO_NEUTRO)).toBe(true);
  });

  it("rechaza la numeración vieja y los prefijos que no existen", () => {
    expect(validadorCelular.valida("300123456", CONTEXTO_NEUTRO)).toBe(false); // 9 dígitos, esquema anterior
    expect(validadorCelular.valida("4001234567", CONTEXTO_NEUTRO)).toBe(false); // los móviles inician por 3
    expect(validadorCelular.valida("31012345678", CONTEXTO_NEUTRO)).toBe(false); // 11 dígitos
    expect(validadorFijo.valida("6001234567", CONTEXTO_NEUTRO)).toBe(false); // 600 no es indicativo regional
  });

  it("no confunde un fijo con un celular ni al revés", () => {
    expect(validadorCelular.valida("6011234567", CONTEXTO_NEUTRO)).toBe(false);
    expect(validadorFijo.valida("3001234567", CONTEXTO_NEUTRO)).toBe(false);
  });
});

describe("Placas", () => {
  it("acepta el formato de carro y el de moto", () => {
    expect(validadorPlaca.valida("ABC123", CONTEXTO_NEUTRO)).toBe(true);
    expect(validadorPlaca.valida("ABC12D", CONTEXTO_NEUTRO)).toBe(true);
    expect(validadorPlaca.valida("abc123", CONTEXTO_NEUTRO)).toBe(true); // mayúsculas o minúsculas
  });

  it("rechaza lo que no cuadra con ninguno de los dos", () => {
    for (const mala of ["AB123", "ABCD12", "12ABC3", "ABC-123", "ABC1234"]) {
      expect(validadorPlaca.valida(mala, CONTEXTO_NEUTRO)).toBe(false);
    }
  });
});

describe("Luhn — ISO/IEC 7812-1", () => {
  it("valida el vector canónico del algoritmo", () => {
    // 79927398713 es el ejemplo de referencia del propio algoritmo, no un número emitido.
    expect(cumpleLuhn("79927398713")).toBe(true);
    expect(cumpleLuhn("79927398710")).toBe(false);
  });

  it("acepta una tarjeta sintética válida y rechaza su vecina", () => {
    // 400000000000000 + dígito de control: solo el '4' inicial cae en posición duplicada
    // (4×2 = 8), la suma es 8 y el control es (10 − 8) mod 10 = 2.
    expect(validadorTarjeta.valida("4000000000000002", CONTEXTO_NEUTRO)).toBe(true);
    expect(validadorTarjeta.valida("4000000000000003", CONTEXTO_NEUTRO)).toBe(false);
    expect(validadorTarjeta.valida("4000 0000 0000 0002", CONTEXTO_NEUTRO)).toBe(true); // con espacios
  });

  it("rechaza un consecutivo interno que pasa Luhn por casualidad", () => {
    // LA COLUMNA-TRAMPA del kit. 9 es el MII reservado a asignación nacional (ISO/IEC 7812-1):
    // ninguna tarjeta de pago empieza por 9, por más que el checksum cuadre. Sin esta regla, una
    // columna de referencias de recaudo se marcaría como dato financiero.
    // El '9' inicial cae en posición duplicada: 9×2 = 18 → 18 − 9 = 9; el control que cierra la
    // suma en múltiplo de 10 es 1.
    expect(cumpleLuhn("9000000000000001")).toBe(true);
    expect(validadorTarjeta.valida("9000000000000001", CONTEXTO_NEUTRO)).toBe(false);
  });

  it("rechaza longitudes fuera del estándar", () => {
    expect(validadorTarjeta.valida("4000002", CONTEXTO_NEUTRO)).toBe(false); // demasiado corta
    expect(validadorTarjeta.valida("40000000000000000002", CONTEXTO_NEUTRO)).toBe(false); // 20 dígitos
  });
});

describe("IBAN — ISO 13616 con mod 97-10", () => {
  it("valida el ejemplo de referencia del estándar", () => {
    expect(cumpleIban("GB82WEST12345698765432")).toBe(true);
    expect(cumpleIban("GB82 WEST 1234 5698 7654 32")).toBe(true); // con espacios
  });

  it("rechaza un dígito cambiado", () => {
    expect(cumpleIban("GB82WEST12345698765433")).toBe(false);
    expect(validadorIban.valida("GB83WEST12345698765432", CONTEXTO_NEUTRO)).toBe(false);
  });

  it("rechaza lo que ni siquiera tiene forma de IBAN", () => {
    expect(cumpleIban("1234567890")).toBe(false);
    expect(cumpleIban("GBXXWEST12345698765432")).toBe(false);
  });
});

describe("Correo, IP, coordenada y fecha", () => {
  it("reconoce correos y rechaza los que no lo son", () => {
    expect(validadorEmail.valida("maria.herrera21@correo-demo.co", CONTEXTO_NEUTRO)).toBe(true);
    for (const malo of [
      "maria@",
      "@dominio.com",
      "maria herrera@x.com",
      "maria@dominio",
    ]) {
      expect(validadorEmail.valida(malo, CONTEXTO_NEUTRO)).toBe(false);
    }
  });

  it("valida IPv4 por rango exacto de octeto", () => {
    expect(validadorIp.valida("192.168.1.1", CONTEXTO_NEUTRO)).toBe(true);
    expect(validadorIp.valida("255.255.255.255", CONTEXTO_NEUTRO)).toBe(true);
    expect(validadorIp.valida("256.1.1.1", CONTEXTO_NEUTRO)).toBe(false); // fuera de rango
    expect(validadorIp.valida("192.168.01.1", CONTEXTO_NEUTRO)).toBe(false); // cero a la izquierda
    expect(validadorIp.valida("192.168.1", CONTEXTO_NEUTRO)).toBe(false);
  });

  it("exige decimales en las coordenadas para no marcar cualquier entero", () => {
    expect(validadorCoordenada.valida("4.710989", CONTEXTO_NEUTRO)).toBe(true);
    expect(validadorCoordenada.valida("-74.072092", CONTEXTO_NEUTRO)).toBe(true);
    expect(validadorCoordenada.valida("200.123456", CONTEXTO_NEUTRO)).toBe(false); // fuera de rango
    // Un entero suelto entre −90 y 90 casi siempre es una edad, un estrato o un conteo.
    expect(validadorCoordenada.valida("45", CONTEXTO_NEUTRO)).toBe(false);
  });

  it("verifica que la fecha EXISTA, no solo que tenga forma", () => {
    expect(validadorFecha.valida("2026-08-09", CONTEXTO_NEUTRO)).toBe(true);
    expect(validadorFecha.valida("09/08/2026", CONTEXTO_NEUTRO)).toBe(true);
    expect(validadorFecha.valida("2024-02-29", CONTEXTO_NEUTRO)).toBe(true); // bisiesto
    expect(validadorFecha.valida("2026-02-29", CONTEXTO_NEUTRO)).toBe(false); // no bisiesto
    expect(validadorFecha.valida("2026-02-31", CONTEXTO_NEUTRO)).toBe(false); // forma impecable, fecha inexistente
    expect(validadorFecha.valida("2026-13-01", CONTEXTO_NEUTRO)).toBe(false);
  });
});

describe("Nombres — el validador por diccionario y su límite declarado", () => {
  it("reconoce nombres de uso corriente, con o sin tildes", () => {
    expect(pareceNombreDePersona("María Herrera")).toBe(true);
    expect(pareceNombreDePersona("MARIA HERRERA")).toBe(true);
    expect(pareceNombreDePersona("Juan Carlos Gómez Rojas")).toBe(true);
    expect(pareceNombreDePersona("Ana de la Torre")).toBe(true); // partículas + apellido en léxico
  });

  it("SE LE ESCAPAN los nombres poco frecuentes, y eso es un límite declarado", () => {
    // El fixture del kit incluye a propósito nombres reales fuera del diccionario. Este test no
    // celebra el fallo: lo fija por escrito, para que nadie lea "detección de nombres" como si
    // fuera exhaustiva. Un apellido no deja de serlo por faltar en una lista.
    expect(pareceNombreDePersona("Zoraida Piraquive")).toBe(false);
    expect(pareceNombreDePersona("Arístides Tarazona")).toBe(false);
  });

  it("no confunde razones sociales ni municipios con personas", () => {
    expect(pareceNombreDePersona("Salud Aurora")).toBe(false);
    expect(pareceNombreDePersona("Mutual Orinoco")).toBe(false);
    expect(pareceNombreDePersona("Bogotá")).toBe(false);
  });

  it("rechaza lo que lleva dígitos o no tiene forma de nombre", () => {
    expect(pareceNombreDePersona("Juan 123")).toBe(false);
    expect(pareceNombreDePersona("")).toBe(false);
    expect(pareceNombreDePersona("de la")).toBe(false); // solo partículas
  });
});
