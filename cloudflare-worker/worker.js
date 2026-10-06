/**
 * ============================================================================
 * OJO — VARIANTE: ¿ESTE ARCHIVO O `worker.js`? LEÉ ESTO PRIMERO
 * ============================================================================
 *
 * Qué es una variante acá: este archivo y `worker.js` (que está en esta misma
 * carpeta) son DOS versiones del mismo Worker. Salieron del mismo origen y
 * los dos andan, pero NO son iguales: uno quedó desactualizado. No son
 * "el nuevo y el viejo" en el sentido de que uno sea el otro con cambios: son
 * dos ramas que se fueron tocando por separado.
 *
 * Mi conclusión, después de comparar los dos archivos línea por línea, es que
 * EL VIGENTE ES `worker.js`, NO este. Las tres pruebas:
 *
 *   1) `wrangler.jsonc` (el archivo que dice qué se despliega) tiene
 *      `"main": "worker.js"`. Si hacés `wrangler deploy`, se sube `worker.js`.
 *   2) El README de esta carpeta, en el paso donde te dice qué pegar en el
 *      editor de Cloudflare, dice "pegá el contenido del archivo `worker.js`".
 *   3) El sitio (el frontend) YA LLAMA a una función que acá no existe: en
 *      src/pages/Legal.jsx el botón de arrepentimiento manda
 *      `{ action: "notify", tipo: "arrepentimiento", data: {...} }`.
 *      Esta variante ignora `tipo`, así que cae en la rama de pedidos,
 *      responde "Falta orderId" y el aviso legal nunca llega a Telegram.
 *
 * ---------------------------------------------------------------------------
 * LAS DIFERENCIAS REALES (lo único que NO es idéntico entre los dos)
 * ---------------------------------------------------------------------------
 * Todas van en el sentido de que `worker.js` tiene MÁS cosas. Este archivo es,
 * basically, `worker.js` sin los arreglos que se le fueron haciendo después.
 *
 * A) Reintento de token de Firebase vencido (esto es lo más importante).
 *    `worker.js` mete un helper nuevo, `fsFetch(env, url, init)`, que centraliza
 *    el `fetch` contra Firestore y, si la respuesta es 401, tira el token
 *    cacheado y reintenta UNA vez con uno nuevo. Acá no existe ese helper: cada
 *    lectura y cada commit pide el token una vez y, si Google dice 401, se
 *    devuelve el error al cliente tal cual. Consecuencia: un token vencido
 *    dejaba TODAS las compras en 500 durante hasta 50 minutos (lo que dura el
 *    cache), en vez de recuperarse solo en el segundo intento.
 *
 * B) Chequeo de que Google devolvió un access_token usable. `worker.js`
 *    verifica que `data.access_token` sea un string no vacío antes de
 *    cachearlo. Acá se cachea lo que venga: si Google responde 200 pero sin
 *    token, el isolate queda guardando `undefined` y todo el día siguiente
 *    responde 401 -> 500.
 *
 * C) Aviso de arrepentimiento. `worker.js` atiende dentro de `notify` el caso
 *    `tipo: "arrepentimiento"`, limpiando los cinco campos que imprime
 *    (recorta a 200 caracteres, saca saltos de línea, exige pedido o nombre) y
 *    devolviendo 502 si Telegram falla. Acá ese camino no existe.
 *
 * D) Mínimo y paso de las gift cards. Acá: `GIFT_CARD_MIN = 5000` y además
 *    `GIFT_CARD_PASO = 5000`, o sea que el monto tiene que ser múltiplo de
 *    $5.000. En `worker.js`: `GIFT_CARD_MIN = 1000` y ningún paso, se acepta
 *    cualquier entero dentro del rango. Ojo con esto: `src/data/config.js`
 *    tiene `GIFT_CARD_MIN = 1000`, así que esta variante es más restrictiva
 *    que el sitio. Con los montos que el sitio ofrece hoy ([10000, 20000,
 *    30000, 50000, 75000, 100000]) no se rompe nada, pero si mañana agregás
 *    un monto de $3.000 el sitio lo dejaría comprar y este Worker lo rechaza.
 *
 * E) Producto apagado desde el panel. `worker.js` rechaza la compra si el
 *    producto tiene `active === false` (es decir, si el admin lo apagó pero
 *    alguien tiene el carrito viejo abierto). Acá no se mira ese campo: se
 *    puede comprar una prenda oculta.
 *
 * F) Qué productos entran al commit atómico. Acá van TODOS los productos que
 *    tengan stock cargado, cada uno con su `currentDocument` (precondición).
 *    `worker.js` mete solo los productos cuyo stock baja DE VERDAD en ese
 *    pedido. Con esta variante, editar cualquier otra prenda desde el panel
 *    (subirle una foto, cambiarle el precio) aborta el commit entero y el
 *    cliente ve un "se agotó el stock" que es mentira.
 *
 * G) Cómo se calcula el descuento de un cupón de monto fijo. Acá se llama a
 *    `aplicaCoupon` por cada línea del carrito, así que un cupón fijo de
 *    $5.000 descuenta $5.000 POR LÍNEA (5 prendas = $25.000 de descuento).
 *    `worker.js` calcula primero la "base elegible" y descuenta el monto fijo
 *    una sola vez por pedido.
 *
 * H) Caída de Correo Argentino. `worker.js` envuelve la cotización en un
 *    try/catch y devuelve un 503 con un mensaje que dice "probá de nuevo o
 *    elegí retiro en el local". Acá la excepción sube y el cliente recibe el
 *    500 genérico.
 *
 * I) Falla del commit. `worker.js` loguea el error entero y devuelve un 503
 *    que aclara que no se cobró nada. Acá se relanza el error y el cliente
 *    recibe el 500 genérico de arriba.
 *
 * J) Dato personal en la gift card emitida. Acá, el documento de la gift card
 *    que se vende guarda `note: <nombre del comprador>`. En `worker.js` ese
 *    campo NO se guarda, y a propósito: /giftCards tiene lectura pública por
 *    código (`allow get: if true` en firestore.rules), así que ese nombre
 *    quedaría a la vista de cualquiera que tuviera el código. Esa es una
 *    razón de privacidad, no un detalle menor.
 *
 * K) Detalle de logging. El catch general de `worker.js` vuelca también
 *    `err.stack` y `err.status`.
 *
 * ---------------------------------------------------------------------------
 * CÓMO USAR ESTE ARCHIVO, EN CONCRETO
 * ---------------------------------------------------------------------------
 * NO lo despliegues: desplegá `worker.js`. Este archivo sirve para dos cosas:
 * leer los comentarios (los mismos bloques están en `worker.js`) y, si en
 * algún momento hay que volver atrás, tener el estado anterior a mano.
 *
 * Si de verdad llegaras a subirlo, tenés que ser consciente de lo que perdés:
 * los avisos legales de arrepentimiento dejan de llegar a Telegram, se puede
 * comprar una prenda que el admin apagó, un cupón de monto fijo descuenta
 * varias veces, y queda la puerta de que un token de Firebase vencido te
 * corte las compras por casi una hora.
 *
 * ---------------------------------------------------------------------------
 * CÓMO EJECUTAR / DESPLEGAR (vale para los dos archivos)
 * ---------------------------------------------------------------------------
 *   npx wrangler deploy              (desde cloudflare-worker/)
 *   npx wrangler tail                (ver logs en vivo)
 * Las variables van en `wrangler.jsonc`; las credenciales, con
 * `npx wrangler secret put <NOMBRE>`. Todo eso está en el README de la carpeta.
 * Para quién es este archivo: para el dev del proyecto, que necesita saber
 * qué hay arriba en producción y qué NO hay que subir.
 * ============================================================================
 */

