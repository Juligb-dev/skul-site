# REPORTE DE AUDITORÍA AUTOMATIZADA
## SKUL — tienda React/Vite + Firebase + Cloudflare Worker

**Fecha:** 2026-10-06
**Estado general:** suite automatizada en verde — **405 tests web + 159 tests Worker + 42 checks de reglas + build OK**. Cobertura web: **86.44% sentencias / 82.32% funciones / 78.38% ramas / 89.82% líneas** (thresholds 60/60/50/60). Herramientas actualizadas: **vite 6 / vitest 4 / esbuild 0.25** (npm audit pasó de 13 a 5 avisos, todos en la cadena dev del emulador).

Este report resume qué pasó al auditar la tienda de punta a punta y, sobre todo, qué
encontró la suite que una revisión manual **no** habría encontrado. Todo lo que figura acá
puede reproducirse corriendo `npm run test:all` (ver *Instrucciones de Ejecución*).

El principio que ordenó todo: **el navegador no es confiable**. Precios, descuentos, stock y
saldos de gift cards los recalcula el Worker del lado de Cloudflare; las reglas de Firestore
deciden quién puede escribir y quién no, en el servidor de Google. La suite prueba los tres
niveles por separado (funciones, Worker, reglas) porque ninguno puede confiar en los otros.

---

## 1. Reporte de Vulnerabilidades y Puntos Ciegos

### 1.1 Retro de las escrituras del usuario (OWASP: IDOR / Tampering)

| # | Hallazgo | Severidad | ¿Parcheado? | Dónde |
|---|----------|-----------|-------------|-------|
| 1 | **`src/utils/format.js`: `fmt({})` devolvía `"$NaN"`** — un importe raro o faltante pedido por un descuento malformado renderizaba "NaN" a un cliente. | Baja | ✅ Sí | `src/utils/format.js` usa ahora `Number.isFinite` |
| 2 | **`src/utils/giftcards.js`: un código con espacios o sin guion no se reconocía** — `normGiftCardCode(" skul abc123 ")` devolvía `"SKULABC123"` y el checkout lo rechazaba como inválido aunque fuera un código real. | Media (afecta ventas) | ✅ Sí | `nuevoPrefijoSinGuion` repone el guion |
| 3 | **Asimetría frontend↔Worker para códigos de gift cards** — el fix del punto 2 solo existía en el frontend: el Worker (`normGiftCard`) no reponía el guion de "skul abc123" → "SKULABC123" y rechazaba códigos reales que el checkout aceptaba. | Media | ✅ Sí | `normGiftCard` en `worker.js` ahora normaliza igual que el frontend (2 tests nuevos: `skul abc123` → 200, `SKULABC123` → 200) |
| 4 | **Newsletter: correo inválido mostraba "ese correo ya estaba en la lista"** — las reglas rechazan un email mal formado con `permission-denied` (el mismo error que un correo repetido) y el pie de página traducía ambos igual. El visitante leía una mentira. | Media (UX/legal, no expone datos) | ✅ Sí | Validación en `subscribeToNewsletter` (código `invalid-email`) + estado `invalido` en `Footer.jsx` |
| 5 | **Cupón de % se calculaba sobre el SUBTOTAL previo al efectivo** — efectivo 10% + cupón 20% sumaban 30% (ambos sobre subtotal). Ahora el cupón PORCENTUAL se calcula sobre la base ya descontada del 10% (compuesto: 10% y después 20% de lo que queda = 28%). El cupón FIJO no se toca. Mismo orden aplicado en el preview del checkout (`StoreApp.jsx`). | ⚠ Decisión de negocio aplicada | ✅ Cambiado | `worker.js` + `StoreApp.jsx` + test pin en `descuentos.seguridad.test.js` (total 8.000) |

### 1.2 Backend (Worker): lo que los tests re-demandaron y quedó probado

El Worker recalcula todo y **ignora lo que le manda el navegador**. La suite de 159 tests
verifica, entre otros:

- **Precios**: un cliente que tacha el precio a $1, el stock a 999 o aplica descuentos no
  emitidos no logra nada — el Worker recomputa contra la base y rechaza (48 tests en
  `createOrder.seguridad.test.js`).
- **Límites**: cantidades > 20, provincias/zonas inexistentes, dirección > 200 caracteres,
  envíos inventados, `actions` que no existen → 400, nunca un pedido raro.
- **Rate limiting**: el mismo IP que spamea compras queda bloqueado (`código 429`), y la
  cuenta de intentos usa `workerLimpio()` con `vi.resetModules()` para no contaminar tests.
- **Carrera / oversell**: el último talle que compran dos personas a la vez → exactamente un
  pedido; el otro recibe error y el stock no queda negativo (16 tests en
  `atomico.seguridad.test.js`), todo vía transacciones Firestore con `updateMask` + `currentDocument`.
- **Telegram/MiCorreo**: si la cotización del correo falla, el pedido se corta con 503; si el
  aviso por Telegram falla, el pedido **ya está guardado** (se conserva, no se revierte).
- **PII**: `/pedidos` queda privado; `/orderTracking` expone solo total/estado/tracking, nunca
  dirección, teléfono ni email del comprador (chequeado en `endpoints.seguridad.test.js`).
- **Secretos**: el archivo del Worker no contiene secretos en texto; los tests barren el
  archivo y fuerzan a que todo pase por `env.*`.

### 1.3 Supervisor de reglas de Firestore (emulador)

`npm run test:rules` (42 checks, contra el **emulador**, nunca producción):

- Un visitante **no** puede escribir `/products`, `/coupons` ni `/giftCards` (rules `isAdmin()`).
- Un visitante **no** lee ni escribe `/orders` (privado). `/orderTracking` permite `get` por ID,
  prohíbe `list` y `create` (allowlist estricta, sin PII).
- `/newsletter` permite un `create` con **exactamente** `email/consent/source/createdAt` y
  email con forma de correo; prohíbe `update` (esa regla es la que sustenta la detección de
  correos repetidos del punto 1.1‑4).
- Solicitudes de arrepentimiento: acepta solo campos permitidos, rechaza extras, nombre vacío,
  motivos de 5000 caracteres y reescrituras.
- Toda colección inesperada (`/config`, `/pedidos`) → denegada.

### 1.4 Dependencias (npm audit)

Se actualizó la herramienta para limpiar los avisos que tenían parche disponible:

| Antes | Después |
|-------|---------|
| **13** avisos (3 moderados, 7 altos, 3 críticos) | **5** avisos (todos altos) |
| vite 5.4 + esbuild 0.21 (servidor dev expuesto) | **vite 6.4.4 + esbuild 0.25** ✅ |
| vitest 2.1 + @vitest/mocker ≤ 4.1.10 (path traversal) | **vitest 4.1.11 + @vitest/mocker 4.1.11** ✅ |
| tinypool / source-map-js (RCE gadget / DoS), con fix | **resueltos** ✅ |
| `@grpc/grpc-js` 1.9.16 (firebase → emulador) | **sin fix estable todavía** ⚠ |

Los **5 restantes** están todos en la cadena `firebase → @grpc/grpc-js`, que usa el
emulador y las herramientas Node del SDK. La versión estable más nueva de firebase
(12.19.0) sigue pinning `@grpc/grpc-js` vulnerable, y firebase 13 no salió estable.
No se forzó el fix (`npm audit fix --force`) porque rompería la matriz de versiones
y el sitio de producción no incluye `@grpc/grpc-js` en el bundle del navegador: el
SDK de Firestore web usa su propio transporte, no ese módulo.

### 1.5 Puntos ciegos que quedaron fuera del alcance automático

- **Playwright/E2E sobre navegador real y Axe (a11y)**: no instalados en esta pasada. Se
  sustituyeron con pruebas de componentes + jsdom (roles, `aria-live`, `aria-label`,
  deshabilitados). Ver *Siguientes pasos*.
