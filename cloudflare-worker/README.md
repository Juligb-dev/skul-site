# Worker de SKUL: pedidos, avisos, MiCorreo y firma de subidas

Hace cuatro cosas:

1. **Crea los pedidos** (`createOrder`) calculando precios, stock, cupón y
   envío en el servidor, en una sola operación atómica.
2. **Avisa por Telegram** (`notify`) los pedidos nuevos y las suscripciones
   al newsletter, sin exponer el token del bot.
3. **Cotiza el envío** con Correo Argentino (`rates`, `agencies`).
4. **Firma las subidas de imágenes** a Cloudinary (`signUpload`), solo para
   el admin.

---

# Parte 1 — Avisos de Telegram (sin exponer el token)

Antes, el token del bot de Telegram estaba escrito directamente en el
código de la web, así que quedaba visible para cualquiera que abriera
las herramientas de desarrollador del navegador. Ya lo saqué de ahí.

Ahora el envío lo hace un **Cloudflare Worker**: un mini-servidor
gratuito (sin tarjeta de crédito, sin límite de tiempo) que guarda el
token de forma privada y es el único que le habla a Telegram.

## Paso 0 — Revocar el token viejo (importante, hacelo ya)

El token `8909846536:AAE8Oey...` que estaba en el código quedó
expuesto en internet. Andá a Telegram, abrí el chat con **@BotFather**,
escribile `/mybots` → elegí tu bot → **API Token** → **Revoke current
token**. Vas a recibir uno nuevo: ese es el que vamos a usar de acá en
más (el viejo queda inútil, así que no importa que haya quedado
filtrado).

## Paso 1 — Crear la cuenta de Cloudflare (gratis, sin tarjeta)

1. Entrá a https://dash.cloudflare.com/sign-up y creá una cuenta
   gratis con tu email.
2. En el menú de la izquierda, entrá a **Workers & Pages**.

## Paso 2 — Crear el Worker

1. Click en **Create** → **Workers** → **Create Worker**.
2. Ponele un nombre, por ejemplo `skul-notify`.
3. Click en **Deploy** (te crea un Worker de ejemplo, después lo
   pisamos).
4. Click en **Edit code** (o "Configure Worker" → editor).
5. Borrá todo el código de ejemplo y pegá el contenido completo del
   archivo `worker.js` que está en esta misma carpeta.
6. Click en **Deploy** (arriba a la derecha).

## Paso 3 — Cargar el token de forma privada (nunca en el código)

1. En la página del Worker, andá a **Settings** → **Variables and
   Secrets**.
2. Agregá una variable de tipo **Secret** (no "texto plano"):
   - Nombre: `TELEGRAM_BOT_TOKEN`
   - Valor: el token nuevo que te dio BotFather en el Paso 0.
3. Agregá otra variable, esta puede ser texto plano:
   - Nombre: `TELEGRAM_CHAT_ID`
   - Valor: `1065255342` (o el chat id que corresponda — es el mismo
     que ya tenías configurado).
4. Guardá.

## Paso 4 — Copiar la URL del Worker

Arriba de la página del Worker vas a ver una URL como:

```
https://skul-notify.tu-usuario.workers.dev
```

Copiala.

## Paso 5 — Pegarla en el sitio

Abrí `src/data/config.js` y pegá esa URL en:

```js
export const ORDER_NOTIFY_WORKER_URL = "https://skul-notify.tu-usuario.workers.dev";
```

Volvé a compilar (`npm run build`) y desplegá el sitio. Listo: a
partir de ahora, cuando alguien confirma una compra, el sitio solo le
avisa al Worker "che, se creó el pedido tal", el Worker busca los
datos reales del pedido en Firestore, arma el mensaje y te lo manda a
Telegram — el token nunca pasa por el navegador de nadie.

## Avisos de suscripciones al newsletter

El mismo Worker avisa los correos que se suscriben en el pie de página. El
navegador solo le manda el **ID** del documento de la suscripción; el mail
real lo lee el Worker de Firestore. Si aceptáramos el texto del aviso desde
el navegador, cualquiera que tuviera la URL podría escribirte lo que quisiera
en tu Telegram.

