/* ============================================================
   RUTEO
   ------------------------------------------------------------
   La app sigue manejando la "página actual" como estado de React
   (page, cat, selectedProductId, trackingCode) — no se tocó esa
   lógica. Lo que agrega este archivo es la traducción entre ese
   estado y una URL real de verdad, para que:
     - cada página / producto tenga un link que se puede compartir,
       recargar o quedar guardado en favoritos,
     - Google pueda indexar cada producto por separado,
     - el botón atrás del navegador funcione como se espera.

   firebase.json ya tiene el rewrite "**" -> "/index.html", así que
   cualquier URL de estas, al recargar, sirve la misma app (que
   enseguida vuelve a mostrar la página correcta leyendo la URL).
   ============================================================ */

/**
 *  Qué es este archivo: la tabla de rutas del sitio, y solo eso.
 *
 *  Hay tres funciones y forman un trío:
 *    pageToPath  — estado de la app  -> URL (para cuando hacés clic)
 *    parsePath   — URL -> estado de la app (para cuando entra alguien
 *                  por un link, recarga o Favoritos)
 *    pageTitle   — estado de la app  -> título de la pestaña
 *
 *  Por qué el trío tiene que andar junto: son el mismo mapa escrito
 *  al revés. Si a una ruta nueva le falta el caso en pageToPath pero
 *  está en parsePath, el link existe pero no se puede llegar con clic;
 *  al revés, se navega a un link que al recargar tira a home.
 *
 *  Un detalle de SEO que va de la mano: la URL de un producto lleva
 *  su slug (el nombre con guiones, ej. "/producto/hoodie-concrete"),
 *  no su id interno de Firestore. Google indexa esas palabras, y
 *  además si algún día el id cambia el link sigue sirviendo.
 *
 *  Quién lo usa: src/StoreApp.jsx. No necesita nada configurado
 *  afuera.
 */

/** Arma la URL (path) para una página + datos extra.
 *
 *  Recibe el `page` del estado de React y, si hace falta, datos para
 *  completar el link (la categoría, el slug del producto, el código
 *  de seguimiento). Devuelve solo el path, con barra inicial y sin
 *  el dominio: se la agrega el window.history.
 *
 *  Los nombres de las rutas son SEO-friendly a propósito (en
 *  inglés y con guiones) aunque las páginas se llamen "nosotros" o
 *  "outlet". Si alguna vez hay que cambiar una ruta, cambia el case
 *  acá Y el de parsePath, y listo: nadie más se entera. */
export function pageToPath(page, extra = {}) {
  switch (page) {
    case "home":
      return "/";
    // "all" es la categoría de "Todo" y no aporta nada a la URL, así
    // que /catalogo a secas. Cualquier otra, se agrega a la ruta.
    case "catalog":
      return extra.cat && extra.cat !== "all" ? `/catalogo/${extra.cat}` : "/catalogo";
    case "noreastock":
      return "/no-restock";
    case "outlet":
      return "/outlet";
    case "giftcards":
      return "/giftcards";
    // Priorizo el slug sobre el id: es lo que se ve y lo que se
    // indexa. El id es el plan B para los productos viejos que se
    // cargaron antes de que existiera el slug; si no hay ninguno de
    // los dos, caigo a home en vez de generar /producto/.
    case "product":
      return extra.slug ? `/producto/${extra.slug}` : extra.productId ? `/producto/${extra.productId}` : "/";
    case "size-guide":
      return "/guia-de-talles";
    case "nosotros":
      return "/nosotros";
    case "contacto":
      return "/contacto";
    case "cambios":
      return "/cambios-y-devoluciones";
    case "envios":
      return "/politica-de-envios";
    case "informacion-legal":
      return "/informacion-legal";
    case "checkout":
      return "/checkout";
    case "gracias-transferencia":
      return "/gracias-transferencia";
    case "cita-previa":
      return "/cita-previa";
    case "gracias-tarjeta":
      return "/gracias";
    // Esta es la única ruta con query string: el código del pedido va
    // después del "?", y encodeURIComponent lo escapa para que los
    // guiones o letras raras no rompan la URL.
    case "seguimiento":
      return extra.code ? `/seguimiento?pedido=${encodeURIComponent(extra.code)}` : "/seguimiento";
    case "terminos":
      return "/terminos-y-condiciones";
    case "privacidad":
      return "/politica-de-privacidad";
    case "cookies":
      return "/politica-de-cookies";
    case "analitica":
      return "/consentimiento-analiticas";
    case "accesibilidad":
      return "/accesibilidad";
    case "arrepentimiento":
      return "/boton-de-arrepentimiento";
    default:
      return "/";
  }
}

/** Lee la URL actual (pathname + query) y devuelve el estado de
 *  página que le corresponde. Es la inversa de pageToPath.
 *
 *  Recibe window.location.pathname y window.location.search por
 *  separado. Devuelve un objeto de una forma parecida a `page`:
 *  { page, cat? , productParam?, code? }.
 *
 *  `productParam` puede ser el slug o el id de Firestore: no los
 *  distingo acá. Lo resuelve la app, que busca primero por slug y
 *  después por id. */
