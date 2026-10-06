/**
 * ============================================================
 *  PRUEBAS DE INTEGRACIÓN DE LA TIENDA ENTERA (StoreApp)
 * ------------------------------------------------------------
 *  StoreApp es el esqueleto: maneja el ruteo, el carrito, los precios,
 *  el cupón, la gift card y manda el pedido. Los tests lo recorren como
 *  un visitante de verdad: catálogo → cargar una prenda → abrir el
 *  carrito → ir a pagar → confirmar.
 *
 *  Lo que se pinna ACÁ (y no en las partes) es el flujo completo:
 *   - que el carrito persista en localStorage si recargás;
 *   - que "confirmar pedido" mande al Worker los CODIGOS (ids, talles,
 *     cantidades) y NUNCA los precios — el total lo recalcula el server;
 *   - que un rechazo del Worker no pierda el carrito, y un éxito lo
 *     vacíe y caiga en la pantalla de gracias correcta.
 *
 *  El resto (números del resumen, checkout) ya tiene suites propias:
 *  acá solo se verifica el pegamento.
 * ============================================================
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import StoreApp from "./StoreApp.jsx";
import { __fs, FakeTimestamp } from "./test/mocks/firestore.js";
import { fmt } from "./utils/format.js";

// El único pedazo que se simula es la creación del pedido en el Worker.
// Todo lo demás (catálogo, estado de la tienda) corre contra el falso de
// Firestore de verdad, como en producción.
const createOrderMock = vi.hoisted(() => vi.fn());
vi.mock("./hooks/useOrders.js", () => ({ createOrder: createOrderMock }));

const hoodie = {
  id: "H1",
  name: "Hoodie Concrete",
  slug: "hoodie-concrete",
  price: 250,
  cat: "hoodies",
  tag: "hoodie",
  sizes: ["S", "M", "L"],
  stock: {},
  weight: 400,
  photos: ["https://foto.test/h1.jpg"],
};

beforeEach(() => {
  // La cortina de entrada ya se vio en esta visita: la saltamos.
  sessionStorage.setItem("skul_intro_seen", "1");
  localStorage.clear();
  // JSDOM mantiene la URL entre tests: si un test navegó al checkout con
  // pushState, el siguiente arrancaría ya en esa página. Piso la URL.
  window.history.replaceState({ page: "home" }, "", "/");
  __fs.seed("products/H1", hoodie);
  __fs.seed("settings/site", { open: true });
  createOrderMock.mockReset();
});

const agregarHoodie = async () => {
  render(<StoreApp />);
  await screen.findByText(/hoodie concrete/i);
  fireEvent.click(screen.getByLabelText("Añadir talle M al carrito"));
  expect(await screen.findByText("Tu carrito (1)")).toBeInTheDocument();
};

/** Llena los datos obligatorios y elige medio de pago, listo para confirmar. */
const completarDatos = async (payMethod) => {
  fireEvent.change(screen.getByPlaceholderText("Nombre completo"), { target: { value: "Juana Pereyra" } });
  fireEvent.change(screen.getByPlaceholderText("Para coordinar el envío"), { target: { value: "1555555555" } });
  fireEvent.click(screen.getByText(new RegExp(payMethod)));
};

