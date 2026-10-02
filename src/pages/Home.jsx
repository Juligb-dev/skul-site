import React, { useMemo } from "react";
import { ArrowUpRight } from "lucide-react";
import DropCountdown from "../components/DropCountdown.jsx";
import ProductGrid from "../components/ProductGrid.jsx";
import SafeImg from "../components/SafeImg.jsx";
import Reveal from "../components/Reveal.jsx";
import CategoryStory from "../components/CategoryStory.jsx";
import StickyRail from "../components/StickyRail.jsx";
import Fabric from "../components/Fabric.jsx";
import { useMediaQuery } from "../hooks/useMediaQuery.js";

/* ============================================================
   PORTADA — pantalla "home"
   ------------------------------------------------------------
   Es la primera pantalla que ve cualquiera que entra a la tienda.
   Toda la página es una pila de bloques que se van apilando al
   hacer scroll, como manda la estética editorial del proyecto.

   Yo no recibo ninguna prop de URL ni de router: la pantalla me la
   elige StoreApp según su estado `page`, y todo lo que yo hago para
   moverme es llamar a `nav(...)` o `goCatalog(...)`.

   Props que me pasa StoreApp, una por una:
   - goCatalog(filtro): abre el catálogo, opcionalmente con una
     categoría ya seleccionada. Sirve para los botones "SHOP ALL".
   - nav(pagina): cambia de pantalla (y actualiza la URL). El valor
     "noreastock" abre la pantalla del drop único.
   - status: el documento `settings/site` de Firestore (ver
     useSiteStatus). De ahí sale todo lo que el dueño edita desde
     /admin: heroImage, heroImageMobile, dropName, dropDate,
     dropEnabled, lookbookPhotos y categoryImages. Puede venir null
     mientras carga, por eso siempre lo leo con `?.`.
   - products: el catálogo YA filtrado por StoreApp (solo productos
     activos y que no son no-restock), ordenado de más nuevo a más
     viejo. Yo no vuelvo a filtrar nada.
   - nrsProducts: los productos del drop no-restock, que viven en
     otra pantalla y acá solo aparecen velados.
   - openProduct(id) y addToCart(prenda, talle, color): los mismos
     callbacks que usa el catálogo; se los paso a los componentes
     hijos para no resolverlos de nuevo ni duplicar estado.
   ============================================================ */

// Las cinco categorías del sitio, con la foto editorial que las
// representa cuando el dueño todavía no cargó una propia.
const categories = [
  ["HOODIES | BUZOS", "hoodies", "/editorial/skul-street.svg"],
  ["SWEATERS", "sweaters", "/editorial/skul-detail.svg"],
  ["REMERAS", "tees", "/editorial/skul-hero.svg"],
  ["DENIM", "denim", "/editorial/skul-abstract.svg"],
  ["ACCESORIOS", "accesorios", "/editorial/skul-street.svg"],
];

// Fotos de repuesto para la sección "Shop the Look": si el dueño no
// cargó nada en /admin, la sección no queda vacía ni muestra íconos.
const DEFAULT_LOOKBOOK = ["/editorial/skul-street.svg", "/editorial/skul-detail.svg", "/editorial/skul-abstract.svg"];

/** Armo la portada.
 *  La idea es que la primera pantalla sea una sola foto a pantalla
 *  completa y que todo lo demás venga "subiendo" por encima de ella
 *  a medida que el cliente baja. */
