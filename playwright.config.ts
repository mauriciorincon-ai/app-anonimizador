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
  // S2, tres pruebas de 2.000 filas se pasaron de 30 s mientras la de 500k corría al lado.
  //
  // (Corrección del S3, con los logs delante: aquí decía que en CI "no se había visto porque
  // `retries: 2` las reintentaba". Falso — las 12 corridas verdes del historial reportan `N
  // passed` y **ni un solo `flaky`**, que es lo que Playwright imprime cuando un reintento
  // rescata una prueba. El timeout de 30 s nunca se disparó en el runner: solo en local, sin
  // reintentos y con la máquina ocupada. Era una inferencia razonable escrita como hecho.)
  //
  // 90 s no es un presupuesto de rendimiento: es una **alarma de incendio**. Lo que mide el
  // rendimiento de verdad es `rendimiento.spec.ts` (tareas largas del hilo principal) y el job de
  // Lighthouse, que sí comparan contra números.
  timeout: 90_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // DOS reporters en CI, no uno (kit v1.15.0) — con la razón CORREGIDA por la demo de la Fase 0.
  //
  // El delta del kit pedía este cambio "porque `github` no imprime la línea `N flaky`". Se midió
  // antes de creerlo y es falso: `github` extiende el reporter base, así que imprime el resumen
  // final —`1 flaky` incluido— Y además lo publica como anotación `::notice`. La línea nunca
  // estuvo perdida. (Demo con su salida literal en `sprints/SPRINT_003-implementation-log.md`.)
  //
  // Lo que `github` NO imprime es el avance por prueba: sin `list` el log salta de "Running 70
  // tests" al resumen, sin una sola línea intermedia. Eso es lo que se gana aquí — ver QUÉ prueba
  // corre, cuánto tarda cada una y cuál se quedó colgada. Es la información que convierte el
  // timeout de 90 s de abajo en una alarma legible en vez de un job que muere sin decir dónde.
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
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
