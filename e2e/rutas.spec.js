import { test, expect } from "@playwright/test";
import { auditar, graves, resumen, esperarListoParaAuditar, recorrerLaPagina } from "./accesibilidad.js";

/**
 * TIENDA PÚBLICA — accesibilidad de las rutas de contenido (E2E).
 *
 * Qué problema resuelve: la home es la vidriera, pero el visitante también
 * navega el catálogo, las gift cards o la guía de talles. Un color heredado
 * del tema oscuro en una de esas páginas deja texto casi invisible, y eso
 * no lo ve ninguna prueba de jsdom porque no hay CSS ni layout.
 *
 * Por qué una lista de rutas y no "todas": cada caso acá es una página
 * distinta que se audita entera. Se eligen las de contenido estable (no
 * dependen de datos que el admin cambie: por eso no hay /catalogo/<algo>
 * ni una ficha de producto puntual, que dejarían el test rojo el día que
 * se renombre una categoría).
 *
 * Regla de oro, igual que el resto de `e2e/`: SOLO LECTURA. Visita y mide;
 * no toca el carrito ni manda ningún formulario.
 *
 * Si la tienda está cerrada, todas estas rutas muestran la pantalla de
 * cierre: el test sigue valiendo (audita esa pantalla) y no falla.
 */

const CARGANDO = "Cargando…";

const RUTAS = [
  ["catálogo", "/catalogo"],
  ["no-restock", "/no-restock"],
  ["outlet", "/outlet"],
  ["gift cards", "/giftcards"],
  ["guía de talles", "/guia-de-talles"],
  ["nosotros", "/nosotros"],
  ["contacto", "/contacto"],
  ["política de privacidad", "/politica-de-privacidad"],
];

for (const [nombre, ruta] of RUTAS) {
  test(`accesibilidad: ${nombre} (${ruta})`, async ({ page }) => {
    await page.goto(ruta);

    // La app resuelve en el cliente: puede dibujar la tienda o la pantalla
    // de cierre. En los dos casos, el aviso de espera se va.
    await expect(page.getByText(CARGANDO)).toBeHidden({ timeout: 20_000 });

    // Medir con la fuente real evita falsos positivos de contraste.
    await page.evaluate(() => document.fonts.ready);
    // Recorrer primero (dispara las apariciones por scroll) y esperar
    // después (cortina fuera y animaciones terminadas): el porqué está en
    // accesibilidad.js.
    await recorrerLaPagina(page);
    await esperarListoParaAuditar(page);

    const violaciones = graves(await auditar(page));
    expect(violaciones, `Accesibilidad (${ruta}):\n${resumen(violaciones)}`).toEqual([]);
  });
}
