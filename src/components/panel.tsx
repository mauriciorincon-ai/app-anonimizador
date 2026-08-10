// Panel canon: contenedor de sección con etiqueta, título y nota al pie opcional.
//
// La nota al pie no es adorno de plantilla: es donde viven los topes y los alcances declarados
// ("el advisor miró 6 de 24 columnas"). Un tope silencioso se lee como "lo revisé todo", y esa es
// justo la exageración que el producto no puede permitirse.

import { useId, type ReactNode } from "react";

export function Panel({
  etiqueta,
  titulo,
  nota,
  children,
  className = "",
}: {
  etiqueta?: string;
  titulo: string;
  nota?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  // La sección se nombra con su propio título: así cada panel es una región con nombre en el
  // árbol de accesibilidad y se puede saltar de una a otra, en vez de ser un `<section>` anónimo
  // que los lectores de pantalla ignoran.
  const idDelTitulo = useId();

  return (
    <section
      aria-labelledby={idDelTitulo}
      className={`border-borde bg-superficie shadow-1 rounded-3 border ${className}`.trim()}
    >
      <header className="border-borde border-b px-5 py-4">
        {etiqueta ? <p className="etiqueta mb-1.5">{etiqueta}</p> : null}
        <h2
          id={idDelTitulo}
          className="text-tinta text-xl leading-tight font-semibold"
        >
          {titulo}
        </h2>
      </header>
      <div className="px-5 py-4">{children}</div>
      {nota ? (
        <footer className="border-borde text-tinta-tenue border-t px-5 py-3 text-[0.8125rem] leading-relaxed">
          {nota}
        </footer>
      ) : null}
    </section>
  );
}
