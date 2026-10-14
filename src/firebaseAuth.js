/**
 * FIREBASE AUTH — el login del panel, cargado a demanda.
 *
 * Qué problema resuelve: Firebase Auth es un módulo pesado y SOLO lo usa
 * el panel /admin (para entrar) y SiteGate cuando la tienda está cerrada
 * (para saber si sos el dueño). El visitante normal —el que entra a mirar
 * y comprar— nunca lo necesita. Si lo importamos de una, ese código viaja
 * en el bundle principal de TODA la tienda.
 *
 * Cómo lo evita: `firebase/auth` se importa con `import()` dinámico. Vite
 * lo saca del chunk principal y lo deja en uno aparte que se descarga
 * recién la primera vez que se pide la instancia de Auth. El visitante
 * que solo mira el catálogo abierto nunca baja ese archivo.
 *
 * Qué exporta: `getFirebaseAuth()`, que devuelve una promesa con la
 * instancia de Auth (misma instancia siempre: se cachea la promesa).
 */

import app from "./firebase.js";

// Promesa cacheada: la primera llamada carga el módulo y crea el Auth;
// las siguientes resuelven con lo mismo. Así `getAuth` se llama una sola
// vez (Firebase tira error si se llama dos veces con la misma app).
let promesa = null;

/**
 * Devuelve `{ auth, modulo }`:
 *   - `auth`   → la instancia de Firebase Auth.
 *   - `modulo` → las funciones del SDK (onAuthStateChanged, signIn..., etc.).
 *
 * Se devuelven juntos porque quien la pide siempre necesita los dos: la
 * instancia para pasar de primer argumento y la función para ejecutar.
 */
export function getFirebaseAuth() {
  if (!promesa) {
    promesa = import("firebase/auth").then((modulo) => ({ modulo, auth: modulo.getAuth(app) }));
  }
  return promesa;
}
