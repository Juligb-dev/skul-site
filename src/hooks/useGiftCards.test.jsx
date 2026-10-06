/**
 * ============================================================
 *  PRUEBAS DE GIFT CARDS — el código con saldo
 * ------------------------------------------------------------
 *  Desde el navegador las gift cards SOLO se leen (el descuento real lo
 *  hace el Worker en el commit del pedido). Acá se prueba la parte que
 *  sí le toca al navegador:
 *
 *   - La validación de formato antes de preguntarle a Firestore (un get
 *     con un código basura es una lectura inútil).
 *   - Los motivos de rechazo SIEMPRE en castellano (son los que ve el
 *     checkout abajo del campo).
 *   - El saldo = balance - usedAmount, con el `<= 0` cerrando la puerta.
 *   - La vigencia: createdAt + 6 meses; sin fecha o fecha rota = vencida.
 *   - Que EDITAR una gift card no resetee ni el saldo usado ni la fecha
 *     (de eso dependen los 6 meses).
 *   - El ítem de carrito "falso" que se compra junto con el pedido.
 * ============================================================
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { __fs, FakeTimestamp } from "../test/mocks/firestore.js";
import {
  checkGiftCard,
  saveGiftCard,
  createGiftCard,
  deleteGiftCard,
  useGiftCards,
  giftCardCarritoItem,
} from "./useGiftCards.js";

beforeEach(() => {
  __fs.reset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Una gift card que el checkout acepta (activa, con saldo y sin vencer). */
const activa = (over = {}) => ({
  balance: 10000,
  usedAmount: 1000,
  active: true,
  // Sin este default, venceGiftCard(undefined) se trata como vencida.
  createdAt: new FakeTimestamp(Date.now() - 1000 * 60 * 60),
  ...over,
});

describe("giftCardCarritoItem — el ítem de carrito 'falso'", () => {
  it("arma un ítem con la forma de una prenda y la bandera giftcard", () => {
    const item = giftCardCarritoItem(15000);
    expect(item.giftcard).toBe(true);
    expect(item.giftcardAmount).toBe(15000);
    expect(item.price).toBe(15000);
    expect(item.id).toBeTruthy(); // GIFT_CARD_ITEM_ID de config
    expect(item.qty).toBe(1);
    expect(item.maxQty).toBe(1); // una por pedido
    expect(item.key).toContain("15000");
  });

  it("permite cambiar el nombre de la tarjeta", () => {
    const item = giftCardCarritoItem(10000, { nombre: "Gift propia" });
    expect(item.name).toBe("Gift propia");
  });

  it("convierte el monto a número (viene de un input en texto)", () => {
    const item = giftCardCarritoItem("8000");
    expect(item.price).toBe(8000);
    expect(item.giftcardAmount).toBe(8000);
  });
});

describe("checkGiftCard — el chequeo del checkout (solo lectura)", () => {
  it("acepta una gift card válida y devuelve su saldo", async () => {
    __fs.seed("giftCards/SKUL-X7K2QM", activa());
    const res = await checkGiftCard("SKUL-X7K2QM");
    expect(res.ok).toBe(true);
    expect(res.giftCard.code).toBe("SKUL-X7K2QM");
    expect(res.giftCard.saldo).toBe(9000); // balance 10000 - usedAmount 1000
    expect(res.giftCard.vence).toBeInstanceOf(Date);
  });

  it("normaliza el código: minúsculas y guiones raros", async () => {
    __fs.seed("giftCards/SKUL-X7K2QM", activa());
    for (const escrito of ["SKUL-X7K2QM", "skul-x7k2qm", "  SKUL-X7K2QM ", "SKULX7K2QM"]) {
      const res = await checkGiftCard(escrito);
      expect(res.ok, `escrito como "${escrito}"`).toBe(true);
    }
  });

  it("un formato inválido se corta ANTES de tocar Firestore", async () => {
    const res = await checkGiftCard("hola");
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("formato SKUL-XXXXXX");
    // La caja quedó vacía: nunca se preguntó por "hola".
    expect(__fs.get("giftCards/hola")).toBeNull();
  });

  it.each([
    [activa({ active: false }), "dada de baja"],
    [activa({ balance: 0 }), "no tiene saldo"],
    [activa({ usedAmount: 10000 }), "no tiene saldo"],
    [activa({ createdAt: new FakeTimestamp(Date.now() - 1000 * 60 * 60 * 24 * 200) }), "venció"],
  ])("motivos de rechazo en castellano", async (doc, esperado) => {
    __fs.seed("giftCards/SKUL-X7K2QM", doc);
    const res = await checkGiftCard("SKUL-X7K2QM");
    expect(res.ok).toBe(false);
    expect(res.reason).toContain(esperado);
  });

  it("sin fecha de creación se trata como vencida (nunca a favor del cliente)", async () => {
    __fs.seed("giftCards/SKUL-X7K2QM", activa({ createdAt: null }));
    const res = await checkGiftCard("SKUL-X7K2QM");
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("venció");
  });

  it("un código inexistente devuelve motivo (no revienta)", async () => {
    const res = await checkGiftCard("SKUL-XXXXXX");
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/No existe/i);
  });

  it("si Firestore falla, devuelve motivo de 'no pudimos comprobar'", async () => {
    __fs.seed("giftCards/SKUL-X7K2QM", activa());
    __fs.fail("giftCards/SKUL-X7K2QM", Object.assign(new Error("offline"), { code: "unavailable" }));
    const res = await checkGiftCard("SKUL-X7K2QM");
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/no pudimos comprobar/i);
  });
});

