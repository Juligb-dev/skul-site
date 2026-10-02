/**
 * ============================================================================
 * SKUL — CLOUDFLARE WORKER: el backend de confianza de la tienda
 * ============================================================================
 *
 * QUÉ ES UN CLOUDFLARE WORKER
 * ---------------------------
 * Es un archivo JavaScript que Cloudflare me ejecuta como un servidor, sin
 * que tengas una máquina. No es una página: no es HTML, no tiene un layout.
 * Es una función que corre cuando alguien llama a una URL pública y termina.
 * Lo ejecuto en el runtime de Cloudflare, que es el mismo `fetch` que usan
 * los navegadores, así que puedo hacer pedidos salientes (`fetch`) y criptografía
 * con WebCrypto (`crypto.subtle`), pero NO tengo sistema de archivos y
 * cualquier variable que guarde se pierde cuando el proceso se recicla.
 *
 * El sitio en cambio es estático (Vite lo compila a archivos sueltos que se
 * suben a Firebase Hosting). Por eso esta lógica va aparte y se despliega con:
 *
 *     cd cloudflare-worker && npx wrangler deploy
 *
 *
 * POR QUÉ EXISTE ESTE ARCHIVO (lo más importante de todo)
 * -------------------------------------------------------
 * El navegador NO es confiable. Todo lo que corre en la pestaña de quien
 * compra se puede editar desde la consola: si el checkout calculara el precio
 * final, descontara el saldo de una gift card o restara stock desde el
 * cliente, cualquiera podría mandar un total falso.
 *
 * REGLA DE ORO: EN LOS PRECIOS MANDA EL SERVIDOR.
 * El navegador solo manda QUÉ quiere comprar y CÓDIGOS (cupón, gift card).
 * Yo leo los saldos reales del catálogo, calculo el total, descuento y recién
 * ahí creo el pedido. Todo eso pasa adentro de un MISMO commit atómico de
 * Firestore (`documents:commit`), o sea una sola operación que se aplica
 * entera o no se aplica: si dos personas compran la misma gift card al mismo
 * tiempo, una de las dos Transactions falla y se le avisa para que reintente.
 * Ese es el motivo de todo este archivo.
 *
 * Además de los precios, desde acá también:
 *   - valido que quien llama sea el admin (para firmar subidas de imágenes),
 *   - aviso los pedidos por Telegram sin exponer el token del bot,
 *   - cotizo envíos y listo sucursales con Correo Argentino (MiCorreo),
 *   - y limito cuántas veces me pueden llamar por IP y por acción.
 *
 *
 * CÓMO LLAMAN ACÁ
 * ----------------
 * Un único endpoint: yo ataco la misma URL para todas las acciones. Entra el
 * body, se rutea por el campo "accion" y sale JSON. Un solo endpoint es más
 * simple que mantener veinte rutas, y además me deja poner el rate limit, el
 * CORS y el manejo de errores en un único lugar.
 *
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
 * Ojo, la lista de arriba quedó desactualizada en un punto: hoy hay SEIS
 * acciones, no cinco. La sexta es "signUpload", que devuelve la firma para
 * subir una foto de producto a Cloudinary y es la ÚNICA que exige estar
 * logueado como admin (ver handleSignUpload más abajo). Y de paso, "createOrder"
 * ya no es implícita como dice el texto: se pide explícitamente con
 * `{"action":"createOrder"}`; lo único implícito es que si NO viene ninguna
 * acción asumo "notify", para no romper el sitio viejo que mandaba el body
 * sin ese campo.
 *
 *
 * LOS SECRETOS QUE NECESITO (y por qué NO van en el navegador)
 * ----------------------------------------------------------
 * En Cloudflare los secretos se cargan aparte del código, con
 * `wrangler secret put <NOMBRE>` o desde el panel, y me llegan a mí en el
 * segundo parámetro del fetch, el objeto `env`. Eso es justamente lo que los
 * hace seguros: no están en el bundle que se descarga el visitante, así que
 * aunque la persona abra las herramientas de developer no los puede leer.
 *
 * Los que uso (los VALORES no están acá en ningún lado, van en el panel):
 *   - TELEGRAM_BOT_TOKEN   -> el token que te da @BotFather. Con esto firmo
 *                             los mensajes; si viviera en el bundle, cualquiera
 *                             te escribiría en tu Telegram.
 *   - TELEGRAM_CHAT_ID     -> a qué chat mando los avisos.
 *   - FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY -> la cuenta de servicio
 *                             con la que entro a Firestore.
 *   - CORREO_USER y CORREO_PASSWORD -> usuario y contraseña de MiCorreo.
 *   - CLOUDINARY_API_SECRET -> con esto se calcula la firma de las subidas.
 *
 * Y en texto plano (no son secretos) en `wrangler.jsonc`: CORREO_BASE_URL,
 * CORREO_CUSTOMER_ID, CORREO_ORIGIN_POSTAL_CODE, FIREBASE_API_KEY,
 * CLOUDINARY_CLOUD_NAME y CLOUDINARY_API_KEY.
 *
 * Las credenciales de MiCorreo (usuario/contraseña/customerId)
 * viven acá como variables de entorno privadas del Worker.
 * NUNCA van al navegador. Ver README.md de esta carpeta para
 * cómo cargarlas.
 *
 *
 * POR QUÉ EL ACCESS TOKEN DE GOOGLE NO PUEDE IR EN EL FRONT
 * -------------------------------------------------------
 * Para leer `/orders` (que es privada, porque tiene nombre, teléfono y
 * dirección) necesito acreditar quién soy, y en este caso qué soy: una
 * cuenta de servicio. La forma canónica sería usar el SDK de Firebase Admin,
 * que ya sabe armar el JWT por mí, pero ese paquete no se puede empaquetar
 * para el runtime de Workers. Así que lo hago a mano en `firmarJwt`:
 * monto un JWT (un texto con tres partes separadas por puntos: cabecera,
 *ayload y firma) y lo canjeo por un access token de Google.
 *
 * Ese access token es la Contraseña de la tienda: con él se lee y se escribe
 * TODO Firestore sin pasar por las reglas. Si estuviera en el bundle del
 * navegador, cualquiera que abra la consola se lo lleva y nos borra la base
 * entera. Por eso vive acá, en un secret, y por eso me autentico yo solo.
 *
 *
 * CÓMO LEE FIRESTORE (importante)
 * -------------------------------
 * Yo no uso el SDK de Firestore: hablo con la API REST de Firestore, que es
 * la misma API por HTTP que usa la consola de Firebase. Se accede con URLs
 * del tipo:
 *
 *     GET https://firestore.googleapis.com/v1/projects/<proj>/databases/(default)/documents/orders/<id>
 *
 * y los valores NO van como JSON normal: van envueltos, cada uno con la clave
 * de su tipo (un string es `{stringValue:"x"}`, un número es `{integerValue:"5"}`,
 * un objeto es `{mapValue:{fields:{...}}}`). Todo el ida y vuelta de esos
 * envoltorios lo hacen los helpers de esta misma archivo: `fsValue` los arma
 * para escribir, `parseValue`/`parseFirestoreFields` los desenvuelven para leer.
 *
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
 */

