# SKUL — sitio de la tienda

## CÓMO PUBLICARLO EN TU DOMINIO (Firebase Hosting)

Tu proyecto de Firebase ya está cargado en el código (`src/firebase.js`) y el
`.firebaserc` ya apunta al proyecto **`skullt`**, así que no hay que crear nada
nuevo: solo compilar y subir.

```bash
# 1. Compilar
npm install
npm run build            # genera la carpeta dist/

# 2. Entrar a Firebase (una sola vez)
npm install -g firebase-tools
firebase login
firebase use skullt

# 3. Subir el sitio
firebase deploy --only hosting
```

Al terminar te devuelve la URL del sitio — normalmente
`https://skullt.web.app`.

### Poner TU dominio

1. Firebase Console → **Hosting** → **Add custom domain** → escribís tu
   dominio (por ejemplo `skul.com.ar` y también `www.skul.com.ar`).
2. Firebase te da un registro **TXT** de verificación y un **A** (dominio
   raíz) o un **CNAME** (`www`). Esos registros se cargan en el panel de DNS
   de donde tengas el dominio.
3. Cuando propaga (de minutos a unas horas), Firebase emite el certificado
   SSL solo. No se paga nada.

**Atención:** cambiar esos registros mueve el dominio del lugar donde está
hoy. Si hoy ese dominio muestra otra web, a partir del cambio va a mostrar
esta tienda.

### Si tocás las reglas de la base
```bash
firebase deploy --only firestore:rules
```

### Chequeo de 5 minutos antes de largar
- Entrá a `/admin` y cargá: **foto del hero**, **fotos de cada categoría**,
  **fotos de Shop the Look**, y el nombre del drop.
- Cargá al menos un producto con **talles y stock** (sin talles no se puede
  comprar) y sus **colores**.
- Probá una compra completa: agregar → carrito → checkout → pantalla final.
- Revisá todo en el celular.

---

## Ronda 5 — todo sube, carrito integrado, botones y panel (24/09/2026)

- **NOVEDADES también sube como los demás bloques.** Dejó de ser una sección
  que te obligaba a recorrerla entera: ahora es un bloque más de la pila
  (sube por encima del anterior) y la fila se **empuja a mano** con el dedo, la
  rueda o las flechas. NO-RESTOCK y el resto ya lo hacían.
- **El carrito quedó integrado.** Antes se dibujaba **por detrás** de la
  cabecera (tenía menos capa que el nav). Ahora va por encima de todo, es un
  panel claro con las esquinas y los botones del mismo lenguaje que la tienda,
  con contador de ítems, subtotal y la nota del 10% por transferencia.
- **Se terminaron los botones negros de más.** Todos los botones del sitio
  (ficha de producto, checkout, páginas informativas, panel de admin) pasan a
  un mismo sistema: redondeados, en mayúscula chica, y con una jerarquía clara
  — **oscuro solo el botón principal**, el resto claro con borde suave. Los
  estados "elegido" (talle, forma de pago, zona) siguen oscuros porque marcan
  selección. El foco de los campos ahora es un halo óxido en vez de un borde
  negro grueso.
- **Panel de admin: campos nuevos.** Cada producto ahora tiene **Colores**
  (se cargan como `NOMBRE:#hex`, separados por coma — son los círculos de la
  ficha) y **Calce** (0 = slim, 1 = baggy — mueve la barrita FIT).

### Qué es modificable desde `/admin` hoy

| Pestaña | Qué se carga |
|---|---|
| **Estado del sitio** | Abrir/cerrar la tienda, mensaje de cierre, mostrar Outlet, countdown del drop (nombre + fecha), **foto del hero**, **foto de cada categoría** del home, **fotos de Shop the Look** |
| **Productos** | Nombre (arma la URL sola), categoría, precio, peso, tag, tono de textura, hasta 4 fotos, descripción, composición, tabla de talles, talles + stock por talle, **colores**, **calce**, No-Restock, Outlet con precio rebajado, activo/oculto |
| **Cupones** | Código, descuento (% o monto), límite de usos, a qué aplica (todo / categoría / productos), pausar, borrar |

Comprobación: `npm run build` finaliza sin errores.

## Ronda 4 — el contenido sube, teaser de NRS y paleta oscura (24/09/2026)

### El contenido ahora sube

