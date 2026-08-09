import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El indicador de desarrollo de Next (esquina inferior) tapa la navegación inferior
  // móvil e intercepta taps en los e2e (visto en nutri-kids S1) — apagado por default.
  devIndicators: false,
};

export default nextConfig;