// El id del proyecto de Firebase. Va hardcodeado porque no es secreto:
// es como el nombre de la base de datos, aparece en la consola igual.
const FIREBASE_PROJECT_ID = "skullt";

/**
 * Base de la API de Firestore (REST) que usa la cuenta de servicio.
 * O sea: el prefijo de todas las URLs de lectura/escritura que llamo abajo.
 */
const FS_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
// Rutas de documentos dentro del commit. Dentro de un documents:commit los
// documentos van con la ruta RELATIVA
// ("projects/.../documents/..."), no con la URL completa: es la misma ruta que
// tengo en FS_URL pero sin el dominio, y por eso la guardo aparte.
const FS_PATH = `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

/**
 * Los medios de pago que aceptamos, con el nombre lindo para el Telegram.
 * El índice (`debito`, `credito`, ...) es lo que llega del navegador; lo uso
 * para validar y lo paso por este diccionario para no mandar claves crudas
 * al chat.
 */
const PAY_LABELS = {
  debito: "Débito",
  credito: "Crédito",
  transferencia: "Transferencia",
  efectivo: "Efectivo (cita previa)",
};

/**
 * Los headers de CORS (la respuesta que le dice al navegador "dejá que esta
 * página te hable a mí"): CORS es el permiso que le pide el navegador a mi
 * servidor antes de dejarlo hacer un pedido desde otra web. Si no contesto
 * bien, el navegador frena la respuesta y el JS ni se entera de qué pasó.
 *
 *  - Allow-Methods: los verbos que acepto. OPTIONS es el "preflight" que el
 *    navegador manda antes del pedido real para preguntar qué se permite.
 *  - Allow-Headers: qué cabeceras Custom puede mandar el JavaScript del sitio.
 *  - Max-Age: cuánto segundos puede guardar el navegador esta respuesta, así
 *    no pregunta de nuevo en cada pedido.
 *  - Vary: Origin — le digo "esta respuesta depende de quién pregunta", para
 *    que el caché de Cloudflare no le muestre a uno lo que le correspondía a otro.
 *
 * OJO: acá NO va el Access-Control-Allow-Origin, porque el valor depende de
 * qué sitio esté llamando: lo agrega corsHeaders() más abajo.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
};

/* Orígenes desde los que se permite llamar al Worker.
 *
 * El origen es el `protocolo://dominio:puerto` de la página que llama: es lo
 * único que el navegador le garantiza a mi servidor sobre quién pregunta, así
 * que es la única lista blanca que tengo.
 *
 * Con "*" el Worker quedaba disponible desde cualquier web: cualquiera
 * que encontrara esta URL podría gastarte la cuota de MiCorreo o
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
 * Arma los headers de CORS para esta respuesta concreta.
 *
 * Si el que llama es un origen de mi lista, le devuelvo su propio origen (y
 * NO un "*"): el navegador exige que Allow-Origin coincida exactamente con
 * el sitio que pregunta, y además no acepta "*" en pedidos con credenciales.
 * Si el origen no está en la lista, devuelvo los headers sin Allow-Origin, y
 * el navegador bloquea la respuesta por su cuenta. Yo igual atiendo el
 * pedido (no puedo evitarlo desde acá), por eso el rate limit es la barrera
 * de verdad y no el CORS.
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

   CÓMO FUNCIONA UN RATE LIMIT EN MEMORIA
   --------------------------------------
   Un isolate es una instancia del proceso que me ejecuta. Cloudflare tiene
   muchas corriendo en paralelo y reparte los pedidos entre ellas, así que
   este `Map` no es una base: es un cuaderno de la libreta del isolate.
   Cada entrada dice cuántas veces pasó por acá (cuenta) y hasta cuándo no
   cuenta más (reiniciaEn).

   LA LIMITACIÓN REAL: este cuaderno se pierde en CADA despliegue (wrangler
   deploy lo reinicia) y también cada vez que Cloudflare recicla el proceso,
   que puede pasar en cualquier momento aunque no despleguemos. O sea, un
   atacante que abre 50 conexiones va a caer en 50 isolates distintos y cada
   uno le concede su propio cupo completo. Sirve para frenar al que se pasa
   de miles de golpes seguidos desde una sola conexión, no para un
   ataque distribuido. Si alguna vez necesito un límite que no se pueda
   resetear así, el lugar es un KV de Cloudflare o Durable Objects.
   ============================================================ */
/**
 * Cuántas llamadas por minuto acepta cada acción. Cuanto más caro o más
 * sensible es el endpoint, menos le dejo:
 *
 *  - notify / subscribe: barato para mí (una lectura + un mensaje) pero es la
 *    vía para escribirte en el Telegram, así que va justo.
 *  - rates / agencies: cada llamada le pega a la API de MiCorreo y eso tiene
 *    cuota, así que es el que más se vigila.
 *  - createOrder: el más estricto, porque es el que escribe en Firestore.
 *  - signUpload: más alto porque el panel puede subir varias fotos seguidas
 *    de un tirón y cada firma es un cálculo trivial.
 *
 * ventanaMs: cuándo se reabre la ventana (un minuto).
 */
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

/**
 * El cuaderno del isolate: clave "acción|IP" -> { cuenta, reiniciaEn }.
 * Vive en el scope del módulo, o sea que lo comparten todos los pedidos que
 * caen en ESTE isolate (y solo este).
 */
const golpes = new Map();

/**
 * Suma un golpe y devuelve si esta llamada ya se pasó del límite.
 *
 * La clave combina acción e IP a propósito: si mirara solo la IP, una familia
 * que compra y además cotiza tres envíos se quedaría sin cuota entre las dos
 * cosas. Y si mirara solo la acción, un atacante rotando IPs no frena nada.
 *
 * Devuelve `true` = cortar acá con un 429. `false` = seguí.
 */
