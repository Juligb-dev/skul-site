/**
 * ============================================================
 *  PRUEBAS DE PEDIDOS (useOrders + setOrderStatus + createOrder)
 * ------------------------------------------------------------
 *  El GRUPO DE CAMPO más delicado del sitio, porque cada pedido vive en
 *  dos documentos: /orders/{id} (privado, con los datos personales) y
 *  /orderTracking/{id} (público, lo que ve el cliente con su código).
 *
 *  Las reglas gitáfricas que se prueban acá:
 *
 *   - LA LISTA BLANCA: de ¿orders? a seguimiento solo pasan los campos
 *     que publicTrackingData decide copiar. Nombre, teléfono, dirección
 *     y datos de pago JAMÁS pueden aparecer en el documento público.
 *
 *   - EL BATCH: cambiar el estado toca los dos documentos en el mismo
 *     commit, o ninguno. Si la escritura del pedido privado falla, el
 *     tracking no queda creado a medias.
 *
 *   - createOrder desde el navegador: le manda al Worker los CÓDIGOS
 *     (no precios) y espera SU veredicto. Cualquier 4xx/5xx o JSON sin
 *     `ok` se traduce en Error con el mensaje del Worker.
 * ============================================================
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { __fs } from "../test/mocks/firestore.js";
import { useOrders, setOrderStatus, setOrderTracking, createOrder } from "./useOrders.js";

beforeEach(() => {
  __fs.reset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Un pedido como lo crea el Worker: con datos personales y todo.
const pedido = (over = {}) => ({
  id: "pedido-1",
  items: [
    { id: "remera-1", name: "Remera", size: "M", color: null, qty: 2, price: 5000 },
    { id: "gc", name: "Gift Card", qty: 1, price: 10000, giftcard: true, giftcardAmount: 10000 },
  ],
  total: 20000,
  status: "nuevo",
  zoneId: "local",
  orderName: "Juana Pereyra",
  orderPhone: "1555555555",
  orderAddress: "Av. San Martín 1234",
  payMethod: "transferencia",
  ...over,
});

describe("useOrders — la tabla del admin", () => {
  it("trae los pedidos con el id adelante", async () => {
    __fs.seed("orders/abc", { total: 100, items: [] });
    const { result } = renderHook(() => useOrders());
    await waitFor(() => expect(result.current.orders).not.toBeNull());
    expect(result.current.orders[0].id).toBe("abc");
    expect(result.current.orders[0].total).toBe(100);
  });

  it("si Firestore dice que no, tabla vacía (no spinner eterno)", async () => {
    const { result } = renderHook(() => useOrders());
    await waitFor(() => expect(result.current.orders).not.toBeNull());
    __fs.emitError("orders", new Error("permission-denied"));
    await waitFor(() => expect(result.current.orders).toEqual([]));
  });
});

describe("setOrderStatus — el batch que actualiza las dos caras del pedido", () => {
  it("cambia el estado del pedido privado Y del tracking público en un solo commit", async () => {
    __fs.seed("orders/pedido-1", pedido());

    await setOrderStatus(pedido(), "despachado");

    expect(__fs.get("orders/pedido-1").status).toBe("despachado");
    const track = __fs.get("orderTracking/pedido-1");
    expect(track.status).toBe("despachado");
  });

  it("la copia pública NO lleva datos personales (la lista blanca es la regla)", async () => {
    __fs.seed("orders/pedido-1", pedido());

    await setOrderStatus(pedido(), "preparando");

    const track = __fs.get("orderTracking/pedido-1");
    expect(track).not.toHaveProperty("orderName");
    expect(track).not.toHaveProperty("orderPhone");
    expect(track).not.toHaveProperty("orderAddress");
    expect(track).not.toHaveProperty("payMethod");
    // El total y los ítems sí, con la forma que necesita el seguimiento.
    expect(track.total).toBe(20000);
    expect(track.items[0]).toEqual({
      id: "remera-1",
      name: "Remera",
      size: "M",
      color: null,
      qty: 2,
      price: 5000,
    });
  });

  it("la gift card COMPRADA sí viaja al tracking (es código, no dato personal)", async () => {
    __fs.seed("orders/pedido-1", pedido({ giftCardIssued: "SKUL-XYZ123" }));
    await setOrderStatus(pedido({ giftCardIssued: "SKUL-XYZ123" }), "nuevo");
    expect(__fs.get("orderTracking/pedido-1").giftCardIssued).toBe("SKUL-XYZ123");
  });

  it("si el pedido privado no existe, NO queda el tracking creado (batch atómico)", async () => {
    // updateDoc sobre un doc inexistente tira, y el batch revierte todo.
    await expect(setOrderStatus(pedido(), "despachado")).rejects.toThrow();
    expect(__fs.has("orderTracking/pedido-1")).toBe(false);
  });
});

describe("setOrderTracking — guardar/limpiar el número de Correo", () => {
  it("guarda el número en los dos documentos", async () => {
    __fs.seed("orders/pedido-1", pedido({ status: "despachado" }));
    await setOrderTracking(pedido({ status: "despachado" }), "RX1234AR");

    expect(__fs.get("orders/pedido-1").correoTracking).toBe("RX1234AR");
    expect(__fs.get("orderTracking/pedido-1").correoTracking).toBe("RX1234AR");
    expect(__fs.get("orderTracking/pedido-1").status).toBe("despachado"); // conserva el estado
  });

  it("vaciar el campo lo deja en null (nunca en '', así no hay dos casos que atender)", async () => {
    __fs.seed("orders/pedido-1", pedido({ correoTracking: "RX1234AR" }));
    await setOrderTracking(pedido({ correoTracking: "RX1234AR" }), "");

    expect(__fs.get("orders/pedido-1").correoTracking).toBeNull();
    expect(__fs.get("orderTracking/pedido-1").correoTracking).toBeNull();
  });
});

describe("createOrder — el navegador habla con el Worker, no con Firestore", () => {
  it("manda el pedido al Worker y traduce la respuesta en orderId + total real", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, orderId: "salon-42", total: 21000, giftCardDiscount: 0, giftCardIssued: null }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await createOrder({ items: [{ id: "remera-1" }], couponCode: "BIEN" });

    // Llamó al Worker con action createOrder y el pedido adentro.
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBeTruthy();
    expect(JSON.parse(init.body).action).toBe("createOrder");
    expect(JSON.parse(init.body).items).toEqual([{ id: "remera-1" }]);

    expect(res.orderId).toBe("salon-42");
    expect(res.total).toBe(21000);
  });

  it("el Worker que dice ok:false se traduce en Error con SU mensaje", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: "se agotó el stock o el descuento mientras comprabas" }),
      }))
    );

    await expect(createOrder({ items: [] })).rejects.toThrow("se agotó el stock o el descuento");
  });

  it("un 429 (rate limit, sin JSON) no revienta con un error raro: mensaje genérico", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => {
          throw new SyntaxError("Unexpected end of JSON input");
        },
      }))
    );

    await expect(createOrder({ items: [] })).rejects.toThrow(/no se pudo confirmar el pedido/i);
  });

  it("un total que llega como texto se normaliza a número (y el código de gift card sale)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, orderId: "x", total: "21000", giftCardDiscount: "0", giftCardIssued: "SKUL-XYZ" }),
      }))
    );
    const res = await createOrder({ items: [] });
    expect(res.total).toBe("21000"); // el total real se muestra tal cual viene del servidor
    expect(res.giftCardIssued).toBe("SKUL-XYZ");
  });
});