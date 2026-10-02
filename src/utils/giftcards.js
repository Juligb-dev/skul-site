/**
 * ============================================================
 *  GIFT CARDS — helpers puros
 * ------------------------------------------------------------
 *  Una gift card es saldo con un código (ej. "SKUL-A7K2P9"), no un
 *  uso único: se puede aplicar varias veces y lo que queda se sigue
 *  descontando. El documento en Firestore tiene, por lo menos:
 *    balance    = el saldo total que vale el código
 *    usedAmount = lo que ya se le descontó
 *    active     = false la da de baja
 *    createdAt  = cuándo se creó (de ahí salen los 6 meses)
 *
 *  Los helpers de acá son PUROS: no tocan Firebase ni la red, solo
 *  reciben datos y devuelven datos. Eso los deja usar en el /admin
 *  (panel de gift cards), en la página pública /giftcards y en el
 *  checkout, sin importar nada.
 *
 *  OJO — dos reglas que se repiten en varios lugares y conviene no
 *  confundir:
 *    1) Estas constantes están duplicadas a propósito en
 *       cloudflare-worker/worker.js. El Worker se despliega solo y
 *       no puede importar nada del sitio, y es el que VALIDA el
 *       monto y el saldo al crear el pedido. Si cambiás algo acá,
 *       cambialo también allá.
 *    2) El descuento real lo calcula y lo descuenta el Worker, no el
 *       navegador. Lo que hay en este archivo es solo la
 *       anticipación que se le muestra al cliente.
 * ============================================================
 */
import {
  GIFT_CARD_ALFABETO,
  GIFT_CARD_MAX,
  GIFT_CARD_MESES,
  GIFT_CARD_MIN,
  GIFT_CARD_PREFIJO,
  GIFT_CARD_SUFIJO_LEN,
} from "../data/config.js";

/* Helpers puros de gift cards (sin Firebase): los usan el panel de
   admin, la página pública y el checkout. */

/** El código tal como tiene que estar guardado: sin espacios y en
 *  mayúsculas (la gente lo escribe "skul abc123" o "skul-abc123").
 *
 *  Existe porque el código es el ID del documento en Firestore: si
 *  "SKUL-ABC" y "skul abc" se guardaran con distinta forma, serían
 *  dos gift cards distintas y una de las dos no encontraría nunca.
 *  Normalizo siempre ANTES de leer o de escribir. */
export const normGiftCardCode = (code) => String(code || "").replace(/\s+/g, "").toUpperCase();

/** Formato SKUL-XXXXXX.
 *
 *  Este regex es el formato EXACTO: el prefijo "SKUL-", un guion y
 *  seis caracteres de A-Z o 0-9. No acepta minúsculas (porque el
 *  código ya viene normalizado en mayúsculas antes del test), ni
 *  guiones de más, ni cinco o siete letras.
 *  Ojo: el [A-Z0-9] sí admite I, O, 0 y 1, que son las letras que
 *  la gente suele leer mal — el alfabeto de generación (abajo) sí
 *  las evita, pero el validador acepta cualquier cosa de seis
 *  caracteres para no rechazar un código viejo. */
export const GIFT_CARD_RE = /^SKUL-[A-Z0-9]{6}$/;

/** ¿El texto que escribió el cliente tiene forma de gift card?
 *  Normaliza primero y después testea, así que acepta lo que venga
 *  ("skul abc123" cuenta). */
export const isGiftCardCode = (code) => GIFT_CARD_RE.test(normGiftCardCode(code));

/** Genera un código nuevo SKUL-XXXXXX.
 *
 *  Elijo al azar un carácter del alfabeto por cada posición del
 *  sufijo. GIFT_CARD_ALFABETO viene sin I, O, 0 ni 1: son los que
 *  la gente confunde entre sí al copiar el código a mano, así que
 *  de acá nunca sale un código con esas letras.
 *
 *  OJO: esto NO garantiza que el código esté libre. La comprobación
 *  la hace el helper createGiftCard de src/hooks/useGiftCards.js,
 *  que prueba con getDoc y reintenta hasta 8 veces. */