Los mismos secrets de los pasos 3 y 4 sirven para esto.

## Paso 3-bis — Cuenta de servicio (para poder leer los documentos privados)

Hasta ahora el Worker leía los pedidos sin credenciales, y por eso las reglas
de Firestore dejaban que cualquier persona los leyera (`allow get: if true`):
cualquiera que tuviera un ID de pedido podía ver nombre, teléfono, dirección
y medio de pago del comprador.

Eso ya está cerrado: `/orders` y `/newsletter` solo se leen si quien pregunta
es el admin o el Worker. Para que el Worker siga funcionando, hay que
identificarlo. Se hace con una **cuenta de servicio de Firebase**:

1. En la consola de Firebase: **Project settings** (el engranaje) →
   **Service accounts** → **Generate new private key**. Se baja un `.json`.
2. Abrilo y anotá dos cosas:
   - `client_email` (por ejemplo `firebase-adminsdk-xxxxx@skullt.iam.gserviceaccount.com`)
   - `private_key` (el bloque largo que empieza con `-----BEGIN PRIVATE KEY-----`)
3. En el Worker: **Settings** → **Variables and Secrets**, agregá dos
   secrets más:
   - `FIREBASE_CLIENT_EMAIL` = el `client_email` del punto 2
   - `FIREBASE_PRIVATE_KEY` = la `private_key` del punto 2 (con los saltos de
     línea tal cual, pegarla en un solo renglón también funciona)
4. En `firestore.rules`, la función `isWorker()` compara contra un email fijo.
   **Copiá tu `client_email` real ahí**, tal cual lo descargaste, porque si no
   el Worker no va a poder leer los pedidos y dejarán de llegar los avisos de
   Telegram.

El archivo `.json` que descargaste contiene la clave privada: guardalo en un
lugar seguro y borralo cuando termines (no hace falta subirlo a ningún lado,
solo copiar esos dos valores).

### Orden importante de las publicaciones

Si publicás las reglas nuevas antes de cargar los secrets del Worker, el
pedido se sigue guardando bien pero **dejará de llegarte el aviso de
Telegram**. Lo más seguro es: primero cargá los secrets y publicá el Worker,
después publicá las reglas.

Para verificar que el Worker ya lee bien, mandale este pedido desde el
terminal y fijate si te llega el aviso:

```bash
curl -X POST https://tu-worker.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"action":"notify","orderId":"PEGALO_UN_ID_DE_PEDIDO_REAL"}'
```

Si responde `ok`, está todo andando. Si responde 403, todavía falta cargar los
secrets o el email no coincide con el de `isWorker()`.

## Si el aviso de Telegram dejó de llegar

1. Fijate que el Worker siga desplegado en `https://tu-worker.workers.dev`.
2. Mirá los **Logs** del Worker en la consola de Cloudflare: si dice
   `Firestore respondió 403`, es el paso 3-bis (falta el secret o el email no
   coincide con `isWorker()`).
3. Recordá que la URL de `src/data/config.js` tiene que ser la nueva, la del
   Worker de Cloudflare.

## Cotización y sucursales de Correo Argentino (MiCorreo)

El Worker también tiene las acciones `rates` (cotiza el envío a un código
postal) y `agencies` (lista las sucursales de una provincia). Necesitan
cinco datos de MiCorreo:

**Secrets** (en el panel: Settings → Variables and Secrets, tipo *Secret*):

| Nombre | Qué es |
| --- | --- |
| `CORREO_USER` | el usuario de MiCorreo |
| `CORREO_PASSWORD` | la contraseña de MiCorreo |

**Variables de texto plano** (en `wrangler.jsonc`, dentro de `"vars"`):

