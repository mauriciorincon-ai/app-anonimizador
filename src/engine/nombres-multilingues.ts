// Nombres de columna en las lenguas del RGPD — la segunda señal del clasificador, más allá del español.
//
// Las reglas del clasificador nacieron en español (Ley 1581 de Colombia). Un archivo europeo trae
// `Vorname`, `date_de_naissance`, `codice_postale` o `kod_pocztowy`, y sin esto sus columnas
// personales pasaban por «no personales». Esta lista suma alemán, francés, italiano, neerlandés,
// polaco, portugués e inglés, para los campos personales comunes.
//
// **Palabras completas, nunca subcadenas.** El nombre se parte en palabras (`_`, `-`, `.`, espacios y
// el salto de minúscula a mayúscula de `fechaNacimiento`), se le quitan los acentos y se compara
// palabra por palabra, o secuencia de hasta tres palabras. Una subcadena suelta marca `steps` por
// `eps` o `stage` por `age`: aquí `cap` solo no es un código postal, porque en inglés es un tope.
// Las reglas viejas en español siguen intactas y mandan primero (`buscarReglaDeNombre`).
//
// Como las viejas, esto es una SOSPECHA por el encabezado, nunca una confirmación: el clasificador
// deja la certeza en «sin-confirmar» y la evidencia dice que fue el nombre.

import { mensaje } from "@/lib/idioma";
import type { MensajeDeMotor } from "@/lib/idioma/mensajes";

import type { CategoriaLey1581 } from "./validadores/tipos";

export interface ReglaDePalabras {
  /** Palabras ya sin acentos y en minúscula; las de varias palabras van separadas por un espacio. */
  readonly palabras: readonly string[];
  readonly descripcion: MensajeDeMotor;
  readonly categoria: CategoriaLey1581;
  readonly nota: MensajeDeMotor;
}

/**
 * En orden de severidad, como las reglas en español: las categorías especiales primero, para que
 * `religion_nombre` no caiga en la del nombre de persona.
 */
export const REGLAS_MULTILINGUES: readonly ReglaDePalabras[] = [
  {
    // Art. 10 del RGPD: condenas e infracciones penales. No son del art. 9, pero la política de
    // fábrica las trata igual (se suprimen) y por eso van como dato sensible, con su propia nota.
    palabras: [
      // español (las reglas viejas no las traen)
      "antecedentes penales",
      "condena",
      "delito",
      // inglés
      "criminal record",
      "conviction",
      "offence",
      "offense",
      // alemán
      "vorstrafe",
      "strafregister",
      "verurteilung",
      // francés
      "casier judiciaire",
      "condamnation",
      "infraction",
      // italiano
      "casellario giudiziale",
      "condanna",
      "precedenti penali",
      "reato",
      // neerlandés
      "strafblad",
      "veroordeling",
      // polaco
      "karalnosc",
      "wyrok",
      "skazanie",
      // portugués
      "registo criminal",
      "antecedentes criminais",
      "condenacao",
    ],
    descripcion: mensaje("clasificador.nombre.rgpd.penales.patron"),
    categoria: "dato-sensible",
    nota: mensaje("clasificador.nombre.rgpd.penales.nota"),
  },
  {
    // Art. 9.1 del RGPD: salud, origen étnico o racial, opiniones políticas, convicciones religiosas
    // o filosóficas, afiliación sindical, vida u orientación sexual, datos genéticos y biométricos.
    palabras: [
      // inglés
      "health",
      "disease",
      "diagnosis",
      "disability",
      "religion",
      "ethnicity",
      "ethnic",
      "trade union",
      "political opinion",
      "sexual orientation",
      "biometric",
      "genetic",
      // alemán
      "gesundheit",
      "krankheit",
      "diagnose",
      "behinderung",
      "konfession",
      "gewerkschaft",
      "politische meinung",
      "sexuelle orientierung",
      "biometrie",
      // francés
      "sante",
      "maladie",
      "diagnostic",
      "handicap",
      "syndicat",
      "opinion politique",
      "orientation sexuelle",
      "biometrique",
      // italiano
      "salute",
      "malattia",
      "diagnosi",
      "disabilita",
      "religione",
      "sindacato",
      "opinioni politiche",
      "orientamento sessuale",
      "biometrico",
      // neerlandés
      "gezondheid",
      "ziekte",
      "religie",
      "vakbond",
      "politieke opvatting",
      "seksuele geaardheid",
      // polaco
      "zdrowie",
      "choroba",
      "diagnoza",
      "niepelnosprawnosc",
      "religia",
      "zwiazek zawodowy",
      "poglady polityczne",
      "orientacja seksualna",
      // portugués
      "saude",
      "doenca",
      "deficiencia",
      "religiao",
      "orientacao sexual",
    ],
    descripcion: mensaje("clasificador.nombre.rgpd.especial.patron"),
    categoria: "dato-sensible",
    nota: mensaje("clasificador.nombre.rgpd.especial.nota"),
  },
  {
    palabras: [
      // inglés
      "first name",
      "last name",
      "full name",
      "given name",
      "family name",
      "firstname",
      "lastname",
      "fullname",
      "surname",
      "address",
      "street",
      // alemán
      "vorname",
      "nachname",
      "familienname",
      "adresse",
      "anschrift",
      "strasse",
      "wohnort",
      // francés
      "nom",
      "prenom",
      "nom de famille",
      "adresse",
      "rue",
      // italiano
      "nome",
      "cognome",
      "indirizzo",
      // neerlandés
      "naam",
      "voornaam",
      "achternaam",
      "adres",
      "straat",
      // polaco
      "imie",
      "nazwisko",
      "ulica",
      // portugués
      "apelido",
      "sobrenome",
      "morada",
      "endereco",
      "rua",
    ],
    descripcion: mensaje("clasificador.nombre.rgpd.directo.patron"),
    categoria: "identificador-directo",
    nota: mensaje("clasificador.nombre.rgpd.directo.nota"),
  },
  {
    palabras: [
      // inglés
      "birth",
      "birthdate",
      "birthday",
      "date of birth",
      "dob",
      "postal code",
      "postcode",
      "zip",
      "zip code",
      "zipcode",
      "gender",
      "sex",
      "nationality",
      "citizenship",
      // alemán
      "geburtsdatum",
      "geburtstag",
      "geburtsort",
      "postleitzahl",
      "plz",
      "geschlecht",
      "staatsangehoerigkeit",
      "staatsangehorigkeit",
      // francés
      "naissance",
      "date de naissance",
      "code postal",
      "sexe",
      "genre",
      "nationalite",
      // italiano
      "nascita",
      "data di nascita",
      "codice postale",
      "sesso",
      "nazionalita",
      "cittadinanza",
      // neerlandés
      "geboortedatum",
      "geboorte",
      "postcode",
      "geslacht",
      "nationaliteit",
      // polaco
      "data urodzenia",
      "urodzenie",
      "kod pocztowy",
      "plec",
      "narodowosc",
      "obywatelstwo",
      // portugués
      "nascimento",
      "data de nascimento",
      "codigo postal",
      "cep",
      "genero",
      "sexo",
      "nacionalidade",
    ],
    descripcion: mensaje("clasificador.nombre.rgpd.cuasi.patron"),
    categoria: "cuasi-identificador",
    nota: mensaje("clasificador.nombre.rgpd.cuasi.nota"),
  },
];

