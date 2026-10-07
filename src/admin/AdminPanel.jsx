import React, { useState } from "react";
import { useAdminAuth } from "../hooks/useAdminAuth.js";
import { useSiteStatus, setSiteStatus } from "../hooks/useSiteStatus.js";
import { useProducts, addProduct, updateProduct, deleteProduct } from "../hooks/useProducts.js";
import { useCoupons, saveCoupon, deleteCoupon } from "../hooks/useCoupons.js";
import { useGiftCards, createGiftCard, saveGiftCard, deleteGiftCard } from "../hooks/useGiftCards.js";
import { useOrders, setOrderStatus, setOrderTracking } from "../hooks/useOrders.js";
import { useSubscribers, deleteSubscriber } from "../hooks/useNewsletter.js";
import { CATS, SIZES, getSizesForCat, GIFT_CARD_MAX, GIFT_CARD_MIN } from "../data/config.js";
import { fmt } from "../utils/format.js";
import { redondearMontoGiftCard, saldoGiftCard, textoVencimiento } from "../utils/giftcards.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";
import { uniqueSlug, slugify } from "../utils/slug.js";
import { getDoc, doc, updateDoc, increment, runTransaction } from "firebase/firestore";
import { db } from "../firebase.js";

/**
 * ============================================================
 *  ADMINPANEL — el panel de /admin: todo lo que el dueño cambia
 *  de la tienda sin tocar código.
 *  ------------------------------------------------------------
 *
 *  Qué es: el archivo más grande del front, a propósito. Cada
 *  pestaña es un componente con su formulario y su propia escritura
 *  en Firestore, y viven todos juntos porque comparten el mismo
 *  esqueleto: cabecera, fila de botones y un bloque que se dibuja
 *  según el valor de `tab`.
 *
 *  Props que recibe: ninguna. Todo lo que necesita sale de los
 *  hooks (useAdminAuth, useSiteStatus, useProducts, useCoupons,
 *  useGiftCards, useOrders, useSubscribers).
 *
 *  Cuándo se monta: solo cuando AdminApp ve que la sesión activa es
 *  la del dueño. En cualquier otro caso nunca llega a dibujarse.
 *
 *  ── A QUÉ PARTE DEL SISTEMA PERTENECE ─────────────────────────
 *
 *  Este archivo es la ÚNICA puerta de escritura del navegador
 *  (junto con SiteGate, que escribe estado del sitio, y las
 *  acciones de pedido). "Puerta de escritura" quiere decir que es
 *  el único lugar del front desde donde se le escribe a Firestore.
 *
 *  Y acá viene la aclaración que hay que tener siempre presente:
 *  ESTAS PANTALLAS NO SON LA SEGURIDAD. Si alguien abre la consola
 *  del navegador puede llamar a las mismas funciones que yo, con
 *  cualquier dato. Lo que los frena son las reglas de
 *  firestore.rules, que corren en los servidores de Google: cada
 *  colección dice `allow write: if isAdmin()`, y "admin" es un uid
 *  específico. Por eso todo el manejo de errores de este archivo
 *  tiene un caso para permission-denied: casi siempre significa que
 *  las reglas no están publicadas, no que el dueño se haya
 *  equivocado.
 *
 *  Lo que el navegador NO escribe nunca (y por lo tanto no está en
 *  este archivo): el precio final de un pedido, el descuento de
 *  stock y el saldo de una gift card. Eso lo hace el Cloudflare
 *  Worker con una cuenta de servicio, adentro de la misma operación
 *  atómica que crea el pedido.
 *
 *  ── EL MAPA DE PESTAÑAS ───────────────────────────────────────
 *
 *  Pedidos (/orders y /orderTracking)
 *    Mueve el estado del pedido (nuevo → preparando → enviado →
 *    entregado, o cancelado), anota el número de Correo Argentino
 *    y, si el dueño cancela, devuelve el stock, el uso del cupón y
 *    el saldo de la gift card. Los pedidos los crea el Worker.
 *
 *  Estado del sitio (/settings/site)
 *    Un único documento, no una colección: abierto/cerrado,
 *    mensaje de cierre, cinta de anuncios, mostrar Outlet, countdown
 *    del drop, foto de portada (de compu y de celular), fotos
 *    destacadas y fotos de categoría. Todo eso es lo que ve la
 *    vidriera, en vivo, sin recargar.
 *
 *  Productos (/products)
 *    Alta, edición y borrado de prendas. Es el único lugar donde se
 *    define el stock.
 *
 *  Cupones (/coupons)
 *    El código ES el ID del documento (ej: INSTA10), y el cupón
 *    lleva un contador de usos (usedCount) que el Worker incrementa
 *    al confirmar un pedido.
 *
 *  Gift Cards (/giftCards)
 *    El código también es el ID (SKUL-XXXXXX). Acá se emite a mano
 *    y se pausa; el saldo se descuenta en el servidor.
 *
 *  Suscriptores (/newsletter)
 *    Solo lectura y baja. El alta la hacen los visitantes desde el
 *    pie de página, sin cuenta ni login.
 *
 *  ── QUÉ TIENE QUE HABER CARGADO SÍ O SÍ PARA QUE LA TIENDA
 *     FUNCIONE ───────────────────────────────────────────────────
 *
 *  - Foto de portada (heroImage) en "Estado del sitio". Sin ella el
 *    Home cae en la animación de siempre (no se rompe, pero el
 *    dueño seguramente quiere lo otro).
 *  - Al menos un producto con talles tildados y stock cargado. Un
 *    producto sin ningún talle NO se puede comprar: el botón
 *    "Agregar al carrito" exige un talle elegido y no hay ninguno,
 *    así que la prenda queda invisible para la venta.
 *  - Colores con el formato NOMBRE:#hex (ej: CREAM:#efece2,
 *    BLACK:#16161a), separados por coma o salto de línea. Es el
 *    único formato que parseo; lo que no entre en ese molde se
 *    descarta (ver parseo en ProductosTab).
 *  - Calce (fit) como número de 0 a 1: 0 slim, 0.5 talle real,
 *    1 baggy. La ficha lo usa para describir el calce y para elegir
 *    la tipografía; no es texto libre.
 *  - Outlet: marcar el producto con "Incluir en Outlet" Y cargar el
 *    precio rebajado. Con outlet tildado y precio vacío, el
 *    documento se guarda con outletPrice en null y el sitio lo
 *    muestra igual a precio catálogo. La sección Outlet del menú,
 *    aparte, hay que activarla en "Estado del sitio".
 *  - No-Restock (nrs): es una prenda de drop único. Aparece velada
 *    en el Home y tiene pantalla propia. No hace falta para vender,
 *    pero sin productos marcados esa sección no existe.
 *
 *  ── EL RESTO DEL ARCHIVO, EN ORDEN ────────────────────────────
 *
 *  1. EMPTY_FORM + parseSizeChartText / sizeChartToText (helpers)
 *  2. AdminPanel y TabBtn (el esqueleto y la fila de pestañas)
 *  3. PedidosTab (con la devolución de stock al cancelar)
 *  4. EstadoTab (abrir/cerrar, anuncios, outlet, countdown, fotos)
 *  5. ProductosTab (el alta/edición de prendas) + describirErrorFirestore
 *  6. CuponesTab
 *  7. GiftCardsTab
 *  8. SuscriptoresTab
 *  9. Field y linkBtn (los dos helpers de presentation compartidos)
 * ============================================================
 */

// Los valores por defecto del formulario de producto. No es solo una
// estética: cada campo que está acá es un campo que existe en el
// documento de /products, y el panel manda el objeto entero. El mismo
// objeto se usa para el alta y para la edición (ver editProduct), así
// que el formulario nunca arranca con un undefined colgado.
const EMPTY_FORM = {
  name: "",
  cat: "hoodies",
  price: "",
  weight: 400,
  tag: "",
  tone: 0.7,
  colorsText: "",
  fit: 0.5,
  nrs: false,
  photos: [],
  videos: [],
  photoColor: "#292722",
  description: "",
  composition: "",
  sizeChartText: "",
  sizes: [],
  active: true,
  outlet: false,
  outletPrice: "",
  stock: {}
};

// Los defaults que no son obvios, anotados acá para no buscarlos:
//   - weight: peso EN GRAMOS de la prenda. No es decoración: lo usa
//     la pantalla de envío para cotizar Correo Argentino.
//   - tone / photoColor: el color de la textura de relleno que se
//     dibuja donde no hay foto. Un producto sin fotos sigue
//     viéndose, pero con esa tela sintética.
//   - fit: 0.5 = talle real. El 0 es slim y el 1 es baggy.
//   - photos / sizes / stock: los tres que hacen vendible una prenda
//     (fotos, talles disponibles y cuántas unidades hay de cada uno).

/**
 * Convierte el texto de la tabla de talles en el objeto { cols, rows }.
 *
 * Qué es: el dueño escribe la tabla de medidas en un textarea tipo CSV
 * (valores separados por coma, una fila por línea). Acá la convierto a
 * un objeto, que es lo que finalmente se guarda en Firestore, para que
 * la ficha del producto pueda dibujar la tabla de verdad.
 *
 * El formato esperado es tal cual el placeholder del formulario:
 *
 *   Talle, Pecho (cm), Largo (cm)
 *   S, 94-98, 66
 *   M, 99-103, 68
 *
 * La primera línea son las columnas (los encabezados) y el resto son
 * filas de datos. Cada celda es un string: el "94-98" es un rango y no
 * lo separo, porque la ficha lo muestra tal cual lo escribió el dueño.
 *
 * Cuándo devuelve null: si el texto está vacío o tiene menos de dos
 * líneas. Para qué importa eso: la tabla de talles es OPCIONAL, así que
 * "no la cargué" queda guardado como null (que es distinto de guardarla
 * vacía) y la página muestra un aviso en vez de una tabla rota.
 */
