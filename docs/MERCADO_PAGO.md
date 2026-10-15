# Cómo conectar Mercado Pago (cobro de verdad)

El cobro con tarjeta ya está conectado con **Checkout Pro**, pero queda
**apagado hasta que exista `MP_ACCESS_TOKEN`**: sin token, el checkout registra
el pedido y coordina el pago a mano por WhatsApp (el comportamiento viejo,
simulado a propósito). Con token, el Worker crea la preferencia, el sitio
redirige a MP y el webhook marca el pedido como pagado. Este doc explica el
flujo y qué tocar si hay que ajustarlo.

> **Regla de oro (no negociable):** el navegador nunca decide cuánto se cobra.
> El monto a cobrar tiene que salir del **total que recalcula el Cloudflare
> Worker** (`creado.total`), nunca del resumen que arma el navegador. Si el
> monto saliera del cliente, cualquiera tacharía el precio a $1 desde la consola.

## Flujo recomendado: "Checkout Pro" con preferencia creada en el Worker

No hace falta SDK en el navegador. Es lo más rápido de conectar y lo más seguro:

1. **Worker crea la preferencia** (`cloudflare-worker/worker.js`, dentro del
   commit atómico de `createOrder` o justo después):
   - `POST https://api.mercadopago.com/checkout/preferences` con
     `Authorization: Bearer ACCESS_TOKEN` (token desde `env`, **nunca** en el
     archivo).
   - Monto = el total recalculado dentro del Worker (ya con descuentos y envío).
     MP cobra la **suma de los `items`**, así que la preferencia se arma para
     que sumen EXACTO ese total: las prendas + una línea de "Envío" y, si hay
     cupón o gift card, el descuento se reparte dentro de las líneas (nunca se
     manda un `unit_price` en 0 o negativo, que MP rechaza). Ver
     `itemsDePreferencia` en `cloudflare-worker/worker.js`.
   - `external_reference` = `orderId` (para saber qué pedido pagó).
   - `notification_url` = webhook del Worker.
   - `back_urls` success / failure → las pantallas de gracias.
2. **El Worker le devuelve el link de pago (`init_point`) al navegador.**
3. **`src/StoreApp.jsx` — `confirmOrder()` (línea ~765):** hoy, para
   `debito`/`credito` hace `nav("gracias-tarjeta")` (línea ~835). Ese es el
   punto de cambio: en lugar de la pantalla de gracias, para tarjeta se hace
   `window.location = creado.linkPago` (o se abre el widget). Los descuentos y
   el carrito ya se limpiaron antes, así que está bien salir ahí.
4. **`src/pages/Thanks.jsx` — `GraciasTarjeta` (línea 241):** pasa a ser la
   pantalla de *retorno* del pago. Mostrar el `orderId`, el estado del pago
   (aprobado/pendiente) y el box de seguimiento que ya existe.
5. **Webhook (`cloudflare-worker/worker.js` → `handleMercadoPagoWebhook`, ruta
   `/mp/webhook`):** ya está implementado. Al recibir la notificación:
   - verifica la firma `x-signature` (HMAC-SHA256 con `MP_WEBHOOK_SECRET`)
     **como señal, no como única barrera**,
   - lee el pago REAL de MP (`GET /v1/payments/{id}`) con `MP_ACCESS_TOKEN`,
   - busca el pedido por `external_reference` (= `orderId`),
   - compara el monto del pago con el `total` guardado en el pedido: solo marca
     `paymentStatus: "paid"` si el pago cubre el total; si pagó menos queda
     `underpaid` para revisar a mano,
   - anota `paymentStatus` / `mpPaymentId` / `paidAmount` en `/orders` (y
     `paymentStatus: "paid"` en `/orderTracking`) y avisa por Telegram.
   Es idempotente: si MP reintenta el mismo aviso, no vuelve a escribir.

   **Sobre la firma:** como el pedido se marca pagado únicamente después de
   releer el pago en MP y comparar el monto, una firma que no coincide **no
   descarta el aviso**: se procesa igual y queda bien anotado en el log (así una
   rotación o rareza de la clave de MP no pierde una venta real). Para volver al
   modo estricto (401 ante firma inválida), setear la variable
   `MP_WEBHOOK_FIRMA_ESTRICTA = "1"`.

## Puntos exactos de cambio

