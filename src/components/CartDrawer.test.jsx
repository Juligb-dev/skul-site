/**
 * ============================================================
 *  PRUEBAS DEL CARRITO LATERAL (CartDrawer)
 * ------------------------------------------------------------
 *  CartDrawer es la única puerta entre agregar algo al carrito y
 *  pagarlo. No tiene estado: todo lo que muestra se lo pasan por props,
 *  así que acá se prueba que:
 *
 *   - muestre bien las líneas (nombre, talle, color, cantidad y el
 *     precio YA multiplicado), el subtotal y el aviso de 10% efectivo;
 *   - el "+" se desactive en el tope de stock real (maxQty), sin
 *     romper los productos sin control de stock;
 *   - todas las acciones apunten al KEY de la línea, nunca a un índice;
 *   - el Escape cierre el panel (y que NO deje el listener cuando el
 *     panel está cerrado, que es como se acumulan los memory leaks);
 *   - vacío: nada de agregar, solo "seguir mirando".
 * ============================================================
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CartDrawer, { useCartEsc } from "./CartDrawer.jsx";
import { fmt } from "../utils/format.js";

const linea = (over = {}) => ({
  key: "hoodie-M-negro",
  name: "Hoodie",
  size: "M",
  color: "Negro",
  price: 100,
  qty: 2,
  image: null,
  maxQty: 5,
  ...over,
});

const renderCart = (over = {}) => {
  const helpers = {
    changeQty: vi.fn(),
    removeItem: vi.fn(),
    close: vi.fn(),
    goCheckout: vi.fn(),
    ...over,
  };
  render(
    <CartDrawer
      cart={helpers.cart ?? []}
      changeQty={helpers.changeQty}
      removeItem={helpers.removeItem}
      subtotal={helpers.subtotal ?? 0}
      close={helpers.close}
      goCheckout={helpers.goCheckout}
    />
  );
  return helpers;
};

describe("CartDrawer", () => {
  it("vacío: dice que no hay nada y 'Seguir mirando' cierra el panel", () => {
    const { close } = renderCart();
    expect(screen.getByText("Todavía no agregaste nada.")).toBeInTheDocument();
    expect(screen.getByText("Tu carrito")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Seguir mirando"));
    expect(close).toHaveBeenCalled();
  });

  it("cabecera: suma unidades (no items), y muestra nombre, talle y color", () => {
    renderCart({ cart: [linea(), linea({ key: "buzo-L-azul", name: "Buzo", size: "L", color: "Azul", price: 150, qty: 1 })] });
    expect(screen.getByText("Tu carrito (3)")).toBeInTheDocument();
    expect(screen.getByText("Hoodie")).toBeInTheDocument();
    expect(screen.getByText("Talle M · Negro")).toBeInTheDocument();
    expect(screen.getByText("Talle L · Azul")).toBeInTheDocument();
  });

  it("el precio de cada línea ya viene multiplicado por su cantidad", () => {
    renderCart({ cart: [linea()] });
    expect(screen.getByText(fmt(100 * 2))).toBeInTheDocument();
  });

  it("sumar y restar mandan el KEY de la línea, no un índice", () => {
    const { changeQty } = renderCart({ cart: [linea()] });
    fireEvent.click(screen.getByLabelText("Sumar"));
    expect(changeQty).toHaveBeenCalledWith("hoodie-M-negro", 1);

    fireEvent.click(screen.getByLabelText("Restar"));
    expect(changeQty).toHaveBeenCalledWith("hoodie-M-negro", -1);
  });

  it("eliminar borra la línea entera (otra vez, por su key)", () => {
    const { removeItem } = renderCart({ cart: [linea()] });
    fireEvent.click(screen.getByLabelText("Eliminar"));
    expect(removeItem).toHaveBeenCalledWith("hoodie-M-negro");
  });

  it("los botones se apagan en el tope de stock real", () => {
    renderCart({
      cart: [
        linea({ qty: 2, maxQty: 2 }),
        linea({ key: "sin-stock", name: "Buzo", maxQty: null, qty: 1 }),
      ],
    });
    const sumadores = screen.getAllByLabelText("Sumar");
    expect(sumadores).toHaveLength(2);
    // El primero está en el tope (maxQty 2 con qty 2): desactivado.
    expect(sumadores[0]).toBeDisabled();
    // La línea sin control de stock (maxQty null) queda activa.
    expect(sumadores[1]).not.toBeDisabled();
  });

  it("pie: subtotal formateado, aviso de 10% efectivo e 'Ir a pagar'", () => {
    const { goCheckout } = renderCart({ cart: [linea()], subtotal: 250 });
    expect(screen.getByText(fmt(250))).toBeInTheDocument();
    expect(screen.getByText("10% OFF PAGANDO EN EFECTIVO")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Ir a pagar"));
    expect(goCheckout).toHaveBeenCalledTimes(1);
  });

  it("la X de la cabecera y el fondo oscuro cierran el panel", () => {
    const { close } = renderCart({ cart: [linea()] });
    fireEvent.click(screen.getByLabelText("Cerrar carrito"));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("escape cierra mientras el panel está abierto", () => {
    const { close } = renderCart({ cart: [linea()] });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("sin miniatura no dibuja un <img> roto (image opcional)", () => {
    renderCart({ cart: [linea()] });
    expect(document.querySelector(".rf-cart-thumb")).toBeNull();
  });

  it("con imagen, la dibuja como decoración (sin alt)", () => {
    renderCart({ cart: [linea({ image: "https://foto.test/hoodie.jpg" })] });
    expect(document.querySelector(".rf-cart-thumb")).not.toBeNull();
  });
});

describe("useCartEsc", () => {
  function Harness({ open, close }) {
    useCartEsc(open, close);
    return <div>harness</div>;
  }

  it("con open=false no escucha el Escape (y al abrirse, sí)", () => {
    const close = vi.fn();
    const view = render(<Harness open={false} close={close} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(close).not.toHaveBeenCalled();

    view.rerender(<Harness open={true} close={close} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("al cerrarse (open=false) saca el listener: ya no cierra", () => {
    const close = vi.fn();
    const view = render(<Harness open={true} close={close} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(close).toHaveBeenCalledTimes(1);

    view.rerender(<Harness open={false} close={close} />);
    fireEvent.keyDown(window, { key: "Escape" });
    // Sigue en 1: el listener de antes no quedó colgado.
    expect(close).toHaveBeenCalledTimes(1);
  });
});