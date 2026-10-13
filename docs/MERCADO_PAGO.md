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
   - valida la firma `x-signature` (HMAC-SHA256 con `MP_WEBHOOK_SECRET`),
   - lee el pago REAL de MP (`GET /v1/payments/{id}`) con `MP_ACCESS_TOKEN`,
   - busca el pedido por `external_reference` (= `orderId`),
   - compara el monto del pago con el `total` guardado en el pedido: solo marca
     `paymentStatus: "paid"` si el pago cubre el total; si pagó menos queda
     `underpaid` para revisar a mano,
   - anota `paymentStatus` / `mpPaymentId` / `paidAmount` en `/orders` (y
     `paymentStatus: "paid"` en `/orderTracking`) y avisa por Telegram.
   Es idempotente: si MP reintenta el mismo aviso, no vuelve a escribir.

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