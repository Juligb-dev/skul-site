/**
 * ============================================================
 *  PRUEBAS DE LA TARJETA DE PRODUCTO (ProductGrid)
 * ============================================================
 *
 *  Lo que se protege acá es el NOMBRE ACCESIBLE del enlace de la foto.
 *
 *  Contexto de un bug real: la foto del producto es un <a> con un
 *  `aria-label` del tipo "Ver Buzo". Encima de la foto se dibujan pastillas
 *  de estado (SALE, SIN STOCK, EXCLUSIVE) que el visitante VE. Para WCAG
 *  2.5.3 ("Label in Name") el nombre accesible tiene que contener el texto
 *  visible; si no, quien usa dictado por voz dice lo que lee —"Ver Buzo
 *  SALE"— y el sistema no encuentra el control.
 *
 *  El detalle fino que costó encontrar: Axe arma las palabras del texto
 *  visible y las busca como SECUENCIA CONTIGUA dentro del nombre. Si dos
 *  pastillas quedan pegadas en el DOM ("SIN STOCK" + "EXCLUSIVE" sin ningún
 *  espacio entre medio), el texto visible se lee como una sola palabra
 *  ("SIN STOCKEXCLUSIVE") que nunca aparece en el nombre. Por eso estas
 *  pruebas no sólo miran el `aria-label`: también que las pastillas estén
 *  SEPARADAS, que es lo que de verdad evita el falso (y el verdadero)
 *  problema.
 *
 *  No se prueba el CSS (jsdom no lo aplica) ni el clic: eso está cubierto en
 *  e2e/ (Playwright + Axe) y en las pruebas de la app.
 * ============================================================
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ProductGrid from "./ProductGrid.jsx";

/** El contenedor de pastillas de la primera tarjeta. */
function pastillas() {
  return document.querySelector(".rf-product-badges");
}

/** Texto visible de las pastillas, tal como lo lee el navegador. */
function textoPastillas() {
  return pastillas().textContent;
}

const base = { id: "p1", name: "Buzo", price: 10000 };

describe("ProductGrid — el nombre del enlace incluye lo que se ve", () => {
  it("sin pastillas, el enlace se llama 'Ver <producto>'", () => {
    render(<ProductGrid products={[base]} openProduct={() => {}} />);
    expect(screen.getByRole("link", { name: "Ver Buzo" })).toBeInTheDocument();
  });

  it("con etiqueta de oferta: el nombre contiene el texto de la pastilla", () => {
    render(<ProductGrid products={[{ ...base, tag: "SALE" }]} openProduct={() => {}} />);

    // La pastilla dice SALE y el enlace lo dice también.
    expect(textoPastillas()).toContain("SALE");
    expect(screen.getByRole("link", { name: /Ver Buzo.*SALE/ })).toBeInTheDocument();
  });

  it("agotado: la pastilla SIN STOCK está en el nombre", () => {
    const agotado = { ...base, sizes: ["S", "M"], stock: { S: 0, M: 0 } };
    render(<ProductGrid products={[agotado]} openProduct={() => {}} />);

    expect(textoPastillas()).toContain("SIN STOCK");
    expect(screen.getByRole("link", { name: /Ver Buzo.*SIN STOCK/ })).toBeInTheDocument();
  });

  it("No-Restock con dos pastillas: quedan SEPARADAS y las dos están en el nombre", () => {
    // Es el caso exacto que Axe marcaba: "SIN STOCK" + "EXCLUSIVE" pegadas.
    const agotado = { ...base, sizes: ["S", "M"], stock: { S: 0, M: 0 } };
    render(<ProductGrid products={[agotado]} openProduct={() => {}} nrs />);

    // Separadas como palabras: el espacio no se ve (el contenedor es flex)
    // pero sí se lee.
    expect(textoPastillas()).toMatch(/SIN STOCK\s+EXCLUSIVE/);

    // Y las dos, además del nombre del producto, están en el nombre del enlace.
    const enlace = screen.getByRole("link", { name: /Ver Buzo/ });
    const nombre = enlace.getAttribute("aria-label");
    expect(nombre).toContain("Buzo");
    expect(nombre).toContain("SIN STOCK");
    expect(nombre).toContain("EXCLUSIVE");
  });

  it("el nombre no repite el texto pegado: cada pastilla aporta palabras separadas", () => {
    // Guarda contra la regresión que motivó todo esto: si alguien vuelve a
    // dibujar las pastillas sin separación, el texto visible vuelve a ser
    // una sola palabra y esto falla.
    const agotado = { ...base, sizes: ["S", "M"], stock: { S: 0, M: 0 } };
    render(<ProductGrid products={[agotado]} openProduct={() => {}} nrs />);

    expect(textoPastillas()).not.toContain("STOCKEXCLUSIVE");
  });
});

describe("ProductGrid — el enlace de la foto navega a la ficha", () => {
  it("usa el slug cuando existe", () => {
    render(<ProductGrid products={[{ ...base, slug: "buzo-oversize" }]} openProduct={() => {}} />);
    expect(screen.getByRole("link", { name: /Ver Buzo/ })).toHaveAttribute("href", "/producto/buzo-oversize");
  });

  it("cae al id cuando el producto es viejo y no tiene slug", () => {
    render(<ProductGrid products={[base]} openProduct={() => {}} />);
    expect(screen.getByRole("link", { name: /Ver Buzo/ })).toHaveAttribute("href", "/producto/p1");
  });

  it("al hacer clic no recarga: delega en openProduct con el id", async () => {
    const openProduct = vi.fn();
    render(<ProductGrid products={[base]} openProduct={openProduct} />);

    screen.getByRole("link", { name: /Ver Buzo/ }).click();

    expect(openProduct).toHaveBeenCalledWith("p1");
  });
});
