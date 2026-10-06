/**
 * ============================================================
 *  FORMATO DE PRECIOS
 * ------------------------------------------------------------
 *  Un archivo de una línea para una regla que se repite en veinte
 *  lugares: cómo se ve un número de pesos en pantalla.
 *
 *  La idea es que en TODO el sitio un precio se muestre igual. Si
 *  cada pantalla formatea a su manera, el cliente ve $1200 en el
 *  carrito y $1.200,50 en el resumen y piensa que le cambiaron el
 *  total.
 *
 *  Por qué no usé Intl.NumberFormat con style "currency": funciona
 *  bien, pero deja que el runtime decida el símbolo y los decimales
 *  según el sistema. Para esta tienda, donde todos los precios son
 *  pesos enteros, alcanza con el signo adelante y nada más.
 *
 *  Qué exporta: `fmt`. Quién lo usa: casi todas las páginas y
 *  componentes (AdminPanel, ProductGrid, Checkout, GiftCards...).
 *  No necesita ninguna variable de entorno.
 * ============================================================
 */

/** Convierte un número en un precio listo para mostrar.
 *
 *  - El "es-AR" es el locale (el dialecto de formato): decide dónde
 *    va el separador de miles y el de decimales. Sin esto, un
 *    usuario de Argentina vería "12,000" en vez de "12.000".
 *  - El `Number.isFinite` es el escudo contra valores que no son
 *    números: cuando algo viene undefined, null o un objeto vacío
 *    desde Firestore, muestra "$0" en vez de "$NaN" o romper el
 *    render. Ojo: el `|| 0` solo no alcanzaba, porque `Number({})`
 *    es NaN y un objeto vacío es "truthy" para `||`.
 *  - Number() por las dudas: algunos totales llegan como texto
 *    (vienen de Cloudinary/Worker o de un campo editable del admin). */
export const fmt = (n) => {
  const num = Number(n);
  return "$" + (Number.isFinite(num) ? num : 0).toLocaleString("es-AR");
};
