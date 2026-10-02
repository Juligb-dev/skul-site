/**
 * GIFT CARDS — colección /giftCards.
 *
 * Qué es: una gift card es saldo con código, no un uso único. El documento
 * guarda `balance` (cuánto se emitió), `usedAmount` (cuánto se gastó) y
 * `createdAt`; el saldo disponible es la resta de los dos. Como el código es
 * el ID del documento, buscarla es un get puntual.
 *
 * Qué problema resuelve: hay dos caminos para crearlas (a mano desde /admin
 * y compradas en el sitio, que las emite el Worker al confirmar el pedido) y
 * dos para gastarlas (el checkout del cliente y el descuento del Worker).
 * Todo eso se apoya en los mismos helpers de acá y, sobre todo, en las mismas
 * reglas de saldo, para que el número que ve el comprador sea el mismo número
 * que descuenta el servidor.
 *
 * Lo de los permisos está en el bloque con el "====" más abajo del archivo:
 * el checkout puede leer un código puntual (getDoc) pero la lista completa de
 * saldos solo la ve el admin.
 *
 * El límite del módulo: desde el navegador SOLO se lee. Yo no descuento saldo
 * en ningún lado. El descuento real lo calcula y lo aplica el Cloudflare
 * Worker, adentro del mismo commit atómico que crea el pedido y descuenta el
 * stock, así que dos personas no pueden gastar la misma gift card al mismo
 * tiempo.
 *
 * De qué colecciones depende: /giftCards.
 * Quién lo consume: /admin/AdminPanel.jsx (useGiftCards, createGiftCard,
 * saveGiftCard, deleteGiftCard) y /src/StoreApp.jsx (checkGiftCard,
 * giftCardCarritoItem).
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
import { GIFT_CARD_ITEM_ID, GIFT_CARD_ITEM_NOMBRE } from "../data/config.js";
import {
  generarCodigoGiftCard,
  isGiftCardCode,
  normGiftCardCode,
  saldoGiftCard,
  venceGiftCard,
} from "../utils/giftcards.js";

/* ============================================================
   GIFT CARDS — /giftCards en Firestore
   ------------------------------------------------------------
   El código es el ID del documento (igual que en los cupones), así
   que buscar una gift card es un get puntual.

   OJO CON LAS REGLAS: "get" es público (el checkout tiene que poder
   comprobar el código que escribió el cliente) pero "list" es solo del
   admin. Por eso `checkGiftCard` —que se usa en el checkout— usa
   getDoc, y la lista de abajo solo se abre dentro de /admin.
   ============================================================ */

const GIFT_CARDS_COL = collection(db, "giftCards");
const refGiftCard = (code) => doc(db, "giftCards", normGiftCardCode(code));

/** Se suscribe en vivo a la colección giftCards (solo para /admin).
 *
 * onSnapshot deja abierto un canal con Firestore y repinta la tabla cada vez
 * que algo cambia, así que si yo creo una gift card desde otra pestaña, acá
 * aparece sola.
 *
 * Devuelve `giftCards`: array de `{ code, balance, usedAmount, active,
 * createdAt }` ordenado por código para que la tabla sea estable y no baile
 * de lugar entre snapshots. `null` = todavía no cargué; si la carga falla,
 * seteo `[]` y logueo, para que el panel muestre tabla vacía en vez de ficar
 * cargando para siempre. Ojo: si la consulta es rechazada porque el visitante
 * no es admin, va a pasar siempre por acá y la UI muestra "no hay gift cards"
 * en lugar de "no podés verlas".
 */
export function useGiftCards() {
  const [giftCards, setGiftCards] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(
      GIFT_CARDS_COL,
      (snap) =>
        setGiftCards(
          snap.docs
            .map((d) => ({ code: d.id, ...d.data() }))
            .sort((a, b) => String(a.code).localeCompare(String(b.code)))
        ),
      (err) => {
        console.error("No se pudieron cargar las gift cards:", err);
        setGiftCards([]);
      }
    );
    // El cleanup desuscribe. Sin esto el canal queda abierto y cada cambio
    // sigue empujando estado a un componente desmontado.
    return () => unsub();
  }, []);

  return { giftCards };
}

