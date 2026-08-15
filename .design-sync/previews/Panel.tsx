import { Panel } from "app-anonimizador";

export const ConNotaAlPie = () => (
  <Panel
    etiqueta="Paso 3"
    titulo="El riesgo, medido"
    nota="El advisor miró 6 de 24 columnas: las que llegaron con al menos 30 valores distintos."
  >
    <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
      Hay <strong className="text-tinta">412 filas</strong> que quedan solas en
      su clase de equivalencia. Son las que un tercero podría volver a
      identificar cruzando este archivo con otro que ya tenga.
    </p>
  </Panel>
);

export const SinNota = () => (
  <Panel titulo="La política del tratamiento">
    <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
      Una decisión por columna. Lo que no marques queda intacto, y eso también
      es una decisión.
    </p>
  </Panel>
);

export const ConEtiquetaYTope = () => (
  <Panel
    etiqueta="Estimación"
    titulo="Riesgo poblacional"
    nota="Estimado con el modelo de Benedetti–Franconi (1998), suponiendo muestreo aleatorio simple."
  >
    <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
      Sin población declarada, Velo no estima: preferimos decirlo a devolver un
      número débil.
    </p>
  </Panel>
);