/**
 * Worker de pedidos + Correo Argentino + suscripciones — SKUL
 * ------------------------------------------------------------
 * Este Worker hace TRES cosas, según el campo "action" que le
 * manda el sitio en el body (JSON):
 *
 *   action: "notify" (o sin action, para compatibilidad con lo
 *     que ya andaba)  -> avisa un pedido nuevo por Telegram.
 *     Body: { orderId }
 *
 *   action: "createOrder" (implícito, ver más abajo) -> crea el pedido,
 *     descuenta stock, canjea cupón, descuenta el saldo de la gift card
 *     y emite la gift card si se compró una. Todo en un commit atómico.
 *     Body: { orderName, orderPhone, orderAddress, items, zoneId,
 *             correoQuote, payMethod, couponCode, giftCardCode }
 *
 *   action: "subscribe" -> avisa una suscripción nueva al
 *     newsletter por Telegram.
 *     Body: { subscriberId }
 *
 *   action: "rates" -> cotiza un envío con la API MiCorreo
 *     (Correo Argentino) para un código postal de destino.
 *     Body: { postalCodeDestination, weight, height, width, length }
 *
 *   action: "agencies" -> lista las sucursales de Correo de una
 *     provincia, para que el cliente elija dónde retirar.
 *     Body: { provinceCode }
 *
 * Las credenciales de MiCorreo (usuario/contraseña/customerId)
 * viven acá como variables de entorno privadas del Worker.
 * NUNCA van al navegador. Ver README.md de esta carpeta para
 * cómo cargarlas.
 *
 * ------------------------------------------------------------
 * CÓMO LEE FIRESTORE (importante)
 * ------------------------------------------------------------
 * El navegador NUNCA le manda al Worker los datos del pedido ni el
 * mail del que se suscribe: solo le pasa el ID. El Worker busca el
 * documento en Firestore por su cuenta y arma el mensaje.
 *
 * Para poder leer /orders (que es privada, porque tiene nombre,
 * teléfono y dirección) el Worker se autentica con una cuenta de
 * servicio de Firebase mediante un token JWT firmado con la clave
 * privada. Esa cuenta de servicio es la única autorización extra que
 * necesitan las reglas de Firestore (función isWorker).
 *
 * Si todavía no cargaste esas dos variables, el Worker sigue
 * funcionando como antes (lee sin token) y los pedidos con datos
 * públicos se avisan igual. Ver README.md.
 *
 * ------------------------------------------------------------
 * PARA EL QUE TODAVÍA NO TOCÓ UN WORKER
 * ------------------------------------------------------------
 * Un Cloudflare Worker es un archivo de JavaScript que se sube a los
 * servidores de Cloudflare y queda escuchando en una URL pública. No es un
 * servidor propio: no tenés ni máquina ni terminal, solo este archivo. Cada
 * vez que alguien le pega a esa URL, Cloudflare corre la función `fetch` de
 * abajo en algún lado y te devuelve la respuesta. Se usa para guardar
 * secretos (el token del bot de Telegram, las claves de Cloudinary, la clave
 * privada de Firebase) que si estuvieran en el JavaScript del sitio cualquiera
 * los vería al abrir las herramientas de desarrollador del navegador.
 *
 * El segundo parámetro de `fetch`, `env`, es el objeto con esas variables
 * privadas: es la forma de que el código acceda a ellas sin que estén
 * escritas en el archivo. Cada una se carga por separado y ninguna se puede
 * leer desde el navegador (eso es lo que hace Wrangler, la CLI de Cloudflare:
 * `npx wrangler secret put NOMBRE`; las que no son secretas van declaradas en
 * `wrangler.jsonc`, y ojo que un `deploy` borra del panel cualquier variable
 * de texto plano que no esté ahí).
 *
 * Y como el Worker corre en un runtime que se reinicia cada tanto, la
 * "memoria" de JavaScript (las variables de módulo, como `golpes` o
 * `cachedToken`) no sobrevive: es memoria de un isolate, que es una
 * instancia aislada del runtime. Sirve para cachear algo por un rato, no
 * para guardar un dato que tenga que durar.
 */

/** ID del proyecto de Firebase al que escribo. Va fijo porque hay uno solo. */
const FIREBASE_PROJECT_ID = "skullt";

/** Base de la API de Firestore (REST) que usa la cuenta de servicio. */
// Por qué REST y no el SDK de firebase: el SDK de Node no corre en el runtime
// del Worker. La API REST es lo mismo (es la base de datos de Firestore) pero
// llamada por HTTP con fetch, que es lo único que hay disponible acá.
// `(default)` es el nombre de la base de datos, y es el único que usamos.
const FS_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
// Dentro de un documents:commit los documentos van con la ruta RELATIVA
// ("projects/.../documents/..."), no con la URL completa.
const FS_PATH = `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

/**
 * Cómo se escribe el medio de pago en el aviso de Telegram. La clave es lo
 * que viene del navegador (ya validado contra MEDIOS_PAGO más abajo), el valor
 * es lo que se lee lindo.
 */
const PAY_LABELS = {
  debito: "Débito",
  credito: "Crédito",
  transferencia: "Transferencia",
  efectivo: "Efectivo (cita previa)",
};

/**
 * Cabeceras de CORS (el permiso que le da el navegador para que una página de
 * otro dominio pueda llamar a este Worker). Se mandan SIEMPRE, y arriba se le
 * agrega el Access-Control-Allow-Origin cuando el origen está permitido.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
};

/* Orígenes desde los que se permite llamar al Worker.
 *
 * Con "*" el Worker quedaba disponible desde cualquier web: cualquiera
 * que encontrara esta URL podía gastarte la cuota de MiCorreo o
 * llenarte el Telegram de pedidos falsos. Ahora el navegador solo lo
 * acepta si la página viene de alguno de estos sitios.
 *
 * OJO: CORS alcanza únicamente a los navegadores. Un script por línea
 * de comandos puede llamar igual, por eso el rate limit de más abajo
 * es la barrera que realmente frena el abuso. */
const ORIGENES_PERMITIDOS = [
  "https://skullt.web.app",
  "https://skullt.firebaseapp.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

/**
 * Arma las cabeceras de CORS de la respuesta. Si la página que pregunta está
 * en la lista de orígenes permitidos, devuelvo además el "Access-Control-Allow-
 * Origin" con ese origen; si no, devuelvo las cabeceras peladas, y el
 * navegador va a bloquear la respuesta (que es lo que quiero).
 * El `Origin` es el dominio desde el que viene la petición: lo manda el
 * navegador y no se puede falsear desde el código.
 */
function corsHeaders(request) {
  const origin = request?.headers?.get("Origin");
  return ORIGENES_PERMITIDOS.includes(origin)
    ? { ...CORS_HEADERS, "Access-Control-Allow-Origin": origin }
    : CORS_HEADERS;
}

/* ============================================================
   RATE LIMIT (por IP y por acción)
   ------------------------------------------------------------
   Un límite por ventana de 1 minuto, guardado en memoria del
   isolate. No es un cortafuegos perfecto (las peticiones pueden caer
   en isolates distintos), pero frena de entrada el Curro de
   "pedí 10.000 cotizaciones para agotar la API de Correo" o
   "mandame 500 pedidos falsos al Telegram".

   Los límites son grandes a propósito: una persona normal que hace un
   pedido usa 1 notify + unas pocas cotizaciones. Y aunque un pedido
   se quede sin avisar, el pedido YA quedó guardado en Firestore y se
   ve en /admin, así que nunca se pierde una venta.
   ============================================================ */
const LIMITES = {
  notify: { max: 10, ventanaMs: 60_000 },
  subscribe: { max: 10, ventanaMs: 60_000 },
  rates: { max: 30, ventanaMs: 60_000 },
  agencies: { max: 30, ventanaMs: 60_000 },
  signUpload: { max: 60, ventanaMs: 60_000 },
  // Un pedido real es 1 por persona. 5 por minuto y por IP alcanza
  // sobrado para una familia o una tienda con varios pedidos juntos,
  // y corta de entrada el spam de pedidos falsos.
  createOrder: { max: 5, ventanaMs: 60_000 },
};

// Contador de golpes, en memoria del isolate. Ver la nota de arriba: es
// memoria que se pierde cuando el isolate se reinicia, y que además puede
// estar repartida en varios isolates a la vez. Sirve como freno, no como
// garantía.
const golpes = new Map();

/**
 * ¿Este (acción, IP) ya pasó del límite en la ventana actual?
 * Si sí, devuelve true y la respuesta va a ser un 429: "esperá un minuto".
 * Si la acción no está en LIMITES (o sea, una acción nueva que se te olvidó
 * agregarle), devuelve false y sigue.
 */
function excedeLimite(accion, ip) {
  const cfg = LIMITES[accion];
  if (!cfg) return false;

  const ahora = Date.now();
  const clave = `${accion}|${ip}`;
  let reg = golpes.get(clave);

  if (!reg || reg.reiniciaEn <= ahora) {
    reg = { cuenta: 0, reiniciaEn: ahora + cfg.ventanaMs };
    golpes.set(clave, reg);
  }
  reg.cuenta++;

  // Limpieza perezosa para que el Map no crezca sin control.
  if (golpes.size > 5000) {
    for (const [k, v] of golpes) {
      if (v.reiniciaEn <= ahora) golpes.delete(k);
    }
  }

  return reg.cuenta > cfg.max;
}

/**
 * Punto de entrada del Worker: TODO lo que entra por la URL pasa por acá.
 *
 * El recorrido es siempre el mismo y va en este orden a propósito:
 *   1. cabeceras de CORS y método (solo POST; OPTIONS es el pre vuelo que
 *      hace el navegador antes de mandar datos),
 *   2. parsear el JSON del body,
 *   3. cortar por rate limit, antes de tocar cualquier servicio externo,
 *   4. elegir handler según `action`,
 *   5. si el handler explota, loguear el detalle acá y devolver un mensaje
 *      genérico (nunca el error crudo).
 */
export default {
  async fetch(request, env) {
    const cors = corsHeaders(request);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }
    if (request.method !== "POST") {
      return new Response("Método no permitido", { status: 405, headers: cors });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("JSON inválido", { status: 400, headers: cors });
    }

    const action = body.action || "notify"; // sin action = comportamiento viejo (Telegram)

    // Corte por exceso de peticiones antes de tocar nada (ni Firestore,
    // ni MiCorreo, ni Telegram).
    const ip = request.headers.get("CF-Connecting-IP") || "desconocido";
    if (excedeLimite(action, ip)) {
      return new Response("Demasiadas consultas. Probá de nuevo en un momento.", {
        status: 429,
        headers: cors,
      });
    }

    try {
      if (action === "notify") return await handleNotify(body, env, cors);
      if (action === "createOrder") return await handleCreateOrder(body, env, cors);
      if (action === "subscribe") return await handleSubscribe(body, env, cors);
      if (action === "signUpload") return await handleSignUpload(body, env, cors, request);
      if (action === "rates") return await handleRates(body, env, cors);
      if (action === "agencies") return await handleAgencies(body, env, cors);
      return new Response("Acción desconocida", { status: 400, headers: cors });
    } catch (err) {
      // El detalle va al log del Worker (wrangler tail / dashboard) para
      // poder diagnostics, pero al que llama le devolvemos un mensaje
      // genérico: antes se le filtraban a la calle textos internos de
      // Firestore y hasta una pista del email de la cuenta de servicio.
      console.error(`[${action}] Error:`, err?.message || err);
      return new Response("No se pudo completar la operación. Probá de nuevo.", {
        status: 500,
        headers: cors,
      });
    }
  },
};

/* ============================================================
   FIRESTORE — autenticación con cuenta de servicio
   ------------------------------------------------------------
   La cuenta de servicio de Firebase permite firmar un JWT (RS256)
   y canjearlo por un access token de Google. Con ese token el
   Worker puede leer /orders y /newsletter, que son colecciones
   privadas (las reglas solo dejan pasar a isAdmin() o a isWorker()).

   Guardamos el token en memoria del isolate: dura una hora y las
   peticiones se hacen como mucho unas cuantas por minuto, así que
   no hace falta guardarlo en KV.
   ============================================================ */

let cachedToken = null; // { token, expiraEn }

/**
 * Devuelve un access token de Google para leer/escribir Firestore, o null si
 * no hay credenciales cargadas.
 *
 * El trámite es canjear un JWT (un token firmado que dice quién soy y qué
 * permiso pido) por un access token de Google. El access token expira en una
 * hora; el JWT dura nada (lo firmo acá al momento), así que no hay que
 * guardarlo.
 * OJO: esta versión no reintenta si Google devuelve 401 con un token viejo.
 * Esa es la diferencia marcada arriba contra `worker.js`.
 */
async function getFirestoreToken(env) {
  // Si no hay credenciales cargadas, devolvemos null y el Worker
  // sigue leyendo sin token (compatibilidad con lo que ya andaba).
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return null;

  const ahora = Date.now();
  if (cachedToken && cachedToken.expiraEn > ahora) return cachedToken.token;

  const iat = Math.floor(ahora / 1000);
  const exp = iat + 3600;
  const claims = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp,
  };

  const token = await firmarJwt(env, claims);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: token,
    }),
  });

  if (!res.ok) {
    throw new Error(`No se pudo autenticar con Firebase (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  // OJO — falta el chequeo que sí está en `worker.js`: si Google respondiera
  // 200 pero sin access_token, acá se cachea undefined y el isolate queda con
  // un token inválido: todas las compras dan 401 -> 500 hasta que se reinicie
  // solo. No lo agregué porque no me dejaron tocar código.
  // Corto un poco antes de que venza por si el reloj del isolate va justo.
  cachedToken = { token: data.access_token, expiraEn: ahora + 50 * 60 * 1000 };
  return cachedToken.token;
}

