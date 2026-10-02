/**
 * CONFIG — todo lo que es "dato de la tienda" y no código: los contactos, los
 * datos para cobrar, las categorías, los talles y las reglas de gift cards.
 *
 * Qué problema resuelve: juntar esos datos en un solo archivo, con nombres claros,
 * en vez de buscarlos metidos en el medio de cada pantalla. Cuando cambiás el
 * WhatsApp, el CBU o el nombre de una categoría, lo cambiás UNA vez acá.
 *
 * Qué exporta: constantes sueltas (nada de funciones salvo getSizesForCat) que
 * importan casi todas las páginas, componentes y hooks.
 *
 * La regla de oro del archivo: acá SOLO van valores públicos. Cualquier cosa
 * escrita acá termina en el JavaScript que descarga el visitante, así que ni
 * tokens, ni contraseñas, ni credenciales de MiCorreo —para eso está el
 * Cloudflare Worker, que guarda sus secretos aparte.
 */

// Contactos. El número va sin +, sin espacios (formato internacional, como lo
// quiere wa.me) y es el que arman los links de WhatsApp en Header, Footer,
// Contacto y Gracias: si lo cambiás, cambia en todos lados a la vez.
export const WHATSAPP_NUMBER = "5492358412562"; // EDITAR ACÁ
// Instagram va SOLO con el usuario (sin la @ y sin https): cada pantalla se
// encarga de armar el https://instagram.com/... completo.
export const INSTAGRAM_HANDLE = "_skul.lt"; // EDITAR ACÁ
// Mail de contacto. Lo muestran Footer, Contacto y los textos legales.
export const CONTACT_EMAIL = "skul.tienda@gmail.com"; // EDITAR ACÁ

/* ============================================================
   NOTIFICACIÓN DE PEDIDOS POR TELEGRAM
   ------------------------------------------------------------
   IMPORTANTE: el token del bot de Telegram NO va más acá, porque
   cualquier cosa puesta en este archivo termina viajando al
   navegador de cada visitante (es código de cliente, no secreto).
   Antes estaba hardcodeado acá y quedó expuesto en el build — hay
   que revocarlo en @BotFather y generar uno nuevo.

   El envío del mensaje ahora lo hace un Cloudflare Worker aparte
   (gratis, sin tarjeta) que guarda el token de forma privada.
   Instrucciones completas en /cloudflare-worker/README.md.

   Una vez deployado el Worker, pegá acá la URL que te da Cloudflare
   (algo como "https://skul-notify.tu-usuario.workers.dev").
   Si lo dejás vacío, el pedido se guarda igual pero no llega el
   aviso por Telegram (no rompe el checkout).
   ============================================================ */
// Esta URL es lo único que separa "el pedido me avisa por Telegram" de "el
// pedido se guarda y yo me entero revisando el panel": si queda vacía, el
// checkout sigue funcionando igual, solo no suena el aviso.
export const ORDER_NOTIFY_WORKER_URL = "https://cloudflare-worker.skullt.workers.dev"; // EDITAR ACÁ — URL del Cloudflare Worker

// Datos para cobrar por transferencia. Los usa la pantalla de Gracias (la caja
// con alias/CVU/titular/CUIT que ve el cliente después de comprar) y los textos
// legales. OJO: acá el sitio SOLO los muestra —no hay nada que los valide— así
// que si te equivocás en el CBU o el CUIT, el comprobante va a caer en otra
// cuenta y hay que arreglarlo a mano.
export const CVU_DATA = {
  alias: "juli.gu.mp",
  cvu: "0000003100037567360757",
  titular: "Julian Gualberto",
  cuit: "20-47159406-8",
}; // EDITAR ACÁ

// Zonas de envío con PRECIO FIJO. Cada zona es una opción del checkout con su
// costo (`price`: 0 = retiro en el local, sin envío).
export const ZONES = [
  { id: "local", name: "Retiro en Los Toldos", price: 0 },
];
// Las demás zonas ahora se cotizan en vivo con la API de Correo
// Argentino (ver /utils/correo.js), en vez de precios fijos acá.

/* ============================================================
   ENVÍOS POR CORREO ARGENTINO (API MiCorreo)
   ------------------------------------------------------------
   El usuario/contraseña de MiCorreo NUNCA van acá (ni en ningún
   archivo del sitio): viven como variables privadas del
   Cloudflare Worker. Acá solo va lo que es público.
   ============================================================ */
// Provincias que acepta el envío por Correo Argentino. Cada código es el que
// espera la API de MiCorreo (no es el número de provincia: por ejemplo "C" es
// CABA), así que hay que respetarlos tal cual. La usa el buscador de envíos del
// checkout para filtrar las sucursales disponibles.
export const CORREO_PROVINCES = [
  { code: "A", name: "Salta" },
  { code: "B", name: "Buenos Aires" },
  { code: "C", name: "Ciudad Autónoma de Buenos Aires" },
  { code: "D", name: "San Luis" },
  { code: "E", name: "Entre Ríos" },
  { code: "F", name: "La Rioja" },
  { code: "G", name: "Santiago del Estero" },
  { code: "H", name: "Chaco" },
  { code: "J", name: "San Juan" },
  { code: "K", name: "Catamarca" },
  { code: "L", name: "La Pampa" },
  { code: "M", name: "Mendoza" },
  { code: "N", name: "Misiones" },
  { code: "P", name: "Formosa" },
  { code: "Q", name: "Neuquén" },
  { code: "R", name: "Río Negro" },
  { code: "S", name: "Santa Fe" },
  { code: "T", name: "Tucumán" },
  { code: "U", name: "Chubut" },
  { code: "V", name: "Tierra del Fuego" },
  { code: "W", name: "Corrientes" },
  { code: "X", name: "Córdoba" },
  { code: "Y", name: "Jujuy" },
  { code: "Z", name: "Santa Cruz" },
];

