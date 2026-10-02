import React, { useState } from "react";
import { Check, MessageCircle, Copy } from "lucide-react";
import { WHATSAPP_NUMBER, CVU_DATA } from "../data/config.js";
import { fmt } from "../utils/format.js";

/* ============================================================
   PANTALLAS DE "GRACIAS" Y DE COORDINACIÓN
   ------------------------------------------------------------
   Después de confirmar el pedido, StoreApp elige una de estas tres
   pantallas según el medio de pago que eligió el cliente:

     - GraciasTransferencia: paga por transferencia. Acá vive la
       pantalla más pesada del proyecto, con los datos bancarios
       para que transfiera y un botón para mandar el comprobante.
     - CitaPrevia: paga en efectivo en el local. No hay datos
       bancarios: hay que coordinar día y horario.
     - GraciasTarjeta: paga con débito o crédito. Es un "pedido
       registrado", sin datos bancarios.

   Lo importante: las tres reciben el mismo trio de cosas —el código
   del pedido y, si compró una gift card, su código— y las tres se
   apoyan en los mismos dos bloques de abajo (TrackingBox y
   GiftCardBox). Ninguna toca precios: el `total` que muestran es el
   que devolvió el servidor, no el que calculaba el navegador.

   Ojo con las props: yo no leo la URL ni el estado global. StoreApp
   me pasa los datos ya resueltos.
   ============================================================ */

/** Caja con el código de seguimiento del pedido: el cliente lo
 *  guarda y con eso puede volver a ver el estado cuando quiera,
 *  sin necesidad de cuenta ni login.
 *
 *  El `orderId` es el mismo id del documento del pedido: funciona
 *  como código de acceso. Por eso se lo mostramos grande y le damos
 *  dos formas de guardarlo. */
function TrackingBox({ orderId, nav }) {
  // Feedback del botón "Copiar": 1,5 segundos con el tilde.
  const [copied, setCopied] = useState(false);
  // Si el pedido no llegó con id (por ejemplo al entrar a la URL a
  // mano sin ?pedido=), no muestro nada.
  if (!orderId) return null;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(orderId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Si el navegador no permite copiar solo, el cliente igual ve
      // el código escrito abajo y lo puede copiar a mano.
    }
  };

  return (
    <div style={{ border: "1px dashed var(--black)", padding: "16px 20px", marginBottom: 30, textAlign: "left" }}>
      <p className="tracked" style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 8 }}>
        Guardá este código para seguir tu pedido
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className="mono" style={{ fontSize: 13, wordBreak: "break-all" }}>{orderId}</span>
        <button
          onClick={copyCode}
          className="tracked"
          style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "1px solid var(--black)", padding: "4px 10px", fontSize: 11, cursor: "pointer" }}
        >
          <Copy size={12} /> {copied ? "Copiado ✓" : "Copiar"}
        </button>
      </div>
      {/* Atajo directo a la pantalla de seguimiento, pasándole el código
          para que ya la busque sola. */}
      <button
        onClick={() => nav("seguimiento", orderId)}
        className="tracked"
        style={{ background: "none", border: "none", textDecoration: "underline", fontSize: 12, padding: 0, marginTop: 10, cursor: "pointer" }}
      >
        Ver el estado de mi pedido →
      </button>
      <LinkCopyRow orderId={orderId} />
    </div>
  );
}
/** Segunda forma de guardar el seguimiento: copiar un link ya armado.
 *  El link lleva el código en el query string (?pedido=...), que es
 *  justo lo que routes.js lee después para abrir la pantalla de
 *  seguimiento ya con el pedido cargado. Es una vuelta extra a la
 *  que la gente usa, pero para WhatsApp o un mail es la práctica. */
