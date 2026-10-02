/**
 * ============================================================
 *  AVISOS POR TELEGRAM
 * ------------------------------------------------------------
 *  Cómo funcionan los avisos acá: hay un bot de Telegram creado en
 *  @BotFather que tiene un token (un texto larguísimo que lo
 *  identifica) y un chat_id (el número del chat o canal donde escribe).
 *  Mandarle un mensaje es pegarle a la API de Telegram:
 *      https://api.telegram.org/bot<TOKEN>/sendMessage
 *
 *  Ni el token ni el chat_id pueden estar en este archivo: todo lo
 *  que está acá se descarga el visitante al entrar a la web, así que
 *  cualquiera podría leerlos del código fuente y mandar mensajes en
 *  nombre de la tienda (o copiar el token y quedarse con el bot).
 *
 *  Por eso los avisos pasan por el Cloudflare Worker, que corre en
 *  servidores de Cloudflare y guarda el token como secreto
 *  (variable de entorno privada, que nunca sale del Worker).
 *
 *  Qué exporta: `notifyNewSubscriber`.
 *  Quién la usa: src/components/Footer.jsx (el form del newsletter).
 *  Qué tiene que estar configurado afuera: ORDER_NOTIFY_WORKER_URL en
 *  src/data/config.js. Si está vacía, esta función no hace nada
 *  (y está bien: el aviso es un extra, no puede romper la compra).
 * ============================================================
 */
import { ORDER_NOTIFY_WORKER_URL } from "../data/config.js";

// Ya no se avisa el pedido nuevo desde el navegador: lo hace el propio
// Worker dentro de createOrder, en el mismo paso que guarda el pedido.
//
// Antes passing por acá era redundante (y era una segunda llamada al
// Worker en cada compra). La acción `notify` del Worker sigue existiendo
// por si alguna vez necesitás reenviar un aviso a mano.

/** Avisa una suscripción nueva al newsletter.
 *
 *  Igual que con los pedidos: el navegador NO manda el mail, solo el
 *  ID del documento. El Worker lo lee de Firestore y arma el
 *  mensaje. Así el endpoint no sirve para escribir texto libre en tu
 *  Telegram.
 *
 *  Si no configuraste ORDER_NOTIFY_WORKER_URL, no hace nada (la
 *  suscripción queda guardada igual y se ve en /admin).
 *
 *  Lo único que mando del lado del cliente es el `subscriberId`: el
 *  Worker busca ese documento en la colección y arma el texto con el
 *  mail. Si le dejáramos mandar el texto, cualquiera que descubriera
 *  la URL podría escribirte lo que quiera en tu Telegram. */
export async function notifyNewSubscriber(subscriberId) {
  // Sin Worker: aviso a la consola y salida limpia. Deliberadamente
  // NO tiro un Error, porque el mail del visitante ya quedó guardado.
  if (!ORDER_NOTIFY_WORKER_URL) {
    console.warn("Aviso de suscripciones no configurado: ver /cloudflare-worker/README.md");
    return;
  }

  try {
    const res = await fetch(ORDER_NOTIFY_WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "subscribe", subscriberId }),
    });
    // res.text() porque el Worker puede responder con texto plano y no
    // con JSON; con el cuerpo entero vemos el motivo en la consola.
    if (!res.ok) console.error("El worker de notificaciones respondió con error:", await res.text());
  } catch (err) {
    // El mail ya quedó guardado: que falle el aviso no es motivo
    // para decirle al visitante que no se suscribió.
    console.error("No se pudo avisar la suscripción nueva:", err);
  }
}