describe("saveGiftCard — emitir y corregir saldos", () => {
  it("una gift card NUEVA arranca en 0 de uso y con fecha del servidor", async () => {
    await saveGiftCard("SKUL-NUEVA", { balance: 5000, active: true });
    const doc = __fs.get("giftCards/SKUL-NUEVA");
    expect(doc.balance).toBe(5000);
    expect(doc.usedAmount).toBe(0);
    expect(doc.active).toBe(true);
    expect(doc.createdAt).toBeTruthy();
  });

  it("normaliza el código al guardar", async () => {
    await saveGiftCard("  skul-nueva ", { balance: 1000, active: true });
    expect(__fs.has("giftCards/SKUL-NUEVA")).toBe(true);
  });

  it("EDITAR no resetea el saldo usado ni la fecha (de ahí salen los 6 meses)", async () => {
    __fs.seed("giftCards/SKUL-EDIT", { balance: 10000, usedAmount: 4000, active: true, createdAt: "marzo" });
    await saveGiftCard("SKUL-EDIT", { balance: 15000, active: false });

    const doc = __fs.get("giftCards/SKUL-EDIT");
    expect(doc.balance).toBe(15000);
    expect(doc.usedAmount).toBe(4000);
    expect(doc.active).toBe(false);
    expect(doc.createdAt).toBe("marzo");
  });

  it("un saldo negativo no se guarda (rompería toda lectura posterior)", async () => {
    await saveGiftCard("SKUL-NEG", { balance: -500, active: true });
    expect(__fs.get("giftCards/SKUL-NEG").balance).toBe(0);
  });

  it("convierte el saldo que viene en texto a número", async () => {
    await saveGiftCard("SKUL-STR", { balance: "7500", active: true });
    expect(__fs.get("giftCards/SKUL-STR").balance).toBe(7500);
  });
});

describe("createGiftCard", () => {
  it("genera un código nuevo, lo guarda y lo devuelve", async () => {
    const code = await createGiftCard({ balance: 10000 });
    expect(__fs.has(`giftCards/${code}`)).toBe(true);
    expect(__fs.get(`giftCards/${code}`).balance).toBe(10000);
  });
});

describe("deleteGiftCard", () => {
  it("borra la gift card completa (con saldo e historial)", async () => {
    __fs.seed("giftCards/SKUL-BORRAR", { balance: 1000 });
    await deleteGiftCard("skul-borrar");
    expect(__fs.has("giftCards/SKUL-BORRAR")).toBe(false);
  });
});

describe("useGiftCards — la tabla del admin", () => {
  it("trae la lista ordenada por código", async () => {
    __fs.seed("giftCards/SKUL-B", { balance: 1000, active: true });
    __fs.seed("giftCards/SKUL-A", { balance: 2000, active: true });
    const { result } = renderHook(() => useGiftCards());
    await waitFor(() => expect(result.current.giftCards).not.toBeNull());
    expect(result.current.giftCards.map((g) => g.code)).toEqual(["SKUL-A", "SKUL-B"]);
  });

  it("empieza cargando (null) y después trae la lista", async () => {
    __fs.seed("giftCards/SKUL-SOLA", activa());
    const { result } = renderHook(() => useGiftCards());
    await waitFor(() => expect(result.current.giftCards).not.toBeNull());
    expect(result.current.giftCards).toHaveLength(1);
  });

  it("se actualiza sola cuando se crea una gift card (sin recargar)", async () => {
    const { result } = renderHook(() => useGiftCards());
    await waitFor(() => expect(result.current.giftCards).toEqual([]));

    await saveGiftCard("SKUL-NUEVA", { balance: 3000, active: true });
    await waitFor(() => expect(result.current.giftCards).toHaveLength(1));
    expect(result.current.giftCards[0].code).toBe("SKUL-NUEVA");
    expect(result.current.giftCards[0].balance).toBe(3000);
  });

  it("si Firestore dice que no, tabla vacía (no spinner eterno)", async () => {
    const { result } = renderHook(() => useGiftCards());
    await waitFor(() => expect(result.current.giftCards).not.toBeNull());
    __fs.emitError("giftCards", new Error("permission-denied"));
    await waitFor(() => expect(result.current.giftCards).toEqual([]));
  });
});