- **Las secciones del home se apilan.** DESTACADOS, NO-RESTOCK y SHOP THE LOOK
  quedan **clavados arriba de la pantalla** y el bloque siguiente se les sube
  por encima, con las esquinas redondeadas y sombra. Ese es el movimiento de
  "el contenido va hacia arriba" en vez de un scroll plano. La sección de
  categorías queda por encima de todas para que no la tapen.
- **NOVEDADES ya no te obliga a recorrerla entera.** El tramo fijado bajó de
  210vh a 145vh (se pasa mucho más rápido) y, además, **la fila se puede
  empujar a mano** (dedo, rueda del mouse o las flechas). Apenas la movés vos,
  deja de seguir el scroll y queda donde la dejaste.

### No-Restock

- **El home ya no muestra las prendas del drop**: ahora son **siluetas
  tapadas** (borrosas y oscurecidas) con la leyenda "BLOQUEADO" y el conteo de
  piezas, para que den ganas de entrar. Se destapan recién adentro.
- **La ficha de producto de un drop único cambia de paleta**: fondo oscuro,
  panel oscuro, botones claros, y **la cabecera también se pone oscura**
  (barra, cinta y navegación), en vez de quedar gris como el catálogo.

### Otros arreglos

- **Los nombres de la sección de categorías ya se leen.** Estaban muy
  transparentes los que no eran el activo; ahora ninguno baja del 50% de
  opacidad, la placa oscura de fondo es más cerrada y cada nombre tiene sombra.
- **Cabecera de celular rehecha**: la cinta de anuncios y la barra de
  navegación pasan a ser **dos piezas redondeadas separadas** (como la
  referencia), el botón de menú es un **ícono de tres líneas** en vez del texto
  "SHOP", y la fila de categorías se oculta en celular porque ya está dentro
  del menú.

Comprobación: `npm run build` finaliza sin errores.

## Ronda 3 — arreglos del menú, sección que se despliega con el scroll (24/09/2026)

### Corregido

- **El menú de escritorio no abría.** No era el componente: una regla vieja
  de `global.css` le dejaba `bottom: 0` al panel, así que al abrirlo quedaba
  con **altura cero** y no se veía nada. Se reseteó en la capa nueva.
- **El menú de celular ahora sí es el de la referencia**: pantalla clara con
  **dos tarjetas redondeadas**, la X arriba a la izquierda, el logo al centro
  y un **selector segmentado** (TIENDA / NO-RESTOCK), la lista grande de
  accesos, los grupos con "+" desplegables, y abajo los dos botones tipo
  píldora (MI CUENTA / INSTAGRAM) más la fila con el ícono de envíos.
- **Contraste de la sección de categorías.** El texto se perdía sobre las
  fotos: ahora el degradado lateral es mucho más cerrado, hay una placa
  oscura con desenfoque detrás de la lista y sombra en cada nombre.
- **Paleta propia de No-Restock.** Las tarjetas de NRS ya no heredan el gris
  de la tienda: marco claro sobre negro, fondo propio, acento óxido en el
  precio de transferencia, insignias oscuras y talles en blanco. Aplica tanto
  a la página de No-Restock como a la sección nueva del home.

### Agregado

- **Sección NO-RESTOCK en el home.** Franja oscura con su propio texto
  ("drop único, no se repone"), hasta 4 piezas del drop y el botón para
  entrar a la sección completa.
- **NOVEDADES se despliega con el scroll.** Ya no es una grilla quieta: la
  sección queda **fijada en pantalla** y, mientras bajás, las prendas van
  pasando de costado una tras otra (con flechas y el contador de "tarjetas" a
  los costados). En celular se convierte en un riel que se arrastra con el
  dedo, porque ahí una sección fijada es incómoda.
- DESTACADOS quedó como **riel horizontal** que se arrastra.

Comprobación: `npm run build` finaliza sin errores.

## Ronda 2 — navegación con scroll, categoría sticky y ficha de producto (24/09/2026)

Segunda pasada sobre la referencia, esta vez sobre cómo se **navega** y cómo
se ve cada sección, no solo el color.

### Lo que cambió

- **La hoja de contenido sube sobre el hero.** Antes de "Novedades" había un
  corte seco; ahora el contenido es una hoja con las esquinas de arriba
  redondeadas que sube por encima de la foto. El hero tiene además la línea
  fina debajo del título, como la referencia.
