import { MarcaDeSello } from "app-anonimizador";

// `MarcaDeSello` solo acepta `clase` (un className), así que el tamaño TIENE que venir de una
// utilidad — y solo sirven las que la app ya usa: Tailwind compila únicamente lo que encuentra en su
// código, y una clase inventada aquí no existiría en la hoja. Sin clase de tamaño el SVG no tiene
// dimensión y la celda sale vacía.
export const Tamanos = () => (
  <div
    className="text-acento"
    style={{ display: "flex", alignItems: "flex-end", gap: "1.25rem" }}
  >
    <MarcaDeSello clase="size-4" />
    <MarcaDeSello clase="size-5" />
    <MarcaDeSello clase="size-6" />
    <MarcaDeSello clase="size-8" />
  </div>
);

export const HeredaElColor = () => (
  <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
    <MarcaDeSello clase="size-8 text-acento" />
    <MarcaDeSello clase="size-8 text-tinta" />
    <MarcaDeSello clase="size-8 text-alerta" />
    <span className="text-tinta-tenue" style={{ fontSize: "0.8125rem" }}>
      currentColor — la marca nunca lleva color propio
    </span>
  </div>
);
