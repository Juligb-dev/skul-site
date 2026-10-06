/**
 * PRUEBAS — src/utils/routes.js
 * ------------------------------------------------------------
 * `pageToPath`, `parsePath` y `pageTitle` son el mismo mapa escrito al revés.
 * El archivo lo dice: si a una ruta nueva le falta el caso en uno de los dos
 * lados, el link existe pero no se puede llegar con clic, o se navega a una
 * URL que al recargar tira a home.
 *
 * Por eso el test más importante de este archivo es el de ida y vuelta:
 * para cada ruta, generar la URL y volver a parsearla tiene que dar la
 * MISMA página. Eso es exactamente el bug que rompe "compartir el link".
 */
import { describe, it, expect } from "vitest";
import { pageToPath, parsePath, pageTitle } from "./routes.js";

// Todas las páginas que existen, con los datos extra que cada una necesita.
const PAGINAS = [
  ["home", {}],
  ["catalog", { cat: "hoodies" }],
  ["catalog", { cat: "all" }],
  ["noreastock", {}],
  ["outlet", {}],
  ["giftcards", {}],
  ["product", { slug: "hoodie-concrete" }],
  ["product", { productId: "abc123" }],
  ["size-guide", {}],
  ["nosotros", {}],
  ["contacto", {}],
  ["cambios", {}],
  ["envios", {}],
  ["informacion-legal", {}],
  ["checkout", {}],
  ["gracias-transferencia", {}],
  ["cita-previa", {}],
  ["gracias-tarjeta", {}],
  ["seguimiento", { code: "ABC123" }],
  ["terminos", {}],
  ["privacidad", {}],
  ["cookies", {}],
  ["analitica", {}],
  ["accesibilidad", {}],
  ["arrepentimiento", {}],
];

describe("pageToPath — estado → URL", () => {
  it.each(PAGINAS)("%s arma una URL que empieza con /", (page, extra) => {
    const path = pageToPath(page, extra);
    expect(path.startsWith("/")).toBe(true);
    expect(path).not.toContain(" ");
  });

  it("la home es la raíz", () => {
    expect(pageToPath("home")).toBe("/");
  });

  it("la categoría 'all' no viaja en la URL", () => {
    expect(pageToPath("catalog", { cat: "all" })).toBe("/catalogo");
    expect(pageToPath("catalog", { cat: "hoodies" })).toBe("/catalogo/hoodies");
  });

  it("prioriza el slug sobre el id en la ficha de producto (SEO)", () => {
    expect(pageToPath("product", { slug: "hoodie-concrete", productId: "abc123" })).toBe("/producto/hoodie-concrete");
  });

  it("cae al id si el producto viejo no tiene slug", () => {
    expect(pageToPath("product", { productId: "abc123" })).toBe("/producto/abc123");
  });

  it("cae a home si no hay slug NI id (no genera /producto/ vacío)", () => {
    // /producto/ solo no renderiza nada: es mejor mandar a home.
    expect(pageToPath("product", {})).toBe("/");
  });

  it("el código de seguimiento va escapado en la query", () => {
    expect(pageToPath("seguimiento", { code: "ABC 123" })).toBe("/seguimiento?pedido=ABC%20123");
  });

  it("sin código, /seguimiento no lleva query", () => {
    expect(pageToPath("seguimiento")).toBe("/seguimiento");
  });

  it("una página desconocida cae a home en vez de romper", () => {
    expect(pageToPath("no-existe")).toBe("/");
    expect(pageToPath(undefined)).toBe("/");
  });
});

