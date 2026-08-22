import type { NextConfig } from "next";

// Política de seguridad de contenido.
//
// La directiva que carga con el peso del producto es **`connect-src 'self'`**: el navegador se
// niega a abrir una conexión que no sea al propio origen, así que aunque un día se colara una
// línea de código que intentara mandar algo afuera, el navegador la pararía antes que nosotros.
// Es el cinturón que respalda al e2e de la garantía de red — el test prueba que no pasa; esto
// hace que no pueda pasar.
//
// `script-src` lleva `'unsafe-inline'`, y conviene decir por qué en vez de llamar a esto "CSP
// estricta" y seguir: Next inyecta en el HTML un script de arranque para la hidratación, y sin
// nonce —que exigiría renderizado dinámico y le quitaría a la app su naturaleza estática— no hay
// forma de permitirlo sin la palabra. La superficie que abre es pequeña en esta app concreta:
// no hay backend, no se renderiza HTML del usuario en ninguna parte (todo lo que viene del
// archivo pasa por nodos de texto de React, que escapan), y `connect-src` sigue cerrado. Queda
// como deuda declarada, no como descuido.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  // Ni un servidor al que llamar: la app no tiene backend y sus datos no viajan.
  "connect-src 'self'",
  // El worker es el que hace el trabajo pesado; vive en el propio origen.
  "worker-src 'self' blob:",
  // La vista previa del reporte es un iframe `srcdoc`, sin scripts y en sandbox.
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

const CABECERAS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Ni siquiera el nombre del sitio viaja al navegar hacia afuera.
  { key: "Referrer-Policy", value: "no-referrer" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  // Probado y descartado: `experimental.inlineCss` (embeber la hoja de 7 KB en el HTML para
  // ahorrarse un viaje). Medido tres veces, no mejoró el LCP simulado —2.798 / 3.084 / 3.082 ms
  // contra 2.978 / 2.936 / 2.937 sin él— porque los bytes siguen viajando en la ruta crítica, solo
  // que dentro del documento. Queda anotado para que nadie lo intente otra vez creyendo que es
  // gratis.
  // El indicador de desarrollo de Next (esquina inferior) tapa la navegación inferior
  // móvil e intercepta taps en los e2e (visto en nutri-kids S1) — apagado por default.
  devIndicators: false,

  async headers() {
    return [{ source: "/:ruta*", headers: CABECERAS }];
  },

  // `/conoce` sirve el brochure vivo. Es un HTML autocontenido de `docs/` que
  // `scripts/copiar-brochure.mjs` deja en `public/conoce.html` durante `dev` y `build`, y no
  // una página de Next: el documento tiene que poder abrirse con doble clic sin servidor, y
  // partirlo en componentes rompería justo eso. La reescritura le da la ruta limpia, sin
  // `.html`. La CSP de arriba lo sirve tal cual — su estilo y su script van en línea, y
  // `'unsafe-inline'` ya está declarado con su razón.
  async rewrites() {
    return [{ source: "/conoce", destination: "/conoce.html" }];
  },
};

export default nextConfig;