describe("StoreApp", () => {
  it("monta en home, carga el catálogo del falso de Firestore y muestra el producto", async () => {
    render(<StoreApp />);
    expect(await screen.findByText(/hoodie concrete/i)).toBeInTheDocument();
  });

  it("agregar al carrito abre el cajón con la línea, su precio y el subtotal", async () => {
    await agregarHoodie();
    // El nombre aparece dos veces: en la grilla del home y en la línea
    // del carrito lateral recién abierto.
    expect(screen.getAllByText("Hoodie Concrete").length).toBe(2);
    expect(screen.getByText("Talle M")).toBeInTheDocument();
    // Precio de la línea ($250) + el que ya se ve en la grilla.
    expect(screen.getAllByText(fmt(250)).length).toBeGreaterThanOrEqual(2);
  });

  it("el carrito persiste en localStorage (sobrevive a una recarga)", async () => {
    await agregarHoodie();
    const guardado = JSON.parse(localStorage.getItem("cart"));
    expect(guardado[0]).toMatchObject({ id: "H1", size: "M", qty: 1, price: 250 });
  });

  it("'Ir a pagar' lleva al checkout, que muestra el resumen con la línea", async () => {
    await agregarHoodie();
    fireEvent.click(screen.getByText("Ir a pagar"));

    expect(await screen.findByText("Resumen")).toBeInTheDocument();
    expect(screen.getByText("Hoodie Concrete / M x1")).toBeInTheDocument();
    // El subtotal del resumen es la prenda: $ 250 (línea + subtotal + total,
    // con envío en "Gratis", son el mismo número).
    expect(screen.getAllByText(fmt(250)).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Gratis").length).toBeGreaterThanOrEqual(1);
    // Sin datos ni medio de pago, el botón está apagado.
    expect(screen.getByText("Confirmar pedido")).toBeDisabled();
  });

  it("confirmar en efectivo manda los CÓDIGOS (nunca precios) y cae en la cita previa", async () => {
    await agregarHoodie();
    fireEvent.click(screen.getByText("Ir a pagar"));
    await screen.findByText("Resumen");

    fireEvent.change(screen.getByPlaceholderText("Nombre completo"), { target: { value: "Juana Pereyra" } });
    fireEvent.change(screen.getByPlaceholderText("Para coordinar el envío"), { target: { value: "1555555555" } });
    fireEvent.click(screen.getByText(/Efectivo — 10% off/));

    createOrderMock.mockResolvedValue({ orderId: "SKULTEST1", total: 250 });

    fireEvent.click(screen.getByText("Confirmar pedido"));

    expect(await screen.findByText("SKULTEST1")).toBeInTheDocument();
    expect(screen.getByText("Coordinemos tu cita")).toBeInTheDocument();

    // El payload que recibe el Worker: ids, talles, cantidades y códigos.
    // Ni un peso calculado en el cliente.
    const [pedido] = createOrderMock.mock.calls[0];
    expect(pedido.items).toEqual([{ id: "H1", size: "M", color: null, qty: 1 }]);
    expect(pedido).toMatchObject({
      zoneId: "local",
      payMethod: "efectivo",
      couponCode: null,
      giftCardCode: null,
      orderName: "Juana Pereyra",
      orderPhone: "1555555555",
    });
    expect(pedido.items[0]).not.toHaveProperty("price");
    expect(pedido).not.toHaveProperty("total");
    expect(JSON.stringify(pedido)).not.toContain("250");

    // El carrito se vació y se borró del storage.
    expect(localStorage.getItem("cart")).toBeNull();
    expect(screen.queryByText("Tu carrito (1)")).not.toBeInTheDocument();

    // La URL quedó con el ?pedido= para que la recarga de "gracias" no
    // pierda el monto.
    expect(window.location.search).toContain("pedido=SKULTEST1");
  });

  it("el retiro en el local no manda dirección (orderAddress null)", async () => {
    await agregarHoodie();
    fireEvent.click(screen.getByText("Ir a pagar"));
    await screen.findByText("Resumen");

    fireEvent.change(screen.getByPlaceholderText("Nombre completo"), { target: { value: "Juana Pereyra" } });
    fireEvent.change(screen.getByPlaceholderText("Para coordinar el envío"), { target: { value: "1555555555" } });
    fireEvent.click(screen.getByText(/Débito/));
    createOrderMock.mockResolvedValue({ orderId: "SKULTEST2", total: 250 });
    fireEvent.click(screen.getByText("Confirmar pedido"));

    await screen.findByText("Pedido registrado");
    expect(createOrderMock.mock.calls[0][0].orderAddress).toBeNull();
    expect(createOrderMock.mock.calls[0][0].payMethod).toBe("debito");
  });

  it("si el Worker rechaza (se agotó el stock), muestra el motivo y NO pierde el carrito", async () => {
    await agregarHoodie();
    fireEvent.click(screen.getByText("Ir a pagar"));
    await screen.findByText("Resumen");

    fireEvent.change(screen.getByPlaceholderText("Nombre completo"), { target: { value: "Juana Pereyra" } });
    fireEvent.change(screen.getByPlaceholderText("Para coordinar el envío"), { target: { value: "1555555555" } });
    fireEvent.click(screen.getByText(/Efectivo — 10% off/));
    createOrderMock.mockRejectedValue(
      new Error("Se agotó el stock de tu talle mientras comprabas. No se cobró nada.")
    );
    fireEvent.click(screen.getByText("Confirmar pedido"));

    expect(await screen.findByText(/No se cobró nada/)).toBeInTheDocument();
    // Sigue en el checkout, con el carrito intacto.
    expect(screen.getByText("Resumen")).toBeInTheDocument();
    expect(screen.getAllByText(fmt(250)).length).toBeGreaterThanOrEqual(2);
    expect(JSON.parse(localStorage.getItem("cart")).length).toBe(1);
  });

  it("abrir la ficha desde el home (ProductPage) y agregar suma a la MISMA línea", async () => {
    render(<StoreApp />);
    await screen.findByText(/hoodie concrete/i);

    // Primero agrego el talle M desde la grilla (unidad 1)...
    fireEvent.click(screen.getByLabelText("Añadir talle M al carrito"));
    expect(await screen.findByText("Tu carrito (1)")).toBeInTheDocument();

    // ...y después entro a la ficha y agrego el mismo talle de nuevo:
    // la key es la misma (producto+talle), así que la línea sube a 2.
    fireEvent.click(screen.getByLabelText("Ver Hoodie Concrete"));
    expect(await screen.findByText("SELECCIONAR TALLE")).toBeInTheDocument();

    const talleM = [...document.querySelectorAll(".rf-pdp-sizes button")].find((b) => b.textContent === "M");
    fireEvent.click(talleM);
    fireEvent.click(screen.getByText("AGREGAR AL CARRITO — TALLE M"));
    expect(await screen.findByText("Tu carrito (2)")).toBeInTheDocument();
    expect(screen.getAllByText(fmt(500)).length).toBeGreaterThanOrEqual(1);
  });

  it("abrir el carrito vacío desde la cabecera muestra el estado vacío", async () => {
    render(<StoreApp />);
    await screen.findByText(/hoodie concrete/i);
    fireEvent.click(screen.getByLabelText("Abrir carrito"));
    expect(await screen.findByText("Todavía no agregaste nada.")).toBeInTheDocument();
  });

  it("aplicar un cupón en el checkout: normaliza el código, descuenta y viaja en el pedido", async () => {
    // El cupón 10% para todo el pedido; lo voy a escribir en minúsculas
    // y con espacios para probar la normalización de verdad.
    __fs.seed("coupons/SKUL10", { type: "percent", value: 10, scope: "all", active: true, maxUses: null, usedCount: 0 });
    await agregarHoodie();
    fireEvent.click(screen.getByText("Ir a pagar"));
    await screen.findByText("Resumen");

    const campoCupon = screen.getByPlaceholderText("Ingresá tu cupón");
    fireEvent.change(campoCupon, { target: { value: "  skul10  " } });
    fireEvent.keyDown(campoCupon, { key: "Enter" });

    // El cupón quedó aplicado y el resumen muestra su línea de descuento.
    expect(await screen.findByText(/Cupón \(SKUL10\)/)).toBeInTheDocument();

    await completarDatos("Efectivo");
    // Con efectivo se suman los dos descuentos en orden: 10% y después el cupón.
    expect(screen.getByText(/Descuento \(10%\)/)).toBeInTheDocument();
    expect(screen.getByText(/Cupón \(SKUL10\)/)).toBeInTheDocument();

    createOrderMock.mockResolvedValue({ orderId: "SKULTEST3", total: 160 });
    fireEvent.click(screen.getByText("Confirmar pedido"));
    await screen.findByText("SKULTEST3");

    // Al Worker le llega el código normalizado (solo el código, no el
    // descuento calculado acá).
    expect(createOrderMock.mock.calls[0][0].couponCode).toBe("SKUL10");
  });

  it("aplicar una gift card: muestra el saldo restante y viaja el código normalizado", async () => {
    // Gift card activa con $10.000, $1.000 ya usados (saldo $9.000).
    __fs.seed("giftCards/SKUL-X7K2QM", {
      balance: 10000,
      usedAmount: 1000,
      active: true,
      createdAt: new FakeTimestamp(Date.now() - 1000 * 60 * 60),
    });
    await agregarHoodie();
    fireEvent.click(screen.getByText("Ir a pagar"));
    await screen.findByText("Resumen");

    const campoGift = screen.getByPlaceholderText("Ej: SKUL-X7K2QM");
    fireEvent.change(campoGift, { target: { value: "skul-x7k2qm" } });
    fireEvent.keyDown(campoGift, { key: "Enter" });

    // Quedó aplicada con el saldo que leyó del documento, y el resumen
    // suma su línea de descuento.
    expect(await screen.findByText(/Gift card "SKUL-X7K2QM" — saldo/)).toBeInTheDocument();
    expect(screen.getByText(/Gift card \(SKUL-X7K2QM\)/)).toBeInTheDocument();

    await completarDatos("Débito");
    createOrderMock.mockResolvedValue({ orderId: "SKULTEST4", total: 0 });
    fireEvent.click(screen.getByText("Confirmar pedido"));
    await screen.findByText("Pedido registrado");

    expect(createOrderMock.mock.calls[0][0].giftCardCode).toBe("SKUL-X7K2QM");
  });

  it("cupón inexistente: no rompe, muestra el motivo en el checkout y NO se aplica", async () => {
    await agregarHoodie();
    fireEvent.click(screen.getByText("Ir a pagar"));
    await screen.findByText("Resumen");

    const campoCupon = screen.getByPlaceholderText("Ingresá tu cupón");
    fireEvent.change(campoCupon, { target: { value: "NOEXISTE" } });
    fireEvent.keyDown(campoCupon, { key: "Enter" });

    expect(await screen.findByText(/no existe ese cupón/i)).toBeInTheDocument();
    expect(screen.queryByText(/Cupón \(/)).not.toBeInTheDocument();
  });
});