function excedeLimite(accion, ip) {
  const cfg = LIMITES[accion];
  // Si la acción no tiene límite configurado, no limito nada. (Hoy están
  // todas, pero prefiero que una acción nueva nazca libre y no bloqueada.)
  if (!cfg) return false;

  const ahora = Date.now();
  const clave = `${accion}|${ip}`;
  let reg = golpes.get(clave);

  // Primera llamada, o la ventana anterior ya cerró: arranco una ventana nueva.
  if (!reg || reg.reiniciaEn <= ahora) {
    reg = { cuenta: 0, reiniciaEn: ahora + cfg.ventanaMs };
    golpes.set(clave, reg);
  }
  reg.cuenta++;

  // Limpieza perezosa para que el Map no crezca sin control.
  // "Perezosa" quiere decir que no hay un temporizador que lo limpie: cada
  // tanto que crecen mucho,`tiro` las ventanas ya cerradas y me quedo solo
  // con las vivas. Es O(n) pero solo pasa cada tanto, así que no importa.
  if (golpes.size > 5000) {
    for (const [k, v] of golpes) {
      if (v.reiniciaEn <= ahora) golpes.delete(k);
    }
  }

  return reg.cuenta > cfg.max;
}

/**
 * ============================================================================
 * EL ENTRYPOINT: el único fetch que tengo. Acá Cloudflare me pasa cada
 * pedido HTTP que llega a la URL del Worker.
 * ============================================================================
 *
 * `request` es el pedido (método, headers, body) y `env` son mis secretos.
 *
 * El orden de las comprobaciones es a propósito y es el que hace que el
 * Worker sea barato ante abuso: primero lo que no cuesta nada (CORS, método,
 * JSON, rate limit) y recién después lo caro (Firestore, MiCorreo, Telegram).
 * Un atacante que se pasa del rate limit no llega a tocar ni una API.
 */
export default {
  async fetch(request, env) {
    // Los headers de CORS se calculan una sola vez y se reutilizan en todas
    // las respuestas, incluidas las de error: un error sin CORS tampoco lo
    // puede leer el navegador y el sitio se quedaría sin saber qué pasó.
    const cors = corsHeaders(request);

    // El preflight de CORS: el navegador manda un OPTIONS vacío antes del
    // pedido real para preguntar qué se permite. Le respondo 200 sin cuerpo.
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }
    // Solo hay un verbo. Un GET a esta URL casi seguro es que alguien la
    // abrió en la barra de direcciones para ver qué hace.
    if (request.method !== "POST") {
      return new Response("Método no permitido", { status: 405, headers: cors });
    }

    // El body tiene que ser JSON.parseable. Si no lo es, no hay acción que
    // rute y no vale la pena seguir.
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("JSON inválido", { status: 400, headers: cors });
    }

    const action = body.action || "notify"; // sin action = comportamiento viejo (Telegram)

    // Corte por exceso de peticiones antes de tocar nada (ni Firestore,
    // ni MiCorreo, ni Telegram).
    //
    // La IP me la da Cloudflare en CF-Connecting-IP: es la real del visitante
    // que forwarded, no la del proxy. Cloudflare no me deja mandarle al
    // cliente un header de IP inventado, así que no se puede falsear.
    const ip = request.headers.get("CF-Connecting-IP") || "desconocido";
    if (excedeLimite(action, ip)) {
      return new Response("Demasiadas consultas. Probá de nuevo en un momento.", {
        status: 429,
        headers: cors,
      });
    }

    // A partir de acá se rutea por acción. Cada handler devuelve su propia
    // Response, así que no hay un return final común: si la acción no está
    // en la lista, caigo en el 400 de abajo.
    try {
      if (action === "notify") return await handleNotify(body, env, cors);
      if (action === "createOrder") return await handleCreateOrder(body, env, cors);
      if (action === "subscribe") return await handleSubscribe(body, env, cors);
      if (action === "signUpload") return await handleSignUpload(body, env, cors, request);
      if (action === "rates") return await handleRates(body, env, cors);
      if (action === "agencies") return await handleAgencies(body, env, cors);
      return new Response("Acción desconocida", { status: 400, headers: cors });
    } catch (err) {
      // Este es el ÚNICO catch que envuelve a todos los handlers, así que
      // es la red de seguridad: cualquier excepción que se escape de un
      // handler (un `await` que revienta, un undefined, etc.) termina acá.
      //
      // El detalle va al log del Worker (wrangler tail / dashboard) para
      // poder diagnostics, pero al que llama le devolvemos un mensaje
      // genérico: antes se le filtraban a la calle textos internos de
      // Firestore y hasta una pista del email de la cuenta de servicio.
      //
      // Y lo importante: acá solo hay errores de LECTURA o de INTEGRACIÓN
      // (un pedido ya guardado, un Telegram que no llegó). Los de escritura
      // los maneja cada handler con su propio catch, porque solo quien sabe
      // si ya guardó algo puede garantizar que no quedó nada a medias.
      console.error(
        `[${action}] Error:`,
        err?.message || err,
        err?.stack ? `\n${err.stack}` : "",
        err?.status ? `status=${err.status}` : ""
      );
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

   EL FLUJO, PASO A PASO:
   1. Armo un JWT con mis credenciales (lo firma mi clave privada).
   2. Se lo mando a Google y Google me devuelve un access_token.
   3. Mando ese token en cada pedido a Firestore como
      `Authorization: Bearer <token>`.
   El paso 3 se puede saltear si no cargué las credenciales: sigo
   leyendo sin token y son solo las colecciones públicas las que me
   van a responder.
   ============================================================ */

/**
 * El token en memoria del isolate, con la hora en que lo doy por vencido.
 * OJO: se borra en cada despliegue (y a veces sin desplegar), así que es
 * solo una caché en memoria, no un almacén. Nunca lo escribo en un archivo
  * ni lo devuelvo
 * a nadie: acá muere.
 */
let cachedToken = null; // { token, expiraEn }

/**
 * Devuelve un access token válido para pegarle a la API REST de Firestore,
 * o `null` si no hay credenciales cargadas (y en ese caso se lee sin token).
 *
 * El cacheo tiene sentido porque GoogleEncode tarda y tiene cuota: si
 * pedirlo un token nuevo en cada pedido, cada compra Our taría unaida ida y
 * vuelta de más. Como dura una hora, y nosotros hacemos unas cuantas
 * peticiones por minuto, reaches 50 veces por hora con un solo canje es
 * más que de sobra.
 */
async function getFirestoreToken(env) {
  // Si no hay credenciales cargadas, devolvemos null y el Worker
  // sigue leyendo sin token (compatibilidad con lo que ya andaba).
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return null;

  const ahora = Date.now();
  // Todavía sirve el de la vuelta pasada: lo reuso.
  if (cachedToken && cachedToken.expiraEn > ahora) return cachedToken.token;

  // Armo el JWT. Sus "claims" son los datos que afirmo de mí: quién soy (iss),
  // qué permiso pido (scope), a quién se lo pido (aud) y cuándo (iat/exp).
  // Google los verifica firmando él mismo con mi clave pública, así que si
  // los tres cuadran, sabe que el string lo generé yo y no un impostor.
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

  // Canjeo: mando el JWT en el body y Google me devuelve el access_token.
  // El grant_type "jwt-bearer" es el que le dice "no vine con usuario y
  // contraseña, vine con este JWT firmado".
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
  // Si Google responde 200 pero sin access_token (o con otra forma de
  // error), cachear eso dejaba al isolate guardando un token undefined y
  // TODAS las compras devolvían 401 -> 500 hasta que el isolate se
  // reiniciara sola. Mejor fallar acá, con un mensaje claro.
  if (!data || typeof data.access_token !== "string" || !data.access_token) {
    throw new Error(`Firebase no devolvió un access_token válido: ${JSON.stringify(data)}`);
  }

  // Corto un poco antes de que venza por si el reloj del isolate va justo.
  // Google lo da por 1 hora; yo lo doy por 50 minutos, para que ningún
  // pedido se mande con un token que vence en el aire.
  cachedToken = { token: data.access_token, expiraEn: ahora + 50 * 60 * 1000 };
  return cachedToken.token;
}

/**
 * Firma un JWT con la clave privada de la cuenta de servicio.
 *
 * Lo hago a mano en vez de usar el SDK de Firebase Admin porque ese paquete
 * no se empaqueta para el runtime de Workers. Son tres pasos:
 *
 *   1. Serializo cabecera y payload a JSON y los convierto a base64url
 *      (base64 sin los caracteres `+` y `/`, que romperían el separador).
 *   2. Importo mi clave privada (que está en formato PEM, con el bloque de
 *      texto `-----BEGIN...-----`) a un objeto criptográfico de WebCrypto.
 *   3. Firmo `header.payload` con RSA y concateno las tres partes con puntos.
 *
 * El resultado es un texto `aaa.bbb.ccc`. Google no necesita mi secreto para
 * leerlo: la clave pública que tiene registrada verifica que la firma sea
 * mía. Por eso esto no filtra nada y puedo hacerlo por HTTP común.
 */
async function firmarJwt(env, claims) {
  // Base64 URL-safe: base64 normal, pero con `-` en vez de `+`, `_` en vez de
  // `/` y sin el `=` de relleno.
  const b64url = (input) =>
    btoa(String.fromCharCode(...input))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  // 1) La cabecera dice con qué algoritmo firmo. RS256 = RSA con SHA-256.
  const header = { alg: "RS256", typ: "JWT" };
  const head = b64url(new TextEncoder().encode(JSON.stringify(header)));
  const body = b64url(new TextEncoder().encode(JSON.stringify(claims)));
  // Lo que realmente se firma: las dos partes pegadas con un punto.
  const data = new TextEncoder().encode(`${head}.${body}`);

  // La clave privada llega como secret de Wrangler con los \n literales.
  // El panel de Cloudflare no me deja meter saltos de línea de verdad en un
  // secret, así que los pego como texto "\n" y los convierto acá.
  const pem = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");
  // Le saco el armazón `-----BEGIN/END PRIVATE KEY-----` y todos los espacios,
  // dejando el base64 pelado que es lo que atob() entiende.
  const binario = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const keyData = Uint8Array.from(atob(binario), (c) => c.charCodeAt(0));

  // 2) Importo la clave. "pkcs8" es el formato del archivo .json de Firebase.
  // El `false` es que no la exporto para afuera; el ["sign"] es que la única
  // cosa que voy a hacer con ella es firmar (nunca verificar).
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  // 3) Firmo y devuelvo header.payload.firma.
  const firma = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, data);
  return `${head}.${body}.${b64url(new Uint8Array(firma))}`;
}

