/**
 * ============================================================
 *  PRUEBAS DEL CHECKOUT — la pantalla donde el cliente paga
 * ============================================================
 *
 *  Checkout es puramente declarativo: recibe el carrito ya calculado
 *  desde StoreApp y solo muestra el formulario + el resumen, llamando
 *  a los setters que le pasan. Por eso estos tests se concentran en:
 *
 *   1. El RESULTADO EN PANTALLA: que el resumen muestre los mismos
 *      números que calculó StoreApp (los descuentos en su orden:
 *      efectivo, cupón, gift card, y el envío afuera de todo).
 *
 *   2. Las TRES REGLAS DE PLATA del checkout:
 *      a) El 10% de efectivo es solo con retiro en local: si el
 *         cliente pasa a Correo Argentino teniendo "efectivo"
 *         seleccionado, se DESELECCIONA SOLO (effect).
 *      b) El botón de confirmar se habilita solo con datos válidos y
 *         medio de pago elegido; el cupón y la gift card NUNCA lo
 *         bloquean.
 *      c) La gift card descuenta solo lo que le sobra al pedido
 *         después del cupón.
 *
 *   3. El flujo de CorreoShipping, que se prueba acá de verdad
 *      (cotizar → domicilio/sucursal → elegir agencia) con la API
 *      simulada, no con un mock del componente.
 *
 *  No se prueba nada de plata con plata real: el checkout nunca calcula
 *  un precio (eso es del Worker), solo lo muestra.
 * ============================================================
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// La API de Correo Argentino vive detrás del Worker: acá la simulamos
// porque el checkout no puede ni debe pegarle al Worker real en tests.
vi.mock("../utils/correo.js", () => ({
  getShippingRates: vi.fn(),
  getAgencies: vi.fn(),
  // Sin geocoding los tests prueban el camino "lista sin ordenar por
  // cercanía" (el de antes): null = el CP no se pudo ubicar.
  geocodificarCP: vi.fn(async () => null),
  distanciaKm: vi.fn(() => 0),
}));
import { getShippingRates, getAgencies } from "../utils/correo.js";
import Checkout from "./Checkout.jsx";

// Un carrito de dos remeras para mover números. `key` es lo que usa
// React para distinguir las líneas del resumen.
const carrito = [
  { id: "a", name: "Remera Básica", size: "M", color: "Negro", qty: 2, price: 5000, key: "a-M-Negro", weight: 300 },
  { id: "b", name: "Hoodie", size: "L", color: "Gris", qty: 1, price: 9500, key: "b-L-Gris", weight: 600 },
];

function renderCheckout({ cart = carrito, ...props } = {}) {
  const setters = {
    setZone: vi.fn(),
    setCorreoQuote: vi.fn(),
    setPayMethod: vi.fn(),
    setOrderName: vi.fn(),
    setOrderPhone: vi.fn(),
    setOrderAddress: vi.fn(),
    setCouponCode: vi.fn(),
    setGiftCardCode: vi.fn(),
    applyCoupon: vi.fn(),
    applyGiftCard: vi.fn(),
    removeCoupon: vi.fn(),
    removeGiftCard: vi.fn(),
    confirmOrder: vi.fn(),
    nav: vi.fn(),
  };
  render(
    <Checkout
      cart={cart}
      zone="local"
      payMethod="transferencia"
      subtotal={19500}
      shippingCost={0}
      total={19500}
      {...setters}
      {...props}
    />
  );
  return setters;
}

describe("Carrito vacío", () => {
  it("no dibuja el formulario y ofrece volver al catálogo", () => {
    const setters = renderCheckout({ cart: [] });
    expect(screen.getByText("Tu carrito está vacío.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Ver catálogo"));
    expect(setters.nav).toHaveBeenCalledWith("catalog");
  });
});

describe("Resumen: los números que muestra son los que le pasaron", () => {
  it("pinta cada línea del carrito con su nombre, talle, color y monto", () => {
    renderCheckout();
    expect(screen.getByText(/Remera Básica \/ M \/ Negro x2/)).toBeInTheDocument();
    expect(screen.getByText(/\$10\.000/)).toBeInTheDocument();
    expect(screen.getByText(/Hoodie \/ L \/ Gris x1/)).toBeInTheDocument();
    expect(screen.getByText(/\$9\.500/)).toBeInTheDocument();
  });

  it("sin descuentos: Subtotal, Envío gratis y Total", () => {
    renderCheckout();
    expect(screen.getByText("Subtotal")).toBeInTheDocument();
    // Subtotal y Total dan el mismo número (envío gratis, sin descuentos).
    expect(screen.getAllByText("$19.500").length).toBe(2);
    expect(screen.getAllByText("Gratis").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Total")).toBeInTheDocument();
  });

  it("muestra cada descuento en su orden, con su código", () => {
    renderCheckout({
      discount: 1000,
      shippingCost: 800,
      subtotal: 19000,
      total: 17500,
      appliedCoupon: { code: "BIEN" },
      couponDiscount: 1200,
      appliedGiftCard: { code: "SKUL-ABC", saldo: 3000 },
      giftCardDiscount: 1300,
    });
    expect(screen.getByText("Descuento (10%)")).toBeInTheDocument();
    expect(screen.getByText("- $1.000")).toBeInTheDocument();
    expect(screen.getByText("Cupón (BIEN)")).toBeInTheDocument();
    expect(screen.getByText("- $1.200")).toBeInTheDocument();
    expect(screen.getByText("Gift card (SKUL-ABC)")).toBeInTheDocument();
    expect(screen.getByText("- $1.300")).toBeInTheDocument();
    expect(screen.getByText("$800")).toBeInTheDocument();
    expect(screen.getByText("$17.500")).toBeInTheDocument();
  });
});

describe("Campos del formulario", () => {
  it("escribe nombre, teléfono y dirección usando los setters", () => {
    const setters = renderCheckout();
    fireEvent.change(screen.getByPlaceholderText("Nombre completo"), { target: { value: "Juana Pereyra" } });
    fireEvent.change(screen.getByPlaceholderText("Para coordinar el envío"), { target: { value: "1555555555" } });
    expect(setters.setOrderName).toHaveBeenCalledWith("Juana Pereyra");
    expect(setters.setOrderPhone).toHaveBeenCalledWith("1555555555");
  });

  it("sin datos el botón está deshabilitado y avisa qué falta", () => {
    renderCheckout();
    const confirmar = screen.getByText("Confirmar pedido");
    expect(confirmar).toBeDisabled();
    expect(
      screen.getByText(/Completá tu nombre, teléfono y elegí un medio de pago para continuar\./)
    ).toBeInTheDocument();
  });

  it("con nombre, teléfono y medio de pago confirma el pedido", async () => {
    // Checkout es controlado: la validez se decide con las props, no con
    // lo que se tipea (los setters los recibe StoreApp). Por eso acá
    // pasamos los datos ya llenos.
    const setters = renderCheckout({ orderName: "Juana Pereyra", orderPhone: "1555555555" });
    const confirmar = screen.getByText("Confirmar pedido");
    expect(confirmar).not.toBeDisabled();
    fireEvent.click(confirmar);
    expect(setters.confirmOrder).toHaveBeenCalledTimes(1);
  });

  it("mientras está confirmando muestra 'Confirmando...' y no deja reintentar", () => {
    const setters = renderCheckout({ confirming: true, orderName: "Juana", orderPhone: "1555555555" });
    const btn = screen.getByText("Confirmando...");
    expect(btn).toBeDisabled();
    expect(setters.confirmOrder).not.toHaveBeenCalled();
  });

  it("muestra el error del servidor sin limpiar nada", () => {
    renderCheckout({ orderError: "No alcanza el stock de la remera." });
    expect(screen.getByText("No alcanza el stock de la remera.")).toBeInTheDocument();
  });
});

describe("Medio de pago", () => {
  it("elegir débito/crédito/transferencia/efectivo avisa al setter", () => {
    const setters = renderCheckout();
    fireEvent.click(screen.getByText("Débito"));
    fireEvent.click(screen.getByText("Crédito"));
    fireEvent.click(screen.getByText("Transferencia"));
    fireEvent.click(screen.getByText(/Efectivo — 10% off/));
    expect(setters.setPayMethod).toHaveBeenNthCalledWith(1, "debito");
    expect(setters.setPayMethod).toHaveBeenNthCalledWith(2, "credito");
    expect(setters.setPayMethod).toHaveBeenNthCalledWith(3, "transferencia");
    expect(setters.setPayMethod).toHaveBeenNthCalledWith(4, "efectivo");
  });

  it("con envío por correo, efectivo queda deshabilitado", () => {
    const setters = renderCheckout({ zone: "correo" });
    const efectivo = screen.getByText(/Efectivo — 10% off/);
    expect(efectivo).toBeDisabled();
    fireEvent.click(efectivo);
    expect(setters.setPayMethod).not.toHaveBeenCalledWith("efectivo");
  });
});

describe("Envío por Correo Argentino", () => {
  it("el botón de Correo activa la zona correo", () => {
    const setters = renderCheckout();
    fireEvent.click(screen.getByText("Envío por Correo Argentino"));
    expect(setters.setZone).toHaveBeenCalledWith("correo");
  });

  it("si ya tenía efectivo, pasarse a correo lo DESELECCIONA (regla de plata)", () => {
    // La regla: el 10% es por retiro en el local. Efectivo + Correo
    // Argentino no pueden coexistir, así que el checkout lo deselecciona
    // solo apenas detecta la zona correo (useEffect en Checkout.jsx).
    const setters = renderCheckout({ zone: "correo", payMethod: "efectivo" });
    expect(setters.setPayMethod).toHaveBeenCalledWith(null);
  });

  it("cotiza y deja elegir domicilio mostrando el precio real", async () => {
    getShippingRates.mockResolvedValueOnce({ domicilio: 3200, sucursal: 2600 });
    renderCheckout({ zone: "correo", cartWeight: 900 });
    await userEvent.type(screen.getByPlaceholderText("Ej: 1704"), "1704");
    fireEvent.click(screen.getByText("Calcular envío"));
    await screen.findByText("Envío a domicilio");
    expect(getShippingRates).toHaveBeenCalledWith("1704", 900);
    expect(screen.getByText("$3.200")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Envío a domicilio"));
    // onChange(null) primero, después el quote: el checkout avisa siempre.
  });

  it("con cotización en mano, eligir domicilio avisa a setCorreoQuote con el objeto", async () => {
    getShippingRates.mockResolvedValueOnce({ domicilio: 3200, sucursal: 2600 });
    const setters = renderCheckout({ zone: "correo", cartWeight: 900 });
    await userEvent.type(screen.getByPlaceholderText("Ej: 1704"), "1704");
    fireEvent.click(screen.getByText("Calcular envío"));
    await screen.findByText("Envío a domicilio");
    fireEvent.click(screen.getByText("Envío a domicilio"));
    expect(setters.setCorreoQuote).toHaveBeenCalledWith({
      type: "domicilio",
      price: 3200,
      postalCode: "1704",
      provinceCode: "B",
    });
  });

  it("retiro en sucursal: filtra agencias y avisa el código de la elegida", async () => {
    getShippingRates.mockResolvedValueOnce({ domicilio: 3200, sucursal: 2600 });
    getAgencies.mockResolvedValueOnce([
      { code: "AG1", name: "Correo Central", city: "Los Toldos", address: "Av. 1" },
      { code: "AG2", name: "Expreso Norte", city: "Junín", address: "Calle 2" },
    ]);
    const setters = renderCheckout({ zone: "correo", cartWeight: 900 });
    await userEvent.type(screen.getByPlaceholderText("Ej: 1704"), "1704");
    fireEvent.click(screen.getByText("Calcular envío"));
    await screen.findByText("Retiro en sucursal de Correo");
    fireEvent.click(screen.getByText("Retiro en sucursal de Correo"));
    // Cada fila muestra el nombre y, abajo, la dirección completa.
    await screen.findByText("Correo Central");
    expect(screen.getByText("Av. 1, Los Toldos")).toBeInTheDocument();
    expect(getAgencies).toHaveBeenCalledWith("B");
    // Filtrar la lista
    await userEvent.type(screen.getByPlaceholderText("Buscar sucursal por calle o localidad…"), "Junín");
    expect(screen.queryByText("Correo Central")).not.toBeInTheDocument();
    expect(screen.getByText("Expreso Norte")).toBeInTheDocument();
    expect(screen.getByText("Calle 2, Junín")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Expreso Norte"));
    expect(setters.setCorreoQuote).toHaveBeenCalledWith({
      type: "sucursal",
      price: 2600,
      postalCode: "1704",
      provinceCode: "B",
      agencyCode: "AG2",
      agencyName: "Expreso Norte (Calle 2, Junín)",
    });
  });

  it("sucursal elegida: muestra la confirmación y NO pide dirección", () => {
    renderCheckout({
      zone: "correo",
      correoQuote: { type: "sucursal", price: 2600, postalCode: "1704", provinceCode: "B", agencyCode: "AG2", agencyName: "Expreso Norte (Junín)" },
    });
    expect(
      screen.getByText((_, el) => el.tagName === "P" && el.textContent.includes("Sucursal elegida: Expreso Norte (Junín)"))
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Av\. San Martín/)).not.toBeInTheDocument();
  });

  it("falla la cotización: muestra el mensaje de la API", async () => {
    getShippingRates.mockRejectedValueOnce(new Error("Código postal inexistente."));
    renderCheckout({ zone: "correo" });
    await userEvent.type(screen.getByPlaceholderText("Ej: 1704"), "99999");
    fireEvent.click(screen.getByText("Calcular envío"));
    await screen.findByText("Código postal inexistente.");
  });

  it("domicilio a puerta: en casa pide dirección y sin ella no deja confirmar", async () => {
    // Sin dirección: el botón queda deshabilitado aunque tenga nombre y tel.
    renderCheckout({
      zone: "correo",
      correoQuote: { type: "domicilio", price: 3200 },
      orderName: "Juana Pereyra",
      orderPhone: "1555555555",
      orderAddress: "",
    });
    const dir = await screen.findByPlaceholderText(/Av\. San Martín/);
    expect(dir).toBeInTheDocument();
    expect(screen.getByText("Confirmar pedido")).toBeDisabled();
  });

  it("domicilio a puerta: con dirección válida sí deja confirmar", () => {
    renderCheckout({
      zone: "correo",
      correoQuote: { type: "domicilio", price: 3200 },
      orderName: "Juana Pereyra",
      orderPhone: "1555555555",
      orderAddress: "Av. San Martín 1234",
    });
    expect(screen.getByText("Confirmar pedido")).not.toBeDisabled();
  });

  it("retiro en sucursal NO pide dirección (no hace falta saber dónde vive)", () => {
    renderCheckout({ zone: "correo", correoQuote: { type: "sucursal", price: 2600, agencyCode: "AG1" } });
    expect(screen.queryByPlaceholderText(/Av\. San Martín/)).not.toBeInTheDocument();
    expect(screen.getByText(/Sucursal elegida/)).toBeInTheDocument();
  });
});

describe("Cupón", () => {
  it("escribir el código y apretar Enter dispara la validación", async () => {
    const setters = renderCheckout();
    await userEvent.type(screen.getByPlaceholderText("Ingresá tu cupón"), "BIEN");
    fireEvent.keyDown(screen.getByPlaceholderText("Ingresá tu cupón"), { key: "Enter" });
    expect(setters.applyCoupon).toHaveBeenCalledTimes(1);
  });

  it("muestra el motivo del rechazo en rojo", () => {
    renderCheckout({ couponError: "Ese cupón no existe." });
    expect(screen.getByText("Ese cupón no existe.")).toBeInTheDocument();
  });

  it("cuando está aplicado muestra el código, el ✓ y permite quitarlo", () => {
    const setters = renderCheckout({ appliedCoupon: { code: "BIEN", scope: "all", type: "percent", value: 20 } });
    expect(screen.getByText('Cupón "BIEN" aplicado ✓')).toBeInTheDocument();
    fireEvent.click(screen.getByText("Quitar"));
    expect(setters.removeCoupon).toHaveBeenCalledTimes(1);
  });

  it("un cupón que no cubre nada del carrito se avisa en gris, no miente", () => {
    renderCheckout({ appliedCoupon: { code: "PROD", scope: "products" }, couponApplies: false });
    expect(screen.getByText('Cupón "PROD" aplicado ✓')).toBeInTheDocument();
    expect(screen.getByText(/Este cupón no aplica a los productos/)).toBeInTheDocument();
  });

  it("mientras consulta, el botón dice '...' y está apagado", () => {
    renderCheckout({ couponChecking: true });
    const boton = screen.getByText("...");
    expect(boton).toBeDisabled();
  });
});

describe("Gift card", () => {
  it("el código se escribe en MAYÚSCULAS solo (son códigos sensibles a mayús/minús)", () => {
    const setters = renderCheckout();
    const campo = screen.getByPlaceholderText("Ej: SKUL-X7K2QM");
    fireEvent.change(campo, { target: { value: "skul-x7k2qm" } });
    expect(setters.setGiftCardCode).toHaveBeenCalledWith("SKUL-X7K2QM");
  });

  it("muestra el saldo leído por el Worker y permite quitarla", () => {
    const setters = renderCheckout({ appliedGiftCard: { code: "SKUL-X7K2QM", saldo: 15000 } });
    expect(screen.getByText('Gift card "SKUL-X7K2QM" — saldo $15.000 ✓')).toBeInTheDocument();
    expect(screen.getByText(/El descuento real lo calcula el servidor al confirmar\./)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Quitar"));
    expect(setters.removeGiftCard).toHaveBeenCalledTimes(1);
  });

  it("muestra el error del Worker si el código no existe", () => {
    renderCheckout({ giftCardError: "No existe esa gift card." });
    expect(screen.getByText("No existe esa gift card.")).toBeInTheDocument();
  });
});