export function parsePath(pathname, search) {
  // URLSearchParams es el parser de la query string: me da el valor de
  // "pedido=ABC123" con el ? y el = ya resueltos y con el
  // percent-decoding hecho.
  const params = new URLSearchParams(search);
  // Quito la barra inicial y la final, parto por "/" y saco los
  // segmentos vacíos: "/producto/hoodie/" -> ["producto", "hoodie"].
  const parts = pathname.replace(/^\/|\/$/g, "").split("/").filter(Boolean);
  // Solo necesito los dos primeros: ninguna ruta tiene más segmentos.
  const [first, second] = parts;

  // Sin barra y sin segmentos: la home.
  if (!first) return { page: "home" };

  // De acá para abajo, una línea por ruta. El if (no el switch) es
  // porque cada una tiene su propio shape de dato de vuelta: la
  // catalog trae `cat`, la de producto trae `productParam` y el
  // seguimiento trae `code`.
  if (first === "catalogo") return { page: "catalog", cat: second || "all" };
  if (first === "no-restock") return { page: "noreastock" };
  if (first === "outlet") return { page: "outlet" };
  if (first === "giftcards") return { page: "giftcards" };
  // Exijo el segundo segmento: /producto/ solo, sin slug, no es un
  // producto y no debe renderizar la página de detalle.
  if (first === "producto" && second) return { page: "product", productParam: second };
  if (first === "guia-de-talles") return { page: "size-guide" };
  if (first === "nosotros") return { page: "nosotros" };
  if (first === "contacto") return { page: "contacto" };
  if (first === "cambios-y-devoluciones") return { page: "cambios" };
  if (first === "politica-de-envios") return { page: "envios" };
  if (first === "informacion-legal") return { page: "informacion-legal" };
  if (first === "checkout") return { page: "checkout" };
  if (first === "gracias-transferencia") return { page: "gracias-transferencia" };
  if (first === "cita-previa") return { page: "cita-previa" };
  if (first === "gracias") return { page: "gracias-tarjeta" };
  // El código del pedido viene de la query (?pedido=ABC). Si no está,
  // devuelvo null y la página muestra el formulario para escribirlo.
  if (first === "seguimiento") return { page: "seguimiento", code: params.get("pedido") || null };
  if (first === "terminos-y-condiciones") {
  return { page: "terminos" };
}
if (first === "politica-de-privacidad") {
  return { page: "privacidad" };
}
if (first === "politica-de-cookies") {
  return { page: "cookies" };
}
if (first === "consentimiento-analiticas") {
  return { page: "analitica" };
}
if (first === "accesibilidad") {
  return { page: "accesibilidad" };
}
if (first === "boton-de-arrepentimiento") {
  return { page: "arrepentimiento" };
}
  // URL desconocida: mandamos a home en vez de mostrar una pantalla rota.
  return { page: "home" };
}

/** Título de pestaña / <title> para cada página (ayuda al SEO y a
 *  que se entienda qué pestaña es cuando hay varias abiertas).
 *
 *  La app lo aplica con document.title cada vez que cambia la página.
 *  Para Google, el título de cada producto es lo que aparece como
 *  resultado de búsqueda, así que el nombre de la prenda va primero
 *  y "SKUL" al final. */
export function pageTitle(page, extra = {}) {
  const base = "SKUL — Streetwear";
  switch (page) {
    case "home":
      return base;
    // En el catálogo muestro la categoría real ("Hoodies — SKUL"), no
    // el id interno. Si es "Todo", cae al título genérico.
    case "catalog":
      return extra.catLabel && extra.catLabel !== "Todo" ? `${extra.catLabel} — SKUL` : `Catálogo — SKUL`;
    case "noreastock":
      return "No-Restock — SKUL";
    case "outlet":
      return "Outlet — SKUL";
    case "giftcards":
      return "Gift Cards — SKUL";
    // Si todavía no cargó el producto, uso el título base en vez de
    // dejar la pestaña en blanco.
    case "product":
      return extra.productName ? `${extra.productName} — SKUL` : base;
    case "size-guide":
      return "Guía de talles — SKUL";
    case "nosotros":
      return "Nosotros — SKUL";
    case "contacto":
      return "Contacto — SKUL";
    case "cambios":
      return "Cambios y devoluciones — SKUL";
    case "envios":
      return "Política de envíos — SKUL";
    case "informacion-legal":
      return "Contacto y reclamos — SKUL";
    case "checkout":
      return "Checkout — SKUL";
    case "seguimiento":
      return "Seguimiento de pedido — SKUL";
    case "terminos":
      return "Términos y condiciones — SKUL";
    case "privacidad":
      return "Política de privacidad — SKUL";
    case "cookies":
      return "Política de cookies — SKUL";
    case "analitica":
      return "Consentimiento de analítica — SKUL";
    case "accesibilidad":
      return "Accesibilidad — SKUL";
    case "arrepentimiento":
      return "Botón de arrepentimiento — SKUL";
    // Las dos pantallas de "gracias" (transferencia y tarjeta) son
    // la confirmación de un pedido: van con el mismo título porque
    // para el cliente es la misma cosa.
    case "gracias-transferencia":
    case "gracias-tarjeta":
      return "Pedido registrado — SKUL";
    case "cita-previa":
      return "Coordinar cita — SKUL";
    default:
      return base;
  }
}
