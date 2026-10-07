import React, { useEffect, useState } from "react";
import Fabric from "../components/Fabric.jsx";
import ProductGrid from "../components/ProductGrid.jsx";
import Reveal from "../components/Reveal.jsx";
import { fmt } from "../utils/format.js";
import { WHATSAPP_NUMBER } from "../data/config.js";
import { ChevronLeft, Ruler, X, Share2, Check, Truck, RefreshCcw, Percent, Plus, Minus, MessageCircle } from "lucide-react";

/* ============================================================
   FICHA DE PRODUCTO
   ------------------------------------------------------------
   Layout de referencia: la foto ocupa la izquierda (con las
   miniaturas en una tira vertical al costado) y toda la
   información vive en un panel redondeado a la derecha: precio
   con transferencia y cuotas, color, talle, botón grande, envío,
   escala de calce y acordeones. En celular la tira de miniaturas
   pasa a ser una pastilla de vidrio debajo de la foto, y el botón
   de compra queda fijo abajo.
   ============================================================ */

// Etiquetas de la escala de calce, de más angosto a más holgado.
const FIT_LABELS = ["SLIM", "TRUE TO SIZE", "BAGGY"];

/** Armo la ficha de una prenda.
 *
 *  Cómo llega acá la prenda: la URL es /producto/{slug}, y ese slug
 *  (nombre legible de la URL, tipo "buzo-oversized-negro") lo resuelve
 *  StoreApp contra Firestore una vez que cargó el catálogo; si no
 *  encuentra ni por slug ni por id, manda al catálogo en vez de dejar
 *  una pantalla rota. Así que yo ya recibo el objeto `product`
 *  resuelto, no tengo que buscar nada.
 *
 *  Props:
 *  - product: la prenda completa tal cual está en Firestore.
 *  - addToCart(prenda, talle, color): agrego al carrito. El color va
 *    como { name, hex } o undefined si la prenda no tiene colores.
 *  - nav(pagina): me sirve para el botón "Volver" (vuelve al drop
 *    si es no-restock, si no al catálogo) y para abrir la guía de
 *    talles o la política de cambios.
 *  - related: hasta 6 prendas de la MISMA categoría, ya filtradas por
 *    StoreApp. Es el "también te puede interesar" del pie.
 *  - openProduct(id): para que la grilla de relacionados sea navegable.
 *
 *  Ojo con los precios: lo que se calcula acá es SOLO la previsualización
 *  que ve el cliente. El total real lo recalcula el Worker al confirmar.
 */