/** Crea una gift card con un código nuevo (o edita una que ya existe).
 *
 * Sirve para las dos cosas que hace el panel: emitir una gift card a mano
 * con un código elegido, y corregir una existente (saldo o activación).
 * OJO: corregir el saldo desde acá es una edición manual, no un gasto: por
 * eso `usedAmount` no se toca nunca acá (ver abajo).
 */
export const saveGiftCard = async (code, { balance, active }) => {
  const ref = refGiftCard(code);
  // Lectura puntual para saber si el documento es nuevo o ya existía.
  const snap = await getDoc(ref);
  const isNew = !snap.exists();

  // Math.max(0, ...) deja el saldo siempre en positivo o cero: un saldo
  // negativo haría que saldoGiftCard dé 0 igual, pero un documento con
  // balance negativo rompe cualquier lectura/export que hagamos después.
  const data = {
    balance: Math.max(0, Math.round(Number(balance) || 0)),
    active: !!active,
  };
  // Editar una gift card NO puede tocar el saldo ya usado ni la fecha de
  // creación (de ahí dependen los 6 meses de vigencia).
  // Si se resetearan, "editar" una gift card sin querer sería usar saldo
  // ajena (dando saldo nuevo) o estirar la vigencia sin querer.
  if (isNew) {
    data.usedAmount = 0;
    // La hora la pone el servidor de Firestore, no la computadora del admin.
    data.createdAt = serverTimestamp();
  }

  // merge: true: solo pisa balance y active; deja usedAmount y createdAt.
  return setDoc(ref, data, { merge: true });
};

/**
 * Crea una gift card con un código generado que todavía no exista.
 * El ID del documento es el código, así que si saliera repetido el
 * setDoc lo pisaría: por eso se prueba con getDoc primero ( Firestore
 * no tiene "crear si no existe" con ID propio en el SDK web).
 *
 * El código sale de generarCodigoGiftCard: prefijo SKUL- más 6 caracteres de
 * un alfabeto sin I/O/0/1 (los que la gente confunde al copiar a mano), o
 * sea ~1.000 millones de combinaciones.
 *
 * El for es la parte importante: hasta 8 intentos con un código distinto.
 * Si los 8 chocan (prácticamente imposible, pero el Worker genera códigos
 * con el mismo alfabeto desde el otro lado), tiro error en vez de guardar
 * una gift card con un código pisado por otra.
 *
 * OJO (lo dejo dicho): el getDoc + setDoc NO es una operación atómica: entre
 * una cosa y la otra, otro admin podría crear el mismo código. Con un billón
 * de combinaciones la probabilidad es despreciable y, si alguna vez pasara,
 * el setDoc pisaría el saldo del otro. Si algún día esto molesta, la forma
 * correcta es dejar la creación en el Worker.
 */
export const createGiftCard = async ({ balance, active = true } = {}) => {
  for (let intento = 0; intento < 8; intento++) {
    const code = generarCodigoGiftCard();
    // Si ya existe ese código, probamos con otro (continue al loop).
    const snap = await getDoc(refGiftCard(code));
    if (snap.exists()) continue;
    await saveGiftCard(code, { balance, active });
    // Devuelvo el código, no el documento: es lo que hay que mostrarle al
    // cliente o copiar al portapapeles.
    return code;
  }
  throw new Error("No se pudo generar un código libre. Probá de nuevo.");
};

/** Borra la gift card entera (con su saldo y su historial). Desde /admin. */
export const deleteGiftCard = (code) => deleteDoc(refGiftCard(code));

/**
 * Chequeo de solo lectura para el checkout (como checkCoupon): mira si
 * el código existe, está activo, le queda saldo y no venció.
 *
 * Esto NO descuenta nada. El descuento real lo calcula y lo descuenta el
 * Worker al crear el pedido; lo que se muestra acá es solo una
 * anticipación para que el cliente sepa si el código le va a servir.
 *
 * Devuelve `{ ok: true, giftCard: { code, saldo, vence } }` o
 * `{ ok: false, reason }` con el motivo en castellano, para pintarlo tal cual
 * en el checkout.
 */
