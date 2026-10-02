/**
 * CUPONES DE DESCUENTO — colección /coupons.
 *
 * Qué es: cada cupón es un documento cuyo ID es el propio código que escribe
 * el cliente ("SKUL10", "PRIMERACOMPRA"). Eso hace que buscar un cupón sea
 * un get puntual (documento exacto) y no haya que filtrar la colección.
 *
 * Qué problema resuelve: los tres lugares donde se usan cupones —crear y
 * editar en /admin, comprobar en el checkout y descontar al pagar— hablan
 * siempre con la misma definición y las mismas validaciones, para que no
 * haya dos verdades distintas del mismo código.
 *
 * Dónde está la parte importante: acá NO se canjea ningún cupón. El descuento
 * y el suma-uno a usedCount los hace el Cloudflare Worker, adentro del mismo
 * commit atómico que descuenta el stock y crea el pedido. Ver el bloque del
 * final del archivo.
 *
 * Qué reglas lo acompañan: firestore.rules deja el "get" de un cupón exacto
 * como público (el checkout tiene que poder comprobar el código que escribió
 * el cliente) pero deja "list" y "write" solo para el admin. Si "list" fuera
 * público, cualquiera podría bajarse TODOS los códigos de una consulta y
 * regalar descuentos.
 *
 * De qué colecciones depende: /coupons.
 * Quién lo consume: /admin/AdminPanel.jsx (useCoupons, saveCoupon,
 * deleteCoupon) y /src/StoreApp.jsx (checkCoupon).
 */

import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase.js";

// Referencia a la colección, reutilizada por todos los helpers de abajo.
const COUPONS_COL = collection(db, "coupons");

// Normaliza el código: sin espacios y en mayúsculas. Sirve para que
// " skul10 " y "SKUL10" sean el mismo cupón, y para que el ID que se busca
// sea siempre el mismo que se creó. Si no, el mismo cupón podría existir dos
// veces por una diferencia de mayúsculas.
const norm = (code) => (code || "").trim().toUpperCase();

/** Se suscribe en vivo a la colección coupons (para el panel de admin).
 *
 * onSnapshot abre un canal permanente con Firestore: cada vez que el admin
 * guarda, pausa o borra un cupón, la lista se repinta sola, sin recargar la
 * página. Es lo que hace que la tabla del panel se sienta "en vivo".
 *
 * Devuelve `coupons`, un array de objetos `{ code, ...campos }` — el código
 * va aparte porque en el documento es el ID. `null` significa "todavía no
 * cargué nada"; si la carga falla, en vez de dejar la tabla en `null`
 * (girando para siempre) la paso a `[]` y logueo el error, para que el panel
 * muestre la tabla vacía y no una pantalla en blanco. Ojo: acá se loguea en
 * la consola y no hay estado de error expuesto; si algún día quiero
 * mostrarle al admin un cartel de "no se pudieron cargar los cupones", hay
 * que sumar un estado de error.
 */
export function useCoupons() {
  const [coupons, setCoupons] = useState(null);

  useEffect(() => {
    // El tercer argumento de onSnapshot es el callback de error: sin él, si
    // las reglas de Firestore rechazan la consulta, la promesa queda
    // rechazada y la lista se queda en null para siempre.
    const unsub = onSnapshot(
      COUPONS_COL,
      (snap) => setCoupons(snap.docs.map((d) => ({ code: d.id, ...d.data() }))),
      (err) => {
        console.error("No se pudieron cargar los cupones:", err);
        setCoupons([]);
      }
    );
    return () => unsub();
  }, []);

  return { coupons };
}

/** Crea o edita un cupón. El código es el ID del documento.
 *  scope: "all" (todo el pedido) | "category" (una categoría) | "products" (lista puntual de productos) */