- **Mercado Pago**: no hay SDK en `package.json`. El flujo de pago real (redirect/token) hay
  que confirmarlo con el cliente antes de poder probar pagos de verdad.
- **Bundle grande**: el build emite `index…js` de **1.024 kB (269 kB gzip)**. No es un bug de
  seguridad, pero conviene code‑splitting por rutas.
- **Trabajo documentado**: una vez alineado el punto 1.1‑3 (normalización de gift cards en el
  Worker), hay que re-correr la suite. El ide es que `npm run test:all` sea el gatillo.

---

## 2. Matriz de Casos Borde

| Caso | Comportamiento correcto | ¿Cubierto? | Test |
|------|------------------------|------------|------|
| Precio tachado / stock inflado en el request | El Worker lo recomputa y rechaza | ✅ | `createOrder.seguridad.test.js` |
| Compra de más de 20 unidades de un ítem | 400 | ✅ | ídem |
| Zona/provincia de envío que no existe | 400 (no se puede inventar envío) | ✅ | ídem |
| Dirección de más de 200 caracteres | 400 | ✅ | ídem |
| Cupón inexistente, vencido o apagado | Se rechaza; el de % no se puede apilar para esquivar el tope | ✅ | `descuentos.seguridad.test.js` |
| Gift card con espacios / sin guion / formato malo | Se normaliza o se rechaza según corresponda | ✅ | `giftcards.test.js` + punto 1.1‑3 |
| Dos personas compran el último talle a la vez | Una gana; la otra recibe error; stock no negativo | ✅ | `atomico.seguridad.test.js` |
| Telegram caído al confirmar | El pedido queda guardado igual | ✅ | ídem |
| Correo/cotización caída al calcular envío | 503, no se confirma un pedido sin precio | ✅ | `createOrder.seguridad.test.js` |
| Mismo IP spameando | 429 (rate limit) | ✅ | `endpoints.seguridad.test.js` |
| `actions` desconocida | 400 | ✅ | ídem |
| Email inválido en el newsletter | Se corta antes, muestra mensaje de correo inválido (no "ya estabas") | ✅ | `Footer.test.jsx` (20) |
| Suscribirse dos veces con el mismo correo | Segundo intento → "ya estabas en la lista", no se duplica | ✅ | ídem + regla newsletter en `test-rules.mjs` |
| Sin consentimiento (casilla) | No se envía nada (block legal) | ✅ | `Footer.test.jsx` |
| `settings/site` cerrada para visitante | No se renderiza la tienda, ni se montan sus componentes | ✅ | `SiteGate.test.jsx` (12) |
| Sitio cerrado + admin logueado | Admin ve la tienda con aviso naranja | ✅ | ídem |
| Fallo en el render de cualquier componente | ErrorBoundary: aviso + botón de recargar, resto de la app vivo | ✅ | `ErrorBoundary.test.jsx` (12) |
| Suscripción doble (doble Enter) | Un solo aviso por Telegram, una sola escritura | ✅ | `Footer.test.jsx` |
| `fmt()` con datos incompletos | `$0`, nunca `"$NaN"` | ✅ | `format.test.js` (14) |

Las 42 reglas (emulador) cubren el espejo del servidor de estos casos.

---

## 3. Código de Tests

### 3.1 Sitio (React) — 405 tests, config `vitest.config.js` (jsdom)

Cobertura sobre lo crítico (`src/utils/**` + `src/hooks/**` + `StoreApp` + `Checkout` +
`CorreoShipping`): **86.44% stmts / 82.32% funcs / 78.38% branch / 89.82% lines**
(thresholds `60/60/50/60`, `npm run test:coverage`). Las suites de ítems auxiliares
(`CartDrawer`, `SeguimientoPedido`) se corren en cada `test:web` pero no suman al
cómputo de cobertura por estar fuera del scope.

