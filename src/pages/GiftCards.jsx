import React, { useState } from "react";
import { Gift } from "lucide-react";
import {
  GIFT_CARD_MAX,
  GIFT_CARD_MONTOS,
  GIFT_CARD_MIN,
} from "../data/config.js";
import { fmt } from "../utils/format.js";
import { redondearMontoGiftCard } from "../utils/giftcards.js";
import SkulWatermark from "../components/SkulWatermark.jsx";

/* ============================================================
   PÁGINA DE GIFT CARDS
   ------------------------------------------------------------
   Explica cómo funcionan y deja comprar una. El monto elegido entra
   al carrito como un ítem especial (id "giftcard"): no tiene talle ni
   stock, y el Worker valida el monto y crea la gift card con el saldo
   dentro del mismo commit que arma el pedido.
   ============================================================ */

/**
 * Ampliación de lo que dice el bloque de arriba, que es el contexto de
 * negocio de la pantalla:
 *
 * - Qué es una gift card acá: SALDO con código, no un uso único. El
 *   código tiene el formato SKUL-XXXXXX y se genera del lado del
 *   servidor (que lo arma con un alfabeto sin letras ni dígitos que se
 *   confunden, tipo "0" vs "O"). El saldo descuenta en el checkout
 *   cuando el comprador pega el código, y lo que queda sigue ahí para
 *   el próximo pedido.
 * - Cuándo vence: a los 6 meses de crearse. Si al cliente le vence
 *   con saldo, el caso se ve a mano por acá; por eso el FAQ no promete
 *   devolución automática.
 * - Por qué NO hay stock ni talle: la gift card no es una prenda, es
 *   un monto. Por eso es un ítem con id propio en el carrito en vez de
 *   un producto del catálogo.
 */

/* Los tres pasos del circuito, en el orden en que los vive el cliente.
   El tercer elemento de cada fila es opcional: si no viene, el paso se
   muestra solo con el número y el título. */
const PASOS = [
  ["1", "Elegí el monto"],
  ["2", "Recibís tu código", "Te lo mandamos apenas se confirma el pedido. Es un código SKUL-XXXXXX."],
  ["3", "Se usa en el checkout", "Escribilo en el casillero de gift card, abajo del cupón, antes de confirmar."],
];

/* Preguntas que más nos escriben. Las respuestas son la política real:
   está escrito acá lo mismo que aplica el servidor, para que el cliente
   no se entere de las reglas recién cuando las viola. */
const FAQ = [
  [
    "¿Se usa una sola vez?",
    "No. La gift card es saldo, no un uso único: la podés usar en varios pedidos y lo que queda sigue descontándose.",
  ],
  [
    "¿Cuánto vence?",
    "Seis meses desde que se creó. Pasada esa fecha el código ya no se puede aplicar (si te vence con saldo, escribinos y lo vemos).",
  ],
  [
    "¿Se combina con un cupón?",
    "Sí, pero el orden lo pone el sistema: primero se aplica el cupón y después la gift card, sobre lo que queda. El envío nunca lo cubre la gift card.",
  ],
  [
    "¿Se puede devolver?",
    "La gift card no tiene devolución en plata. Si la compraste y no la usaste dentro de los 6 meses, escribinos y la vemos caso por caso.",
  ],
];

/**
 * Pantalla de Gift Cards: explica el producto y permite comprar uno.
 *
 * Cuándo se muestra: cuando el estado `page` de StoreApp.jsx vale
 * "giftcards" (la ruta /giftcards), linkeada desde el footer y desde el
 * checkout.
 *
 * Props:
 *  - addGiftCard(monto): mete la gift card al carrito. Lo implementa
 *    StoreApp, que arma el ítem especial con id "giftcard", lo agrega y
 *    abre el carrito. Only one puede haber por pedido: si ya había una,
 *    la reemplaza.
 *  - giftCardEnCarrito: booleano que StoreApp calcula mirando si el
 *    carrito ya tiene una gift card. Cambia el texto del botón para que
 *    quede claro que se está reemplazando, no sumando otra.
 */
