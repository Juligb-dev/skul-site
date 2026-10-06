import { defineConfig } from "vitest/config";

// Config de las pruebas del CLOUDFLARE WORKER. Corre `npm run test:worker`.
//
// ¿Por qué una config aparte y no una sola? Porque el Worker no es una
// página: es código de servidor que corre en el runtime de Cloudflare, con
// `fetch`, `Request`, `Response`, WebCrypto y atob/btoa. El sitio, en
// cambio, necesita un DOM (jsdom). Meter las dos cosas en un mismo
// entorno produce tests que mienten: uno termina probando el Worker con
// un `Request` falso de jsdom, que se comporta distinto al real.
//
// Qué se gana con esto:
//  - Se importa `worker.js` TAL CUAL se despliega, sin transpilar ni
//    reescribir nada. Los tests corren contra el mismo archivo que está
//    en producción (el `main` de wrangler.jsonc).
//  - No hay mocks de `fetch` ni de `Request`: son los natives de Node.
//    Es decir, los tests de CORS, de rate limiting y de validación de
//    cuerpo se ejecutan contra la implementación real.
//  - Se puede importar el mismo archivo con `?raw` para revisar que no
//    haya secretos escritos a mano (ver secrets.test.js).
//
// Lo que NO se prueba acá: las reglas de Firestore. El Worker habla con
// Firestore por HTTP; para probar las reglas hay que levantar el emulador
// (`npm run test:rules`), que es otra cosa.
export default defineConfig({
  test: {
    // Node puro: sin DOM. El Worker no toca document ni window.
    environment: "node",
    globals: true,
    include: ["cloudflare-worker/**/*.test.js"],
    isolate: true,
    testTimeout: 15000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["cloudflare-worker/worker.js"],
      exclude: ["**/node_modules/**", "**/*.test.*"],
      thresholds: {
        // El Worker es el archivo donde está todo el dinero y los
        // permisos: acá el piso es más alto que en el sitio. Si la
        // cobertura cae, el comando falla.
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
});