export const saveCoupon = async (code, { type, value, maxUses, active, scope, scopeCategory, scopeProductIds }) => {
  const ref = doc(db, "coupons", norm(code));
  // getDoc lee una sola vez, sin suscripción. Lo uso para preguntar "¿ya
  // existía?" antes de escribir.
  const snap = await getDoc(ref);
  const isNew = !snap.exists();

  // Normalizo los valores antes de guardarlos: los input del panel llegan
  // como texto, y Firestore guarda lo que le des (un "10" se guardaría como
  // texto y después las comparaciones del Worker fallarían).
  const couponData = {
    type, // "percent" | "fixed"
    value: Number(value),
    maxUses: maxUses === "" || maxUses == null ? null : Number(maxUses), // null = sin límite
    active: !!active,
    scope: scope || "all",
    // Los dos campos siguientes se limpian según el alcance elegido: si el
    // cupón dejó de ser "por categoría", su categoría vieja se borra para que
    // no quede un dato viejo pegado que influya algún cálculo.
    scopeCategory: scope === "category" ? scopeCategory || null : null,
    scopeProductIds: scope === "products" ? scopeProductIds || [] : [],
  };

  // Solo si es un cupón nuevo asignamos el contador en 0 y la fecha de creación.
  // Si se está editando o pausando, mantenemos el usedCount existente.
  // Si no, cada vez que pausaba un cupón desde el panel se le reseteaba el
  // contador y volvía a regalar descuentos desde el cero.
  if (isNew) {
    couponData.usedCount = 0;
    // serverTimestamp() pone la hora del servidor de Firestore, no la del
    // navegador: sirve para ordenar y para auditar sin depender de que el
    // reloj de la computadora del admin esté bien.
    couponData.createdAt = serverTimestamp();
  }

  // merge: true = solo pisa los campos que escribo y deja el resto (usedCount,
  // createdAt). Sin merge, cada guardado borraría todo lo demás.
  return setDoc(ref, couponData, { merge: true });
};

/** Borra el cupón de una vez (no hay "papelera"). Desde /admin. */
export const deleteCoupon = (code) => deleteDoc(doc(db, "coupons", norm(code)));

/** Chequeo rápido y de solo lectura (para mostrar "cupón válido" en el checkout
 *  sin gastar un uso todavía).
 *
 *  Devuelve siempre un objeto con `ok`:
 *   - `{ ok: false, reason }`: el motivo ya escrito para mostrarlo, y siempre
 *     en castellano.
 *   - `{ ok: true, coupon }`: el cupón ya normalizado y recortado a lo que el
 *     checkout necesita (tipo, valor y alcance). NO devuelvo usedCount ni
 *     maxUses a propósito: el navegador solo muestra, el que decide cuánto
 *     queda de uso es el Worker.
 *
 *  Ojo con el límite de usos: este chequeo es un espejo del que hará el
 *  Worker, no el que manda. Si dos personas escriben el mismo cupón al mismo
 *  tiempo, las dos ven "ok" acá y la segunda se queda sin descuento al pagar
 *  (con un mensaje de "se agotó el descuento mientras comprabas"). Prefiero eso
 *  a bloquear el checkout por un dato que puede quedar viejo al instante.
 */
export async function checkCoupon(code) {
  const ref = doc(db, "coupons", norm(code));
  const snap = await getDoc(ref);
  if (!snap.exists()) return { ok: false, reason: "No existe ese cupón." };
  const data = snap.data();
  if (!data.active) return { ok: false, reason: "Ese cupón ya no está activo." };
  // maxUses en null = cupón sin límite de usos (el `!= null` saltea el chequeo).
  if (data.maxUses != null && data.usedCount >= data.maxUses) {
    return { ok: false, reason: "Ese cupón llegó al límite de usos." };
  }
  return {
    ok: true,
    coupon: {
      code: norm(code),
      type: data.type,
      value: data.value,
      scope: data.scope || "all",
      scopeCategory: data.scopeCategory || null,
      scopeProductIds: data.scopeProductIds || [],
    },
  };
}

/* Ya NO se canjea el cupón desde el navegador.
 *
 * Eso lo hace el Cloudflare Worker junto con el pedido: dentro de la misma
 * operación atómica que descuenta el stock lee el cupón, se asegura de que
 * queden usos y suma uno a usedCount. Si el canje quedara en el navegador,
 * las reglas de Firestore tendrían que dejar abierto el canje anónimo y
 * cualquiera podría gastarse un cupón a mano.
 *
 * Concreto: el Worker manda cada escritura con un `precondition` de versión
 * (si otro pedido tocó ese documento entre la lectura y el commit, el commit
 * entero se aborta). Con eso dos compras simultáneas del mismo cupón no
 * pueden consumirse el mismo uso: una entra y la otra recibe el error de
 * "se agotó el descuento". Por eso checkCoupon queda como simple espejo: el
 * que manda es siempre el servidor.
 */