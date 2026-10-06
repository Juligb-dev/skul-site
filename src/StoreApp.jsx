/**
 * ============================================================
 *  STOREAPP — el corazón de la tienda
 * ------------------------------------------------------------
 *  Qué es: la ENVOLVENTIA del sitio público. Acá vive todo el
 *  estado que las pantallas tienen en común —el carrito, la página
 *  actual, la categoría, el cupón, la gift card, los datos del
 *  comprador— y acá se decide qué pantalla se dibuja. Ninguna
 *  página guarda su propia copia del carrito ni vuelve a leer la
 *  URL: todas reciben por props lo que necesitan y nada más.
 *
 *  POR QUÉ NO HAY react-router: el ruteo de este proyecto es un
 *  `useState` con un string adentro ("home", "catalog", "product",
 *  "checkout", "gracias-transferencia"...). La URL real se traduce
 *  con utils/routes.js: cuando el visitante navega con los botones
 *  del sitio yo reescribo la barra de direcciones con
 *  `history.pushState` (cambia la URL SIN recargar la página y SIN
 *  guardar una entrada nueva en el historial cada vez que se pinta);
 *  cuando alguien entra por un link o recarga, leo la URL con
 *  `parsePath` y la traduzco al mismo estado. El botón de atrás del
 *  navegador dispara el evento "popstate", que es lo único que hace
 *  falta para que atrás/adelante funcionen como se espera. Además
 *  firebase.json tiene el rewrite de todo a index.html, así que
 *  cualquier /catalogo o /producto/hoodie-concrete recarga bien y
 *  vuelve a caer en esta misma app.
 *
 *  Qué monta: el switch de páginas del return() (inicio, catálogo,
 *  ficha de producto, checkout, las pantallas de gracias, el
 *  seguimiento, las legales...) más la carcasa que está siempre
 *  visible: cortinilla de intro, header, footer y carrito lateral.
 *
 *  LA REGLA DE ORO DEL ARCHIVO: los números que se calculan acá
 *  (subtotal, descuentos, costo de envío, total) son una
 *  PREVISUALIZACIÓN, para que el comprador vea de antemano cuánto
 *  va a pagar. El precio que de verdad se cobra lo recalcula el
 *  Cloudflare Worker —el backend real— leyendo el catálogo real, el
 *  cupón real y la cotización real de Correo Argentino. El
 *  navegador nunca descuenta stock, ni canjea un cupón, ni toca el
 *  saldo de una gift card: eso pasa adentro del mismo commit atómico
 *  que crea el pedido, en el servidor.
 * ============================================================
 */

// Componentes de la carcasa: los que están siempre en pantalla.
import React, { useEffect, useMemo, useState } from "react";
import IntroCurtain from "./components/IntroCurtain.jsx";
import Header from "./components/Header.jsx";
import Footer from "./components/Footer.jsx";
import CartDrawer from "./components/CartDrawer.jsx";
// Las páginas: una por línea del switch de abajo. Cada una es una
// pantalla normal de React que recibe todo por props.
import Home from "./pages/Home.jsx";
import Catalog from "./pages/Catalog.jsx";
import NoReastock from "./pages/NoReastock.jsx";
import Outlet from "./pages/Outlet.jsx";
import GiftCards from "./pages/GiftCards.jsx";
import ProductPage from "./pages/ProductPage.jsx";
import SizeGuide from "./pages/SizeGuide.jsx";
import Nosotros from "./pages/Nosotros.jsx";
import Contacto from "./pages/Contacto.jsx";
import CambiosYDevoluciones from "./pages/CambiosYDevoluciones.jsx";
import Checkout from "./pages/Checkout.jsx";
import { GraciasTransferencia, CitaPrevia, GraciasTarjeta } from "./pages/Thanks.jsx";
import SeguimientoPedido from "./pages/SeguimientoPedido.jsx";
// Todas las páginas de textos legales viven en un solo archivo (Legal.jsx)
// y acá se importan una por una para poder montarlas por separado.
import {
  TerminosYCondiciones,
  PoliticaPrivacidad,
  PoliticaCookies,
  ConsentimientoAnaliticas,
  Accesibilidad,
  Arrepentimiento,
  Envios,
  InformacionLegal,
} from "./pages/Legal.jsx";
import { ZONES, CONTACT_EMAIL, CATS, GIFT_CARD_ITEM_ID } from "./data/config.js";
// Los hooks que hacen el trabajo pesado contra Firestore o contra el
// Worker: leer el catálogo, leer el estado de la tienda, comprobar cupón
// y gift card, y crear el pedido.
import { useProducts } from "./hooks/useProducts.js";
import { useSiteStatus } from "./hooks/useSiteStatus.js";
import { checkCoupon } from "./hooks/useCoupons.js";
import { checkGiftCard, giftCardCarritoItem } from "./hooks/useGiftCards.js";
// El redondeo del monto de una gift card (lo usa la página de gift cards
// y el carrito, para que el número quede en pesos enteros dentro del rango).
import { redondearMontoGiftCard } from "./utils/giftcards.js";
import { calcularResumenPrecios } from "./utils/precios.js";
import { createOrder } from "./hooks/useOrders.js";
// La tabla de rutas: el mapa entre el estado de página y la URL real
// (pageToPath, parsePath y pageTitle).
import { pageToPath, parsePath, pageTitle } from "./utils/routes.js";
// Única lectura directa a Firestore que hace este archivo (y es de solo
// lectura): el pedido público del seguimiento, para poder mostrar el
// total al recargar una pantalla de "gracias".
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase.js";

