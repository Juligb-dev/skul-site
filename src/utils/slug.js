/**
 * ============================================================
 *  SLUGS DE PRODUCTO
 * ------------------------------------------------------------
 *  Qué es un slug: la versión de un nombre que se puede usar dentro
 *  de una URL. Sin espacios, sin tildes, en minúsculas y con guiones
 *  en lugar de los espacios.
 *      "HOODIE CONCRETE"  ->  "hoodie-concrete"
 *
 *  Por qué importa: el slug es lo que la gente ve en el link, lo que
 *  Google lee para saber de qué trata la página y lo que puede
 *  escribir de memoria en la barra de direcciones. Un id de Firestore
 *  ("Xy7Kq2NpV") no le dice nada a nadie.
 *
 *  El slug se guarda en el documento del producto (campo `slug`) y
 *  es el que usa /producto/<slug> (ver src/utils/routes.js).
 *
 *  Qué exporta: `slugify` y `uniqueSlug`.
 *  Quién lo usa: src/admin/AdminPanel.jsx, al guardar un producto
 *  nuevo o editado. No necesita nada configurado afuera.
 * ============================================================
 */

/** Convierte un nombre de producto en un slug legible para la URL.
 *  "HOODIE CONCRETE" -> "hoodie-concrete"
 *  "Tee Básica (2025)" -> "tee-basica-2025"
 *
 *  Va paso a paso con regex, y el orden importa:
 *  1. normalize("NFD") descompone cada letra acentuada en dos
 *         caracteres: "á" queda como "a" + un acento combinante.
 *  2. el regex saca justamente esos acentos combinantes (los que
 *         están entre U+0300 y U+036F). Ese es el truco clásico para
 *         sacar tildes sin romper la ñ: la ñ no se descompone, así
 *         que sobrevive y después queda "n".
 *  3. minúsculas: las URLs se leen feas si mezclan mayúsculas.
 *  4. todo lo que no sea [a-z0-9] se reemplaza por un guion. OJO:
 *         el + es lo que hace que "Tee  Básica" (dos espacios)
 *         produzca UN solo guion y no dos.
 *  5. el /^-+|-+$/ saca los guiones de los bordes, que quedan
 *         cuando el nombre arranca o termina con símbolos: "(2025)"
 *         al final no debe dejar la URL en "tee-basica-".
 *  6. el slice de 60 caracteres es un tope de seguridad para no
 *         generar URLs de 300 letras.
 *
 *  Nota: los paréntesis y el "&" también caen en el paso 4, por eso
 *  "Tee Básica (2025)" queda "tee-basica-2025" y no con parentesis.
 *
 *  Devuelve "" si no hay nada usable, y de eso se ocupa uniqueSlug. */
export function slugify(text) {
  return (text || "")
    .toString()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // saca tildes: á -> a
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** A partir de un nombre, arma un slug que no choque con los que ya
 *  existen (si "hoodie-concrete" ya está usado por OTRO producto,
 *  prueba "hoodie-concrete-2", "hoodie-concrete-3", etc).
 *
 *  Por qué hace falta: el slug tiene que ser único, porque es la
 *  dirección pública del producto. Si dos productos terminaran en el
 *  mismo, uno deja de ser enlazable y Google muestra el que le parezca.
 *
 *  `existingSlugs` es el array de slugs YA TOMADOS. Quien lo llama
 *  tiene que excluir el del producto que se está editando, si no,
 *  al guardar un producto sin cambiarle el nombre le agrega "-2"
 *  innecesariamente. */
export function uniqueSlug(name, existingSlugs) {
  // Fallback para un nombre que no deja nada usable (por ejemplo que
  // sea solo "&"): mejor "producto" que una URL con la barra y nada más.
  const base = slugify(name) || "producto";
  // Un Set porque adentro pregunto varias veces si un slug ya está:
  // en un array sería buscar linealmente cada vez.
  const taken = new Set(existingSlugs.filter(Boolean));
  // Caso normal: está libre, se usa tal cual.
  if (!taken.has(base)) return base;
  // Choca: pruebo con sufijos numéricos desde el 2 (el -1 no se usa
  // por costumbre, se lee "-2" como versión y "-1" como original).
  let i = 2;
  // Con products chicos el while termina enseguida; con muchos
  // productos es una búsqueda corta porque el Set responde en O(1).
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
