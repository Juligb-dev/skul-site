import { test, expect } from "@playwright/test";
import { auditar, graves, resumen, esperarListoParaAuditar } from "./accesibilidad.js";

/**
 * TIENDA PÚBLICA — el carrito lateral (E2E).
 *
 * Qué problema resuelve: el carrito es el paso previo a comprar y es un
 * diálogo: tiene que abrir, anunciarse como ventana al lector de pantalla
 * y cerrarse con Escape. Nada de eso se puede probar en jsdom con
 * confianza.
 *
 * OJO — NO COMPRA: esta prueba abre y cierra el carrito, nada más. Nunca
 * toca "Finalizar compra" ni el formulario de checkout, para que jamás se
 * genere un pedido real contra la tienda de producción.
 *
 * Si la tienda está cerrada no hay carrito público, así que el test se
 * saltea solo en vez de fallar (ver `test.skip`).
 */

const CARGANDO = "Cargando…";

test.describe("Tienda pública — carrito", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(CARGANDO)).toBeHidden({ timeout: 20_000 });
    // Dejamos la página quieta (cortina fuera y animaciones terminadas) para
    // que Axe no mida a media máquina: ver esperarListoParaAuditar.
    await esperarListoParaAuditar(page);
  });

  test("abre como diálogo accesible y se cierra con Escape", async ({ page }) => {
    // El botón del carrito solo existe en la tienda abierta. Si está
    // cerrada, no hay nada que probar acá (ya lo cubre la prueba de humo).
    const boton = page.getByRole("button", { name: "Abrir carrito" });
    test.skip(!(await boton.isVisible().catch(() => false)), "La tienda está cerrada: no hay carrito público.");

    await boton.click();

    // El panel se anuncia como diálogo con nombre: eso es lo que escucha
    // un lector de pantalla al abrirse.
    const carrito = page.getByRole("dialog", { name: "Carrito de compras" });
    await expect(carrito).toBeVisible();

    // Con el carrito abierto, la página tampoco debe tener violaciones
    // graves (es justo el momento en que el foco entra al panel).
    const violaciones = graves(await auditar(page));
    expect(violaciones, `Accesibilidad (carrito abierto):\n${resumen(violaciones)}`).toEqual([]);

    // Escape cierra: lo engancha useCartEsc en CartDrawer.
    await page.keyboard.press("Escape");
    await expect(carrito).toBeHidden();
  });
});