export default function StoreApp() {
  // Los dos datos que vienen de Firestore y que TODAS las pantallas
  // necesitan: el catálogo de prendas y el estado de la tienda
  // (abierta/cerrada, cinta de anuncios, si el Outlet está prendido).
  // Los dos llegan en vivo: si el admin carga una prenda o apaga el
  // Outlet desde el panel, esta pantalla se entera sola, sin recargar.
  const { products: allProducts, productsError } = useProducts();
  const { status } = useSiteStatus();

  // ---- RUTEO ----
  // `page` es la página actual y el corazón del ruteo manual: cada if
  // del return() de abajo mira este string. Ninguna página lee la URL
  // por su cuenta.
  const [page, setPage] = useState("home");
  // `cat` es el filtro del catálogo: "all" es la pestaña "Todo", o el id
  // de una categoría ("hoodies", "denim"...). Viaja en la URL como
  // /catalogo/hoodies.
  const [cat, setCat] = useState("all");

  // ---- CARRITO ----
  const [cart, setCart] = useState(() => {
    // Recupera el carrito si el comprador recarga la página sin querer.
    // Si algo sale mal (localStorage bloqueado, JSON roto), arranca
    // vacío como siempre — no rompe nada.
    try {
      const saved = localStorage.getItem("cart");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }); // {key, id, name, price, tag, size, qty, color, image}
  // La `key` de cada línea es producto + talle + color: eso hace que
  // un mismo talle en dos colores sea DOS líneas y no una sola con
  // cantidad 2. Los pasos siguientes (agregar, cambiar cantidad,
  // borrar) buscan por esa key, no por el id del producto.
  const [cartOpen, setCartOpen] = useState(false);
  // `cartOpen` abre y cierra el carrito lateral (el cajón que entra
  // desde la derecha); `menuOpen`, el menú desplegable del celu. Los
  // dos son estado de "interfaz", no de negocio.
  const [menuOpen, setMenuOpen] = useState(false);

  // ---- ENVÍO ----
  // `zone` es la ZONA DE ENVÍO elegida: desde dónde sale el pedido. Hoy
  // en data/config.js la única zona con precio fijo es el retiro en Los
  // Toldos (price: 0); el resto de las zonas se cotizan en vivo con la
  // API de Correo Argentino. Por eso el costo de envío nunca se inventa
  // en el cliente: sale de la tabla de ZONES o de la cotización real.
  const [zone, setZone] = useState(ZONES[0].id);
  // Cuando zone !== "local", correoQuote guarda lo que el cliente eligió
  // en la calculadora de envío: { type: "domicilio"|"sucursal", price,
  // postalCode, provinceCode, agencyCode, agencyName }
  const [correoQuote, setCorreoQuote] = useState(null);

  // ---- DATOS DEL COMPRADOR Y PAGO ----
  // El medio de pago decide a qué pantalla de "gracias" cae el pedido
  // (transferencia, efectivo o tarjeta) y si se activa el 10% de
  // descuento. Los tres textos son lo que se le pide al comprador; la
  // dirección solo se usa si el envío es a domicilio.
  const [payMethod, setPayMethod] = useState(null);
  const [orderName, setOrderName] = useState("");
  const [orderPhone, setOrderPhone] = useState("");
  const [orderAddress, setOrderAddress] = useState("");

  // ---- CUPÓN ----
  // Cuatro cosas que van juntas: lo que escribió el comprador, el cupón
  // que quedó aplicado, el mensaje de error y el flag de "está
  // comprobando", que es el que bloquea el botón mientras consulta.
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null); // { code, type, value } — solo preview, todavía no consumido
  const [couponError, setCouponError] = useState("");
  const [couponChecking, setCouponChecking] = useState(false);

  // ---- GIFT CARD ----
  // Misma estructura que el cupón, pero para el código de saldo. El
  // `giftCardChecking` es el que hace que el botón no se pueda apretar
  // dos veces mientras va la consulta.
  const [giftCardCode, setGiftCardCode] = useState("");
  const [appliedGiftCard, setAppliedGiftCard] = useState(null); // { code, saldo } — solo preview; el saldo lo descuenta el Worker
  const [giftCardError, setGiftCardError] = useState("");
  const [giftCardChecking, setGiftCardChecking] = useState(false);
  const [giftCardIssued, setGiftCardIssued] = useState(null); // gift card COMPRADA en este pedido (para mostrarla al comprador)

  // ---- ESTADO DEL PEDIDO EN CURSO ----
  // `confirming` = hay un pedido guardándose (deshabilita el botón y
  // muestra el spinner); `orderError` = el mensaje que se le muestra al
  // comprador si el Worker rechazó el pedido (por ejemplo, "se agotó
  // el stock mientras comprabas").
  const [confirming, setConfirming] = useState(false);
  const [orderError, setOrderError] = useState("");

  // Formulario de la pantalla de contacto. No va a ningún backend: al
  // enviarlo se arma un link de WhatsApp (ver handleContactSubmit).
  const [contactForm, setContactForm] = useState({ nombre: "", motivo: "" });

  // ---- FICHA DE PRODUCTO ----
  // Guardo el ID del producto (el identificador interno de Firestore,
  // corto y fijo) y no el objeto entero, así el carrito, el checkout y
  // las pantallas ven siempre el precio y el stock actualizados.
  // `pendingProductParam` es lo que trae la URL sin resolver todavía: el
  // SLUG (la parte legible del link, ej. "hoodie-concrete", que sale del
  // nombre con guiones) o, en links viejos, el id. Como la URL solo trae
  // texto, hay que cruzarlo contra el catálogo para saber qué prenda es.
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [pendingProductParam, setPendingProductParam] = useState(null); // slug o id desde la URL, todavía sin resolver

  // ---- PÓST-PEDIDO ----
  // Los tres datos que necesitan las pantallas de "gracias" y la de
  // seguimiento: el ID que generó el Worker (es el código que el
  // comprador escribe para consultar su pedido), el TOTAL REAL que
  // calculó el servidor (es el número que hay que transferir) y el
  // código de seguimiento que venga en la URL de /seguimiento.
  const [orderId, setOrderId] = useState(null);
  const [orderTotal, setOrderTotal] = useState(0);
  const [trackingCode, setTrackingCode] = useState(null);

  /**
   * Arranque de la app: Traduce la URL real al estado de página y
   * escucha el botón de atrás/adelante del navegador.
   *
   * Qué dispara: se corre UNA sola vez al montar (la lista de
   * dependencias está vacía), así que es el lugar de "al entrar a la
   * tienda". Hace tres cosas:
   *
   *  1. Lee la URL con parsePath (la inversa de pageToPath) y la
   *     descarga en el estado: qué página es, qué categoría, qué
   *     producto, qué código de seguimiento. Es lo que hace que
   *     /producto/hoodie-concrete se pueda compartir, recargar o
   *     dejar en Favoritos.
   *
   *  2. Si la URL trae ?pedido=ID, busca ese pedido en la colección
   *     PÚBLICA "orderTracking" (la copia sin datos personales que ve
   *     el comprador) para recuperar el total. Sin esto, al recargar
   *     una pantalla de gracias se perdían el nombre y el monto.
   *
   *  3. Se suscribe al evento "popstate" (el que dispara el botón
   *     atrás/adelante) y vuelve a traducir la URL a estado. Acá se
   *     usa el estado guardado en history en lugar de la URL, porque
   *     el que yo escribo con pushState ya trae el dato listo y
   *     parsePath lo habría vuelto a adivinar.
   *
   * La limpieza (el return): saca el listener de "popstate". Si
   * faltara, cada montaje dejaría un listener vivo y el botón atrás
   * dispararía la navegación varias veces.
   */
  // Al entrar (o recargar la página), leemos la URL real para saber qué mostrar.
  useEffect(() => {
    const initial = parsePath(window.location.pathname, window.location.search);
    setPage(initial.page);
    if (initial.cat) setCat(initial.cat);
    if (initial.productParam) setPendingProductParam(initial.productParam);
    if (initial.page === "seguimiento") setTrackingCode(initial.code || null);
    
    // G9 Fix: Cargar el pedido de Firestore si existe el parámetro ?pedido=ID en la URL al recargar
    // Leo la colección "orderTracking": es la copia PÚBLICA del pedido
    // (tiene los productos, el estado y el total, pero cero datos
    // personales). Por eso puedo leerla sin que el comprador esté
    // logueado. El pedido privado con nombre y teléfono es otro
    // documento, en /orders, y ese no lo puede leer cualquiera.
    const params = new URLSearchParams(window.location.search);
    const orderIdParam = params.get("pedido");
    if (orderIdParam) {
  setOrderId(orderIdParam);

  getDoc(doc(db, "orderTracking", orderIdParam))
    .then((snap) => {
      if (snap.exists()) {
        const data = snap.data();

        if (data.total != null) {
          setOrderTotal(data.total);
        }
      }
    })
    .catch((err) =>
      console.error(
        "Error recuperando seguimiento del pedido:",
        err
      )
    );
}

    // replaceState (y no pushState) porque acá NO quiero una entrada
    // nueva en el historial: solo guardo el estado ya parseado en la
    // entrada actual. Si usara pushState, el primer clic en "atrás"
    // sacaría al visitante de la tienda sin llegar a ninguna página.
    // De paso dejo la URL exactamente como estaba, con su query.
    window.history.replaceState(initial, "", window.location.pathname + window.location.search);

    // El botón atrás/adelante no recarga nada: dispara este evento con
    // el estado que yo había guardado en la entrada del historial. Por
    // eso el ruteo se puede hacer sin recargar la página entera.
    const onPopState = (e) => {
      const st = e.state || parsePath(window.location.pathname, window.location.search);
      setPage(st.page || "home");
      if (st.cat) setCat(st.cat);
      if (st.page === "product" && st.productParam) setPendingProductParam(st.productParam);
      if (st.page === "seguimiento") setTrackingCode(st.code || null);
      // Volver atrás siempre arranca arriba y con el menú cerrado: si
      // no, el comprador cae en otra página a media pantalla.
      setMenuOpen(false);
      window.scrollTo?.(0, 0);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  /**
   * Resuelve el producto de la URL contra Firestore.
   *
   * Por qué hace falta: la URL puede traer un slug ("hoodie-concrete",
   * la parte legible que Google indexa) o, en los links viejos, el id
   * de Firestore. Los dos son solo texto: hay que cruzarlos contra el
   * catálogo para saber de qué prenda se trata, porque el catálogo
   * puede llegar después (o nunca, si Firestore falla).
   *
   * Por qué busca primero por slug: es el que se ve y el que puede
   * cambiar de id sin romper los links ya compartidos. El id queda
   * como plan B.
   *
   * Si no encuentra nada —producto dado de baja, borrado, o slug
   * inventado— manda al catálogo en lugar de mostrar una pantalla en
   * blanco, y limpia el pendiente para no volver a intentarlo.
   */
  useEffect(() => {
    if (!pendingProductParam || !allProducts) return;
    // useProducts devuelve también los productos desactivados (para que el
    // admin pueda reencenderlos), así que acá hay que filtrar: una
    // desactivada no se abre por URL.
    const visibles = allProducts.filter((p) => p.active !== false);
    const match =
      visibles.find((p) => p.slug === pendingProductParam) ||
      visibles.find((p) => p.id === pendingProductParam);
    if (match) {
      setSelectedProductId(match.id);
    } else {
      setPage("catalog");
      window.history.replaceState({ page: "catalog" }, "", pageToPath("catalog"));
    }
    setPendingProductParam(null);
  }, [pendingProductParam, allProducts]);

  // Atajo de lectura: `products` es el array siempre (aunque esté vacío)
  // y `findProduct` el buscador por id que usan la ficha, el carrito y
  // el checkout. Es un alias, no una copia: no agrega trabajo.
  const products = allProducts || [];
  const findProduct = (id) => products.find((p) => p.id === id);

  /**
   * Agrega una prenda al carrito. La usan la grilla del catálogo y la
   * ficha de producto (por eso el color es opcional).
   *
   * Qué decide acá:
   *  - La `key` identifica la línea: mismo producto + talle + color es
   *    la MISMA línea, y en vez de duplicarla sube la cantidad.
   *  - El límite por talle: si el producto tiene stock cargado (un
   *    objeto { S: 2, M: 0... }), no deja pasar de ese número; si no
   *    tiene stock cargado, `maxQty` es Infinity y no limita nada.
   *  - El precio que queda congelado en la línea es el de outlet si la
   *    prenda está en outlet, si no el de lista.
   *  - `weight` (400g por defecto) no es para el envío real: se usa para
   *    estimar el costo antes de cotizar con Correo Argentino.
   *
   * OJO: todo esto es una estimación del navegador. El stock que REALMENTE
   * importa lo descuenta el Worker al confirmar el pedido, y si alguien
   * se llevó el último talle mientras tanto el pedido se rechaza con un
   * mensaje claro. Acá solo evitamos que el comprador llene el carrito de
   * cosas que ya no hay.
   */
  const addToCart = (p, size, color) => {
    // color llega como { name, hex } (lo que se eligió en la ficha), o
    // undefined si se agrega desde la grilla, que no tiene selector.
    // Va adentro de la key para que un mismo talle en dos colores no
    // se mezcle en una sola línea del carrito.
    const key = `${p.id}__${size}__${color?.name || "-"}`;
    const stock = p.stock || {};
    const tracksStock = Object.keys(stock).length > 0;
    const maxQty = tracksStock ? stock[size] || 0 : Infinity;
    if (tracksStock && maxQty <= 0) return;
    setCart((c) => {
      const found = c.find((i) => i.key === key);
      if (found) return c.map((i) => (i.key === key ? { ...i, qty: Math.min(i.qty + 1, maxQty) } : i));
      return [
        ...c,
        {
          key,
          id: p.id,
          size,
          color: color?.name || null,
          qty: 1,
          maxQty,
          name: p.name,
          image: p.photos?.[0] || null, // antes decía p.image, que no existe en ningún producto
          price: p.outlet && Number(p.outletPrice) > 0 ? Number(p.outletPrice) : p.price,
          weight: p.weight || 400,
          tag: p.tag,
        },
      ];
    });
    setCartOpen(true);
  };

  /**
   * Suma o resta una unidad de una línea del carrito.
   *
   * `delta` es +1 o -1 según el botón. La cantidad nunca baja de 0 ni
   * sube de `maxQty`, y las líneas que llegan a 0 se BORRAN del array
   * (por eso el filter va encadenado): así el carrito no muestra líneas
   * vacías y el subtotal no los tiene que ignorar.
   */
  const changeQty = (key, delta) => {
    setCart((c) => c.map((i) => (i.key === key ? { ...i, qty: Math.max(0, Math.min(i.qty + delta, i.maxQty ?? Infinity)) } : i)).filter((i) => i.qty > 0));
  };
  /** Saca una línea del carrito entera (el botón de tacho). */
  const removeItem = (key) => setCart((c) => c.filter((i) => i.key !== key));

  /**
   * Persiste el carrito en localStorage (el almacenamiento local del
   * navegador, que sobrevive cerrar la pestaña).
   *
   * Qué dispara: se corre cada vez que cambia el carrito, así que
   * guarda automáticamente. Si el carrito queda vacío, BORRA la clave en
   * vez de guardar "[]", para no dejar basura.
   *
   * Sin cleanup: no hay nada que deshacer, cada pasada pisa la anterior.
   * El try/catch es por el modo privado de Safari o el almacenamiento
   * lleno: si falla, el comprador pierde el carrito al recargar pero
   * puede comprar igual.
   */
  // Guarda el carrito en localStorage cada vez que cambia.
  useEffect(() => {
    try {
      if (cart.length > 0) localStorage.setItem("cart", JSON.stringify(cart));
      else localStorage.removeItem("cart");
    } catch {
      // Si el navegador bloquea localStorage (modo privado, etc.), el
      // carrito no persiste entre recargas, pero la compra igual funciona.
    }
  }, [cart]);
  /**
   * LOS NÚMEROS DEL RESUMEN DEL CHECKOUT.
   *
   * Decilo de una vez: TODO lo que sigue es una PREVISUALIZACIÓN para
   * que el comprador vea los números antes de pagar. El total que de
   * verdad se cobra lo recalcula el Cloudflare Worker leyendo el
   * catálogo real, el cupón real y la cotización real de Correo
   * Argentino; si al confirmar difiere (por ejemplo se agotó un
   * descuento), el checkout muestra el del servidor. Ver confirmOrder.
   *
   * Los tres van en useMemo porque son cuentas que se repiten en varias
   * pantallas (el carrito lateral y el checkout): sin memo, se
   * recalcularían en cada render.
   */

  // Subtotal: precio de lista (o de outlet) por cantidad. NO tiene
  // ningún descuento aplicado todavía.
  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.price * i.qty, 0), [cart]);
  // Peso total del carrito, en gramos. Lo usa el checkout para estimar
  // el envío antes de tener la cotización de Correo Argentino.
  const cartWeight = useMemo(() => cart.reduce((s, i) => s + (i.weight || 400) * i.qty, 0), [cart]);
  // Costo de envío. Hay dos fuentes y no se pueden mezclar: si la zona
  // es Correo Argentino, el precio es el que devolvió la calculadora
  // (correoQuote.price, a domicilio o a sucursal); si es una zona fija,
  // sale de la tabla ZONES de data/config.js. Nunca se arma un número
  // acá a ojo: si todavía no se cotizó, es 0.
  const shippingCost = useMemo(
    () => (zone === "correo" ? correoQuote?.price ?? 0 : ZONES.find((z) => z.id === zone)?.price ?? 0),
    [zone, correoQuote]
  );

  /* ---- DESCUENTOS, EN ORDEN ----
     El orden importa y es el mismo que usa el Worker:
       1) 10% por efectivo,
       2) cupón,
       3) gift card (que se aplica sobre lo que SOBRA, no sobre el
          subtotal entero),
       4) y recién ahí se suma el envío, que nunca entra en la base
          de los descuentos (una gift card no paga el flete).
     Si mañana se cambia el orden de una línea, hay que cambiarlo
     también en cloudflare-worker/worker.js, o la pantalla va a
     mostrar un número distinto del que cobra el servidor. */

  // El 10% es el único descuento fijo de la tienda y existe por una
  // razón de negocio: es el descuento por PAGA EN EFECTIVO en el local
  // (que implica que el comprador tiene que coordinar una cita), no un
  // "10% off" de que elija el medio de pago que quiera. Por eso se
  // calcula acá con un condicional simple y no con una tabla.
  const paysCash = payMethod === "efectivo";

  // Base sobre la que se aplica el cupón. Un cupón puede ser de tres
  // alcances ("scope"):
  //   - "all": todo el pedido.
  //   - "category": solo una categoría (ej. 20% en hoodies).
  //   - "products": solo una lista puntual de prendas.
  // O sea, `eligibleSubtotal` NO es el subtotal: es la parte del
  // subtotal que el cupón tiene derecho a tocar.
  // OJO con el alcance "category": filtra por `i.cat`, o sea por la
  // categoría que la línea del carrito trae consigo. Si una línea no la
  // tiene, queda fuera de la base y el preview muestra 0 — el Worker, en
  // cambio, mira la categoría del producto real en el catálogo.
  const eligibleSubtotal = useMemo(() => {
    if (!appliedCoupon) return 0;
    if (appliedCoupon.scope === "category") {
      return cart.filter((i) => i.cat === appliedCoupon.scopeCategory).reduce((s, i) => s + i.price * i.qty, 0);
    }
    if (appliedCoupon.scope === "products") {
      const ids = appliedCoupon.scopeProductIds || [];
      return cart.filter((i) => ids.includes(i.id)).reduce((s, i) => s + i.price * i.qty, 0);
    }
    return subtotal;
  }, [cart, appliedCoupon, subtotal]);

  // El resumen completo sale de UNA función pura (src/utils/precios.js),
  // la misma cuenta que hace el Worker al confirmar el pedido. El orden
  // de los descuentos vive ahí, con su test (precios.test.js) pinando
  // cada número; si se cambia, tiene que cambiar en el Worker también.
  const { discount, couponDiscount, giftCardDiscount, total } = useMemo(
    () =>
      calcularResumenPrecios({
        subtotal,
        paysCash,
        appliedCoupon,
        eligibleSubtotal,
        appliedGiftCard,
        shippingCost,
      }),
    [subtotal, paysCash, appliedCoupon, eligibleSubtotal, appliedGiftCard, shippingCost]
  );

  // Si el cupón es por categoría o por productos y en este carrito no
  // hay nada de eso, el checkout lo muestra como "no aplicable" en vez
  // de fingir que se está descontando algo.
  const couponApplies = !appliedCoupon || appliedCoupon.scope === "all" || eligibleSubtotal > 0;
  // Cantidad total de prendas (no de líneas): es el número que va en la
  // burbujita del carrito del header.
  const itemCount = cart.reduce((s, i) => s + i.qty, 0);

  /**
   * Aplica un cupón: comprueba el código y, si sirve, lo deja puesto.
   *
   * Qué hace: llama a `checkCoupon`, que lee ESE documento de
   * /coupons en Firestore (el ID del documento es el propio código, así
   * que es una lectura puntual) y mira que esté activo y que no haya
   * llegado al límite de usos. NO canjea el cupón ni gasta un uso: eso
   * lo hace el Worker al crear el pedido.
   *
   * Por qué el `finally`: siempre hay que liberar el flag de "comprobando",
   * incluso en el camino de error. Sin eso el botón queda clavado.
   */
  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponChecking(true);
    setCouponError("");
    try {
      const res = await checkCoupon(couponCode);
      if (res.ok) setAppliedCoupon(res.coupon);
      else {
        setAppliedCoupon(null);
        setCouponError(res.reason);
      }
    } catch (err) {
      // Si la consulta falla (red caída, permiso denegado, etc.) hay que
      // avisar y liberar el botón: sin este catch el carrito quedaba
      // clavado en "Comprobando…" para siempre.
      console.error("No se pudo comprobar el cupón:", err);
      setAppliedCoupon(null);
      setCouponError("No pudimos comprobar ese cupón. Probá de nuevo en un momento.");
    } finally {
      setCouponChecking(false);
    }
  };
  /** Saca el cupón: limpia el aplicado, el texto del campo y el error. */
  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponError("");
  };

  /**
   * Aplica una gift card (un código de saldo, ej. "SKUL-A7K2P9").
   *
   * Qué mira `checkGiftCard`: que el código exista, que la gift card
   * esté activa, que no haya vencido (6 meses desde que se emitió) y que
   * le quede saldo. OJO: es una lectura pura, el saldo NO se descuenta
   * acá. Lo descuenta el Worker, en el mismo commit que crea el pedido,
   * así dos personas no pueden gastar la misma gift card al mismo tiempo.
   *
   * Si viene bien, además de guardarla la paso a mayúsculas y sin
   * espacios: el código es el ID del documento en Firestore, así que
   * "skul abc123" y "SKUL-ABC123" tienen que terminar siendo el mismo
   * string.
   */
  const applyGiftCard = async () => {
    if (!giftCardCode.trim()) return;
    setGiftCardChecking(true);
    setGiftCardError("");
    try {
      const res = await checkGiftCard(giftCardCode);
      if (res.ok) {
        setAppliedGiftCard(res.giftCard);
        setGiftCardCode(res.giftCard.code);
      } else {
        setAppliedGiftCard(null);
        setGiftCardError(res.reason);
      }
    } catch (err) {
      console.error("No se pudo comprobar la gift card:", err);
      setAppliedGiftCard(null);
      setGiftCardError("No pudimos comprobar esa gift card. Probá de nuevo en un momento.");
    } finally {
      setGiftCardChecking(false);
    }
  };
  /** Saca la gift card aplicada y deja el campo vacío para escribir otra. */
  const removeGiftCard = () => {
    setAppliedGiftCard(null);
    setGiftCardCode("");
    setGiftCardError("");
  };

  // Gift card comprada: entra al carrito como ítem especial. Si ya había
  // una, se reemplaza (solo se puede comprar una por pedido).
  /**
   * Compra de una gift card: mete al carrito un ítem que NO es una prenda.
   *
   * Es un "producto falso" con id reservado ("giftcard") para que el
   * carrito y el checkout lo traten como cualquier otra línea sin meter
   * casos especiales en todas las pantallas. El monto se redondea y se
   * recorta al rango válido (1.000 a 100.000) antes de guardarse; el
   * Worker lo vuelve a validar al cobrar.
   *
   * El CÓDIGO no se genera acá y el saldo no se guarda acá: los dos los
   * produce el servidor al confirmar el pedido, y recién ahí se le
   * muestra al comprador (es el `giftCardIssued` de más abajo).
   */
  const addGiftCardToCart = (monto) => {
    const precio = redondearMontoGiftCard(monto);
    if (!precio) return;
    setCart((c) => [...c.filter((i) => i.id !== GIFT_CARD_ITEM_ID), giftCardCarritoItem(precio)]);
    setCartOpen(true);
  }
  // ¿Ya hay una gift card comprada en el carrito? Lo usa la página
  // /giftcards para avisar que solo se puede comprar una por pedido.
  const giftCardEnCarrito = cart.some((i) => i.id === GIFT_CARD_ITEM_ID);

  /**
   * NAVEGACIÓN.
   *
   * Las tres funciones de acá son TODO el ruteo del sitio, y las tres
   * hacen lo mismo en el mismo orden: cambian el estado de página, cierran
   * el menú, suben la pantalla arriba y reescriben la URL con
   * `pushState`.
   *
   * Sobre pushState: es la parte del historial del navegador que cambia
   * la URL sin pedirle una página nueva al servidor y sin recargar. Como
   * además guarda un objeto de estado, el botón de atrás puede volver
   * con todos los datos (que es lo que hace el listener de "popstate"
   * del primer useEffect).
   */

  /** Va al catálogo, opcionalmente a una categoría ("Todo" si no pasa). */
  const goCatalog = (filter) => {
    const nextCat = filter || "all";
    setCat(nextCat);
    setPage("catalog");
    setMenuOpen(false);
    window.scrollTo?.(0, 0);
    window.history.pushState({ page: "catalog", cat: nextCat }, "", pageToPath("catalog", { cat: nextCat }));
  }
  /**
   * Navegación genérica a cualquier página: es la que usan el header, el
   * footer y el checkout. El segundo argumento solo se usa en
   * /seguimiento, que es la única ruta con query string (lleva el código
   * del pedido: /seguimiento?pedido=ABC123).
   */
  const nav = (p, code) => {
    setPage(p);
    if (p === "seguimiento") setTrackingCode(code || null);
    setMenuOpen(false);
    window.scrollTo?.(0, 0);
    window.history.pushState({ page: p, code: code || null }, "", pageToPath(p, { code }));
  }
  /**
   * Abre la ficha de un producto.
   *
   * Busca el slug del producto para escribir /producto/hoodie-concrete en
   * vez del id de Firestore: la URL queda legible y Google la indexa.
   * Si el producto no tuviera slug, cae al id, que también funciona.
   */
  const openProduct = (id) => {
    setSelectedProductId(id);
    setPage("product");
    setMenuOpen(false);
    window.scrollTo?.(0, 0);
    const slug = findProduct(id)?.slug;
    window.history.pushState({ page: "product", productParam: slug || id }, "", pageToPath("product", { slug, productId: id }));
  }

  // ---- LAS TRES LISTAS DE PRODUCTOS QUE NECESITA EL SWITCH ----

  // La que ve el catálogo (y el home): sin los "no restock" (que tienen su
  // propia página) y sin los desactivados. Con categoría, además, solo
  // los de esa categoría.
  const filteredProducts = (cat === "all" ? products.filter((p) => !p.nrs && p.active !== false) : products.filter((p) => p.cat === cat && !p.nrs && p.active !== false));
  // Ordenar productos: priorizar más recientes si tienen createdAt, sino mantener orden actual
  // Solo se ordena en la vista "Todo" (para no mezclar una lista ya
  // filtrada por categoría con otra cosa). `createdAt` puede venir como
  // Timestamp de Firestore (con toMillis) o como texto, y por eso hay
  // las dos ramas.
  if (cat === "all" && Array.isArray(filteredProducts)) {
    filteredProducts.sort((a,b) => {
      const ca = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const cb = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      if (cb !== ca) return cb - ca;
      return 0;
    });
  }
  // "No restock": prendas que ya no se reponen, en página aparte.
  const noReastockProducts = products.filter((p) => p.nrs && p.active !== false);
  // Outlet: prendas rebajadas. El header solo muestra el link si además
  // el admin lo prendió en el panel (status.outletEnabled).
  const outletProducts = products.filter((p) => p.outlet && p.active !== false);

  // G12 / Medios Fix: Redirección directa a WhatsApp en lugar de mailto
  /**
   * Envío del formulario de contacto.
   *
   * No hay backend ni correo: arma un link de WhatsApp con el nombre y
   * el motivo ya escritos y lo abre en otra pestaña. wa.me es el
   * atajo oficial de WhatsApp para web; el número va en formato
   * internacional sin "+" ni espacios, y el texto va con
   * encodeURIComponent para que acentos y espacios no rompan la URL.
   */
  const handleContactSubmit = (e) => {
    e.preventDefault();
    const phone = "5492358412562";
    const body = `Hola SKUL! Mi nombre es ${contactForm.nombre}. Motivo de consulta: ${contactForm.motivo}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(body)}`, "_blank");
  };

  /**
   * CONFIRMAR EL PEDIDO — el único momento en que se crea una compra.
   *
   * Qué hace, en orden:
   *  1. Arma el pedido y lo manda al Cloudflare Worker (createOrder).
   *  2. El Worker lee el catálogo real, vuelve a calcular los precios,
   *     descuenta el stock, canjea el cupón, consume el saldo de la gift
   *     card, crea el documento del pedido y su copia pública de
   *     seguimiento, y avisa por Telegram — todo en un solo commit
   *     atómico (una sola operación: si algo falla, no se escribe nada).
   *  3. Si salió bien: vacía el carrito, manda al comprador a la
   *     pantalla de "gracias" que corresponde a su medio de pago y deja
   *     el ?pedido=ID en la URL.
   *
   * LO MÁS IMPORTANTE DE ESTE ARCHIVO, acá adentro: al Worker le
   * mandamos QUÉ quiere comprar el cliente (ids, talles, cantidades,
   * códigos), NUNCA cuánto vale. El precio, el descuento y el envío los
   * pone el servidor. Si no fuera así, cualquiera podría abrir la
   * consola del navegador, mandar un pedido de $1 y listo.
   *
   * Detalle fino: NO hay clave de idempotencia (un identificador que
   * dice "este pedido es el mismo que ya me pediste antes", para que un
   * reintento no lo duplique). El ID lo genera el Worker cada vez, así
   * que si el cliente aprieta "confirmar" dos veces muy rápido se puede
   * crear un segundo pedido. Es un tradeoff conocido de haber movido todo
   * al Worker.
   */
  const confirmOrder = async () => {
    setConfirming(true);
    setCouponError("");
    setOrderError("");

    const orderData = {
      orderName: orderName.trim(),
      orderPhone: orderPhone.trim(),
      // La dirección solo se manda si el envío es a domicilio: si va a
      // retirar en el local o a una sucursal de Correo, no existe.
      orderAddress: zone === "correo" && correoQuote?.type === "domicilio" ? orderAddress.trim() : null,
      // El Worker no confía en ninguno de estos números: los vuelve a
      // calcular leyendo el catálogo real, el cupón real y la cotización
      // real de Correo Argentino. Se mandan igual para que, si algo no
      // cierra, se lo pueda mostrar al cliente con su número de más.
      // Solo van id + talle + color + cantidad (y el monto, si la línea
      // es una gift card comprada). El precio y el nombre los saca él.
      items: cart.map((i) => ({ id: i.id, size: i.size, color: i.color || null, qty: i.qty, ...(i.giftcard ? { amount: i.giftcardAmount } : {}) })),
      zoneId: zone,
      // La cotización se manda como referencia; el Worker la vuelve a
      // pedir a Correo Argentino antes de cobrarla.
      correoQuote: zone === "correo" ? correoQuote : null,
      couponCode: appliedCoupon?.code || null,
      // Solo el código: el Worker lee la gift card, valida que esté
      // activa, que tenga saldo y que no haya vencido, y calcula
      // cuánto descuenta. Acá no se manda ningún monto.
      giftCardCode: appliedGiftCard?.code || null,
      payMethod,
    };

    let newOrderId;
    let totalConfirmado;
    try {
      const creado = await createOrder(orderData);
      newOrderId = creado.orderId;
      // El total lo recalcula el servidor: si por lo que sea difiere de
      // lo que mostraba el resumen, se muestra el real (es el que hay
      // que transferir).
      totalConfirmado = creado.total;
      // Si el pedido incluía una gift card comprada, este es su código.
      setGiftCardIssued(creado.giftCardIssued || null);
    } catch (err) {
      // El mensaje del Worker se muestra tal cual ("se agotó el stock
      // o el descuento mientras comprabas", "no se cobró nada"). Si
      // viene sin mensaje, el del catch es uno genérico.
      setOrderError(err.message || "No se pudo confirmar el pedido, intentá de nuevo.");
      setConfirming(false);
      return;
    }

    setOrderId(newOrderId);
    setOrderTotal(totalConfirmado ?? total);

    // El pedido ya está guardado del lado del servidor, así que acá sí
    // se puede limpiar todo: si el comprador recargara, no debe volver a
    // ver los productos comprados ni el cupón aplicado.
    setCart([]);
    setAppliedCoupon(null);
    setCouponCode("");
    setAppliedGiftCard(null);
    setGiftCardCode("");
    localStorage.removeItem("cart");
    localStorage.removeItem("appliedCoupon");

    setConfirming(false);
    // Cada medio de pago termina en una pantalla distinta: la
    // transferencia muestra la caja para transferir, el efectivo pide
    // coordinar una cita en el local y la tarjeta el agradecimiento.
    if (payMethod === "transferencia") nav("gracias-transferencia");
    else if (payMethod === "efectivo") nav("cita-previa");
    else nav("gracias-tarjeta");
    // Recién ahora, con la URL ya en la página de "gracias" correcta
    // (nav ya la cambió arriba), le pegamos el ?pedido=ID al final. Antes
    // se hacía al revés y nav() pisaba esa URL enseguida — por eso, si
    // recargabas la pantalla de "gracias", se perdían el nombre y el monto.
    window.history.replaceState({}, "", `${window.location.pathname}?pedido=${newOrderId}`);
  };

  // La prenda de la ficha, resuelta desde el catálogo en vivo (puede ser
  // null si todavía no cargó o si el producto ya no existe). La usan el
  // switch, el título de la pestaña y la guía de talles.
  const selectedProduct = selectedProductId ? findProduct(selectedProductId) : null;

  /**
   * Título de la pestaña del navegador.
   *
   * Qué dispara: cada vez que cambia la página, la categoría o el
   * producto abierto. Google usa este título como resultado de búsqueda,
   * así que para un producto va el nombre de la prenda adelante y "SKUL"
   * al final (ver pageTitle en utils/routes.js).
   *
   * Sin cleanup: no hay nada que restaurar, el título anterior se
   * reemplaza en el acto.
   */
  useEffect(() => {
    const catLabel = CATS.find((c) => c.id === cat)?.label;
    document.title = pageTitle(page, { catLabel, productName: selectedProduct?.name });
  }, [page, cat, selectedProduct]);

  /* ============================================================
     EL SWITCH DE PÁGINAS
     ------------------------------------------------------------
     Abajo está el corazón visual del ruteo: si el `page` es "catalog",
     se dibuja Catalog; si es "product", ProductPage. En cada pantalla
     nueva arranca arriba con `scrollTo(0,0)` y se pasa el contexto que
     necesita.

     OJO — en este archivo no se puede usar `//` para comentar: dentro
     de JSX eso no es un comentario, es texto que se ve en la página y
     rompe el build. Todo lo que va adentro del return va con la forma
     de un comentario entre llaves: llaves-abre, barra-asterisco, texto,
     asterisco-barra, llaves-cierra.

     La clase `page-` + el nombre de la página del div contenedor le
     dice al CSS en qué pantalla estamos (para ocultar o mostrar cosas
     según el caso), y `is-nrs` marca que la prenda abierta es
     "no restock".
     ============================================================ */
  return (
    <div style={{ background: "var(--bg, #eaeaea)", minHeight: "100vh", fontFamily: "var(--font-body)", color: "var(--black)" }}>
      <div className={`skul-root page-${page}${selectedProduct?.nrs ? " is-nrs" : ""}`}>
        {/* La cortinilla de intro: se muestra una vez por visita y después se saca sola. */}
        <IntroCurtain />
        {/* El header lleva las funciones de navegación y el ícono del carrito: el botón no
            navega, solo avisa que hay algo para mirar (setCartOpen). */}
        <Header nav={nav} goCatalog={goCatalog} itemCount={itemCount} setCartOpen={setCartOpen} menuOpen={menuOpen} setMenuOpen={setMenuOpen} showOutlet={status?.outletEnabled && outletProducts.length > 0} cat={cat} categoryImages={status?.categoryImages || {}} announcement={status?.announcement || ""} />
        <main id="contenido-principal">
          {/* Si Firestore no devolvió el catálogo, se avisa en vez de mostrar una tienda
              vacía sin explicación. El error es de lectura: el carrito y el checkout siguen
              funcionando con lo que había quedado guardado. */}
          {productsError && (
            <div role="alert" style={{ background: "var(--black)", color: "var(--bg, #eaeaea)", padding: "14px 18px", margin: "0 0 18px", fontSize: 13 }}>
              No pudimos cargar el catálogo de la tienda. Revisá tu conexión y recargá la página en un momento.
            </div>
          )}
          {/* --- el switch: las páginas de la tienda --- */}
          {page === "home" && <Home goCatalog={goCatalog} nav={nav} status={status} products={filteredProducts} nrsProducts={noReastockProducts} openProduct={openProduct} addToCart={addToCart} />}
          {page === "catalog" && <Catalog cat={cat} setCat={setCat} products={filteredProducts} openProduct={openProduct} addToCart={addToCart} />}
          {page === "noreastock" && <NoReastock products={noReastockProducts} openProduct={openProduct} />}
          {page === "outlet" && <Outlet products={outletProducts} openProduct={openProduct} />}
          {page === "giftcards" && <GiftCards addGiftCard={addGiftCardToCart} giftCardEnCarrito={giftCardEnCarrito} />}
          {/* La ficha solo se dibuja si el producto ya se resolvió (si no, sale la página en
              blanco un instante mientras llega el catálogo). El `key` con el id hace que al
              pasar de una prenda a otra la ficha se monte de cero y no conserve el selector de
              talle/color de la anterior. */}
          {page === "product" && selectedProduct && (
            <ProductPage
              key={selectedProduct.id}
              product={selectedProduct}
              addToCart={addToCart}
              nav={nav}
              openProduct={openProduct}
              related={products.filter((p) => p.cat === selectedProduct.cat && p.id !== selectedProduct.id && !p.nrs && p.active !== false).slice(0, 6)}
            />
          )}
          {/* La guía de talles se abre de a una prenda: si viene de la ficha, usa la tabla de
              talles de ese producto; si se entra por el menú, muestra la general. */}
          {page === "size-guide" && <SizeGuide nav={nav} hasProduct={!!selectedProduct} cat={selectedProduct?.cat} chart={selectedProduct?.sizeChart} />}
        </main>
        {/* --- páginas institucionales (viven fuera del <main>) --- */}
        {page === "nosotros" && <Nosotros />}
        {page === "contacto" && <Contacto contactForm={contactForm} setContactForm={setContactForm} handleContactSubmit={handleContactSubmit} />}
        {page === "cambios" && <CambiosYDevoluciones />}
        {/* El checkout es la pantalla más cargada: recibe TODO el estado del carrito, del
            envío, del pago, del cupón y de la gift card, y devuelve los cambios con los
            setters. Es la única página que se ocupa de llamar a confirmOrder. */}
        {page === "checkout" && (
          <Checkout
            cart={cart} cartWeight={cartWeight} zone={zone} setZone={setZone} correoQuote={correoQuote} setCorreoQuote={setCorreoQuote}
            payMethod={payMethod} setPayMethod={setPayMethod}
            subtotal={subtotal} discount={discount} shippingCost={shippingCost} total={total}
            orderName={orderName} setOrderName={setOrderName}
            orderPhone={orderPhone} setOrderPhone={setOrderPhone} orderAddress={orderAddress} setOrderAddress={setOrderAddress}
            confirmOrder={confirmOrder} nav={nav}
            couponCode={couponCode} setCouponCode={setCouponCode} applyCoupon={applyCoupon}
            appliedCoupon={appliedCoupon} couponDiscount={couponDiscount} couponError={couponError}
            couponChecking={couponChecking} removeCoupon={removeCoupon} confirming={confirming} couponApplies={couponApplies}
            giftCardCode={giftCardCode} setGiftCardCode={setGiftCardCode} applyGiftCard={applyGiftCard}
            appliedGiftCard={appliedGiftCard} giftCardDiscount={giftCardDiscount} giftCardError={giftCardError}
            giftCardChecking={giftCardChecking} removeGiftCard={removeGiftCard}
            orderError={orderError}
          />
        )}
        {/* --- las tres pantallas de "pedido confirmado", una por medio de pago --- */}
        {/* El `total` que se muestra es el que devolvió el servidor (orderTotal), con el del
            resumen como respaldo por si se recargó la página. */}
        {page === "gracias-transferencia" && <GraciasTransferencia orderName={orderName} total={orderTotal || total} orderId={orderId} giftCardIssued={giftCardIssued} nav={nav} />}
        {page === "cita-previa" && <CitaPrevia orderId={orderId} giftCardIssued={giftCardIssued} nav={nav} />}
        {page === "gracias-tarjeta" && <GraciasTarjeta orderId={orderId} giftCardIssued={giftCardIssued} nav={nav} />}
        {/* El seguimiento se deja con solo el código en la URL: la página lee el pedido de la
            colección pública y no necesita login ni datos personales. */}
        {page === "seguimiento" && <SeguimientoPedido initialCode={trackingCode} />}

        {/* --- páginas legales (bloque largo porque son ocho textos distintos) --- */}
        {page === "terminos" && <TerminosYCondiciones />}
        {page === "privacidad" && <PoliticaPrivacidad />}
        {page === "cookies" && <PoliticaCookies />}
        {page === "analitica" && <ConsentimientoAnaliticas />}
        {page === "accesibilidad" && <Accesibilidad />}
        {page === "arrepentimiento" && <Arrepentimiento />}
        {page === "envios" && <Envios />}
        {page === "informacion-legal" && <InformacionLegal />}

        {/* El footer va siempre, en cualquier página: es la navegación secundaria. */}
        <Footer nav={nav} goCatalog={goCatalog} />

        {/* El carrito lateral. No se monta si `cartOpen` es false (por eso no hay estado
            interno de "abierto" acá: el carrito lateral es un componente normal y este booleano
            es el único que lo prende y apaga). `goCheckout` cierra el cajón y salta al checkout. */}
        {cartOpen && (
          <CartDrawer
            cart={cart} changeQty={changeQty} removeItem={removeItem} subtotal={subtotal}
            close={() => setCartOpen(false)}
            goCheckout={() => { setCartOpen(false); nav("checkout"); }}
          />
        )}
      </div>
    </div>
  );
}