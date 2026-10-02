/**
 * PEDIDOS — colecciones /orders (privada) y /orderTracking (pública).
 *
 * Qué es: cada pedido vive en DOS documentos con el mismo ID.
 *  - /orders/{id} es privado: nombre, teléfono, dirección, medio de pago y
 *    detalle. Solo lo leen el admin (panel) y el Worker (aviso de Telegram).
 *  - /orderTracking/{id} es público: el cliente entra con su código y ve el
 *    estado, los productos, el total y el número de Correo Argentino.
 *
 * Por qué dos: los datos personales no pueden quedar en un documento que se
 * lee sin login. Entonces lo que el comprador puede consultar va en un
 * documento aparte, con un allow list entre los campos. publicTrackingData
 * (abajo) es el único lugar donde se arma ese documento, justamente para que
 * no se cuelgue un campo personal por accidente.
 *
 * Qué problema resuelve: que /admin pueda llevar el pedido de "nuevo" a
 * "preparando" / "despachado" / "entregado" y que el comprador vea ese mismo
 * estado al instante, sin que el admin tenga que tocar dos pantallas.
 *
 * La regla de oro del módulo: desde octubre 2026 el navegador NO escribe en
 * /orders. Crear el pedido lo hace el Cloudflare Worker (createOrder, abajo).
 * Las escrituras del admin que quedan acá (setOrderStatus, setOrderTracking)
 * van por el navegador con la sesión del admin, y las reglas los dejan pasar.
 *
 * De qué colecciones depende: /orders, /orderTracking.
 * Quién lo consume: /admin/AdminPanel.jsx (useOrders, setOrderStatus,
 * setOrderTracking) y /src/StoreApp.jsx (createOrder, el checkout).
 */

import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase.js";
import { ORDER_NOTIFY_WORKER_URL } from "../data/config.js";

const ORDERS_COL = collection(db, "orders");

// El documento público usa EXACTAMENTE el mismo ID que el privado: es lo que
// permite que el cliente consulte su pedido escribiendo un solo código.
const trackingRef = (id) => doc(db, "orderTracking", id);

/**
 * Solo estos datos salen de orders hacia la colección pública
 * de seguimiento.
 *
 * IMPORTANTE:
 * nunca incluir nombre, teléfono, dirección, email ni datos de pago.
 *
 * Es una lista blanca (digo qué entra, no qué queda afuera): cada campo que
 * sume alguien tiene que decidir a mano si puede exponerse. Si algún
 * día el Worker agrega un campo al pedido, este archivo no lo copia, y
 * con esa omisión el tracking sigue sin filtrar nada.
 */
function publicTrackingData(order, status, correoTracking) {
  return {
    // Cada ítem se reconstruye con destructuring: solo sobreviven los campos
    // que escribo acá. Si un ítem tuviera un campo raro, no se copia.
    items: (order.items || []).map(
      ({ id, name, size, color, qty, price }) => ({
        id,
        name,
        size,
        color: color || null,
        qty,
        price,
      })
    ),
    total: order.total || 0,
    status,
    zoneId: order.zoneId || null,
    correoTracking: correoTracking || null,
    // No es un dato personal: es el código de la gift card que compró el
    // cliente, y lo necesita para usarla o regalarla.
    giftCardIssued: order.giftCardIssued || null,
  };
}

/**
 * Se suscribe en vivo a TODOS los pedidos.
 *
 * Esta función solamente se utiliza desde /admin.
 * Las Firestore Rules exigen que el usuario sea el administrador.
 *
 * onSnapshot deja el canal abierto con Firestore: cada pedido nuevo o cada
 * cambio de estado repinta la tabla sola, así que si estoy con el panel
 * abierto y entra una compra, la veo aparecer sin recargar (y sin tener que
 * preguntar "por qué no me aparece, ¿es que falló?").
 *
 * Devuelve `orders`: array de pedidos, del más nuevo al más viejo.
 * null = todavía no cargué. Si la carga falla (típicamente: el visitante no es
 * admin y las reglas rechazan la consulta), seteo [] y logueo el error, así
 * que el panel muestra la tabla vacía en vez de quedar girando para siempre.
 */
