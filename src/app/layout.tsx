import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// next/font descarga las fuentes EN BUILD y las sirve desde el propio dominio. No es una
// preferencia de rendimiento: un <link> a fonts.googleapis.com sería una petición externa en
// tiempo de ejecución, y en Velo eso rompe la promesa central (y el e2e que la verifica).
// La tipografía definitiva la fija design-system.md en la Fase 3.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Velo — la aduana de tus datos",
  description:
    "Anonimiza y des-anonimiza tus tablas antes de entregarlas. Todo ocurre dentro de tu " +
    "navegador: tus datos no suben a ningún servidor, ni al nuestro.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es-CO"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
