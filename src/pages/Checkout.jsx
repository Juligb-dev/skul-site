import React, { useEffect } from "react";
import { MapPin } from "lucide-react";
import { ZONES } from "../data/config.js";
import { fmt } from "../utils/format.js";
import CorreoShipping from "../components/CorreoShipping.jsx";

// Estilos sueltos acá, y no en CSS, porque son tres cosas muy puntuales
// y así el componente queda entero en un archivo. El resto del diseño
// del checkout sí vive en clases (.zone-radio, .pay-radio, .checkout-grid).
const payBtn = { textAlign: "left", padding: "12px 14px", fontSize: 13, fontWeight: 700 };
const inputStyle = { border: "1px solid var(--black)", background: "var(--white)", padding: "12px 14px", fontSize: 14, width: "100%" };

// Función de seguridad para evitar que cualquier .trim() rompa la app si el valor llega undefined/null
const safeTrim = (val) => (typeof val === "string" ? val.trim() : "");

/** ============================================================
   CHECKOUT — pantalla "checkout"
   ------------------------------------------------------------
   Acá el cliente completa el pedido: datos, envío, descuentos y
   medio de pago. La regla más importante del proyecto pasa por acá:

   LOS DESCUENTOS NO SE CALCULAN EN EL NAVEGADOR.
   El navegador solo muestra una PREVISUALIZACIÓN del resumen y,
   cuando el cliente aprieta "Confirmar pedido", le manda al
   Cloudflare Worker los CÓDIGOS del cupón y de la gift card (nunca
   los montos). El Worker lee el saldo real de la gift card, el valor
   real del cupón y el precio real del catálogo, calcula todo de
   nuevo y descuenta en un único commit atómico (el mismo que crea
   el pedido). Si algo no cierra, el navegador muestra el error y
   deja el carrito como estaba.

   Por eso acá no hay un solo useState: TODOS los campos viven en el
   estado de StoreApp, porque el carrito, el resumen y el pedido que
   se manda al Worker tienen que leer exactamente los mismos valores.
   Yo solo llamo a los setters que me pasaron.

   Props — datos del carrito y del pedido:
   - cart: los ítems (id, nombre, talle, color, qty, precio, key, peso).
   - cartWeight: peso total en gramos. Correo Argentino cobra por peso,
     así que lo necesita para cotizar.
   - zone: "local" (retiro) o "correo". setZone lo cambia.
   - correoQuote: lo elegido en CorreoShipping ({ type, price,
     postalCode, provinceCode, agencyCode, agencyName }).
   - payMethod / setPayMethod: "debito" | "credito" | "transferencia" |
     "efectivo".
   - subtotal, discount, shippingCost, total: los números del resumen,
     YA calculados en StoreApp. Yo no los recalculo ni los toco.

   Props — datos del cliente (valor + setter para cada uno):
   - orderName, orderPhone, orderAddress / setOrderName, setOrderPhone,
     setOrderAddress.

   Props — cupón:
   - couponCode / setCouponCode: lo que está escribiendo.
   - applyCoupon(): le pregunta al Worker si el código existe y trae
     los datos; removeCoupon(): lo saca.
   - appliedCoupon: el cupón ya validado (con scope, type y value).
   - couponDiscount: la plata que descuenta, solo previsualización.
   - couponError: el motivo por el que no aplicó, ya en texto humano.
   - couponChecking: está consultando (para el botón en "...").
   - couponApplies: el cupón es válido pero no cubre nada de lo que hay
     en el carrito (scope "category" o "products" y no matchea).

   Props — gift card (misma estructura):
   - giftCardCode / setGiftCardCode, applyGiftCard, removeGiftCard,
     appliedGiftCard (con su `saldo` leído por el Worker),
     giftCardDiscount, giftCardError, giftCardChecking.

   Props — confirmación:
   - confirmOrder(): hace todo el posteo al Worker. Yo no sé ni
     me importa qué hace adentro; solo muestro el botón y los errores.
   - confirming: está en vuelo.
   - orderError: si el Worker lo rechazó.
   - nav(pagina): para el botón de volver al catálogo.
   ============================================================ */
