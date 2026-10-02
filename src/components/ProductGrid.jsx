import React from "react";
import { ArrowUpRight, Plus } from "lucide-react";
import Fabric from "./Fabric.jsx";
import Reveal from "./Reveal.jsx";
import { fmt } from "../utils/format.js";
import FireEffect from "./FireEffect.jsx";

/**
 * Grilla de tarjetas de producto. Es el componente que más se repite del
 * proyecto: lo usan el catálogo, el outlet, No-Restock, la ficha de
 * producto (para "relacionados") y las franjas del home.
 *
 * Props:
 *  - products: array de productos ya filtrados por la página.
 *  - openProduct(id): abre la ficha. Los <a> reales los pongo igual
 *    (por SEO y para el botón central del mouse), pero con
 *    preventDefault los delego a la navegación de la app.
 *  - nrs: dibuja la versión No-Restock: fondo oscuro, fuego detrás de
 *    la foto y pastilla de talles dentro de la ficha.
 *  - addToCart(p, size): agrega una unidad. Si no viene (o sea, en un
 *    contexto donde sólo se navega), el botón de talle abre la ficha.
 *  - rail: la grilla es una fila horizontal scrolleable (franjas del
 *    home) en vez de columnas.
 *
 * No tiene estado: toda la lógica es derivar de props y despachar
 * callbacks, así el mismo componente sirve para las cinco pantallas.
 */
export default function ProductGrid({ products, openProduct, nrs, addToCart, rail = false }) {
  // Sin productos, en vez de dejar un hueco vacío devuelvo un texto:
  // el filtro que eligió el visitante tiene que explicar por qué.
  if (!products || products.length === 0) {
    return <p className="catalog-empty">Todavía no hay prendas en esta categoría.</p>;
  }

  return (
    <div className={`product-grid-page ${rail ? "is-rail" : ""}`}>
      {/* Acá va el loop de tarjetas. Todo lo que sigue son cálculos del
          producto y los JSX de la foto, la pastilla de talles y el
          precio. */}
      {products.map((p, i) => {
        const sizes = p.sizes || [];
        const stock = p.stock || {};
        // Solo se controla el stock si el producto tiene cantidades cargadas
        // (así una prenda vieja o de ejemplo sin stock sigue siendo comprable).
        const tracksStock = Object.keys(stock).length > 0;
        const inStock = tracksStock ? sizes.filter((s) => (stock[s] || 0) > 0) : sizes;
        // Agotado sólo si el producto declara talles y ninguno tiene
        // stock: un producto sin talles no se puede marcar como
        // agotado, porque técnicamente todavía se puede comprar.
        const soldOut = sizes.length > 0 && inStock.length === 0;
        // La pastilla de talles muestra como máximo 4: más botones no
        // entran en la tarjeta ni dejan el nombre.
        const shownSizes = inStock.slice(0, 4);
        // La "pastilla rápida": los botones de talle. La guardo en una
        // variable porque se dibuja en dos lugares distintos según el
        // modo (sobre la foto en la tienda, dentro de la ficha en
        // No-Restock) y no quiero duplicar el JSX.
        const quick = (
          <div className="rf-quick-sizes" aria-label="Agregar talle rápido">
            {/* Hay talles disponibles: uno por talle, que agrega al
                carrito. Si no hay, cae el texto que manda a la ficha. */}
            {shownSizes.length > 0 && !soldOut ? (
              shownSizes.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => (addToCart ? addToCart(p, size) : openProduct(p.id))}
                  title={`Agregar talle ${size}`}
                  aria-label={`Añadir talle ${size} al carrito`}
                >
                  {size}<Plus size={11} />
                </button>
              ))
            ) : (
              <span className="rf-no-size">VER PRODUCTO</span>
            )}
          </div>
        );

        // La foto de la prenda, con lo que va arriba: el fuego de
        // No-Restock, la imagen principal y la secundaria (la que se
        // ve al pasar el mouse, montada siempre para que no tarde en
        // cargar), o la tela sintética si no hay fotos.
        const media = (
          // El <a> tiene href real (para compartir y para SEO) pero le
          // saco el comportamiento por defecto y navego con la app.
          <a className="rf-product-media" href={`/producto/${p.slug || p.id}`} onClick={(e) => { e.preventDefault(); openProduct(p.id); }} aria-label={`Ver ${p.name}`}>
            {nrs && <FireEffect />}
            {/* La ?. es optional chaining: si photos no existe, la
                expresión corta acá y cae al Fabric de abajo. */}
            {p.photos?.length ? (
              <>
                <img src={p.photos[0]} alt={p.name} className="rf-product-image rf-product-image-main" />
                {p.photos[1] && <img src={p.photos[1]} alt="" className="rf-product-image rf-product-image-alt" />}
              </>
            ) : (
              <Fabric tone={p.tone} dark={nrs} style={{ width: "100%", height: "100%" }} />
            )}
            {/* Las pastillas de estado. En No-Restock se prioriza el
                cartel EXCLUSIVE y no se muestra el resto, para no
                ensuciar la foto. */}
            <div className="rf-product-badges">
              {soldOut && <span>SIN STOCK</span>}
              {nrs && <span>EXCLUSIVE</span>}
              {!soldOut && !nrs && p.tag && <span>{p.tag}</span>}
            </div>
            <span className="rf-product-arrow"><ArrowUpRight size={16} /></span>
          </a>
        );

        // Cada tarjeta entra con un Reveal (aparición al entrar en
        // pantalla). El delay escalonado de a 45ms, volviendo a cero
        // cada 4 productos, hace que aparezcan en oleadas y no todas
        // de golpe.
        // La variable CSS --product-tone le deja al CSS de No-Restock
        // tintar la ficha sin que JS calcule el color; ?? es "si es
        // null/undefined, usá el 0.65".
        return (
          <Reveal key={p.id} delay={(i % 4) * 45}>
            <article
              className={`rf-product-card ${nrs ? "rf-product-card-dark nrs-smart-card" : ""} ${soldOut ? "is-sold" : ""}`}
              style={nrs ? { "--product-tone": p.tone ?? 0.65 } : undefined}
            >
              {/* En la tienda la pastilla de talles flota sobre la foto
                  (como la referencia); en No-Restock queda dentro de la
                  ficha para no romper el fuego ni el fondo animado. */}
              {nrs ? media : <div className="rf-product-top">{media}{quick}</div>}

              {/* Datos de la prenda: nombre, precio y, si aplica, el
                  precio en efectivo. */}
              <div className="rf-product-info">
                <a className="rf-product-name" href={`/producto/${p.slug || p.id}`} onClick={(e) => { e.preventDefault(); openProduct(p.id); }}>{p.name}</a>
                <div className="rf-price-row">
                  {/* Precio tachado + precio nuevo cuando está en
                      outlet; si no, el precio solo. */}
                  {p.outlet && p.outletPrice ? (
                    <>
                      <span className="rf-old-price">{fmt(p.price)}</span>
                      <span className="rf-price rf-sale-price">{fmt(p.outletPrice)}</span>
                    </>
                  ) : (
                    <span className="rf-price">{fmt(p.price)}</span>
                  )}
                  {/* El precio en efectivo es siempre un 10% menos del
                      que se está mostrando, y en rojo porque es la
                      ganancia del local. */}
                  <span className="rf-transfer">
                    {fmt(Math.round((p.outlet && p.outletPrice ? p.outletPrice : p.price) * 0.9))} EFECT.

                  </span>
                </div>
                {nrs && quick}
              </div>
            </article>
          </Reveal>
        );
      })}
    </div>
  );
}