export default function Home({ goCatalog, nav, status, products = [], nrsProducts = [], openProduct, addToCart }) {
  // Reparto los productos en dos bloques sin tocar el array que me
  // pasaron: 8 para NOVEDADES y el resto, espaciado de a "step", para
  // DESTACADOS. El paso se calcula acá justamente para que DESTACADOS
  // siempre tenga hasta 8 cosas, sin importar cuántos productos haya.
  const { latest, featured } = useMemo(() => {
    const newest = products.slice(0, 8);
    if (products.length <= 8) return { latest: newest, featured: [] };
    const rest = products.slice(8);
    const step = Math.max(1, Math.floor(rest.length / 8));
    const picks = [];
    for (let i = 0; i < rest.length && picks.length < 8; i += step) picks.push(rest[i]);
    return { latest: newest, featured: picks };
  }, [products]);

  // "Shop the Look": uso las fotos que subió el dueño y, si no hay
  // ninguna, caigo a las de repuesto.
  const lookbook = status?.lookbookPhotos?.length ? status.lookbookPhotos : DEFAULT_LOOKBOOK;

  // En el celular usamos la foto vertical si el dueño la subió: como tiene
  // la forma de la pantalla, llena todo y se ve completa (sin franjas).
  // Si no hay foto vertical, se sigue viendo la horizontal entera (contain)
  // con el relleno borroso detrás.
  const isNarrow = useMediaQuery("(max-width: 900px)");
  const mobileHero = status?.heroImageMobile || "";
  const useMobileHero = isNarrow && mobileHero;
  const heroSrc = useMobileHero ? mobileHero : status?.heroImage;

  return (
    <main className="rotten-home">
      {/* --- 1) HERO: la foto de campaña a pantalla completa --- */}
      <section className="rotten-hero">
        {/* Relleno: la misma foto ampliada y borrosa detrás. En el celular la
            foto de abajo entra entera (contain) y esto tapa las franjas que
            sobran arriba y abajo, para que no queden vacías. */}
        {!useMobileHero && (
          <SafeImg className="rotten-hero-fill" src={status?.heroImage} fallback="/editorial/skul-hero.svg" alt="" aria-hidden="true" />
        )}
        <SafeImg className={`rotten-hero-photo${useMobileHero ? " is-crop" : ""}`} src={heroSrc} fallback="/editorial/skul-hero.svg" alt="Campaña SKUL" />
        {/* Velo oscuro: es lo que hace legible el texto blanco del hero. */}
        <div className="rotten-hero-shade" />
        {/* Texto del hero: nombre del drop + los dos atajos principales.
            SHOP ALL abre el catálogo completo y NEW DROP el drop único. */}
        <div className="rotten-hero-content">
          <span className="rotten-hero-eyebrow">YA DISPONIBLE</span>
          <h1>{status?.dropName || "DROP ACTUAL"}</h1>
          <span className="rotten-hero-rule" />
          <div className="rotten-hero-actions">
  <button onClick={() => goCatalog("all")}>
    SHOP ALL
  </button>

  <button onClick={() => nav("noreastock")}>
    NEW DROP
  </button>
</div>
        </div>
      </section>

      {/* --- 2) Hoja de contenido: sube por encima del hero. --- */}
      <div className="rf-sheet">
        {/* Cuenta regresiva: solo aparece si el dueño activó el drop
            desde /admin Y le puso fecha. El componente corre un
            setInterval de 1 segundo para descontar. */}
        {status?.dropEnabled && <DropCountdown name={status.dropName} date={status.dropDate} onClick={() => nav("noreastock")} />}

        {/* Novedades se despliega con el scroll (sección fijada + riel) */}
        <StickyRail
          title="NOVEDADES"
          products={latest}
          goCatalog={goCatalog}
          openProduct={openProduct}
          addToCart={addToCart}
          footNote="DESLIZÁ LA FILA O SEGUÍ BAJANDO"
        />

        {/* Destacados: solo se dibuja si quedaron productos sin mostrar
            en NOVEDADES. El offset de 70ms escalona la entrada. */}
        {featured.length > 0 && (
          <section className="rotten-products">
            <Reveal>
              <div className="rotten-products-head">
                <h2>DESTACADOS</h2>
                <button onClick={() => goCatalog("all")}>VER TODO <ArrowUpRight size={15} /></button>
              </div>
            </Reveal>
            <ProductGrid products={featured} openProduct={openProduct} addToCart={addToCart} rail />
          </section>
        )}

        {/* --- 3) Drop no-restock: vidrieras tapadas para generar ganas --- */}
        {nrsProducts.length > 0 && (
          <section className="rf-home-nrs">
            <div className="rf-home-nrs-head">
              <p className="mono">DROP ÚNICO — NO SE REPONE</p>
              <h2>NO-RESTOCK</h2>
              <div>
                <span>
                  Cada pieza se lanza una sola vez. Cuando se agota, se va de la web
                  y no vuelve. Lo que hay adentro es todo lo que va a haber.
                </span>
                <button className="rf-home-nrs-cta" onClick={() => nav("noreastock")}>
                  ENTRAR AL DROP <ArrowUpRight size={15} />
                </button>
              </div>
            </div>

            {/* No mostramos las prendas: solo siluetas tapadas, para que den
                ganas de entrar al drop. */}
            {/* Muestro solo las 4 primeras: más que eso ya es una grilla
                y se pierde el efecto de vidriera. Donde el dueño no
                cargó foto, cae a la textura de tela para no romper
                la retícula. */}
            <button className="rf-home-nrs-veil" onClick={() => nav("noreastock")} aria-label="Entrar al drop No-Restock">
              {nrsProducts.slice(0, 4).map((p) => (
                <span className="rf-home-nrs-slot" key={p.id}>
                  {p.photos?.[0]
                    ? <img src={p.photos[0]} alt="" className="rf-home-nrs-thumb" />
                    : <Fabric tone={p.tone} dark style={{ width: "100%", height: "100%" }} />}
                  <span className="rf-home-nrs-lock">BLOQUEADO</span>
                </span>
              ))}
            </button>
          </section>
        )}

        {/* --- 4) Shop the Look: mosaico editorial de hasta 6 fotos --- */}
        <section className="rotten-lookbook">
          <Reveal><h2>SHOP THE LOOK</h2></Reveal>
          {/* Si una foto de la lista falla, SafeImg cae a la de repuesto del
                    mismo índice (cíclico, por si hay más de 3). */}
          <div className="rotten-lookbook-grid">
            {lookbook.slice(0, 6).map((url, i) => (
              <Reveal key={url + i} delay={i * 70}>
                <SafeImg src={url} fallback={DEFAULT_LOOKBOOK[i % DEFAULT_LOOKBOOK.length]} alt="Look SKUL" />
              </Reveal>
            ))}
          </div>
        </section>

        {/* --- 5) Categorías sticky: la foto queda fija y van pasando
            los nombres al bajar (lo resuelve CategoryStory con scroll) --- */}
        <CategoryStory
          categories={categories}
          images={status?.categoryImages || {}}
          goCatalog={goCatalog}
        />
      </div>
    </main>
  );
}
