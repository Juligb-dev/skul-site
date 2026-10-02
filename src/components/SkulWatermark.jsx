import React from "react";

/* wordmark gigante de fondo, respirando despacio.
   onDark=true (No-Restock, fondo negro) usa el tono cálido/rojizo;
   sin la prop (Catalog, Outlet, Nosotros, Contacto) usa el oscuro sobre fondo claro. */
/**
 * Wordmark gigante de fondo, de adorno. Va en las páginas de
 * contenido (Gift Cards, Nosotros, Contacto, Outlet, catálogo) para
 * que el fondo no quede tan vacío; la animación de "respirar" la hace
 * el CSS.
 *
 * Props:
 *  - onDark: el fondo de la página es negro (No-Restock) o es claro.
 *    Sólo cambia la clase; el tono cálido/rojizo contra el oscuro salen
 *    del CSS, no del JS.
 */
export default function SkulWatermark({ onDark = false }) {
  // aria-hidden porque el "SKUL" gigante es decoración: si el lector de
  // pantalla lo leyera, el nombre de la marca aparecería dos veces.
  return (
    <div className={`skul-watermark${onDark ? " skul-watermark--dark" : ""}`} aria-hidden="true">
      <span className="display">SKUL</span>
    </div>
  );
}