export default function Checkout({
  cart = [], cartWeight = 0, zone = "local", setZone, correoQuote, setCorreoQuote, payMethod, setPayMethod, subtotal = 0, discount = 0, shippingCost = 0, total = 0,
  orderName = "", setOrderName, orderPhone = "", setOrderPhone, orderAddress = "", setOrderAddress, confirmOrder, nav,
  couponCode = "", setCouponCode, applyCoupon, appliedCoupon, couponDiscount = 0, couponError = "", couponChecking = false, removeCoupon, confirming = false, couponApplies = true,
  giftCardCode = "", setGiftCardCode, applyGiftCard, appliedGiftCard, giftCardDiscount = 0, giftCardError = "", giftCardChecking = false, removeGiftCard,
  orderError = "",
}) {
  // ¿Estamos en envío por correo?
  const isCorreo = zone === "correo";
  // La dirección solo hace falta si el correo lo entrega a domicilio.
  // Si el cliente retiró en una sucursal de Correo, no le pedimos dónde vive.
  const needsAddress = isCorreo && correoQuote?.type === "domicilio";

  // Si cambia a envío por correo y tenía seleccionado efectivo, lo limpia sin arrojar error
  // REGLA: el 10% off es solo por efectivo en el local. El efectivo y el
  // Correo Argentino no se pueden combinar, así que si el cliente pasa a
  // correo con "efectivo" seleccionado, se lo deselecciono yo solito.
  useEffect(() => {
    if (isCorreo && payMethod === "efectivo" && typeof setPayMethod === "function") {
      setPayMethod(null);
    }
  }, [isCorreo, payMethod, setPayMethod]);

  // Manejador seguro para el componente CorreoShipping: previene que se pasen SyntheticEvents a setCorreoQuote
  // CorreoShipping me avisa con un objeto plano {type, price, ...}. Este
  // filtro es una red de seguridad: si alguna vez llegara el evento del
  // input en vez del objeto (tiene `nativeEvent`), lo ignoro en lugar de
  // guardar basura en el estado.
  const handleCorreoChange = (quote) => {
    if (typeof setCorreoQuote !== "function") return;
    if (quote && typeof quote === "object" && !quote.nativeEvent) {
      setCorreoQuote(quote);
    } else if (!quote) {
      setCorreoQuote(null);
    }
  };

  // --- Validaciones del formulario ---
  // Son mínimas a propósito: cortan los casos evidentes (nombre de una
  // letra, teléfono de tres dígitos). No intento validar que el teléfono
  // sea real ni que la dirección exista.
  const nameValid = safeTrim(orderName).length > 1;
  const phoneValid = safeTrim(orderPhone).length > 5;
  const addressValid = !needsAddress || safeTrim(orderAddress).length > 4;
  // Para Correo tiene que haber una cotización elegida con precio (puede
  // ser 0 si no hay envío gratis, por eso chequeo != null y no > 0).
  const shippingValid = !isCorreo || (correoQuote && correoQuote.price != null);

  // Botón habilitado solo si pasó TODO. Notá que el cupón y la gift card
  // NO bloquean el pedido: se pueden aplicar aunque no sirvan para nada,
  // y si el Worker los rechaza al confirmar lo avisa.
  const canConfirm = (cart || []).length > 0 
    && !!payMethod 
    && nameValid 
    && phoneValid 
    && !confirming 
    && shippingValid 
    && addressValid 
    && !(isCorreo && payMethod === "efectivo");

  // Carrito vacío: no hay nada que cobrar, así que corto acá antes de
  // dibujar todo el formulario.
  if (!cart || cart.length === 0) {
    return (
      <main style={{ maxWidth: 700, margin: "0 auto", padding: "70px 20px", textAlign: "center" }}>
        <p className="tracked" style={{ fontWeight: 700, fontSize: 18, marginBottom: 16 }}>Tu carrito está vacío.</p>
        <button className="btn-ghost tracked" onClick={() => nav && nav("catalog")}>Ver catálogo</button>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "50px 20px 100px" }}>
      <h1 className="display" style={{ fontSize: "clamp(28px,5vw,44px)", margin: "0 0 34px" }}>Cerrar pedido</h1>
      {/* Dos columnas: formulario a la izquierda, resumen fijo a la derecha.
          En celular la clase .checkout-grid las apila. */}
      <div style={{ display: "grid", gap: 40, gridTemplateColumns: "1.3fr 1fr" }} className="checkout-grid">
        <div>
          {/* --- datos de contacto --- */}
          <label style={{ display: "grid", gap: 6, marginBottom: 16, maxWidth: 380 }}>
            <span className="tracked" style={{ fontSize: 12, fontWeight: 700 }}>Nombre y apellido</span>
            <input 
              value={orderName || ""} 
              onChange={(e) => setOrderName && setOrderName(e.target.value)} 
              style={inputStyle} 
              placeholder="Nombre completo" 
            />
          </label>
          
          <label style={{ display: "grid", gap: 6, marginBottom: 30, maxWidth: 380 }}>
            <span className="tracked" style={{ fontSize: 12, fontWeight: 700 }}>Teléfono / WhatsApp</span>
            <input 
              value={orderPhone || ""} 
              onChange={(e) => setOrderPhone && setOrderPhone(e.target.value)} 
              style={inputStyle} 
              placeholder="Para coordinar el envío" 
            />
          </label>

          <p className="tracked" style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
            <MapPin size={15} style={{ verticalAlign: "-2px" }} /> Envío a tu zona
          </p>

          {/* --- zonas de envío ---
              Una "zona" es el precio fijo que cuesta llevar el pedido a un
              lugar. Hoy solo queda la de retiro en el local (gratis); el
              resto de las distancias se cotiza en vivo con Correo Argentino
              (la opción de abajo). Por eso el precio depende de la zona:
              no es un número que yo pueda inventar, es una tabla o una
              consulta al Worker. */}
          <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
            {(ZONES || []).map((z) => (
              <button 
                key={z.id} 
                type="button"
                onClick={() => { 
                  if (typeof setZone === "function") setZone(z.id); 
                  if (typeof setCorreoQuote === "function") setCorreoQuote(null); 
                }} 
                className={`zone-radio ${zone === z.id ? "active" : ""}`} 
                style={{ textAlign: "left", padding: "12px 14px", fontSize: 13, display: "flex", justifyContent: "space-between" }}
              >
                <span>{z.name}</span>
                <span className="mono">{z.price === 0 ? "Gratis" : fmt(z.price)}</span>
              </button>
            ))}
            {/* Correo Argentino: acá no hay precio hasta que el cliente
                carga su código postal y le cotizamos. */}
            <button 
              type="button"
              onClick={() => typeof setZone === "function" && setZone("correo")} 
              className={`zone-radio ${zone === "correo" ? "active" : ""}`} 
              style={{ textAlign: "left", padding: "12px 14px", fontSize: 13 }}
            >
              Envío por Correo Argentino
            </button>
          </div>

          {/* --- cotizador de Correo Argentino ---
              CorreoShipping pide provincia + código postal y le pregunta
              al Worker, que es el único que tiene las credenciales de la
              API de MiCorreo (el token y el ID de cliente viven como
              secretos del Worker, nunca en el navegador). El Worker le
              devuelve { domicilio, sucursal } en pesos y el precio sale de
              ahí: no hay forma de que el cliente elija cuánto cuesta el
              flete. */}
          {isCorreo && (
            <div style={{ marginBottom: 34, maxWidth: 460 }}>
              <CorreoShipping value={correoQuote} onChange={handleCorreoChange} weight={cartWeight} />
              {needsAddress && (
                <label style={{ display: "grid", gap: 6, marginTop: 14 }}>
                  <span className="tracked" style={{ fontSize: 12, fontWeight: 700 }}>Dirección (calle, altura, piso/depto)</span>
                  <input 
                    value={orderAddress || ""} 
                    onChange={(e) => setOrderAddress && setOrderAddress(e.target.value)} 
                    style={inputStyle} 
                    placeholder="Ej: Av. San Martín 1234, piso 2 depto B" 
                  />
                </label>
              )}
            </div>
          )}

          {/* --- CUPÓN ---
              El navegador NO sabe si el cupón existe ni cuánto descuenta.
              Lo que hago es mandar el código que escribió el cliente y
              esperar: StoreApp le pregunta al Worker, y si le dice que no
              aplica, me muestra el texto del error y dejo el carrito como
              estaba. Acá solo dibujo el campo y los dos estados. */}
          <p className="tracked" style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Código de descuento</p>
          {/* Dos estados. Arriba hay un cupón cargado (Estado A), y puede
              estar en dos situaciones: si `couponApplies` está en gris, el
              código es válido pero su alcance (una categoría o tal lista de
              productos) no cubre nada de lo que hay en el carrito y no
              descuenta; en óxido, aplica y ya está descontado en el resumen.
              Abajo (Estado B) se puede escribir un código: Enter también
              dispara la validación, así el cliente no tiene que andar
              buscando el botón con el mouse. */}
          {appliedCoupon ? (
            <div style={{ marginBottom: 24, maxWidth: 380 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <p style={{ fontSize: 13, color: couponApplies ? "var(--accent)" : "var(--grey-3)", margin: 0 }}>
                  Cupón "{appliedCoupon?.code || ""}" aplicado ✓
                </p>
                <button 
                  type="button"
                  onClick={() => typeof removeCoupon === "function" && removeCoupon()} 
                  style={{ background: "none", border: "none", textDecoration: "underline", fontSize: 12, cursor: "pointer" }}
                >
                  Quitar
                </button>
              </div>
              {!couponApplies && (
                <p style={{ fontSize: 12.5, color: "var(--grey-3)", marginTop: 6 }}>
                  Este cupón no aplica a los productos que tenés en el carrito.
                </p>
              )}
            </div>
          ) : (
            <div style={{ marginBottom: 8, maxWidth: 380 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={couponCode || ""}
                  onChange={(e) => setCouponCode && setCouponCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && typeof applyCoupon === "function" && applyCoupon()}
                  style={{ ...inputStyle, flex: 1 }}
                  placeholder="Ingresá tu cupón"
                />
                <button 
                  type="button"
                  className="btn-ghost tracked" 
                  onClick={() => typeof applyCoupon === "function" && applyCoupon()} 
                  disabled={couponChecking} 
                  style={{ padding: "0 18px", opacity: couponChecking ? 0.5 : 1 }}
                >
                  {couponChecking ? "..." : "Aplicar"}
                </button>
              </div>
              {couponError && <p style={{ fontSize: 12.5, color: "crimson", marginTop: 8 }}>{couponError}</p>}
            </div>
          )}

          {/* --- GIFT CARD ---
              Una gift card es un código con saldo (por ejemplo
              SKUL-X7K2QM) que funciona como descuento. Igual que el
              cupón, el navegador NO la valida ni le toca el saldo: manda
              el código al Worker, el Worker lo busca y me dice cuánto
              saldo tiene. Acá solo muestro ese saldo que ya leí. */}
          <p className="tracked" style={{ fontWeight: 700, fontSize: 14, margin: "30px 0 12px" }}>¿Tenés una gift card?</p>

          {/* Mismo patrón que el cupón: arriba, la gift card ya validada
              (con el saldo que leyó el Worker y el recordatorio de que el
              descuento real lo recalcula el servidor al confirmar); abajo, el
              campo para escribir el código. */}
          {appliedGiftCard ? (
            <div style={{ marginBottom: 24, maxWidth: 380 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <p style={{ fontSize: 13, color: "var(--accent)", margin: 0 }}>
                  Gift card "{appliedGiftCard?.code || ""}" — saldo {fmt(appliedGiftCard?.saldo || 0)} ✓
                </p>
                <button
                  type="button"
                  onClick={() => typeof removeGiftCard === "function" && removeGiftCard()}
                  style={{ background: "none", border: "none", textDecoration: "underline", fontSize: 12, cursor: "pointer" }}
                >
                  Quitar
                </button>
              </div>
              <p style={{ fontSize: 12, color: "var(--grey-3)", marginTop: 6 }}>
                Se descuenta después del cupón. El descuento real lo calcula el servidor al confirmar.
              </p>
            </div>
          ) : (
            <div style={{ marginBottom: 8, maxWidth: 380 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={giftCardCode || ""}
                  onChange={(e) => setGiftCardCode && setGiftCardCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && typeof applyGiftCard === "function" && applyGiftCard()}
                  style={{ ...inputStyle, flex: 1 }}
                  placeholder="Ej: SKUL-X7K2QM"
                />
                <button
                  type="button"
                  className="btn-ghost tracked"
                  onClick={() => typeof applyGiftCard === "function" && applyGiftCard()}
                  disabled={giftCardChecking}
                  style={{ padding: "0 18px", opacity: giftCardChecking ? 0.5 : 1 }}
                >
                  {giftCardChecking ? "..." : "Aplicar"}
                </button>
              </div>
              {giftCardError && <p style={{ fontSize: 12.5, color: "crimson", marginTop: 8 }}>{giftCardError}</p>}
            </div>
          )}

          <div style={{ marginBottom: 34 }} />

          {/* --- MEDIO DE PAGO ---
              Son cuatro botones y el que elige el cliente define a qué
              pantalla de "gracias" lo mando después:
              - transferencia => los datos bancarios + pedir el comprobante.
              - efectivo      => pedir que coordinen una cita en el local.
              - débito/crédito=> pantalla simple de pedido registrado.
              OJO con tarjeta: hoy NO se cobra nada de verdad, no hay
              pasarela de pago conectada. El pedido se registra igual y el
              cobro se coordina a mano por WhatsApp. Es un paso simulado a
              propósito, no un cobro real.
              Efectivo da 10% off y es incompatible con Correo Argentino
              (no tiene sentido cobrar en el mostrador un paquete que se
              va por Correo), por eso se deshabilita y se deselecciona solo
              si el envío es por correo. */}
          <p className="tracked" style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Medio de pago</p>
          <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
            <button 
              type="button"
              className={`pay-radio ${payMethod === "debito" ? "active" : ""}`} 
              style={payBtn} 
              onClick={() => typeof setPayMethod === "function" && setPayMethod("debito")}
            >
              Débito
            </button>

            <button 
              type="button"
              className={`pay-radio ${payMethod === "credito" ? "active" : ""}`} 
              style={payBtn} 
              onClick={() => typeof setPayMethod === "function" && setPayMethod("credito")}
            >
              Crédito
            </button>

            <button 
              type="button"
              className={`pay-radio ${payMethod === "transferencia" ? "active" : ""}`} 
              style={payBtn} 
              onClick={() => typeof setPayMethod === "function" && setPayMethod("transferencia")}
            >
              Transferencia
            </button>

            <button 
              type="button"
              className={`pay-radio ${payMethod === "efectivo" ? "active" : ""}`} 
              style={{ ...payBtn, opacity: isCorreo ? 0.4 : 1, cursor: isCorreo ? "not-allowed" : "pointer" }} 
              onClick={() => { if (!isCorreo && typeof setPayMethod === "function") setPayMethod("efectivo"); }}
              disabled={isCorreo}
            >
              Efectivo — 10% off (con cita previa en el local)
            </button>
          </div>
        </div>

        <div style={{ border: "1px solid var(--black)", padding: 20, height: "fit-content" }}>
          <p className="tracked" style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Resumen</p>
          {/* --- RESUMEN DEL PEDIDO ---
              Acá está el resultado del ORDEN DE LOS DESCUENTOS, que es
              la regla que más importa del checkout:

                1. Subtotal (prendas x cantidad, sin envío).
                2. 10% off si paga en efectivo.
                3. Cupón, sobre lo que quede (y solo sobre las prendas
                   que su alcance cubre).
                4. Gift card, sobre lo que quede DESPUÉS del cupón.
                5. El envío se SUMA al final y ningún descuento lo cubre:
                   la gift card descuenta prendas, no el flete.

              Todo eso ya está calculado en StoreApp; yo solo lo muestro.
              OJO: esto es una previsualización. Al confirmar, el Worker
              vuelve a calcularlo todo leyendo el catálogo, el cupón y el
              saldo real de la gift card, y ese número es el que vale. Si
              no coincide, StoreApp muestra el del servidor en la pantalla
              de gracias. */}
          {(cart || []).map((i) => (
            <div key={i.key} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}>
              <span>{i.name}{i.size ? ` / ${i.size}` : ""}{i.color ? ` / ${i.color}` : ""} x{i.qty}</span>
              <span className="mono">{fmt(i.price * i.qty)}</span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid var(--grey-1)", marginTop: 12, paddingTop: 12, display: "grid", gap: 8 }}>
            <SummaryRow label="Subtotal" value={fmt(subtotal)} />
            {discount > 0 && <SummaryRow label="Descuento (10%)" value={"- " + fmt(discount)} accent />}
            {couponDiscount > 0 && <SummaryRow label={`Cupón (${appliedCoupon?.code || ""})`} value={"- " + fmt(couponDiscount)} accent />}
            {giftCardDiscount > 0 && <SummaryRow label={`Gift card (${appliedGiftCard?.code || ""})`} value={"- " + fmt(giftCardDiscount)} accent />}
            <SummaryRow label="Envío" value={shippingCost === 0 ? "Gratis" : fmt(shippingCost)} />
            <div style={{ borderTop: "1px solid var(--black)", marginTop: 6, paddingTop: 10, display: "flex", justifyContent: "space-between" }}>
              <span className="tracked" style={{ fontWeight: 700 }}>Total</span>
              <span className="mono" style={{ fontWeight: 700, fontSize: 17 }}>{fmt(total)}</span>
            </div>
          </div>

          {/* Confirmar: acá NO calculo nada. confirmOrder() arma el pedido
              con lo que hay en el carrito y manda al Worker los CÓDIGOS
              del cupón y de la gift card (nunca los montos). El Worker
              hace todo el trabajo real en un commit atómico: recalcula
              precios, descuenta stock, canjea el cupón, descuenta el saldo
              de la gift card y crea el pedido. Si lo rechaza, me pasa el
              mensaje y lo muestro abajo sin perder el carrito. */}
          <button 
            type="button"
            disabled={!canConfirm} 
            onClick={() => typeof confirmOrder === "function" && confirmOrder()} 
            className="btn-ghost tracked" 
            style={{ width: "100%", marginTop: 20, opacity: canConfirm ? 1 : 0.4 }}
          >
            {confirming ? "Confirmando..." : "Confirmar pedido"}
          </button>
          {!canConfirm && <p style={{ fontSize: 11.5, color: "var(--grey-3)", marginTop: 8 }}>Completá tu nombre, teléfono y elegí un medio de pago para continuar.</p>}
          {orderError && <p style={{ fontSize: 12.5, color: "crimson", marginTop: 10 }}>{orderError}</p>}
        </div>
      </div>
    </main>
  );
}

/** Una línea del resumen: rótulo a la izquierda, monto a la derecha.
 *  Con `accent` el texto va en óxido, que es el color que usamos para
 *  marcar todo lo que es descuento. No tiene estado ni lógica: solo
 *  formato. */
function SummaryRow({ label, value, accent }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: accent ? "var(--accent)" : "inherit" }}>
      <span>{label}</span><span className="mono">{value}</span>
    </div>
  );
}