import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";

import { Sello } from "@/components/sello";

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
  title: "Velo — la aduana de tus datos",
  description:
    "Anonimiza y des-anonimiza tus tablas antes de entregarlas. Todo ocurre dentro de tu " +
    "navegador: tus datos no suben a ningún servidor, ni al nuestro.",
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
        <Sello compacto />
      </div>
    </header>
  );
}

function Pie() {
  return (
    <footer className="border-borde text-tinta-tenue mt-16 border-t">
      <div className="mx-auto w-full max-w-4xl px-6 py-6 text-[0.8125rem] leading-relaxed">
        <p className="text-tinta-suave font-medium">
          Velo para entregar. Desvelo para recuperar.
        </p>
        <p className="mt-1">
          Velo mide el riesgo de reidentificación y lo muestra tal como es.
          Reducir ese riesgo no es lo mismo que eliminarlo: ninguna técnica de
          anonimización lo lleva a cero, y esta herramienta no dice lo
          contrario.
        </p>
      </div>
    </footer>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es-CO"
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="bg-papel text-tinta flex min-h-full flex-col">
        <a
          href="#contenido"
          className="bg-acento text-papel focus:rounded-1 sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-20 focus:px-4 focus:py-2"
        >
          Saltar al contenido
        </a>
        <Encabezado />
        <div id="contenido" className="flex flex-1 flex-col">
          {children}
        </div>
        <Pie />
      </body>
    </html>
  );
}
