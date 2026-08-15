// Monta todo lo que el converter de /design-sync necesita y que este repo NO tiene, porque es una
// app Next y no una librería publicada. Es idempotente: bórralo todo y vuelve a correrlo.
//
//   node .design-sync/preparar.mjs        (requiere un `pnpm build` reciente — de ahí salen las fuentes)
//
// Produce `node_modules/app-anonimizador/`, un PAQUETE SINTÉTICO que existe solo para esto:
//
//   package.json   el converter resuelve el paquete como <node_modules>/<pkg>, y un repo no se
//                  auto-instala. (Un symlink a `..` NO sirve: crea un ciclo infinito y revienta V8.)
//   src/           COPIA, no enlace. esbuild resuelve los symlinks a su ruta real, y entonces la
//                  búsqueda de node_modules vuelve a la del repo — que es justo lo que el stub de
//                  `next` de abajo tiene que ganar.
//   node_modules/next/link.js
//                  el `next/link` real arrastra el runtime de cliente de Next y sus `process.env.
//                  __NEXT_*`; fuera de Next eso es «process is not defined» y `window.Velo` queda
//                  vacío. Anidado aquí, gana por resolución solo para este bundle.
//   ds-styles/     Tailwind COMPILADO (las clases no existen en el fuente) y las fuentes que
//                  `next/font` descarga en build. `cssEntry` está acotado al paquete por ruta REAL,
//                  así que tienen que vivir dentro y no en `.design-sync/`.
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";

const PKG = "node_modules/app-anonimizador";
const CLI = ".ds-sync/node_modules/@tailwindcss/cli/dist/index.mjs";
const DIR_FUENTES = join(PKG, "ds-styles/fonts");

// ── 1. El paquete sintético ───────────────────────────────────────────────────────────────────
rmSync(PKG, { recursive: true, force: true });
mkdirSync(join(PKG, "node_modules/next"), { recursive: true });

const propio = JSON.parse(readFileSync("package.json", "utf8"));
writeFileSync(
  join(PKG, "package.json"),
  JSON.stringify(
    {
      name: "app-anonimizador",
      version: "0.0.0",
      private: true,
      dependencies: propio.dependencies,
    },
    null,
    2,
  ),
);
cpSync("src", join(PKG, "src"), { recursive: true });

// Solo las primitivas entran al bundle. No es una poda cosmética: el entry sintético re-exporta
// TODOS los archivos de `srcDir`, así que dejar los 16 compuestos dentro arrastra `next/navigation`
// y `next/dynamic` —y con ellos el runtime de Next y sus `process.env.__NEXT_*`, que fuera de Next
// es «process is not defined» y deja `window.Velo` vacío—. La frontera es la misma que declara
// design-system.md § 3: primitivas reutilizables vs. compuestos que son de su pantalla.
const PRIMITIVAS = [
  "sello.tsx",
  "panel.tsx",
  "boton.tsx",
  "insignias.tsx",
  "zona-de-carga.tsx",
  "iconos.tsx",
];
const dirComponentes = join(PKG, "src/components");
let podados = 0;
for (const archivo of readdirSync(dirComponentes)) {
  if (PRIMITIVAS.includes(archivo)) continue;
  rmSync(join(dirComponentes, archivo), { recursive: true, force: true });
  podados++;
}
// `src/app/` no aporta componentes (el scan está acotado a `src/components`) y sí trae next/font.
rmSync(join(PKG, "src/app"), { recursive: true, force: true });

