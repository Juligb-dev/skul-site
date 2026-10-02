import React from "react";

/**
 * Efecto de fuego/brasa que va por detrás de la foto del producto en
 * No-Restock. No dibuja nada por su cuenta: es puramente una estructura
 * de dos <div> que el CSS (.nrs-fire-magma y .nrs-fire-core) anima con
 * blur y gradientes radiales. Lo separo en un componente porque
 * ProductGrid lo usa por cada producto y así el JSX de la grilla queda
 * corto.
 *
 * No recibe props y es aria-hidden: es decoración, no información.
 */
export default function FireEffect() {
  return (
    <div className="nrs-fire" aria-hidden="true">
      {/* magma: la mancha externa, más difusa y lenta. */}
      <div className="nrs-fire-magma" />
      {/* core: el núcleo brillante del centro, que late más rápido. */}
      <div className="nrs-fire-core" />
    </div>
  );
}
