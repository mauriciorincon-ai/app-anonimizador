import { ZonaDeCarga } from "app-anonimizador";

const nada = () => {};

export const EsperandoUnArchivo = () => (
  <ZonaDeCarga
    estado={{ fase: "vacio" }}
    onArchivo={nada}
    onReintentar={nada}
  />
);

export const ConUnError = () => (
  <ZonaDeCarga
    estado={{
      fase: "error",
      motivo: "excel-excede-tope",
      nombre: "padron-2026.xlsx",
    }}
    onArchivo={nada}
    onReintentar={nada}
  />
);