/** Firma un JWT con la clave privada de la cuenta de servicio. */
async function firmarJwt(env, claims) {
  // Un JWT son tres partes separadas por puntos: cabecera, cuerpo y firma,
  // cada una en base64url (base64 sin los caracteres + / =, que rompen las
  // URLs). Acá solo calculo la tercera; las otras dos ya vienen escritas.
  const b64url = (input) =>
    btoa(String.fromCharCode(...input))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  const header = { alg: "RS256", typ: "JWT" };
  const head = b64url(new TextEncoder().encode(JSON.stringify(header)));
  const body = b64url(new TextEncoder().encode(JSON.stringify(claims)));
  // Lo que se firma son los bytes de "head.body", tal cual.
  const data = new TextEncoder().encode(`${head}.${body}`);

  // La clave privada llega como secret de Wrangler con los \n literales.
  const pem = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");
  const binario = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  // atob me da bytes; el importKey de la WebCrypto API necesita un Uint8Array.
  const keyData = Uint8Array.from(atob(binario), (c) => c.charCodeAt(0));

  // "pkcs8" es el formato de la clave que descarga Firebase (la .json de la
  // cuenta de servicio). RSASSA-PKCS1-v1_5 con SHA-256 es RS256: el algoritmo
  // de firma que dice el `alg` de la cabecera.
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const firma = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, data);
  return `${head}.${body}.${b64url(new Uint8Array(firma))}`;
}

/*
 * Comentario que quedó pegado arriba de acá por un error mío al meter el
 * bloque de IDs de documento: el docstring "Lee un documento de Firestore por
 * su ruta" que realmente corresponde es el de `fsGetDoc`, más abajo.
 */
/* ============================================================
   IDs de documento: solo letras, números, guion y guion bajo
   ------------------------------------------------------------
   El ID de un documento va dentro de la RUTA de la API de Firestore,
   así que si se acepta un "../" el pedido puede salirse de la
   colección. Eso no es teórico: con

       {"orderId": "../settings/site"}

   la ruta quedaba .../documents/orders/../settings/site, que es
   .../documents/settings/site: un documento real de otra colección,
   y el Worker lo mandaba a Telegram. Con "../orders/<id>" se podía
   sacar la información de un pedido. Probado en producción.

   Por eso TODO id que venga de afuera tiene que pasar por acá antes
   de tocar una ruta.
   ============================================================ */
const ID_SEGURO = /^[A-Za-z0-9_-]{1,128}$/;
// Los suscriptores se guardan por email, así que su id puede traer
// @ y . — pero nada de / ni de ..
const ID_SEGURO_EMAIL = /^[A-Za-z0-9_.@-]{1,200}$/;

/** true si el id es seguro de interpolar en una ruta. */
function idSeguro(id, patron = ID_SEGURO) {
  return typeof id === "string" && patron.test(id);
}

/**
 * Lee un documento de Firestore por su ruta ("orders/abc").
 * Devuelve null si no existe.
 *
 * Es una Envoltura cómoda de `fsGetDocRaw`: me quedo con los datos y me
 * olvido del `updateTime` y del `exists`, que acá no necesito.
 */
async function fsGetDoc(env, path) {
  const d = await fsGetDocRaw(env, path);
  return d ? d.data : null;
}

/**
 * Igual que fsGetDoc pero devuelve también el "updateTime" del documento,
 * que se usa como precondition en el commit: si el documento cambió entre
 * la lectura y la escritura, Firestore aborta el commit y podemos
 * reintentar. Así dos personas no pueden comprar el último talle.
 */
async function fsGetDocRaw(env, path) {
  const url = `${FS_URL}/${path}`;
  // Traigo el token acá (que lo firma y lo canjea si hace falta) y lo mando
  // como "Bearer": así Firestore sabe que soy la cuenta de servicio y no un
  // visitante anónimo.
  const accessToken = await getFirestoreToken(env);

  const res = await fetch(url, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });

  // 404 = no existe. No es un error: el coupon inexistente es una respuesta
  // válida, la maneja el handler de createOrder.
  if (res.status === 404) return null;

  // 401/403 sí son problema mío, y cada uno pide una corrección distinta,
  // así que el mensaje dice cuál de las dos es.
  if (res.status === 401 || res.status === 403) {
    const texto = await res.text();
    if (!accessToken) {
      throw new Error(
        "Firestore rechazó la lectura porque el Worker no tiene credenciales. " +
          "Cargá FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY (ver README) " +
          `detalle: ${texto}`
      );
    }
    throw new Error(
      `Firestore rechazó la lectura (${res.status}). Revisá que la cuenta de ` +
        `servicio tenga el rol de acceso a Firestore y que su email sea el que ` +
        `aparece en isWorker() de firestore.rules. detalle: ${texto}`
    );
  }

  if (!res.ok) {
    throw new Error(`Firestore respondió ${res.status}: ${await res.text()}`);
  }

  const doc = await res.json();
  return { data: parseFirestoreFields(doc.fields), updateTime: doc.updateTime || null, exists: true };
}