function LinkCopyRow({ orderId }) {
  // Feedback del copiado, igual que en la caja de arriba.
  const [copied, setCopied] = useState(false);
  const copyLink = async () => {
    try {
      const url = `${window.location.origin}/seguimiento?pedido=${orderId}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // sin soporte de portapapeles: el código de arriba ya sirve igual
    }
  };
  return (
    <button
      onClick={copyLink}
      className="tracked"
      style={{ display: "block", background: "none", border: "none", textDecoration: "underline", fontSize: 11.5, padding: 0, marginTop: 6, cursor: "pointer", color: "var(--grey-3)" }}
    >
      {copied ? "Link copiado ✓" : "o copiar un link directo para guardarlo"}
    </button>
  );
}

/** Si el pedido incluía una gift card comprada, el código que se generó
 *  para el comprador. Sin esto pagaría una gift card y no se la poderías
 *  dar a nadie.
 *
 *  El código lo genera el Worker dentro del mismo commit que crea el
 *  pedido, y me lo devuelve como `giftCardIssued`. Si el pedido no
 *  incluía ninguna, la caja ni se dibuja. */
function GiftCardBox({ giftCardIssued }) {
  const [copied, setCopied] = useState(false);
  if (!giftCardIssued) return null;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(giftCardIssued);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // si no se puede copiar, el código queda escrito abajo igual
    }
  };

  return (
    <div style={{ border: "1px solid var(--black)", padding: "16px 20px", marginBottom: 30, textAlign: "left" }}>
      <p className="tracked" style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 8 }}>
        Tu gift card
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className="mono" style={{ fontSize: 15, fontWeight: 700, wordBreak: "break-all" }}>{giftCardIssued}</span>
        <button
          onClick={copyCode}
          className="tracked"
          style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "1px solid var(--black)", padding: "4px 10px", fontSize: 11, cursor: "pointer" }}
        >
          <Copy size={12} /> {copied ? "Copiado ✓" : "Copiar"}
        </button>
      </div>
      <p style={{ fontSize: 12, color: "var(--grey-3)", margin: "10px 0 0" }}>
        Podés usarla en cualquier compra del sitio (hasta 6 meses) o regalársela a quien quieras.
        Se usa en el checkout, en el casillero de gift card.
      </p>
    </div>
  );
}

/** GRACIAS POR TRANSFERENCIA — pantalla "gracias-transferencia".
 *  El pedido YA está creado en Firestore (lo creó el Worker), pero el
 *  pago todavía no existe: esta pantalla es un "ya casi está".
 *
 *  Props:
 *  - orderName: nombre del cliente. Agarro solo la primera palabra para
 *    saludarlo sin cargar la pantalla.
 *  - total: el monto que devolvió el SERVIDOR, no el que decía el
 *    resumen del checkout. Si hay diferencia, este es el número real.
 *  - orderId: el código de seguimiento del pedido.
 *  - giftCardIssued: el código de la gift card, si compró una.
 *  - nav(pagina): para el botón de volver al inicio.
 */
export function GraciasTransferencia({ orderName, total, orderId, giftCardIssued, nav }) {
  const waLink = `https://wa.me/${WHATSAPP_NUMBER}`;
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "70px 20px 100px", textAlign: "center" }}>
      <div style={{ width: 88, height: 88, margin: "0 auto 26px", borderRadius: "50%", border: "1px solid var(--black)", display: "flex", alignItems: "center", justifyContent: "center" }}><Check size={22} /></div>
      <h1 className="display" style={{ fontSize: "clamp(26px,5vw,40px)", margin: "0 0 10px" }}>¡Gracias{orderName ? `, ${orderName.split(" ")[0]}` : ""}!</h1>
      <p style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 30, color: "var(--grey-3)" }}>Ya casi está. Transferí el total de tu pedido a estos datos y mandanos el comprobante por WhatsApp para confirmarlo.</p>
      {/* Datos bancarios para la transferencia. Salen de CVU_DATA en
          data/config.js — es el único lugar donde están, así que cambiar
          el CBU es cambiar esa constante. */}
      <div style={{ border: "1px solid var(--black)", padding: 24, textAlign: "left", marginBottom: 30 }}>
        <DataRow label="Alias" value={CVU_DATA.alias} />
        <DataRow label="CVU" value={CVU_DATA.cvu} />
        <DataRow label="Titular" value={CVU_DATA.titular} />
        <DataRow label="CUIT" value={CVU_DATA.cuit} />
        <div style={{ borderTop: "1px solid var(--grey-1)", marginTop: 14, paddingTop: 14, display: "flex", justifyContent: "space-between" }}>
          {/* El monto que hay que transferir: es el que devolvió el Worker,
              o sea el que ya tiene el cupón, la gift card y el envío
              recalculados en el servidor. Si el cliente transfiriera el
              número que veía en el checkout y ese se hubiera quedado
              viejo, quedaría debiendo o sobrando plata. */}
          <span className="tracked" style={{ fontWeight: 700 }}>Monto a transferir</span>
          <span className="mono" style={{ fontWeight: 700, fontSize: 17 }}>{fmt(total)}</span>
        </div>
      </div>
      <GiftCardBox giftCardIssued={giftCardIssued} />
      <TrackingBox orderId={orderId} nav={nav} />
      {/* Salida principal de la pantalla: sin el comprobante no podemos
          dar por confirmado el pago a mano. */}
      <a href={waLink} target="_blank" rel="noopener noreferrer" className="btn-ghost tracked" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><MessageCircle size={16} /> Mandar comprobante por WhatsApp</a>
      <div style={{ marginTop: 18 }}><button onClick={() => nav("home")} className="btn-ghost tracked">Volver al inicio</button></div>
    </main>
  );
}
/** Una fila rótulo/valor de los datos bancarios. Sin estado, sin lógica. */
function DataRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
      <span className="tracked" style={{ fontSize: 12.5, fontWeight: 700 }}>{label}</span>
      <span className="mono" style={{ fontSize: 13 }}>{value}</span>
    </div>
  );
}