export function generarCodigoGiftCard() {
  let sufijo = "";
  for (let i = 0; i < GIFT_CARD_SUFIJO_LEN; i++) {
    // Math.random() da un decimal entre 0 y 1: lo multiplico por la
    // cantidad de caracteres y tomo la parte entera para elegir el índice.
    sufijo += GIFT_CARD_ALFABETO[Math.floor(Math.random() * GIFT_CARD_ALFABETO.length)];
  }
  return `${GIFT_CARD_PREFIJO}${sufijo}`;
}

/** Redondea a peso entero y lo deja dentro del rango (cualquier monto).
 *
 *  Sirve para lo que escribe el admin en el formulario de creación:
 *  si pone "25000,7" lo dejo en 25001, y si se pasa del tope lo
 *  bajo a 100000 en vez de guardarlo (el Worker también lo limita,
 *  pero así el admin ve de entrada el número corregido en pantalla). */
export function redondearMontoGiftCard(monto) {
  const n = Number(monto);
  // Un texto vacío, un NaN o un Infinity no son un monto: devuelvo el
  // mínimo válido en vez de propagar un NaN que rompería la comparación.
  if (!Number.isFinite(n)) return GIFT_CARD_MIN;
  const redondeado = Math.round(n);
  // Math.max primero sube el piso, Math.min después recorta el techo:
  // el orden importa, al revés el mínimo imposible.
  return Math.min(GIFT_CARD_MAX, Math.max(GIFT_CARD_MIN, redondeado));
}

/** ¿El monto es una gift card válida?
 *
 *  A diferencia del de arriba, acá NO perdona ni redondea: tiene que
 *  ser un entero de verdad dentro del rango. Un "1500" con signo o
 *  un 1500,5 no pasa, porque un saldo con decimales después rompe la
 *  cuenta del pedido. */
export const montoGiftCardValido = (monto) => {
  const n = Number(monto);
  return (
    Number.isInteger(n) &&
    n >= GIFT_CARD_MIN &&
    n <= GIFT_CARD_MAX
  );
};

/** createdAt + 6 meses. Acepta un Timestamp de Firestore o una fecha.
 *
 *  La vigencia sale del documento, no del momento en que se usa: por
 *  eso la fecha base es siempre createdAt. Acepto los dos formatos
 *  porque según de dónde venga el dato, createdAt es un Timestamp de
 *  Firestore (tiene .toDate()) o ya viene convertido en Date o texto.
 *
 *  Devuelvo null (no una fecha inventada) si no hay fecha o si es
 *  inválida, para que el que llame decida qué mostrar. */
export function venceGiftCard(createdAt) {
  if (!createdAt) return null;
  // Copio la fecha antes de sumar meses: setMonth() modifica el objeto
  // que le pasás, y si fuera el Timestamp original lo estaríamos
  // alterando sin querer.
  const fecha = typeof createdAt?.toDate === "function" ? createdAt.toDate() : new Date(createdAt);
  if (Number.isNaN(fecha.getTime())) return null;
  const d = new Date(fecha.getTime());
  d.setMonth(d.getMonth() + GIFT_CARD_MESES);
  return d;
}

/** Saldo disponible de una gift card.
 *
 *  Es balance menos usedAmount. Ojo con el Math.max: él protege que
 *  `balance` no sea negativo o venga ausente (documento viejo sin el
 *  campo), pero NO acota la resta: si por algún error de cálculo
 *  usedAmount llegara a ser mayor que balance, acá sale un saldo
 *  negativo. Quien lo consume (el checkout) lo trata como "sin
 *  saldo" con su propio `<= 0`. */
export const saldoGiftCard = (giftCard) =>
  Math.max(0, Number(giftCard?.balance) || 0) - (Number(giftCard?.usedAmount) || 0);

/** "Vence 12/04/2027" / "Venció el 12/04/2027".
 *
 *  Para pintar la lista del /admin. Uso el mismo umbral que el
 *  checkout (fecha <= ahora), así el panel nunca muestra "Vence"
 *  algo que el checkout ya está rechazando. */
export function textoVencimiento(giftCard) {
  const fecha = venceGiftCard(giftCard?.createdAt);
  // Sin fecha válida muestro un guion largo, para que la columna no
  // quede con un hueco raro en la tabla.
  if (!fecha) return "—";
  const texto = fecha.toLocaleDateString("es-AR");
  return fecha.getTime() <= Date.now() ? `Venció el ${texto}` : `Vence ${texto}`;
}
