/* ============================================================
   PRODUCTOS SEMILLA
   ------------------------------------------------------------
   Esto ya NO es la fuente de verdad del catálogo: es solo la
   data inicial para cargar una vez en Firestore (ver
   scripts/seed-products.mjs) y el respaldo que se ve mientras
   Firebase no está configurado o no responde.

   "Semilla" (seed) = datos de arranque: datos de ejemplo que se cargan una
   única vez para no tener que crear el catálogo a mano, y que después quedan
   desactualizados. Un seed no se mantiene: apenas los productos reales estén
   cargados en Firestore, se edita desde /admin y esta lista pasa a ser solo el
   plan B de desarrollo.

   tone  = brillo de la textura (0.5 a 1), reemplaza colores sólidos.
   sizes = talles disponibles. Las categorías de abajo usan solo
           talles que existen hoy en /src/data/config.js.
   stock = unidades por talle. Si un talle queda en 0, se muestra
           tachado y no se puede comprar.
   ============================================================ */

// Los dos juegos de talles que usan los productos de abajo. Coinciden con
// SIZES y SIZES_NUMERIC de config.js (los números arrancan en 38 y llegan a 46:
// el 48 existe en config pero ningún producto semilla lo usa todavía).
const LETTERS = ["S", "M", "L", "XL"];
const NUMBERS = ["38", "40", "42", "44", "46"];

/** Arma un stock con las primeras cantidades de la lista y algún
 *  talle agotado, para que el catálogo de ejemplo se vea real.
 *
 *  Para qué existe: escribir el stock a mano para cada producto sería un
 *  garrón. Recibo los talles y una lista de cantidades en el MISMO orden, y
 *  si a un talle no le toca cantidad (porque la lista es más corta) le pongo
 *  2, que es un número verosímil. */
function stockFor(sizes, quantities) {
  // Objeto talle -> unidades. Lo lee la ficha de producto para tachar los
  // talles sin stock y para no dejar agregar al carrito un talle en cero.
  const out = {};
  sizes.forEach((s, i) => { out[s] = quantities[i] ?? 2; });
  return out;
}

/** Los productos semilla "crudos": lo mínimo que necesita Firestore para
 *  guardar un producto. Sin esto todavía no hay colores ni calce, que se le
 *  pegan más abajo. */
const RAW = [
  // — Prendas con talle de letra (remeras, sweaters, hoodies). El `tag` es el
  //   texto chico de la etiqueta del producto ("SS26 / 01" = temporada; los
  //   N.00x son los del drop No-Restock). `active` es el interruptor de
  //   "visible en la tienda" — apagarlo lo esconde del catálogo sin borrarlo
  //   de la base, y por eso el panel lo tiene que seguir listando.
  //   OJO: las chaquetas (WORKWEAR JACKET, FIELD JACKET) caen en "hoodies"
  //   porque todavía no hay una categoría de chaquetas en CATS.
  { name: "HOODIE CONCRETE", cat: "hoodies", price: 42000, tag: "SS26 / 01", tone: 0.62, sizes: LETTERS, stock: stockFor(LETTERS, [3, 4, 2, 1]), nrs: false, active: true },
  { name: "HOODIE RIOT WASH", cat: "hoodies", price: 45000, tag: "SS26 / 02", tone: 0.7, sizes: LETTERS, stock: stockFor(LETTERS, [2, 3, 3, 2]), nrs: false, active: true },
  { name: "SWEATER LOW-KEY", cat: "sweaters", price: 38000, tag: "SS26 / 03", tone: 0.8, sizes: LETTERS, stock: stockFor(LETTERS, [4, 4, 1, 0]), nrs: false, active: true },
  { name: "SWEATER GHOST", cat: "sweaters", price: 39000, tag: "SS26 / 04", tone: 0.92, sizes: LETTERS, stock: stockFor(LETTERS, [2, 2, 2, 2]), nrs: false, active: true },
  { name: "TEE STAMP", cat: "tees", price: 21000, tag: "SS26 / 05", tone: 0.58, sizes: LETTERS, stock: stockFor(LETTERS, [5, 6, 4, 3]), nrs: false, active: true },
  { name: "TEE BLANK CO.", cat: "tees", price: 19000, tag: "SS26 / 06", tone: 0.95, sizes: LETTERS, stock: stockFor(LETTERS, [6, 5, 3, 2]), nrs: false, active: true },
  { name: "WORKWEAR JACKET", cat: "hoodies", price: 56000, tag: "SS26 / 07", tone: 0.66, sizes: LETTERS, stock: stockFor(LETTERS, [1, 2, 2, 1]), nrs: false, active: true },
  { name: "UTILITY VEST", cat: "accesorios", price: 34000, tag: "SS26 / 08", tone: 0.76, sizes: ["UNICO"], stock: { UNICO: 4 }, nrs: false, active: true },
  { name: "HOODIE ZIP ARCHIVE", cat: "hoodies", price: 48000, tag: "SS26 / 09", tone: 0.6, sizes: LETTERS, stock: stockFor(LETTERS, [2, 3, 1, 0]), nrs: false, active: true },
  { name: "TEE BOX LOGO", cat: "tees", price: 22000, tag: "SS26 / 10", tone: 0.9, sizes: LETTERS, stock: stockFor(LETTERS, [4, 4, 3, 1]), nrs: false, active: true },
  // — Prendas con talle de número (lo que se vende con talles de cintura).
  { name: "CARGO JOGGING", cat: "joggings", price: 49000, tag: "SS26 / 11", tone: 0.64, sizes: NUMBERS, stock: stockFor(NUMBERS, [1, 2, 3, 2, 1]), nrs: false, active: true },
  { name: "STRAIGHT DENIM", cat: "denim", price: 52000, tag: "SS26 / 12", tone: 0.85, sizes: NUMBERS, stock: stockFor(NUMBERS, [2, 2, 1, 0, 1]), nrs: false, active: true },
  { name: "BERMUDA RIPSTOP", cat: "bermudas", price: 33000, tag: "SS26 / 13", tone: 0.72, sizes: NUMBERS, stock: stockFor(NUMBERS, [3, 3, 2, 1, 0]), nrs: false, active: true },
  // — Drop No-Restock (nrs: true). Con este flag el producto desaparece del
  //   catálogo común (StoreApp filtra por `!p.nrs`) y va a su propia pantalla
  //   oscura /noreastock, donde se lo muestra como "BLOQUEADO"/"EXCLUSIVE".
  { name: "GHOST HOODIE", cat: "hoodies", price: 65000, tag: "N.001", tone: 0.55, sizes: LETTERS, stock: stockFor(LETTERS, [2, 2, 1, 1]), nrs: true, active: true },
  { name: "RAW TEE", cat: "tees", price: 30000, tag: "N.002", tone: 0.68, sizes: LETTERS, stock: stockFor(LETTERS, [3, 2, 2, 0]), nrs: true, active: true },
  { name: "FIELD JACKET", cat: "hoodies", price: 78000, tag: "N.003", tone: 0.6, sizes: LETTERS, stock: stockFor(LETTERS, [1, 1, 2, 1]), nrs: true, active: true },
];

