/**
 * ============================================================
 *  SETUP DE LAS PRUEBAS DEL SITIO
 * ------------------------------------------------------------
 *  Este archivo corre antes de cada archivo de test (ver
 *  `setupFiles` en vitest.config.js) y deja el entorno listo para que
 *  los tests usen el código REAL del sitio sin tocar nada real.
 *
 *  Lo que hace, en orden:
 *
 *   1) Los matchers de `@testing-library/jest-dom`, para poder escribir
 *      `expect(algo).toBeInTheDocument()` en vez de inspeccionar el DOM a
 *      mano.
 *
 *   2) Apaga TODAS las salidas a internet. `fetch` queda simulado y
 *      `globalThis.fetch` tira un error claro si algún código intenta
 *      llamar a un servicio que el test no preparó. Es la regla más
 *      importante de este archivo: un test que sale a la red no es un
 *      test, es una compra. Y si un test pegara contra el Firebase o el
 *      Worker de PRODUCCIÓN, podría modificar precios de verdad o borrar
 *      pedidos. Por eso, más que "no permitir" la red, la dejamos
 *      apuntando a una cosa falsa que se queja.
 *
 *   3) Reemplaza Firebase por un doble de prueba:
 *        - `firebase/app` y `firebase/auth` → objetos vacíos. NO se
 *          importan los módulos reales: `getAuth()` real exige un
 *          FirebaseApp con datos internos y revienta si se le pasa un
 *          objeto de mentira.
 *        - `firebase/firestore` → la base en memoria de
 *          `src/test/mocks/firestore.js`, que guarda todo en un Map.
 *
 *  Lo que NO se simula acá (a propósito): las REGLAS de seguridad. El
 *  falso de Firestore deja escribir cualquier cosa, porque acá se prueba
 *  LÓGICA, no permisos. Los permisos se prueban en otro lado, con el
 *  emulador de Firestore y el firestore.rules del proyecto: `npm run
 *  test:rules`. Un mock no puede probar reglas.
 * ============================================================
 */
import "@testing-library/jest-dom/vitest";
import { vi, beforeEach, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { __fs } from "./mocks/firestore.js";

/* ------------------------------------------------------------------
 * 1) Estado de la sesión simulada
 * ------------------------------------------------------------------
 * Se expone en `globalThis.__auth` para que los tests puedan poner y
 * sacar un usuario logueado:
 *
 *   globalThis.__auth.currentUser = { uid: "Ii35YT...", email: "..." }
 *   globalThis.__auth.currentUser = null;
 *
 * `vi.hoisted` sube esta creación antes de los imports, que es lo que
 * necesita `vi.mock` (que también se sube).
 */
const auth = vi.hoisted(() => ({
  currentUser: null,
  /** Errores que el próximo signIn va a tirar (para probar el login malo). */
  signInError: null,
}));

/* ------------------------------------------------------------------
 * 2) Firebase: doble de prueba
 * ------------------------------------------------------------------
 * Objetos planos. No se importa nada de los módulos reales porque los
 * módulos reales de Firebase no solo hacen red: también exigen que el
 * objeto que le pases sea una app de Firebase de verdad (con su
 * proveedor, sus opciones y sus claves). Un `{ name: "[DEFAULT]" }`
 * a mano no alcanza y `getAuth` revienta con "getProvider".
 */
vi.mock("firebase/app", () => ({
  initializeApp: () => ({ name: "[DEFAULT]", options: {}, type: "app" }),
  getApps: () => [{ name: "[DEFAULT]" }],
  getApp: () => ({ name: "[DEFAULT]" }),
  deleteApp: async () => {},
}));

vi.mock("firebase/auth", () => ({
  getAuth: () => ({ name: "auth/falso", currentUser: null }),
  // Sin usuario logueado por defecto: el 90% de los tests son de visitante
  // y si arrancaran logueados se comportamiento distinto sin querer.
  onAuthStateChanged: (_auth, callback) => {
    callback(auth.currentUser);
    return () => {};
  },
  signInWithEmailAndPassword: async () => {
    if (auth.signInError) throw auth.signInError;
    auth.currentUser = { uid: "Ii35YTENxZePLzloJkaC99AL5rn1", email: "admin@skul.test" };
    return { user: auth.currentUser };
  },
  signOut: async () => {
    auth.currentUser = null;
  },
  sendPasswordResetEmail: async () => {},
  setPersistence: async () => {},
  browserLocalPersistence: {},
  GoogleAuthProvider: class {},
  updateProfile: async () => {},
}));

/* Firestore: la base en memoria. Ver src/test/mocks/firestore.js. */
vi.mock("firebase/firestore", () => import("./mocks/firestore.js"));

/* ------------------------------------------------------------------
 * 3) Red apagada
 * ------------------------------------------------------------------ */
beforeEach(() => {
  globalThis.__auth = auth;
  auth.currentUser = null;
  auth.signInError = null;

  // La base se vacía entre tests: si no, un documento que sembró un test
  // aparecería en el siguiente y el resultado dependería del orden.
  __fs.reset();

  globalThis.fetch = vi.fn(async (url) => {
    throw new Error(
      `Los tests no pueden salir a internet (se intentó llamar a "${String(url)}"). ` +
        "Si el test necesita una API, que la declare con vi.stubGlobal o use el falso de Firestore."
    );
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/* ------------------------------------------------------------------
 * 4) El DOM que JSDOM no trae
 * ------------------------------------------------------------------
 * JSDOM implementa una parte del navegador y nada de esto. Los
 * componentes los usan y sin esto reventan con "matchMedia is not a
 * function".
 */

// `prefers-reduced-motion`: lo consulta el hook de animaciones para
// respetar a quien pidió menos movimiento en el sistema.
globalThis.matchMedia = (query) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
});

// ResizeObserver: lo usa cualquier componente que mida un elemento.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// IntersectionObserver: lo usa useReveal (los bloques que aparecen al
// hacer scroll). JSDOM no lo trae y sin esto cualquier componente que
// envuelva contenido en `<Reveal>` revienta al montarse.
globalThis.IntersectionObserver = class {
  constructor(callback) {
    this.callback = callback;
    this.observed = [];
  }
  observe(el) {
    this.observed.push(el);
  }
  unobserve() {}
  disconnect() {}
};

// scrollTo / scrollIntoView: el carrito y el checkout hacen scroll al
// cambiar de paso.
Element.prototype.scrollTo = () => {};
Element.prototype.scrollIntoView = () => {};