export function useOrders() {
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    // El orden lo pone Firestore (no el JS) y por createdAt del servidor, así
    // que dos pedidos del mismo segundo no se ordenan al azar.
    const q = query(ORDERS_COL, orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        setOrders(
          snap.docs.map((d) => ({
            id: d.id, // el ID lo genera el Worker, no el navegador
            ...d.data(),
          }))
        );
      },
      (err) => {
        console.error("No se pudieron cargar los pedidos:", err);
        setOrders([]);
      }
    );

    return () => unsub();
  }, []);

  return { orders };
}

/**
 * Cambia el estado del pedido privado y, al mismo tiempo,
 * actualiza el estado que ve el cliente en orderTracking.
 *
 * Se usa desde el panel admin.
 *
 * Por qué un writeBatch y dos llamadas sueltas: writeBatch agrupa las dos
 * escrituras y las manda como una sola unidad atómica, o sea que o se
 * actualizan las dos o ninguna. Con dos update sueltas, si la segunda fallaba
 * (red, cuota) el cliente habría visto "despachado" mientras el pedido privado
 * seguía en "preparando", y el admin queda trabajando con dos verdades.
 * Ojo: un batch no es una transaction: no lleva condiciones ni reintenta solo,
 * pero para esto (dos documentos que tienen que contar la misma historia)
 * alcanza.
 *
 * Ojo también con `update` en el pedido privado: a diferencia de `set`, falla
 * si el documento no existe. Acá está bien, porque el documento lo creó el
 * Worker.
 *
 * Si el commit falla, la excepción sube al panel, que muestra el error: el
 * pedido queda como estaba, no queda a medio cambiar.
 */
export async function setOrderStatus(order, status) {
  const batch = writeBatch(db);

  const orderRef = doc(db, "orders", order.id);
  const publicRef = trackingRef(order.id);

  // 1) El pedido privado (el que ve el admin).
  batch.update(orderRef, {
    status,
  });

  // 2) La copia pública (la que ve el cliente), reconstruida desde cero con
  // la lista blanca. merge: true para no pisar lo que ya tenga.
  batch.set(
    publicRef,
    publicTrackingData(
      order,
      status,
      order.correoTracking || null
    ),
    { merge: true }
  );

  await batch.commit();
}

/**
 * Guarda o elimina el número de seguimiento de Correo Argentino.
 *
 * Actualiza tanto el pedido privado como la copia pública
 * que puede consultar el comprador.
 *
 * Vaciar el campo (mandando "" o null) deja el número en null en los dos
 * documentos: es el mismo batch con el mismo rebuild del tracking, así que el
 * cliente y el panel siguen viendo lo mismo.
 */
export async function setOrderTracking(order, trackingCode) {
  // Normalizo a null: el documento guarda "nada" como null, no como cadena
  // vacía, para que la UI no tenga que tratar los dos casos.
  const code = trackingCode || null;

  const batch = writeBatch(db);

  const orderRef = doc(db, "orders", order.id);
  const publicRef = trackingRef(order.id);

  batch.update(orderRef, {
    correoTracking: code,
  });

  // Ojo con el status: acá reescribo el tracking con el status que tiene el
  // pedido privado en memoria (o "nuevo" si vino vacío). Si el panel tiene
  // un pedido viejo en pantalla y el status real cambió por otro lado, esta
  // escritura podría dejar el tracking con el status viejo. En la práctica no
  // pasa porque el panel trabaja con la lista viva de useOrders.
  batch.set(
    publicRef,
    publicTrackingData(
      order,
      order.status || "nuevo",
      code
    ),
    { merge: true }
  );

  await batch.commit();
}

