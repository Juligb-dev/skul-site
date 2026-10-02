import React from "react";
import { useReveal } from "../hooks/useReveal.js";

/**
 * Envoltorio que aparece cuando el bloque entra en pantalla. Es el
 * pedacito de scroll más repetido del sitio: grillas, textos y
 * separadores van envueltos en Reveal.
 *
 * Props:
 *  - children: lo que se va a mostrar.
 *  - delay: milisegundos de espera antes de arrancar la animación, en
 *    CSS puro (transition-delay). Sirve para escalonar varios bloques
 *    y que no aparezcan todos juntos.
 *  - style: estilos inline extra del contenedor.
 *
 * Lo importante: acá NO hay IntersectionObserver ni estado propio. Todo
 * eso vive en el hook useReveal (hooks/useReveal.js), que ya lo usa
 * otro componente también. Yo sólo traduzco su resultado a clases.
 */
export default function Reveal({ children, delay = 0, style = {} }) {
  // El hook devuelve el ref que hay que poner en el nodo observable y
  // el booleano "ya se vio". La transición la hace el CSS: sin is-active
  // el bloque está invisible (translate + opacity), con la clase entra.
  const [ref, shown] = useReveal();
  return (
    // reveal = estado inicial (oculto), reveal-shown = estado final.
    <div ref={ref} className={`reveal ${shown ? "reveal-shown" : ""}`} style={{ transitionDelay: `${delay}ms`, ...style }}>
      {children}
    </div>
  );
}
