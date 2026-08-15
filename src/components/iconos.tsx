// Iconografía de Velo. Dibujada a mano, de trazo, sobre una rejilla de 24 — cero librerías y cero
// emojis (design-system.md § 6 veta los emojis como iconografía).
//
// **Tres reglas, y las tres salen del sistema de diseño:**
//
//   1. **Ni candado, ni escudo, ni llave.** Están vetados en el § 6, y no por gusto: son el cliché
//      exacto de la seguridad que no se sostiene con hechos, y en esta app el sello ya dice lo que
//      hay que decir. Donde la acción es cifrar, el icono nombra **lo que el usuario hace**
//      —añadir, guardar— no la criptografía que ocurre debajo.
//   2. **El icono acompaña, no sustituye.** Todo botón conserva su texto; el icono es redundancia
//      útil para reconocer la acción de un vistazo, no un jeroglífico que haya que descifrar. Por
//      eso van `aria-hidden`: el lector de pantalla ya oye la etiqueta, y oírla dos veces es peor
//      que no ver el dibujo.
//   3. **Nada que sugiera subida o nube.** «Subir un archivo» es precisamente lo que Velo NO hace,
//      y una flecha hacia una nube contaría una mentira sobre el producto en el primer botón que
//      ve el usuario.
//
// Tamaño en `em`, no en píxeles: el icono crece con la letra del botón que lo lleva.

type PropsDeIcono = { readonly className?: string };

function Trazo({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`h-[1.05em] w-[1.05em] flex-none ${className}`.trim()}
    >
      {children}
    </svg>
  );
}

/** Traer o elegir un archivo. Una tabla, que es lo que Velo pide — no una nube. */
export function IconoTabla({ className }: PropsDeIcono) {
  return (
    <Trazo className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M9 9v11" />
    </Trazo>
  );
}

/** Mirar, analizar, ver el diagnóstico. */
export function IconoLupa({ className }: PropsDeIcono) {
  return (
    <Trazo className={className}>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.3-4.3" />
    </Trazo>
  );
}

/** Descargar al disco. La bandeja es del usuario: nada sube, todo baja. */
export function IconoDescargar({ className }: PropsDeIcono) {
  return (
    <Trazo className={className}>
      <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </Trazo>
  );
}

/** Ver antes de decidir. */
export function IconoOjo({ className }: PropsDeIcono) {
  return (
    <Trazo className={className}>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="2.5" />
    </Trazo>
  );
}

/** Transformar: lo que entra sale distinto. */
export function IconoTransformar({ className }: PropsDeIcono) {
  return (
    <Trazo className={className}>
      <path d="M4 8h13l-3-3M20 16H7l3 3" />
    </Trazo>
  );
}

/** El regreso: lo que salió, vuelve. */
export function IconoVolver({ className }: PropsDeIcono) {
  return (
    <Trazo className={className}>
      <path d="M9 5 4 10l5 5" />
      <path d="M4 10h10a6 6 0 0 1 0 12h-3" />
    </Trazo>
  );
}

/** Retroceder un paso. */
export function IconoAtras({ className }: PropsDeIcono) {
  return (
    <Trazo className={className}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </Trazo>
  );
}

/** Avanzar al paso siguiente. */
export function IconoAdelante({ className }: PropsDeIcono) {
  return (
    <Trazo className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Trazo>
  );
}

/** La bitácora: un cuaderno con su costura. */
export function IconoCuaderno({ className }: PropsDeIcono) {
  return (
    <Trazo className={className}>
      <path d="M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M4 17h15M9 7h6" />
    </Trazo>
  );
}

/** La bóveda: un archivador con su cajón, no un candado. */
export function IconoArchivador({ className }: PropsDeIcono) {
  return (
    <Trazo className={className}>
      <rect x="3" y="4" width="18" height="7" rx="1.5" />
      <rect x="3" y="13" width="18" height="7" rx="1.5" />
      <path d="M10 7.5h4M10 16.5h4" />
    </Trazo>
  );
}

/** Añadir: una anotación, una entrada. */
export function IconoMas({ className }: PropsDeIcono) {
  return (
    <Trazo className={className}>
      <path d="M12 5v14M5 12h14" />
    </Trazo>
  );
}

/** Descartar sin destruir nada. */
export function IconoEquis({ className }: PropsDeIcono) {
  return (
    <Trazo className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Trazo>
  );
}

/** Sacar del navegador hacia un archivo (exportar la política). */
export function IconoExportar({ className }: PropsDeIcono) {
  return (
    <Trazo className={className}>
      <path d="M12 16V4M7.5 8.5 12 4l4.5 4.5" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </Trazo>
  );
}

/** Traer un archivo de vuelta a la pantalla (importar la política). */
export function IconoImportar({ className }: PropsDeIcono) {
  return (
    <Trazo className={className}>
      <path d="M12 4v12M7.5 11.5 12 16l4.5-4.5" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </Trazo>
  );
}

/** Estimar: barras, que es lo que es — un modelo sobre una población. */
export function IconoBarras({ className }: PropsDeIcono) {
  return (
    <Trazo className={className}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </Trazo>
  );
}

/** Empezar de nuevo, desde cero. */
export function IconoReiniciar({ className }: PropsDeIcono) {
  return (
    <Trazo className={className}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v4h-4" />
    </Trazo>
  );
}

/** Abrir algo que estaba cerrado: una bóveda, una bitácora. */
export function IconoAbrir({ className }: PropsDeIcono) {
  return (
    <Trazo className={className}>
      <path d="M3 20V7a1 1 0 0 1 1-1h5.5l2 2.5H20a1 1 0 0 1 1 1V20" />
      <path d="M3 20h18" />
    </Trazo>
  );
}

/** Preparar el archivo de salida: el documento que se está armando. */
export function IconoDocumento({ className }: PropsDeIcono) {
  return (
    <Trazo className={className}>
      <path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4Z" />
      <path d="M14 3v4h4M9 13h6M9 17h4" />
    </Trazo>
  );
}

/** El certificado: un documento con su sello de comprobación. */
export function IconoCertificado({ className }: PropsDeIcono) {
  return (
    <Trazo className={className}>
      <path d="M15 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h6" />
      <path d="M9 8h6M9 12h4" />
      <circle cx="17" cy="16" r="4" />
      <path d="m15.4 16 1.2 1.2 2.2-2.4" />
    </Trazo>
  );
}
