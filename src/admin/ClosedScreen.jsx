import React from "react";

/**
 * CLOSEDSCREEN — la pantalla que ve el visitante cuando la tienda está cerrada.
 *
 * Qué es: un cartelón a pantalla completa, con el logo arriba y un mensaje
 * grande en el medio. No pide login, no tiene carrito ni navegación: es
 * literalmente lo único que se dibuja en ese momento, y a propósito.
 *
 * Props que recibe:
 *   - message: el texto que escribió el dueño en /admin → "Estado del
 *     sitio" → "Mensaje de cerrado". Si viene vacío, uso el "Ya volvemos."
 *     que tengo hardcodeado acá abajo, para que la pantalla nunca quede
 *     en blanco aunque el documento de Firestore no tenga nada.
 *
 * A qué parte del sistema pertenece: es la contraparte visual de SiteGate,
 * el que decide entre esta pantalla y la tienda. No lee ni escribe nada:
 * todo lo que muestra ya se lo pasaron por props, así que no puede quedar
 * desfasada con la base.
 *
 * El fondo negro y el centrado vienen de la clase .closed-screen
 * (src/styles/global.css), no de estilos sueltos acá: es la misma que
 * usa el "Cargando…" de SiteGate, así que la transición de una pantalla
 * a la otra no tiene salto de color.
 *
 * El "Shop Closed" en inglés es a propósito: es la etiqueta que el
 * proyecto usa como guiño a la estética de marca.
 */
export default function ClosedScreen({ message }) {
  return (
    <div className="closed-screen">
      <p className="mono tracked-lg" style={{ fontSize: 11, color: "var(--grey-2)", marginBottom: 22 }}>SKUL</p>
      {/* El || es el fallback: si el dueño guardó el mensaje vacío, el
          shopping center no queda mudo. */}
      <h1 className="display" style={{ fontSize: "clamp(28px,6vw,48px)", margin: "0 0 16px", maxWidth: 560 }}>
        {message || "Ya volvemos."}
      </h1>
      <p style={{ fontSize: 13.5, color: "var(--grey-2)" }}>Shop Closed</p>
    </div>
  );
}
