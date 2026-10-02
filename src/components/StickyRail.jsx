import React, { useRef } from "react";
import { ArrowUpRight, ArrowLeft, ArrowRight } from "lucide-react";
import ProductGrid from "./ProductGrid.jsx";

/* ============================================================
   FRANJA DE PRODUCTOS
   ------------------------------------------------------------
   Fila horizontal que se puede empujar a mano (dedo, rueda o las
   flechas) y que además, como el resto de los bloques del home,
   sube por encima de la sección anterior. Así no hay que recorrer
   toda la fila para poder seguir bajando.
   ============================================================ */

/**
 * (El archivo se llama StickyRail pero el componente se llama
 * SectionRail.) Fila horizontal de productos que se empuja a mano.
 *
 * Props:
 *  - title: título de la franja.
 *  - products: los productos de la fila.
 *  - goCatalog(id): el "VER TODO".
 *  - openProduct / addToCart: se los pasa directo al ProductGrid.
 *  - dark: versión No-Restock (fondo negro, fuego y pastilla de
 *    talles dentro de la ficha).
 *  - footNote: texto chico opcional debajo de la fila.
 *
 * El "subir por encima de la sección anterior" del que habla el
 * comentario de cabecera NO es JavaScript: es position: sticky con
 * top:0 en la section. El navegador la clava abajo mientras entra el
 * bloque siguiente, así el visitante nunca tiene que recorrer miles de
 * píxeles de productos para poder seguir bajando.
 */
export default function SectionRail({ title, products, goCatalog, openProduct, addToCart, dark = false, footNote }) {
  // ref al contenedor scrolleable: lo necesito para medir cuánto
  // scrollear en cada click de flecha.
  const viewRef = useRef(null);

  /** Empuja la fila hacia la izquierda (-1) o la derecha (+1). */
  const nudge = (dir) => {
    const view = viewRef.current;
    if (!view) return;
    // Avanzo un 70% del ancho visible, con tope de 560px: en pantalla
    // ancha no quiero que salte medio catálogo de golpe.
    // behavior:"smooth" hace que el desplazamiento se interpole
    // (rueda suave) en vez del salto seco del scrollBy normal.
    view.scrollBy({ left: dir * Math.min(view.clientWidth * 0.7, 560), behavior: "smooth" });
  };

  // Sin productos no hay franja: devuelvo null (ni siquiera un
  // encabezado vacío, así no queda un hueco con el título sólo).
  if (!products || products.length === 0) return null;

  return (
    <section className={`rf-pin ${dark ? "rf-pin-dark" : ""}`}>
      {/* Título + herramientas de la fila. */}
      <div className="rf-pin-head">
        <h2>{title}</h2>
        <div className="rf-pin-tools">
          <button onClick={() => nudge(-1)} aria-label="Anterior"><ArrowLeft size={15} /></button>
          <button onClick={() => nudge(1)} aria-label="Siguiente"><ArrowRight size={15} /></button>
          <button className="rf-pin-all" onClick={() => goCatalog("all")}>VER TODO <ArrowUpRight size={14} /></button>
        </div>
      </div>

      {/* El viewport de la fila: es un scroller horizontal (overflow-x
          auto en el CSS) y por eso mismo es lo que miden las flechas y
          el scroll del dedo. */}
      <div className="rf-pin-viewport" ref={viewRef}>
        <ProductGrid products={products} openProduct={openProduct} addToCart={addToCart} nrs={dark} rail />
      </div>

      {footNote && <p className="rf-pin-note mono">{footNote}</p>}
    </section>
  );
}
