/**
 * ============================================================
 *  ENVÍOS POR CORREO ARGENTINO (API MiCorreo)
 * ------------------------------------------------------------
 *  Cómo funciona el envío por Correo Argentino desde acá: NO hay
 *  precios fijos. Correo Argentino no publica una tarifa única: el
 *  precio depende del peso del paquete y del código postal de
 *  destino (a veces más lejos, más caro). Por eso el precio se pide
 *  "en vivo" a la API de MiCorreo, el sistema de correros oficial.
 *
 *  Un paquete de ropa pesa típicamente 300-600 gramos, y por eso en
 *  el carrito cada prenda tiene su campo `weight` en GRAMOS: la
 *  cotización real se hace con la suma de esos pesos.
 *
 *  Detalle de la API que conviene tener a mano (todo esto lo hace el
 *  Worker, no este archivo):
 *    - MiCorreo devuelve DOS tarifas para un mismo envío, según cómo
 *      termine: a domicilio (D) o retiro en sucursal (S). Por eso el
 *      Worker pide las dos juntas y acá las separamos.
 *    - Las provincias se piden por una LETRA (A = Salta, B = Buenos
 *      Aires, X = Córdoba...). La lista está en CORREO_PROVINCES,
 *      en src/data/config.js.
 *    - El usuario, la contraseña y el número de cliente de MiCorreo
 *      NUNCA están en el navegador: viven como variables privadas
 *      del Cloudflare Worker. Por eso el navegador habla con el
 *      Worker y no con MiCorreo directo.
 *
 *  Qué exporta: `getShippingRates` y `getAgencies`.
 *  Quién las usa: src/components/CorreoShipping.jsx (el bloque de
 *  envío del checkout).
 *  Qué tiene que estar configurado afuera: ORDER_NOTIFY_WORKER_URL
 *  en src/data/config.js. Sin esto ninguna de las dos funciona.
 * ============================================================
 */
import { ORDER_NOTIFY_WORKER_URL } from "../data/config.js";

/** Pide al Worker que cotice un envío por Correo Argentino a un
 *  código postal. Devuelve { domicilio, sucursal } en pesos, o
 *  null en cada uno si esa modalidad no está disponible.
 *  Tira un Error con mensaje legible si algo falla.
 *
 *  `weight` va en gramos: se calcula sumando el peso de cada
 *  prenda del carrito (400 por defecto si el producto no lo tiene).
 *  El precio que devuelve es solo una anticipación para mostrarlo;
 *  el Worker vuelve a cotizar al confirmar el pedido, así que un
 *  cliente que manipule el valor no puede pagar de menos. */
export async function getShippingRates(postalCode, weight) {
  // Sin URL no hay a quién preguntarle: tiro acá con el nombre de la
  // constante en el mensaje para que el error sirva de guía al que la configure.
  if (!ORDER_NOTIFY_WORKER_URL) {
    throw new Error("Falta configurar ORDER_NOTIFY_WORKER_URL en config.js");
  }
  // action es lo que le dice al Worker qué_endpoint quiere ("rates"
  // = cotizar, "agencies" = listar sucursales). El nombre de la
  // variable postalCodeDestination es el que espera la API de MiCorreo.
  const res = await fetch(ORDER_NOTIFY_WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "rates", postalCodeDestination: postalCode, weight }),
  });
  // Si MiCorreo está caído, el Worker devuelve un error ya reservado
  // en palabras-legibles; el catch cubre el caso de que la respuesta
  // ni siquiera sea JSON.
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "No se pudo cotizar el envío. Probá de nuevo.");
  return data; // { domicilio: number|null, sucursal: number|null }
}

/** Pide al Worker la lista de sucursales de Correo de una
 *  provincia. Devuelve un array de { code, name, city, address }.
 *
 *  Recibe el CÓDIGO de provincia (la letra: "B", "X"...), no el
 *  nombre. Sirve para que el cliente elija dónde retirar su pedido:
 *  el `code` es el que después viaja al Worker al crear el pedido. */
export async function getAgencies(provinceCode) {
  // Mismo chequeo que arriba: acá también depende del Worker.
  if (!ORDER_NOTIFY_WORKER_URL) {
    throw new Error("Falta configurar ORDER_NOTIFY_WORKER_URL en config.js");
  }
  const res = await fetch(ORDER_NOTIFY_WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "agencies", provinceCode }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "No se pudieron traer las sucursales.");
  // Si la respuesta vino sin la lista (o vino vacía), prefiero devolver
  // un array vacío: el componente puede recorrerlo sin romperse.
  return data.agencies || [];
}