- **Se sacó "ÚLTIMAS UNIDADES".** El home ahora es: hero → Novedades →
  Destacados → Shop the Look → Categorías.
- **"ELEGÍ UNA CATEGORÍA" es una sección sticky de verdad** (componente
  nuevo, `src/components/CategoryStory.jsx`): la foto queda **fijada a
  pantalla completa** mientras bajás y los nombres de categoría pasan por
  encima, agrandándose el que está activo y achicándose los demás. La foto de
  fondo va **cambiando sola** según la categoría activa, y a la derecha hay un
  contador de paso (1, 2, 3…). Es el efecto de "el contenido va subiendo
  hacia vos" que hace la referencia.
- **Ficha de producto rehecha** (`src/pages/ProductPage.jsx`), con el layout
  de ellos:
  - Foto grande a la izquierda con la tira de miniaturas en columna al
    costado; en celular la foto va arriba y las miniaturas pasan a una
    pastilla de vidrio debajo.
  - Panel redondeado a la derecha con: nombre, precio grande **con
    transferencia** y el precio de lista con "3 y 6 cuotas sin interés",
    selector de color (círculos), selector de talle, botón grande
    ("SELECCIONÁ UN TALLE" → "AGREGAR AL CARRITO — TALLE M"), aviso de envío,
    **escala de calce** (slim / true to size / baggy) y **acordeones**
    "01 Información · 02 Tabla de talles · 03 Cambios y despachos".
  - En celular, **barra fija abajo** con el botón de compra.
  - Abajo, un riel horizontal "TAMBIÉN TE PUEDE INTERESAR" con productos de
    la misma categoría.
- **Menú nuevo** (`src/components/Header.jsx`): en escritorio "SHOP" abre una
  **hoja ancha de vidrio** debajo de la cabecera con la lista de accesos
  directos, tres columnas de categorías y dos tarjetas de foto destacadas. En
  celular es una **pantalla clara completa** con el logo, la lista grande y
  grupos desplegables con "+".

### Detalles a tener en cuenta

- El selector de color **solo aparece si el producto tiene colores cargados**
  (campo `colors`): `[{ name: "crema", hex: "#f2efe6" }, …]`. Los productos de
  ejemplo ya llevan algunos colores para que se vea la fila. El panel de admin
  todavía no tiene un campo para esto, así que si querés cargarlos en tus
  prendas hay que agregarlo (es un campo chico). La escala de calce se muestra
  siempre y el marcador se mueve con el campo `fit` (0 = slim, 1 = baggy;
  por defecto queda en el medio).
- No se implementó la sección **"LLEVALO EN PACK"** (comprar dos prendas
  juntas con descuento) que tiene la referencia: eso sí necesita lógica de
  carrito nueva. Queda como pendiente.

Comprobación: `npm run build` finaliza sin errores.

## Revisión de diseño — capa de escaparate + correcciones (24/09/2026)

Se revisó todo el proyecto de punta a punta y se reescribió la capa visual de
la tienda para que quede pegada a la referencia aportada, sin tocar la
marca, los textos ni el funcionamiento de la tienda (catálogo, carrito,
checkout, Firebase, `/admin`).

**Dónde vive el diseño ahora:** `src/styles/storefront.css` es la última capa
del sitio y se importa después de `global.css`, así que pisa a las capas
viejas sin que haya que reescribir todo. Los colores, tipografía, radios y
espaciados de la referencia están ahí arriba, en un solo bloque `:root`, para
cambiarlos en un segundo.

### Estilo

- Fondo de tienda `#eaeaea`, tinta `#111`, acento óxido `#bf4d26` y
  tipografía **Arimo** (misma familia de la referencia; si no carga, el CSS
  cae sola a Helvetica/Arial).
- Cabecera flotante en un panel redondeado con vidrio esmerilado sobre la
  foto del hero, y cinta de anuncios en loop continuo real (antes el texto se
  corría de golpe, no era un loop).
- Hero a pantalla completa, contenido centrado en celular y alineado a la
  izquierda en escritorio, con degradado de negro a transparente.
- Tarjetas de producto blancas y redondeadas (18px) sobre el gris, foto 4:5
  con esquinas redondeadas, etiqueta blanca arriba a la derecha, cambio de
  foto al pasar el mouse y pastilla de talles en vidrio que aparece sobre la
  foto en escritorio (en celular queda como fila debajo de la foto, porque
  ahí no existe el hover).