// Categorías del catálogo. El `id` es el que se guarda en cada producto (`cat`)
// y el `label` es el texto que ve el visitante en las pestañas. Ojo con el id
// "all": no es una categoría real, es el "mostrar todo" que usa el filtro.
export const CATS = [
  { id: "all", label: "Todo" },
  { id: "hoodies", label: "Hoodies" },
  { id: "sweaters", label: "Sweaters" },
  { id: "tees", label: "Shirts" },
  { id: "denim", label: "Denim" },
  {id: "joggings", label: "Joggings"},
  {id: "bermudas", label: "Bermudas"},
  {id: "accesorios", label: "Accesorios"},
];

// Talles con letra, para remeras y abrigos. "UNICO" es el pseudo-talle de lo que
// no tiene talles (por ejemplo la Utility Vest).
export const SIZES = ["S", "M", "L", "XL", "UNICO"];
// Talles con número, para denim, bermudas y joggings.
export const SIZES_NUMERIC = ["38", "40", "42", "44", "46", "48"];

/* ============================================================
   GIFT CARDS
   ------------------------------------------------------------
   Son saldo con código, no un uso único: se pueden usar varias
   veces y lo que queda se sigue descontando.

   OJO: estas constantes están duplicadas a propósito en
   cloudflare-worker/worker.js (el Worker se despliega solo y no
   puede importar nada del sitio). El Worker es el que VALIDA
   los montos y el saldo al crear el pedido, así que si cambiás
   algo acá, cambialo también allá.
   ============================================================ */
// Prefijo y largo del código. El Worker genera el sufijo, pero el checkout
// también valida el formato, así que el patrón SKUL-XXXXXX tiene que coincidir
// en los dos lados.
export const GIFT_CARD_PREFIJO = "SKUL-";
export const GIFT_CARD_SUFIJO_LEN = 6;
// Sin I, O, 0 ni 1: son los caracteres que la gente confunde entre sí
// cuando copia el código a mano.
export const GIFT_CARD_ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
// Piso y techo de una gift card, en pesos. El panel los usa para no dejar
// cargar montos fuera de rango y el Worker los vuelve a validar al cobrar.
export const GIFT_CARD_MIN = 1000;
export const GIFT_CARD_MAX = 100000;
// Vigencia en meses, contada desde createdAt del documento.
export const GIFT_CARD_MESES = 6; // válida 6 meses desde que se creó
// Montos que se ofrecen en la página pública de gift cards.
export const GIFT_CARD_MONTOS = [10000, 20000, 30000, 50000, 75000, 100000];
// Id reservado del carrito para la gift card que se COMPRA (no la que se
// usa). Tiene que coincidir con ITEM_GIFT_CARD del Worker.
// OJO: el nombre/id no son un producto real, no está en el catálogo. Si el
// nombre no coincide con el del Worker, el pedido se guarda sin la gift card
// y el comprador nunca recibe el código.
export const GIFT_CARD_ITEM_ID = "giftcard";
export const GIFT_CARD_ITEM_NOMBRE = "Gift Card SKUL";

/**
 * Devuelve el set de talles que corresponde según la categoría del producto:
 * los de cintura (denim, bermudas, joggings) van con número, el resto con letra.
 *
 * Para qué existe: el panel la usa para mostrar en el formulario de alta
 * solamente los talles que tiene sentido ofrecer, y la ficha para no proponer un
 * "S" en un pantalón. Si agregás una categoría nueva de ropa con talles,
 * decidí acá en qué grupo cae.
 */
export function getSizesForCat(cat) {
  return cat === "denim" || cat === "bermudas"  || cat === "joggings" ? SIZES_NUMERIC : SIZES;
}

/* ============================================================
   FOTOS DE PRODUCTO (Cloudinary)
   ------------------------------------------------------------
   Las fotos que subís en /admin se guardan en Cloudinary (plan
   gratis, sin tarjeta) en vez de guardarse como texto adentro de
   Firestore. Así el catálogo carga mucho más rápido y no hay
   riesgo de pasarte el límite de tamaño de un documento.

   Instrucciones para conseguir estos dos valores (2 minutos, sin
   tarjeta): ver /cloudinary/README.md.
   ============================================================ */
// Nombre de tu cuenta en Cloudinary (sale del dashboard, arriba a la izquierda).
// Va en la URL de cada foto guardada en Firestore; si lo cambiás, las fotos ya
// subidas dejan de verse.
export const CLOUDINARY_CLOUD_NAME = "xxf6yf3p"; // EDITAR ACÁ — ej "dxyz1234a"
// La subida ahora es FIRMA (signed upload): el navegador le pide la firma
// al Cloudflare Worker y sube directo a Cloudinary. El API secret nunca
// queda en el cliente, así que ya no hace falta un "upload preset"
// abierto (que lo podía usar cualquiera).
// La api_key es pública por diseño y la devuelve el Worker al confirmar
// que sos el admin; queda vacía para usar esa.
// O sea: dejarlo vacío es lo correcto mientras uses la subida firmada — el
// navegador arma la firma con lo que le devuelve el Worker, así que no necesita
// la api_key. Lo que sí tiene que estar completo es el CLOUD_NAME de arriba:
// sin eso, /admin tira "Falta configurar Cloudinary" al subir una foto.
export const CLOUDINARY_CLOUD_API_KEY = "";
