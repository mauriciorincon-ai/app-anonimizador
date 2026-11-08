// La conexión a la base que el usuario configura: la ÚNICA conexión saliente de Velo local.
// Los drivers se cargan al usarlos: quien trabaja con PostgreSQL no carga el de SQL Server.

import { motorDe, type Conexion } from "./motor";

export async function conectar(url: string): Promise<Conexion> {
  if (motorDe(url) === "postgres") {
    const { conectarPostgres } = await import("./postgres");
    return conectarPostgres(url);
  }
  const { conectarSqlServer } = await import("./sqlserver");
  return conectarSqlServer(url);
}