- Grillas con separación real entre tarjetas (4 columnas en escritorio, 3 en
  tablet, 2 en celular) en vez de la grilla de líneas de 1px.
- Footer claro con esquinas superiores redondeadas, como la referencia, y la
  marca gigante al pie.

### Correcciones de bugs

1. **La grilla mostraba talles agotados como comprables.** Las tarjetas
   miraban un campo (`sizesOut`) que el panel de admin nunca escribe, así que
   un talle sin stock igual aparecía como botón de compra y una prenda
   totalmente agotada nunca se marcaba "SIN STOCK". Ahora grillas, ficha de
   producto y carrito leen todos lo mismo: el stock real por talle.
2. **Con el stock en 0 no se podía comprar.** Al sumar dos veces el mismo
   talle, la cantidad se recortaba a 0 y el ítem quedaba inservible. Ahora el
   tope es el stock cargado, y si la prenda no tiene cantidades cargadas se
   puede comprar sin límite.
3. **Prendas sin stock cargado eran incomprarables.** En la ficha de producto
   todos los talles salían tachados. Ahora, si no hay cantidades cargadas, se
   trata como disponible.
4. **El botón "NEW DROP" del hero llevaba al catálogo**, igual que
   "SHOP ALL". Ahora abre No-Restock.
5. **"DESTACADOS" mostraba los mismos productos que "NOVEDADES"** cuando el
   catálogo era chico. Ahora toma piezas repartidas a lo ancho del catálogo y
   la sección no se muestra si no hay nada distinto que ofrecer.
6. **Los productos de ejemplo tenían categorías que ya no existen**
   (`tops`, `pants`): esas prendas no aparecían en ninguna categoría del
   menú. Se reasignaron a categorías reales y además se les cargó talle y
   stock, así el catálogo de respaldo se ve y se puede comprar como si fuera
   real.
7. **La ficha de producto rompía la textura de relleno** cuando una prenda no
   tenía "tono" cargado (daba un valor inválido). Ahora usa un tono por
   defecto.
8. La imagen de `og:image` apuntaba a un archivo que no existía en el
   proyecto; se corrigió a una que sí está.

Comprobación: `npm run build` finaliza sin errores.

### Lo que todavía falta (no es diseño, es integración)

- **Pago con tarjeta real.** Hoy crédito/débito se registran pero no se
  cobran; falta la función serverless con Mercado Pago (ver más abajo).
- **Fotos reales de las prendas** (hoy las grillas caen a la textura de
  relleno si el producto no tiene fotos cargadas).
- **Imagen para compartir** (1200x630) en `/public`, y **deployar el
  Cloudflare Worker** del aviso por Telegram.
- Una **tipografía de marca propia** para el wordmark grande (hoy usa Arimo
  en bold; la referencia tiene su propio alfabeto intervenido).

## Corrección V7 — navegación y secciones

Esta revisión corrige fallas detectadas en la versión entregada previamente:

- El encabezado ya no queda fijo y transparente sobre catálogo, producto,
  checkout o páginas informativas.
- El menú hamburguesa usa únicamente categorías que existen en `config.js`.
  Se eliminaron destinos vacíos como `pants`, `tops` y `calzado`.
- Los dos submenús desplegables se ocultan y muestran correctamente, sin
  enlaces cortados.
- La portada fue reordenada como la referencia: Novedades, Destacados, Shop
  the Look, Últimas unidades y categorías al final.
- Las categorías dejaron de ocupar una sección sticky excesiva; ahora son
  tarjetas editoriales funcionales al final del home.

Comprobación: `npm run build` finaliza sin errores.

## Edición visual Future (23/09/2026)

Esta entrega conserva la tienda original —catálogo, productos, carrito,
checkout, Firebase y `/admin`— y actualiza solo la presentación. La dirección
visual se inspira en la referencia aportada: fotografía a pantalla completa,
tipografía editorial, cabecera oscura, cinta animada y grillas compactas. No
incorpora la marca, textos, imágenes ni código de aquel sitio.

Cambios principales:

- Hero de pantalla completa que utiliza la foto configurada desde el admin.
- Ticker de anuncios y marquee continuo.
- Entradas por scroll, hover en productos, menú móvil y compatibilidad con
  `prefers-reduced-motion`.
