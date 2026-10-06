/**
 * ============================================================
 *  PRECIOS — el único lugar del sitio que calcula el resumen
 * ------------------------------------------------------------
 *  Todo lo que la tienda muestra como "cuánto te sale esto" sale de
 *  esta única función. Vive afuera de React (es pura: entra un carrito,
 *  sale un resumen) para poder probarse sin pantalla y para que el
 *  checkout y cualquier otra vista muestren SIEMPRE la misma cuenta.
 *
 *  EL ORDEN DE LOS DESCUENTOS ES CONTRATO. Es el mismo orden que usa
 *  el Worker de producción (cloudflare-worker/worker.js, handleCreateOrder):
 *
 *     1) 10% por pagar en efectivo y retirar en el local,
 *     2) cupón,
 *     3) gift card  (sobre lo que SOBRA después de 1 y 2),
 *     4) y recién ahí se suma el envío, que JAMÁS entra en la base de
 *        los descuentos (una gift card no paga el flete).
 *
 *  Dos reglas que se decidieron acá y que los tests pinan:
 *
 *   - El cupón PORCENTUAL se calcula sobre la base ya descontada del
 *     10% de efectivo (no se aplica un % a plata que de todas formas no
 *     se paga): efectivo 10% + cupón 20% = 28% efectivo, no 30%.
 *   - El cupón FIJO (pesos duros) no se toca: el 10% de efectivo no le
 *     recorta el valor.
 *
 *  Si mañana se cambia el orden de una línea, hay que cambiarlo también
 *  en el Worker, o la pantalla va a mostrar un número distinto del que
 *  cobra el servidor. El test de `precios.test.js` y el test del Worker
 *  (`descuentos.seguridad.test.js`) pinan los dos lados del mismo contrato.
 * ============================================================
 */

/**
 * Calcula el resumen de un carrito.
 *
 * @param {object} input
 *  - subtotal: la suma de prendas (sin envío).
 *  - paysCash: true si el cliente eligió pagar en efectivo (el 10%
 *    solo aplica a retiro en el local; en envío por correo el checkout
 *    ni siquiera deja elegir efectivo).
 *  - appliedCoupon: el cupón ya validado (o null). Usa `type` ("percent"
 *    | "fixed"), `value` y la base ya filtrada por alcance.
 *  - eligibleSubtotal: la parte del subtotal a la que el cupón tiene
 *    derecho (alcance "all", "category" o "products"). Si es 0, el
 *    cupón no descuenta nada.
 *  - appliedGiftCard: { saldo } (o null). El saldo se descuenta hasta
 *    dejar el total en 0, nunca lo deja negativo y nunca paga el envío.
 *  - shippingCost: el costo de envío (se suma al final, fuera de la
 *    base de descuentos).
 *
 * @returns {{ discount, couponDiscount, giftCardDiscount, total }}
 */
export function calcularResumenPrecios({
  subtotal = 0,
  paysCash = false,
  appliedCoupon = null,
  eligibleSubtotal,
  appliedGiftCard = null,
  shippingCost = 0,
}) {
  // Si no te pasan la base del cupón, la inferimos: un cupón de alcance
  // "all" alcanza a todo el carrito; los demás (por categoría o por
  // productos) no alcanzan a nada sin una base explícita.
  const baseCupon =
    eligibleSubtotal ?? (appliedCoupon && appliedCoupon.scope === "all" ? subtotal : 0);

  // El 10% es el único descuento fijo de la tienda y es un descuento
  // por PAGAR EN EFECTIVO en el local, no "10% off" por elegir un medio.
  const discount = paysCash ? Math.round(subtotal * 0.1) : 0;

  // El descuento del cupón: porcentual sobre la base descontada del
  // efectivo (ver header), o pesos duros recortados a la base. Un cupón
  // de $5000 nunca descuenta $5000 de un carrito de $2000, y mucho menos
  // genera saldo a favor: el Math.min de abajo lo corta a la base.
  const couponDiscount = !appliedCoupon
    ? 0
    : appliedCoupon.type === "percent"
      ? Math.min(
          Math.round(baseCupon * (Number(appliedCoupon.value) / 100) * (paysCash ? 0.9 : 1)),
          baseCupon
        )
      : Math.min(Number(appliedCoupon.value), baseCupon);

  // La gift card se aplica sobre lo que sobra después del efectivo y del
  // cupón, y nunca sumándose a ellos para "pagar de más". Si sobra poco,
  // se descuenta poco; si no sobra nada, no descuenta nada.
  const giftCardDiscount = appliedGiftCard
    ? Math.min(Number(appliedGiftCard.saldo) || 0, Math.max(0, subtotal - discount - couponDiscount))
    : 0;

  // El total final: descuentos restan, envío suma, y el Math.max impide
  // que una combinación rara (cupón + gift card) deje el total negativo.
  const total = Math.max(0, subtotal - discount - couponDiscount - giftCardDiscount) + shippingCost;

  return { discount, couponDiscount, giftCardDiscount, total };
}