/**
 * Lee un documento de Firestore por su ruta ("orders/abc").
 * Devuelve null si no existe.
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

   LA REGLA: el id solo puede tener caracteres que en una URL no puedan
   cambiar de carpeta. Con este patrón no hay "/" ni "." que puedan hacer
   de ".." ni % ni espacios raros. El rango de 1 a 128 también acota que
   nadie me mande un id kilométrico.
   ============================================================ */
/**
 * El patrón que tiene que cumplir un id que viene de afuera. Lo aplico
 * SIEMPRE antes de meter un id en una ruta de Firestore.
 */
const ID_SEGURO = /^[A-Za-z0-9_-]{1,128}$/;
// Los suscriptores se guardan por email, así que su id puede traer
// @ y . — pero nada de / ni de ..
const ID_SEGURO_EMAIL = /^[A-Za-z0-9_.@-]{1,200}$/;

/**
 * true si el id es seguro de interpolar en una ruta.
 * La segunda versión acepta el patrón "flojo" para los casos donde el id
 * sí puede llevar @ (los suscriptores, que son emails).
 */
function idSeguro(id, patron = ID_SEGURO) {
  return typeof id === "string" && patron.test(id);
}

/**
 * Lee un documento de Firestore por su ruta ("orders/abc").
 * Devuelve null si no existe.
 */
async function fsGetDoc(env, path) {
  const d = await fsGetDocRaw(env, path);
  return d ? d.data : null;
}

/**
 * Pide un documento a Firestore pasando por el access token de la cuenta de
 * servicio, y devuelve el status para que el que llama decida.
 *
 * Este es el ÚNICO lugar del archivo que le pone el header Authorization a un
 * pedido a Firestore. Si no tengo token, se lo mando sin header y Firestore
 * me va a responder 401 o 403 según lo que las reglas dejen pasar.
 *
 * Si Firestore responde 401, el token cacheado quedó viejo (venció antes de
 * la cuenta de 50 minutos, o la clave se rotó): se tira el token y se
 * reintenta UNA vez con uno nuevo. Sin esto, un solo token vencido dejaba
 * todas las compras en 500 durante hasta 50 minutos.
 */
async function fsFetch(env, url, init) {
  let res = null;

  // Un máximo de dos vueltas: la primera con lo que haya en cache, y si vino
  // un 401, una segunda con un token recién generado.
  for (let intento = 0; intento < 2; intento++) {
    const accessToken = await getFirestoreToken(env);
    res = await fetch(url, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        // Si hay token, lo agrego. Si no, sigo sin header (compatibilidad con
        // el modo "sin credenciales" que ya se explica arriba).
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });
    // Solo reintentamos si el 401 vino de un token que éramos nosotros los
    // que cacheamos (o sea, que se nos venció), no de permisos.
    if (res.status !== 401 || !accessToken) break;
    // Tiro el token cacheado para que la próxima vuelta genere uno nuevo.
    cachedToken = null;
  }

  return res;
}

/**
 * Igual que fsGetDoc pero devuelve también el "updateTime" del documento,
 * que se usa como precondition en el commit: si el documento cambió entre
 * la lectura y la escritura, Firestore aborta el commit y podemos
 * reintentar. Así dos personas no pueden comprar el último talle.
 *
 * O sea, este helper es el que me da el "VISTO" con el que después comparo
 * en el commit. El updateTime es una marca de tiempo que pone Firestore en
 * cada cambio: si alguien tocó el documento después de que yo lo leí, la
 * marca es distinta y el commit se aborta.
 */
