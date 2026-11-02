import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";

import { ConmutadorDeIdioma } from "@/components/conmutador-de-idioma";
import {
  EnlaceDeSalto,
  IdiomaDelDocumento,
  Pie,
} from "@/components/marco-de-pagina";
import { Sello } from "@/components/sello";
import { COMUN } from "@/lib/idioma/textos/comun";

import "./globals.css";

// next/font descarga las fuentes EN BUILD y las sirve desde el propio dominio. No es una
// preferencia de rendimiento: un <link> a fonts.googleapis.com sería una petición externa en
// tiempo de ejecución, y en Velo eso rompe la promesa central (y el e2e que la verifica).
//
// Las tres familias y su oficio están razonados en design-system.md § 2.2. En corto: Fraunces
// pone la calidez editorial que impide que el producto se lea como un panel de control, Plex Sans
// habla de tecnología con seriedad sin ser fría, y Plex Mono hace legible una tabla de cifras.
// `preload` solo en la fuente del CUERPO. Las tres se descargan igual, pero solo una entra a la
// pelea por el ancho de banda del primer instante — y es la que pinta el elemento más grande de la
// pantalla (el párrafo de entrada), o sea la que decide el LCP. Precargarlas todas las hace
// competir entre sí y retrasa justo la que importa. La display y la mono llegan un pelo después y
// entran con `swap`, sin bloquear nada.
const display = Fraunces({
  variable: "--fuente-display",
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
  preload: false,
});

const sans = IBM_Plex_Sans({
  variable: "--fuente-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const mono = IBM_Plex_Mono({
  variable: "--fuente-mono",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: COMUN.documento.titulo.es,
  description: COMUN.documento.descripcion.es,
};

function Encabezado() {
  return (
    <header className="border-borde bg-papel/85 sticky top-0 z-10 border-b backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-6 py-3">
        <Link
          href="/"
          className="font-display text-tinta text-xl leading-none font-semibold tracking-tight"
        >
          Velo
        </Link>
        <div className="flex items-center gap-4">
          <ConmutadorDeIdioma />
          <Sello compacto />
        </div>
      </div>
    </header>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es-CO"
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="bg-papel text-tinta flex min-h-full flex-col">
        <EnlaceDeSalto />
        <IdiomaDelDocumento />
        <Encabezado />
        <div id="contenido" className="flex flex-1 flex-col">
          {children}
        </div>
        <Pie />
      </body>
    </html>
  );
}