/** CITA PREVIA — pantalla "cita-previa".
 *  Aparece cuando el cliente eligió efectivo. El pedido ya está
 *  registrado y ya tiene el 10% off aplicado, pero la plata se paga
 *  presencial en el local: no hay datos bancarios, hay una
 *  conversación por WhatsApp para elegir día y horario.
 *
 *  Props: las mismas que las otras dos — orderId, giftCardIssued y nav.
 */
export function CitaPrevia({ orderId, giftCardIssued, nav }) {
  const waLink = `https://wa.me/${WHATSAPP_NUMBER}`;
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "70px 20px 100px", textAlign: "center" }}>
      <h1 className="display" style={{ fontSize: "clamp(26px,5vw,40px)", margin: "0 0 14px" }}>Coordinemos tu cita</h1>
      <p style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 30, color: "var(--grey-3)" }}>Elegiste pagar en efectivo, así que la compra se cierra en el local. Escribinos por WhatsApp con tu Nombre, las prendas que elegiste y coordinamos día y horario.</p>
      <GiftCardBox giftCardIssued={giftCardIssued} />
      <TrackingBox orderId={orderId} nav={nav} />
      <a href={waLink} target="_blank" rel="noopener noreferrer" className="btn-ghost tracked" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><MessageCircle size={16} /> Coordinar por WhatsApp</a>
      <div style={{ marginTop: 18 }}><button onClick={() => nav("home")} className="btn-ghost tracked">Volver al inicio</button></div>
    </main>
  );
}

/** GRACIAS POR TARJETA — pantalla "gracias-tarjeta".
 *  Ojo con lo que dice el nombre: con débito o crédito NO se está
 *  cobrando nada de verdad. Todavía no hay pasarela de pago conectada,
 *  así que el pedido se registra igual y el cobro se coordina a mano.
 *  Por eso es la pantalla más corta: no hay nada que el cliente tenga
 *  que hacer acá. */
export function GraciasTarjeta({ orderId, giftCardIssued, nav }) {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "70px 20px 100px", textAlign: "center" }}>
      <div style={{ width: 88, height: 88, margin: "0 auto 26px", borderRadius: "50%", border: "1px solid var(--black)", display: "flex", alignItems: "center", justifyContent: "center" }}><Check size={22} /></div>
      <h1 className="display" style={{ fontSize: "clamp(26px,5vw,40px)", margin: "0 0 14px" }}>Pedido registrado</h1>

      <GiftCardBox giftCardIssued={giftCardIssued} />
      <TrackingBox orderId={orderId} nav={nav} />
      <button onClick={() => nav("home")} className="btn-ghost tracked">Volver al inicio</button>
    </main>
  );
}