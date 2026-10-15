import { defineConfig, devices } from "@playwright/test";

/**
 * CONFIG DE LAS PRUEBAS E2E (Playwright + Axe).
 *
 * Qué problema resuelve: las pruebas de `src/**` (Vitest) corren en jsdom,
 * un navegador falso sin layout ni CSS. Eso alcanza para probar la lógica
 * del carrito y del checkout, pero NO para dos cosas que solo existen en
 * un navegador de verdad:
 *
 *   1. Que la tienda ARRANQUE: que el bundle cargue, que React monte y que
 *      no haya un error de JS dejando la página en blanco. Un jsdom con
 *      mocks no lo puede ver.
 *   2. La accesibilidad real (Axe): contraste de colores, nombres
 *      accesibles, orden de encabezados. Axe necesita el DOM pintado con
 *      los estilos aplicados.
 *
 * Qué corre: `npm run test:e2e` (ver package.json). Los tests viven en
 * `e2e/`. Esta config NO la usa Vitest: `vitest.config.js` solo incluye
 * `src/**`, así que ninguna de las dos herramientas pisa a la otra.
 *
 * CÓMO LEVANTA EL SITIO: `webServer` corre el build de producción y sirve
 * `dist/` con `vite preview` en el puerto 4173. Se prueba el build real (el
 * mismo que sube a Firebase Hosting), no el servidor de desarrollo: así los
 * errores que solo aparecen con el código minificado también saltan.
 *
 * Lo que estas pruebas NO cubren y por qué:
 *   - Los headers de `firebase.json` (CSP, X-Frame-Options...). `vite
 *     preview` no los aplica; solo existen una vez desplegado en Firebase.
 *   - El pago real. A propósito: ver el AVISO en `e2e/tienda.spec.js`.
 */
export default defineConfig({
  testDir: "./e2e",

  // Los archivos de test corren en paralelo entre sí; dentro de un archivo,
  // en orden. Con pocos tests alcanza y la corrida es bien corta.
  fullyParallel: true,
  // Si quedó un `test.only` suelto, que falle en CI en vez de saltear el resto.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // En CI conviene limitar los workers; en local, que use los que quiera.
  workers: process.env.CI ? 2 : undefined,

  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],

  // Una visita real puede tardar: Firestore tiene que responder. Damos
  // margen generoso para que el test falle por un problema real y no por
  // una conexión lenta.
  timeout: 60_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: "http://localhost:4173",
    // Si un test falla y se reintenta, guardamos la traza para depurar.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  webServer: {
    // Build de producción + preview. `--strictPort` hace fallar si el 4173
    // está ocupado, en vez de tomar otro puerto y que Playwright espere en
    // el aire.
    command: "npm run build && npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173",
    // En local reusamos el server si ya está levantado (para no reconstruir
    // en cada corrida); en CI siempre se levanta de cero.
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
