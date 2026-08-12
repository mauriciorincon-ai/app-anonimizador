import { defineConfig, devices } from "@playwright/test";

// Config que el ci.yml del kit ya asume (job e2e: "pnpm test:e2e").
// Patrón validado en app-nutri-kids S1. Móvil primero: las apps del pipeline son mobile-first.
export default defineConfig({
  testDir: "tests/e2e",
  // Genera los archivos de prueba con el kit seeded antes de arrancar (ver el propio archivo).
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  // El default de Playwright son 30 s, pensados para una app en la que se hace clic en botones.
  // Este suite parsea archivos de 130 MB y transforma 500.000 filas **en paralelo con las demás
  // pruebas**, así que las pequeñas compiten por CPU con las grandes: en el `/deploy-check` del
  // S2, tres pruebas de 2.000 filas se pasaron de 30 s mientras la de 500k corría al lado. En CI
  // no se había visto porque `retries: 2` las reintentaba y la segunda pasaba — o sea que el gate
  // dependía de sus propios reintentos para taparse.
  //
  // 90 s no es un presupuesto de rendimiento: es una **alarma de incendio**. Lo que mide el
  // rendimiento de verdad es `rendimiento.spec.ts` (tareas largas del hilo principal) y el job de
  // Lighthouse, que sí comparan contra números.
  timeout: 90_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // SIEMPRE contra el build de producción, también en local. Antes el local usaba `next dev` y
    // eso hacía fallar 5 pruebas sobre un árbol limpio: el dev server abre un websocket de HMR
    // —que el gate de red denuncia, con razón— y React en modo desarrollo pide `eval()`, que la
    // CSP bloquea. Ninguna de las dos cosas existe en producción, así que eran gritos de un test
    // que no estaba mirando la aplicación que se despliega. Un suite que sale rojo cuando no pasa
    // nada acaba ignorado, y este suite es el que sostiene la promesa central del producto.
    command: "pnpm build && pnpm start",
    url: "http://localhost:3000",
    // Sin reutilizar: si hay algo escuchando en el 3000 —un `next dev` olvidado— Playwright falla
    // con "port in use", que se entiende de una. Reutilizarlo probaría otro servidor en silencio.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
