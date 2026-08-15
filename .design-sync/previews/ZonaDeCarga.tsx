import {
  Boton,
  IconoCuaderno,
  IconoVolver,
  Sello,
  ZonaDeCarga,
} from "app-anonimizador";

const nada = () => {};

// PANTALLA COMPLETA. Existe porque las piezas sueltas no enseñan el ritmo: cuánto aire, dónde va el
// sello, qué pesa más. Es la portada real de Velo, compuesta con los componentes reales — ninguna
// pieza está redibujada aquí.
export const LaAduana = () => (
  <div className="bg-papel text-tinta" style={{ minHeight: "34rem" }}>
    <header
      className="border-borde bg-papel"
      style={{ borderBottomWidth: 1, position: "sticky", top: 0 }}
    >
      <div
        className="mx-auto w-full max-w-4xl"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          padding: "0.75rem 1.5rem",
        }}
      >
        <span
          className="font-display text-tinta"
          style={{ fontSize: "1.25rem", fontWeight: 600 }}
        >
          Velo
        </span>
        <Sello />
      </div>
    </header>

    <main
      className="mx-auto w-full max-w-4xl"
      style={{ padding: "2.5rem 1.5rem" }}
    >
      <h1
        className="font-display text-tinta"
        style={{ fontSize: "2rem", fontWeight: 600, marginBottom: "0.5rem" }}
      >
        Entrega tus datos sin entregar a tu gente
      </h1>
      <p
        className="text-tinta-suave"
        style={{
          fontSize: "1.0625rem",
          lineHeight: 1.6,
          maxWidth: "44rem",
          marginBottom: "2rem",
        }}
      >
        Velo mira tu tabla, te dice qué hay de sensible y cuánto riesgo real
        corres. Después la transforma — y cuando el tercero te la devuelva
        trabajada, la restaura.
      </p>

      <ZonaDeCarga
        estado={{ fase: "vacio" }}
        onArchivo={nada}
        onReintentar={nada}
      />

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          marginTop: "2rem",
        }}
      >
        <Boton variante="discreto">
          <IconoVolver />
          Ya tengo mi bóveda y el archivo devuelto
        </Boton>
        <Boton variante="discreto">
          <IconoCuaderno />
          Abrir mi bitácora
        </Boton>
      </div>
    </main>

    <footer
      className="border-borde text-tinta-tenue"
      style={{ borderTopWidth: 1, marginTop: "2rem" }}
    >
      <div
        className="mx-auto w-full max-w-4xl"
        style={{ padding: "1.5rem", fontSize: "0.8125rem" }}
      >
        <Sello compacto />
      </div>
    </footer>
  </div>
);

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