| Archivo | Cubre | Cantidad |
|---------|-------|---------|
| `src/test/setup.js` | Mock de Firebase (auth plano, Firestore en memoria), red apagada, DOM que jsdom no trae (matchMedia, ResizeObserver, IntersectionObserver) | — |
| `src/test/mocks/firestore.js` | Firestore in‑memory fiel: `getDoc/getDocs/setDoc/addDoc/updateDoc/deleteDoc/writeBatch/onSnapshot`, `updateMask`-like, rollback, `__fs.seed/get/has/ids/emit/emitError` (`emitError` dispara el error de un snapshot; `fail` no) + la única regla de la que depende la lógica (newsletter create/update) | — |
| `src/utils/format.test.js` | Formateo monetario, incl. el `$NaN` | 14 |
| `src/utils/slug.test.js` | Slugs de productos (acentos, espacios, caracteres raros) | 18 |
| `src/utils/giftcards.test.js` | Normalización de códigos, incl. guion extraviado | 45 |
| `src/utils/routes.test.js` | Enrutado y rutas protegidas/privadas | 75 |
| `src/utils/precios.test.js` | Pin del contrato de descuentos en el frontend (espejo del Worker): efectivo→cupón→gift card→envío; el envío **nunca** se descuenta; cupón % sobre base ya descontada (28% compuesto, no 30%) | 19 |
| `src/utils/correo.test.js` | `getShippingRates`/`getAgencies` con fetch stubeado; error "Falta configurar ORDER_NOTIFY_WORKER_URL" y respuestas sin JSON | 7 |
| `src/utils/cloudinary.test.js` | Subida a Cloudinary: req de firma con Bearer, `api_key/timestamp/signature/folder`, sin sesión, fallos traducidos | 5 |
| `src/utils/notifyTelegram.test.js` | Aviso Telegram sin config / red caída → warn o error sin romper el flujo | 4 |
| `src/hooks/useCoupons.test.jsx` | `checkCoupon/saveCoupon/deleteCoupon/useCoupons`, `subscribeToNewsletter/useSubscribers/deleteSubscriber`, correos repetidos por regla; `usedCount/maxUses` NUNCA llegan al navegador | 43 |
| `src/hooks/useGiftCards.test.jsx` | `checkGiftCard/useGiftCards`: saldo (`balance−usedAmount`), vencimiento (`FakeTimestamp`), normalización y motivos de rechazo en castellano | 24 |
| `src/hooks/useSiteStatus.test.jsx` | Estado del sitio DEFAULT→abierto/cerrado vía `onSnapshot` y vía error del snapshot (`emitError`) | 7 |
| `src/hooks/useAdminAuth.test.jsx` | Sesión admin legítima, sin sesión, cambio de sesión en vivo | 7 |
| `src/hooks/useNavegador.test.jsx` | `useMediaQuery` (breakpoints con matchMedia falso) y `useReveal` (IntersectionObserver stubeado) | 6 |
| `src/hooks/useOrders.test.jsx` | Pedidos del cliente, cita previa, fallos de Firestore | 12 |
| `src/hooks/useProducts.test.jsx` | Productos por slug/categoría, `onSnapshot`, fallos | 9 |
| `src/pages/Checkout.test.jsx` | Checkout completo por props: cupón/gift card (aplicar/quitar/error), reglas de "Confirmar", medios de pago, `ORDER_NOTIFY_WORKER_URL` | 29 |
| `src/components/CartDrawer.test.jsx` | Cajón: stepper por key, tope de stock, cerrar con Escape + limpieza de listener, estados vacío/lleno | 13 |
| `src/pages/SeguimientoPedido.test.jsx` | Busca por código/Enter, trim, estados (cancelado/desconocido), fallo de Firestore y **sin PII**: el doc "sucio" no renderiza nombre/dirección/pago | 12 |
| `src/admin/SiteGate.test.jsx` | Las 4 ramas de la puerta de la vidriera (cargando, abierta, cerrada, cerr+admin) + que la tienda no se monta al estar cerrada | 12 |
| `src/components/ErrorBoundary.test.jsx` | Fallo de render atrapado, fallo profundo, resto de la app viva, estilos inline, no reseteo | 12 |
| `src/components/Footer.test.jsx` | Máquina de estados del newsletter end‑to‑end: consentimiento, correo válido/repetido/inválido, doble envío, Enter, a11y del formulario | 20 |
| `src/StoreApp.test.jsx` | Integración punta a punta: home→carrito→checkout→confirmar→gracias con Firestore real en memoria + `createOrder` mockeado; payload sin montos; **cupón y gift card reales** (normalización, líneas del resumen, código en el pedido, cupón inexistente); persistencia en localStorage; ficha ProductPage suma a la misma línea | 12 |

