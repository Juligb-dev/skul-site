import React, { useState, useRef, useLayoutEffect } from "react";
import { Search, ShoppingBag, UserRound, ArrowUpRight, X, Plus, Globe, Menu } from "lucide-react";
import { CATS, INSTAGRAM_HANDLE, WHATSAPP_NUMBER } from "../data/config.js";
import SafeImg from "./SafeImg.jsx";

// Anuncio por defecto del cinturón. Lo repito muchas veces porque el
// marquee (la cinta de texto que corre) es infinito: si el texto fuera
// más corto que el ancho de la pantalla, se vería el corte entre el
// final y el principio. Triplicado, el texto siempre es más largo que
// la cinta y el empalme nunca entra en pantalla.
const DEFAULT_ANNOUNCEMENT = "10% OFF PAGANDO EN EFECTIVO — ENVIOS A TODO EL PAÍS — 10% OFF PAGANDO EN EFECTIVO — ENVIOS A TODO EL PAÍS — 10% OFF PAGANDO EN EFECTIVO — ENVIOS A TODO EL PAÍS — 10% OFF PAGANDO EN EFECTIVO — ENVIOS A TODO EL PAÍS — 10% OFF PAGANDO EN EFECTIVO — ENVIOS A TODO EL PAÍS — 10% OFF PAGANDO EN EFECTIVO — ENVIOS A TODO EL PAÍS — 10% OFF PAGANDO EN EFECTIVO — ENVIOS A TODO EL PAÍS — 10% OFF PAGANDO EN EFECTIVO — ENVIOS A TODO EL PAÍS";

// Links principales del megamenú, compartidos por escritorio y celular.
// El "all" es un caso especial: lo trato como categoría (abre el
// catálogo), no como página.
const PRIMARY = [
  ["SHOP ALL", "all"],
  ["NO-RESTOCK", "noreastock"],
  ["GIFT CARDS", "giftcards"],
  ["SEGUIR PEDIDO", "seguimiento"],
  ["NOSOTROS", "nosotros"],
  ["CONTACTO", "contacto"],
];

// Columnas del megamenú de escritorio. Cada grupo tiene su "TODOS",
// que apunta al catálogo completo.
const GROUPS = [
  { title: "PARTES DE ARRIBA", items: [["TODOS", "all"], ["HOODIES | BUZOS", "hoodies"], ["SWEATERS", "sweaters"], ["REMERAS", "tees"]] },
  { title: "PARTES DE ABAJO", items: [["TODOS", "all"], ["DENIM", "denim"], ["JOGGINGS", "joggings"], ["BERMUDAS", "bermudas"]] },
  { title: "ACCESORIOS", items: [["TODOS", "accesorios"]] },
];

// Las dos tarjetas con foto del megamenú. La foto sale del panel de
// control (categoryImages) y, si no hay, cae a este SVG del proyecto.
const FEATURED = [
  ["HOODIES | BUZOS", "hoodies", "/editorial/skul-street.svg"],
  ["DENIM", "denim", "/editorial/skul-abstract.svg"],
];

/**
 * Cabecera de la tienda: cinturón de anuncios + barra de navegación +
 * tira de categorías + megamenú. Va siempre en pantalla, en todas las
 * páginas menos el panel de admin.
 *
 * Props (todas vienen de StoreApp):
 *  - nav(página): cambia de pantalla ("home", "nosotros", ...).
 *  - goCatalog(id): abre el catálogo con esa categoría.
 *  - itemCount: cuántas unidades hay en el carrito (el número de la
 *    bolsa).
 *  - setCartOpen: abre el carrito.
 *  - menuOpen / setMenuOpen: estado del megamenú. Vive en el padre y
 *    no acá porque el carrito necesita saber si lo tapó o no para
 *    decidir su posición.
 *  - showOutlet: si el panel prendió la sección Sale y hay productos
 *    en outlet, aparece el link.
 *  - cat: categoría abierta, para marcar el botón activo.
 *  - categoryImages: mapa id -> URL de las fotos de categoría.
 *  - announcement: texto del cinturón; si viene vacío uso el default.
 *
 * Decisiones de diseño:
 *  - El megamenú tiene DOS estructuras distintas: una hoja ancha de
 *    vidrio para escritorio (.rf-megamenu) y una pantalla clara con dos
 *    tarjetas redondeadas para celular (.rf-mshell). El CSS muestra una
 *    u otra según el ancho; yo dibujo las dos siempre.
 *  - El contador del carrito vive acá y no en la página, justamente
 *    para que esté siempre visible aunque el carrito esté cerrado.
 */
