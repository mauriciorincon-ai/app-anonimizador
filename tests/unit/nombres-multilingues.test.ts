// Los nombres de columna en las lenguas del RGPD (S8, ADR-016). Lo que se protege: que un archivo
// europeo no pase por «no personal» solo porque sus encabezados no están en español, y que la regla
// nueva no marque lo que no es (palabras completas, jamás subcadenas sueltas).

import { describe, expect, it } from "vitest";

import { ConstructorColumnar } from "@/engine/columnar";
import { clasificar } from "@/engine/clasificador";
import {
  buscarReglaMultilingue,
  palabrasDelNombre,
} from "@/engine/nombres-multilingues";

describe("el nombre se parte en palabras comparables", () => {
  it.each([
    ["fechaNacimiento", ["fecha", "nacimiento"]],
    ["Date_de_naissance", ["date", "de", "naissance"]],
    ["Staatsangehörigkeit", ["staatsangehorigkeit"]],
    ["Straße", ["strasse"]],
    ["first-name", ["first", "name"]],
    ["kod pocztowy", ["kod", "pocztowy"]],
    ["  __  ", []],
    ["PLZ", ["plz"]],
  ])("%s → %j", (nombre, palabras) => {
    expect(palabrasDelNombre(nombre)).toEqual(palabras);
  });
});

describe("cada lengua llega a su categoría", () => {
  it.each([
    // categoría especial (art. 9)
    ["Gesundheit", "dato-sensible"],
    ["maladie", "dato-sensible"],
    ["malattia", "dato-sensible"],
    ["ziekte", "dato-sensible"],
    ["choroba", "dato-sensible"],
    ["saude", "dato-sensible"],
    ["religion", "dato-sensible"],
    ["sexual_orientation", "dato-sensible"],
    ["opinion_politique", "dato-sensible"],
    // condenas (art. 10)
    ["casier_judiciaire", "dato-sensible"],
    ["Vorstrafe", "dato-sensible"],
    ["criminal_record", "dato-sensible"],
    ["antecedentes_penales", "dato-sensible"],
    // identificadores directos
    ["Vorname", "identificador-directo"],
    ["nachname", "identificador-directo"],
    ["prenom", "identificador-directo"],
    ["cognome", "identificador-directo"],
    ["voornaam", "identificador-directo"],
    ["nazwisko", "identificador-directo"],
    ["sobrenome", "identificador-directo"],
    ["first_name", "identificador-directo"],
    ["Anschrift", "identificador-directo"],
    ["indirizzo", "identificador-directo"],
    // cuasi-identificadores
    ["Geburtsdatum", "cuasi-identificador"],
    ["date_de_naissance", "cuasi-identificador"],
    ["data_di_nascita", "cuasi-identificador"],
    ["geboortedatum", "cuasi-identificador"],
    ["data_urodzenia", "cuasi-identificador"],
    ["data_de_nascimento", "cuasi-identificador"],
    ["Postleitzahl", "cuasi-identificador"],
    ["code_postal", "cuasi-identificador"],
    ["codice_postale", "cuasi-identificador"],
    ["kod_pocztowy", "cuasi-identificador"],
    ["zip_code", "cuasi-identificador"],
    ["Geschlecht", "cuasi-identificador"],
    ["sesso", "cuasi-identificador"],
    ["nationalité", "cuasi-identificador"],
    ["Staatsangehörigkeit", "cuasi-identificador"],
    ["nationaliteit", "cuasi-identificador"],
    ["cittadinanza", "cuasi-identificador"],
    ["narodowosc", "cuasi-identificador"],
  ])("%s → %s", (nombre, categoria) => {
    expect(buscarReglaMultilingue(nombre)?.categoria, nombre).toBe(categoria);
  });
});

describe("palabras completas, nunca subcadenas sueltas", () => {
  it.each([
    "steps", // contiene «eps»
    "stage", // contiene «age»
    "section",
    "cap", // un tope, no un código postal
    "rate_limit",
    "monto",
    "sucursal",
    "estrato",
    "transaction_id",
    "union_all", // «union» sola no es afiliación sindical
    "diagnosticado_por_sistema_x", // «diagnosticado» no es «diagnostic» ni «diagnosis»
    "naamloos", // contiene «naam», pero es otra palabra
    "sexton", // contiene «sex»
    "genealogy", // contiene «gen»
  ])("%s no coincide", (nombre) => {
    expect(buscarReglaMultilingue(nombre), nombre).toBeNull();
  });

  it("pero sí la palabra completa dentro de un nombre compuesto", () => {
    expect(buscarReglaMultilingue("kunde_nachname_2")?.categoria).toBe(
      "identificador-directo",
    );
    expect(buscarReglaMultilingue("patientGeburtsdatum")?.categoria).toBe(
      "cuasi-identificador",
    );
    expect(buscarReglaMultilingue("home_address")?.categoria).toBe(
      "identificador-directo",
    );
  });

  it("el orden decide el empate: lo sensible gana a lo directo", () => {
    expect(buscarReglaMultilingue("religion_nom")?.categoria).toBe(
      "dato-sensible",
    );
    expect(buscarReglaMultilingue("health_address")?.categoria).toBe(
      "dato-sensible",
    );
  });
});

describe("dentro del clasificador", () => {
  function diagnosticoDe(nombres: string[]) {
    const filas = 40;
    const constructor = new ConstructorColumnar(nombres, filas);
    for (let i = 0; i < filas; i++)
      constructor.agregarFila(nombres.map((_, j) => `valor-${i % (j + 3)}`));
    return clasificar(constructor.finalizar());
  }

  it("una columna europea sube de categoría por su encabezado, con certeza «sin confirmar»", () => {
    const d = diagnosticoDe([
      "nachname",
      "Geburtsdatum",
      "Gesundheit",
      "monto",
    ]);
    const porNombre = new Map(d.columnas.map((c) => [c.nombre, c]));
    expect(porNombre.get("nachname")?.categoria).toBe("identificador-directo");
    expect(porNombre.get("Geburtsdatum")?.categoria).toBe(
      "cuasi-identificador",
    );
    expect(porNombre.get("Gesundheit")?.categoria).toBe("dato-sensible");
    expect(porNombre.get("monto")?.categoria).toBe("no-personal");
    for (const nombre of ["nachname", "Geburtsdatum", "Gesundheit"]) {
      const c = porNombre.get(nombre)!;
      expect(c.certeza).toBe("sin-confirmar");
      expect(c.evidencia.at(-1)?.origen).toBe("nombre-de-columna");
    }
  });

  it("las reglas en español siguen mandando: el mismo resultado de antes", () => {
    const d = diagnosticoDe([
      "direccion",
      "nombre_paciente",
      "diagnostico",
      "fecha_nacimiento",
    ]);
    expect(d.columnas.map((c) => c.categoria)).toEqual([
      "identificador-directo",
      "identificador-directo",
      "dato-sensible",
      "cuasi-identificador",
    ]);
  });
});