async function fsGetDocRaw(env, path) {
  const url = `${FS_URL}/${path}`;
  // Guardo el token de ANTES de pedir, solo para saber si el 401/403 viene
  // de "no tengo credenciales" o de "las tengo pero no me dejan".
  const accessToken = cachedToken?.token || null;
  const res = await fsFetch(env, url);

  // 404 = no existe ese documento. No es un error: es una respuesta válida
  // ("ese cupón no existe", "esa gift card no existe").
  if (res.status === 404) return null;

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
  // Te devuelvo { data (los campos ya desenvueltos a JS), updateTime, exists }.
  return { data: parseFirestoreFields(doc.fields), updateTime: doc.updateTime || null, exists: true };
}

/**
 * Aplica varias escrituras de Firestore de forma ATÓMICA (todas o ninguna).
 *
 * ESTA ES LA PIEZA CENTRAL DE TODO EL ARCHIVO. La API REST tiene un endpoint
 * `:commit` donde le paso un arreglo de escrituras y Firestore las aplica
 * como una sola Transactions: si alguna falla (por ejemplo porque un
 * precondition no cuadra), NO se aplica ninguna y me devuelve un error.
 * Es la misma garantía que te da una transaction del SDK, pero por HTTP.
 *
 * Por qué me importa tanto: en createOrder escribo stock, pedido,
 * seguimiento, cupón y gift card. Si eso no fuera atómico, un corte de luz a
 * mitad de camino podría dejarte un pedido guardado sin haber descontado el
 * stock (vendés dos veces el mismo talle) o con la gift card gastada pero
 * sin pedido. Con `:commit` no hay ese estado intermedio posible.
 */