- Grillas sin grandes huecos y tarjetas de producto de estilo editorial.

Para usarlo:

```bash
npm install
npm run dev
```

Para publicar, ejecutar `npm run build`; los archivos finales quedan en
`dist/`.

## Última revisión (esta entrega)

El proyecto ya andaba bien en general, pero al armar el zip final aparecieron
3 errores reales que impedían que compilara o mostraban información vieja.
Ya están corregidos:

1. **`ProductPage.jsx` no compilaba** — importaba `CATEGORY_INFO` desde
   `config.js`, pero ese dato ya no existe ahí (se sacó en un cambio
   anterior, cuando se decidió que cada producto cargue su propia
   descripción en vez de usar una genérica por categoría). Se sacó ese
   import viejo; ahora la descripción y composición solo se muestran si el
   producto las tiene cargadas.
2. **`SizeGuide.jsx` (la guía de talles) tenía código duplicado** — quedaron
   dos versiones de la misma función pegadas una debajo de la otra (un
   "pegado" mal hecho), lo cual también rompía el sitio. Se dejó una sola
   versión limpia: si el producto no tiene tabla de talles cargada, muestra
   un aviso en vez de romperse.
3. **`ProductGrid.jsx` (las grillas de productos) todavía mostraba talles
   S/M/L/XL por defecto** cuando un producto no tenía talles cargados,
   aunque ese comportamiento ya se había sacado en la página de producto.
   Ahora es consistente: sin talles cargados, no se inventan talles.

También se corrigió un typo en el pie de página ("drechos" → "derechos") y
se actualizaron los textos de ayuda del panel de admin que todavía
prometían un "valor genérico por categoría" que ya no existe (ver más
abajo, sección "Carga de productos").

Se probó que el proyecto **compila y buildea sin errores** (`npm run
build`) antes de armar este zip.

## Qué se arregló / agregó (histórico)

1. **No-Reastock ilegible** → el nombre y precio de cada prenda usaban el color de
   texto por defecto (negro), que quedaba negro sobre el fondo negro de esa
   sección. Ahora tienen clases (`nrs-name`, `nrs-price`, etc. en
   `src/styles/global.css`) que los pintan en blanco/gris claro, manteniendo
   la estética oscura y "exclusiva" de la sección.
2. **Página más larga** → se agregó una sección "Cómo comprar" (4 pasos) y una
   sección "Seguinos en Instagram" en el Home (`src/pages/Home.jsx`).
3. **Menú de las 3 líneas animado** → ahora el ícono se transforma en X al
   abrirse y el panel se despliega con una animación de alto/opacidad,
   con los links apareciendo en cascada (ver `.mobile-menu-panel` y
   `.menu-burger` en `src/styles/global.css`, componente `Header.jsx`).
4. **Responsive** → el sitio ya usaba `clamp()`, grids con `auto-fit`/`auto-fill`
   y breakpoints; se mantuvo y se revisó que todo (incluyendo el nuevo panel
   de admin) funcione en celular, tablet y PC.
5. **Por qué no abría en el navegador** → el archivo original era un único
   componente `.jsx` sin `index.html`, sin `package.json` ni configuración de
   build. Un navegador no puede ejecutar JSX directamente. Ahora es un
   proyecto real (Vite) que sí se puede correr y compilar. Ver "Cómo correrlo"
   abajo.
6. **Código organizado en archivos** → separado en `data/`, `hooks/`,
   `components/`, `pages/` y `admin/` (detalle más abajo).
7. **Sistema de cerrar la web con contraseña** → sección "Sistema de cierre /
   admin" más abajo.
8. **Pagos** → sección "Conectar Mercado Pago" más abajo.

## Estructura de carpetas