// Los alias `@/…` se reescriben a rutas relativas EN LA COPIA. Motivo: esbuild ignora
// `tsconfig.json` para todo lo que vive dentro de `node_modules`, así que ahí los alias no existen
// —82 errores de resolución—. El fuente real no se toca: esto opera sobre una copia desechable.
const raizSrc = join(PKG, "src");
let reescritos = 0;
for (const archivo of readdirSync(raizSrc, {
  recursive: true,
  withFileTypes: true,
})) {
  if (!archivo.isFile() || !/\.tsx?$/.test(archivo.name)) continue;
  const ruta = join(archivo.parentPath, archivo.name);
  const antes = readFileSync(ruta, "utf8");
  const despues = antes.replace(/(["'])@\/([^"']+)\1/g, (_, comilla, resto) => {
    let rel = relative(dirname(ruta), join(raizSrc, resto))
      .split(sep)
      .join("/");
    if (!rel.startsWith(".")) rel = `./${rel}`;
    return `${comilla}${rel}${comilla}`;
  });
  if (despues !== antes) {
    writeFileSync(ruta, despues);
    reescritos++;
  }
}
console.log(`  alias @/ reescritos en ${reescritos} archivos de la copia`);

writeFileSync(
  join(PKG, "node_modules/next/package.json"),
  JSON.stringify(
    { name: "next", version: "0.0.0-ds-sync-stub", type: "module" },
    null,
    2,
  ),
);
writeFileSync(
  join(PKG, "node_modules/next/link.js"),
  `// Sustituto de \`next/link\` SOLO para el bundle de Claude Design. Legítimo porque next/link
// renderiza un <a> y en el lienzo de diseño no hay router de Next que preservar.
import { createElement } from "react";

export default function Link({ href, children, ...props }) {
  return createElement("a", { href: typeof href === "string" ? href : "#", ...props }, children);
}
`,
);

// El reglamento viaja como guideline: el converter recoge `docs/*.md` del paquete hacia
// `guidelines/`, y sin esto el agente de diseño no ve ni los 5 estados del §4 ni las reglas del §5 —
// solo piezas. Es el documento real del repo, sin resumir.
mkdirSync(join(PKG, "docs"), { recursive: true });
copyFileSync("design-system.md", join(PKG, "docs", "design-system.md"));

// ── 2. Tailwind compilado ─────────────────────────────────────────────────────────────────────
//
// No se compila `globals.css` a secas. Tailwind 4 genera SOLO las utilidades que encuentra
// escaneando fuentes, y su detección arranca desde el CSS de entrada: las previews de
// `.design-sync/previews/` quedaban fuera, así que cualquier clase que ellas usaran y la app no
// —`text-[2.75rem]`, `size-6`— no existía en la hoja compilada y la tarjeta renderizaba sin estilo
// SIN QUE NADA FALLARA. Un `@source` explícito las mete al escaneo.
mkdirSync(join(PKG, "ds-styles"), { recursive: true });
// La entrada vive en el REPO, no dentro del paquete: Tailwind no escana fuentes desde una hoja
// alojada en `node_modules`. Y el glob es explícito a propósito: Tailwind ignora por defecto los
// directorios que empiezan por punto, y `.design-sync` es uno — un `@source` a secas no basta.
// La SALIDA sí va al paquete,
// que es donde `cssEntry` la busca.
const entrada = ".design-sync/entrada.css";
writeFileSync(
  entrada,
  `@import "../src/app/globals.css";\n` +
    `@source "../src/components";\n` +
    `@source "./previews/**/*.tsx";\n`,
);
execFileSync(
  "node",
  [CLI, "-i", entrada, "-o", join(PKG, "ds-styles/velo.css")],
  {
    stdio: "inherit",
  },
);

// ── 3. Las fuentes, cosechadas del build de Next ──────────────────────────────────────────────
const cssDeNext = readdirSync(".next/static/chunks")
  .filter((f) => f.endsWith(".css"))
  .map((f) => readFileSync(join(".next/static/chunks", f), "utf8"))
  .join("\n");

const reglas = cssDeNext.match(/@font-face\s*{[^}]*}/g) ?? [];
if (!reglas.length) {
  throw new Error(
    "sin @font-face en .next — ¿falta correr `pnpm build` antes de esto?",
  );
}

mkdirSync(DIR_FUENTES, { recursive: true });
let copiadas = 0;
const reglasReescritas = reglas.map((regla) =>
  regla.replace(/url\(\.\.\/media\/([^)]+)\)/g, (_, archivo) => {
    copyFileSync(
      join(".next/static/media", archivo),
      join(DIR_FUENTES, archivo),
    );
    copiadas++;
    return `url(./${basename(archivo)})`;
  }),
);

// Las variables que en la app inyecta next/font como clases sobre <html>; los nombres de familia se
// leen del CSS de Next para que no se puedan desincronizar a mano.
const variables = [...cssDeNext.matchAll(/--fuente-[a-z]+:[^;}]*/g)].map(
  (m) => m[0],
);
if (variables.length !== 3) {
  throw new Error(
    `se esperaban 3 variables --fuente-*, hay ${variables.length}`,
  );
}

writeFileSync(
  join(DIR_FUENTES, "velo-fonts.css"),
  `/* Generado por .design-sync/preparar.mjs desde el build de Next — no editar a mano. */\n` +
    reglasReescritas.join("\n") +
    "\n",
);

// Las variables van al CSS PRINCIPAL, no al de fuentes: el converter extrae de `extraFonts`
// únicamente las reglas @font-face y descarta el resto del archivo. Puestas ahí, `--fuente-display`
// quedaba declarada en `@theme` pero sin valor, y todo lo que usa `font-display` —el titular de la
// zona de carga— caía a la fuente de sistema sin que nada lo señalara.
const rutaCss = join(PKG, "ds-styles/velo.css");
writeFileSync(
  rutaCss,
  readFileSync(rutaCss, "utf8") +
    `\n/* Inyectado por .design-sync/preparar.mjs: en la app las pone next/font como clases sobre <html>. */\n` +
    `:root {\n  ${variables.join(";\n  ")};\n}\n`,
);

console.log(
  `✓ paquete sintético + stub de next/link · Tailwind compilado · ${reglas.length} @font-face · ${copiadas} .woff2 · ${variables.length} variables`,
);