export default function ProductPage({ product, addToCart, nav, related = [], openProduct }) {
  // --- Estado local de la ficha ---
  // Talle elegido. Arranca en null a propósito: no quiero que se pueda
  // agregar al carrito sin elegir talle explícitamente.
  const [size, setSize] = useState(null);
  // Índice del color elegido (no el color entero: el hex lo saco de abajo).
  const [colorIdx, setColorIdx] = useState(0);
  // Índice de la foto grande que se está mirando.
  const [photo, setPhoto] = useState(0);
  // Visor de la foto a pantalla completa (lightbox).
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // Id del acordeón abierto. null = todos cerrados. Es un solo string
  // justamente para que abrir uno cierre el otro.
  const [accordion, setAccordion] = useState(null);
  // Estado del zoom al pasar el mouse por la foto.
  const [zooming, setZooming] = useState(false);
  // Punto de anclaje del zoom (en %), siguiendo el cursor.
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });

  // Datos derivados de la prenda ------------------------------------------------

  // Cuando la prenda no tiene fotos, invento cuatro "ángulos" de textura
  // para que la tira de miniaturas no quede vacía.
  const angles = [155, 210, 100, 250];
  const baseTone = typeof product.tone === "number" ? product.tone : 0.72;
  const tones = [baseTone, Math.min(1, baseTone + 0.08), Math.max(0.5, baseTone - 0.08), baseTone];

  const photos = product.photos || [];
  const videos = product.videos || [];
  // Tira de medios de la ficha: primero las fotos (la portada del
  // catálogo sigue siendo photos[0]) y después los videos. Cada entrada
  // lleva su tipo para que el escenario y el lightbox sepan si dibujar
  // un <img> con zoom o un <video> con controles.
  const media = [
    ...photos.map((src) => ({ tipo: "foto", src })),
    ...videos.map((src) => ({ tipo: "video", src })),
  ];
  const hasMedia = media.length > 0;
  // Medio visible ahora: el que marca la miniatura activa, con respaldo
  // al primero por si el índice se quedó corto (por ejemplo, si un
  // producto perdió fotos entre render y render).
  const actual = media[photo] || media[0];
  const colors = product.colors || [];
  const availableSizes = product.sizes || [];
  const stock = product.stock || {};
  // Solo se controla el stock si hay cantidades cargadas, para que una
  // prenda sin stock cargado siga siendo comprable.
  const tracksStock = Object.keys(stock).length > 0;

  // PREVISUALIZACIÓN de precios, nada más. El precio grande de la ficha
  // Precio de lista grande y, abajo, el 10% de descuento pagando en
  // efectivo o transferencia (el nombre de la variable dice
  // "transferencia" pero el cartel dice "efectivo": son dos nombres
  // para lo mismo en esta tienda).
  // Si la prenda está en outlet, el precio de referencia es el rebajado.
  const esOutlet = Boolean(product.outlet && product.outletPrice);
  const basePrice = esOutlet ? product.outletPrice : product.price;
  const transferPrice = Math.round(basePrice * 0.9);
  // Agotado = tiene talles cargados, hay stock cargado, y NINGÚN talle
  // tiene unidades. Un producto sin talles nunca se marca como agotado.
  const soldOut = availableSizes.length > 0 && tracksStock && availableSizes.every((s) => (stock[s] || 0) <= 0);
  // Escala de calce: 0 = slim, 1 = baggy, 0.5 = true to size. La dejo
  // siempre entre 0 y 1 así el punto de la barrita nunca se sale.
  const fit = typeof product.fit === "number" ? Math.min(1, Math.max(0, product.fit)) : 0.5;

  // Cuántas miniaturas dibujo: los medios reales (fotos + videos), o las
  // texturas falsas.
  const thumbCount = hasMedia ? media.length : tones.length;
  // OJO: `totalPhotos` no se usa en ningún lado, quedó de una versión
  // anterior. No lo toco porque no es mi turno de limpiar, pero
  // verifiquémoslo: si algo lo necesita, que lo vuelva a escribir.
  const totalPhotos = Math.max(thumbCount, 1);

  // Un acordeón a la vez: si el que toco ya estaba abierto, lo cierro.
  const toggleAccordion = (id) => setAccordion(accordion === id ? null : id);

  // Con el visor abierto, Escape lo cierra. El return del effect es el
  // "limpieza": React lo corre al cerrar o al volver a correr el effect,
  // y ahí saco el listener.
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setLightboxOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen]);

  return (
    <main className={`rf-pdp ${product.nrs ? "rf-pdp-dark" : ""}`}>
      <div className="rf-pdp-inner">
        <button className="rf-pdp-back tracked" onClick={() => nav(product.nrs ? "noreastock" : "catalog")}>
          <ChevronLeft size={14} /> Volver
        </button>

        <div className="rf-pdp-grid">
          {/* --- media --- */}
          <div className="rf-pdp-media">
            {/* Tira de miniaturas: una por foto (o por textura falsa). */}
            <div className="rf-pdp-thumbs">
              {Array.from({ length: thumbCount }).map((_, i) => (
                <button
                  key={i}
                  className={photo === i ? "is-active" : ""}
                  onClick={() => setPhoto(i)}
                  aria-label={media[i]?.tipo === "video" ? `Video ${i + 1}` : `Foto ${i + 1}`}
                >
                  {hasMedia ? (
                    media[i].tipo === "video"
                      ? <video src={media[i].src} muted playsInline preload="metadata" />
                      : <img src={media[i].src} alt="" />
                  ) : (
                    <Fabric tone={tones[i]} dark={product.nrs} angle={angles[i]} style={{ width: "100%", height: "100%" }} />
                  )}
                </button>
              ))}
            </div>

            {/* Foto grande: click abre el visor, y con el mouse encima hace
                zoom 1.9x anclado donde está el cursor. Para eso saco el
                rectángulo del elemento y convierto la posición del mouse
                a porcentaje. Agotada la paso a blanco y negro. */}
            <div
              className="rf-pdp-stage"
              onClick={() => setLightboxOpen(true)}
              onMouseMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setZoomPos({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
              }}
              onMouseEnter={() => setZooming(true)}
              onMouseLeave={() => setZooming(false)}
            >
              {!hasMedia ? (
                <Fabric tone={tones[photo]} dark={product.nrs} angle={angles[photo]} style={{ width: "100%", height: "100%", filter: soldOut ? "grayscale(1)" : "none" }} />
              ) : actual.tipo === "video" ? (
                /* Video: controles nativos del navegador, sin zoom (el
                   click tendría que servir para pausar/bajar volumen, no
                   para abrir el lightbox — por eso stopPropagation). */
                <video
                  src={actual.src}
                  controls
                  autoPlay
                  loop
                  playsInline
                  onClick={(e) => e.stopPropagation()}
                  style={{ filter: soldOut ? "grayscale(1)" : "none" }}
                />
              ) : (
                <img
                  src={actual.src}
                  alt={product.name}
                  style={{
                    filter: soldOut ? "grayscale(1)" : "none",
                    transform: zooming ? "scale(1.9)" : "scale(1)",
                    transformOrigin: `${zoomPos.x}% ${zoomPos.y}%`,
                    transition: zooming ? "none" : "transform .35s ease",
                  }}
                />
              )}
              <div className="rf-pdp-badges">
                {soldOut && <span>SIN STOCK</span>}
                {product.nrs && <span>EXCLUSIVE</span>}
              </div>
            </div>
          </div>

          {/* --- panel de información --- */}
          <aside className="rf-pdp-panel">
            {/* Nombre + botón de compartir */}
            <div className="rf-pdp-title-row">
              <h1>{product.name}</h1>
              <ShareButton product={product} />
            </div>

            {/* Los dos precios de la misma prenda. Arriba, en grande,
                el precio de lista (o de outlet): es el precio "real"
                de la prenda y el que más pesa en la decisión. Abajo,
                más chica, la aclaración del 10% de descuento pagando
                en efectivo o transferencia. Antes iba al revés (el
                efectivo en grande y la lista chiquita) y confundía. */}
            <div className="rf-pdp-price">
              <div className="rf-pdp-price-main">
                <span className="rf-pdp-price-values">
                  {esOutlet && <span className="rf-pdp-strike">{fmt(product.price)}</span>}
                  <span className="rf-pdp-now">{fmt(basePrice)}</span>
                </span>
                <span className="rf-pdp-note">{esOutlet ? "PRECIO EN OUTLET" : "PRECIO DE LISTA"}</span>
              </div>
              <div className="rf-pdp-price-alt">
                <span>Efectivo o transferencia: <strong>{fmt(transferPrice)}</strong></span>
                <span className="rf-pdp-note">10% OFF</span>
              </div>
            </div>

            {/* Selector de color. Solo aparece si la prenda tiene colores
                cargados. Acepta las dos formas que hay en Firestore:
                string suelto ("#111") u objeto { name, hex }. */}
            {colors.length > 0 && (
              <div className="rf-pdp-field">
                <p className="rf-pdp-label">SELECCIONAR COLOR: {String((colors[colorIdx]?.name || colors[colorIdx] || "")).toUpperCase()}</p>
                <div className="rf-pdp-swatches">
                  {colors.map((c, i) => {
                    const hex = typeof c === "string" ? c : c.hex;
                    return (
                      <button
                        key={hex + i}
                        className={colorIdx === i ? "is-active" : ""}
                        style={{ background: hex }}
                        onClick={() => setColorIdx(i)}
                        aria-label={c.name ? `Color ${c.name}` : `Color ${i + 1}`}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            <div className="rf-pdp-field">
              <p className="rf-pdp-label">SELECCIONAR TALLE</p>
              <div className="rf-pdp-sizes">
                {availableSizes.map((s) => {
                  // REGLA DE STOCK POR TALLE: el stock es un objeto
                  // { "M": 3, "L": 0 }. Si el producto tiene ese objeto
                  // cargado, un talle en 0 queda deshabilitado y no se
                  // puede agregar al carrito. Si NO hay objeto de stock
                  // cargado, Infinity: la prenda sigue siendo comprable
                  // (el control real igual lo hace el Worker).
                  const qty = tracksStock ? stock[s] || 0 : Infinity;
                  const out = qty <= 0;
                  // Con 1 a 3 unidades el talle avisa: "LA ÚLTIMA"
                  // (pulsando) o "QUEDAN N". Es la urgencia de
                  // streetwear: lo escaso se decide antes.
                  const poco = tracksStock && qty > 0 && qty <= 3;
                  return (
                    <button
                      key={s}
                      disabled={out}
                      className={`rf-pdp-size ${size === s ? "is-active" : ""} ${out ? "is-out" : ""}`}
                      onClick={() => !out && setSize(s)}
                    >
                      <span className="rf-pdp-size-letra">{s}</span>
                      {poco && (
                        <span className={`rf-pdp-size-stock ${qty === 1 ? "is-last" : ""}`}>
                          {qty === 1 ? "ÚLTIMA" : `QUEDAN ${qty}`}
                        </span>
                      )}
                    </button>
                  );
                })}
                {availableSizes.length === 0 && <span className="rf-pdp-hint">Sin talles cargados todavía.</span>}
              </div>
              <button className="rf-pdp-guide" onClick={() => nav("size-guide")}>
                <Ruler size={13} /> Ver guía de talles
              </button>
            </div>

            {/* Botón de compra: solo se habilita con talle elegido y sin
                agotar. El texto cambia según el estado para que el
                cliente sepa qué le falta. */}
            <button
              className="rf-pdp-cta"
              disabled={!size || soldOut}
              onClick={() => addToCart(product, size, colors[colorIdx])}
            >
              {soldOut ? "SIN STOCK" : size ? `AGREGAR AL CARRITO — TALLE ${size}` : "SELECCIONÁ UN TALLE"}
            </button>

            {/* Urgencia: solo con 1 a 3 unidades del talle elegido. Con
                1 sola la animación de pulso hace que se decida. */}
            {size && tracksStock && stock[size] > 0 && stock[size] <= 3 && (
              <p className={`rf-pdp-hint rf-pdp-hint-alert ${stock[size] === 1 ? "is-last" : ""}`}>
                {stock[size] === 1 ? "SE VA: QUEDÓ LA ÚLTIMA DE ESTE TALLE" : `¡Quedan ${stock[size]}!`}
              </p>
            )}

            {/* Consulta por WhatsApp: mensaje precargado con la prenda
                (y el talle si ya lo eligió). El número es el de
                config.js, el mismo de todo el sitio. */}
            <a
              href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
                `Hola! Me interesa "${product.name}"${size ? ` en talle ${size}` : ""} · ${fmt(basePrice)} (10% OFF en efectivo). ¿Sigue?`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rf-pdp-wa tracked"
            >
              <MessageCircle size={15} /> Preguntar por WhatsApp
            </a>

            {/* Envíos: los dos que ofrecemos siempre, los precios salen
                en el checkout. */}
            <div className="rf-pdp-ship">
              <Truck size={14} /> Envío a todo el país — retiro en Los Toldos
            </div>

            {/* Escala de calce: el puntito se posiciona con `fit * 100`
                del ancho de la barrita. */}
            <div className="rf-pdp-fit">
              <p className="rf-pdp-label">
                FIT
                <span>{FIT_LABELS[0]}</span><span>{FIT_LABELS[1]}</span><span>{FIT_LABELS[2]}</span>
              </p>
              <div className="rf-pdp-fit-track"><span style={{ left: `${fit * 100}%` }} /></div>
            </div>

            {/* --- acordeones de información: uno abierto a la vez --- */}
            <div className="rf-pdp-accordions">
              <Accordion
                id="info"
                index="01"
                title="INFORMACIÓN"
                open={accordion === "info"}
                onToggle={toggleAccordion}
              >
                {product.description
                  ? <p>{product.description}</p>
                  : <p>Todavía no cargamos una descripción para esta prenda.</p>}
                {product.composition && <p className="rf-pdp-mono">{product.composition}</p>}
              </Accordion>

              <Accordion
                id="talles"
                index="02"
                title="TABLA DE TALLES"
                open={accordion === "talles"}
                onToggle={toggleAccordion}
              >
                <p>Medidas de esta prenda, talle por talle.</p>
                <button className="rf-pdp-link" onClick={() => nav("size-guide")}>Abrir la guía de talles</button>
              </Accordion>

              <Accordion
                id="cambios"
                index="03"
                title="CAMBIOS Y DESPACHOS"
                open={accordion === "cambios"}
                onToggle={toggleAccordion}
              >
                <p>Los despachos se hacen dentro de las 48 horas de confirmado el pago. Los cambios y devoluciones se toman dentro de los 30 días.</p>
                <div className="rf-pdp-trust">
                  <span><RefreshCcw size={13} /> Cambios y devoluciones</span>
                  <span onClick={() => nav("cambios")} role="link"><Percent size={13} /> Ver política</span>
                </div>
              </Accordion>
            </div>
          </aside>
        </div>

{/* Relacionados: mismo componente de grilla que el catálogo. */}
        {related.length > 0 && (
          <section className="rf-pdp-related">
            <Reveal>
              <div className="rf-pdp-related-head">
                <h2>TAMBIÉN TE PUEDE INTERESAR</h2>
              </div>
            </Reveal>
            <ProductGrid products={related} openProduct={openProduct} addToCart={addToCart} rail />
          </section>
        )}
      </div>

      {/* barra fija de compra (celular): mismo botón que el del panel,
          duplicado abajo para que quede al alcance del pulgar sin
          tener que volver arriba en la página. Al lado, el atajo de
          WhatsApp con la prenda precargada. */}
      <div className="rf-pdp-sticky">
        <a
          href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
            `Hola! Me interesa "${product.name}"${size ? ` en talle ${size}` : ""} · ${fmt(basePrice)}. ¿Sigue?`
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rf-pdp-sticky-wa"
          aria-label="Preguntar por WhatsApp"
        >
          <MessageCircle size={20} />
        </a>
        <button disabled={!size || soldOut} onClick={() => addToCart(product, size, colors[colorIdx])}>
          {soldOut ? "SIN STOCK" : size ? `AGREGAR — TALLE ${size}` : "SELECCIONÁ UN TALLE"}
        </button>
      </div>

      {/* Visor a pantalla completa. Se cierra clicking en el fondo
          oscuro, en la X o con Escape (el listener de más arriba). Los
          stopPropagation evitan que el click en la foto la cierre. */}
      {lightboxOpen && (
        <div
          onClick={() => setLightboxOpen(false)}
          className="rf-pdp-lightbox" role="dialog" aria-modal="true" aria-label="Vista ampliada de la imagen"
          style={{ background: "rgba(17,17,17,.92)" }}
        >
          <button className="rf-pdp-lightbox-close" onClick={() => setLightboxOpen(false)} aria-label="Cerrar">
            <X size={18} />
          </button>
          {hasMedia ? (
            actual.tipo === "video" ? (
              <video
                src={actual.src}
                controls
                autoPlay
                playsInline
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: "92vw", maxHeight: "88vh" }}
              />
            ) : (
              <img src={actual.src} alt={product.name} onClick={(e) => e.stopPropagation()} />
            )
          ) : (
            <div className="rf-pdp-lightbox-fabric" onClick={(e) => e.stopPropagation()}>
              <Fabric tone={tones[photo]} dark={product.nrs} angle={angles[photo]} style={{ height: "100%" }} />
            </div>
          )}
        </div>
      )}
    </main>
  );
}

/** Acordeón plegable: cabecera con número, título y un ícono que cambia
 *  según esté abierto o cerrado. Solo el contenido se dibuja cuando
 *  está abierto.
 *
 *  Props:
 *  - id: el identificador del acordeón. El padre (la ficha) es el que
 *    guarda cuál está abierto, así que el componente es tonto a
 *    propósito: no tiene estado propio.
 *  - index: el "01", "02"... del título.
 *  - title: el texto de la cabecera.
 *  - open: booleano que dice si este acordeón es el abierto.
 *  - onToggle(id): lo que llama al tocar la cabecera.
 *  - children: el contenido de adentro.
 */
function Accordion({ id, index, title, open, onToggle, children }) {
  return (
    <section className={`rf-pdp-acc ${open ? "is-open" : ""}`}>
      <button className="rf-pdp-acc-head" onClick={() => onToggle(id)} aria-expanded={open}>
        <span className="rf-pdp-acc-index">{index}</span>
        <span className="rf-pdp-acc-title">{title}</span>
        {open ? <Minus size={15} /> : <Plus size={15} />}
      </button>
      {open && <div className="rf-pdp-acc-body">{children}</div>}
    </section>
  );
}

/** Compartir producto: en celu usa el menú nativo; en escritorio copia
 *  el link y avisa con un tilde.
 *
 *  El link se arma con el slug (o, si la prenda no lo tiene, con el id),
 *  que es exactamente lo que routes.js resuelve después contra Firestore.
 *  Si el navegador tiene `navigator.share` (típicamente Android/iOS) le
 *  delegamos el menú nativo y listo; si no, copiamos al portapapeles. */
function ShareButton({ product }) {
  // Solo para el feedback: 1,5 segundos con el tilde y después vuelve
  // al ícono normal.
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = `${window.location.origin}/producto/${product.slug || product.id}`;
    if (navigator.share) {
      // Si el usuario cancela el menú, `share` rechaza: lo tragamos
      // porque no es un error que haya que mostrarle.
      try { await navigator.share({ title: `${product.name} — SKUL`, url }); } catch { /* cancelado */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* sin portapapeles */ }
  }

  return (
    <button onClick={share} className="rf-pdp-share" aria-label="Compartir producto">
      {copied ? <Check size={14} /> : <Share2 size={14} />}
      {copied ? "COPIADO" : "COMPARTIR"}
    </button>
  );
}
