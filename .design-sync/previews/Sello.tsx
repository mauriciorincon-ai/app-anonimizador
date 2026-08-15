import { Sello } from "app-anonimizador";

export const EnElEncabezado = () => (
  <div className="border-borde bg-papel flex items-center justify-between gap-4 border-b px-6 py-3">
    <span className="font-display text-tinta text-xl font-semibold">Velo</span>
    <Sello />
  </div>
);

export const CompactoEnUnPie = () => (
  <div className="border-borde text-tinta-tenue border-t px-6 py-4">
    <Sello compacto />
  </div>
);