/* Colores por prenda (los círculos de "Seleccionar color" en la ficha) y
   calce (0 = slim, 1 = baggy) para la barrita de "FIT".

   OJO con cómo se enganchan: COLORS y FIT están indexados por el NOMBRE del
   producto, no por id. Si en RAW cambiás o agregás un nombre sin su entrada acá
   abajo, el producto igual se crea pero sin colores y con calce 0.5 (el valor
   por defecto de abajo). Cada par es [nombre del color, hex]. */
const COLORS = {
  "HOODIE CONCRETE": [["CONCRETE", "#b9b6ae"], ["BLACK", "#16161a"]],
  "HOODIE RIOT WASH": [["WASH GREY", "#8d8b86"], ["CREAM", "#efece2"]],
  "SWEATER LOW-KEY": [["CREAM", "#efece2"], ["SWAMP", "#4a5340"]],
  "SWEATER GHOST": [["OFF WHITE", "#f4f2ec"]],
  "TEE STAMP": [["MINT GREEN", "#b6cdb0"], ["DARK BROWN", "#3b2a22"]],
  "TEE BLANK CO.": [["WHITE", "#f6f5f2"], ["BLACK", "#16161a"]],
  "WORKWEAR JACKET": [["CARGO", "#6f6a5c"]],
  "UTILITY VEST": [["BLACK", "#16161a"]],
  "HOODIE ZIP ARCHIVE": [["NOIR", "#141414"], ["GALAXY BLUE", "#2b3a5c"]],
  "TEE BOX LOGO": [["WASH BLACK", "#26262a"], ["GREY", "#8f8d89"]],
  "CARGO JOGGING": [["OLIVE", "#5b5f47"]],
  "STRAIGHT DENIM": [["RAW INDIGO", "#3d4a63"], ["WASH BLACK", "#26262a"]],
  "BERMUDA RIPSTOP": [["BLACK", "#16161a"]],
  "GHOST HOODIE": [["BLACK", "#141414"]],
  "RAW TEE": [["RAW", "#d8cdbb"]],
  "FIELD JACKET": [["FIELD", "#5c5a48"]],
};

// Calce de cada prenda: 0 = lo más slim, 1 = lo más baggy. Solo mueve la
// barrita FIT de la ficha (ProductPage la lleva a porcentaje).
const FIT = {
  "HOODIE CONCRETE": 0.62, "HOODIE RIOT WASH": 0.7, "SWEATER LOW-KEY": 0.5,
  "SWEATER GHOST": 0.5, "TEE STAMP": 0.44, "TEE BLANK CO.": 0.42,
  "WORKWEAR JACKET": 0.58, "UTILITY VEST": 0.5, "HOODIE ZIP ARCHIVE": 0.66,
  "TEE BOX LOGO": 0.46, "CARGO JOGGING": 0.74, "STRAIGHT DENIM": 0.56,
  "BERMUDA RIPSTOP": 0.78, "GHOST HOODIE": 0.68, "RAW TEE": 0.4, "FIELD JACKET": 0.6,
};

/**
 * Los 16 productos semilla listos para cargar: los de RAW más `colors` y `fit`.
 *
 * Qué exporta: SEED_PRODUCTS, que es lo único que importa de este archivo. Lo
 * usan dos cosas: scripts/seed-products.mjs (npm run seed:products, lo sube a
 * Firestore una vez) y useProducts.js como catálogo de repuesto SOLO en
 * desarrollo, cuando Firestore no responde.
 *
 * OJO: no lleva campo `id`. Cuando el seed se usa como fallback, useProducts le
 * pone ids inventados ("seed-0", "seed-1"...); cargado en Firestore, cada
 * documento recibe su propio id.
 */
export const SEED_PRODUCTS = RAW.map((p) => ({
  // Me quedo con todo lo de RAW y le agrego lo que faltaba.
  ...p,
  // Los pares [nombre, hex] del mapa de arriba, convertidos al formato que
  // espera la ficha ({ name, hex }). Si el producto no está en COLORS, queda
  // con la lista vacía y la ficha esconde el selector de color.
  colors: (COLORS[p.name] || []).map(([name, hex]) => ({ name, hex })),
  // Mismo criterio para el calce: sin entrada en FIT, 0.5 (neutro).
  fit: FIT[p.name] ?? 0.5,
}));