export default function Header({ nav, goCatalog, itemCount, setCartOpen, menuOpen, setMenuOpen, showOutlet, cat, categoryImages = {}, announcement = "" }) {
  // Qué grupo del menú del celular está desplegado (o null si ninguno).
  const [openGroup, setOpenGroup] = useState(null);
  // Qué pestaña del menú del celular está activa: la tienda o No-Restock.
  const [tab, setTab] = useState("tienda");

  // Todas las acciones del menú hacen lo mismo al final: navegar y
  // cerrar. Las agrupo para no olvidarme de cerrar en algún botón nuevo.
  const close = () => { setMenuOpen(false); setOpenGroup(null); };
  const doCat = (id) => { goCatalog(id); close(); };
  const doNav = (p) => { nav(p); close(); };
  // El "all" de PRIMARY es categoría; el resto, páginas.
  const doPrimary = (target) => (target === "all" ? doCat("all") : doNav(target));
  const text = (announcement || DEFAULT_ANNOUNCEMENT).trim();
  // El anuncio viene del panel de control; si no hay, uso el mío.


  // El encabezado queda pegado arriba al hacer scroll. Las barras que
  // se pegan debajo (como las categorías del catálogo) necesitan saber
  // su altura exacta para no quedar tapadas ni dejar un hueco por
  // donde se vean los productos "cortados". Esa altura cambia según
  // el ancho de pantalla y según lo largo que sea el anuncio, así que
  // en vez de hardcodear un número la medimos y la publicamos como
  // variable CSS (--rotten-header-h).
  const headerRef = useRef(null);
  const [paused, setPaused] = useState(false);
  // Pausa manual del cinturón: por accesibilidad, una animación que se
  // mueve sola tiene que poder frenarse (acá, con el botón de pausa).

  // useLayoutEffect y no useEffect a propósito: la medición tiene que
  // correr ANTES de que el navegador pinte, así la tira de categorías
  // de abajo nunca llega a verse corrida en un frame.
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const medir = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h > 0) document.documentElement.style.setProperty("--rotten-header-h", `${h}px`);
    };

    medir();

    // Se vuelve a medir si cambia el tamaño del encabezado (se
    // achica el anuncio, rota el celular, carga otra tipografía...).
    // ResizeObserver avisa de cualquier cambio de tamaño del elemento,
    // no sólo de los que dispara un resize de ventana.
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    window.addEventListener("orientationchange", medir);

    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", medir);
    };
  }, [text]);

  // El encabezado cambia de alto según la página (en el inicio va
  // superpuesto y sin padding inferior; en el resto ocupa su lugar).
  // El ResizeObserver no siempre alcanza a ver ese cambio al navegar,
  // así que volvemos a medir después de cada render para que la barra
  // de categorías quede siempre pegada justo debajo.
  // Este segundo efecto no lleva array de dependencias a propósito:
  // corre en cada render, justamente para no depender del observer.
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const h = Math.round(el.getBoundingClientRect().height);
    if (h > 0) document.documentElement.style.setProperty("--rotten-header-h", `${h}px`);
  });

  return (
    <header className="rotten-header" ref={headerRef}>
      <div className="rotten-bar">

        {/* 1) El cinturón de anuncios. El texto va DOS veces seguidas
            porque el CSS lo corre en loop infinito; con una sola copia
            se vería el salto. La segunda copia es aria-hidden para que
            el lector de pantalla no lea el anuncio al doble. */}
        {text && (
          <div className="rotten-announcement mono">
            <div className={`rotten-ticker${paused ? " paused" : ""}`}>
              <span>{text} — {text} — </span>
              <span aria-hidden="true">{text} — {text} — </span>
            </div>
            <button className="rotten-ticker-pause" onClick={() => setPaused(p => !p)} aria-label={paused ? "Reanudar anuncio" : "Pausar anuncio"}>
              {paused ? "▶" : "||"}
            </button>
          </div>
        )}


        {/* 2) La barra principal: botón de menú, logo y acciones. */}
        <div className="rotten-nav">
          <div className="rotten-nav-left">
            {/* Botón SHOP/CERRAR. aria-expanded le dice al lector de
                pantalla si el menú está abierto. */}
            <button
              className="rotten-shop-toggle"
              onClick={() => (menuOpen ? close() : setMenuOpen(true))}
              aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={menuOpen}
            >
              <span className="rotten-shop-icon">{menuOpen ? <X size={20} /> : <Menu size={20} />}</span>
              <span className="rotten-shop-text">{menuOpen ? "CERRAR" : "SHOP"}</span>
            </button>
          </div>
          <button className="rotten-logo" onClick={() => doNav("home")} aria-label="SKUL inicio">SKUL</button>
          {/* Acciones de la derecha. */}
          <div className="rotten-nav-right">
            <button aria-label="Buscar productos" onClick={() => doCat("all")}><Search size={19} /></button>
            {/* El botón de cuenta está deshabilitado a propósito (no hay
                área de cliente todavía): lo dejo en su lugar, apagado,
                para que la barra no cambie de ancho cuando sumen el
                servicio. */}
            <button className="rotten-account" aria-label="Mi cuenta" disabled style={{opacity:.4,cursor:"not-allowed"}}><UserRound size={18} /></button>
            <button className="rotten-cart" aria-label="Abrir carrito" onClick={() => setCartOpen(true)}>
              {/* El número vive acá y no en la página, así está
                  siempre visible aunque el carrito esté cerrado. */}
              <ShoppingBag size={19} /> <span>{itemCount}</span>
            </button>
          </div>
        </div>

        {/* 3) La tira de categorías. CATS viene de data/config.js, así
            agregar una categoría no obliga a tocar este archivo. */}
        <div className="rotten-cat-strip">
          {CATS.map((c) => (
            <button key={c.id} className={cat === c.id ? "is-active" : ""} onClick={() => doCat(c.id)}>{c.label}</button>
          ))}
          <button onClick={() => doNav("noreastock")}>No-Restock</button>
          <button onClick={() => doNav("giftcards")}>Gift Cards</button>
          {showOutlet && <button onClick={() => doNav("outlet")}>Sale</button>}
        </div>
      </div>

      <div className={`rotten-menu ${menuOpen ? "is-open" : ""}`}>

        {/* El megamenú está siempre montado; lo que cambia es la clase
            is-open, y el CSS hace la transición. Debajo va el velo
            oscuro: clickearlo cierra el menú. */}
        <div className="rotten-menu-backdrop" onClick={close} />

        {/* --- escritorio: hoja ancha de vidrio --- */}
        <div className="rf-megamenu">
          <div className="rf-megamenu-body">
            {/* Columna 1: links principales, sin categoría. */}
            <div className="rf-megamenu-quick">
              {PRIMARY.map(([label, target]) => (
                <button key={label} onClick={() => doPrimary(target)}>{label}</button>
              ))}
              {showOutlet && <button onClick={() => doNav("outlet")}>SALE</button>}
            </div>

            {/* Columna 2: los grupos de categorías. La sublista lleva
                is-open fijo (siempre desplegada en escritorio); en el
                celular es otro JSX distinto. */}
            <div className="rf-megamenu-cols">
              {GROUPS.map((g) => (
                <div className="rf-megamenu-col" key={g.title}>
                  <p className="rf-megamenu-col-title">{g.title}</p>
                  <ul className="rf-megamenu-sublist is-open">
                    {g.items.map(([label, id]) => (
                      <li key={g.title + label}>
                        <button onClick={() => doCat(id)}>{label}</button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Columna 3: las tarjetas con foto. SafeImg evita el
                cuadrado roto si la foto del panel no cargó. */}
            <div className="rf-megamenu-feature">
              {FEATURED.map(([label, id, fallback]) => (
                <button key={id} onClick={() => doCat(id)}>
                  <SafeImg src={categoryImages[id]} fallback={fallback} alt="" />
                  <span>{label} <ArrowUpRight size={14} /></span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* --- celular: pantalla clara, dos tarjetas redondeadas --- */}
        <div className="rf-mshell">
          {/* Tarjeta 1: cerrar, logo y el selector TIENDA / NO-RESTOCK.
              En mobile No-Restock es una pestaña aparte y no un link
              más de la lista. */}
          <div className="rf-mcard rf-mcard-top">
            <button className="rf-mclose" onClick={close} aria-label="Cerrar menú"><X size={20} /></button>
            <span className="rotten-logo">SKUL</span>
            <div className="rf-mseg">
              <button className={tab === "tienda" ? "is-active" : ""} onClick={() => setTab("tienda")}>TIENDA</button>
              <button className={tab === "nrs" ? "is-active" : ""} onClick={() => setTab("nrs")}>NO-RESTOCK</button>
            </div>
          </div>

          <div className="rf-mcard rf-mcard-body">
            {/* Tarjeta 2: el cuerpo. Cambia entero según la pestaña:
                la de "tienda" muestra links + grupos, y la de
                No-Restock, dos shortcuts al drop. */}
            {tab === "tienda" ? (
              <>
                <div className="rf-mprimary">
                  {PRIMARY.map(([label, target]) => (
                    <button key={label} onClick={() => doPrimary(target)}>{label}</button>
                  ))}
                  {showOutlet && <button onClick={() => doNav("outlet")}>SALE</button>}
                </div>

                {/* Los grupos desplegables. A diferencia del escritorio,
                    arrancan cerrados: el único desplegado es el que
                    guardo en openGroup (tocar el mismo lo vuelve a
                    cerrar). */}
                <div className="rf-mgroups">
                  {GROUPS.map((g) => (
                    <div className="rf-mgroup" key={g.title}>
                      <button
                        className={`rf-mgroup-head ${openGroup === g.title ? "is-open" : ""}`}
                        onClick={() => setOpenGroup(openGroup === g.title ? null : g.title)}
                        aria-expanded={openGroup === g.title}
                      >
                        {g.title}
                        <Plus size={16} />
                      </button>
                      <ul className={`rf-mgroup-sub ${openGroup === g.title ? "is-open" : ""}`}>
                        {g.items.map(([label, id]) => (
                          <li key={g.title + label}><button onClick={() => doCat(id)}>{label}</button></li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="rf-mprimary">
                <button onClick={() => doNav("noreastock")}>VER EL DROP</button>
                <button onClick={() => doCat("all")}>TODO EL CATÁLOGO</button>
              </div>
            )}

            {/* Pie de la tarjeta: cuenta (hoy lleva a contacto, no hay
                área de cliente) e Instagram. */}
            <div className="rf-mfoot">
              <button className="rf-mbtn-dark" onClick={() => doNav("contacto")}>MI CUENTA</button>
              <a
                className="rf-mbtn-light"
                href={`https://instagram.com/${INSTAGRAM_HANDLE}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                INSTAGRAM
              </a>
            </div>

            {/* Link a WhatsApp disfrazado de aviso de cobertura:
                el mismo numero de siempre, encontrado desde config. */}
            <a
              className="rf-mcountry"
              href={`https://wa.me/${WHATSAPP_NUMBER}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Globe size={15} /> Envíos a todo el país
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}