# Cómo conectar Mercado Pago (cobro de verdad)

Hoy el checkout **no cobra nada**: el botón "Débito/Crédito" registra el pedido y
coordina el pago a mano por WhatsApp (simulado a propósito). Este doc dice dónde
entraría Mercado Pago para cobrar de verdad, con la menor cantidad de cambios y
sin romper el principio que ordenó toda la arquitectura.

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
5. **Webhook (`cloudflare-worker/worker.js`):** al recibir la notificación,
   validar la firma (`x-signature`), leer el pago de MP, **re-leer el pedido y
   re-recalcular** (nunca confiar en el monto del aviso), y marcar
   `paymentStatus: "paid"` en el documento del pedido. Si el pago fue menor al
   total, no se marca como pagado (quedaría pendiente de ajuste manual).

## Puntos exactos de cambio

| Lugar | Hoy | Con Mercado Pago |
|---|---|---|
| `src/pages/Checkout.jsx` líneas 354-406 | Botones Débito/Crédito = simulado | Siguen siendo "pagar con tarjeta", el botón "Confirmar pedido" dispara el pago |
| `src/StoreApp.jsx` `confirmOrder()` ~765-835 | Nav a `gracias-tarjeta` | Redirige al `init_point` que devolvió el Worker |
| `src/pages/Thanks.jsx` `GraciasTarjeta` ~241 | "Pedido registrado" (no hay nada que hacer) | Pantalla de retorno con estado del pago |
| `cloudflare-worker/worker.js` | Crea pedido y avisa por Telegram | Además crea la preferencia + valida webhook |
| `src/utils/precios.js` | Solo orden de descuentos | Sin cambios: el monto del Worker ya es el correcto |

## Cosas a no olvidar

- **El secreto**: `ACCESS_TOKEN` (y jurás card) van en secreto de Cloudflare,
  vía `env.*`, como ya se hace con el resto. La suite del Worker barre el
  archivo buscando secretos en texto, así que no se puede escapar.
- **El envío y las gift cards ya están en el total del Worker**: no hay que
  recalcular nada en el navegador.
- **Idempotencia**: agregar una clave de idempotencia (p. ej. `orderId`) a la
  preferencia para que un reintento no duplique el cobro. Hoy el pedido ya se
  registró antes de pagar, así que un pago duplicado implica un pedido duplicado.
- **Cuotas / "Ahora 12"**: se configuran en el panel o en la preferencia
  (`payment_methods`). Afecta la comisión, no el código.