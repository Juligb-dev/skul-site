/**
 * ============================================================
 *  PRUEBAS DE calcularResumenPrecios — el contrato del dinero
 * ============================================================
 *
 *  Esta función es la vista previa que el comprador ve en el checkout, y
 *  es LA MISMA cuenta que hace el Worker al confirmar el pedido. Si acá
 *  y en el Worker se calculara distinto, la pantalla mostraría un precio
 *  y el cliente pagaría otro. Por eso el orden de los descuentos está
 *  pinado acá con números exactos:
 *
 *    1) 10% por efectivo (lo que da un descuento fijo).
 *    2) cupón: si es PORCENTUAL, se calcula sobre la base ya descontada
 *       del 10% de efectivo; si es FIJO, son pesos duros que no se tocan.
 *    3) gift card: sobre lo que SOBRA (nunca suma, nunca paga el envío).
 *    4) envío: se suma al final, fuera de la base de descuentos.
 *
 *  El mismo pin del lado del servidor está en
 *  cloudflare-worker/descuentos.seguridad.test.js: los dos tienen que
 *  dar el mismo número para el mismo carrito.
 * ============================================================
 */
import { describe, it, expect } from "vitest";
import { calcularResumenPrecios } from "./precios.js";

/** Corto para armar carritos de un solo producto. */
const cupon = (overrides = {}) => ({ type: "percent", value: 20, scope: "all", ...overrides });
const gift = (saldo) => ({ saldo });

describe("calcularResumenPrecios — sin descuentos", () => {
  it("subtotal + envío, sin nada más", () => {
    const r = calcularResumenPrecios({ subtotal: 25000, shippingCost: 3000 });
    expect(r).toEqual({ discount: 0, couponDiscount: 0, giftCardDiscount: 0, total: 28000 });
  });

  it("carrito vacío da cero (no NaN ni valores negativos)", () => {
    const r = calcularResumenPrecios({});
    expect(r.total).toBe(0);
    expect(Number.isNaN(r.total)).toBe(false);
  });
});

describe("calcularResumenPrecios — 10% de efectivo", () => {
  it("descuenta el 10% del subtotal (no del envío)", () => {
    const r = calcularResumenPrecios({ subtotal: 25000, paysCash: true, shippingCost: 3000 });
    expect(r.discount).toBe(2500);
    expect(r.total).toBe(25000 - 2500 + 3000);
  });

  it("22.500 redondea a 2.250 (pesos enteros, sin decimales)", () => {
    const r = calcularResumenPrecios({ subtotal: 22500, paysCash: true });
    expect(r.discount).toBe(2250);
    expect(r.total).toBe(20250);
  });

  it("sin efectivo no hay 10% (aunque el subtotal sea grande)", () => {
    const r = calcularResumenPrecios({ subtotal: 100000, paysCash: false });
    expect(r.discount).toBe(0);
    expect(r.total).toBe(100000);
  });
});

describe("calcularResumenPrecios — cupón porcentual (el orden es contrato)", () => {
  it("cupón 20% solo: descuenta el 20% del subtotal", () => {
    const r = calcularResumenPrecios({ subtotal: 25000, appliedCoupon: cupon() });
    expect(r.couponDiscount).toBe(5000);
    expect(r.total).toBe(20000);
  });

  it("efectivo + cupón 20% = 10% y 20% de lo que queda (28%), no 30%", () => {
    //   subtotal 25.000
    //   - efectivo 10% ........ 2.500
    //   - cupón 20% sobre 22.500 = 4.500 (NO 5.000: no se aplica un % a
    //     plata que de todas formas no se paga)
    //   = 18.000
    const r = calcularResumenPrecios({ subtotal: 25000, paysCash: true, appliedCoupon: cupon() });
    expect(r.discount).toBe(2500);
    expect(r.couponDiscount).toBe(4500);
    expect(r.total).toBe(18000);
  });

  it("el cupón nunca descuenta más de su base (no genera saldo a favor)", () => {
    // Cupón "de 200%" contra un carrito chico: lo máximo que puede
    // descontar es la base entera, el total no queda negativo.
    const r = calcularResumenPrecios({
      subtotal: 25000,
      appliedCoupon: cupon({ value: 200 }),
    });
    expect(r.couponDiscount).toBe(25000);
    expect(r.total).toBe(0);
  });

  it("efectivo + cupón de 200%: el tope también es la base (sin efectivo)", () => {
    const r = calcularResumenPrecios({
      subtotal: 25000,
      paysCash: true,
      appliedCoupon: cupon({ value: 200 }),
    });
    // 10% efectivo = 2.500; el cupón ni siquiera llega a su tope real
    // porque la base del % baja con el 10%, pero se corta en la base.
    expect(r.total).toBe(0);
    expect(r.total).toBeGreaterThanOrEqual(0);
  });

  it("si aplica a solo una parte (eligibleSubtotal), el % va sobre esa parte", () => {
    // Carrito de 25.000 donde el cupón solo alcanza a 10.000.
    const r = calcularResumenPrecios({ subtotal: 25000, appliedCoupon: cupon(), eligibleSubtotal: 10000 });
    expect(r.couponDiscount).toBe(2000);
    expect(r.total).toBe(23000);
  });

  it("y esa elección de base interactúa con el efectivo igual que el resto", () => {
    // 10.000 elegibles con el 10% de efectivo ya descontado = 9.000 → 20% = 1.800.
    const r = calcularResumenPrecios({
      subtotal: 25000,
      paysCash: true,
      appliedCoupon: cupon(),
      eligibleSubtotal: 10000,
    });
    expect(r.couponDiscount).toBe(1800);
    expect(r.discount).toBe(2500);
  });
});