export async function checkGiftCard(code) {
  const normalizado = normGiftCardCode(code);
  // Chequeo de formato antes de tocar la base: un getDoc con un ID vacío o
  // con caracteres raros no sirve de nada y en el peor caso sería una lectura
  // inútil contra Firestore.
  if (!isGiftCardCode(normalizado)) {
    return { ok: false, reason: "El código tiene que tener el formato SKUL-XXXXXX." };
  }

  let data;
  try {
    const snap = await getDoc(refGiftCard(normalizado));
    if (!snap.exists()) return { ok: false, reason: "No existe ese código de gift card." };
    data = snap.data();
  } catch (err) {
    // Falló la lectura (reglas, red, cuota). Devuelvo ok:false con un
    // mensaje en vez de dejar reventar la promesa, porque quien llama la
    // usa para pintar un cartel abajo del checkout y un error sin manejar
    // rompería la pantalla de compra.
    console.error("No se pudo comprobar la gift card:", err);
    return { ok: false, reason: "No pudimos comprobar esa gift card. Probá de nuevo en un momento." };
  }

  // Regla de negocio: una gift card dada de baja (o borrada lógicamente con
  // active: false) no sirve aunque le sobre saldo.
  if (data.active !== true) return { ok: false, reason: "Esa gift card está dada de baja." };

  // Vencimiento: venceGiftCard calcula createdAt + 6 meses (los 6 meses están
  // en config.js). Si no hay createdAt o la fecha no se puede interpretar, la
  // trato como vencida: es el lado que no le hace perder plata al cliente.
  const vence = venceGiftCard(data.createdAt);
  if (!vence || vence.getTime() <= Date.now()) {
    return { ok: false, reason: "Esa gift card venció." };
  }

  // Saldo = balance - usedAmount (helper compartido con el panel y con la
  // página pública, para que nadie muestre un número distinto).
  const saldo = saldoGiftCard(data);
  if (saldo <= 0) return { ok: false, reason: "Esa gift card ya no tiene saldo." };

  return {
    ok: true,
    giftCard: {
      code: normalizado,
      saldo,
      vence,
    },
  };
}

/* ------------------------------------------------------------
   Ítem de carrito: la gift card que se COMPRA.
   No es un producto del catálogo: no tiene stock ni talle. El
   Worker valida el monto y crea el documento con el saldo dentro del
   mismo commit que arma el pedido.
   ------------------------------------------------------------ */

/** Arma el objeto que va al carrito por una gift card comprada.
 *
 * Esto es un "producto falso": tiene la misma forma que una prenda (id, name,
 * price, qty...) para que el carrito y el checkout la traten igual y no haya
 * que agregar casos especiales en cada pantalla. Los campos que no aplican
 * van vacíos o en null a propósito.
 *
 * `giftcard: true` es la bandera que usa StoreApp para armar el pedido de otra
 * forma: en vez de mandar `id`, manda `{ amount }` y no manda ni precio ni
 * talle. El Worker valida el monto, genera el código y crea el documento con
 * el saldo dentro del mismo commit del pedido. El navegador nunca elige el
 * código: siempre sale del servidor.
 *
 * maxQty: 1 = "una gift card por pedido": si no, el mismo pedido podría
 * generar varias gift cards con un solo pago.
 */
export function giftCardCarritoItem(monto, { nombre } = {}) {
  return {
    // La key del carrito tiene que ser única entre los ítems: la armo con el
    // monto para que, si se cambia la gift card del carrito, React la trate
    // como un ítem nuevo y no le reutilice el estado viejo.
    key: `giftcard__${monto}`,
    id: GIFT_CARD_ITEM_ID,
    name: nombre || GIFT_CARD_ITEM_NOMBRE,
    image: null, // no hay foto: la tarjeta se dibuja con CSS
    price: Number(monto),
    size: "", // no tiene talle
    color: null,
    qty: 1,
    maxQty: 1, // una por pedido
    // weight 50 es un peso inventado, solo para el cálculo del envío que
    // hace el checkout: si el envío se cubre con gift card, la gift card no
    // debería pagar el envío y sí el resto. Es un número que el Worker ignora
    // para este ítem.
    weight: 50,
    tag: "GIFT",
    giftcardAmount: Number(monto), // monto real que se pidió emitir
    giftcard: true,
  };
}