| Nombre | Valor | Qué es |
| --- | --- | --- |
| `CORREO_BASE_URL` | `https://api.correoargentino.com.ar/micorreo/v1` | la API de **producción** |
| `CORREO_CUSTOMER_ID` | `0001937535` | el **ID de cliente** (con los ceros adelante) |
| `CORREO_ORIGIN_POSTAL_CODE` | `6015` | el CP desde el que se despacha |

Tres cosas que costaron tiempo y conviene no olvidar:

1. **`CORREO_BASE_URL` tiene que ser la de producción**
   (`api.correoargentino.com.ar`). Con la de pruebas (`apitest.`) MiCorreo
   responde `Cliente FAP no identificado` y no cotiza nada, aunque el token
   se genere bien.
2. **`CORREO_CUSTOMER_ID` NO es el usuario ni la contraseña.** Es el
   "ID de cliente", que en el panel de MiCorreo aparece en el margen
   superior izquierdo, o en *Mi Cuenta → Mi Perfil → Información de la
   cuenta → Datos de facturación*. Va con ceros adelante.
3. **Las variables de texto plano NO pueden vivir solo en el panel**: un
   `wrangler deploy` las borra (los secrets, en cambio, sobreviven). Por eso
   están declaradas en `wrangler.jsonc`.

Para probar la cotización:

```bash
curl -X POST https://tu-worker.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"action":"rates","postalCodeDestination":"1424","weight":1,"height":30,"width":20,"length":30}'
```

Si responde `{"domicilio":10489,"sucursal":8768}` está andando.

El Worker **solo cotiza y lista sucursales**: no genera envíos, así que no
se cobra nada por usarlo. El precio que se guarda en el pedido se vuelve a
cotizar acá en `createOrder`: el que manda el navegador no se usa para nada.

## Creación de pedidos (`createOrder`)

El checkout **ya no escribe en Firestore desde el navegador**. El navegador
manda qué quiere comprar y el Worker calcula todo lo demás.

### Por qué se movió

Antes, el panel derules tenía que dejar abierto a cualquiera:

- `update` anónimo sobre `/products` (para bajar el stock), y
- `create` anónimo sobre `/orders` y `/orderTracking` (para guardar el pedido).

Con esas reglas abiertas, cualquier persona podía, desde la consola del
navegador, **dejar cualquier talle en 0** (tirar abajo la tienda) o
**escribir pedidos falsos**. Las reglas intentaban frenarlo comparando
precios contra el catálogo, pero era una defensa frágil y difícil de
mantener (había que hardcodear talles, cupones y descuentos).

Ahora el navegador no puede escribir nada: las reglas de Firestore están
cerradas y el Worker hace las escrituras con la cuenta de servicio (que no
pasa por las reglas).

### Qué hace exactamente

1. Valida la forma de lo que llega (nombre, teléfono, items, medio de pago).
2. **Lee el catálogo real** y recalcula cada precio: si el navegador mandó
   `price: 1`, se guarda el precio real. Verificado.
3. Vuelve a leer el stock y calcula el descuento del cupón leyendo el
   documento real del cupón.
4. Si el envío es por Correo Argentino, **vuelve a cotizar** en MiCorreo
   (no confía en el precio que mandó el navegador).
5. Escribe **todo en una sola operación atómica** (`documents:commit`):
   el stock de cada producto, el pedido privado, el tracking público y el
   `usedCount` del cupón.
   - Cada escritura de stock/cupón lleva `currentDocument.updateTime` como
     *precondition*: si otro pedido tocó ese documento entre la lectura y el
     commit, **todo el commit se aborta**. Eso es lo que impide que dos
     personas se lleven el último talle.
   - Los pedidos se crean sin *updateMask*, así que fallan si el documento
     ya existe: nunca pisan nada.
6. Avisa por Telegram. **Si Telegram falla, el pedido ya quedó guardado**:
   nunca se pierde una venta (se ve en `/admin`).
7. Devuelve `{ ok, orderId, total }`. El sitio muestra el `total` que
   calculó el servidor, no el que decía el navegador.

### Reglas para acordarse al tocar el código

