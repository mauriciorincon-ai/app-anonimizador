import {
  Boton,
  IconoAdelante,
  IconoCertificado,
  IconoCuaderno,
  IconoDescargar,
  InsigniaDeCategoria,
  Panel,
} from "app-anonimizador";

// PANTALLA COMPLETA. Enseña lo que ninguna pieza suelta enseña: el ritmo entre paneles, una sola
// acción principal, y sobre todo LA REGLA DURA de Velo — el riesgo exacto y el estimado viven en
// paneles distintos, con tipografías distintas, y JAMÁS se suman ni se promedian.
export const ElBalanceDeUnTratamiento = () => (
  <div className="bg-papel text-tinta" style={{ padding: "2rem 1.5rem" }}>
    <div
      className="mx-auto w-full max-w-4xl"
      style={{ display: "grid", gap: "1.25rem" }}
    >
      <Panel
        etiqueta="Paso 4"
        titulo="El balance del tratamiento"
        nota="Cifras exactas, contadas registro por registro sobre tu archivo — no estimadas."
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: "2.5rem" }}>
          <div>
            <p className="text-tinta-tenue" style={{ fontSize: "0.8125rem" }}>
              Filas únicas antes
            </p>
            <p
              className="font-display text-tinta"
              style={{ fontSize: "2rem", fontWeight: 600, lineHeight: 1.1 }}
            >
              1.284
            </p>
          </div>
          <div>
            <p className="text-tinta-tenue" style={{ fontSize: "0.8125rem" }}>
              Filas únicas después
            </p>
            <p
              className="font-display text-acento"
              style={{ fontSize: "2rem", fontWeight: 600, lineHeight: 1.1 }}
            >
              37
            </p>
          </div>
          <div>
            <p className="text-tinta-tenue" style={{ fontSize: "0.8125rem" }}>
              Columnas tratadas
            </p>
            <p
              className="font-display text-tinta"
              style={{ fontSize: "2rem", fontWeight: 600, lineHeight: 1.1 }}
            >
              6{" "}
              <span
                className="text-tinta-tenue"
                style={{ fontSize: "1rem", fontWeight: 400 }}
              >
                de 24
              </span>
            </p>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.5rem",
            marginTop: "1.25rem",
          }}
        >
          <InsigniaDeCategoria categoria="identificador-directo" />
          <InsigniaDeCategoria categoria="cuasi-identificador" />
          <InsigniaDeCategoria categoria="dato-sensible" />
        </div>
      </Panel>

      <Panel
        etiqueta="Estimación"
        titulo="Riesgo poblacional"
        nota="Estimado con el modelo de Benedetti–Franconi (1998), suponiendo muestreo aleatorio simple. No se compone con las cifras exactas de arriba."
      >
        <p
          className="text-tinta-suave"
          style={{ fontSize: "0.9375rem", lineHeight: 1.6 }}
        >
          Con una población declarada de 50.000, se{" "}
          <strong className="text-tinta">estima</strong> que
          <span className="font-sans text-tinta" style={{ fontWeight: 600 }}>
            {" "}
            2,1 %{" "}
          </span>
          de las filas seguirían siendo únicas en la población.
        </p>
      </Panel>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
        <Boton variante="principal">
          <IconoDescargar />
          Descargar el archivo tratado
        </Boton>
        <Boton variante="discreto">
          <IconoCertificado />
          Descargar el certificado
        </Boton>
        <Boton variante="discreto">
          <IconoCuaderno />
          Anotar en la bitácora
        </Boton>
      </div>
    </div>
  </div>
);

// PANTALLA DE FORMULARIO. El idioma de campos de Velo no tiene componente propio — son controles
// nativos con clases exactas (las de la app, verificadas en la hoja compilada). Esta celda existe
// para que el agente lo IMITE en vez de inventar inputs: etiqueta block, input sobre superficie con
// borde de control, checkbox con accent-acento, y una sola acción principal.
export const LaLlaveDelProyecto = () => (
  <div className="bg-papel text-tinta" style={{ padding: "2rem 1.5rem" }}>
    <div className="mx-auto w-full max-w-4xl">
      <Panel
        etiqueta="Paso 2"
        titulo="La llave del proyecto"
        nota="Derivar cuesta 600.000 vueltas de PBKDF2 a propósito: encarece cada intento de adivinarla."
      >
        <label
          className="text-tinta block text-[0.9375rem] font-medium"
          htmlFor="frase"
        >
          Elige la frase de paso de este proyecto
        </label>
        <input
          id="frase"
          type="password"
          className="rounded-1 border-borde-control bg-superficie text-tinta mt-2 w-full max-w-md border px-3 py-2 text-[0.9375rem]"
          placeholder="Una frase larga que puedas recordar"
        />
        <p className="text-tinta-suave mt-2 text-[0.875rem] leading-relaxed">
          La defensa real es la longitud. Esta frase no se puede recuperar: si
          se pierde, los seudónimos de este proyecto no se podrán reproducir.
        </p>
        <label className="text-tinta-suave mt-4 flex max-w-md items-start gap-2 text-[0.8125rem] leading-snug">
          <input
            type="checkbox"
            defaultChecked
            className="accent-acento mt-0.5 size-4 shrink-0"
          />
          <span>
            Entiendo que Velo no guarda esta frase y no puede recuperarla por
            mí.
          </span>
        </label>
        <div style={{ marginTop: "1.25rem" }}>
          <Boton variante="principal">
            <IconoAdelante />
            Derivar la llave
          </Boton>
        </div>
      </Panel>
    </div>
  </div>
);

export const ConNotaAlPie = () => (
  <Panel
    etiqueta="Paso 3"
    titulo="El riesgo, medido"
    nota="El advisor miró 6 de 24 columnas: las que llegaron con al menos 30 valores distintos."
  >
    <p
      className="text-tinta-suave"
      style={{ fontSize: "0.9375rem", lineHeight: 1.6 }}
    >
      Hay <strong className="text-tinta">412 filas</strong> que quedan solas en
      su clase de equivalencia. Son las que un tercero podría volver a
      identificar cruzando este archivo con otro que ya tenga.
    </p>
  </Panel>
);

export const SinNota = () => (
  <Panel titulo="La política del tratamiento">
    <p
      className="text-tinta-suave"
      style={{ fontSize: "0.9375rem", lineHeight: 1.6 }}
    >
      Una decisión por columna. Lo que no marques queda intacto, y eso también
      es una decisión.
    </p>
  </Panel>
);