```
src/
  main.jsx              punto de entrada
  App.jsx                decide entre el sitio público y /admin
  StoreApp.jsx            la tienda en sí: guarda el carrito, la página
                            actual, el cupón aplicado, etc. y arma la página
  firebase.js             conexión a Firebase (tu config ya está cargada)
  data/
    config.js              WhatsApp, Instagram, mail, CVU, categorías,
                            zonas de envío, talles posibles (S/M/L/XL/UNICO)
    seedProducts.js         productos de ejemplo, solo para la carga inicial
  utils/format.js          formateo de precios ($ y separador de miles)
  hooks/                    lógica reutilizable, sin diseño visual
    useReveal.js              animación de aparecer al hacer scroll
    useSiteStatus.js          abierto/cerrado, mensaje, outlet, drop (Firestore)
    useAdminAuth.js            login del admin (Firebase Auth)
    useProducts.js             catálogo en vivo (Firestore)
    useCoupons.js              cupones de descuento (crear, validar, canjear)
  components/               piezas visuales reutilizables
    Header.jsx, Footer.jsx, CartDrawer.jsx (carrito lateral),
    ProductGrid.jsx (grilla de productos), Fabric.jsx (textura de fondo
    cuando un producto no tiene foto), Reveal.jsx (animación al scrollear),
    DropCountdown.jsx (cuenta regresiva del próximo drop)
  pages/                     una página = una pantalla completa
    Home, Catalog (todo el catálogo con filtro), NoReastock (drops únicos),
    Outlet, ProductPage (detalle de un producto), SizeGuide (guía de talles),
    Nosotros, Contacto, Checkout, Thanks (las 3 pantallas de "gracias")
  admin/                     todo lo que vive detrás de /admin
    SiteGate.jsx             bloquea el sitio si está "cerrado"
    ClosedScreen.jsx         pantalla que ven los visitantes si está cerrado
    AdminLogin.jsx            formulario de login
    AdminApp.jsx              decide entre login y panel según si estás logueado
    AdminPanel.jsx            el panel en sí: 3 pestañas (Estado, Productos, Cupones)
scripts/seed-products.mjs   sube los productos de ejemplo a Firestore una vez
firestore.rules             reglas de seguridad para copiar en Firebase
```

## Cómo correrlo en tu compu

Necesitás tener [Node.js](https://nodejs.org) instalado (versión 18 o más
nueva). Después, en una terminal, parado en esta carpeta:

```bash
npm install
npm run dev
```

Te va a dar un link (típicamente `http://localhost:5173`). Abrilo en el
navegador y ya está funcionando.