| Lugar | Hoy | Con Mercado Pago |
|---|---|---|
| `src/pages/Checkout.jsx` líneas 354-406 | Botones Débito/Crédito = simulado | Siguen siendo "pagar con tarjeta", el botón "Confirmar pedido" dispara el pago |
| `src/StoreApp.jsx` `confirmOrder()` ~765-835 | Nav a `gracias-tarjeta` | Redirige al `init_point` que devolvió el Worker |
| `src/pages/Thanks.jsx` `GraciasTarjeta` ~241 | "Pedido registrado" (no hay nada que hacer) | Pantalla de retorno con estado del pago |
| `cloudflare-worker/worker.js` | Crea pedido y avisa por Telegram | Además crea la preferencia + webhook `/mp/webhook` (marca `paymentStatus`) |
| `src/utils/precios.js` | Solo orden de descuentos | Se agregó `calcularEnvio` (envío gratis desde `ENVIO_GRATIS_DESDE`): es la previsualización, el monto que vale sigue siendo el del Worker |

## Cosas a no olvidar

- **Los secretos**: `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` van como secretos de
  Cloudflare, vía `env.*`, como ya se hace con el resto. La suite del Worker barre
  el archivo buscando secretos en texto, así que no se puede escapar.
  Se cargan con `npx wrangler secret put MP_ACCESS_TOKEN` y
  `npx wrangler secret put MP_WEBHOOK_SECRET` (el mismo "secret" que muestra el
  panel de MP al configurar el webhook).
- **El envío y las gift cards ya están en el total del Worker**: no hay que
  recalcular nada en el navegador.
- **Envío gratis**: `ENVIO_GRATIS_DESDE` (hoy $100.000 de mercadería, sin contar
  envío ni descuentos) vive duplicado a propósito: en `src/data/config.js` para
  el resumen del sitio y en `cloudflare-worker/worker.js` para el cobro real. Si
  cambia el umbral, hay que cambiar los dos y correr los tests de ambos lados.
- **El `notification_url`**: si no seteás `MP_NOTIFICATION_URL` (variable
  opcional), el Worker arma el webhook con el origen de la petición que creó la
  preferencia → `https://<host-del-worker>/mp/webhook`. Asegurate de que esa URL
  sea pública (MP le pega desde afuera).
- **Idempotencia**: el webhook es idempotente por `mpPaymentId` + estado: un
  reintento de MP no vuelve a escribir ni a avisar. Pero ojo: el pedido se crea
  ANTES de pagar, así que un pago duplicado real (dos compras) sigue siendo dos
  pedidos distintos.
- **Cuotas / "Ahora 12"**: se configuran en el panel o en la preferencia
  (`payment_methods`). Afecta la comisión, no el código.

## Cómo probarlo SIN pagar

No hace falta pagarte a vos mismo para verificar la integración. Ordenadas de
menos a más completa:

1. **La firma, contra MP de verdad** (gratis, y es lo más delicado). El panel de
   MP tiene **Webhooks → Simular notificación**. Ojo: el simulador **no ofrece
   el evento "Pagos"**, solo otros (mp-connect, reclamos, etc.). Se puede usar
   igual porque **esos avisos también vienen firmados por MP**. Como el handler
   ignora lo que no es `payment` *antes* de validar la firma, para probarla hay
   que meter un log de diagnóstico temporal que llame a `firmaWebhookValida`
   para cualquier tipo y anote `firma_valida=true/false`. Si valida con un aviso
   simulado, la firma está bien resuelta (se comparó contra el HMAC real de MP).
   Sacar el log y redesplegar después.
2. **El resto del webhook** (leer el pago, comparar el monto, anotar
   `paymentStatus`, Telegram) está cubierto por los tests del Worker
   (`mercadopago.seguridad.test.js`) con un Firestore y una API de MP falsos.