function parseSizeChartText(text) {
  const lines = (text || "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const cols = lines[0].split(",").map((c) => c.trim());
  const rows = lines.slice(1).map((l) => ({ cells: l.split(",").map((c) => c.trim()) }));
  return { cols, rows };
}

/**
 * Inversa de parseSizeChartText, para precargar el textarea al editar.
 *
 * Por qué existe: el textarea maneja texto, pero Firestore guarda el
 * objeto. Sin esta vuelta, al abrir a editar un producto que ya tiene
 * tabla de talles el textarea saldría vacío, y si el dueño guardara sin
 * tocar nada perdería la tabla sin avisar.
 */
function sizeChartToText(chart) {
  if (!chart || !chart.cols) return "";
  return [chart.cols.join(", "), ...chart.rows.map((r) => r.cells.join(", "))].join("\n");
}

/**
 * ADMINPANEL — el esqueleto: cabecera, fila de pestañas y el bloque que
 * corresponde a la pestaña activa.
 *
 * Qué hace: nada de negocio. Solo decide qué sub-componente se dibuja
 * abajo según el string que tengo en `tab`, y ofrece las dos salidas
 * (volver al sitio y cerrar sesión).
 *
 * Props que recibe: ninguna.
 *
 * Nota de diseño: las seis pestañas se montan y se desmontan según
 * `tab` (con && en el JSX), no se ocultan con CSS. Es a propósito: al
 * cambiar de pestaña los formularios se reinicianan solos y, sobre
 * todo, los hooks de datos (onSnapshot) se suscriben y se desuscriben
 * de verdad. El precio es que al volver a "Productos" el formulario
 * vuelve a vacío, incluso si estabas editando algo.
 */
export default function AdminPanel() {
  const { logout } = useAdminAuth();
  // El string de la pestaña activa. La de arranque es "pedidos" porque es
  // que se mira todos los días; el resto arranca vacía.
  const [tab, setTab] = useState("pedidos");
  // Traemos los suscriptores en el panel (no solo cuando se abre la
  // pestaña) para poder mostrar el total junto al botón.
  //
  // Ojo: esto significa que el panel lee /newsletter apenas entra, no
  // solo si el dueño llega a esa pestaña. Es una consulta más, a una
  // lista corta.
  const { subscribers } = useSubscribers();
  // null = todavía no cargó la lista, así que no muestro "0": muestro el
  // botón sin número hasta que llegue la respuesta.
  const subscriberCount = subscribers?.length ?? null;

  return (
    <div className="admin-panel" style={{ minHeight: "100vh", fontFamily: "var(--font-body)", background: "var(--white)", color: "var(--black)" }}>
      {/* Cabecera fija de la página del panel: no es el header de la
          tienda, es el del admin. "Ver el sitio" es un <a> normal, así
          que sale del panel y entra a la vidriera (que sí pasa por el
          SiteGate: si la tienda está cerrada, el dueño igual la ve). */}
      <header style={{ borderBottom: "1px solid var(--black)", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p className="display" style={{ fontSize: 18, margin: 0 }}>SKUL — Admin</p>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <a href="/" className="tracked" style={{ fontSize: 11.5, fontWeight: 700 }}>Ver el sitio</a>
          {/* logout cierra la sesión en Firebase; como useAdminAuth está
              escuchando, AdminApp se redibuja solo y vuelve el login. */}
          <button onClick={logout} className="btn-ghost tracked" style={{ padding: "8px 14px" }}>Salir</button>
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "30px 20px 80px" }}>
        {/* La fila de pestañas es la navegación del panel. No hay router:
            el estado `tab` es toda la ruta que existe acá adentro, y por
            eso el panel no sirve un link directo a "una pestaña": hay que
            llegar, apretar y recién ahí se dibuja. */}
        <div style={{ display: "flex", gap: 8, marginBottom: 30 }}>
          <TabBtn active={tab === "pedidos"} onClick={() => setTab("pedidos")}>Pedidos</TabBtn>
          <TabBtn active={tab === "estado"} onClick={() => setTab("estado")}>Estado del sitio</TabBtn>
          <TabBtn active={tab === "productos"} onClick={() => setTab("productos")}>Productos</TabBtn>
          <TabBtn active={tab === "cupones"} onClick={() => setTab("cupones")}>Cupones</TabBtn>
          <TabBtn active={tab === "giftcards"} onClick={() => setTab("giftcards")}>Gift Cards</TabBtn>
          <TabBtn active={tab === "suscriptores"} onClick={() => setTab("suscriptores")}>
            Suscriptores{subscriberCount != null ? ` (${subscriberCount})` : ""}
          </TabBtn>
        </div>
        {/* Una sola pestaña montada a la vez. Los && son cortos de
            circuito: si la condición es falsa React ni llega a evaluar
            el componente de la derecha. */}
        {tab === "pedidos" && <PedidosTab />}
        {tab === "estado" && <EstadoTab />}
        {tab === "productos" && <ProductosTab />}
        {tab === "cupones" && <CuponesTab />}
        {tab === "giftcards" && <GiftCardsTab />}
        {tab === "suscriptores" && <SuscriptoresTab />}
      </div>
    </div>
  );
}

/**
 * TABBTN — el botón de la fila de pestañas.
 *
 * Props: active (booleano, decide el relleno), onClick (quésetTab
 * llamar) y children (el texto).
 *
 * Por qué existe: son seis botones idénticos con un solo detalle que
 * cambia (negro lleno vs. transparente). Sacarlo a un componente
 * evita seis style={{...}} repetidos.
 */
function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="tracked"
      style={{ padding: "9px 16px", fontSize: 12, fontWeight: 700, border: "1px solid var(--black)", background: active ? "var(--black)" : "transparent", color: active ? "var(--white)" : "var(--black)" }}
    >
      {children}
    </button>
  );
}

/* ---------------- Pedidos (todos los pedidos confirmados) ---------------- */

// Los valores que viajan en el documento sonKeys en inglés (los escribió
// el Worker) y lo que ve el dueño, en español. Estos dos mapas son la
// traducción. Si el Worker manda un medio de pago que no está acá, el
// <select> lo muestra crudo en vez de romper.
const PAY_LABELS = { debito: "Débito", credito: "Crédito", transferencia: "Transferencia", efectivo: "Efectivo" };
// El <select> de estado se arma con ESTE objeto: Object.entries da
// [valor, texto] y por eso el value del option es la clave que se
// escribe en Firestore, no la etiqueta. Agregar un estado nuevo es
// agregar una línea acá (el Worker también tiene que poder cancelarlo,
// pero no necesita saber la etiqueta).
const STATUS_LABELS = { nuevo: "Nuevo", preparando: "Preparando", enviado: "Enviado / listo", entregado: "Entregado", cancelado: "Cancelado" };

/**
 * PEDIDOSTAB — la lista de pedidos con su estado y los datos para
 * despacharlos.
 *
 * Qué problema resuelve: es la pantalla de trabajo diario. El dueño
 * necesita ver quién pidió qué, con qué medio de pago y por dónde va,
 * y mover el pedido de "nuevo" a "entregado".
 *
 * Props que recibe: ninguna. Toma todo de useOrders, que se suscribe en
 * vivo a /orders: si entra una compra mientras el panel está abierto,
 * esta lista se actualiza sola.
 *
 * Qué escribe: /orders y /orderTracking. El estado, a través de
 * setOrderStatus, que actualiza los dos documentos en un solo lote
 * (writeBatch) para que el cliente que sigue su pedido por código vea
 * exactamente lo mismo que ve el dueño.
 *
 * OJO con el caso raro: al cancelar, además de cambiar el estado, hay
 * que devolver el stock. Está explicado más abajo, en el handler.
 */
