# SKUL —

Este es el repositorio completo del sitio de **SKUL**, una e-commerce desarrollada con React, Vite y Firebase. Diseñé y estructuré toda la experiencia visual y funcional con una estética oscura, pensada tanto para la venta de catálogo regular como para lanzamientos de drops exclusivos sin reposición (*No-Restock*), productos en liquidación (*Outlet*) y eventos con cuenta regresiva.

El proyecto está preparado para que cualquiera pueda tomar la estructura, adaptar la configuración general con sus propios datos y desplegar una tienda funcional en poco tiempo.(si alguien ve esto espero le sirva:])

---

## Arquitectura y tecnologías utilizadas

- **Frontend:** React 18 con Vite como empaquetador y servidor de desarrollo.
- **Estilos:** CSS3 nativo mediante un sistema de variables globales (`src/styles/storefront.css` y `global.css`), layouts responsivos con Flexbox/Grid, sombras compuestas y efectos de desenfoque (*glassmorphism*).
- **Base de datos y backend serverless:** Firestore Database para la persistencia del catálogo, cupones, tarjetas de regalo y compras.
- **Autenticación:** Firebase Authentication (Email y contraseña) para el control de acceso exclusivo al panel de administración.
- **Optimizaciones:** Compresión automática de imágenes cargadas en el cliente para reducir el peso de las lecturas en Firestore y soporte de animaciones adaptadas a la preferencia del usuario (`prefers-reduced-motion`).

---

## Funcionalidades y módulos detallados

### Experiencia visual y navegación en el Home
- **Efecto de placas en scroll:** Las secciones principales (*Destacados*, *No-Restock* y *Shop the Look*) se fijan en la pantalla mientras que la siguiente sección sube por encima con bordes redondeados y sombras.
- **Módulo No-Restock (Drops exclusivos):** En la portada, las prendas pertenecientes a un drop cerrado se presentan oscurecidas y borrosas con el cartel de "BLOQUEADO" y el recuento de piezas disponibles. Al ingresar a la sección o a la ficha de un producto de esta línea, toda la interfaz (cabecera, fondo y paneles) conmuta automáticamente a una paleta oscura.
- **Sección Novedades:** Implementada como una tira horizontal que se puede desplazar manualmente (mediante arrastre táctil, rueda del mouse o flechas) o de forma automática según el scroll. En pantallas móviles se transforma en un "carrusel" liviano.
- **Sección de Categorías (CategoryStory):** Presentación editorial fijada a pantalla completa donde la imagen de fondo cambia según la categoría sobre la que se desplace el usuario.

### Ficha de producto y carrito de compras
- **Layout responsivo:** Foto principal con miniatura lateral en escritorio, convertible en una pastilla vidriada inferior en dispositivos móviles.
- **Variantes y stock real:** Selección de talles conectada directamente al stock en tiempo real por talle. Si una variante no tiene unidades disponibles, se deshabilita; si un producto agota todo su inventario, se marca como "SIN STOCK" en las grillas.
- **Selector de colores y barrita de calce:** Lectura de colores dinámicos mediante códigos hexadecimales y escala gráfica para indicar el tipo de calce (*Fit*: de 0 = Slim a 1 = Baggy).
- **Carrito lateral (CartDrawer):** Módulo flotante integrado que calcula subtotales, valida el tope de unidades disponibles por talle, aplica descuentos por método de pago (ej. 10% por transferencia) y procesa cupones y gift cards.
- **Botón de compra persistente:** En celulares, al hacer scroll dentro de un producto, la barra de compra se mantiene fija en el margen inferior.

### Panel de administración completo (`/admin`)
Acceso protegido por credenciales de Firebase Auth que permite gestionar la tienda sin necesidad de modificar el código fuente:
- **Pestaña Estado del sitio:** Permite abrir o cerrar la tienda de forma global, establecer mensajes de mantenimiento, habilitar o deshabilitar la vista de Outlet, programar el nombre y la fecha/hora para la cuenta regresiva del próximo lanzamiento (*Drop Countdown*) y actualizar las imágenes del hero, categorías y *Shop the Look*.
- **Pestaña Productos:** Creación, edición y ocultamiento de productos. Permite asociar categorías, precios, precios con rebaja para Outlet, peso, tonos de textura de respaldo, descripción, composición, guía de medidas, fotos, stock individual por talle, etiquetas de color y calce.
- **Pestaña Cupones:** Generación de códigos promocionales por porcentaje o por monto fijo. Soporta límites de uso totales y restricciones de aplicación (a todo el pedido, a una categoría o a prendas seleccionadas a mano).
- **Pestaña Gift Cards:** Emisión de tarjetas de regalo con código alfanumérico único (`SKUL-XXXXXX`), seguimiento del saldo consumido y remanente, y fecha de vencimiento a 6 meses.

---

## Estructura detallada de archivos

```text
src/
├── main.jsx                 # Punto de entrada de la aplicación
├── App.jsx                  # Enrutador principal que conmuta entre tienda y panel de admin
├── StoreApp.jsx             # Contenedor del estado global (carrito, cupones, gift cards, navegabilidad)
├── firebase.js              # Inicialización y exportación de la configuración de Firebase
├── data/
│   ├── config.js            # Parámetros del negocio (CBU, redes, WhatsApp, envíos, categorías)
│   └── seedProducts.js      # Datos iniciales de respaldo para pruebas de catálogo
├── utils/
│   └── format.js            # Funciones de utilidad para formateo de moneda y separadores
├── hooks/
│   ├── useAdminAuth.js      # Manejo de la sesión del administrador
│   ├── useCoupons.js        # Gestión, validación y consumo de cupones
│   ├── useProducts.js       # Sincronización en vivo con la colección de productos en Firestore
│   ├── useReveal.js         # Observer para animaciones al hacer scroll
│   └── useSiteStatus.js     # Lectura del estado global del sitio (abierto/cerrado/countdown)
├── components/
│   ├── Header.jsx           # Navegación superior con menú adaptativo e integración de barra
│   ├── Footer.jsx           # Pie de página con accesos, datos legales y tipografía de marca
│   ├── CartDrawer.jsx       # Carrito de compras lateral con lógica de subtotales
│   ├── CategoryStory.jsx    # Componente de despliegue interactivo para las categorías
│   ├── ProductGrid.jsx      # Grilla responsiva de tarjetas de producto
│   ├── Fabric.jsx           # Generador de textura cuando el producto no posee imágenes
│   └── DropCountdown.jsx    # Reloj de cuenta regresiva para el próximo lanzamiento
├── pages/
│   ├── Home.jsx             # Portada de la tienda con estructura de placas
│   ├── Catalog.jsx          # Vista del catálogo completo con filtros por categoría
│   ├── NoReastock.jsx       # Sección dedicada a lanzamientos exclusivos
│   ├── Outlet.jsx           # Vista de productos en liquidación
│   ├── ProductPage.jsx      # Detalle de producto con selectores y acordeones informativos
│   ├── Checkout.jsx         # Formulario de datos de envío, selección de pago y descuentos
│   └── Thanks.jsx           # Pantalla de confirmación de compra y resumen de pedido
└── admin/
    ├── SiteGate.jsx         # Bloqueo global cuando la tienda está en mantenimiento
    ├── ClosedScreen.jsx     # Pantalla pública visible cuando la tienda está cerrada
    ├── AdminLogin.jsx       # Formulario de acceso al panel
    ├── AdminApp.jsx         # Selector entre login y panel según el estado de la sesión
    └── AdminPanel.jsx       # Interfaz de gestión dividida en pestañas