describe("parsePath — URL → estado", () => {
  it("la raíz es la home", () => {
    expect(parsePath("/", "")).toEqual({ page: "home" });
  });

  it("el catálogo trae la categoría", () => {
    expect(parsePath("/catalogo", "")).toEqual({ page: "catalog", cat: "all" });
    expect(parsePath("/catalogo/denim", "")).toEqual({ page: "catalog", cat: "denim" });
  });

  it("el producto devuelve el slug o id como productParam", () => {
    expect(parsePath("/producto/hoodie-concrete", "")).toEqual({
      page: "product",
      productParam: "hoodie-concrete",
    });
  });

  it("/producto/ sin slug NO es una ficha (vuelve a home)", () => {
    // Importante: renderizar la ficha sin producto rompería la pantalla.
    expect(parsePath("/producto/", "")).toEqual({ page: "home" });
    expect(parsePath("/producto", "")).toEqual({ page: "home" });
  });

  it("el seguimiento lee el código de la query", () => {
    expect(parsePath("/seguimiento", "?pedido=ABC123")).toEqual({ page: "seguimiento", code: "ABC123" });
  });

  it("el seguimiento sin query devuelve code:null (pide el formulario)", () => {
    expect(parsePath("/seguimiento", "")).toEqual({ page: "seguimiento", code: null });
  });

  it("descodifica el código escapado", () => {
    expect(parsePath("/seguimiento", "?pedido=ABC%20123").code).toBe("ABC 123");
  });

  it("una URL desconocida manda a home en vez de romper", () => {
    expect(parsePath("/ruta-que-no-existe", "")).toEqual({ page: "home" });
    expect(parsePath("/catalogo/denim/extrano", "")).toEqual({ page: "catalog", cat: "denim" });
  });

  it("ignora barras finales y segmentos vacíos", () => {
    expect(parsePath("/catalogo/", "")).toEqual({ page: "catalog", cat: "all" });
    expect(parsePath("//catalogo//hoodies//", "")).toEqual({ page: "catalog", cat: "hoodies" });
  });
});

describe("pageToPath ↔ parsePath — ida y vuelta", () => {
  // ESTE es el test que caza el bug real del archivo: una ruta con el caso
  // en un lado pero no en el otro. Si alguien agrega una página nueva y
  // olvida el `if` de parsePath, este test se cae solo.
  it.each(PAGINAS)("ida y vuelta de %s conserva la página", (page, extra) => {
    const path = pageToPath(page, extra);
    const [pathname, search] = path.split("?");
    const parsed = parsePath(pathname, search || "");
    expect(parsed.page).toBe(page);
  });

  it("ida y vuelta conserva la categoría del catálogo", () => {
    const path = pageToPath("catalog", { cat: "hoodies" });
    expect(parsePath(path, "").cat).toBe("hoodies");
  });

  it("ida y vuelta conserva el código de seguimiento", () => {
    const path = pageToPath("seguimiento", { code: "ABC123" });
    const [pathname, search] = path.split("?");
    expect(parsePath(pathname, search).code).toBe("ABC123");
  });
});

describe("pageTitle — título de pestaña", () => {
  it("todas las páginas tienen título y ninguna queda vacía", () => {
    for (const [page] of PAGINAS) {
      expect(pageTitle(page).length).toBeGreaterThan(0);
    }
  });

  it("el catálogo muestra la categoría real, no 'Todo'", () => {
    expect(pageTitle("catalog", { catLabel: "Hoodies" })).toBe("Hoodies — SKUL");
    expect(pageTitle("catalog", { catLabel: "Todo" })).toBe("Catálogo — SKUL");
  });

  it("la ficha usa el nombre del producto adelante", () => {
    expect(pageTitle("product", { productName: "Hoodie Concrete" })).toBe("Hoodie Concrete — SKUL");
  });

  it("sin producto cargado cae al título base (nunca en blanco)", () => {
    expect(pageTitle("product")).toBe("SKUL — Streetwear");
  });

  it("las dos pantallas de gracias comparten título", () => {
    expect(pageTitle("gracias-transferencia")).toBe(pageTitle("gracias-tarjeta"));
  });

  it("una página desconocida cae al título base", () => {
    expect(pageTitle("no-existe")).toBe("SKUL — Streetwear");
  });
});