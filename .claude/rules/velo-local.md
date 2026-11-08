---
paths:
  - "velo-local/**"
  - "docs/api/**"
  - "tests/unit/*local*"
  - ".github/workflows/**"
---

# Velo local (ADR-017): el proceso en el equipo del usuario

- **Mismo motor, sin copia:** `velo-local/` importa `src/engine/` y pone adaptadores Node para lo que hoy es del navegador (`Blob`, `postMessage`, streams); el motor no se reescribe ni se bifurca. Node 22, TypeScript strict, fuera del bundle de Next.
- **Red:** la API escucha solo en `127.0.0.1:3301`; token aleatorio por arranque, mostrado una vez; cabecera `Host` verificada (rebinding de DNS); sin CORS; cuerpo con tope. La única conexión saliente es a la base que el usuario configura.
- **Credenciales y llaves:** la conexión sale de `VELO_DB_URL` o de la consola sin eco; la frase de paso de `VELO_FRASE` o de la consola; jamás de un argumento (historial de la terminal) ni a un log, ni en un error.
- **Bases:** PostgreSQL (`pg`) y SQL Server (`mssql`). Tabla y columnas solo si existen en `information_schema`, entre las comillas del motor; valores siempre parametrizados. Sin llave primaria no hay orden estable: Velo se niega y lo dice. Se escribe en `<tabla>__velo` dentro de una transacción; la tabla de origen jamás se toca (su huella antes y después en el gate).
- **Pruebas:** el job de CI `puente` corre PostgreSQL y SQL Server en contenedor con datos del generador; `pnpm kit:base` levanta un PostgreSQL embebido (PGlite) en `127.0.0.1:5433` para el ensayo y se cierra al terminar. En el Mac del usuario no se instala ningún motor de base.