export default function GiftCards({ addGiftCard, giftCardEnCarrito = false }) {
  // Monto de una de las opciones de la grilla (los de GIFT_CARD_MONTOS).
  // Arranco en el segundo valor, no en el primero, porque el primero es
  // el mínimo allowed y es el que menos se vende.
  const [monto, setMonto] = useState(GIFT_CARD_MONTOS[1]);

  // El monto que escribe el cliente a mano. Es un string porque viene
  // del input; vacío significa "no escribió nada, uso los botones".
  const [custom, setCustom] = useState("");

  /**
   * El monto que va a terminar en el carrito. La regla es: si escribió
   * algo en el casillero, gana lo que escribió (redondeado y acotado al
   * rango); si no, gana el botón que esté seleccionado.
   */
  const montoElegido = custom.trim() ? redondearMontoGiftCard(custom) : Number(monto);

  // Cuando toca un botón de monto, limpio el casillero: si no, el texto
  // a mano seguiría teniendo prioridad y el botón no cambiaría nada.
  const otroMonto = (valor) => {
    setMonto(valor);
    setCustom("");
  };

  return (
    <main className="fx-host" style={{ maxWidth: 900, margin: "0 auto", padding: "60px 20px 90px" }}>
      {/* Wordmark gigante de fondo, de adorno. */}
      <SkulWatermark />

      {/* --- cabecera --- */}
      <p className="mono tracked" style={{ fontSize: 12, marginBottom: 6, color: "var(--grey-3)" }}>
        Regalo que sí se usa
      </p>
      <h1 className="display" style={{ fontSize: "clamp(30px,7vw,58px)", margin: "0 0 22px", lineHeight: 0.95 }}>
        Gift Cards
      </h1>

      {/* Los dos párrafos que explican el producto: que descuenta en el
          pedido y que el saldo no se gasta de una. */}
      <p style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 14, maxWidth: 620 }}>
        Cargá un código y te descuenta en el pedido. Sirve para regalar sin adivinar la prenda ni el
        talle: el que recibe el código elige lo que quiera.
      </p>
      <p style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 34, maxWidth: 620 }}>
        El saldo no se gasta de una: si queda, sigue ahí para el próximo pedido. Y tiene fecha de
        vencimiento(6 meses).
      </p>

      {/* ---- compra ---- */}
      <section style={{ border: "1px solid var(--black)", padding: "22px 20px", marginBottom: 44 }}>
        <p className="tracked" style={{ fontWeight: 700, fontSize: 14, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <Gift size={16} style={{ verticalAlign: "-3px" }} /> Elegí el monto
        </p>

        {/* Los montos fijos de GIFT_CARD_MONTOS. La grilla se acomoda sola
            según el ancho (auto-fill) y el botón marcado queda con la
            clase "active". La condición de "active" incluye !custom:
            apenas escribe un monto propio, ningún botón queda marcado. */}
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", marginBottom: 18 }}>
          {GIFT_CARD_MONTOS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => otroMonto(m)}
              className={`zone-radio ${montoElegido === m && !custom.trim() ? "active" : ""}`}
              style={{ textAlign: "center", padding: "12px 10px", fontSize: 14, fontWeight: 700 }}
            >
              {fmt(m)}
            </button>
          ))}
        </div>

        {/* Casillero de monto libre. El min/max del input son las
            constantes del negocio: el navegador ya frena la rueda del
            mouse, pero igual valido abajo antes de sumar. */}
        <label style={{ display: "grid", gap: 6, marginBottom: 18, maxWidth: 320 }}>
          <span className="tracked" style={{ fontSize: 11, fontWeight: 700 }}>
            ¿Otro monto?
          </span>
          <input
            type="number"
            min={GIFT_CARD_MIN}
            max={GIFT_CARD_MAX}
            step={1}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder={`Entre ${fmt(GIFT_CARD_MIN)} y ${fmt(GIFT_CARD_MAX)}`}
            style={{ border: "1px solid var(--black)", background: "var(--white)", padding: "12px 14px", fontSize: 14 }}
          />
        </label>

        {/* Botón de sumar. Se apaga (disabled + más transparente) si el
            monto a mano quedó fuera de rango. */}
        <button
          type="button"
          className="btn-ghost tracked"
          disabled={custom.trim() && (Number(custom) < GIFT_CARD_MIN || Number(custom) > GIFT_CARD_MAX)}
          onClick={() => addGiftCard && addGiftCard(montoElegido)}
          style={{ opacity: custom.trim() && (Number(custom) < GIFT_CARD_MIN || Number(custom) > GIFT_CARD_MAX) ? 0.4 : 1 }}
        >
          {giftCardEnCarrito ? "Cambiar la gift card del carrito" : `Agregar ${fmt(montoElegido)} al carrito`}
        </button>
        {/* Aclaración de que el saldo se entrega después del pedido: el
            código no existe hasta que el Worker confirma la compra. */}
        <p style={{ fontSize: 12, color: "var(--grey-3)", margin: "10px 0 0" }}>
          Va al carrito y se paga con el checkout de siempre. El código te lo damos al confirmar el pedido.
        </p>
      </section>

      {/* ---- cómo funciona ---- */}
      <section style={{ display: "grid", gap: 18, marginBottom: 44 }}>
        {PASOS.map(([n, titulo, texto]) => (
          <div key={n} style={{ display: "grid", gap: 12, gridTemplateColumns: "34px 1fr", alignItems: "start" }}>
            {/* El número del paso, en un círculo. */}
            <span
              className="mono"
              style={{ width: 34, height: 34, border: "1px solid var(--black)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}
            >
              {n}
            </span>
            {/* Título del paso y, si existe, su texto de detalle. */}
            <div>
              <p className="tracked" style={{ fontWeight: 700, fontSize: 14, margin: "0 0 4px" }}>{titulo}</p>
              <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--grey-2)", margin: 0 }}>{texto}</p>
            </div>
          </div>
        ))}
      </section>

      {/* ---- preguntas ---- */}
      <section style={{ display: "grid", gap: 14 }}>
        <p className="tracked" style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>Preguntas frecuentes</p>
        {FAQ.map(([q, a]) => (
          <div key={q} style={{ borderTop: "1px solid var(--grey-1)", paddingTop: 12 }}>
            <p style={{ fontWeight: 700, fontSize: 13.5, margin: "0 0 5px" }}>{q}</p>
            <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--grey-2)", margin: 0 }}>{a}</p>
          </div>
        ))}
      </section>
    </main>
  );
}