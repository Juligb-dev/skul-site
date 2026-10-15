import { test, expect } from "@playwright/test";
import { auditar, graves, resumen, esperarListoParaAuditar, recorrerLaPagina } from "./accesibilidad.js";

/**
 * TIENDA PÚBLICA — pruebas de humo (E2E).
 *
 * Qué problema resuelven: son la última red. Si un cambio rompe el arranque
 * del sitio (un import que no existe, un error en tiempo de ejecución), las
 * pruebas de jsdom pueden seguir pasando y la tienda quedaría en blanco
 * para los clientes. Estas abren un Chromium de verdad contra el build de
 * producción y verifican que la página arranca y que es accesible.
 *
 * Regla de oro: son de SOLO LECTURA. Ninguna prueba acá aprieta
 * "confirmar compra" ni manda un formulario. Usan el catálogo y el estado
 * REALES de Firestore (la misma base que usa la tienda), así que un test
 * nunca puede ensuciar pedidos ni mandar mensajes.
 *
 * OJO: como leen la tienda real, tienen que funcionar tanto si la tienda
 * está abierta como si está cerrada. Las dos pantallas muestran el logo
 * SKUL, así que ese es el ancla para saber que la app arrancó.
 */

/** El aviso de espera de SiteGate (mientras Firestore todavía no respondió). */
const CARGANDO = "Cargando…";

/** Espera a que la app termine de decidir: tienda abierta o pantalla de cierre. */
async function esperarQueArranque(page) {
  await expect(page.getByText(CARGANDO)).toBeHidden({ timeout: 20_000 });
}

test.describe("Tienda pública — humo", () => {
  test("la home carga en un navegador real y no tira errores de JS", async ({ page }) => {
    // Juntamos los errores sin capturar de la página. Si el bundle se rompe,
    // acá es donde aparece en vez de un "no sé qué pasó".
    const errores = [];
    page.on("pageerror", (e) => errores.push(`${e.name}: ${e.message}`));

    const respuesta = await page.goto("/");
    expect(respuesta?.status(), "la home debería responder 200").toBe(200);

    await esperarQueArranque(page);
    // El logo está en las tres pantallas posibles (cargando, tienda,
    // cerrada), así que sirve para saber que algo se dibujó.
    await expect(page.getByText("SKUL", { exact: true }).first()).toBeVisible();

    expect(errores, `Errores de JS sin capturar:\n${errores.join("\n")}`).toEqual([]);
  });

  test("la home no tiene violaciones graves de accesibilidad", async ({ page }) => {
    await page.goto("/");
    await esperarQueArranque(page);

    // Sin esto, Axe puede medir el contraste con la tipografía de reemplazo
    // y marcar un falso positivo que se va solo cuando carga la fuente real.
    await page.evaluate(() => document.fonts.ready);
    // Bajamos la página entera y volvemos: así entran las secciones que
    // aparecen al scrollear (y el footer) y se miden ya asentadas.
    await recorrerLaPagina(page);
    // Y sin esto, mediría a media máquina las animaciones de entrada
    // (ver esperarListoParaAuditar).
    await esperarListoParaAuditar(page);

    const violaciones = graves(await auditar(page));
    expect(violaciones, `Accesibilidad (home):\n${resumen(violaciones)}`).toEqual([]);
  });
});