/**
 * Crea el pedido.
 *
 * IMPORTANTE — desde octubre 2026 esto ya NO escribe directo en
 * Firestore. El navegador le manda al Cloudflare Worker QUÉ quiere
 * comprar y el Worker:
 *   - calcula los precios leyendo el catálogo real (no confía en lo que
 *     le mande el navegador),
 *   - calcula el costo de envío ( Correo Argentino o retiro en el local),
 *   - descuenta el stock, crea el pedido, crea el seguimiento público y
 *     canjea el cupón, todo en una sola operación atómica,
 *   - y avisa por Telegram.
 *
 * ¿Por qué? Para que las Firestore Rules puedan cerrar por completo la
 * escritura anónima sobre /products y /coupons. Antes el navegador
 * escribía ahí y eso dejaba abierta la puerta a que cualquiera vaciara el
 * stock o gastara un cupón a mano.
 *
 * Concreto de "atómico": el Worker manda todo con `documents:commit` y cada
 * escritura de stock / cupón / gift card lleva su `precondition` de versión
 * (si otro pedido tocó ese documento entre la lectura y el commit, el commit
 * entero se aborta). Eso es lo que impide que dos personas se lleven el
 * último talle o gasten dos veces el mismo uso de un cupón.
 *
 * Ojo también con el rate limit (límite de peticiones por IP y por minuto que
 * el Worker impone para frenar abuso): son 5/min para createOrder, así que
 * una compra legítima que reintenta rápido se puede comer el límite y
 * recibir un 429. Por eso el catch del JSON abajo tiene un mensaje genérico:
 * un 429 no viene en JSON y `data` queda vacío.
 *
 * Devuelve el ID del pedido y el total que quedó asentado (que es el
 * que calcula el servidor, no el que decía el navegador).
 */
export async function createOrder(order) {
  const workerUrl = ORDER_NOTIFY_WORKER_URL;
  // Si la URL no está cargada en config.js, no hay a quién perguntarle: tiro
  // el error acá (con un mensaje que el checkout muestra al cliente, que
  // incluye escribirnos por WhatsApp) en vez de dejar que reviente un fetch
  // con undefined.
  if (!workerUrl) {
    throw new Error(
      "No se pudo confirmar el pedido (falta configurar el Worker). Escribinos por WhatsApp."
    );
  }

  // El body lleva `action` para que el Worker sepa qué hacer; el resto del
  // pedido (nombre, teléfono, items, cupón, código de gift card) se manda tal
  // cual. OJO: no mando precios ni saldos. Mando ids, talles, cantidades y
  // códigos; el servidor lee los documentos y calcula.
  const res = await fetch(workerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "createOrder", ...order }),
  });

  // Si la respuesta no es JSON (un 429 del rate limit, un error de red del
  // proxy), el parseo falla y sigo con un objeto vacío: el chequeo de abajo
  // lo trata como error y muestra el mensaje genérico. Con .catch() el
  // rechazo de la promesa no sube hasta acá.
  const data = await res.json().catch(() => ({}));

  // Si el Worker no está conforme (409 por stock o descuento agotado, 503 si
  // falló el commit, 500 por un error interno), tiro un Error con SU
  // mensaje: el checkout lo muestra tal cual, así que el Worker escribe las
  // frases ("se agotó el stock o el descuento mientras comprabas", "no se
  // cobró nada"). Si viene sin mensaje, uso uno genérico.
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "No se pudo confirmar el pedido, intentá de nuevo.");
  }

  // giftCardIssued: si el pedido incluía una gift card comprada, es el
  // código que se le generó al comprador.
  //
  // Lo que devuelve, campo por campo:
  //   - orderId: el ID que generó el Worker (en el navegador no se elige),
  //     con el que el cliente después sigue su pedido.
  //   - total: el total REAL, recalculado por el servidor. El checkout lo usa
  //     para mostrar el número que hay que transferir, aunque difiera del
  //     resumen que se veía antes.
  //   - giftCardDiscount: cuánto se descontó de la gift card en este pedido
  //     (0 si no se usó ninguna), para que la pantalla de gracias lo detalle.
  //   - giftCardIssued: el código de la gift card COMPRADA en este pedido, o
  //     null. Si viene, el cliente lo ve y lo anota: por eso no es un dato
  //     personal y por eso puede ir también en el tracking público.
  //
  // OJO: no hay clave de idempotencia (un identificador que diga "este pedido
  // es el mismo que ya me pediste", para que un reintento no lo duplique). El
  // ID lo genera el Worker cada vez, así que si la respuesta se pierde y el
  // cliente aprieta "confirmar" otra vez, se puede crear un segundo pedido.
  // Es el tradeoff de mover todo al Worker; si alguna vez molesta, la
  // solución es mandar un nonce del navegador y que el Worker lo use como ID.
  return {
    orderId: data.orderId,
    total: data.total,
    giftCardDiscount: Number(data.giftCardDiscount) || 0,
    giftCardIssued: data.giftCardIssued || null,
  };
}