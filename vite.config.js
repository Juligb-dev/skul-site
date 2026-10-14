import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Config del BUILD DE PRODUCCIÓN (el `npm run build` que sube a Firebase
// Hosting). Las pruebas del sitio viven en vitest.config.js, aparte, para
// que este archivo no arrastre a Vitest.
export default defineConfig({
  plugins: [react()],

  build: {
    // Por defecto Vite advierte cuando un chunk supera los 500 kB. El chunk
    // más pesado de acá es el SDK de Firestore (la base de datos en tiempo
    // real), que ronda los 600 kB y NO se puede achicar: es código de Google
    // que la tienda necesita para leer el catálogo. El límite se sube para
    // que el aviso no tape avisos nuevos de verdad; el número es a ojo, con
    // margen sobre el tamaño real.
    chunkSizeWarningLimit: 700,

    rollupOptions: {
      output: {
        // manualChunks parte el código de terceros (node_modules) en chunks
        // separados del código propio. Por qué conviene: el hash del nombre
        // del archivo cambia solo cuando cambia su contenido, así que en el
        // próximo deploy el visitante que ya entró re-descarga únicamente el
        // chunk de la app (chico) y sigue usando el de Firebase/React desde
        // la caché del navegador.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;

          // Firebase Auth va APARTE y no se fuerza a ningún chunk: lo carga
          // el import() dinámico de src/firebaseAuth.js, así que solo baja
          // cuando se entra al panel o cuando la tienda está cerrada. Si lo
          // metiéramos en el chunk "firebase", viajaría en la carga inicial
          // y se perdería esa mejora.
          if (id.includes("/firebase/auth") || id.includes("/@firebase/auth")) {
            return undefined;
          }

          if (id.includes("/@firebase/") || id.includes("/firebase/")) return "firebase";
          if (id.includes("/react-dom/") || id.includes("/react/") || id.includes("/scheduler/")) {
            return "react";
          }
          return undefined;
        },
      },
    },
  },
});
