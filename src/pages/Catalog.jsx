import React from "react";
import { CATS } from "../data/config.js";
import ProductGrid from "../components/ProductGrid.jsx";
import Reveal from "../components/Reveal.jsx";

/** CATÁLOGO — pantalla "catalog".
 *
 *  Es el listado de toda la tienda con una barra de categorías arriba.
 *  Ojo con el reparto de responsabilidades: yo NO filtro nada. El
 *  filtrado por categoría y por producto activo lo hizo StoreApp
 *  antes de dármelos, así que acá solo Pinto lo que me llega.
 *
 *  Props:
 *  - cat: el id de la categoría seleccionada ("all", "hoodies", ...).
 *    Sale del estado de StoreApp y es lo que refleja la URL
 *    (/catalogo/hoodies), por eso no es estado local mío.
 *  - setCat: lo que llamo al tocar un botón de la barra. StoreApp
 *    actualiza su estado y la URL.
 *  - products: los productos YA filtrados por la categoría activa.
 *  - openProduct(id) / addToCart(...): los callbacks de siempre,
 *    se los paso directo a la grilla.
 */
export default function Catalog({ cat, setCat, products, openProduct, addToCart }) {
  // El nombre de la categoría activa, solo para el contador del
  // encabezado. Si el id no está en CATS (URL rara), cae en "Todo".
  const activeLabel = CATS.find(c => c.id === cat)?.label || "Todo";
  return (
    <main className="rf-catalog-page">
      {/* Encabezado: nombre fijo de la pantalla + cuántos productos
          hay con el filtro aplicado. */}
      <section className="rf-catalog-head">
        <Reveal>
          <p className="mono tracked rf-eyebrow">SKUL / SHOP</p>
          <h1 className="display rf-catalog-title">ALL<br />PRODUCTS</h1>
          <p className="rf-catalog-count">{products.length} PRODUCTOS — {activeLabel.toUpperCase()}</p>
        </Reveal>
      </section>

      {/* Barra de categorías: el id "all" es el pseudo-filtro de
          "todo junto" y viene incluido en CATS. */}
      <div className="rf-category-bar">
        <div className="rf-category-scroll">
          {CATS.map(c => (
            <button key={c.id} className={cat === c.id ? "is-active" : ""} onClick={() => setCat(c.id)}>
              {c.label.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* La grilla es la misma de la portada: yo solo le paso la lista
          ya filtrada y los dos callbacks. */}
      <ProductGrid products={products} openProduct={openProduct} addToCart={addToCart} />
    </main>
  );
}