function PedidosTab() {
  const { orders } = useOrders();

  // null = la consulta todavía no llegó. Distinguirlo de [] importa: []
  // significa "no hay pedidos" y se puede decir eso con todas las letras.
  if (orders === null) return <p>Cargando…</p>;

  const handleStatusChange = async (order, newStatus) => {
    // Si se pasa el pedido a CANCELADO, consultamos si se desea devolver el stock
    //
    // Ojo con la condición: si el pedido YA estaba cancelado, no vuelvo
    // a preguntar. Pasarlo por "preparando" y volver a "cancelado" es un
    // camino normal (el dueño se equivoca y se corrige) y preguntar de
    // nuevo sería molesto; además la marca de abajo evita reponer dos
    // veces.
    if (newStatus === "cancelado" && order.status !== "cancelado") {
      const confirmRestock = window.confirm("¿Querés cancelar el pedido y devolver las prendas al stock de la tienda?");
      // Si dice que no, el pedido se cancela igual y el stock NO vuelve:
      // por ejemplo ya se despachó la prenda. El `if` no corta nada,
      // justamente porque la pregunta es ortogonal al cambio de estado.
      if (confirmRestock) {
        // Todo lo de abajo (reponer stock, devolver el uso del cupón y de
        // la gift card, desactivar la gift card emitida) se marca en el
        // pedido con `stockRestocked`.
        //
        // Sin esa marca, cancelar dos veces el mismo pedido (por ejemplo,
        // pasar por "preparando" y volver a "cancelado") reponía el stock
        // dos veces: la tienda empezaba a vender prendas que ya se habían
        // entregado. El claiming es atómico, así que dos clics seguidos no
        // pueden reponer dos veces.
        const oRef = doc(db, "orders", order.id);
        // "listo" = este pedido todavía no había sido repuesto (se puede
        // reponer). "repetido" = ya estaba repuesto antes. "error" = no se
        // pudo saber; en ese caso NO se repone sola (preferimos que el
        // admin lo haga a mano antes que crear stock de la nada).
        //
        // `runTransaction` es una operación de lectura + escritura con
        // candado: relee el documento, y si alguien lo tocó entre la
        // lectura y la escritura, la repeats sola. Por eso dos clics
        // seguidos NO pueden reponer dos veces.
        let estado = "listo";
        try {
          await runTransaction(db, async (tx) => {
            const snap = await tx.get(oRef);
            if (!snap.exists()) {
              estado = "error";
              return;
            }
            if (snap.data().stockRestocked === true) {
              estado = "repetido";
              return;
            }
            tx.update(oRef, { stockRestocked: true });
            estado = "listo";
          });
        } catch (e) {
          estado = "error";
          console.error("No se pudo marcar el pedido como repuesto:", e);
        }

        // Los tres finales posibles del claiming. "repetido" y "error" no cortan
        // la cancelación: solo cambian la pregunta que se le hace al
        // dueño para que decida con la información real, porque el
        // return de abajo sí cancela el return de la función entera
        // (y con él, el cambio de estado).
        if (estado === "repetido") {
          if (!window.confirm("Este pedido ya tenía el stock devuelto antes. ¿Cancelar igual sin reponer de nuevo?")) return;
        } else if (estado === "error") {
          if (!window.confirm("No se pudo verificar si este pedido ya tenía el stock devuelto, así que NO se va a reponer solo. ¿Cancelar el pedido igual y reponer a mano después?")) return;
        } else {
          // El stock se repone DENTRO de una transacción.
          //
          // Antes se hacía a mano: se tomaba el `stock` del snapshot que ya
          // tenía la pantalla y se escribía el mapa entero. Como el snapshot
          // quedó viejo en el momento de apretar el botón, una venta que
          // entrara entre la carga de la pantalla y el clic pisaba su stock y
          // se perdía (el pedido se guardaba con stock que ya estaba vendido).
          // `runTransaction` relee el documento y reintenta solo si alguien
          // lo tocó mientras tanto.
          for (const item of order.items || []) {
            // La gift card comprada entra al pedido como un ítem más
            // (con id "giftcard"), pero no es un producto: no tiene
            // stock, así que la salteo.
            if (item.id && item.size && item.id !== "giftcard") {
              const pRef = doc(db, "products", item.id);
              const qty = Number(item.qty) || 1;
              try {
                // Una transacción por prenda, y no una sola para todas:
                // si una falla, las otras ya repuestas no se pierden
                // (no hay rollback). Es el tradeoff de no tener que
                // armar un lote condicional para todo el pedido.
                await runTransaction(db, async (tx) => {
                  const snap = await tx.get(pRef);
                  if (!snap.exists()) return;
                  const data = snap.data();
                  const stock = { ...(data.stock || {}) };
                  stock[item.size] = Number(stock[item.size] || 0) + qty;
                  tx.update(pRef, { stock });
                });
              } catch (e) {
                console.error(`No se pudo reponer el stock de "${item.id}" (${item.size}):`, e);
              }
            }
          }
          // Revertir cupón usado
          // Un contador de usos es un número que va sumando: si el
          // pedido se cancela, hay que devolverle el uso. `increment(-1)`
          // suma -1 en el servidor (no "escribo 3"), así que dos
          // devoluciones simultáneas no se pisan.
          if (order.couponCode) {
            try {
              const cRef = doc(db, "coupons", order.couponCode);
              const cSnap = await getDoc(cRef);
              if (cSnap.exists()) {
                await updateDoc(cRef, { usedCount: increment(-1) });
              }
            } catch (e) {}
          }
          // Revertir gift card usada
          if (order.giftCardCode && order.giftCardDiscount > 0) {
            try {
              const gRef = doc(db, "giftCards", order.giftCardCode);
              const gSnap = await getDoc(gRef);
              if (gSnap.exists()) {
                await updateDoc(gRef, { usedAmount: increment(-order.giftCardDiscount) });
              }
            } catch (e) {}
          }
          // Desactivar gift card emitida por este pedido
          // Si el cliente COMPRÓ una gift card (o se la regalaron), el
          // pedido generó un código. Si el pedido se cancela, ese
          // código deja de servir: laGift card nunca fue cobrada.
          if (order.giftCardIssued) {
            try {
              const gRef = doc(db, "giftCards", order.giftCardIssued);
              const gSnap = await getDoc(gRef);
              if (gSnap.exists()) {
                await updateDoc(gRef, { active: false });
              }
            } catch (e) {}
          }
        }
      }
    }
    // Recién al final, con todo lo de la devolución ya hecho (o
    // deliberadamente salteado), cambio el estado del pedido. Ese
    // orden importa: si el setOrderStatus fallara, el dueño cancela
    // otra vez y el claiming le avisa que ya estaba repuesto.
    await setOrderStatus(order, newStatus);
  };

  return (
    <div>
      <p className="tracked" style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
        Pedidos recibidos ({orders.length})
      </p>
      {orders.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--grey-3)" }}>Todavía no hay pedidos confirmados.</p>
      )}
      {/* Una caja por pedido, no una tabla: cada pedido trae una
          cantidad variable de datos (puede tener cupón, gift card o
          ninguno) y un <select> de estado, y en una tabla eso se
          rompe. Acá el <select> va arriba a la derecha y el resto
          debajo, que es lo que se lee bien en una pantalla angosta. */}
      <div style={{ display: "grid", gap: 14 }}>
        {orders.map((o) => (
          <div key={o.id} style={{ border: "1px solid var(--black)", padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              <div>
                <p style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>{o.orderName}</p>
                {o.orderPhone && <p style={{ fontSize: 12.5, margin: "2px 0 0" }}>📞 {o.orderPhone}</p>}
                {o.orderAddress && <p style={{ fontSize: 12.5, margin: "2px 0 0" }}>📍 {o.orderAddress}</p>}
                {/* createdAt es un Timestamp de Firestore (el reloj de
                    Google, no el de la compu), por eso el ?.toDate antes
                    de formatearlo. */}
                <p className="mono" style={{ fontSize: 11.5, color: "var(--grey-3)", margin: "2px 0 0" }}>
                  {o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString("es-AR") : "—"}
                </p>
                {/* El ID del pedido: es lo que el cliente escribe para
                    seguir su compra, así que lo muestro siempre y en
                    monoespaciada para poder copiarlo sin errores. */}
                <p className="mono" style={{ fontSize: 11, color: "var(--grey-4, #9a9a94)", margin: "4px 0 0" }}>
                  ID: {o.id}
                </p>
              </div>
              {/* El <select> controlado: el value sale del documento, así
                  que si otro lado cambiara el estado (no debería: el
                  navegador no escribe pedidos), el selecto se actualiza
                  solo en vez de mostrar un valor mentiroso. */}
              <select
                value={o.status || "nuevo"}
                onChange={(e) => handleStatusChange(o, e.target.value)}
                style={{ border: "1px solid var(--black)", padding: "6px 10px", fontSize: 12.5 }}
              >
                {Object.entries(STATUS_LABELS).map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "grid", gap: 4, marginBottom: 10 }}>
              {(o.items || []).map((i, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span>{i.name} / {i.size}{i.color ? ` / ${i.color}` : ""} x{i.qty}</span>
                  <span className="mono">{fmt(i.price * i.qty)}</span>
                </div>
              ))}
            </div>
            {/* Resumen de lo que se cobró: el total es el número que
                calculó el servidor, no lo que se ve en pantalla. */}
            <div style={{ borderTop: "1px solid var(--grey-1)", paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}>
              <span>Total</span>
              <span className="mono">{fmt(o.total)}</span>
            </div>
            {/* Datos de pago y envío. Los && ocultan lo que no aplica:
                sin cupón no hay fila de cupón. */}
            <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--grey-3)", display: "grid", gap: 2 }}>
              <span>Medio de pago: <strong style={{ color: "var(--black)" }}>{PAY_LABELS[o.payMethod] || o.payMethod}</strong></span>
              <span>Envío / retiro: <strong style={{ color: "var(--black)" }}>{o.zoneId}</strong></span>
              {o.couponCode && <span>Cupón usado: <strong style={{ color: "var(--black)" }}>{o.couponCode}</strong></span>}
              {o.giftCardDiscount > 0 && <span>Gift card usada: <strong style={{ color: "var(--black)" }}>{o.giftCardCode}</strong> (-{fmt(o.giftCardDiscount)})</span>}
              {o.giftCardIssued && <span className="mono" style={{ color: "var(--black)" }}>🎁 Vendida gift card {o.giftCardIssued}</span>}
            </div>
            {/* El casillero de Correo Argentino aparece SOLO para los envíos por
                correo (el zoneId arranca con "Correo Argentino") o si el
                pedido tiene una cotización guardada. Si el cliente
                retiró en el local, no tiene sentido mostrarlo.

                Ojo con que el input NO es controlado: usa defaultValue y
                guarda con onBlur (al salir del campo), no con
                onChange. Es a propósito para no escribir en Firestore en
                cada tecla: el dueño pega el número, saca el foco y ahí
                sí se guarda. El trim() evita que quede un espacio al
                final pegado con el código. */}
            {o.zoneId?.startsWith?.("Correo Argentino") || o.correoQuote ? (
              <label style={{ display: "grid", gap: 4, marginTop: 10 }}>
                <span className="tracked" style={{ fontSize: 11, fontWeight: 700 }}>N° de seguimiento de Correo</span>
                <input
                  defaultValue={o.correoTracking || ""}
                  onBlur={(e) => setOrderTracking(o, e.target.value.trim())}
                  placeholder="Lo pegás acá cuando te lo dé MiCorreo"
                  style={{ border: "1px solid var(--black)", padding: "6px 10px", fontSize: 12.5, maxWidth: 260 }}
                />
              </label>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Estado del sitio (abrir/cerrar + mensaje) ---------------- */

/**
 * ESTADOTAB — todo lo que el dueño puede cambiar de la tienda sin
 * tocar código.
 *
 * Qué problema resuelve: que cerrar la web funcione para todo el mundo
 * y no solo en la compu del admin. Todo lo de esta pestaña se guarda
 * en UN documento de Firestore, /settings/site, y la vidriera se
 * suscribe a ese documento con onSnapshot: cuando aprieto "Cerrar la
 * web", a los dos segundos todos los visitantes del país ven la
 * pantalla de cierre, sin recargar y sin esperar un deploy.
 *
 * Props que recibe: ninguna. Lee el documento con useSiteStatus y lo
 * escribe con setSiteStatus.
 *
 * Qué escribe: `setSiteStatus(patch)` hace un setDoc con merge, así
 * que cada botón manda SOLO el campo que cambia. Guardar la foto del
 * hero no pisa el mensaje de cierre, y viceversa.
 *
 * OJO con el patrón de esta pestaña: casi ningún campo escribe solo.
 * Los textareas (mensaje, cinta, nombre y fecha del drop) viven en
 * estado local mientras el owner tipea y recién escriben en Firestore
 * cuando aprieta su botón "Guardar". El panel no toca la base mientras
 * se está escribiendo.
 */
function EstadoTab() {
  // El documento ya mergeado con los defaults (null mientras carga).
  const { status } = useSiteStatus();
  // Estado local de los formularios que tienen botón "Guardar".
  const [message, setMessage] = useState("");
  const [dropName, setDropName] = useState("");
  const [dropDate, setDropDate] = useState("");
  // `saving` es global de la pestaña: deshabilita todos los botones
  // mientras hay una escritura en vuelo, para que no se pisen dos
  // patches a la vez (que se pisarían entre sí por el merge).
  const [saving, setSaving] = useState(false);
  // Los tres flags de "Guardado ✓": son efímeros, el setTimeout de cada
  // handler los apaga solo. Uno por bloque para que el "✓" aparezca
  // solo donde acaba de guardar.
  const [saved, setSaved] = useState(false);
  const [dropSaved, setDropSaved] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [announcementSaved, setAnnouncementSaved] = useState(false);
  // Un flag por subida de imagen. Son cuatro porque hay cuatro
  // <input type="file"> distintos, cada uno muestra su "Subiendo…".
  const [heroUploading, setHeroUploading] = useState(false);
  const [heroMobileUploading, setHeroMobileUploading] = useState(false);
  const [lookUploading, setLookUploading] = useState(false);
  // El de categorías guarda el ID de la categoría que está subiendo, no
  // un booleano: así el "Subiendo…" aparece solo en la fila que está
  // trabajando y el ID "" significa "nada subiendo".
  const [catUploading, setCatUploading] = useState("");

  // Precargo los formularios con lo que ya está guardado. Ojo con la
  // forma: los `!message` / `!dropName && !dropDate` evitan que cada
  // cambio del documento (que llega en vivo, incluso por un cambio
  // hecho desde otra pestaña o desde el celular) pise lo que el dueño
  // está tipeando en este momento.
  //
  // El detalle raro: la announcement se precarga dentro del if del
  // drop. Si el documento llega con dropName ya vacío, la cinta nunca
  // se precarga. No lo toqué porque funciona en la práctica (el
  // documento casi siempre viene con los dos), pero queda anotado.
  React.useEffect(() => {
    if (status && !message) setMessage(status.message || "");
    if (status && !dropName && !dropDate) {
      setDropName(status.dropName || "");
      setDropDate(status.dropDate || "");
      if (status && !announcement) setAnnouncement(status.announcement || "");
    }
  }, [status]);

  // status todavía null = el documento no llegó. Con el if anterior ya
  // no puedo usar hooks después de este return, y por eso todos los
  // handlers de esta pestaña están definidos antes de acá.
  if (!status) return <p>Cargando…</p>;

  // Abrir/cerrar la web. Además del flag mando el mensaje: si el
  // dueño escribió el mensaje y no llegó a apretar "Guardar mensaje",
  // cerrar la tienda lo guarda igual. Es el atajo que evita el
  // clásico "cerré la web sin ver el mensaje que escribí".
  const toggleOpen = async () => {
    setSaving(true);
    await setSiteStatus({ open: !status.open, message });
    setSaving(false);
  };

  // Guardado explícito del mensaje de cierre. Mando también `open`
  // porque setDoc con merge no lo tocaría solo: lo mando para que
  // quede explícito que guardar el mensaje NO cierra la tienda.
  const saveMessage = async () => {
    setSaving(true);
    await setSiteStatus({ open: status.open, message });
    setSaving(false);
    setSaved(true);
    // El "✓" dura 1,5 segundos y se apaga solo.
    setTimeout(() => setSaved(false), 1500);
  };

  // La cinta de anuncios es el único campo que se manda solo, porque
  // es el único que no depende de nada más del documento.
  const saveAnnouncement = async () => {
    setSaving(true);
    await setSiteStatus({ announcement });
    setSaving(false);
    setAnnouncementSaved(true);
    setTimeout(() => setAnnouncementSaved(false), 1500);
  };

  // Mostrar/ocultar el countdown. Es independiente de tener fecha:
  // se puede activar el countdown sin fecha puesta, y en ese caso el
  // Home no lo muestra (falta la fecha), pero el botón queda en "visible".
  const toggleDrop = async () => {
    setSaving(true);
    await setSiteStatus({ dropEnabled: !status.dropEnabled });
    setSaving(false);
  };

  // Guardar nombre y fecha del drop juntos: la fecha sin nombre no
  // sirve (el Home muestra el nombre en la franja).
  const saveDrop = async () => {
    setSaving(true);
    await setSiteStatus({ dropName, dropDate });
    setSaving(false);
    setDropSaved(true);
    setTimeout(() => setDropSaved(false), 1500);
  };

  // ── Subir la foto de portada (compu) ──────────────────────────────
  //
  // Cómo funciona una subida, en general, porque se repite en toda la
  // pestaña: el archivo NO pasa por Firestore (que es de texto y
  // admite ~1 MB). Va directo del navegador a Cloudinary (un servicio
  // de imágenes en la nube) y lo que se guarda en la base es solo la
  // URL que devuelve. Esa URL no es pública de cualquiera: el panel le
  // pide una firma al Cloudflare Worker, que la calcula con el secreto
  // de la cuenta, así que nadie más puede subir a nuestro nombre.
  //
  // Si la subida falla, el catch avisa y no escribe nada en Firestore:
  // o se guarda la URL nueva o no se cambia el campo. No queda a medias.
  // Si la subida funciona pero el setSiteStatus falla, el alert dice
  // "Error al subir imagen": la foto quedó en Cloudinary huérfana,
  // pero el documento sigue con la foto anterior (que es lo que
  // conviene: mejor la vieja que ninguna).
  const uploadHero = async (e) => {
    const file = e.target.files?.[0];
    // Si el dueño cancela el selector de archivos, no hay nada que subir.
    if (!file) return;
    setHeroUploading(true);
    try {
      const url = await uploadToCloudinary(file);
      await setSiteStatus({ heroImage: url });
    } catch (err) {
      alert("Error al subir imagen de portada");
    } finally {
      setHeroUploading(false);
      // Vaciar el input es lo que permite volver a elegir EL MISMO
      // archivo: sin esto, si subís la foto, la sacás y la volvés a
      // subir, el input no dispara onChange porque el valor no cambió.
      e.target.value = "";
    }
  };
  // Sacar la foto es escribir "" (string vacío), no borrar el campo:
  // con setDoc merge no se puede borrar, solo pisar. El Home usa ""
  // como señal de "no hay hero" y cae en la animación de siempre.
  const removeHero = () => setSiteStatus({ heroImage: "" });

  // Misma subida que la de arriba pero para el hero del celular. Son
  // dos campos separados a propósito: el celu muestra una foto vertical
  // (9:16, la forma de la pantalla) y la compu otra horizontal. Si
  // estuviera vacío el hero del celu, la web usa la de compu.
  const uploadHeroMobile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setHeroMobileUploading(true);
    try {
      const url = await uploadToCloudinary(file);
      await setSiteStatus({ heroImageMobile: url });
    } catch (err) {
      alert("Error al subir imagen de portada para celular");
    } finally {
      setHeroMobileUploading(false);
      e.target.value = "";
    }
  };
  const removeHeroMobile = () => setSiteStatus({ heroImageMobile: "" });

  // Fotos destacadas ("Shop the Look"): acá sí son varias, y las subo
  // de a una en un for (no en paralelo) a propósito: el Worker firma
  // cada subida y firmar cinco pedidos juntos lo hace fallar más
  // seguido que firmar de a uno.
  //
  // Caso borde del for: si la tercera de cinco falla, las dos primeras
  // ya quedaron subidas en Cloudinary pero NO se guardan en Firestore,
  // porque la escritura es una sola y está después del for. Quedan
  // huérfanas en la cuenta: es espacio desperdiciado, no un estado
  // roto en la tienda.
  const uploadLookPhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setLookUploading(true);
    try {
      const urls = [];
      for (const file of files) urls.push(await uploadToCloudinary(file));
      // Concateno con las que ya había: este campo es una lista
      // acumulativa y sacar una foto después es un filter (abajo).
      await setSiteStatus({ lookbookPhotos: [...(status.lookbookPhotos || []), ...urls] });
    } catch (err) {
      alert("Error al subir fotos destacadas");
    } finally {
      setLookUploading(false);
      e.target.value = "";
    }
  };
  // Sacar una foto concreta es reescribir la lista completa sin ese
  // elemento. Ojo: el filter compara contra el `status` de esta
  // pantalla; si justo se subió otra foto en paralelo, la última
  // escritura pisa a la anterior (un caso perdido, no un bug de datos).
  const removeLookPhoto = (url) =>
    setSiteStatus({ lookbookPhotos: (status.lookbookPhotos || []).filter((u) => u !== url) });

  const uploadCategoryImage = async (catId, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Guardar el ID de la categoría, no un true: el input se deshabilita
    // solo en la fila que se está subiendo.
    setCatUploading(catId);
    try {
      const url = await uploadToCloudinary(file);
      // categoryImages es un mapa { idDeCategoría: url }. Con el spread
      // pongo la foto nueva arriba de las otras, así subir una sola no
      // borra las demás.
      await setSiteStatus({ categoryImages: { ...(status.categoryImages || {}), [catId]: url } });
    } catch (err) {
      alert("Error al subir imagen de categoría");
    } finally {
      setCatUploading("");
      e.target.value = "";
    }
  };
  // Sacar la foto de una categoría: borro la clave del mapa y mando el
  // mapa entero. Ojo: no hay forma de "dejar la clave vacía" con merge,
  // por eso el `delete` sobre una copia del objeto.
  const removeCategoryImage = (catId) => {
    const next = { ...(status.categoryImages || {}) };
    delete next[catId];
    setSiteStatus({ categoryImages: next });
  };

  return (
    // maxWidth 480 y todo en una columna: esta pestaña son ocho bloques
    // apilados, no una grilla. La columna angosta los deja legibles sin
    // que el texto de las fotos se estire a lo ancho de la pantalla.
    <div style={{ maxWidth: 480 }}>
      {/* 1) Abrir/cerrar. El botón cambia de estilo según el estado
          (primario si está cerrada, fantasma si está abierta) para que
          el gesto destructivo se lea distinto al de reopening. */}
      <div style={{ border: "1px solid var(--black)", padding: 20, marginBottom: 24 }}>
        <p className="tracked" style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Estado actual</p>
        <p style={{ fontSize: 14, marginBottom: 16 }}>
          La tienda está{" "}
          <strong style={{ color: status.open ? "green" : "var(--accent)" }}>{status.open ? "ABIERTA" : "CERRADA"}</strong>{" "}
          para el público.
        </p>
        <button onClick={toggleOpen} disabled={saving} className={status.open ? "btn-ghost tracked" : "btn-primary tracked"}>
          {status.open ? "Cerrar la web" : "Reabrir la web"}
        </button>
      </div>

      {/* 2) Cinta de anuncios. Sale de la pantalla al apretar Guardar, no
          mientras se escribe: si escribiera en cada tecla, cada pulsación
          sería una escritura en Firestore (y un gasto). El textarea es
          controlado, así que lo que veo acá es lo que se va a guardar. */}
      <div style={{ border: "1px solid var(--black)", padding: 20, marginTop: 24 }}>
        <p className="tracked" style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Cinta de anuncios (arriba de todo)</p>
        <p style={{ fontSize: 12.5, color: "var(--grey-3)", marginBottom: 12 }}>
          Es el texto que corre en la franja de arriba del sitio, en todas las páginas. Si lo dejás vacío, no se muestra.
        </p>
        <textarea
          rows={2}
          value={announcement}
          onChange={(e) => setAnnouncement(e.target.value)}
          style={{ width: "100%", border: "1px solid var(--black)", padding: "10px 12px", fontSize: 14, marginBottom: 12, resize: "vertical" }}
          placeholder="Ej: 10% OFF PAGANDO EN EFECTIVO"
        />
        <button onClick={saveAnnouncement} disabled={saving} className="btn-primary tracked">
          {announcementSaved ? "Guardado ✓" : "Guardar cinta"}
        </button>
      </div>

      {/* 3) Mensaje de cierre: es el texto grande de ClosedScreen. Ojo: no
          tiene nada que ver con abrir/cerrar. Se puede guardar el
          mensaje con la web abierta (para dejarlo escrito) y se
          muestra cuando alguien la cierre después. */}
      <div style={{ border: "1px solid var(--black)", padding: 20, marginTop: 24 }}>
        <p className="tracked" style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Mensaje de "cerrado"</p>
        <p style={{ fontSize: 12.5, color: "var(--grey-3)", marginBottom: 12 }}>
          Esto es lo que ven los visitantes en la pantalla de cierre.
        </p>
        <textarea
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          style={{ width: "100%", border: "1px solid var(--black)", padding: "10px 12px", fontSize: 14, marginBottom: 12, resize: "vertical" }}
          placeholder="Ej: Nuevo drop el 4/8"
        />
        <button onClick={saveMessage} disabled={saving} className="btn-primary tracked">
          {saved ? "Guardado ✓" : "Guardar mensaje"}
        </button>
      </div>

      {/* 4) Outlet: acá solo se enciende o apaga la SECCIÓN del menú, que
          es un flag del sitio. Los productos que van en Outlet se
          marcan en la pestaña Productos, uno por uno. Ojo: activar
          esta sección con ningún producto marcado deja un link en el
          menú que no lleva a ningún lado; el Home lo oculta si no hay
          outlet, pero conviene saberlo. Este botón escribe directo
          (sin estado local ni botón "Guardar") porque no hay nada que
          tipear: es un interruptor. */}
      <div style={{ border: "1px solid var(--black)", padding: 20, marginTop: 24 }}>
        <p className="tracked" style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Sección Outlet</p>
        <p style={{ fontSize: 14, marginBottom: 16 }}>
          La sección Outlet está{" "}
          <strong style={{ color: status.outletEnabled ? "green" : "var(--accent)" }}>
            {status.outletEnabled ? "VISIBLE" : "OCULTA"}
          </strong>{" "}
          para el público.
        </p>
        <button
          onClick={() => setSiteStatus({ outletEnabled: !status.outletEnabled })}
          className={status.outletEnabled ? "btn-ghost tracked" : "btn-primary tracked"}
        >
          {status.outletEnabled ? "Ocultar Outlet" : "Mostrar Outlet"}
        </button>
      </div>

      {/* 5) Countdown del drop: dos cosas separadas y a propósito. El
          interruptor de visibilidad, y los dos campos de contenido.
          Se puede guardar nombre y fecha con el countdown apagado, y
          viceversa.

          La fecha se guarda como texto en formato datetime-local
          ("2026-08-10T20:00"), que es lo que el <input> de tipo
          datetime-local entiende y lo que el Home parsea con new
          Date(). Ojo: se guarda en la zona horaria del navegador que
          lo escribió, así que si el dueño programa desde otra
          Machines el horario puede quedar corrido. */}
      <div style={{ border: "1px solid var(--black)", padding: 20, marginTop: 24 }}>
        <p className="tracked" style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Countdown de drop</p>
        <p style={{ fontSize: 14, marginBottom: 16 }}>
          El countdown está{" "}
          <strong style={{ color: status.dropEnabled ? "green" : "var(--accent)" }}>
            {status.dropEnabled ? "VISIBLE" : "OCULTO"}
          </strong>{" "}
          en el inicio.
        </p>
        <button
          onClick={toggleDrop}
          disabled={saving}
          className={status.dropEnabled ? "btn-ghost tracked" : "btn-primary tracked"}
          style={{ marginBottom: 20 }}
        >
          {status.dropEnabled ? "Ocultar countdown" : "Mostrar countdown"}
        </button>

        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 5 }}>
            <span className="tracked" style={{ fontSize: 10.5, fontWeight: 700 }}>Nombre del drop</span>
            <input
              value={dropName}
              onChange={(e) => setDropName(e.target.value)}
              placeholder="Ej: No-Restock Vol. 3"
              style={{ border: "1px solid var(--black)", padding: "10px 12px", fontSize: 14 }}
            />
          </label>
          <label style={{ display: "grid", gap: 5 }}>
            <span className="tracked" style={{ fontSize: 10.5, fontWeight: 700 }}>Fecha y hora</span>
            <input
              type="datetime-local"
              value={dropDate}
              onChange={(e) => setDropDate(e.target.value)}
              style={{ border: "1px solid var(--black)", padding: "10px 12px", fontSize: 14 }}
            />
          </label>
          <button onClick={saveDrop} disabled={saving} className="btn-primary tracked">
            {dropSaved ? "Guardado ✓" : "Guardar drop"}
          </button>
        </div>
      </div>

      {/* 6) Foto de portada. Primero la de compu, después (separada por una
          línea) la del celular dentro del mismo bloque: son la misma
          decisión de diseño (el hero del Home) y por eso van juntas.

          Cada <img> es una previsualización de lo que está guardado
          AHORA. Subir una foto nueva la guarda directo: no hay botón
          "guardar" para las imágenes, el archivo elegido es el
          guardado. */}
      <div style={{ border: "1px solid var(--black)", padding: 20, marginTop: 24 }}>
        <p className="tracked" style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Foto de portada (Home)</p>
        {status.heroImage && (
          <div style={{ marginBottom: 12 }}>
            <img src={status.heroImage} alt="Portada actual" style={{ width: "100%", maxHeight: 220, objectFit: "cover", display: "block", marginBottom: 8 }} />
            <button onClick={removeHero} className="btn-ghost tracked" style={{ fontSize: 12 }}>Sacar foto</button>
          </div>
        )}
        <input type="file" accept="image/*" onChange={uploadHero} disabled={heroUploading} />
        {heroUploading && <p style={{ fontSize: 12, color: "var(--grey-3)", marginTop: 6 }}>Subiendo…</p>}

        <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--line, #ccc)" }}>
          <p className="tracked" style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Foto de portada para celular</p>
          <p style={{ fontSize: 12, color: "var(--grey-3)", marginBottom: 10 }}>
            Subí acá una foto <strong>vertical</strong> (más alta que ancha, tipo 9:16, como la pantalla del teléfono).
            En el celular se muestra esta y llena toda la pantalla; en la compu se sigue usando la de arriba.
          </p>
          {status.heroImageMobile && (
            <div style={{ marginBottom: 12 }}>
              <img src={status.heroImageMobile} alt="Portada celular actual" style={{ width: 130, maxHeight: 220, objectFit: "cover", display: "block", marginBottom: 8 }} />
              <button onClick={removeHeroMobile} className="btn-ghost tracked" style={{ fontSize: 12 }}>Sacar foto celular</button>
            </div>
          )}
          <input type="file" accept="image/*" onChange={uploadHeroMobile} disabled={heroMobileUploading} />
          {heroMobileUploading && <p style={{ fontSize: 12, color: "var(--grey-3)", marginTop: 6 }}>Subiendo…</p>}
        </div>
      </div>

      {/* 7) Fotos destacadas del Home ("Shop the Look"). El input tiene
          `multiple`, así que el dueño elige varias de una vez. Si no
          hay ninguna, el Home usa las de repuso del proyecto (las
          SVG de /public/editorial), así que la sección nunca queda
          vacía aunque el dueño suba nada. */}
      <div style={{ border: "1px solid var(--black)", padding: 20, marginTop: 24 }}>
        <p className="tracked" style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Fotos destacadas (looks)</p>
        {(status.lookbookPhotos || []).length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8, marginBottom: 12 }}>
            {status.lookbookPhotos.map((url) => (
              <div key={url} style={{ position: "relative" }}>
                <img src={url} alt="" style={{ width: "100%", height: 90, objectFit: "cover", display: "block" }} />
                <button
                  onClick={() => removeLookPhoto(url)}
                  style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,.7)", color: "#fff", border: "none", width: 20, height: 20, fontSize: 12, cursor: "pointer" }}
                  title="Sacar foto"
                >×</button>
              </div>
            ))}
          </div>
        )}
        <input type="file" accept="image/*" multiple onChange={uploadLookPhotos} disabled={lookUploading} />
        {lookUploading && <p style={{ fontSize: 12, color: "var(--grey-3)", marginTop: 6 }}>Subiendo…</p>}
      </div>

      {/* 8) Fotos de categoría del Home y del menú. OJO: esta lista NO es
          la misma que CATS de data/config.js. Acá están solo las
          categorías que tienen un lugar fijo en el Home (faltan
          Joggings y Bermudas, por ejemplo). Es una lista propia y
          aparte a propósito: aunque mañana se agrega una categoría al
          catálogo, no tiene por qué aparecer con foto en el Home. */}
      <div style={{ border: "1px solid var(--black)", padding: 20, marginTop: 24 }}>
        <p className="tracked" style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Fotos de categorías (Home)</p>
        <div style={{ display: "grid", gap: 14 }}>
          {HOME_CATEGORY_IDS.map(({ id, label }) => (
            <div key={id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 64, height: 80, background: "var(--white)", border: "1px solid var(--black)", flexShrink: 0, overflow: "hidden" }}>
                {status.categoryImages?.[id] && (
                  <img src={status.categoryImages[id]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                )}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>{label}</p>
                <input type="file" accept="image/*" onChange={(e) => uploadCategoryImage(id, e)} disabled={catUploading === id} />
                {catUploading === id && <p style={{ fontSize: 11, color: "var(--grey-3)" }}>Subiendo…</p>}
                {status.categoryImages?.[id] && (
                  <button onClick={() => removeCategoryImage(id)} className="btn-ghost tracked" style={{ fontSize: 11, marginTop: 4 }}>Sacar foto</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Las categorías que aceptan foto de portada en el Home. No la uso
// CATS de data/config.js a propósito: allá están todas las categorías
// del catálogo (incluido el id "all", que es un filtro, no una
// categoría) y el Home solo tiene estos cinco bloques.
const HOME_CATEGORY_IDS = [
  { id: "hoodies", label: "Hoodies | Buzos" },
  { id: "sweaters", label: "Sweaters" },
  { id: "tees", label: "Remeras" },
  { id: "denim", label: "Denim" },
  { id: "accesorios", label: "Accesorios" },
];

/* ---------------- Carga de productos ---------------- */

/**
 * PRODUCTOSTAB — alta, edición y borrado de prendas.
 *
 * Qué problema resuelve: que el dueño cargue el catálogo sin tocar
 * código. Es la pestaña con más reglas del panel, y casi todas están
 * para lo mismo: que lo que el dueño ve en el formulario sea
 * exactamente lo que queda guardado en Firestore, y que lo que
 * sobre queda no rompa la ficha del producto.
 *
 * Props que recibe: ninguna. Lee /products con useProducts y escribe
 * con addProduct, updateProduct y deleteProduct.
 *
 * Qué escribe: la colección /products, documento por prenda. En
 * producción el navegador es el ÚNICO que escribe ahí (el Worker
 * también, pero con su cuenta de servicio, para bajar stock cuando
 * alguien compra).
 *
 * Disposición: dos columnas. Izquierda el formulario (el que se llena),
 * derecha la tabla del catálogo (el que ya está cargado). Es el mismo
 * criterio que el checkout: escribir a la izquierda, mirar a la
 * derecha.
 */
function ProductosTab() {
  // El catálogo completo, DESACTIVADOS incluidos. Eso es deliberado
  // (ver useProducts): si filtrara los productos ocultos, un producto
  // desactivado desaparecería de esta tabla y no habría forma de
  // volver a encenderlo desde el panel.
  const { products } = useProducts();
  // El formulario entero en un solo objeto. Todos los onChange hacen
  // setForm((f) => ({ ...f, campo: valor })): se cambia un campo por
  // vez reusando el resto.
  const [form, setForm] = useState(EMPTY_FORM);
  // null = estoy creando una prenda. Con el ID = estoy editando esa.
  // El ID vive acá y no dentro del form porque decide qué botón se ve
  // ("Agregar producto" vs. "Guardar cambios") y si se llama update o
  // add.
  const [editingId, setEditingId] = useState(null);
  // Flags de estado visual: subida de fotos en curso, escritura en
  // curso, error a mostrar y el "Guardado ✓" de 1,8 segundos.
  const [uploading, setUploading] = useState(false);
  // Estado aparte para los videos, para que subir un video no muestre
  // "Subiendo…" en el campo de fotos y viceversa.
  const [uploadingVideos, setUploadingVideos] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // Vuelve al formulario vacío. Se llama después de guardar bien y
  // también con el botón "Cancelar" de una edición.
  const resetForm = () => { setForm(EMPTY_FORM); setEditingId(null); };

  // El handler del formulario. Ojo: escribe TODO el documento, no solo
  // lo que cambió. Firestore no tiene "update parcial de campos del
  // panel" que sea seguro: el updateProduct de useProducts sí pisa solo
  // las claves que le mande, y acá le mando el objeto completo ya
  // normalizado.
  const submit = async (e) => {
    e.preventDefault();
    // Freno del doble envío: si el dueño aprieta dos veces (o la
    // compu se queda con el botón apretado), el segundo clic no llega
    // a la base. Sin esto, dos clics crean DOS prendas idénticas.
    if (saving) return;
    setError("");

    // ── Paso 1: normalizar lo que viene del formulario ────────────
    // Acá traduzco texto a las estructuras que la web espera. Todo lo
    // que no se normalice, se guarda crudo y después se rompe lejos de
    // acá, en la ficha del producto.
    const sizeChart = parseSizeChartText(form.sizeChartText);
    // Los talles que tiene sentido para la categoría elegida (los de
    // letra para remeras, los numéricos para denim). Y después filtro
    // los talles que el dueño tildó: si quedó alguno de otra categoría
    // guardado de antes, sale acá en vez de mandarse a Firestore.
    const validSizes = getSizesForCat(form.cat);
    const sizes = (form.sizes || []).filter((s) => validSizes.includes(s));
    // El producto que estoy editando, leído del catálogo en vivo. No
    // del form: me sirve para comparar el nombre (y ver si cambió el
    // slug) y para tener el stock anterior como respaldo.
    const currentProduct = editingId ? products?.find((p) => p.id === editingId) : null;

    if (!currentProduct && editingId) {
      // Caso borde real: el dueño abrió la edición y en otra pestaña
      // (o con otro admin) borra el producto. Sin esta guarda, el
      // update fallaría con un error de Firestore críptico.
      setError("Ese producto ya no existe. Tocá «Cancelar» y cargalo de nuevo.");
      return;
    }

    // El stock que vale es el que está en el formulario. Antes se
    // prefería el del producto ya guardado y por eso al editar un talle
    // que ya tenía unidades, el número nuevo se descartaba en silencio.
    //
    // La regla de precedencia por talle: si el dueño escribió algo en
    // el campo de ese talle (incluso 0), gana lo escrito; si lo dejó
    // en blanco, se conserva el valor que ya estaba guardado; y si no
    // hay ninguno de los dos, 0. El Math.max(0) y el Math.trunc
    // defienden de dos cosas: stock negativo (vendería una prenda
    // imposible) y decimales (que el checkout no puede usar).
    const stock = {};
    for (const s of sizes) {
      const escrito = form.stock?.[s];
      const previo = currentProduct?.stock?.[s];
      const valor = escrito !== undefined && escrito !== null && escrito !== ""
        ? Number(escrito)
        : previo != null
          ? Number(previo)
          : 0;
      stock[s] = Number.isFinite(valor) ? Math.max(0, Math.trunc(valor)) : 0;
    }
    // ── Paso 2: el slug, que es la dirección pública del producto ─────
    // Un slug es la parte de la URL sin letras raras: "Hoodie Concrete"
    // se vuelve "hoodie-concrete" y vive en /producto/hoodie-concrete.
    // Solo se recalcula si el nombre cambió, y siempre contra los slugs
    // de los OTROS productos (por eso filtro el que estoy editando):
    // si no, cada guardado le agregaría un "-2" encima. Si el nombre
    // no cambió, se conserva el slug que ya estaba, así que las URL
    // viejas que la gente tiene compartidas siguen sirviendo.
    const nameChanged = !currentProduct || currentProduct.name !== form.name;
    const otherSlugs = (products || [])
      .filter((p) => p.id !== editingId)
      .map((p) => p.slug);
    const slug = nameChanged || !currentProduct?.slug
      ? uniqueSlug(form.name, otherSlugs)
      : currentProduct.slug;

    // ── Paso 3: los colores, de texto a estructura ─────────────────
    // El dueño escribe "CREAM:#efece2, BLACK:#16161a" (uno por línea o
    // separados por coma). Lo parto por coma o salto de línea, y de cada
    // trozo por ":". Lo que no tenga "#hex" igual se guarda: el nombre
    // va con un gris de relleno, para que la prenda se pueda elegir igual
    // (poder elegir color sin stock real detrás es problema del checkout,
    // no del formulario).
    const colors = (form.colorsText || "")
      .split(/[,\n]/)
      .map((raw) => raw.trim())
      .filter(Boolean)
      .map((raw) => {
        const [name, hex] = raw.split(":").map((v) => (v || "").trim());
        return { name: name || "COLOR", hex: hex || "#cccccc" };
      });

    // ── Paso 4: el documento final ────────────────────────────────
    // El spread del form primero, y después los campos ya normalizados
    // por encima: gana siempre el valor convertido, nunca el texto crudo
    // del input. Numbers con Number() porque un "42000" guardado como
    // texto rompe las comparaciones del Worker (y de cualquier cálculo
    // de precio).
    const data = {
      ...form,
      sizes,
      colors,
      price: Number(form.price),
      weight: Number(form.weight) || 400,
      tone: Number.isFinite(Number(form.tone)) ? Number(form.tone) : 0.7,
      fit: Math.min(1, Math.max(0, Number(form.fit) || 0.5)),
      // sizeChart va como null (no "") si el dueño no la cargó: la ficha
      // usa ese null para mostrar el aviso de "todavía no cargamos una
      // tabla" en vez de una tabla vacía.
      sizeChart: sizeChart || null,
      stock,
      slug,
      // Outlet apagado = sin precio de outlet, para que no quede un
      // string vacío flotando en el documento.
      outletPrice: form.outlet && form.outletPrice !== "" && form.outletPrice != null
        ? Number(form.outletPrice)
        : null,
    };
    // Estas dos SOLO existen en el formulario (son texto para que el
    // dueño lo escriba cómodo) y no van al documento: ya se tradujeron
    // en colors y sizeChart. Si quedaran, la ficha los ignoraría pero
    // el documento engordaría con basura en cada guardado.
    delete data.sizeChartText;
    delete data.colorsText;

    // ── Paso 5: escribir ──────────────────────────────────────────
    setSaving(true);
    try {
      if (editingId) await updateProduct(editingId, data);
      else await addProduct(data);
      // Solo limpio el formulario si la escritura SALIÓ bien. Si fuera
      // al revés, el dueño perdería todo lo que escribió sin guardar
      // nada, y no sabría por qué.
      resetForm();
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      // Antes el error se tragaba solo: el formulario se limpiaba igual y
      // parecía que se había guardado.
      //
      // El caso que más se ve acá es permission-denied: las reglas de
      // firestore.rules no están publicadas. describirErrorFirestore
      // traduce el código de Firestore a un mensaje que dice qué hacer,
      // en vez de mostrar "permission-denied" a secas.
      console.error("No se pudo guardar el producto:", err);
      setError(describirErrorFirestore(err));
    } finally {
      // Siempre, haya salido o no, se vuelve a habilitar el botón.
      setSaving(false);
    }
  };

  /**
   * EDITPRODUCT — cargar un producto del catálogo en el formulario.
   *
   * Qué hace: traduce un documento de /products a los strings que
   * espera el formulario. Es la mitad de la ecuación de la edición: si
   * acá no coinciden los tipos, el formulario queda controlado con
   * valores que React no puede usar.
   */
  const editProduct = (p) => {
    // Todos los campos llegan con un valor concreto: si alguno venía
    // undefined (producto viejo sin tag, sin tone, desactivado...) el
    // <input> pasaba a ser "no controlado" y React lo rompía al
    // guardar. También se filtra `sizes` contra la categoría, que si no
    // dejaba talles que el formulario ignoraba al enviar.
    const validSizes = getSizesForCat(p.cat);
    setForm({
      ...EMPTY_FORM,
      name: p.name || "",
      // Si el producto tiene una categoría que ya no existe en
      // config.js (un producto viejo de una categoría que se borró), el
      // <select> no tendría dónde mostrarlo y se rompería: cae en
      // hoodies. El `??` en price y outletPrice es lo mismo pero para
      // un 0 guardado: 0 es un valor real (gratis), no un vacío.
      cat: CATS.some((c) => c.id === p.cat) ? p.cat : "hoodies",
      price: p.price ?? "",
      weight: Number(p.weight) || 400,
      tag: p.tag || "",
      tone: typeof p.tone === "number" ? p.tone : 0.7,
      colorsText: (p.colors || []).map((c) => `${c.name}:${c.hex}`).join(", "),
      fit: typeof p.fit === "number" ? p.fit : 0.5,
      nrs: !!p.nrs,
      photos: p.photos || [],
      videos: p.videos || [],
      photoColor: p.photoColor || "#292722",
      description: p.description || "",
      composition: p.composition || "",
      sizeChartText: sizeChartToText(p.sizeChart),
      sizes: (p.sizes || []).filter((s) => validSizes.includes(s)),
      outlet: !!p.outlet,
      outletPrice: p.outletPrice ?? "",
      stock: p.stock || {},
      // Sin esto, un producto desactivado aparecía como "activo" en el
      // formulario y no se podía volver a encender.
      active: p.active !== false,
    });
    setEditingId(p.id);
    setError("");
  };

  /**
   * HANDLEFILES — subir las fotos de la prenda que estoy editando.
   *
   * Qué hace: sube los archivos elegidos a Cloudinary y agrega las URLs
   * al array de fotos del formulario. OJO: las fotos NO se guardan en
   * Firestore acá; quedan en el formulario y se escriben recién cuando
   * el dueño aprieta "Agregar producto". Si sube fotos y después se
   * va sin guardar, las imágenes quedan en Cloudinary pero el producto
   * sigue sin ellas.
   *
   * El for es secuencial a propósito (igual que las fotos destacadas):
   * firmar todas las subidas de una vez contra el Worker falla más
   * seguido que hacerlo de a una.
   */
  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const uploadedUrls = [];
      for (const file of files) {
        const url = await uploadToCloudinary(file);
        uploadedUrls.push(url);
      }
      setForm((f) => ({
        ...f,
        photos: [...(f.photos || []), ...uploadedUrls],
      }));
    } catch (error) {
      console.error("Error procesando imagen:", error);
      alert("No se pudo subir una de las imágenes. Verificá la configuración de Cloudinary.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  /**
   * HANDLEVIDEOFILES — subir videos de la prenda.
   *
   * Mismo flujo que handleFiles pero para videos: van a Cloudinary (que
   * guarda video aparte de las fotos) y las URLs quedan en el array
   * `videos` del formulario, que recién se escribe en Firestore cuando
   * el dueño guarda el producto. El input acepta solo video/*, así que
   * no se pueden colar fotos acá.
   */
  const handleVideoFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadingVideos(true);
    try {
      const uploadedUrls = [];
      for (const file of files) {
        const url = await uploadToCloudinary(file);
        uploadedUrls.push(url);
      }
      setForm((f) => ({
        ...f,
        videos: [...(f.videos || []), ...uploadedUrls],
      }));
    } catch (error) {
      console.error("Error procesando video:", error);
      alert(error?.message || "No se pudo subir el video. Verificá la configuración de Cloudinary.");
    } finally {
      setUploadingVideos(false);
      e.target.value = "";
    }
  };

  return (
    // Dos columnas: formulario a la izquierda, catálogo a la derecha.
    // La clase checkout-grid hace que en pantalla angosta (celular)
    // las dos columnas se apilen y el formulario quede arriba.
    <div style={{ display: "grid", gap: 40, gridTemplateColumns: "1fr 1.3fr" }} className="checkout-grid">
      {/* El formulario de alta y de edición. El mismo componente
          para las dos cosas: lo que cambia es el botón de abajo (que
          lee editingId) y qué función se llama (add o update). */}
      <form onSubmit={submit} style={{ border: "1px solid var(--black)", padding: 20, height: "fit-content", display: "grid", gap: 12 }}>
        <p className="tracked" style={{ fontWeight: 700, fontSize: 13 }}>{editingId ? "Editar producto" : "Nuevo producto"}</p>

        {/* El nombre va forzado a mayúsculas en cada tecla: los nombres
            de prenda del catálogo están todos en mayúscula y el slug
            sale de acá. Debajo, la URL en vivo: se calcula con el
            slug del producto guardado si estoy editando, y con
            slugify(nombre) si es nuevo. Ojo: ese slug de abajo es una
            PREVISUALIZACIÓN sin el "-2" que agrega uniqueSlug si el
            nombre choca con otro, así que la URL definitiva puede
            diferir un sufijo. */}
        <Field label="Nombre">
          <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.toUpperCase() }))} placeholder="Ej: HOODIE CONCRETE" />
          {form.name.trim() && (
            <p className="mono" style={{ fontSize: 11, color: "var(--grey-3)", marginTop: 4 }}>
              URL: /producto/{editingId ? (products?.find((p) => p.id === editingId)?.slug || slugify(form.name)) : slugify(form.name)}
            </p>
          )}
        </Field>

        {/* La categoría decide qué talles tiene sentido (letra o
            número). Por eso el onChange compara los dos juegos de
            talles: si cambio de denim a remeras, los talles 38/40/42
            quedan sin sentido, así que los saco y limpio el stock
            para no dejar números colgados de talles que ya no
            existen. Si los juegos son iguales (de hoodies a
            sweaters, por ejemplo), no se toca nada. */}
        <Field label="Categoría">
          <select
            value={form.cat}
            onChange={(e) => {
              const nuevaCat = e.target.value;
              setForm((f) => {
                const tallesViejos = getSizesForCat(f.cat);
                const tallesNuevos = getSizesForCat(nuevaCat);
                if (tallesViejos.join(",") !== tallesNuevos.join(",")) {
                  return { ...f, cat: nuevaCat, sizes: [], stock: {} };
                }
                return { ...f, cat: nuevaCat };
              });
            }}
          >
            {/* Fuera el id "all": es el filtro "mostrar todo" del
                catálogo, no una categoría real, así que no puede ser
                la categoría de un producto. */}
            {CATS.filter((c) => c.id !== "all").map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>

        {/* Precio: en pesos, sin símbolo. Va como texto en el form (el
            input lo controla) y se convierte a número al guardar. */}
        <Field label="Precio">
          <input required type="number" min="0" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="Ej: 42000" />
        </Field>
        {/* El peso se pide en gramos y se usa para cotizar el envío por
            Correo Argentino: no es un dato de la ficha del producto. */}
        <Field label="Peso (gramos) — para cotizar envío por correo">
          <input required type="number" min="1" value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))} placeholder="Ej: 400" />
        </Field>
        {/* El tag es el código interno de la prenda (campaña + número).
            Lo exige required aunque la web no lo muestre: sirve para
            armar el inventario y para saber de qué drop es. */}
        <Field label="Tag (código interno)">
          <input required value={form.tag} onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value }))} placeholder="Ej: SS26 / 13" />
        </Field>
        {/* El tono es el color de la tela sintética que se dibuja donde
            no hay foto. Si sube demasiado (todo claro) o baja mucho
            (todo negro) el <input> no lo deja pasar. */}
        <Field label="Tono de textura (0.5 a 1)">
          <input type="number" step="0.02" min="0.5" max="1" value={form.tone} onChange={(e) => setForm((f) => ({ ...f, tone: e.target.value }))} />
        </Field>

        {/* Fotos. La primera es la que se usa de portada en las grillas
            (y la que se ve tapada en la sección No-Restock). Ojo: acá
            no hay límite de cantidad en el código: si el dueño sube
            diez, se guardan diez. */}
        <Field label="Fotos del producto">
          <input type="file" accept="image/*" multiple onChange={handleFiles} disabled={uploading} />
          {uploading && <p style={{ fontSize: 12, color: "var(--grey-3)" }}>Subiendo…</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {/* La "×" saca la foto SOLO del formulario: el archivo
                sigue en Cloudinary y el documento sigue igual hasta que
                se guarde. type="button" es obligatorio: sin eso, el
                <button> sería submit y mandaría el formulario entero
                al tocar una foto. */}
            {(form.photos || []).map((url, i) => (
              <div key={i} style={{ position: "relative" }}>
                <img src={url} alt="" style={{ width: 60, height: 60, objectFit: "cover", border: "1px solid var(--black)" }} />
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, photos: f.photos.filter((_, idx) => idx !== i) }))}
                  style={{ position: "absolute", top: -6, right: -6, background: "var(--black)", color: "var(--white)", border: "none", borderRadius: "50%", width: 18, height: 18, fontSize: 11, lineHeight: 1, cursor: "pointer" }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </Field>
        {/* Videos (opcional): quedan después de las fotos en la tira de
            miniaturas de la ficha y se ven en el escenario grande con
            controles nativos del navegador. Límite: 100 MB por archivo
            (lo corta Cloudinary) — si pesa más, comprimilo antes. */}
        <Field label="Videos del producto (opcional)">
          <input type="file" accept="video/*" multiple onChange={handleVideoFiles} disabled={uploadingVideos} />
          {uploadingVideos && <p style={{ fontSize: 12, color: "var(--grey-3)" }}>Subiendo video…</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {(form.videos || []).map((url, i) => (
              <div key={i} style={{ position: "relative" }}>
                <video src={url} muted playsInline preload="metadata" style={{ width: 60, height: 60, objectFit: "cover", border: "1px solid var(--black)", display: "block" }} />
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, videos: (f.videos || []).filter((_, idx) => idx !== i) }))}
                  style={{ position: "absolute", top: -6, right: -6, background: "var(--black)", color: "var(--white)", border: "none", borderRadius: "50%", width: 18, height: 18, fontSize: 11, lineHeight: 1, cursor: "pointer" }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </Field>
        {/* Descripción y composición son OPCIONALES de verdad: si quedan
            vacías, esas secciones directamente no se dibujan en la
            ficha (antes se mostraba un texto genérico y se sacó). */}
        <Field label="Descripción (opcional)">
          <textarea
            rows={2}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Ej: Hoodie con capucha forrada."
          />
        </Field>
        <Field label="Composición (opcional)">
          <textarea
            rows={2}
            value={form.composition}
            onChange={(e) => setForm((f) => ({ ...f, composition: e.target.value }))}
            placeholder="Ej: 100% algodón orgánico."
          />
        </Field>
        {/* La tabla de medidas, escrita en texto y traducida por
            parseSizeChartText al guardar. La clase mono es a
            propósito: los datos tienen que alinearse en columnas
            para que se lean los números. */}
        <Field label="Tabla de talles (opcional)">
          <textarea
            rows={4}
            className="mono"
            value={form.sizeChartText}
            onChange={(e) => setForm((f) => ({ ...f, sizeChartText: e.target.value }))}
            placeholder={"Talle, Pecho (cm), Largo (cm)\nS, 94-98, 66\nM, 99-103, 68"}
          />
        </Field>

        {/* TALLES Y STOCK: el bloque que más se usa y el único
            realmente crítico para poder vender.

            Solo se muestran los talles de la categoría (los de letra o
            los numéricos, según getSizesForCat). El checkbox tildado
            marca el talle como EXISTENTE; el número al lado son las
            unidades.

            OJO con el caso que más confunde: tildar un talle sin
            escribir unidades NO lo deja en 0, lo deja undefined
            (el input vacío se guarda como ""). En submit, un talle con
            valor vacío conserva el stock anterior del producto si
            estaba; si es una prenda nueva, se guarda 0. Un talle en
            0 se ve igual en la web pero tachado y sin stock.

            El checkbox real está oculto con display:none (el <label>
            hace de botón), y el input de stock se deshabilita si el
            talle no está tildado. */}
        <Field label="Talles y stock">
          <div style={{ display: "grid", gap: 8 }}>
            {getSizesForCat(form.cat).map((s) => {
              const checked = (form.sizes || []).includes(s);
              return (
                <div key={s} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, border: "1px solid var(--black)", padding: "6px 10px", cursor: "pointer", background: checked ? "var(--black)" : "none", color: checked ? "var(--white)" : "var(--black)", width: 70, justifyContent: "center" }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setForm((f) => {
                          const current = f.sizes || [];
                          const sizes = e.target.checked ? [...current, s] : current.filter((x) => x !== s);
                          return { ...f, sizes };
                        });
                      }}
                      style={{ display: "none" }}
                    />
                    {s}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    disabled={!checked}
                    value={form.stock?.[s] ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setForm((f) => ({ ...f, stock: { ...f.stock, [s]: val === "" ? "" : Number(val) } }));
                    }}
                    placeholder="0"
                    style={{ width: 80, opacity: checked ? 1 : 0.4, border: "1px solid var(--black)", padding: "6px 10px", fontSize: 13 }}
                  />
                  <span style={{ fontSize: 11.5, color: "var(--grey-3)" }}>unidades</span>
                </div>
              );
            })}
          </div>
        </Field>
        {/* Colores: un input de texto, no un selector de color, porque lo que
            importa es el PAR nombre:#hex y no un swatch (el # es el
            color; lo usa el selector de la ficha para pintar la
            muestra del color). Un texto mal formado no rompe el
            guardado: se guarda con el gris de relleno. */}
        <Field label="Colores (opcional)">
          <input
            value={form.colorsText}
            onChange={(e) => setForm((f) => ({ ...f, colorsText: e.target.value }))}
            placeholder="CREAM:#efece2, BLACK:#16161a"
          />
        </Field>
        {/* El calce es un número, no un texto: 0 = al cuerpo, 1 = holgado.
            La ficha lo usa para el texto de calce y para cuánto se
            "ensancha" la prenda en la silueta. */}
        <Field label="Calce (0 = slim, 0.5 = true to size, 1 = baggy)">
          <input
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={form.fit}
            onChange={(e) => setForm((f) => ({ ...f, fit: e.target.value }))}
          />
        </Field>

        {/* Los tres checkboxes finales: el drop único, la visibilidad
            y el outlet. Los tres son booleanos que van al documento
            tal cual. */}
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={form.nrs} onChange={(e) => setForm((f) => ({ ...f, nrs: e.target.checked }))} />
          Es No-Reastock (drop único)
        </label>
        {/* `form.active !== false` y no `form.active`: un producto viejo
            sin el campo (o con false) tiene que verse como NO activo,
            y con el && simple se vería activo por defecto. */}
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={form.active !== false} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
          Activo / visible en la web
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={form.outlet} onChange={(e) => setForm((f) => ({ ...f, outlet: e.target.checked }))} />
          Incluir en Outlet
        </label>
        {/* El precio de outlet solo aparece si el producto está marcado
            como outlet. Si queda tildado el outlet y vacío el precio, al
            guardar se manda outletPrice: null (ver el submit): el
            producto aparece en Outlet pero a precio de catálogo, que es
            raro. Conviene cargar el precio. */}
        {form.outlet && (
          <Field label="Precio de outlet">
            <input type="number" min="0" value={form.outletPrice} onChange={(e) => setForm((f) => ({ ...f, outletPrice: e.target.value }))} placeholder="Ej: 28000" />
          </Field>
        )}
        {/* El error va arriba de los botones, no abajo: si el guardado
            falló, el mensaje tiene que verse sin tener que pasar por
            encima del botón. */}
        {error && (
          <p style={{ margin: 0, padding: "10px 12px", border: "1px solid var(--accent)", color: "var(--accent)", fontSize: 12.5, lineHeight: 1.5 }}>
            {error}
          </p>
        )}
        {/* El botón de guardar también se deshabilita mientras hay
            fotos subiendo: si el dueño guarda con fotos a medio subir,
            las que faltaban no entran. */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="submit" disabled={saving || uploading} className="btn-primary tracked">
            {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Agregar producto"}
          </button>
          {/* "Cancelar" solo existe editando: es el que vuelve al
              formulario vacío sin guardar nada. */}
          {editingId && <button type="button" onClick={resetForm} disabled={saving} className="btn-ghost tracked">Cancelar</button>}
          {saved && <span style={{ fontSize: 12.5, color: "green", fontWeight: 700 }}>Guardado ✓</span>}
        </div>
      </form>

      {/* La columna derecha: el catálogo ya cargado, en vivo. La tabla
          incluye los productos desactivados (atenuados con opacity y
          con "No" en rojo en la columna Activo): si no, apagar un
          producto sería borrarlo de la vista del panel.
          products?.length ?? 0 y el (products || []) son por el mismo
          motivo: mientras la lista es null (cargando) esto dibuja
          "0 productos" y una tabla vacía en vez de romper. */}
      <div>
        <p className="tracked" style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
          Catálogo actual ({products?.length ?? 0})
          {products && products.some((p) => p.active === false) && (
            <span style={{ fontWeight: 400, color: "var(--grey-3)" }}> — los que están en "No" no se ven en la web, pero podés volver a activarlos acá</span>
          )}
        </p>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Nombre</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>NRS</th><th>Activo</th><th></th>
            </tr>
          </thead>
          <tbody>
            {(products || []).map((p) => (
              <tr key={p.id} style={{ opacity: p.active === false ? 0.5 : 1 }}>
                <td>{p.name}</td>
                {/* La categoría se muestra cruda (el id, no el label):
                    es más corto y el dueño ya sabe qué es "denim". */}
                <td>{p.cat}</td>
                <td className="mono">{fmt(p.price)}</td>
                {/* El stock se aplana a texto "S:3 M:0": en una celda de
                    tabla, un objeto no sirve. Un producto sin talles
                    muestra el guion, que es la señal de "esto no se
                    puede comprar todavía". */}
                <td className="mono">
                  {p.stock && Object.keys(p.stock).length > 0
                    ? Object.entries(p.stock).map(([s, qty]) => `${s}:${qty}`).join(" ")
                    : "—"}
                </td>
                <td>{p.nrs ? "Sí" : "—"}</td>
                <td style={{ color: p.active === false ? "var(--accent)" : "green", fontWeight: 700 }}>
                  {p.active === false ? "No" : "Sí"}
                </td>
                <td style={{ display: "flex", gap: 10 }}>
                  {/* Editar carga el producto en el formulario de la
                      izquierda y pone editingId: no navega a otra
                      pantalla. */}
                  <button onClick={() => editProduct(p)} style={linkBtn}>Editar</button>
                  {/* Borrar es irreversible (no hay papelera) y además
                      tira abajo el histórico de stock de esa prenda,
                      así que pide confirmación con el nombre del
                      producto en el mensaje. Para ocultar algo del
                      público sin romper datos, la alternativa es
                      destildar "Activo". */}
                  <button
                    onClick={async () => {
                      if (!window.confirm(`¿Seguro que querés eliminar el producto "${p.name}"?`)) return;
                      try {
                        await deleteProduct(p.id);
                      } catch (err) {
                        console.error(err);
                        window.alert(describirErrorFirestore(err));
                      }
                    }}
                    style={{ ...linkBtn, color: "var(--accent)" }}
                  >
                    Borrar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {products && products.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--grey-3)" }}>Todavía no cargaste ningún producto.</p>
        )}
      </div>
    </div>
  );
}

/**
 * Traduce los errores de Firestore a algo que se entienda en la pantalla.
 *
 * Qué problema resuelve: los errores del SDK de Firestore llegan como
 * códigos crípticos ("FirebaseError: permission-denied"). Al dueño no
 * le sirven: necesita saber QUÉ hacer. Y hay un caso que se lleva casi
 * todos los.errores de un panel nuevo: permission-denied casi siempre
 * significa que firestore.rules todavía no está publicado en la consola
 * de Firebase, no que el código esté mal.
 *
 * Ojo: esto traduce el mensaje, no reintenta. Si el error es de red
 * (unavailable / deadline-exceeded) el mensaje dice explícitamente que
 * no se guardó nada, para que el dueño sepa que puede reintentar sin
 * duplicar.
 */
function describirErrorFirestore(err) {
  const code = err?.code || "";
  if (code === "permission-denied") {
    return "Firebase no te dejó guardar. Es casi seguro que las reglas de la base no estén publicadas: andá a Firestore > Reglas y pegá el contenido de firestore.rules del proyecto.";
  }
  if (code === "unavailable" || code === "deadline-exceeded") {
    return "No se pudo conectar con Firebase. Revisá la conexión y probá de nuevo (no se guardó nada).";
  }
  return err?.message
    ? `No se pudo guardar: ${err.message}`
    : "No se pudo guardar el producto. Probá de nuevo.";
}

/* ---------------- Cupones de descuento ---------------- */

// Los defaults del formulario de cupón. Ojo: el código NO va dentro
// del objeto que se guarda, porque ES el ID del documento: se usa
// para armar doc(db, "coupons", "INSTA10"). Si el código estuviera
// también adentro, habría dos fuentes de verdad para lo mismo.
const EMPTY_COUPON = { code: "", type: "percent", value: "", maxUses: "", scope: "all", scopeCategory: "hoodies", scopeProductIds: [] };

/**
 * CUPONESTAB — crear, pausar y borrar cupones de descuento.
 *
 * Qué es un cupón acá: un documento en /coupons cuyo ID es el código
 * que escribe el cliente, con un tipo (porcentaje o monto fijo), un
 * valor, un límite de usos y a qué alcanza el descuento.
 *
 * Props que recibe: ninguna. Lee con useCoupons y useProducts (para
 * poder elegir productos puntuales) y escribe con saveCoupon y
 * deleteCoupon.
 *
 * Qué escribe: /coupons. OJO con el contador de usos (usedCount): este
 * panel NUNCA lo escribe. Lo incrementa el Cloudflare Worker cuando
 * confirma un pedido, dentro de la misma operación atómica que descuenta
 * el stock. Por eso el panel no puede "gastar" un uso, y por eso dos
 * clientes escribiendo el mismo cupón a la vez no pueden agotarlo de
 * más. El panel solo lo muestra.
 */
function CuponesTab() {
  const { coupons } = useCoupons();
  // Los productos, solo para la lista de "productos específicos".
  const { products } = useProducts();
  const [form, setForm] = useState(EMPTY_COUPON);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    // Guarda silenciosamente si falta el código o el valor. Es la
    // validación más básica y la pone el `required` del input; el
    // chequeo extra cubre el caso de pulsar Enter con el formulario
    // en un estado raro. Ojo: no avisa nada al usuario.
    if (!form.code.trim() || !form.value) return;
    setSaving(true);
    // Notar que no hay try/catch: si el guardado falla, el panel queda
    // con saving en false por el finally... no, en realidad NO hay
    // finally acá, así que un fallo deja el botón en "Guardando..."
    // para siempre. Es un agujero real de esta pestaña (el hermano
    // de productos sí lo maneja); queda anotado en el informe, no lo
    // toqué.
    await saveCoupon(form.code, { ...form, active: true });
    setForm(EMPTY_COUPON);
    setSaving(false);
  };

  // Pausar y reanudar un cupón existente. Se re-manda el cupón entero
  // (saveCoupon hace merge) con el active invertido: pausado NO es
  // borrado, así que el contador de usos y la fecha de creación quedan
  // intactos y se puede volver a activar sin perder el historial.
  const toggleActive = (c) => saveCoupon(c.code, { ...c, active: !c.active });

  // Traduce el alcance del cupón a una frase para la tabla. Los tres
  // casos del select de arriba, en una línea cada uno.
  const scopeLabel = (c) => {
    if (c.scope === "category") return `Solo "${CATS.find((x) => x.id === c.scopeCategory)?.label || c.scopeCategory}"`;
    if (c.scope === "products") return `${(c.scopeProductIds || []).length} producto(s) puntuales`;
    return "Todo el pedido";
  };

  return (
    // Misma grilla que Productos: se escribe a la izquierda, se
    // revisa lo que ya hay a la derecha.
    <div style={{ display: "grid", gap: 40, gridTemplateColumns: "1fr 1.3fr" }} className="checkout-grid">
      <form onSubmit={submit} style={{ border: "1px solid var(--black)", padding: 20, height: "fit-content", display: "grid", gap: 12 }}>
        <p className="tracked" style={{ fontWeight: 700, fontSize: 13 }}>Nuevo cupón</p>
        {/* El código va forzado a mayúsculas: el cliente lo va a
            escribir en el celular, en minúscula o con mayúscula
            mezclada, y el checkout normaliza a mayúsculas para
            comparar. Verlo siempre en mayúscula en el panel evita
            sorpresas. */}
        <Field label="Código (lo que va a escribir el cliente)">
          <input required value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="Ej: INSTA10" />
        </Field>
        {/* El tipo decide cómo se interpreta el valor de abajo: 10 es
            "10%" o "10 pesos". El valor va como texto en el form y se
            convierte a número en saveCoupon. */}
        <Field label="Tipo de descuento">
          <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
            <option value="percent">Porcentaje (%)</option>
            <option value="fixed">Monto fijo ($)</option>
          </select>
        </Field>
        <Field label={form.type === "percent" ? "Valor (ej: 10 = 10%)" : "Valor en pesos (ej: 1000)"}>
          <input required type="number" min="0" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
        </Field>
        {/* maxUses vacío = sin límite: se guarda como null, no como 0.
            Con 0 el cupón no se podría usar nunca. */}
        <Field label="Límite de usos (vacío = sin límite)">
          <input type="number" min="1" value={form.maxUses} onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))} placeholder="Sin límite" />
        </Field>
        <Field label="A qué aplica el descuento">
          <select value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}>
            <option value="all">Todo el pedido</option>
            <option value="category">Una categoría</option>
            <option value="products">Productos específicos</option>
          </select>
        </Field>
        {form.scope === "category" && (
          <Field label="Categoría">
            <select value={form.scopeCategory} onChange={(e) => setForm((f) => ({ ...f, scopeCategory: e.target.value }))}>
              {CATS.filter((c) => c.id !== "all").map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>
        )}
        {form.scope === "products" && (
          <Field label="Elegí los productos">
            <div style={{ display: "grid", gap: 6, maxHeight: 220, overflowY: "auto", border: "1px solid var(--grey-1)", padding: 10 }}>
              {(products || []).map((p) => {
                const checked = (form.scopeProductIds || []).includes(p.id);
                return (
                  <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setForm((f) => {
                          const current = f.scopeProductIds || [];
                          const scopeProductIds = e.target.checked ? [...current, p.id] : current.filter((x) => x !== p.id);
                          return { ...f, scopeProductIds };
                        });
                      }}
                    />
                    {p.name} <span className="mono" style={{ color: "var(--grey-3)" }}>({fmt(p.price)})</span>
                  </label>
                );
              })}
            </div>
          </Field>
        )}
        <button type="submit" disabled={saving} className="btn-primary tracked">{saving ? "Guardando..." : "Crear cupón"}</button>
      </form>

      <div>
        <p className="tracked" style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Cupones cargados ({coupons?.length ?? 0})</p>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Código</th><th>Descuento</th><th>Aplica a</th><th>Usos</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {(coupons || []).map((c) => (
              <tr key={c.code}>
                <td className="mono">{c.code}</td>
                <td>{c.type === "percent" ? `${c.value}%` : fmt(c.value)}</td>
                <td style={{ fontSize: 12 }}>{scopeLabel(c)}</td>
                <td className="mono">{c.usedCount || 0}{c.maxUses != null ? ` / ${c.maxUses}` : " / ∞"}</td>
                <td style={{ color: c.active ? "green" : "var(--accent)" }}>{c.active ? "Activo" : "Pausado"}</td>
                <td style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => toggleActive(c)} style={linkBtn}>{c.active ? "Pausar" : "Activar"}</button>
                  <button
                    onClick={() => {
                      if (window.confirm(`¿Seguro que querés borrar el cupón "${c.code}"?`)) {
                        deleteCoupon(c.code);
                      }
                    }}
                    style={{ ...linkBtn, color: "var(--accent)" }}
                  >
                    Borrar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {coupons && coupons.length === 0 && <p style={{ fontSize: 13, color: "var(--grey-3)" }}>Todavía no cargaste ningún cupón.</p>}
      </div>
    </div>
  );
}

