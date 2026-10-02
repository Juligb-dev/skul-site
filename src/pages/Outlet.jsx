import React from "react";
import ProductGrid from "../components/ProductGrid.jsx";
import SkulWatermark from "../components/SkulWatermark.jsx";

/**
 * Pantalla de Outlet (la que el menú y el header muestran como "Sale").
 *
 * Qué es: el listado de prendas que ya están en su última oportunidad.
 * En el proyecto, "estar en outlet" es un estado del producto que se
 * prende desde el panel de admin, y lo que define es que la prenda
 * tiene un `outletPrice`: un precio rebajado aparte del de catálogo.
 * Ojo con esto porque cambia lo que ve el cliente: la prenda mantiene
 * su precio de catálogo (`price`) como referencia y lo que se cobra es
 * el de outlet; en la tarjeta conviven los dos, el viejo tachado y el
 * nuevo al lado. Y la prenda NO sale del catálogo: sigue apareciendo
 * en las dos secciones a la vez.
 *
 * Cuándo se muestra: cuando el estado `page` de StoreApp.jsx vale
 * "outlet" (la ruta /outlet). StoreApp la filtra por `p.outlet` y sólo
 * la monta si el panel prendió la sección y hay productos con outlet,
 * así que esta pantalla nunca aparece vacía.
 *
 * Props:
 *  - products: los productos con outlet, ya filtrados y activos.
 *    La grilla es la que dibuja el precio tachado + el de outlet.
 *  - openProduct(id): abre la ficha. Se la paso directo a la grilla
 *    para que el clic en la tarjeta vaya a la página del producto.
 *
 * Por qué es tan fina: outlet no necesita ninguna lógica propia. Usa la
 * misma ProductGrid que el catálogo, sin la bandera `nrs` de No-Restock,
 * así que sale con la paleta clara del sitio y no con la oscura del drop.
 */
export default function Outlet({ products, openProduct }) {
  // "fx-host" es la clase que habilita las capas de efecto del sitio
  // (ruido, grano) como fondo fijo de la pantalla.
  return (
        <main className="fx-host">
      {/* Wordmark gigante de fondo, de adorno, para que la página en
          blanco no quede tan vacía. */}
      <SkulWatermark />

      {/* --- cabecera: el rótulo chico y el título gigante --- */}
      <section style={{ padding: "64px 20px" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto" }}>
          <p className="mono tracked-lg" style={{ fontSize: 11, marginBottom: 14, color: "var(--grey-3)" }}>Last Chance Prices</p>
          <h1 className="display" style={{ fontSize: "clamp(38px,7vw,76px)", margin: "0 0 20px", lineHeight: 0.9 }}>Outlet</h1>
        </div>
      </section>

      {/* --- las prendas --- */}
      <section style={{ maxWidth: 1240, margin: "0 auto", padding: "10px 20px 80px" }}>
        {/* Sin la prop `nrs`: outlet se ve con la versión clara de la
            grilla. Los precios los resuelve la propia ProductGrid a
            partir de p.outlet / p.outletPrice. */}
        <ProductGrid products={products} openProduct={openProduct} />
      </section>
    </main>
  );
}