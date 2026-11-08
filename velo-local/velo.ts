// `pnpm velo`: la entrada de Velo local (ADR-017). Lo demás vive en `./cli.ts`.

import { principal } from "./cli";

void principal(process.argv.slice(2)).then((codigo) => {
  process.exitCode = codigo;
});