/** Aplica varias escrituras de Firestore de forma ATÓMICA (todas o ninguna). */
async function fsCommit(env, writes) {
  if (!writes.length) return;
  const accessToken = await getFirestoreToken(env);

  // `:commit` es el endpoint que acepta un arreglo de escrituras y las aplica
  // como una sola transacción: si una sola falla, no se aplica ninguna. Por eso
  // el endpoint tiene dos puntos: la URL base termina en /documents y se le
  // suma ":commit".
  const res = await fetch(`${FS_URL}:commit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ writes }),
  });

  if (!res.ok) {
    const texto = await res.text();
    const err = new Error(`Firestore rechazó el commit (${res.status}): ${texto}`);
    err.status = res.status;
    throw err;
  }
}

/** Convierte un valor de JS en el formato de campos que pide la API REST. */
// Claves con las que la API REST representa un valor. Si un objeto ya
// viene con una de estas claves ya está codificado (es lo que devuelve
// fsTimestamp) y hay que guardarlo tal cual: si lo tratáramos como un
// objeto normal, un timestamp quedaría guardado como un mapa y el panel
// no lo podría ordenar por fecha.
const TIPOS_FS = new Set([
  "nullValue", "booleanValue", "integerValue", "doubleValue",
  "stringValue", "timestampValue", "reference", "arrayValue", "mapValue",
  "geoPointValue", "bytesValue",
]);

function fsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v)
      ? { integerValue: String(v) }
      : { doubleValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(fsValue) } };
  if (typeof v === "object") {
    const claves = Object.keys(v);
    if (claves.length === 1 && TIPOS_FS.has(claves[0])) return v;
    return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fsValue(x)])) } };
  }
  return { nullValue: null };
}

/** Convierte un objeto de JS en el mapa de campos que pide la API REST. */
function fsFields(obj) {
  // fsFields es el fsValue de siempre, pero aplicado a cada clave del objeto:
  // la API REST no acepta un objeto normal, quiere {campo: {stringValue: "x"}}.
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fsValue(v)]));
}

/** Fecha/hora en el formato que usa Firestore. */
function fsTimestamp(ms = Date.now()) {
  return { timestampValue: new Date(ms).toISOString() };
}

/** ID de documento al estilo de Firestore (20 caracteres seguros). */
function nuevoId(length = 20) {
  // Sale de crypto.getRandomValues, que es criptográficamente seguro (no es
  // Math.random): el ID del pedido es lo único que evita que alguien adivine
  // el pedido de otro en la URL de tracking.
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
}

/** Manda un texto al chat de Telegram. Lanza si Telegram responde error. */
async function sendTelegram(env, text) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
  });

  if (!res.ok) {
    throw new Error(`Error de Telegram: ${await res.text()}`);
  }
}

/* ============================================================
   Aviso de pedido por Telegram.
   Se usa desde createOrder (con el pedido recién creado) y desde la
   acción notify (que relee el pedido de Firestore).
   ------------------------------------------------------------
   Armando el mensaje acá, y no en el navegador, es lo que evita que
   el endpoint sea un "mandame lo que quieras a mi Telegram".
   ============================================================ */
async function notificarPedido(env, orderId, order) {
  const zoneName = order.zoneId || "-";
  const itemsText = (order.items || [])
    .map((i) => `• ${i.name}${i.size ? ` / Talle ${i.size}` : ""} x${i.qty} — ${fmt(i.price * i.qty)}`)
    .join("\n");

  const lines = [
    "🛒 NUEVO PEDIDO — SKUL",
    "",
    `Cliente: ${order.orderName || "-"}`,
  ];
  if (order.orderPhone) lines.push(`Teléfono: ${order.orderPhone}`);
  if (order.orderAddress) lines.push(`Dirección: ${order.orderAddress}`);
  lines.push("", itemsText, "", `Subtotal: ${fmt(order.subtotal)}`);
  if (order.discount > 0) lines.push(`Descuento efectivo: -${fmt(order.discount)}`);
  if (order.couponDiscount > 0) lines.push(`Cupón (${order.couponCode}): -${fmt(order.couponDiscount)}`);
  if (order.giftCardDiscount > 0) lines.push(`Gift card (${order.giftCardCode}): -${fmt(order.giftCardDiscount)}`);
  if (order.giftCardIssued) {
    const emitida = (order.items || []).find((i) => i.id === ITEM_GIFT_CARD);
    lines.push("", `🎁 Gift card emitida: ${order.giftCardIssued} — saldo ${fmt(emitida ? emitida.price : 0)}`);
  }
  lines.push(`Envío (${zoneName}): ${order.shippingCost === 0 ? "Gratis" : fmt(order.shippingCost)}`);
  lines.push(`TOTAL: ${fmt(order.total)}`);
  lines.push("");
  lines.push(`Medio de pago: ${PAY_LABELS[order.payMethod] || order.payMethod || "-"}`);
  lines.push(`Envío/retiro: ${zoneName}`);
  lines.push("");
  lines.push(`Seguimiento: https://skullt.web.app/seguimiento?pedido=${orderId}`);

  await sendTelegram(env, lines.join("\n"));
}

/* ============================================================
   ACCIÓN: notify — avisa un pedido nuevo por Telegram
   ------------------------------------------------------------
   El navegador manda SOLO el orderId; el texto lo armo yo leyendo el
   documento. Ojo con esto en esta variante: si el navegador manda
   `tipo: "arrepentimiento"` (que es lo que hace el botón legal del
   sitio), esta función lo ignora y responde "Falta orderId". El aviso
   de arrepentimiento solo existe en `worker.js`.
   ============================================================ */
async function handleNotify(body, env, cors) {
  const { orderId } = body;
  if (!orderId || typeof orderId !== "string") {
    return new Response("Falta orderId", { status: 400, headers: cors });
  }
  // Sin esto, un "../" en el id hacía que el Worker leyera un documento
  // de otra colección y lo mandara a Telegram (ver idSeguro).
  if (!idSeguro(orderId)) {
    return new Response("orderId inválido", { status: 400, headers: cors });
  }

  const order = await fsGetDoc(env, `orders/${encodeURIComponent(orderId)}`);
  if (!order) {
    return new Response("Pedido no encontrado", { status: 404, headers: cors });
  }

  await notificarPedido(env, orderId, order);

  return new Response("ok", { status: 200, headers: cors });
}

/* ============================================================
   ACCIÓN: subscribe — avisa una suscripción nueva al newsletter
   ------------------------------------------------------------
   El navegador manda solamente el ID del documento. El mail lo
   lee el Worker de Firestore: así nadie puede usar este endpoint
   como "mandame cualquier texto a mi Telegram" (si aceptáramos
   el texto directamente, cualquiera que encuentre la URL podría
   escribirte en ese canal lo que quisiera).
   ============================================================ */
/* ============================================================
   ADMIN — verificación de quién está del otro lado
   ------------------------------------------------------------
   Las acciones que usan una credencial de verdad (firmar subidas de
   Cloudinary, por ejemplo) no pueden estar abiertas: alcanza con que
   el endpoint fuera público para que cualquiera se haga pasar por el
   admin.

   Para comprobarlo se usa el mismo login que usa el panel: el
   navegador pide su "ID token" de Firebase y lo manda en la cabecera
   Authorization. El Worker se lo devuelve a Firebase para preguntar
   "¿de verdad es este usuario?" y compara el ID con el del admin.

   Lo que se manda no es la contraseña ni el API secret: es un token
   que el navegador renueva solo y que solo sirve para este proyecto.
   ============================================================ */
const ADMIN_UID = "Ii35YTENxZePLzloJkaC99AL5rn1";

/**
 * Devuelve el UID del admin si el token es válido, o null.
 * Nunca lanza: un token raro es lo mismo que no traer token.
 */
async function uidAdmin(request, env) {
  const header = request.headers.get("Authorization") || "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!idToken) return null;
  if (!env.FIREBASE_API_KEY) return null;

  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!res.ok) {
      console.warn("[auth] Firebase rechazó el token:", res.status);
      return null;
    }
    const data = await res.json().catch(() => ({}));
    const usuario = Array.isArray(data.users) && data.users[0];
    return usuario && usuario.localId === ADMIN_UID ? usuario.localId : null;
  } catch (err) {
    console.error("[auth] No se pudo verificar el token:", err?.message || err);
    return null;
  }
}

/* ============================================================
   ACCIÓN: signUpload — firma una subida de imagen para Cloudinary
   ------------------------------------------------------------
   Con un "unsigned upload preset" de Cloudinary, CUALQUIERA en
   internet puede subir archivos a nuestra cuenta con solo conocer el
   nombre del preset (que va dentro del JavaScript del sitio, o sea
   que es público). Probado: una subida sin autenticación funciona.

   Con una subida firmada, Cloudinary exige una firma que se calcula
   con el API secret. Ese secret jamás sale del Worker.

   Y como este endpoint tampoco puede quedar abierto (si lo estuviera,
   cualquiera pediría una firma y subiría igual), antes de firmar se
   verifica que quien llama sea el admin.
   ============================================================ */
