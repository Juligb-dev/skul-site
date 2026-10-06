import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Config de las pruebas del SITIO (lo que corre en el navegador).
// NO es la config del sitio: el `vite.config.js` sigue siendo el que arma
// el build de producción. Esta corre `npm run test:web`.
//
// `vitest.config.js` es un archivo aparte a propósito: si las pruebas
// vivieran en vite.config.js, el bloque `test` se cuela al build y
// Vitest tendría que estar instalado para poder compilar el sitio.
//
// Qué hace cada cosa:
//  - environment jsdom: simula el DOM del navegador para poder renderizar
//    los componentes con React Testing Library.
//  - setupFiles: un archivo que corre antes de cada suite y configura los
//    matchers de jest-dom (toBeInTheDocument, etc.) más los mocks de
//    Firebase, para que ninguna prueba pueda pegarle a la base real.
//  - include: SOLO `src/**`. El Cloudflare Worker tiene su propia config
//    (vitest.worker.config.js) porque corre en Node, no en un navegador.
//
// Lo que NO está acá y por qué: los tests de las reglas de Firestore.
// Esos necesitan el emulador de verdad (`npm run test:rules`), no un
// mock, porque justamente lo que se prueba es que Google haga cumplir
// las reglas. Un mock de Firestore no puede probar reglas.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.js"],
    include: ["src/**/*.test.js", "src/**/*.test.jsx"],
    // Aislar cada archivo de test en su propio entorno. Necesario porque
    // varios tests simulan el flujo de autenticación y usan variables de
    // módulo (el usuario de Firebase): si comparten estado se pisan entre
    // sí y los resultados dejan de ser confiables.
    isolate: true,
    // Si un test se cuelga, que no se cuelgue toda la corrida.
    testTimeout: 15000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Solo miramos el código que decide dinero, precios y permisos.
      // Los .css y el JSX puramente decorativo no se reportan para no
      // inflar el número con cosas que no tienen lógica.
      include: [
        "src/utils/**",
        "src/hooks/**",
        "src/StoreApp.jsx",
        "src/pages/Checkout.jsx",
        "src/components/CorreoShipping.jsx",
      ],
      exclude: [
        "**/node_modules/**",
        "**/*.test.*",
        // productImage.js es código MUERTO: importa `@imgly/background-removal`,
        // que NO está instalado (ver el AVISO arriba del archivo). No se puede
        // ejecutar ni testear, así que no debe arrastrar el número de cobertura.
        "src/utils/productImage.js",
      ],
      thresholds: {
        // Si la cobertura de líneas baja de esto, `npm run test:coverage`
        // falla. Es un piso bajo a propósito: no queremos que un test de
        // más o de menos rompa el build, solo que no se olvide la
        // cobertura por completo.
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
  },
});