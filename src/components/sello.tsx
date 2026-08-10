// El sello «nada sale de aquí» — el elemento de identidad de Velo.
//
// Se dibuja en SVG inline por una razón que no es de rendimiento: una imagen servida desde un CDN
// sería una petición externa, es decir, la marca que promete que nada sale del navegador estaría
// hecha de algo que sí salió. El sello tiene que ser cierto también en la pestaña de red.
//
// Reglas de uso (design-system.md § 1): va siempre con su frase, no es clicable, no reacciona a
// nada — ni al riesgo, ni al hover, ni a la carga. Es lo único de la interfaz que nunca cambia,
// porque nunca deja de ser cierto.

export function MarcaDeSello({ clase = "" }: { clase?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={clase}
      aria-hidden="true"
      focusable="false"
    >
      {/* Anillo exterior: el borde del lacre. */}
      <circle
        cx="12"
        cy="12"
        r="10.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      {/* Anillo interior discontinuo: la marca del cuño. */}
      <circle
        cx="12"
        cy="12"
        r="7.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.7"
        strokeDasharray="1.1 1.9"
        strokeLinecap="round"
        opacity="0.65"
      />
      {/* El velo: tres pliegues, el de en medio más corto. */}
      <path
        d="M7.6 9.9h8.8M9.4 12h5.2M7.6 14.1h8.8"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * El sello con su frase. `compacto` es la versión del encabezado; la extendida se usa donde la
 * promesa es el mensaje principal (la aduana en reposo).
 */
export function Sello({ compacto = false }: { compacto?: boolean }) {
  if (compacto) {
    return (
      <p className="flex items-center gap-2 text-tinta-suave">
        <MarcaDeSello clase="size-5 shrink-0 text-acento" />
        <span className="text-[0.8125rem] leading-tight">
          Nada sale de este navegador
        </span>
      </p>
    );
  }

  // La versión extendida NO repite la frase del encabezado y ya: la desarrolla. Poner dos veces
  // el mismo texto a diez centímetros de distancia no refuerza una promesa, la abarata.
  return (
    <div className="rounded-3 border-acento/25 bg-acento-tenue flex items-start gap-3 border px-4 py-3">
      <MarcaDeSello clase="text-acento mt-0.5 size-6 shrink-0" />
      <p className="text-[0.9375rem] leading-relaxed">
        <strong className="text-acento font-medium">
          Nada sale de este navegador.
        </strong>{" "}
        <span className="text-tinta-suave">
          El archivo se abre aquí mismo, en esta pestaña y en un hilo aparte. No
          hay subida, no hay servidor que lo reciba y no queda copia cuando
          cierras.
        </span>
      </p>
    </div>
  );
}
