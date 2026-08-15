import { InsigniaDeCerteza } from "app-anonimizador";

export const LosTresNiveles = () => (
  <div className="flex flex-wrap items-center gap-2">
    <InsigniaDeCerteza certeza="algoritmo-oficial" />
    <InsigniaDeCerteza certeza="estructural" />
    <InsigniaDeCerteza certeza="sin-confirmar" />
  </div>
);

export const SinConfirmarNoEsUnFallo = () => (
  <div className="text-tinta max-w-md text-[0.9375rem] leading-relaxed">
    <p className="mb-3">
      Cuando la evidencia no alcanza, Velo lo dice en vez de adivinar:
    </p>
    <InsigniaDeCerteza certeza="sin-confirmar" />
  </div>
);
