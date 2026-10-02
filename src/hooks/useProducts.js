/**
 * CATÁLOGO — colección /products.
 *
 * Qué es: la lista de prendas de la tienda. Cada documento es una prenda con
 * nombre, precio, fotos, talles, stock por talle, colores, calce, outlet, y
 * un `active` que decide si se ve o no.
 *
 * Qué problema resuelve: que el catálogo sea el mismo para todo el mundo y
 * se actualice solo. El admin carga una prenda en /admin y, sin recargar,
 * aparece en el home, en el catálogo y en la ficha. Al revés también: si
 * guardás stock nuevo, se corrige solo en todas las pantallas.
 *
 * Qué devuelve, en tres partes:
 *   - products: el array de prendas (con `id` adelante, porque en el documento
 *     el ID no está adentro de los datos). null = todavía no cargué.
 *   - usingFallback: true SOLO en desarrollo, cuando Firestore falló y se
 *     están mostrando los productos semilla. El panel lo muestra como aviso.
 *   - productsError: el error crudo de Firestore, por si alguien quiere
 *     mostrar por qué no se pudo leer el catálogo. En producción queda seteado
 *     y `products` es `[]`, así que la UI muestra catálogo vacío.
 *
 * De qué colecciones depende: /products.
 * Quién lo consume: /src/StoreApp.jsx (useProducts, que reparte la lista a
 * las páginas) y /admin/AdminPanel.jsx (useProducts, addProduct,
 * updateProduct, deleteProduct).
 *
 * OJO con el diseño de acá: los add/update/delete de este archivo son las
 * ÚNICAS escrituras del navegador sobre /products. Y solo las puede usar el
 * admin: desde octubre 2026 las reglas dejaron /products en
 * `allow write: if isAdmin()`, porque el descuento de stock del checkout lo
 * hace el Worker, adentro del mismo commit que crea el pedido. El navegador
 * ya no toca el stock nunca.
 */

import { useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "../firebase.js";
import { SEED_PRODUCTS } from "../data/seedProducts.js";

const PRODUCTS_COL = collection(db, "products");

/** Se suscribe en vivo a la colección products de Firestore.
 *
 *  Si Firestore falla, hay DOS comportamientos distintos según dónde esté
 *  el sitio:
 *
 *  - En desarrollo: se muestran los productos semilla para poder seguir
 *    viendo/probando el diseño sin Firebase configurado.
 *  - En producción: NO se muestran. Antes caía siempre a los semilla, y eso
 *    era peligroso: si Firestore se caía (cuota, red, un cambio de reglas),
 *    la tienda seguía mostrando un catálogo FALSO con precios viejos y
 *    productos que ya no existían. El visitante agregaba prendas al carrito
 *    y recién al pagar se enteraba de que no había nada. Ahora se muestra el
 *    error (`usingFallback` / `productsError`) y el catálogo vacío.
 *
 *  OJO: devuelve TODOS los productos, incluso los desactivados
 *  (`active: false`). Antes se filtraban acá adentro y eso rompía el
 *  panel: en el momento de guardar un producto como invisible
 *  desaparecía de la tabla del admin y no había forma de volver a
 *  encenderlo. Ahora el filtro lo hace cada pantalla que lo necesita
 *  (`p.active !== false` en StoreApp).
 *
 *  Ojo sobre el resto: onSnapshot mantiene el canal abierto con Firestore y
 *  dispara el callback con la lista completa cada vez que algo cambia (no con
 *  el documento cambiado: con el resultado de la consulta). Por eso no hace
 *  falta ni guardar `updatedAt` ni andar comparando. Me devuelve una función
 *  para desuscribirme, y el cleanup la llama: sin eso el canal queda abierto
 *  y cada cambio sigue empujando estado a un componente desmontado.
 */
export function useProducts() {
  // products: la lista que se dibuja. null = todavía no llegó nada.
  const [products, setProducts] = useState(null);
  // usingFallback: true = lo que se ve NO viene de Firestore, viene de los
  // datos de ejemplo. Solo puede ser true en desarrollo.
  const [usingFallback, setUsingFallback] = useState(false);
  // productsError: el error crudo de Firestore, para diagnostics. En
  // producción se acompaña de products = [].
  const [productsError, setProductsError] = useState(null);

  useEffect(() => {
    // Tercer argumento: el callback de error. Sin él, si las reglas
    // rechazan la consulta, `products` queda en null y todas las pantallas
    // quedan girando para siempre.
    const unsub = onSnapshot(
      PRODUCTS_COL,
      (snap) => {
        // d.id va adelante y después d.data(): los campos del documento se
        // pisan sobre el id, así que un campo guardado llamado "id" (nunca
        // debería pasar) tendría el último lugar, no el primero.
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setProducts(list);
        // Llegó una respuesta: sea la que sea, ya no estamos ni en fallback
        // ni con error.
        setUsingFallback(false);
        setProductsError(null);
      },
      (err) => {
        console.error("No se pudo leer el catálogo de Firestore:", err);
        // import.meta.env.DEV es true solo con `npm run dev`: es una
        // constante que Vite reemplaza al compilar, así que la rama de
        // producción ni siquiera existe en el bundle final.
        if (import.meta.env.DEV) {
          // Desarrollo: sigo con los productos de ejemplo para poder tocar
          // el diseño sin Firebase. Les invento un id ("seed-0", "seed-1")
          // para que el resto del código ni note la diferencia.
          setProducts(SEED_PRODUCTS.map((p, i) => ({ id: `seed-${i}`, ...p })));
          setUsingFallback(true);
        } else {
          // Producción: catálogo vacío y error a la vista. Vacío a
          // propósito, nunca los semilla: es preferible una tienda en
          // blanco a una tienda con precios falsos y prendas que no
          // existen (el README de la revisión de diseño cuenta el caso).
          setProducts([]);
          setUsingFallback(false);
          setProductsError(err);
        }
      }
    );
    return () => unsub();
  }, []);

  return { products, usingFallback, productsError };
}

/**
 * Crea una prenda nueva.
 *
 * El documento lo crea Firestore con un ID automático (addDoc), no con un
 * nombre que elija el admin: las prendas no tienen "código" como los cupones
 * o las gift cards, y el nombre de la URL se arma en otro lado (el slug).
 * El `active: true` va antes del spread para que, si el panel manda active,
 * gane lo que mandó el panel y no el default.
 */
export const addProduct = (data) => addDoc(PRODUCTS_COL, { active: true, ...data });

/**
 * Actualiza una prenda existente (cambiar precio, stock, fotos, ocultarla).
 *
 * updateDoc solo pisa los campos que vienen en `data`: los que no se listan
 * quedan como estaban. Es lo que hace que el panel pueda mandar "solo
 * changedPrices" sin miedo a pisar el resto del documento.
 */
export const updateProduct = (id, data) => updateDoc(doc(db, "products", id), data);

/**
 * Borra una prenda entera, con su stock y todo.
 * OJO: no hay "papelera". Si se borra por error, no queda registro; para
 * esconder una prenda del público está el `active: false`, que además es lo
 * que el panel necesita para poder volver a encenderla.
 */
export const deleteProduct = (id) => deleteDoc(doc(db, "products", id));