import {
  Boton,
  IconoAtras,
  IconoDescargar,
  IconoTransformar,
} from "app-anonimizador";

export const Variantes = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Boton variante="principal">
      <IconoTransformar />
      Transformar el archivo
    </Boton>
    <Boton variante="discreto">
      <IconoAtras />
      Volver al diagnóstico
    </Boton>
  </div>
);

export const UnaSolaAccionPrincipal = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Boton variante="principal">
      <IconoDescargar />
      Descargar el archivo tratado
    </Boton>
    <Boton variante="discreto">Descargar el certificado</Boton>
    <Boton variante="discreto">Anotar en la bitácora</Boton>
  </div>
);

export const Deshabilitado = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Boton variante="principal" disabled>
      <IconoDescargar />
      Todavía no hay archivo
    </Boton>
    <Boton variante="discreto" disabled>
      Sellar la bóveda
    </Boton>
  </div>
);
