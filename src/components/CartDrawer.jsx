import React, { useEffect } from "react";
import { X, Minus, Plus, Trash2, ArrowRight } from "lucide-react";
import { fmt } from "../utils/format.js";

/* Carrito lateral, integrado al diseño de la tienda: panel claro,
   esquinas redondeadas y por ENCIMA de la cabecera y del menú. */



/**
 * Hook suelto: cierra el carrito con la tecla Escape, pero sólo mientras
 * está abierto. Vive exportado aparte porque el carrito se monta una vez
 * y este hook se llama siempre con `true` (ver más abajo), así que en la
 * práctica este componente no se desmonta nunca: la animación de "se
 * va" la hace el CSS de la página padre.
 */
export function useCartEsc(open, close) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    // El cleanup saca el listener si el carrito se cierra o el componente
    // se desmonta: sin esto, cada apertura dejaría un listener colgado.
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);
}

/**
 * Panel lateral del carrito. No tiene estado propio: las líneas, las
 * acciones y el subtotal se los pasa StoreApp (que es quien tiene el
 * hook del carrito). Se dibuja por ENCIMA de la cabecera y del menú.
 *
 * Props:
 *  - cart: array de líneas del carrito. Cada línea trae
 *    key, name, size, color, price, qty, image y maxQty.
 *  - changeQty(key, delta): suma o resta una unidad.
 *  - removeItem(key): saca la línea entera.
 *  - subtotal: número, ya formateado acá con fmt.
 *  - close: cierra el panel.
 *  - goCheckout: lleva al checkout.
 *
 * Detalle de diseño: hay dos capas superpuestas (el backdrop oscuro que
 * cierra al clickear afuera y el <aside> del panel), y el aside va
 * después del backdrop en el DOM para quedar por encima.
 */
export default function CartDrawer({ cart, changeQty, removeItem, subtotal, close, goCheckout }) {
  // Escape siempre activo mientras el panel está montado.
  useCartEsc(true, close);
  return (
    // role="dialog" + aria-modal le avisa al lector de pantalla que esto
    // es una ventana encima del contenido y que no se debe saltar.
    <div className="rf-cart-root" role="dialog" aria-modal="true" aria-label="Carrito de compras">
      {/* Capa oscura: clickearla cierra, como el clic afuera de un modal. */}
      <div className="rf-cart-backdrop" onClick={close} />

      <aside className="rf-cart">
        {/* Cabecera del panel: nombre + cantidad total y botón de cerrar.
            El número entre paréntesis suma las unidades de todas las
            líneas, no cuenta items. */}
        <header className="rf-cart-head">
          <p className="rf-cart-title">Tu carrito{cart.length > 0 ? ` (${cart.reduce((s, i) => s + i.qty, 0)})` : ""}</p>
          <button className="rf-cart-close" onClick={close} aria-label="Cerrar carrito"><X size={18} /></button>
        </header>

        {/* Dos estados: carrito vacío o carrito con líneas. */}
        {cart.length === 0 ? (
          <div className="rf-cart-empty">
            <p>Todavía no agregaste nada.</p>
            <button className="btn-ghost" onClick={close}>Seguir mirando</button>
          </div>
        ) : (
          <>
            {/* Bloque de líneas scrolleables. */}
            <div className="rf-cart-items">
              {cart.map((i) => {
                // atMax apaga el botón "+" cuando la línea llegó al
                // stock real del talle. maxQty puede venir null si el
                // producto no tiene control de stock cargado.
                const atMax = i.maxQty != null && i.qty >= i.maxQty;
                return (
                  <div className="rf-cart-item" key={i.key}>
                    <div className="rf-cart-item-media">
                      {i.image && <img src={i.image} alt="" className="rf-cart-thumb" />}
                      <div className="rf-cart-item-main">
                        <p className="rf-cart-name">{i.name}</p>
                        {i.size && <p className="rf-cart-size mono">Talle {i.size}{i.color ? ` · ${i.color}` : ""}</p>}
                        {/* Stepper de cantidad: menos, número, más, y
                            borrar. Todas las acciones reciben el key de
                            la línea, nunca el índice del map. */}
                        <div className="rf-cart-qty">
                          <button onClick={() => changeQty(i.key, -1)} aria-label="Restar"><Minus size={12} /></button>
                          <span className="mono">{i.qty}</span>
                          <button onClick={() => changeQty(i.key, 1)} disabled={atMax} aria-label="Sumar"><Plus size={12} /></button>
                          <button className="rf-cart-remove" onClick={() => removeItem(i.key)} aria-label="Eliminar"><Trash2 size={13} /></button>
                        </div>
                      </div>
                    </div>
                    {/* Precio de la línea, ya multiplicado por cantidad. */}
                    <span className="rf-cart-price mono">{fmt(i.price * i.qty)}</span>
                  </div>
                );
              })}
            </div>

            {/* Pie: subtotal, aviso del 10% en efectivo y botón de pago. */}
            <div className="rf-cart-foot">
              <div className="rf-cart-total">
                <span>Subtotal</span>
                <span className="mono">{fmt(subtotal)}</span>
              </div>
              <p className="rf-cart-note mono">10% OFF PAGANDO EN EFECTIVO</p>

              <button className="rf-cart-cta" onClick={goCheckout}>
                Ir a pagar <ArrowRight size={15} />
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