3. **El flujo completo (pago aprobado → `paid`)** de verdad solo se prueba con
   un pago. Sin gastar plata: **usuarios de prueba + tarjetas de prueba** de MP
   (panel → Cuentas de prueba). Requiere usar por un rato el **Access Token de
   prueba** en el Worker (`wrangler secret put MP_ACCESS_TOKEN`) y después
   **volver a poner el de producción**.

   Ojo con dos detalles que hacen fallar la prueba:

   - **Hay que usar el `sandbox_init_point`**, no el `init_point`: con
     credenciales de prueba MP devuelve las dos urls y el `init_point` abre el
     checkout de *producción*, que no conoce la preferencia de prueba (el botón
     de pago queda muerto). Por eso está el flag `MP_MODO_PRUEBA=1`
     (`wrangler secret put MP_MODO_PRUEBA`): mientras esté puesto, el Worker
     manda al sandbox. **Borrarlo al volver a producción.**
   - **El prefijo del token no distingue prueba de producción**: en Checkout Pro
     la cuenta de prueba vendedora se crea sola con la app y su token también
     empieza con `APP_USR-`. Guiarse por la pestaña del panel ("Credenciales de
     prueba" vs "Credenciales de producción").

   Y aparte del botón gris de "auto-compra" (abajo), hay que pagar **logueado
   como el usuario comprador de prueba** (el que se crea a mano en el panel,
   ver "Tu parte" punto 3), en una ventana de incógnito.

## Tu parte (lo que sólo se puede hacer desde el panel)

El código ya está. Esto es lo que queda a mano, en el panel de Mercado Pago y
en Telegram, con la cuenta del dueño. Los nombres de los menús de MP cambian
con los rediseños; si algo no coincide, buscá la sección equivalente.

**1. ✅ Token del bot de Telegram (hecho).** Estaba expuesto en el código
viejo y ya quedó revocado desde `@BotFather`: el bot sigue siendo el mismo,
pero el valor viejo dejó de servir (el token actual responde a `getMe`). Si
querés descartar cualquier duda, volvé a cargarlo en el Worker:
`wrangler secret put TELEGRAM_BOT_TOKEN`. Detalle: ver
`cloudflare-worker/README.md`, "Paso 0".

**2. Verificar la cuenta de Mercado Pago.** Hasta que la cuenta no está
verificada y con los medios de pago habilitados, MP no cobra. Esto **no está
en el panel de desarrolladores** (donde se sacan las credenciales): es el
panel de la cuenta. Rutas:

- **Web** (`mercadopago.com.ar`, una vez adentro): menú de tu perfil (foto o
  inicial, arriba a la derecha) → **Mi cuenta / Tu perfil** → **Mis datos** →
  **Verificar identidad**.
- **App**: foto de perfil → **Verificar identidad** (o el aviso "Completá tu
  cuenta" si aparece arriba de todo).

Pide DNI (frente y dorso) más una selfie o video corto: automático en minutos,
hasta 48 h si lo revisa una persona. Si no aparece la opción, cerrá sesión y
volvé a entrar o actualizá la app.

**3. Sacar el Access Token de PRODUCCIÓN** (**Tus aplicaciones → tu
aplicación → Credenciales de producción**; no el de prueba) y cargarlo en el
Worker:

```bash
npx wrangler secret put MP_ACCESS_TOKEN
```

**4. ✅ Configurar el webhook (hecho y verificado).** MP ya avisa cada pago a
`https://cloudflare-worker.skullt.workers.dev/mp/webhook` (evento **Pagos**) y
la firma valida: llegó un aviso real de un pago y el Worker lo procesó sin
quejarse de la firma. Por si hay que rehacerlo: **Tus aplicaciones → tu
aplicación → Webhooks / Notificaciones**, copiar la **clave secreta** del panel
y cargarla con:

```bash
npx wrangler secret put MP_WEBHOOK_SECRET
```

Después de cargar un secreto, el Worker se republica solo. Verificá que siga
respondiendo (`curl` al `/mp/webhook` con un id inventado tiene que dar 502,
"no se pudo leer el pago": eso prueba que la red de seguridad está viva).

**5. Revisar el pago que quedó sin procesar.** El pago `184170547940` mandó sus
avisos cuando el código viejo todavía los rechazaba. En **Actividad**: si
figura **aprobado** y el pedido no quedó `paid`, usá **Reenviar
notificación** (el handler actual ya lo procesa bien). Confirmá en Firestore
que `/orders` quedó con `paymentStatus: "paid"`.

**6. Probar de punta a punta con una compra chica de verdad.** Es la única
prueba que vale: comprar con tarjeta, ver que te lleva a MP, que al volver la
orden queda `paid` y que llega el aviso por Telegram. Si algo falla, el log del
Worker (`npx wrangler tail`) muestra por qué.

⚠️ **El botón "Pagar" de MP queda gris si el comprador es el vendedor.** No es
un problema del sitio: MP lo trata como "auto-compra" (posible fraude) y
deshabilita el pago. [Ayuda oficial de
MP](https://www.mercadopago.com.ar/ayuda/probar-checkout-boton-pago-desactivado_48609):
*"El botón de pago está desactivado porque estás usando la misma cuenta para
cobrar y realizar el pago"*. Dos formas de destrabarlo:

- que pague **otra persona** (otro DNI/CUIT), desde **otro navegador o en
  incógnito** para que MP no vea la sesión del vendedor. Ojo: **no alcanza con
  otra cuenta de MP si está a tu mismo DNI** — también la bloquea; o
- pagar en el **entorno de prueba** (acá arriba, con `MP_MODO_PRUEBA=1` y el
  usuario comprador de prueba).

**7. Si querés cambiar reglas de negocio** (envío gratis desde, cuotas "Ahora
12", comisiones): el umbral de envío gratis vive en el código
(`ENVIO_GRATIS_DESDE`, en `src/data/config.js` y en
`cloudflare-worker/worker.js`, los dos); las cuotas se configuran en el panel
de MP (afectan la comisión, no el código).