Para subirlo a internet más adelante, lo más simple y gratuito es
[Vercel](https://vercel.com) o [Netlify](https://netlify.com): conectás tu
repo de GitHub (o arrastrás la carpeta) y ellos hacen `npm run build`
automáticamente.

## Sistema de cierre / admin (contraseña + "nuevo drop el 4/8")

Esto es lo que pediste: poder cerrar la web para todo el mundo, mostrar un
mensaje tipo "nuevo drop el 4/8", y que solo vos puedas entrar (con
contraseña) a seguir cargando productos mientras está cerrada.

**Importante:** para que esto funcione igual para TODOS los visitantes (no
solo en tu navegador), la información de "abierto/cerrado" y los productos
tienen que vivir en un lugar compartido en internet, no solo en tu
computadora. Un archivo `.jsx` solo, sin nada más, no puede hacer eso. Por
eso se usa [Firebase](https://firebase.google.com) (de Google), que tiene un
plan gratuito (Spark) más que suficiente para esto.

### Configuración (una sola vez, ~10 minutos)

1. Andá a https://console.firebase.google.com, iniciá sesión con una cuenta
   de Google y creá un proyecto nuevo (gratis).
2. **Build → Authentication → Sign-in method** → habilitá "Email/contraseña".
   Después en la pestaña **Users** → "Add user" → creá TU usuario:
   tu email + la contraseña que vas a usar para entrar a `/admin`. Esa
   contraseña es la que va a proteger la carga de productos.
3. **Build → Firestore Database → Create database** → modo producción,
   cualquier región (ej. `us-central`).
4. **Firestore → Rules** → borrá lo que hay y pegá el contenido del archivo
   `firestore.rules` de este proyecto → **Publish**. (Esto hace que
   cualquiera pueda ver la tienda, pero solo vos, ya logueado, puedas
   editar.)
5. Ícono de tuerca (arriba a la izquierda) → **Project settings** → bajá
   hasta "Your apps" → ícono `</>` (Web) → registrá una app (el nombre da
   igual) → te va a mostrar un objeto `firebaseConfig`. Copialo entero.
6. Pegalo en `src/firebase.js`, reemplazando el objeto de ejemplo que ya
   está ahí.
7. (Opcional pero recomendado) Corré `npm run seed:products` para cargar los
   15 productos de ejemplo directo en Firestore, y así no tener que cargarlos
   a mano uno por uno la primera vez. Antes tenés que pegar el mismo
   `firebaseConfig` en `scripts/seed-products.mjs`.

### Cómo se usa día a día

- Para cerrar la web: entrá a `tuweb.com/admin`, iniciá sesión con el email y
  contraseña que creaste en el paso 2, andá a la pestaña "Estado del sitio",
  escribí el mensaje (ej. "Nuevo drop el 4/8") y tocá **"Cerrar la web"**.
  Todos los visitantes van a ver esa pantalla en vez de la tienda, hasta que
  vos apretás "Reabrir la web".
- Mientras está cerrada, vos SÍ podés seguir viendo y navegando el sitio
  normalmente (para revisar cómo queda), porque estás logueado como admin.

### Sobre la seguridad de este sistema

Nadie sin tu contraseña puede escribir/editar nada (eso lo garantizan las
reglas de Firestore + Firebase Authentication, que corren en los servidores
de Google, no en el navegador). Es el mismo tipo de sistema que usan tiendas
chicas reales hechas con Vite/React. Si en algún momento planeás manejar algo
más sensible (pagos reales, datos personales), lo ideal es sumar un backend
propio, pero para "cerrar la tienda + cargar productos" esto es sólido y
gratis.

## Carga de productos (pestaña "Productos" en /admin)

Completás el formulario y se guarda automáticamente — no hace falta tocar
código para agregar una prenda nueva. Puntos importantes:

- **Talles disponibles es el único campo que realmente importa para poder
  vender la prenda.** Si no marcás ningún talle, el producto queda sin
  talles: en la página del producto no va a aparecer ningún botón de talle,
  y como el botón "Agregar al carrito" exige tener un talle elegido, ese
  producto queda **imposible de comprar** hasta que le cargues talles.
- **Descripción y composición son opcionales.** Antes existía un texto
  "genérico" que se mostraba si los dejabas vacíos; eso se sacó. Ahora, si
  los dejás vacíos, esas secciones simplemente no aparecen en la página del
  producto.
- **Tabla de talles (medidas)** también es opcional. Si no la cargás, la
  página "Ver guía de talles" de ese producto muestra un aviso ("todavía no
  cargamos una tabla de talles para esta prenda") en vez de romperse o
  mostrar una tabla inventada.
- **Talles agotados**: tildá los que ya no tenés en stock; se muestran
  tachados y no se pueden elegir, pero el producto sigue viéndose. Si TODOS
  los talles cargados están agotados, la prenda se marca "SIN STOCK" en las
  grillas (blanco y negro) en vez de sacarse de la web.
- **Fotos**: hasta 4 por prenda, se comprimen solas al subirlas (así no
  pesa la base de datos). Si no cargás fotos, se usa una textura de relleno
  con el color/tono que elijas en "Tono de textura".

## Sección Outlet

Sirve para vender con descuento productos puntuales sin tocar su precio
"de catálogo". En el formulario de un producto, tildá **"Incluir en
Outlet"** y cargá el precio rebajado. Ese producto va a aparecer:
- Con el precio tachado + el precio de outlet, en su grilla normal.
- Además, en la sección **Outlet** del menú — pero esa sección solo es
  visible para los visitantes si la activás en la pestaña "Estado del
  sitio" → **"Mostrar Outlet"**. Si no hay ningún producto marcado como
  outlet, el link del menú no aparece aunque la actives.

## Countdown de drop ("Próximo drop" en el Home)

Es la franja negra con cuenta regresiva que puede aparecer arriba del
Home. Se activa desde "Estado del sitio" → "Countdown de drop": ponés un
nombre (ej. "No-Restock Vol. 3") y una fecha/hora, tocás "Guardar drop" y
después "Mostrar countdown". Al hacer clic en la franja, lleva a la
sección No-Restock. Cuando la fecha ya pasó, el countdown deja de
mostrarse solo (no hace falta apagarlo a mano).

## Cupones de descuento (pestaña "Cupones" en /admin)

Cada cupón tiene un código (lo que escribe el cliente), un tipo de
descuento (porcentaje o monto fijo en pesos), un límite de usos opcional,
y a qué aplica:
- **Todo el pedido**
- **Una sola categoría** (ej. solo remeras)
- **Productos específicos** que elijas a mano de una lista

El sistema evita que un cupón se use más veces de las permitidas incluso
si dos personas lo usan casi al mismo tiempo (la resta de usos disponibles
queda protegida en el propio servidor de Firestore, no depende de que el
navegador del cliente "se porte bien"). Podés pausar un cupón sin
borrarlo, o borrarlo directamente, desde la misma pestaña.

## Gift Cards

Son **saldo con código**, no un uso único: la persona la carga en el
checkout y lo que gastó se descuenta; lo que queda sigueServindo para
próximos pedidos. El código tiene el formato `SKUL-XXXXXX` (6 letras o
dígitos) y **vence a los 6 meses** de crearse.

Se crean de dos maneras:

- **A mano**, desde `/admin` → pestaña **Gift Cards**: ponés el monto (en
  múltiplos de $5.000, entre $5.000 y $100.000) y se genera el código.
  La tabla muestra saldo, usado, cuánto queda y cuándo vence.
- **Vendidas en el sitio**, desde la página **Gift Cards**
  (`/giftcards`, también en el menú): el comprador elige el monto y paga
  con el checkout de siempre; el código se lo muestra en la pantalla de
  "gracias" (y queda en el pedido, en `/admin` y en el seguimiento).

En el checkout hay un casillero "¿Tenés una gift card?" abajo del cupón.

El orden de los descuentos lo impone el **servidor**, no el navegador:
primero el cupón, después la gift card sobre lo que queda, y el envío
nunca lo cubre la gift card. Igual que con el stock y los cupones, el
saldo se descuenta dentro del **mismo commit atómico que crea el pedido**
(Worker + `documents:commit`), con un `precondition` sobre el documento:
si dos personas gastan de la misma gift card al mismo tiempo, una de las
dos Transactions falla y se le avisa para que reintente. El navegador no
manda ningún monto: manda el código y el Worker lee el saldo real.

Para que funcione hay que subir dos cosas:

```bash
# 1) las reglas nuevas de /giftCards (sino el checkout no puede leer el código)
firebase deploy --only firestore:rules

# 2) el Worker (validación + descuento del saldo)
cd cloudflare-worker && npx wrangler deploy
```

## Conectar el pago con tarjeta (Mercado Pago)

Ahora mismo, cuando alguien elige "Débito" o "Crédito" en el checkout, el
pedido se registra pero no se cobra de verdad — es un paso simulado (fíjate
la nota que aparece en el checkout y en `GraciasTarjeta.jsx`). Para cobrar de
verdad con tarjeta, la opción más simple para Argentina es **Mercado Pago
Checkout Pro**:

1. Creá una cuenta de Mercado Pago (o usá la que ya tenés) y entrá a
   https://www.mercadopago.com.ar/developers/panel para obtener tus
   credenciales (Access Token y Public Key).
2. Mercado Pago necesita que un servidor (no el navegador del cliente) genere
   una "preferencia de pago" antes de mostrar el botón de pago, porque ahí es
   donde va tu Access Token secreto — nunca debe ir en el código del sitio
   que ve todo el mundo. Para eso hace falta un backend chiquito. Con este
   mismo proyecto en Vercel, lo más simple es una "Serverless Function":
   creás un archivo `api/crear-preferencia.js` que reciba el carrito, llame
   a la API de Mercado Pago con tu Access Token, y devuelva la URL de pago.
   El botón "Confirmar pedido" del checkout, para crédito/débito, llamaría a
   esa función en vez de ir directo a la pantalla de "gracias".
3. Documentación oficial paso a paso:
   https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/landing

Si querés, en otra vuelta puedo dejarte armada esa función serverless con
Mercado Pago ya conectada — es un cambio acotado una vez que el sitio esté
desplegado en Vercel o Netlify (lo necesita para poder correr esa función).

## Edición rápida de datos del negocio

Todo lo que cambia seguido (WhatsApp, Instagram, mail, CVU/alias, zonas y
precios de envío, categorías, talles posibles) está en un solo lugar:
`src/data/config.js`. Es un archivo de texto simple, cada línea tiene un
comentario `// EDITAR ACÁ` al lado de lo que probablemente quieras cambiar.

Los **productos** (nombre, precio, fotos, talles, descripción, etc.) NO se
editan en este archivo — se cargan desde `/admin`, pestaña "Productos", como
se explica más arriba.
