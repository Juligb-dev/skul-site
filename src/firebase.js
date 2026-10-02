/**
 * FIREBASE — la conexión de la tienda con su base de datos y con el login.
 *
 * Qué problema resuelve: sin esto, cada visitante vería su propia copia del
 * catálogo (guardada en su navegador) y vos cargarías productos solo en tu
 * máquina. Firebase es el backend gratuito que hace que "cerrar la web" y
 * "cargar productos" funcione para TODOS al mismo tiempo.
 *
 * Qué exporta: tres cosas, y todas las usan los hooks —
 *   `auth` → Firebase Auth, el login del panel (email + contraseña).
 *   `db`   → Firestore, la base de datos. Guarda en "colecciones" documentos
 *            con campos: products, orders, coupons, giftCards, settings/site...
 *   `app`  → la instancia de Firebase, por default. Casi nadie la usa directo.
 *
 * Requisito previo: la config de abajo tiene que ser la tuya (pasos 1 a 5 acá
 * abajo) y las reglas de firestore.rules tienen que estar publicadas, si no
 * Firestore rechaza todas las escrituras.
 *
 * OJO con las reglas: este archivo NO decide quién puede leer o escribir. Eso
 * lo hace firestore.rules, del lado del servidor. El apiKey de abajo es público
 * por diseño (termina en el bundle, cualquiera lo puede leer) y no protege
 * nada: lo que protege son las reglas.
 */

/* ============================================================
   FIREBASE — backend gratuito para que "cerrar la web" y
   "cargar productos" funcione para TODOS los visitantes, y no
   solo en tu propio navegador.

   Pasos (una sola vez, 5-10 min):
   1. Andá a https://console.firebase.google.com y creá un
      proyecto gratis (plan "Spark").
   2. Dentro del proyecto: Build > Authentication > Sign-in
      method > habilitá "Email/contraseña". Después en la
      pestaña "Users" creá TU usuario admin (tu email + una
      contraseña). Esa es la contraseña con la que vas a
      entrar a /admin.
   3. Build > Firestore Database > Create database (modo
      producción, la región no importa mucho, ej. us-central).
   4. Project settings (ícono de tuerca) > General > "Your apps"
      > ícono </> (Web) > registrá una app > copiá el objeto
      firebaseConfig que te muestra y pegalo abajo, reemplazando
      los valores de ejemplo.
   5. En Firestore > Rules, pegá las reglas del archivo
      firestore.rules incluido en este proyecto y publicá.
   ============================================================ */



   import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Acá abajo va tu firebaseConfig real, el que te muestra Firebase Console en
// Project settings. Todos los campos son identificadores públicos del proyecto:
// no son contraseñas y no hay que cambiarlos ni esconderlos.
const firebaseConfig = {
  apiKey: "AIzaSyBUJ0V6_9ceMm2VPvDkOsqrFaN4BXtMlrs",
  authDomain: "skullt.firebaseapp.com",
  projectId: "skullt",
  storageBucket: "skullt.firebasestorage.app",
  messagingSenderId: "329929852986",
  appId: "1:329929852986:web:67ca76164d200094580d03",
  measurementId: "G-97Y96H3N19"
};

// initializeApp "abre" el proyecto: recibe la config y devuelve la app.
// Se ejecuta una sola vez por módulo, así que Vite lo incluye una sola vez en
// el bundle.
const app = initializeApp(firebaseConfig);

// Firebase Auth: maneja el login del panel. El usuario admin es el que creaste
// en el paso 2 de arriba; su sesión vive acá y useAdminAuth la escucha.
export const auth = getAuth(app);

// Firestore: la base de datos. Todo lo que hay en las colecciones (products,
// orders, giftCards...) se consulta a través de este `db`. onSnapshot —lo que
// usan useProducts, useOrders, useSiteStatus— se suscribe a una consulta y te
// avisa cada vez que un documento cambia, sin que tengas que recargar la página.
export const db = getFirestore(app);

// La app en sí, por si algún módulo la necesita completa (hoy, ninguno).
export default app;


