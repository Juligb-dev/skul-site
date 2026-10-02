import React, { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase.js";
import { fmt } from "../utils/format.js";

// Los cuatro estados por los que pasa un pedido, en orden. La barra de
// progreso que ve el cliente se arma comparando el `status` del pedido
// contra esta lista, así que si agregás un estado nuevo, agregalo acá
// y acordate de que los pedidos viejos pueden venir con otro valor.
const STEPS = [
  { key: "nuevo", label: "Recibido" },
  { key: "preparando", label: "Preparando" },
  { key: "enviado", label: "Enviado / listo" },
  { key: "entregado", label: "Entregado" },
];

// Cómo se muestra cada medio de pago. OJO: hoy no lo usa nadie en esta
// pantalla (el medio de pago NO se copia a la colección pública, así
// que ni siquiera llega acá). Lo dejo porque si algún día se quiere
// mostrar, el nombre ya está escrito.
const PAY_LABELS = {
  debito: "Débito",
  credito: "Crédito",
  transferencia: "Transferencia",
  efectivo: "Efectivo",
};

/**
 * Página pública de seguimiento.
 *
 * IMPORTANTE:
 * Esta página NO lee /orders.
 * Solo lee /orderTracking, que contiene información
 * específicamente preparada para mostrarse públicamente.
 *
 * La idea: el cliente entra a /seguimiento, mete el código que le
 * dimos al confirmar y ve en qué estado está su pedido, sin cuenta,
 * sin login y sin que nadie tenga que responderle un mensaje.
 *
 * Solo puedo leer esa colección, NO /orders. Es una decisión de diseño
 * de privacidad, no una limitación técnica: en /orders están el nombre,
 * el teléfono y la dirección del cliente, y esta pantalla es pública
 * (cualquiera con el código la abre). Así que cuando creamos el pedido
 * el Worker escribe una copia "limpia" en /orderTracking con solo lo
 * que se puede mostrar: prendas, total, estado, zona y el número de
 * seguimiento de Correo. Jamás nombre, teléfono ni medio de pago.
 *
 * Props:
 * - initialCode: el código que venía en la URL (?pedido=...). Si viene,
 *   la pantalla busca sola apenas carga; si no, el cliente lo tipea.
 */
export default function SeguimientoPedido({ initialCode }) {
  // Lo que el cliente está escribiendo en el campo de búsqueda.
  const [code, setCode] = useState(initialCode || "");
  // El pedido encontrado (o null). adentro está la copia pública.
  const [order, setOrder] = useState(null);
  // Mensaje de error (código inexistente o falla de red).
  const [error, setError] = useState("");
  // Está consultando: deshabilita el botón y muestra "...".
  const [loading, setLoading] = useState(false);

  // Busco el pedido por código. Recibo el código como argumento para
  // poder llamarla desde el useEffect (con el que vino en la URL) o
  // desde el botón (sin argumento, y usa lo que está tipeado).
  const search = async (c) => {
    const trimmed = (c ?? code).trim();

    // Con el campo vacío no dispara ni una consulta a Firestore.
    if (!trimmed) return;

    setLoading(true);
    setError("");
    // Limpio el pedido anterior: si el cliente busca otro código, no
    // debe quedar en pantalla el resultado viejo mientras espera.
    setOrder(null);

    try {
      // Lectura de UN documento por id (getDoc), no una consulta. El id
      // del documento ES el código del pedido.
      const snap = await getDoc(
        doc(db, "orderTracking", trimmed)
      );

      if (!snap.exists()) {
        // Dos causas posibles: el código está mal tipeado, o el pedido
        // existe pero todavía no se escribió la copia pública. Escribo
        // un mensaje que sirve para las dos.
        setError(
          "No encontramos ningún pedido con ese código. Revisá que esté completo, tal cual te lo dimos al confirmar la compra."
        );
      } else {
        // `id` primero para no perderlo si el documento también lo trae.
        setOrder({
          id: snap.id,
          ...snap.data(),
        });
      }
    } catch (err) {
      // Error de red o de permisos: va al log para el dev, al cliente
      // le digo algo que pueda hacer (reintentar).
      console.error("Error buscando seguimiento:", err);

      setError(
        "No se pudo buscar el pedido. Probá de nuevo en un momento."
      );
    }

    setLoading(false);
  };

  // Si la URL venía con ?pedido=..., busco apenas se monta la pantalla
  // para que el link guardado por el cliente funcione directo.
  useEffect(() => {
    if (initialCode) {
      search(initialCode);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  // Posición del pedido en la barra de pasos. -1 si el status guardado
  // no está en STEPS (por ejemplo "cancelado"), y en ese caso la barra
  // queda enteramente en blanco, que es justo lo que queremos.
  const currentStepIndex = order
    ? STEPS.findIndex(
        (s) => s.key === (order.status || "nuevo")
      )
    : -1;

  // Esto va dentro del <main id="contenido-principal"> de StoreApp, así que
  // NO puede abrir su propio <main>: HTML solo permite uno por página y
  // anidarlos rompe el landmark de navegación por teclado.
  return (
    <div
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "60px 20px 100px",
      }}
    >
      <h1
        className="display"
        style={{
          fontSize: "clamp(26px,5vw,38px)",
          margin: "0 0 10px",
        }}
      >
        Seguir mi pedido
      </h1>

      <p
        style={{
          fontSize: 14,
          color: "var(--grey-3)",
          marginBottom: 26,
        }}
      >
        Ingresá el código que te dimos al confirmar la compra.
      </p>

      {/* --- buscador --- */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 20,
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") search();
          }}
          placeholder="Código de tu pedido"
          className="mono"
          aria-label="Código de tu pedido"
          style={{
            flex: 1,
            border: "1px solid var(--black)",
            padding: "12px 14px",
            fontSize: 14,
          }}
        />

        <button
          onClick={() => search()}
          disabled={loading}
          className="btn-ghost tracked"
        >
          {loading ? "..." : "Buscar"}
        </button>
      </div>

      {error && (
        <p
          style={{
            fontSize: 13,
            color: "crimson",
            marginBottom: 20,
          }}
        >
          {error}
        </p>
      )}

      {/* Cancelado: "cancelado" no es un paso de la barra, es un estado
          aparte, así que se avisa por fuera y no se dibuja el progreso. */}
      {order && order.status === "cancelado" && (
          <p style={{ fontSize: 14, fontWeight: 700, color: "crimson", marginBottom: 14 }}>
            Este pedido fue cancelado. Si tenés dudas, escribinos por WhatsApp.
          </p>
        )}

        {order && (
        <div
          style={{
            border: "1px solid var(--black)",
            padding: 22,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 24,
            }}
          >
            {/* Barra de progreso: un puntito por paso. Los que están en
                índice <= currentStepIndex van llenos, o sea todo lo que ya
                pasó más el paso en el que está. */}
            {STEPS.map((s, i) => (
              <div
                key={s.key}
                style={{
                  flex: 1,
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    margin: "0 auto 6px",
                    background:
                      i <= currentStepIndex
                        ? "var(--black)"
                        : "var(--white)",
                    border: "1px solid var(--black)",
                  }}
                />

                <span
                  className="mono"
                  style={{
                    fontSize: 10,
                    color:
                      i <= currentStepIndex
                        ? "var(--black)"
                        : "var(--grey-3)",
                  }}
                >
                  {s.label}
                </span>
              </div>
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gap: 4,
              marginBottom: 14,
            }}
          >
            {/* Prendas del pedido: precio unitario x cantidad. Ojo, son
                los precios que quedaron asentados en el pedido, no los
                de hoy. */}
            {(order.items || []).map((i, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                }}
              >
                <span>
                  {i.name} / {i.size}
                  {i.color ? ` / ${i.color}` : ""}
                  {" "}x{i.qty}
                </span>

                <span className="mono">
                  {fmt(i.price * i.qty)}
                </span>
              </div>
            ))}
          </div>

          {/* Total final del pedido, tal como quedó asentado (ya con
              descuentos y envío, y ya calculado por el Worker). */}
          <div
            style={{
              borderTop: "1px solid var(--grey-1)",
              paddingTop: 10,
              display: "flex",
              justifyContent: "space-between",
              fontWeight: 700,
              fontSize: 14,
              marginBottom: 14,
            }}
          >
            <span>Total</span>

            <span className="mono">
              {fmt(order.total)}
            </span>
          </div>

          {/* Zona de envío/retiro. Ojo: acá va un TEXTO armado por el
              Worker (por ejemplo "Retiro en Los Toldos" o "Envío por
              Correo Argentino — Sucursal X"), no el id crudo. */}
          {order.zoneId && (
            <p
              style={{
                fontSize: 12.5,
                color: "var(--grey-3)",
                lineHeight: 1.7,
              }}
            >
              Envío / retiro:{" "}
              <strong style={{ color: "var(--black)" }}>
                {order.zoneId}
              </strong>
            </p>
          )}

          {/* Número de seguimiento de Correo Argentino: lo carga el
              admin desde el panel cuando despacha el paquete. */}
          {order.correoTracking && (
            <div
              style={{
                marginTop: 14,
                paddingTop: 14,
                borderTop: "1px solid var(--grey-1)",
              }}
            >
              <p
                style={{
                  fontSize: 12.5,
                  color: "var(--grey-3)",
                  marginBottom: 6,
                }}
              >
                Correo Argentino ya tiene tu envío.
                Número de seguimiento:{" "}
                <strong
                  className="mono"
                  style={{ color: "var(--black)" }}
                >
                  {order.correoTracking}
                </strong>
              </p>

              <a
                href="https://www.correoargentino.com.ar/seguimiento"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost tracked"
                style={{
                  display: "inline-block",
                  fontSize: 12,
                  padding: "8px 14px",
                }}
              >
                Ver estado en correoargentino.com.ar ↗
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}