- En `documents:commit`, `updateMask` y `currentDocument` van **al nivel
  del write**, junto a `update` — no adentro del documento.
- Los nombres de documento dentro del commit van con la ruta **relativa**
  (`projects/.../documents/...`), no con la URL completa.
- Crear y actualizar son el mismo campo (`update`); los distingue el
  `updateMask`.
- `fsValue` deja pasar los valores que ya vienen codificados en formato
  Firestore (tipo `fsTimestamp`), si no un timestamp se guardaría como un
  mapa y el panel no lo podría ordenar por fecha.

### Efecto en las reglas de Firestore

Con esto, `/products`, `/coupons`, `/orders` y `/orderTracking` quedaron en
`allow write: if isAdmin()`. Lo único que sigue aceptando escritiones de
visitantes es `/newsletter`, y con un formulario cerrado de antemano
(`isValidNewSubscriber`).

## Subida de imágenes firmada (`signUpload`)

Las fotos de producto se suben a Cloudinary. Antes se usaba un *unsigned
upload preset*: el navegador mandaba el archivo directo a Cloudinary con el
nombre del preset. **El nombre del preset está escrito en el JavaScript del
sitio, o sea que es público**, así que cualquiera podía subir archivos a
nuestra cuenta. Comprobado: una subida sin ninguna autenticación fue
aceptada.

Ahora:

1. El navegador le manda al Worker su *ID token* de Firebase.
2. El Worker se lo devuelve a Firebase para preguntar quién es y compara el
   UID con el del admin. Si no es el admin, `403`.
3. Solo entonces firma la subida con el API secret (SHA-1 de los parámetros
   ordenados + el timestamp + el secret).
4. El navegador sube el archivo **directo a Cloudinary** (no pasa por el
   Worker: es más rápido y no gasta ancho de banda nuestro).

El API secret vive únicamente como secreto del Worker.

El preset `skul_productos` que se usaba antes quedó **deshabilitado**
(`unsigned: false`), así que la puerta trasera tampoco sirve. Comprobado:
una subida anónima con ese preset ahora responde *"Upload preset must be
whitelisted for unsigned uploads"*.

Cargar los secretos:

```bash
wrangler secret put CLOUDINARY_API_SECRET
wrangler secret put CLOUDINARY_API_KEY
```

## Seguridad del Worker

- **CORS**: solo responde con `Access-Control-Allow-Origin` si el `Origin`
  es `https://skullt.web.app`, `https://skullt.firebaseapp.com` (o el
  servidor local de Vite). Cualquier otro sitio queda bloqueado por el
  navegador.
- **Rate limit por IP y por acción**: 10/min para `notify` y `subscribe`,
  30/min para `rates` y `agencies`, 5/min para `createOrder`, 60/min para
  `signUpload`. Si te pasás responde `429`.
  Ojo: el rate limit vive en memoria de cada isolate, así que frena el
  abuso de a rajada pero no es un cortafuegos estricto.
- **Errores**: al que llama se le devuelve un mensaje genérico; el detalle
  real queda en los logs del Worker (los de MiCorreo o Firestore no se le
  muestran a nadie).
- **Nada de datos personales a la calle**: el documento de seguimiento
  público (`/orderTracking`) no lleva nombre, teléfono, dirección ni medio
  de pago. Verificado con un pedido real.
- **Autorización real solo en `signUpload`**: el resto de las acciones son
  públicas por diseño (crear un pedido, suscribirse a la newsletter) y están
  protegidas por validación estricta y rate limit.

## ¿Por qué no usar Cloud Functions de Firebase directamente?

Se podría, pero Firebase exige activar el plan **Blaze** (que pide
tarjeta de crédito cargada, aunque no te cobre si no superás el uso
gratis) para que las Functions puedan hacer pedidos a servicios
externos como Telegram. Cloudflare Workers resuelve lo mismo sin pedir
tarjeta, así que es la opción más simple para este proyecto. Si en
algún momento preferís mover todo a Firebase Functions, avisame y te
paso el equivalente.
