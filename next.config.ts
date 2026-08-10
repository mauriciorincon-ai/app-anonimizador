import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Probado y descartado: `experimental.inlineCss` (embeber la hoja de 7 KB en el HTML para
  // ahorrarse un viaje). Medido tres veces, no mejoró el LCP simulado —2.798 / 3.084 / 3.082 ms
  // contra 2.978 / 2.936 / 2.937 sin él— porque los bytes siguen viajando en la ruta crítica, solo
  // que dentro del documento. Queda anotado para que nadie lo intente otra vez creyendo que es
  // gratis.
  // El indicador de desarrollo de Next (esquina inferior) tapa la navegación inferior
  // móvil e intercepta taps en los e2e (visto en nutri-kids S1) — apagado por default.
  devIndicators: false,
};

export default nextConfig;
