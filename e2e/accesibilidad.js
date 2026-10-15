import AxeBuilder from "@axe-core/playwright";

/**
 * ACCESIBILIDAD — helpers compartidos por las pruebas E2E.
 *
 * Qué problema resuelve: Axe devuelve TODAS las violaciones que encuentra,
 * con cuatro niveles de impacto (`critical`, `serious`, `moderate`,
 * `minor`). Si el test fallara por cualquiera, quedaría rojo para siempre
 * por detalles cosméticos y nadie lo miraría. Acá solo nos importan las
 * dos graves —las que dejan a alguien afuera de la compra— y el resto se
 * sigue mirando a mano cuando se quiera.
 *
 * A qué parte del sistema pertenece: es una herramienta de prueba, no
 * código de la tienda. No la importa ningún componente.
 */

/** Los impactos que consideramos un problema de verdad. */
export const IMPACTOS_GRAVES = ["critical", "serious"];

/**
 * Lo que Axe mira de más y nosotros no: decoración pura.
 *
 * `.skul-watermark` es el "SKUL" gigante de fondo (18vw, al 5% de opacidad)
 * que el propio componente marca `aria-hidden="true"` porque es textura,
 * no información. Axe no puede saber eso y lo mide como texto —da 1.09:1—
 * pero WCAG 1.4.3 exime explícitamente al texto que es "pura decoración".
 * Subirle el contraste al 3:1 lo haría diez veces más visible y rompería
 * el diseño, así que lo dejamos afuera de la auditoría a propósito. Es la
 * ÚNICA exclusión: si aparece otra, va con su motivo escrito acá al lado.
 */
export const DECORATIVO = [".skul-watermark"];

/**
 * Corre Axe sobre la página (o sobre una parte, si se le pasa un selector)
 * y devuelve la lista cruda de violaciones.
 */
export async function auditar(page, opciones = {}) {
  let builder = new AxeBuilder({ page });
  if (opciones.include) builder = builder.include(opciones.include);
  for (const sel of [...DECORATIVO, ...(opciones.exclude ? [opciones.exclude] : [])]) {
    builder = builder.exclude(sel);
  }
  const { violations } = await builder.analyze();
  return violations;
}

/**
 * Baja la página de a poco y vuelve arriba, para que se disparen todas las
 * apariciones por scroll (los `.reveal` del catálogo, por ejemplo).
 *
 * Por qué hace falta: esas secciones entran con una transición de opacidad
 * que arranca recién cuando el navegador las ve. Si no se recorren, quedan
 * en opacidad 0 y Axe mide los precios a media transición: el catálogo daba
 * contrastes de 2.8:1 que no existen cuando la tarjeta terminó de entrar.
 * Recorrer primero y esperar después hace que la foto sea la de la página
 * ya asentada, que es la que ve quien lee.
 */
export async function recorrerLaPagina(page) {
  await page.evaluate(async () => {
    const paso = 500;
    const alto = () => document.documentElement.scrollHeight;
    for (let y = 0; y < alto(); y += paso) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(600);
}

/** Filtra las violaciones y deja solo las graves (critical/serious). */
export function graves(violations) {
  return violations.filter((v) => IMPACTOS_GRAVES.includes(v.impact || ""));
}

/**
 * Espera a que la página esté "quieta" para medir: cortina de intro fuera
 * y animaciones de entrada terminadas.
 *
 * Por qué hace falta (fue un falso positivo, no un bug de verdad): los
 * cortinillas y las secciones entran con animaciones de opacidad. Si Axe
 * mide a media máquina, el texto queda translúcido y el contraste sale
 * multiplicado por la opacidad: el botón blanco del hero dio 3.34:1
 * durante la animación y 4.5:1+ cuando termina. Medir "en movimiento"
 * no dice nada útil sobre lo que el visitante ve leyendo la página.
 *
 * Cómo lo resuelve: espera a que se desmonte la cortina (si apareció) y a
 * que termine toda animación FINITA. Las infinitas (los marquees de anuncio)
 * se ignoran a propósito: si las esperáramos, el test se colgaría para
 * siempre.
 */
export async function esperarListoParaAuditar(page) {
  // La cortina: solo existe en la primera visita de cada pestaña.
  await page
    .locator(".intro-curtain")
    .waitFor({ state: "detached", timeout: 15_000 })
    .catch(() => {});

  await page.evaluate(async () => {
    const finitas = (window.document.getAnimations() || []).filter((a) => {
      try {
        return a.effect && a.effect.getComputedTiming().iterations !== Infinity;
      } catch {
        return false;
      }
    });
    // Con tope de tiempo por las dudas (una animación pausada, etc.).
    await Promise.race([
      Promise.all(finitas.map((a) => a.finished.catch(() => {}))),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
  });
}

/**
 * Arma un mensaje legible para el `expect`. Sin esto, un fallo de Axe
 * imprime un objeto gigante y no se entiende qué elemento está mal: acá
 * sale una línea por violación con el id, la explicación y los selectores
 * de los nodos que la disparan.
 */
export function resumen(violations) {
  if (violations.length === 0) return "Sin violaciones graves de accesibilidad.";
  return violations
    .map((v) => {
      const nodos = v.nodes.map((n) => `      - ${n.target.join(" ")}`).join("\n");
      return `  • [${v.impact}] ${v.id} — ${v.help}\n${nodos}`;
    })
    .join("\n");
}