async function fsCommit(env, writes) {
  // Si no hay nada que escribir, no llamo a la API: no hay por qué gastar
  // una request ni arriesgarme a un error.
  if (!writes.length) return;

  const res = await fsFetch(env, `${FS_URL}:commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ writes }),
  });

  if (!res.ok) {
    const texto = await res.text();
    // Le pego el status al error, porque el handler de createOrder lo usa
    // para diferenciar "se agotó el stock" (409/412, que es una condición de
    // carrera normal) de "Firestore está caído" (cualquier otra cosa).
    const err = new Error(`Firestore rechazó el commit (${res.status}): ${texto}`);
    err.status = res.status;
    throw err;
  }
}

/**
 * Convierte un valor de JS en el formato de campos que pide la API REST.
 *
 * ESTE ES EL "TRADUCTOR DE IDA". La API REST de Firestore no acepta JSON
 * normal: cada valor viaja dentro de un objeto con la clave de su tipo, y un
 * objeto común es un `mapValue` con sus campos adentro. Por eso, antes de
 * mandar cualquier cosa a Firestore, todo pasa por acá.
 */
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

/**
 * Traduce UN valor de JavaScript al envoltorio que la API REST entiende.
 *
 * El caso que más importa es el último: si me llega un objeto que YA tiene
 * una sola clave de tipo (por ejemplo lo que produce `fsTimestamp`), lo
 * devuelvo tal cual. Si no, un timestamp quedaría guardado como un mapa
 * nested y el panel de admin no lo podría ordenar por fecha ni filtrar.
 *
 * Ojo con los enteros: los enteros viajan como texto, porque el JSON no
 * distingue un entero de un decimal y Firestore los separa en `integerValue`
 * y `doubleValue`. Un número con decimales va como `doubleValue`.
 */
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

/**
 * Aplica `fsValue` a TODOS los campos de un objeto de una sola vez.
 * Es lo que uso en cada `fields: fsFields({...})` del commit: me ahorro
 * tener que envolver cada clave a mano.
 */
function fsFields(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fsValue(v)]));
}

/**
 * Fecha/hora en el formato que usa Firestore.
 *
 * Firestore guarda las fechas como texto ISO 8601 con la Z al final
 * ("2026-10-01T12:00:00.000Z"), que es UTC. Con un `new Date(...)` yo me
 * aseguro ese formato sin Importar nada.
 *
 * Esto es lo que permite que el panel ordene pedidos por fecha y no por
 * texto cualquier cosa.
 */
function fsTimestamp(ms = Date.now()) {
  return { timestampValue: new Date(ms).toISOString() };
}

/**
 * ID de documento al estilo de Firestore (20 caracteres seguros).
 *
 * Por qué 20 letras/números barajados y no algo más lindo como un contador
 * "pedido-0001": los IDs de Firestore NO se pueden ver en un listado salvo
 * que sewap MemoHit uno al azar, así que si fueran consecutivos, cualquiera
 * podría adivinar el siguiente y meter un "get" sobre el pedido de otro.
 * Barajando, el espacio es enorme (62^20) y adivinar es imposible.
 *
 * Los bytes salen de crypto.getRandomValues, que es un generador criptográfico
 * (no el Math.random, que es predecible). El módulo sobre el largo del
 * alfabeto (b % 62) reparte parejo porque los bytes van de 0 a 255 y 62 no
 * divide a 256: hay un leve sesgo, irrelevante para IDs.
 */
function nuevoId(length = 20) {
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
}

/**
 * Manda un texto al chat de Telegram. Lanza si Telegram responde error.
 *
 * UN BOT DE TELEGRAM ES UN USUARIO MÁS. La API es: le decís qué bot sos
 * (metiendo el token en la URL) y a qué chat le escribo, y Telegram manda el
 * mensaje como si lo mandara ese bot. No hay "panel" ni "clave de API": el
 * token ES la autorización, y por eso vive como secreto del Worker. Si
 * estuviera en el bundle del sitio, cualquiera se lo lleva y te escribe
 * desde tu propio bot.
 *
 * Lanza (no devuelve false) porque los dos que me llaman (handleNotify y el
 * paso 7 de createOrder) quieren decidir en su catch qué le dicen al cliente.
 */
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

/**
 * Arma el texto del aviso de pedido y lo manda a Telegram.
 *
 * ESTE FORMATO ES EL QUE VES EN EL TELEGRAM. Todo lo que aparece acá es dato
 * que ya viene del documento de Firestore (o del objeto `pedido` que armó
 * createOrder), NUNCA texto que mande el navegador: por eso no hay nada que
 * un atacante pueda escribir acá.
 *
 * Se usa desde createOrder (con el pedido recién creado, en memoria) y desde
 * la acción notify (que relee el pedido de Firestore). Es el mismo mensaje en
 * los dos casos, para que el Telegram se vea siempre igual.
 */
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
   Es la acción más simple de las que leen datos: el navegador me
   manda un orderId, yo releo el pedido de Firestore y rearmo el
   aviso. Sirve para los casos en que el aviso en vivo falló y
   querés reenviarlo a mano.
   ============================================================ */
/**
 * Responde a la acción "notify".
 *
 * Tiene DOS caminos distintos según venga `tipo`:
 *   - sin `tipo` (o cualquier otro): aviso de pedido normal. El navegador
 *     manda el orderId y YO leo el pedido de Firestore para armar el texto.
 *   - con `tipo: "arrepentimiento"`: el navegador manda el texto del aviso
 *     (es el único endpoint donde pasa eso) y yo lo reenvío con cuidado.
 */
async function handleNotify(body, env, cors) {
  const { orderId, tipo, data } = body;

  // ---- Camino B: solicitud de arrepentimiento (derecho de desistimiento) ----
  if (tipo === "arrepentimiento" && data) {
    // Este es el ÚNICO aviso donde el navegador manda el texto del mensaje
    // (el de pedidos manda el ID y el Worker arma el texto leyendo el
    // documento; el del newsletter manda el ID y lee el mail). Eso lo
    // deja abierto: sin estas validaciones, cualquiera que encuentre la
    // URL del Worker podía mandar el texto que quisiera a tu Telegram
    // (10 por minuto), suplantar un cliente con un mail de phishing en el
    // campo "contacto", o reventar la API de Telegram con campos de 10 MB.
    //
    // Se acotan los cinco campos que se imprimen, se limpian los saltos de
    // línea (para no armar un mensaje falso con "Cliente:" o "Pedido:"
    // injections) y se rechaza lo que no tenga forma.

    // Tiene que ser un objeto. Si viene un string o un array, no hay campos
    // que leer y lo trato como inválido.
    if (typeof data !== "object" || Array.isArray(data)) {
      return new Response("Datos inválidos", { status: 400, headers: cors });
    }

    // El máximo que permito por campo. Evita el abuso de mandar un campo de
    // 10 MB para reventar la request de Telegram.
    const LIMITE_CAMPO = 200;
    // El limpiador: si no es string, lo vuelvo vacío; si es, reemplazo
    // cualquier whitespace (incluidos los \n) por un espacio, recorto los
    // espacios de los bordes y me quedo con los primeros 200 caracteres.
    const limpio = (v) => {
      if (v == null) return "";
      if (typeof v !== "string") return "";
      return v.replace(/\s+/g, " ").trim().slice(0, LIMITE_CAMPO);
    };

    // Extraigo y limpio los cinco campos que se van a imprimir.
    const pedido = limpio(data.pedido);
    const nombre = limpio(data.nombre);
    const contacto = limpio(data.contacto);
    const fecha = limpio(data.fecha);
    const motivo = limpio(data.motivo);

    // Sin pedido ni nombre no se sabe de qué se trata: no se avisa.
    // Con al menos uno de los dos me alcanza.
    if (!pedido && !nombre) {
      return new Response("Falta el pedido o el nombre", { status: 400, headers: cors });
    }

    // Armo las líneas del mensaje. El `motivo` es opcional: si está vacío,
    // el filtro de abajo saca esa línea en vez de mandar una vacía.
    const lines = [
      "🔄 SOLICITUD DE ARREPENTIMIENTO — SKUL",
      "",
      `Pedido: ${pedido || "-"}`,
      `Nombre: ${nombre || "-"}`,
      `Contacto: ${contacto || "-"}`,
      `Fecha compra: ${fecha || "-"}`,
      motivo ? `Motivo: ${motivo}` : "",
    ].filter((l) => l !== "");

    try {
      await sendTelegram(env, lines.join("\n"));
    } catch (err) {
      // Si Telegram falla, NO se le dice al visitante que se envió: esta
      // es una notificación legal y el sitio la muestra como enviada igual.
      // Con el aviso logged, al menos queda registro para recuperarlo.
      // Acá no se guardó nada en Firestore, así que no hay nada a medias
      // que arreglar: el 502 es honesto.
      console.error("[arrepentimiento] No se pudo avisar a Telegram:", err?.message || err);
      return new Response("No se pudo registrar el aviso", { status: 502, headers: cors });
    }
    return new Response("ok", { status: 200, headers: cors });
  }

  // ---- Camino A: aviso de pedido normal ----

  // Tiene que venir un orderId, y tiene que ser string (para no mandar
  // un objeto que después rompa el encodeURIComponent).
  if (!orderId || typeof orderId !== "string") {
    return new Response("Falta orderId", { status: 400, headers: cors });
  }
  // El id va en la ruta de Firestore, así que lo paso por el filtro de ids
  // seguros: sin esto, un "../settings/site" me sacaría el documento de
  // otra colección (ver el bloque del ID_SEGURO más arriba).
  if (!idSeguro(orderId)) {
    return new Response("orderId inválido", { status: 400, headers: cors });
  }

  // Leo el pedido de Firestore (es privado, así que va con el token de la
  // cuenta de servicio). El encodeURIComponent es una segunda barrera por
  // si el id tuviera caracteres raros.
  const order = await fsGetDoc(env, `orders/${encodeURIComponent(orderId)}`);
  // Si no existe el documento, 404: es un id que no corresponde a ningún
  // pedido (no es un error del servidor, por eso no es 500).
  if (!order) {
    return new Response("Pedido no encontrado", { status: 404, headers: cors });
  }

  // Armo el mensaje y lo mando. Si Telegram explota acá, sube la excepción
  // al catch global del fetch y vuelve como un 500 genérico.
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

/**
 * El UID (el identificador único e irrepetible) del usuario admin de Firebase.
 *
 * Va hardcodeado a propósito y no como secreto: si fuera un secret, el
 * attacker no lo vería tampoco, porque el Worker nunca lo devuelve. Que esté
 * en el código NO lo vuelve público en la práctica: saber el UID no sirve
 * de nada sin el token de sesión que solo tiene quien se logueó.
 *
 * Es el mismo login que usa el panel: si cambiás la cuenta de admin, cambiás
 * acá (y en la lista de admins de firestore.rules).
 */
const ADMIN_UID = "Ii35YTENxZePLzloJkaC99AL5rn1";

/**
 * Devuelve el UID del admin si el token es válido, o null.
 * Nunca lanza: un token raro es lo mismo que no traer token.
 *
 * CÓMO FUNCIONA ESTA VERIFICACIÓN:
 * 1. El navegador (que ya se logueó con Firebase) pide su "ID token": un JWT
 *    corto que Firebase le firma con su clave secreta y que dice "este
 *    usuario se logueó hace 5 minutos".
 * 2. Me lo manda en el header `Authorization: Bearer <token>`.
 * 3. Yo se lo devuelvo a Firebase en un `accounts:lookup` preguntando
 *    "¿este token es válido?".
 * 4. Firebase me devuelve los datos del usuario, incluido su UID.
 * 5. Comparo ese UID con ADMIN_UID. Solo si son iguales, es el admin.
 *
 * ¿Por qué no me limito a FIRMAR el JWT yo mismo? Porque para verificar la
 * firma de Firebase necesitaría la API key (que se puede consultar), y
 * además el token tiene que haber sido emitido por Firebase, no por mí. La
 * consulta a Firebase es la que garantiza eso.
 *
 * Lo que NUNCA se manda por acá: la contraseña del admin ni el API secret de
 * Cloudinary. El token que viaja es de solo lectura y de vida corta.
 */
async function uidAdmin(request, env) {
  // Saco el token del header "Authorization: Bearer xyz". Si no viene con
  // ese prefijo, no hay token.
  const header = request.headers.get("Authorization") || "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!idToken) return null;
  // Sin la API key no puedo verificar nada: es un error de configuración.
  if (!env.FIREBASE_API_KEY) return null;

  try {
    // El "accounts:lookup" es el endpoint de Firebase Identity Toolkit que
    // valida un ID token y devuelve los datos del usuario. La API key va en
    // la URL como query param porque este endpoint la pide así.
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      }
    );
    // Si Firebase no lo acepta (401 = token vencido o inválido, 403 = app
    // mal configurada), no es el admin.
    if (!res.ok) {
      console.warn("[auth] Firebase rechazó el token:", res.status);
      return null;
    }
    // Si el body no es JSON (por ejemplo, un 502 de Google en el medio),
    // lo trato como objeto vacío en vez de romper.
    const data = await res.json().catch(() => ({}));
    // Firebase devuelve `users[0]` con los datos. localId es el UID.
    const usuario = Array.isArray(data.users) && data.users[0];
    // Solo es admin si el UID coincide EXACTO con ADMIN_UID.
    return usuario && usuario.localId === ADMIN_UID ? usuario.localId : null;
  } catch (err) {
    // Si se cae la red o Firebase explota, no asumo que sea el admin
    // (fail closed: por defecto NO). Devuelvo null y el handler responde 403.
    console.error("[auth] No se pudo verificar el token:", err?.message || err);
    return null;
  }
}

/**
 * ============================================================
 * ACCIÓN: signUpload — firma una subida de imagen para Cloudinary
 * ============================================================
 * Con un "unsigned upload preset" de Cloudinary, CUALQUIERA en
 * internet puede subir archivos a nuestra cuenta con solo conocer el
 * nombre del preset (que va dentro del JavaScript del sitio, o sea
 * que es público). Probado: una subida sin autenticación funciona.
 *
 * Con una subida firmada, Cloudinary exige una firma que se calcula
 * con el API secret. Ese secret jamás sale del Worker.
 *
 * Y como este endpoint tampoco puede quedar abierto (si lo estuviera,
 * cualquiera pediría una firma y subiría igual), antes de firmar se
 * verifica que quien llama sea el admin.
 */
async function handleSignUpload(body, env, cors, request) {
  // PASO 1: ¿quien llama es el admin? Si no, 403 y no hay firma.
  if (!(await uidAdmin(request, env))) {
    return new Response(
      JSON.stringify({ error: "Solo el administrador puede subir imágenes." }),
      { status: 403, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
  // PASO 2: ¿están los secrets cargados? Sin el API secret no puedo firmar,
  // así que devuelvo 503 (servicio no disponible) con un mensaje claro.
  if (!env.CLOUDINARY_API_SECRET || !env.CLOUDINARY_CLOUD_NAME) {
    console.error("[signUpload] falta CLOUDINARY_API_SECRET en los secrets del Worker");
    return new Response(
      JSON.stringify({ error: "Las subidas de imágenes no están configuradas." }),
      { status: 503, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  // PASO 3: calculo la firma.
  //
  // CÓMO ES LA FIRMA DE UNA SUBIDA A CLOUDINARY:
  // Cloudinary no verifica "quién" sos sino "si sabés el secreto". La
  // firma es el SHA-1 de un string que se arma con: los parámetros que
  // voy a firmar, ORDENADOS alfabéticamente (de ahí los `&` pegados) +
  // el API secret pegado al final, y un timestamp. Es el mismo algoritmo
  // que documenta Cloudinary:
  //   firma = sha1("folder=skul-productos&timestamp=1234" + API_SECRET)
  //
  // El API secret es lo único que no se puede adivinar. Como el navegador
  // no lo tiene (yo se lo devuelvo ya firmado), el navegador no puede
  // fabricar una firma sin pasar por mí, y yo no firmo para nadie que no
  // sea el admin.
  const folder = "skul-productos";
  const timestamp = Math.floor(Date.now() / 1000);
  const paraFirmar = `folder=${folder}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`;

  // SHA-1 es un hash: una "huella" de 40 caracteres hexadecimales que
  // depende solo de los bytes de entrada. crypto.subtle.digest me lo da.
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(paraFirmar)
  );
  // crypto.subtle devuelve bytes crudos; los convierto a hex ("a0 b1 c2" → "a0b1c2")
  // porque es lo que Cloudinary espera.
  const signature = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // PASO 4: le devuelvo al navegador la firma Y los datos públicos que
  // necesita para subir (cloudName y apiKey SÍ son públicos, están en el
  // panel de Cloudinary y en las URLs de las imágenes; lo único secreto es
  // la firma). El navegador después sube el archivo directamente a
  // Cloudinary, sin pasar por mí (es más rápido y no me gasta ancho de banda).
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
 * ACCIÓN: subscribe — avisa una suscripción al newsletter por Telegram.
 *
 * Igual que notify: el navegador manda el ID y yo leo el contenido. El
 * motivo es el mismo que escribí en el bloque de arriba y vale la pena
 * repetirlo: si aceptara el texto, cualquiera con la URL podría escribirme
 * lo que quisiera al Telegram (con nombre de cliente inventado, etc.).
 */
async function handleSubscribe(body, env, cors) {
  // Desestructuro lo único que necesito: el ID del documento.
  const { subscriberId } = body;
  // Tiene que ser un string no vacío.
  if (!subscriberId || typeof subscriberId !== "string") {
    return new Response("Falta subscriberId", { status: 400, headers: cors });
  }
  // Misma razón que en notify: el id va en la ruta y no puede salirse
  // de la colección (ver idSeguro). Uso el patrón que acepta @ y .
  // porque los suscriptores se guardan por email.
  if (!idSeguro(subscriberId, ID_SEGURO_EMAIL)) {
    return new Response("subscriberId inválido", { status: 400, headers: cors });
  }

  // Leo el documento de la suscripción del Firestore. /newsletter es
  // privada (las reglas solo dejan pasar al admin y al Worker).
  const sub = await fsGetDoc(env, `newsletter/${encodeURIComponent(subscriberId)}`);
  // 404 si no existe (nadie se suscribió con ese id): es un caso normal,
  // no un error del servidor.
  if (!sub) {
    return new Response("Suscripción no encontrada", { status: 404, headers: cors });
  }

  // Armo el mensaje con los datos REALES del documento (el mail, de dónde
  // viene la suscripción, si dio consentimiento). Todo leído de Firestore,
  // nada mandado por el navegador.
  const lines = [
    "📬 SUSCRIPCIÓN AL NEWSLETTER — SKUL",
    "",
    `Email: ${sub.email}`,
    `Origen: ${sub.source || "footer"}`,
    `Consentimiento: ${sub.consent === true ? "sí" : "no informado"}`,
  ];

  // Mando a Telegram. Si falla, sube al catch global (500 genérico); acá
  // no se guardó nada, así que no hay estado a medias.
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
const ZONAS_FIJAS = {
  local: { nombre: "Retiro en Los Toldos", precio: 0 },
};

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
const GIFT_CARD_MIN = 1000;
const GIFT_CARD_MAX = 100000;
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
  return String(codigo || "").replace(/\s+/g, "").toUpperCase();
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
function correoQuoteLabel(q) {
  if (!q) return "Envío por Correo Argentino";
  return q.type === "sucursal"
    ? `Correo Argentino — Retiro en ${q.agencyName || q.agencyCode} (CP ${q.postalCode})`
    : `Correo Argentino — A domicilio (CP ${q.postalCode})`;
}

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
  for (const it of items) {
    const id = String(it.id || "");
    if (id === "giftcard" || id === ITEM_GIFT_CARD) continue;
    const leido = await fsGetDocRaw(env, `products/${encodeURIComponent(id)}`);
    if (!leido) {
      return new Response(JSON.stringify({ error: "Uno de los productos ya no está disponible." }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    // Producto apagado desde el panel: la tienda no lo muestra, así que
    // tampoco se puede comprar. Sin este chequeo, alguien con el carrito
    // viejo abierto (o Armado a mano) lograba comprar una prenda oculta.
    //
    // Se compara contra `false` y no contra `true` a propósito: es la misma
    // regla que usa la web (`p.active !== false`), así que los productos
    // viejos que nunca tuvieron el campo siguen vendiéndose.
    if (leido.data?.active === false) {
      return new Response(JSON.stringify({ error: "Uno de los productos ya no está disponible." }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    productos[id] = { ...leido.data, id, updateTime: leido.updateTime };
  }

  const itemsNormalizados = [];
  const stockRestante = {};
  for (const id of Object.keys(productos)) stockRestante[id] = { ...(productos[id].stock || {}) };

  // Solo los productos cuyo stock baja de verdad en este pedido van al
  // commit. Antes se escribían TODOS los que tienen stock cargado, y cada
  // escritura iba con su precondition: si entre la lectura y el commit
  // alguien editaba cualquier otro producto del catálogo (una foto, un
  // precio, un stock), Firestore abortaba el commit entero y el cliente
  // recibía "Se agotó el stock" sin que su talle se hubiera agotado.
  const productosTocados = new Set();

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
    // El precio no viene del navegador: se valida que sea un monto entero
    // dentro del rango permitido (cualquier monto, sin múltiplos) y se usa
    // ese número.
    if (id === ITEM_GIFT_CARD) {
      const monto =
        Number(item.amount) ||
        Number(item.giftcardAmount) ||
        Number(item.price);
      const montoValido =
        Number.isInteger(monto) &&
        monto >= GIFT_CARD_MIN &&
        monto <= GIFT_CARD_MAX;
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
    if (hayControl) {
      stockRestante[id][size] = disponible - qty;
      productosTocados.add(id);
    }

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

  // Base elegible: solo las líneas a las que aplica el cupón.
  // El monto fijo se descuenta UNA sola vez por pedido, no por línea.
  const baseCupon = cupon
    ? itemsNormalizados.reduce(
        (acc, i) => acc + aplicaCoupon({ ...cupon, type: "percent", value: 100 }, productos[i.id], i.price * i.qty),
        0
      )
    : 0;
  const cuponDescuento = !cupon
    ? 0
    : cupon.type === "percent"
      ? Math.min(Math.round((baseCupon * (Number(cupon.value) || 0)) / 100), baseCupon)
      : Math.min(Number(cupon.value) || 0, baseCupon);

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

    // Si MiCorreo está caído o las credenciales no sirven, antes esto
    // reventaba con un 500 "Probá de nuevo" que no decía nada. Ahora el
    // cliente sabe que el problema es del servicio de correo y que puede
    // elegir retiro en el local.
    let cotizacion;
    try {
      cotizacion = await cotizarCorreo(env, correoQuote.postalCode, peso);
    } catch (err) {
      console.error(
        "[createOrder] No se pudo cotizar con Correo Argentino:",
        err?.message || err,
        err?.stack ? `\n${err.stack}` : ""
      );
      return new Response(
        JSON.stringify({
          error: "No pudimos cotizar el envío con Correo Argentino en este momento. Probá de nuevo en un rato o elegí retiro en el local.",
        }),
        { status: 503, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

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
  //
  // Solo entran los productos del carrito. Poner el catálogo entero acá
  // hacía que editar cualquier otra prenda (incluso desde el panel, con
  // una foto) abortara el commit de un pedido que no la tocaba, y el
  // cliente veía un "se agotó el stock" que era mentira.
  for (const id of productosTocados) {
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
  // cargado y ACTIVA, porque el comprador ya la pagó y se le muestra el
  // código en la pantalla de "gracias" para usarlo o regalarlo (si
  // naciera inactive, el checkout la rechazaría siempre:vería
  // `checkGiftCard` y `giftCard.active !== true` más arriba).
  //
  // Sin updateMask, así que si el código ya existiera Firestore rechaza el
  // commit entero (y el pedido tampoco se crearía).
  //
  // NO se guarda el nombre del comprador: /giftCards tiene lectura pública
  // por código (`allow get: if true`), así que cualquier nota con datos
  // personales quedaría a la vista de quien tuviera el código.
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

    // Cualquier otro error de Firestore (permisos, cuota, documento
    // inválido) se comía como un 500 sin explicación. Se loguea entero y
    // se le dice al cliente que no se perdió nada: el commit es atómico,
    // así que si falló no se creó el pedido ni se tocó el stock.
    console.error(
      `[createOrder] Commit falló (status=${err.status}):`,
      err?.message || err,
      err?.stack ? `\n${err.stack}` : ""
    );
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

function fmt(n) {
  const num = Number(n) || 0;
  return num.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

function parseFirestoreFields(fields) {
  const out = {};
  for (const key in fields || {}) out[key] = parseValue(fields[key]);
  return out;
}

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