/**
 * ============================================================================
 * Carga los 15 productos de ejemplo en Firestore, una sola vez,
 * para no tener que cargarlos a mano desde /admin.
 * Uso: npm run seed:products
 * (necesita que ya hayas completado src/firebase.js con tu config real)
 * ============================================================================
 *
 * Qué es este archivo: un script de Node (un archivo que se corre por
 * terminal, no una página) que escribe directo en Firestore saltándose el
 * panel de admin.
 *
 * Qué problema resuelve: armar un catálogo de 15 prendas a mano desde /admin
 * es lentísimo. Yo subo los productos de ejemplo una sola vez para que el
 * catálogo arranque con contenido y no se vea la tienda vacía, y después se
 * edita todo desde /admin.
 *
 * Para quién es: para el dev, la primera vez que levanta el proyecto. Es de
 * un solo uso: si lo volvés a correr, duplica los 15 productos (no hace
 * upsert, hace addDoc siempre). Los datos salen de src/data/seedProducts.js,
 * no están en este archivo.
 *
 * Cómo se ejecuta:
 *   npm run seed:products
 *
 * Qué hay que tener listo antes:
 *   - La config real de Firebase pegada en `firebaseConfig`, más abajo (copiala
 *     de src/firebase.js: apiKey, authDomain, projectId, storageBucket,
 *     messagingSenderId y appId; el que de verdad importa es projectId).
 *   - Permisos: la cuenta de Firebase Auth que se use tiene que tener rol de
 *     escritura en Firestore (la de la sesión que abriste en el navegador
 *     alcanza). Ojo: con las reglas de este proyecto, un usuario anónimo NO
 *     puede escribir /products, así que este script tiene que correr con la
 *     API key de un proyecto donde tu sesión ya sea admin.
 *
 * OJO — SIEMPRE apuntá al proyecto de pruebas. Si pegás acá el projectId de
 * producción vas a meter los 15 productos de ejemplo en la tienda real.
 * ============================================================================
 */

import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc } from "firebase/firestore";
import { SEED_PRODUCTS } from "../src/data/seedProducts.js";

// Pegá acá el mismo firebaseConfig que tenés en src/firebase.js
// (en src/firebase.js este mismo objeto es público: la API key de Firebase NO
// es un secreto, el que no se publica nunca es el API secret y las reglas).
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxxxxxxxx",
};

// Conecto el SDK de Firebase con esa config y saco la base de datos.
// `initializeApp` deja la app lista; `getFirestore(app)` devuelve el "db" con el
// que hago las escrituras de abajo.
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const run = async () => {
  // Un addDoc por producto, uno atrás del otro (por eso el for y el await
  // adentro: así cada escritura ya terminó cuando empieza la siguiente, y si
  // una falla vemos cuál fue). `addDoc` genera el ID automáticamente; no
  // busca ni reemplaza ningún documento existente.
  for (const p of SEED_PRODUCTS) {
    await addDoc(collection(db, "products"), p);
    console.log("Cargado:", p.name);
  }
  console.log(`Listo. Se cargaron ${SEED_PRODUCTS.length} productos.`);
  // Salgo con código 0 explícito para que un `&&` en un script que encadene
  // comandos sepa que salió bien.
  process.exit(0);
};

// Si algo explota (config inválida, sin permisos, sin red), caemos acá: se
// imprime el error y se sale con código 1, que es "falló".
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