### 3.2 Cloudflare Worker — 159 tests, config `vitest.worker.config.js` (node, sin Miniflare)

| Archivo | Cubre | Cantidad |
|---------|-------|---------|
| `cloudflare-worker/test/helpers/firestore-falso.js` | Fake de la REST API de Firestore con `encodeFields`, respeto de `updateMask` (409) y `currentDocument` (412), rollback de transacciones | — |
| `cloudflare-worker/test/helpers/arnes.js` | `workerLimpio()`, `envDePrueba()` sin secretos, `pedir()/pedirDesdeIp()`, `PRODUCTO`, `PEDIDO_BASE` | — |
| `createOrder.seguridad.test.js` | Precios/cantidades/envío/traversal de objetos/validación | 48 |
| `descuentos.seguridad.test.js` | Cupones, gift cards, encadenados, tope del 20%, orden de cálculo efectivo+cupón (compuesto), normalización de códigos | 46 |
| `endpoints.seguridad.test.js` | CORS, rate limit, `signUpload`/auth, PII en `/orderTracking`, secretos en el archivo | 49 |
| `atomico.seguridad.test.js` | Oversell, carrera por el último talle, rollback, Telegram | 16 |

### 3.3 Reglas de Firestore — 42 checks

`scripts/test-rules.mjs`, corriendo contra el emulador (`firebase emulators:exec`). Actores:
visitante (sin auth), admin (uid fijo de `firestore.rules`) y Worker (service account).
Cada `check()` declara si la operación debe poder o fallar y el runner lo cumple.

---

## 4. Instrucciones de Ejecución

```bash
npm install         # ya instalado en esta auditoría

# Suite completa (orden de CI):
npm run test:all    # = test:rules  +  test (web+worker)  +  build

# Por partes:
npm run test:rules  # reglas contra el emulador (levanta y apaga solo)
npm run test        # = npm run test:web && npm run test:worker
npm run test:web    # sitio: vitest (jsdom)
npm run test:worker # Worker: vitest --config vitest.worker.config.js (node)
npm run test:watch  # modo escucha para desarrollar
npm run test:coverage
npm run build       # baseline de que el sitio compila a producción
```

**Requisitos:** Node ≥ 18 con fetch nativo (probado en Node 24), y CLI de Firebase global
(`firebase`) para `test:rules` (baja el emulador de Firestore a disco la primera vez).

**Estado al cierre de la auditoría:** `test:rules` → **42 ok, 0 fallas** · `test` → **564** tests (405 web + 159 worker) ✦ **0 fallas** · cobertura web → **86.44% stmts / 82.32% funcs / 78.38% branch / 89.82% lines** (thresholds 60/60/50/60 en verde) · `build` → **OK** (1.024 kB js, 269 kB gzip) · `npm audit` → 5 avisos (cadena dev `@grpc/grpc-js`, sin fix estable).

---

### Siguientes pasos recomendados

1. Playwright + Axe para E2E/a11y sobre navegador real (esta pasada usó jsdom + componentes).
2. Confirmar el flujo de Mercado Pago (no hay SDK declarado) para poder testear pagos.
3. Cuando `firebase` 13 estable o un `@grpc/grpc-js` parcheado estén disponibles,
   subir la cadena para cerrar los 5 avisos restantes de audit y re-correr `test:all`.

*Nota: el punto 1.1‑3 (gift cards en el Worker) y el punto 1.1‑5 (orden de
descuentos) y el 1.4 (herramienta actualizada) ya quedaron aplicados y en verde.*