describe("calcularResumenPrecios — cupón fijo (pesos duros)", () => {
  it("descuenta exactamente su valor, sin que lo toque el 10% de efectivo", () => {
    const r = calcularResumenPrecios({
      subtotal: 25000,
      paysCash: true,
      appliedCoupon: cupon({ type: "fixed", value: 5000 }),
    });
    expect(r.couponDiscount).toBe(5000);
    expect(r.discount).toBe(2500);
    expect(r.total).toBe(17500);
  });

  it("un fijo más grande que el carrito se recorta al subtotal", () => {
    const r = calcularResumenPrecios({ subtotal: 2000, appliedCoupon: cupon({ type: "fixed", value: 5000 }) });
    expect(r.couponDiscount).toBe(2000);
    expect(r.total).toBe(0);
  });
});

describe("calcularResumenPrecios — gift card", () => {
  it("descuenta el saldo sobre lo que sobra tras efectivo y cupón", () => {
    const r = calcularResumenPrecios({
      subtotal: 25000,
      appliedCoupon: cupon(),
      appliedGiftCard: gift(10000),
    });
    // 25.000 - cupón 5.000 = 20.000; la gift card deja 10.000.
    expect(r.giftCardDiscount).toBe(10000);
    expect(r.total).toBe(10000);
  });

  it("si el saldo es mayor que el total, el total NO queda negativo", () => {
    const r = calcularResumenPrecios({ subtotal: 5000, appliedGiftCard: gift(10000) });
    expect(r.giftCardDiscount).toBe(5000);
    expect(r.total).toBe(0);
  });

  it("la gift card NO paga el envío (envía se suma siempre)", () => {
    const r = calcularResumenPrecios({ subtotal: 5000, appliedGiftCard: gift(10000), shippingCost: 3000 });
    expect(r.giftCardDiscount).toBe(5000);
    expect(r.total).toBe(3000);
  });

  it("sin saldo o sin gift card, descuenta cero", () => {
    expect(calcularResumenPrecios({ subtotal: 5000 }).giftCardDiscount).toBe(0);
    expect(calcularResumenPrecios({ subtotal: 5000, appliedGiftCard: gift(0) }).giftCardDiscount).toBe(0);
    expect(calcularResumenPrecios({ subtotal: 5000, appliedGiftCard: {} }).giftCardDiscount).toBe(0);
  });
});

describe("calcularResumenPrecios — el combo completo, según paga o no en efectivo", () => {
  // Son los dos números que la tienda muestra:
  //   - sin efectivo: 25.000 - 5.000 (cupón) - 10.000 (gift) = 10.000
  //   - con efectivo: 25.000 - 2.500 - 4.500 - 10.000 = 8.000
  it("sin efectivo", () => {
    const r = calcularResumenPrecios({
      subtotal: 25000,
      paysCash: false,
      appliedCoupon: cupon(),
      appliedGiftCard: gift(10000),
    });
    expect(r).toEqual({ discount: 0, couponDiscount: 5000, giftCardDiscount: 10000, total: 10000 });
  });

  it("con efectivo", () => {
    const r = calcularResumenPrecios({
      subtotal: 25000,
      paysCash: true,
      appliedCoupon: cupon(),
      appliedGiftCard: gift(10000),
    });
    expect(r).toEqual({ discount: 2500, couponDiscount: 4500, giftCardDiscount: 10000, total: 8000 });
  });
});