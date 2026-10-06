# Mercado Pago - Listo para enchufar (sin romper nada)

La arquitectura actual ya cumple con la regla de oro: **el Worker recalcula el
total** (precios, descuentos, gift card, envío). Todo lo que hay que hacer es
conectar MP en el camino correcto.

## Estado actual
- `src/StoreApp.jsx` llama a `createOrder` (Worker) y luego navega a la pantalla de "gracias" según `payMethod` (líneas 765–835).
- Para `debito`/`credito` va a `gracias-tarjeta` (Thanks.jsx, sin cobrar).
- `cloudflare-worker/worker.js` en `handleCreateOrder` ya devuelve `{ ok, orderId, total, giftCardDiscount, giftCardIssued }` (línea 1960–1970).
- El fake Firestore y el arnés ya soportan `fetch` externo y commit atómico.
- Rutas ya reconocen `gracias` → `gracias-tarjeta`.

## Qué agregar (mínimo viable)
### 1) Variables (Worker)
En `wrangler.jsonc` o como secret: `MP_ACCESS_TOKEN` (secret). `MP_PUBLIC_KEY` no
necesaria si usamos "Checkout Pro" redirigiendo a `init_point`. También puede
servir `MP_WEBHOOK_URL` para tenerla explícita, pero no es obligatorio.

> Añadir a la lista de secrets: `MP_ACCESS_TOKEN`.

### 2) Worker: crear preferencia cuando paga con tarjeta
En `handleCreateOrder`, **después** de calcular `total` y **antes** del commit
atómico (o justo después de hacer el commit? Cuidado: el pedido ya se guarda
atomáticamente ahora. Si fallara crear la preferencia, ¿mostramos error y
borramos el pedido? Eso rompería el atómico actual). Recomendado: crear la
preferencia **después** de que el commit salió OK, pero **antes** de avisar a
Telegram. Así el pedido existe y el cliente puede volver. Si falla crear el
link, el pedido queda creado y podés coordinar por WhatsApp (o reintentar desde
admin).

En `createOrder.seguridad.test.js`/`endpoints.seguridad.test.js` ningún test
supone que se devuelva `linkPago`. **No** cambiar la respuesta obligatoria si no
paga con tarjeta: solo agregar `paymentUrl`/`linkPago` cuando `payMethod` es
`debito` o `credito`.

### 3) Front: redirigir a MP en lugar de la pantalla "gracias"
En `src/StoreApp.jsx` (`confirmOrder`, ~833–836):
- si `payMethod === "transferencia"` → nav a `gracias-transferencia`
- si `payMethod === "efectivo"` → nav a `cita-previa`
- si `payMethod === "debito"` o `"credito"` → `window.location.assign(creado.paymentUrl)` (o `init_point`)

Los tests actuales esperan que para tarjeta se navegue a `gracias-tarjeta`. Si
implementamos el cobro real, conviene **no** romper los tests: o mantener la
pantalla para los tests (si `paymentUrl` falta) o actualizar los tests. Pero
primero que nada, **no tocar los tests verdes** a menos que sea necesario.

### 4) Retorno desde MP
Después de pagar, Mercado Pago redirige a `back_urls.success` / `failure`. En
estos casos el usuario vuelve al sitio con parámetros. Como ya existe la lógica
en `useEffect` inicial (líneas ~258–278 de StoreApp) que lee `?pedido=ID` y
trae `orderTracking`, `GraciasTarjeta` puede mostrar el estado.

Opcional: agregar webhook `POST /webhook/mp` en el Worker (nueva acción, validar
firma, marcar `paymentStatus`, actualizar tracking). No es bloqueante para
redirigir: con el retorno ya alcanza para mostrar "pedido registrado".

## Recomendación concreta
Empiezo por el **mínimo que no rompe nada**:

1. Añadir `MP_ACCESS_TOKEN` al Worker (secreto). En `envDePrueba` **no** hace
   falta ponerlo (los tests no lo usarán hasta que el código lo lea).
2. En `handleCreateOrder`: si el pago es tarjeta **y** hay token MP, crear
   preferencia con el `total` calculado, `external_reference = orderId`,
   `notification_url` (opcional pero buena), `back_urls` que apunten al sitio
   (ej. `/gracias?pedido={orderId}` o `/gracias`). Devolver
   `paymentUrl: init_point`.
3. En el front: si `creado.paymentUrl` existe, redirigir ahí; si no, usar el
   comportamiento actual (para no romper tests/local sin MP).
4. **No** cambiar los tests existentes. Crear **un test nuevo** del Worker que
   verifique que con `payMethod="debito"` y `MP_ACCESS_TOKEN` presente, devuelve
   `paymentUrl`. Otro test para cuando **no** hay token, que siga devolviendo
   sin `paymentUrl` (o que el front no redirija). Así queda preparado pero
   apagado por defecto.

## Tips para no romper lo que ya funciona
- El monto SIEMPRE es `total` (recalculado en el Worker). Nunca pasar monto
  desde el front.
- `external_reference` debe ser el `orderId` generado en el Worker.
- Los ítems pueden ir simplificados (nombre + cantidad + monto) para la
  preferencia: MP no necesita el catálogo interno.
- El rate limit ya cubre `createOrder` (5/min). Crear la preferencia es una
  llamada HTTP extra: si falla, atraparla y **no** tirar el pedido ya creado.
- En los tests del Worker, el `fetch` falso (`installFetchFalso`) no conoce
  `api.mercadopago.com`. Si metemos llamadas a MP en el código, el falso va a
  lanzar "URL no mockeada". Para eso hay que extenderlo condicionalmente: o
  detectar `mercadopago` y devolver `{ init_point: "https://mp.test/init" }`,
  o agregar un `opciones.mp` al arnés.

## Respuesta corta
**Sí, puedo dejarlo 95% preparado.** Lo ideal: añadir soporte condicional
(token existe → devuelvo `paymentUrl`; token no existe → comportamiento actual).
Así podés activar MP poniendo el secret sin tocar el resto. Te genero los
cambios en Worker + front + arnés de tests para que la suite siga verde.