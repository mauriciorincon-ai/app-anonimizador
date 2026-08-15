import { Boton, IconoAbrir } from "app-anonimizador";

// El icono nunca sustituye al texto (regla 3 del sistema): su sitio real es dentro de una acción
// etiquetada. La segunda celda amplía el trazo con FONT-SIZE, no con `size-*`: el componente fija
// h-[1.05em] w-[1.05em] y empata en especificidad, así que el tamaño lo manda siempre la tipografía
// del padre. Va con `style` en línea a propósito — una clase de Tailwind que la app no use no
// existe en la hoja compilada y la celda se vería sin estilo sin que nada fallara.
export const EnSuBoton = () => (
  <Boton variante="discreto">
    <IconoAbrir />
    Elegir la bóveda
  </Boton>
);

export const ElTrazo = () => (
  <div
    className="text-tinta"
    style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}
  >
    <span style={{ fontSize: "2.75rem", lineHeight: 1 }}>
      <IconoAbrir />
    </span>
    <span className="text-acento" style={{ fontSize: "1.5rem", lineHeight: 1 }}>
      <IconoAbrir />
    </span>
    <span className="text-tinta-tenue" style={{ fontSize: "0.8125rem" }}>
      Trazo 1,5 sobre rejilla de 24 · el tamaño lo manda el font-size del padre
    </span>
  </div>
);