/* ---------------- Gift cards ----------------
   A diferencia del cupón, acá el saldo se descuenta SOLO en el servidor
   (el Worker lo baja dentro del commit que crea el pedido). Esta pantalla
   crea y pausa tarjetas, y muestra cuánto queda de cada una. */
const EMPTY_GIFT_CARD = { balance: "", active: true };

function GiftCardsTab() {
  const { giftCards } = useGiftCards();
  const [form, setForm] = useState(EMPTY_GIFT_CARD);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const balance = redondearMontoGiftCard(form.balance);
    if (!balance) return;
    setSaving(true);
    try {
      // El código lo genera el panel (SKUL-XXXXXX) y se comprueba que no
      // exista: es el ID del documento.
      await createGiftCard({ balance, active: form.active });
      setForm(EMPTY_GIFT_CARD);
    } catch (err) {
      console.error(err);
      window.alert(err?.message || "No se pudo crear la gift card.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = (g) => saveGiftCard(g.code, { balance: g.balance, active: !g.active });

  return (
    <div style={{ display: "grid", gap: 40, gridTemplateColumns: "1fr 1.3fr" }} className="checkout-grid">
      <form onSubmit={submit} style={{ border: "1px solid var(--black)", padding: 20, height: "fit-content", display: "grid", gap: 12 }}>
        <p className="tracked" style={{ fontWeight: 700, fontSize: 13 }}>Nueva gift card</p>
        <Field label={`Monto (entre ${fmt(GIFT_CARD_MIN)} y ${fmt(GIFT_CARD_MAX)})`}>
          <input
            required
            type="number"
            min={GIFT_CARD_MIN}
            max={GIFT_CARD_MAX}
            step={1}
            value={form.balance}
            onChange={(e) => setForm((f) => ({ ...f, balance: e.target.value }))}
            placeholder="Ej: 20000"
          />
        </Field>
        <Field label="Código (se genera solo)">
          <input value="SKUL-XXXXXX" readOnly disabled className="mono" />
        </Field>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
          Activa
        </label>
        <p style={{ fontSize: 12, color: "var(--grey-3)", margin: 0 }}>
          El código vence a los 6 meses de crearse y se puede usar varias veces: lo que queda
          se sigue descontando en los próximos pedidos.
        </p>
        <button type="submit" disabled={saving} className="btn-primary tracked">{saving ? "Guardando..." : "Crear gift card"}</button>
      </form>

      <div>
        <p className="tracked" style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Gift cards cargadas ({giftCards?.length ?? 0})</p>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Código</th><th>Saldo</th><th>Usado</th><th>Queda</th><th>Vence</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {(giftCards || []).map((g) => (
              <tr key={g.code}>
                <td className="mono">{g.code}</td>
                <td className="mono">{fmt(g.balance)}</td>
                <td className="mono">{fmt(g.usedAmount || 0)}</td>
                <td className="mono">{fmt(saldoGiftCard(g))}</td>
                <td style={{ fontSize: 12 }}>{textoVencimiento(g)}</td>
                <td style={{ color: g.active ? "green" : "var(--accent)" }}>{g.active ? "Activa" : "Pausada"}</td>
                <td style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => toggleActive(g)} style={linkBtn}>{g.active ? "Pausar" : "Activar"}</button>
                  <button
                    onClick={() => {
                      if (window.confirm(`¿Seguro que querés borrar la gift card "${g.code}"?`)) {
                        deleteGiftCard(g.code);
                      }
                    }}
                    style={{ ...linkBtn, color: "var(--accent)" }}
                  >
                    Borrar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {giftCards && giftCards.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--grey-3)" }}>
            Todavía no creaste ninguna gift card. También podés venderlas desde el sitio, en la página Gift Cards.
          </p>
        )}
      </div>
    </div>
  );
}

function SuscriptoresTab() {
  const { subscribers } = useSubscribers();
  const [copiado, setCopiado] = useState(false);

  const baja = async (s) => {
    if (!window.confirm(`¿Dar de baja a ${s.email}?\n\nVa a dejar de recibir novedades.`)) return;
    try {
      await deleteSubscriber(s.id);
    } catch (err) {
      console.error(err);
      window.alert("No se pudo dar de baja.");
    }
  };

  // Copia los correos separados por coma, para pegarlos directo en el
  // campo "Para" de un mail. navigator.clipboard solo funciona en
  // https (o localhost), así que hay un plan B con un textarea.
  const copiarCorreos = async () => {
    const lista = (subscribers || []).map((s) => s.email).join(", ");
    if (!lista) return;

    try {
      await navigator.clipboard.writeText(lista);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = lista;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }

    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 2000);
  };

  const descargarCSV = () => {
    // Con el BOM al principio para que Excel abra bien los acentos.
    const filas = [
      ["email", "consentimiento", "origen", "fecha"],
      ...(subscribers || []).map((s) => [
        s.email,
        s.consent ? "sí" : "no",
        s.source || "",
        s.createdAt?.toDate ? s.createdAt.toDate().toLocaleString("es-AR") : "",
      ]),
    ];
    const csv = filas
      .map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");

    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `suscriptores-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: "grid", gap: 22 }}>
      <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--grey-2)", margin: 0 }}>
        Estas son las personas que dieron consentimiento para recibir novedades por mail. Solo se guarda
        el correo, la fecha y de qué parte del sitio se suscribieron. No hay datos de pedidos ni de pagos acá.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <p className="tracked" style={{ fontWeight: 700, fontSize: 13, margin: 0 }}>
          Suscriptores ({subscribers?.length ?? "…"})
        </p>
        <button onClick={descargarCSV} disabled={!subscribers?.length} className="btn-ghost tracked" style={{ padding: "8px 14px", fontSize: 11 }}>
          Descargar CSV
        </button>
        <button onClick={copiarCorreos} disabled={!subscribers?.length} className="btn-ghost tracked" style={{ padding: "8px 14px", fontSize: 11 }}>
          {copiado ? "¡Copiados!" : "Copiar correos"}
        </button>
      </div>

      {subscribers === null && <p style={{ fontSize: 13, color: "var(--grey-3)" }}>Cargando…</p>}

      {subscribers !== null && subscribers.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Correo</th><th>Origen</th><th>Fecha</th><th></th>
            </tr>
          </thead>
          <tbody>
            {subscribers.map((s) => (
              <tr key={s.id}>
                <td className="mono" style={{ fontSize: 12.5 }}>{s.email}</td>
                <td style={{ fontSize: 12 }}>{s.source === "footer" ? "Pie de página" : s.source}</td>
                <td className="mono" style={{ fontSize: 12 }}>
                  {s.createdAt?.toDate ? s.createdAt.toDate().toLocaleDateString("es-AR") : "—"}
                </td>
                <td style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => baja(s)} style={{ ...linkBtn, color: "var(--accent)" }}>
                    Dar de baja
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {subscribers !== null && subscribers.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--grey-3)" }}>
          Todavía no se suscribió nadie. Los correos que dejen en el pie de página aparecen acá.
        </p>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span className="tracked" style={{ fontSize: 10.5, fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  );
}

const linkBtn = { background: "none", border: "none", textDecoration: "underline", fontSize: 12.5, padding: 0 };