async function handleSignUpload(body, env, cors, request) {
  if (!(await uidAdmin(request, env))) {
    return new Response(
      JSON.stringify({ error: "Solo el administrador puede subir imágenes." }),
      { status: 403, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
  if (!env.CLOUDINARY_API_SECRET || !env.CLOUDINARY_CLOUD_NAME) {
    console.error("[signUpload] falta CLOUDINARY_API_SECRET en los secrets del Worker");
    return new Response(
      JSON.stringify({ error: "Las subidas de imágenes no están configuradas." }),
      { status: 503, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  // Cloudinary firma con SHA-1 sobre los parámetros ordenados, más un
  // timestamp. Es el mismo algoritmo que documenta Cloudinary:
  //   firma = sha1("folder=skul-productos&timestamp=1234" + API_SECRET)
  const folder = "skul-productos";
  const timestamp = Math.floor(Date.now() / 1000);
  const paraFirmar = `folder=${folder}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`;

  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(paraFirmar)
  );
  const signature = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return new Response(
    JSON.stringify({
      signature,
      timestamp,
      folder,
      cloudName: env.CLOUDINARY_CLOUD_NAME,
      apiKey: env.CLOUDINARY_API_KEY || null,
    }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
  );
}

/**
 * ACCIÓN: subscribe — avisa una suscripción nueva al newsletter
 * ------------------------------------------------------------
 * Igual que en notify: el navegador manda el ID y yo leo el mail del
 * documento. Por eso los ids de esta colección pueden traer @ y . (el
 * documento se llama así: /newsletter/<email>), y por eso acá se usa el
 * patrón `ID_SEGURO_EMAIL`, que sigue sin dejar pasar / ni ..
 */
async function handleSubscribe(body, env, cors) {
  const { subscriberId } = body;
  if (!subscriberId || typeof subscriberId !== "string") {
    return new Response("Falta subscriberId", { status: 400, headers: cors });
  }
  // Misma razón que en notify: el id va en la ruta y no puede salirse
  // de la colección (ver idSeguro).
  if (!idSeguro(subscriberId, ID_SEGURO_EMAIL)) {
    return new Response("subscriberId inválido", { status: 400, headers: cors });
  }

  const sub = await fsGetDoc(env, `newsletter/${encodeURIComponent(subscriberId)}`);
  if (!sub) {
    return new Response("Suscripción no encontrada", { status: 404, headers: cors });
  }

  const lines = [
    "📬 SUSCRIPCIÓN AL NEWSLETTER — SKUL",
    "",
    `Email: ${sub.email}`,
    `Origen: ${sub.source || "footer"}`,
    `Consentimiento: ${sub.consent === true ? "sí" : "no informado"}`,
  ];

  await sendTelegram(env, lines.join("\n"));

  return new Response("ok", { status: 200, headers: cors });
}

/* ============================================================
   ACCIÓN: createOrder — crea el pedido, descuenta stock y canjea cupón
   ------------------------------------------------------------
   ANTES lo hacía el navegador con una transacción de Firestore. Eso
   obligaba a dejar abiertos los permisos de escritura para que cualquiera
   (sin login) pudiera tocar /products y /coupons: se podía vaciar el
   stock a cero, gastar un cupón las veces que se quisiera y mandar
   pedidos basura.

   Ahora el navegador solo manda QUÉ quiere comprar; los precios, el
   stock, el descuento y el costo de envío se calculan acá, leyendo el
   catálogo real. Las cuatro escrituras (stock, pedido, seguimiento
   público y uso del cupón) van en un solo commit atómico.
   ============================================================ */

/* Zonas con precio fijo. OJO: si agregás una zona en src/data/config.js,
 * agregala acá también; si no, el Worker la rechaza por seguridad. */
// Lo que NO está en esta tabla no existe: el `zoneId` que llega se busca acá
// y, si no aparece, se cae al envío por Correo. Es una lista blanca: por eso
// el comentario de arriba dice "por seguridad".
const ZONAS_FIJAS = {
  local: { nombre: "Retiro en Los Toldos", precio: 0 },
};

// Listas blancas de los valores que acepto del navegador: medio de pago y
// tipo de envío. Cualquier cosa fuera de estas listas se rechaza en el paso 1.
const MEDIOS_PAGO = ["debito", "credito", "transferencia", "efectivo"];
const TIPOS_ENVIO = ["domicilio", "sucursal"];

/* ============================================================
   GIFT CARDS
   ------------------------------------------------------------
   La gift card es saldo con código (no un uso único): el cliente
   la carga en el checkout y el descuento se descuenta de su
   saldo. El saldo se descuenta SOLO acá adentro, nunca en el
   navegador.

   Estas constantes están duplicadas a propósito en
   src/data/config.js: el Worker es un archivo aparte que se
   despliega solo y no puede importar nada del sitio. Si cambiás
   un valor, cambiá el de los dos lados.
   ============================================================ */
const GIFT_CARD_PREFIJO = "SKUL-";
const GIFT_CARD_SUFIJO_LEN = 6;
// Mínimo, máximo y paso del monto de la gift card que se COMPRA.
// OJO: el `PASO` es solo de esta variante. `worker.js` no lo tiene y usa
// GIFT_CARD_MIN = 1000, así que acepta cualquier monto entero del rango. Y
// src/data/config.js dice MIN = 1000 también: si algún día el sitio ofrece un
// monto que no sea múltiplo de 5000, este archivo lo rechaza.
const GIFT_CARD_MIN = 5000;
const GIFT_CARD_MAX = 100000;
const GIFT_CARD_PASO = 5000;
// 6 meses. Los cupones no tienen vencimiento; las gift cards sí.
const GIFT_CARD_MESES = 6;
// Se sacan la I, la O, el 0 y el 1: son las letras/dígitos que la gente
// confunde entre sí cuando copia un código a mano.
const GIFT_CARD_ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
// El código completo tal como lo escribe el cliente: SKUL-XXXXXX
const RE_GIFT_CARD = /^SKUL-[A-Z0-9]{6}$/;
// Cómo se agrega al carrito una gift card que se está COMPRANDO (no
// usando). Es un id reservado: nunca puede ser el de un producto real,
// así que no se busca en /products.
const ITEM_GIFT_CARD = "giftcard";
const NOMBRE_ITEM_GIFT_CARD = "Gift Card SKUL";

/** Precio que corresponde a una prenda (outlet si está en outlet). */
// NUNCA se usa el precio que manda el navegador: el de acá sale del documento
// del producto que leí de Firestore. Esa es toda la idea del handler.
function precioReal(producto) {
  if (producto.outlet === true && Number(producto.outletPrice) > 0) return Number(producto.outletPrice);
  return Number(producto.price) || 0;
}

/** Cuánto se le descuenta a una prenda según el alcance del cupón. */
function aplicaCoupon(cupon, producto, importe) {
  if (!cupon || cupon.active !== true) return 0;
  // Sin producto real no hay alcance que evaluar (por ejemplo el ítem
  // de una gift card que se está comprando): no se le descuenta nada.
  if (!producto) return 0;
  if (cupon.scope === "category" && cupon.scopeCategory && producto.cat !== cupon.scopeCategory) return 0;
  if (cupon.scope === "products" && Array.isArray(cupon.scopeProductIds) && !cupon.scopeProductIds.includes(producto.id)) return 0;
  return cupon.type === "percent"
    ? Math.round((importe * (Number(cupon.value) || 0)) / 100)
    : Number(cupon.value) || 0;
}

/* ---------------- Gift cards: formato, vencimiento y saldo ---------------- */

/**
 * Deja el código como tiene que estar para buscar el documento:
 * sin espacios y en mayúsculas (la gente lo escribe "skul abc123").
 */
function normGiftCard(codigo) {
  let s = String(codigo || "").replace(/\s+/g, "").toUpperCase();
  if (s.startsWith("SKUL-")) return s;
  if (s.startsWith("SKUL") && s.length === 4 + 6) return "SKUL-" + s.slice(4);
  if (/^[A-Z0-9]{6}$/.test(s)) return "SKUL-" + s;
  return s;
}

/**
 * Cuándo deja de ser válida una gift card: createdAt + 6 meses.
 * Devuelve null si no hay fecha (una gift card sin createdAt se
 * considera vencida: preferimos que alguien la mire en el panel antes
 * de que se la regalemos a un cliente).
 */
function venceGiftCard(createdAt) {
  const fecha = createdAt ? new Date(createdAt) : null;
  if (!fecha || Number.isNaN(fecha.getTime())) return null;
  const d = new Date(fecha.getTime());
  d.setMonth(d.getMonth() + GIFT_CARD_MESES); // 6 meses de calendario
  return d;
}

/** Saldo que le queda a una gift card. */
function saldoGiftCard(giftCard) {
  const balance = Number(giftCard?.balance) || 0;
  const usado = Number(giftCard?.usedAmount) || 0;
  return Math.max(0, balance - usado);
}

/** Genera un código nuevo con el formato SKUL-XXXXXX. */
function nuevoCodigoGiftCard() {
  const bytes = crypto.getRandomValues(new Uint8Array(GIFT_CARD_SUFIJO_LEN));
  const sufijo = Array.from(
    bytes,
    (b) => GIFT_CARD_ALFABETO[b % GIFT_CARD_ALFABETO.length]
  ).join("");
  return `${GIFT_CARD_PREFIJO}${sufijo}`;
}

/**
 * Busca un código que esté libre. El "get" de control es solo una
 * comodidad: aunque saliera repetido, el commit atómico usa un update
 * SIN updateMask sobre ese documento, y Firestore rechaza escribir con
 * update si el documento YA existe. O sea que aunque dos códigos
 * coincidieran, el pedido no se crearía nunca dos veces con la misma
 * gift card.
 */
async function generarCodigoGiftCardLibre(env, intentos = 6) {
  for (let i = 0; i < intentos; i++) {
    const codigo = nuevoCodigoGiftCard();
    const existente = await fsGetDoc(env, `giftCards/${encodeURIComponent(codigo)}`);
    if (!existente) return codigo;
  }
  return nuevoCodigoGiftCard();
}

/** Etiqueta de envío que ve el cliente y el admin. */
// Para retiro en sucursal conviene el nombre de la sucursal; para domicilio,
// no hay nada mejor que el código postal.
function correoQuoteLabel(q) {
  if (!q) return "Envío por Correo Argentino";
  return q.type === "sucursal"
    ? `Correo Argentino — Retiro en ${q.agencyName || q.agencyCode} (CP ${q.postalCode})`
    : `Correo Argentino — A domicilio (CP ${q.postalCode})`;
}

/**
 * ACCIÓN: createOrder — el handler más importante del archivo
 * ------------------------------------------------------------
 * Qué es: el endpoint que convierte un carrito en un pedido guardado.
 *
 * Para qué sirve: es el que hace trustworthy todo el commerce. El navegador
 * manda QUÉ quiere comprar y dos o tres códigos; los precios, el stock, los
 * descuentos y el costo de envío salen de acá. Si el cliente pudiera mandar
 * el total, podría comprar cualquier cosa por un peso.
 *
 * Quién lo llama: el checkout (src/pages/Checkout.jsx) con un POST. Devuelve
 * 200 con `{ ok, orderId, total, giftCardDiscount, giftCardIssued }`.
 *
 * EL RECORRIDO COMPLETO, ETAPA POR ETAPA (leelo en orden, es lo importante):
 *
 *   1) Validación de forma. Chequeo que el body sea una forma válida: nombre,
 *      teléfono, carrito, medio de pago, método de envío, formato de los
 *      códigos. Acumulo los problemas en un array y devuelvo solo el primero.
 *      OJO: acá se valida la FORMA, no el fondo. Que el cupón exista y tenga
 *      saldo se verifica más adelante, contra el documento real.
 *
 *   2) Catálogo real. Leo cada producto una vez del documento de /products y
 *      de ahí saco el precio (o el precio de outlet), el peso y el stock. Armo
 *      `itemsNormalizados`: lo único que se guarda en el pedido sale de acá,
 *      nunca de lo que mandó el navegador. De paso voy descontando un stock
 *      "virtual" en `stockRestante` para detectar que no alcanzan.
 *
 *   3) Cupón. Si hay código, leo /coupons/<código>: tiene que existir, estar
 *      activo y no haber llegado a maxUses. Después calculo el descuento con
 *      `aplicaCoupon`, que respeta el alcance (toda la tienda, una categoría,
 *      o una lista de productos).
 *
 *   3b) Gift card. Mismo criterio contra /giftCards/<código>: existe, está
 *      activa, no venció (createdAt + 6 meses) y le queda saldo. Acá NO le
 *      toco el saldo todavía: eso pasa en el commit.
 *
 *   4) Envío. Si es por Correo Argentino, peso los ítems (cada prenda tiene su
 *      peso en el catálogo) y le pido la cotización a MiCorreo con el código
 *      postal que eligió. El precio del flete sale de la API, no del cliente.
 *
 *   5) Descuentos y total. En este orden: 10% por pago en efectivo (solo si
 *      no es envío por Correo), después el cupón, después la gift card sobre
 *      lo que queda. El envío se suma al final y ningún descuento lo toca.
 *
 *   6) Commit atómico. Una sola llamada a Firestore con todas las
 *      escrituras: stock de los productos, el pedido en /orders, la copia
 *      pública en /orderTracking, el contador del cupón, el saldo gastado de
 *      la gift card y, si se compró una, el documento de la gift card nueva.
 *      Las precondiciones (currentDocument) hacen que TODO el commit se aborte
 *      si algo cambió entre la lectura y la escritura.
 *
 *   7) Aviso a Telegram. Va último y protegido: si falla, el pedido ya quedó
 *      guardado, así que la venta no se pierde. Devuelvo el 200 igual.
 *
 * Los errores que se devuelven tienen un código pensado para el frontend:
 * 400 = el pedido está mal formado o un código no sirve, 409 = se agotó algo
 * o el descuento cambió mientras comprabas (probá de nuevo), 503 = MiCorreo
 * no responde.
 */
async function handleCreateOrder(body, env, cors) {
  const { orderName, orderPhone, orderAddress, items, zoneId, correoQuote, payMethod, couponCode, giftCardCode } = body;

  // ---- 1) Validación de forma (lo que llega del navegador) ----
  const problemas = [];
  if (typeof orderName !== "string" || orderName.trim().length < 2 || orderName.length > 80) {
    problemas.push("Falta el nombre.");
  }
  if (typeof orderPhone !== "string" || orderPhone.trim().length < 6 || orderPhone.length > 40) {
    problemas.push("Falta el teléfono.");
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > 10) {
    problemas.push("El carrito está vacío.");
  }
  if (!MEDIOS_PAGO.includes(payMethod)) {
    problemas.push("Medio de pago inválido.");
  }
  // `zona` es el id de la zona de precio fijo, o null cuando el envío es
  // por Correo Argentino (que no tiene precio fijo: se cotiza en MiCorreo).
  const esCorreo = zoneId === "correo";
  const zona = ZONAS_FIJAS[zoneId] ? zoneId : null;
  if (!zona && !esCorreo) {
    problemas.push("Método de envío inválido.");
  }
  if (esCorreo) {
    if (!correoQuote || !TIPOS_ENVIO.includes(correoQuote.type)) {
      problemas.push("No elegiste cómo recibir el envío.");
    }
    if (correoQuote?.type === "sucursal" && !correoQuote.agencyCode) {
      problemas.push("No elegiste la sucursal de retiro.");
    }
    if (correoQuote?.type === "domicilio" &&
        (typeof orderAddress !== "string" || orderAddress.trim().length < 5 || orderAddress.length > 200)) {
      problemas.push("Falta la dirección.");
    }
  }
  const codigo = couponCode ? String(couponCode).trim().toUpperCase() : null;
  if (codigo && !/^[A-Z0-9_-]{2,24}$/.test(codigo)) {
    problemas.push("El código de cupón no tiene un formato válido.");
  }
  const codigoGiftCard = giftCardCode ? normGiftCard(giftCardCode) : null;
  if (codigoGiftCard && !RE_GIFT_CARD.test(codigoGiftCard)) {
    problemas.push("El código de gift card no tiene un formato válido.");
  }
  if (problemas.length) {
    // Devuelvo UN solo problema, el primero: el frontend lo muestra tal cual
    // ("Falta el nombre."), así que no le mando una lista que no sabe pintar.
    return new Response(JSON.stringify({ error: problemas[0] }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // ---- 2) Catálogo real: precios y stock ----
  // Cada producto se lee UNA sola vez, aunque esté repetido en el carrito
  // (si alguien manda el mismo talle dos veces, el stock se acumula igual).
  //
  // El ítem reservado de gift card no se busca acá: no es un producto del
  // catálogo, no tiene stock y su precio lo valida el Worker más abajo.
  const idsSet = new Set();
  for (const it of items) {
    const id = String(it.id || "");
    if (id === ITEM_GIFT_CARD || id === "giftcard") continue;
    idsSet.add(id);
  }
  const idsUnicos = Array.from(idsSet);
  const productos = {};
  for (const id of idsUnicos) {
    const leido = await fsGetDocRaw(env, `products/${encodeURIComponent(id)}`);
    if (!leido) {
      // Producto que no existe. OJO: el texto "[GC-FIX]" que termina este
      // mensaje se ve el cliente: quedó de una versión de prueba de esta
      // variante y en `worker.js` no está. No lo toqué porque no me pediste
      // tocar código, pero habría que sacarlo.
      return new Response(JSON.stringify({ error: "Uno de los productos ya no está disponible. [GC-FIX]" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    // Me guardo el updateTime del documento: es la precondición que va en el
    // commit (punto 6) para detectar que el producto cambió.
    productos[id] = { ...leido.data, id, updateTime: leido.updateTime };
  }

  // Stock "virtual" de este pedido: va bajando a medida que Normalizo los
  // ítems, así que dos líneas del mismo talle en el carrito cuentan como dos
  // unidades. El stock de Firestore no se toca acá, se toca en el commit.
  const itemsNormalizados = [];
  const stockRestante = {};
  for (const id of Object.keys(productos)) stockRestante[id] = { ...(productos[id].stock || {}) };

  // Una gift card por pedido: no tiene sentido cobrar dos en el mismo
  // pedido y evita que el total de la compra se vaya en saldo en vez de
  // en prendas.
  const giftCardsEnCarrito = items.filter((i) => String(i.id || "") === ITEM_GIFT_CARD);
  if (giftCardsEnCarrito.length > 1) {
    return new Response(JSON.stringify({ error: "Solo se puede comprar una gift card por pedido." }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  for (const item of items) {
    const id = String(item.id || "");
    const size = String(item.size || "");
    const qty = Number(item.qty);
    const producto = productos[id];

    // ---- Ítem especial: la gift card que se está COMPRANDO ----
    // El precio no viene del navegador: se valida que sea un múltiplo de
    // $5.000 dentro del rango permitido y se usa ese número.
    if (id === ITEM_GIFT_CARD) {
      const monto =
        Number(item.amount) ||
        Number(item.giftcardAmount) ||
        Number(item.price);
      const montoValido =
        Number.isInteger(monto) &&
        monto >= GIFT_CARD_MIN &&
        monto <= GIFT_CARD_MAX &&
        monto % GIFT_CARD_PASO === 0;
      if (qty !== 1 || !montoValido) {
        return new Response(
          JSON.stringify({ error: "El monto de la gift card no es válido." }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
        );
      }
      itemsNormalizados.push({
        id,
        name: NOMBRE_ITEM_GIFT_CARD,
        cat: null,
        size: "",
        color: null,
        qty: 1,
        price: monto,
        weight: 50, // un sobre con la tarjeta, no una prenda
        giftcardAmount: monto,
      });
      continue;
    }

    if (!producto || !Number.isInteger(qty) || qty < 1 || qty > 20 || size.length > 12) {
      return new Response(JSON.stringify({ error: "El carrito tiene datos inválidos." }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    // Las prendas sin control de stock cargado siguen siendo comprables
    // (es lo que ya hacía el checkout).
    const hayControl = Object.keys(stockRestante[id]).length > 0;
    const disponible = hayControl ? Number(stockRestante[id][size] || 0) : Infinity;
    if (hayControl && disponible < qty) {
      return new Response(
        JSON.stringify({ error: `Ya no queda stock suficiente de "${producto.name}" talle ${size}.` }),
        { status: 409, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }
    if (hayControl) stockRestante[id][size] = disponible - qty;

    itemsNormalizados.push({
      id,
      name: String(producto.name || "").slice(0, 120),
      cat: producto.cat || null,
      size,
      color: item.color ? String(item.color).slice(0, 60) : null,
      qty,
      price: precioReal(producto),
      weight: Number(producto.weight) || 400,
    });
  }

  const subtotal = itemsNormalizados.reduce((acc, i) => acc + i.price * i.qty, 0);

  // ---- 3) Cupón, validado contra el documento real ----
  let cupon = null;
  let cuponDoc = null;
  if (codigo) {
    const leido = await fsGetDocRaw(env, `coupons/${encodeURIComponent(codigo)}`);
    cuponDoc = leido;
    cupon = leido ? leido.data : null;
    if (!cupon || cupon.active !== true) {
      return new Response(JSON.stringify({ error: "Ese cupón ya no está activo." }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (cupon.maxUses != null && Number(cupon.usedCount || 0) >= Number(cupon.maxUses)) {
      return new Response(JSON.stringify({ error: "Ese cupón llegó al límite de usos." }), {
        status: 409, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
  }

  // Acumulo el descuento de cada línea y lo topeo al subtotal.
  // OJO — comportamiento distinto al de `worker.js`: acá `aplicaCoupon` se llama
  // una vez por línea del carrito, así que un cupón de monto FIJO descuenta
  // ese monto en cada línea en la que aplica (5 prendas elegibles = 5 descuentos
  // de $5.000). `worker.js` calcula primero la base elegible y descuenta el
  // monto fijo una sola vez por pedido. Con cupones porcentuales da igual.
  const cuponDescuento = cupon
    ? Math.min(
        itemsNormalizados.reduce(
          (acc, i) => acc + aplicaCoupon(cupon, productos[i.id], i.price * i.qty),
          0
        ),
        subtotal
      )
    : 0;

  // ---- 3b) Gift card, validada contra el documento real ----
  // El navegador solo manda el código escrito. Si existe, está activa,
  // le queda saldo y no venció, se calcula cuánto se descuenta (más
  // abajo, ya con el descuento del cupón aplicado) — pero el saldo NO se
  // toca todavía: eso pasa en el commit atómico del punto 6, junto con el
  // pedido. Si el commit falla, el saldo queda como estaba.
  let giftCard = null;
  let giftCardDoc = null;
  let giftCardSaldo = 0;
  if (codigoGiftCard) {
    const leido = await fsGetDocRaw(env, `giftCards/${encodeURIComponent(codigoGiftCard)}`);
    giftCardDoc = leido;
    giftCard = leido ? leido.data : null;

    if (!giftCard) {
      return new Response(JSON.stringify({ error: "Ese código de gift card no existe." }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (giftCard.active !== true) {
      return new Response(JSON.stringify({ error: "Esa gift card está dada de baja." }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const vence = venceGiftCard(giftCard.createdAt);
    if (!vence || vence.getTime() <= Date.now()) {
      return new Response(JSON.stringify({ error: "Esa gift card venció." }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    giftCardSaldo = saldoGiftCard(giftCard);
    if (giftCardSaldo <= 0) {
      return new Response(JSON.stringify({ error: "Esa gift card ya no tiene saldo." }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
  }

  // ---- 4) Envío: también se calcula acá, no lo manda el cliente ----
  let envio = 0;
  // Ojo: para el envío por Correo, `zona` queda en null (no es una zona
  // con precio fijo), así que no hay que buscar nada en ZONAS_FIJAS: la
  // etiqueta se arma más abajo, con la cotización real de MiCorreo.
  let zoneIdFinal = esCorreo ? "Envío por Correo Argentino" : ZONAS_FIJAS[zona].nombre;
  let correoQuoteFinal = null;

  if (esCorreo) {
    const peso = itemsNormalizados.reduce((acc, i) => acc + (Number(i.weight) || 400) * i.qty, 0);
    const cotizacion = await cotizarCorreo(env, correoQuote.postalCode, peso);
    const precio = cotizacion[correoQuote.type];
    if (precio == null) {
      return new Response(
        JSON.stringify({ error: "Correo Argentino no tiene ese tipo de envío para ese destino." }),
        { status: 409, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }
    envio = Number(precio);
    zoneIdFinal = correoQuoteLabel(correoQuote);
    correoQuoteFinal = {
      type: correoQuote.type,
      postalCode: String(correoQuote.postalCode || ""),
      provinceCode: String(correoQuote.provinceCode || ""),
      agencyCode: correoQuote.agencyCode ? String(correoQuote.agencyCode) : null,
      agencyName: correoQuote.agencyName ? String(correoQuote.agencyName).slice(0, 120) : null,
    };
  }

  // ---- 5) Descuentos y total ----
  // El 10% es el único descuento fijo (pago en efectivo y NO por Correo,
  // que en el checkout va deshabilitado).
  const descuento = payMethod === "efectivo" && !esCorreo ? Math.round(subtotal * 0.1) : 0;

  // ORDEN DE LOS DESCUENTOS: primero el cupón, después la gift card.
  // O sea, la gift card se aplica sobre lo que queda después del cupón
  // (y del 10% efectivo), nunca sobre el subtotal completo.
  // El envío queda afuera: la gift card descuenta prendas, no el flete.
  const baseDescontable = Math.max(0, subtotal - descuento - cuponDescuento);
  const giftCardDescuento = giftCard ? Math.min(giftCardSaldo, baseDescontable) : 0;

  const total = Math.max(0, baseDescontable - giftCardDescuento + envio);
  const ahora = Date.now();

  // Si en el carrito hay una gift card para COMPRAR, se le emite un
  // código acá (antes del commit) y el documento se crea en el mismo
  // commit atómico que el pedido.
  const itemGiftCard = itemsNormalizados.find((i) => i.id === ITEM_GIFT_CARD) || null;
  const giftCardEmitida = itemGiftCard ? await generarCodigoGiftCardLibre(env) : null;

  const orderId = nuevoId();
  const pedido = {
    orderName: orderName.trim(),
    orderPhone: orderPhone.trim(),
    orderAddress: orderAddress ? String(orderAddress).trim().slice(0, 200) : null,
    items: itemsNormalizados,
    subtotal,
    discount: descuento,
    couponCode: cupon ? codigo : null,
    couponDiscount: cuponDescuento,
    giftCardCode: giftCard && giftCardDescuento > 0 ? codigoGiftCard : null,
    giftCardDiscount: giftCardDescuento,
    giftCardIssued: giftCardEmitida,
    zoneId: zoneIdFinal,
    shippingCost: envio,
    correoQuote: correoQuoteFinal,
    total,
    payMethod,
    status: "nuevo",
  };

  // Copia pública para que el comprador siga su pedido.
  // IMPORTANTE: sin nombre, teléfono, dirección, medio de pago ni email.
  // El código de la gift card comprada SÍ va acá: es del comprador (lo
  // necesita para regalar o usar) y no es un dato personal.
  const tracking = {
    items: itemsNormalizados.map(({ id, name, size, color, qty, price }) => ({
      id, name, size, color, qty, price,
    })),
    total,
    status: "nuevo",
    zoneId: zoneIdFinal,
    correoTracking: null,
    giftCardIssued: giftCardEmitida,
  };

  // ---- 6) Commit atómico ----
  // En la API de Firestore, "crear" y "actualizar" usan el mismo campo
  // `update`: lo que las diferencia es el `updateMask` — sin él, la
  // escritura falla si el documento ya existe (o sea, es un create);
  // con él, solo se tocan esos campos.
  //
  // OJO: `updateMask` y `currentDocument` van al nivel del Write, junto
  // a `update`, NO adentro del documento.
  const writes = [];

  // El precondition (currentDocument) hace que TODO el commit se aborte
  // si el documento cambió entre la lectura y ahora: es lo que impide
  // que dos personas se lleven el último talle.
  for (const id of Object.keys(productos)) {
    if (Object.keys(stockRestante[id]).length === 0) continue;
    writes.push({
      update: { name: `${FS_PATH}/products/${encodeURIComponent(id)}`, fields: fsFields({ stock: stockRestante[id] }) },
      updateMask: { fieldPaths: ["stock"] },
      currentDocument: { updateTime: productos[id].updateTime },
    });
  }

  // El ID del pedido es aleatorio, así que estas dos escrituras siempre
  // caen en documentos inexistentes: nunca pisan nada.
  writes.push({
    update: { name: `${FS_PATH}/orders/${orderId}`, fields: fsFields({ ...pedido, createdAt: fsTimestamp(ahora) }) },
  });
  writes.push({ update: { name: `${FS_PATH}/orderTracking/${orderId}`, fields: fsFields(tracking) } });

  if (cuponDoc) {
    writes.push({
      update: {
        name: `${FS_PATH}/coupons/${encodeURIComponent(codigo)}`,
        fields: fsFields({ usedCount: Number(cuponDoc.data.usedCount || 0) + 1 }),
      },
      updateMask: { fieldPaths: ["usedCount"] },
      currentDocument: { updateTime: cuponDoc.updateTime },
    });
  }

  // Descuenta el saldo de la gift card que se usó. Va en el MISMO commit
  // que el pedido: o se anota el pedido y se gasta el saldo, o no pasa
  // nada de las dos cosas. El updateMask hace que solo se toque
  // `usedAmount` (el código, el saldo y la fecha no se pisan nunca) y el
  // `currentDocument` aborta todo el commit si otra persona gastó de la
  // misma gift card en el meantime.
  if (giftCardDescuento > 0) {
    writes.push({
      update: {
        name: `${FS_PATH}/giftCards/${encodeURIComponent(codigoGiftCard)}`,
        fields: fsFields({
          usedAmount: Number(giftCardDoc.data.usedAmount || 0) + giftCardDescuento,
        }),
      },
      updateMask: { fieldPaths: ["usedAmount"] },
      currentDocument: { updateTime: giftCardDoc.updateTime },
    });
  }

  // Gift card comprada en este pedido: se crea el documento con el saldo
  // cargado. Sin updateMask, así que si el código ya existiera Firestore
  // rechaza el commit entero (y el pedido tampoco se crearía).
  if (giftCardEmitida) {
    writes.push({
      update: {
        name: `${FS_PATH}/giftCards/${encodeURIComponent(giftCardEmitida)}`,
        fields: fsFields({
          balance: itemGiftCard.giftcardAmount,
          usedAmount: 0,
          active: true,
          createdAt: fsTimestamp(ahora),

        }),
      },
    });
  }

  try {
    await fsCommit(env, writes);
  } catch (err) {
    if (err.status === 409 || err.status === 412) {
      return new Response(
        JSON.stringify({ error: "Se agotó el stock o el descuento mientras comprabas. Probá de nuevo." }),
        { status: 409, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }
    // Cualquier otro error de Firestore va como 503 para que el cliente sepa
    // que no se guardó nada y reintente. El commit es atómico.
    return new Response(
      JSON.stringify({
        error: "No pudimos guardar el pedido. No se cobró nada y el stock quedó como estaba; probá de nuevo en un momento.",
      }),
      { status: 503, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  // ---- 7) Aviso a Telegram. Si falla, el pedido ya quedó guardado ----
  try {
    await notificarPedido(env, orderId, pedido);
  } catch (err) {
    console.error("[createOrder] No se pudo avisar a Telegram:", err?.message || err);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      orderId,
      total,
      giftCardDiscount: giftCardDescuento,
      giftCardIssued: giftCardEmitida,
    }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
  );
}

/* ============================================================
   MiCorreo — autenticación
   ------------------------------------------------------------
   Pide un token nuevo en cada request. Para el volumen de una
   tienda chica esto es más que suficiente y evita el lío de
   guardar el token en algún lado (KV) y manejar su vencimiento.
   ------------------------------------------------------------
   El token va como cabecera "Authorization: Basic ..." con el usuario y la
   contraseña en base64; no es lo mismo que el Bearer que usan las otras APIs.
   ============================================================ */
async function getCorreoToken(env) {
  const base = env.CORREO_BASE_URL; // API de producción (va en wrangler.jsonc)
  const auth = btoa(`${env.CORREO_USER}:${env.CORREO_PASSWORD}`);
  const res = await fetch(`${base}/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) {
    throw new Error(`No se pudo autenticar con MiCorreo (${res.status})`);
  }
  const data = await res.json();
  return data.token;
}

/* ============================================================
   ACCIÓN: rates — cotiza el envío a un código postal
   ------------------------------------------------------------
   Es la acción que usa el checkout para mostrar los dos precios
   (a domicilio y a sucursal) mientras el cliente escribe el CP.
   Ojo con el status 502: no es que hayaFallado el Worker, es que
   MiCorreo no pudo cotizar. Por eso el mensaje es de 502 (gateway).
   ============================================================ */
async function handleRates(body, env, cors) {
  const { postalCodeDestination, weight, height, width, length } = body;
  if (!postalCodeDestination) {
    return new Response("Falta postalCodeDestination", { status: 400, headers: cors });
  }

  const cotizacion = await cotizarCorreo(env, postalCodeDestination, weight);

  // Antes devolvía el error crudo de MiCorreo al cliente ("Cliente FAP no
  // identificado", "Datos Inválidos"...), que no le dice nada a quien está
  // comprando. Ahora el detalle va al log y el mensaje es entendible.
  if (cotizacion.error) {
    return new Response(
      JSON.stringify({ error: "No pudimos cotizar el envío. Probá con otro código postal o elegí retiro en el local." }),
      { status: 502, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify(cotizacion), {
    status: 200, headers: { ...cors, "Content-Type": "application/json" },
  });
}

/**
 * Cotiza el envío con MiCorreo y devuelve { domicilio, sucursal }.
 * Se usa tanto para mostrar precios en el checkout como para calcular el
 * costo REAL dentro de createOrder (el cliente no puede elegirlo).
 * Si MiCorreo falla devuelve { error: true }.
 */
async function cotizarCorreo(env, postalCodeDestination, pesoGramos) {
  const peso = Number(pesoGramos) || 0;
  // Peso volumétrico aproximado: el paquete se manda en una caja chica.
  // El checkout usa los mismos defaults que esta función.
  const medidas = {
    weight: peso || 1000,
    height: 15,
    width: 25,
    length: 35,
  };

  const res = await fetch(`${env.CORREO_BASE_URL}/rates`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getCorreoToken(env)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // MiCorreo pide tres cosas: el token, el número de cliente y el CP
      // de salida. El número de cliente NO es el usuario ni la contraseña:
      // es el "ID de cliente" que figura arriba a la izquierda del panel
      // de MiCorreo (con los ceros adelante).
      customerId: env.CORREO_CUSTOMER_ID,
      postalCodeOrigin: env.CORREO_ORIGIN_POSTAL_CODE,
      postalCodeDestination: String(postalCodeDestination || ""),
      // sin deliveredType: pedimos las dos cotizaciones (domicilio y sucursal) juntas
      dimensions: medidas,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[rates] MiCorreo respondió", res.status, data.message || data);
    return { error: true };
  }

  // Nos quedamos solo con lo que el sitio necesita, separado por tipo.
  const rates = data.rates || [];
  const domicilio = rates.find((r) => r.deliveredType === "D");
  const sucursal = rates.find((r) => r.deliveredType === "S");
  return {
    domicilio: domicilio ? domicilio.price : null,
    sucursal: sucursal ? sucursal.price : null,
  };
}

/* ============================================================
   ACCIÓN: agencies — sucursales de Correo de una provincia
   ------------------------------------------------------------
   El checkout la usa para el desplegable de "retiro en sucursal":
   le pido a MiCorreo la lista y le devuelvo al sitio solo el
   código, el nombre, la ciudad y la dirección.
   ============================================================ */
async function handleAgencies(body, env, cors) {
  const { provinceCode } = body;
  if (!provinceCode) {
    return new Response("Falta provinceCode", { status: 400, headers: cors });
  }

  const token = await getCorreoToken(env);
  const base = env.CORREO_BASE_URL;

  const url = `${base}/agencies?customerId=${encodeURIComponent(env.CORREO_CUSTOMER_ID)}&provinceCode=${encodeURIComponent(provinceCode)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[agencies] MiCorreo respondió", res.status, data.message || data);
    return new Response(JSON.stringify({ error: "No pudimos traer las sucursales. Probá con otra provincia." }), {
      status: res.status, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Achicamos la respuesta a lo que el sitio va a mostrar.
  const agencies = (Array.isArray(data) ? data : []).map((a) => ({
    code: a.code,
    name: a.name,
    city: a.location?.address?.city,
    address: `${a.location?.address?.streetName || ""} ${a.location?.address?.streetNumber || ""}`.trim(),
  }));
  return new Response(JSON.stringify({ agencies }), {
    status: 200, headers: { ...cors, "Content-Type": "application/json" },
  });
}

/**
 * Formatea un número como pesos argentinos sin decimales ("$ 25.000").
 * Lo usan los avisos de Telegram y el panel; los cálculos van todos en números.
 */
function fmt(n) {
  const num = Number(n) || 0;
  return num.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

/**
 * Convierte el mapa de campos de la API REST de Firestore en un objeto normal
 * de JavaScript. Es la operación inversa de `fsFields`: leo lo que escribí.
 */
function parseFirestoreFields(fields) {
  const out = {};
  for (const key in fields || {}) out[key] = parseValue(fields[key]);
  return out;
}

/**
 * Convierte UN valor de Firestore a JavaScript. La API REST no manda un
 * `5` pelado: manda `{ integerValue: "5" }`, y cada tipo viene con su clave.
 * Por eso el if de cada tipo: es un "desarmar la etiqueta" del que vino.
 */
function parseValue(v) {
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return Number(v.doubleValue);
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.nullValue !== undefined) return null;
  // Las fechas llegan como texto ISO ("2026-10-01T12:00:00.000Z"), que es
  // justo lo que necesita Date. Antes no se parseaban y quedaban en null:
  // sin esto el Worker no puede leer el createdAt de una gift card y por
  // lo tanto tampoco puede saber si venció.
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.mapValue !== undefined) return parseFirestoreFields(v.mapValue.fields);
  if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(parseValue);
  return null;
}