/**
 * El nombre partido en palabras comparables: sin acentos, en minúscula y separado por todo lo que no
 * sea letra o dígito. `fechaNacimiento` → [fecha, nacimiento]; `Date_de_naissance` → [date, de,
 * naissance]; `Staatsangehörigkeit` → [staatsangehorigkeit].
 */
export function palabrasDelNombre(nombre: string): string[] {
  return nombre
    .replace(/([a-zß-ÿ])([A-Z])/g, "$1 $2")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((palabra) => palabra !== "");
}

/**
 * S10: palabras que, solas, también nombran cosas: `nom_produit` es el nombre de un producto,
 * `genre_film` el de una película, `diagnostic_moteur` el de un motor, `server_health` el estado de
 * un servidor. La política `rgpd` suprimía esas columnas inocentes. Siguen contando —una sospecha de
 * más es el lado seguro— salvo cuando el nombre trae una palabra de {@link COSAS}.
 */
const SUELTAS: ReadonlySet<string> = new Set([
  "infraction",
  "health",
  "diagnostic",
  "address",
  "nom",
  "genre",
]);

/** Lo que dice que la columna habla de una cosa, no de una persona. Palabras completas, sin acentos. */
const COSAS: ReadonlySet<string> = new Set([
  // productos y artículos
  ...[
    "product",
    "produit",
    "prodotto",
    "produkt",
    "produto",
    "item",
    "article",
    "artikel",
  ],
  // archivos y sistemas
  ...["file", "fichier", "datei", "bestand", "plik", "ficheiro", "arquivo"],
  ...[
    "server",
    "serveur",
    "system",
    "systeme",
    "sistema",
    "service",
    "device",
    "appareil",
  ],
  ...[
    "network",
    "reseau",
    "netzwerk",
    "host",
    "domain",
    "domaine",
    "check",
    "memory",
  ],
  // máquinas y vehículos
  ...[
    "machine",
    "maschine",
    "moteur",
    "motor",
    "engine",
    "vehicle",
    "vehicule",
    "fahrzeug",
  ],
  // empresas y lugares de negocio
  ...[
    "company",
    "societe",
    "entreprise",
    "unternehmen",
    "azienda",
    "empresa",
    "bedrijf",
  ],
  ...[
    "store",
    "shop",
    "magasin",
    "boutique",
    "branch",
    "filiale",
    "contract",
    "contrat",
  ],
  // catálogos y obras
  ...[
    "category",
    "categorie",
    "kategorie",
    "categoria",
    "project",
    "projet",
    "projekt",
  ],
  ...[
    "music",
    "musique",
    "musik",
    "musica",
    "film",
    "movie",
    "book",
    "livre",
    "buch",
    "libro",
  ],
  ...["game", "jeu", "spiel", "gioco", "jogo", "album", "song", "chanson"],
]);

/** ¿Alguna de las palabras (o secuencia de hasta tres) del nombre está en la lista de la regla? */
function coincide(
  regla: ReglaDePalabras,
  palabras: readonly string[],
): boolean {
  const conocidas = new Set(regla.palabras);
  const deUnaCosa = palabras.some((palabra) => COSAS.has(palabra));
  for (let largo = 1; largo <= 3; largo++) {
    for (let i = 0; i + largo <= palabras.length; i++) {
      const frase = palabras.slice(i, i + largo).join(" ");
      if (!conocidas.has(frase)) continue;
      if (deUnaCosa && SUELTAS.has(frase)) continue;
      return true;
    }
  }
  return false;
}

/** La primera regla multilingüe que coincide, o `null`. El orden de la lista decide el empate. */
export function buscarReglaMultilingue(nombre: string): ReglaDePalabras | null {
  const palabras = palabrasDelNombre(nombre);
  return REGLAS_MULTILINGUES.find((regla) => coincide(regla, palabras)) ?? null;
}
