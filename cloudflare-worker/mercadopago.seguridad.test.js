/**
 * Mercado Pago — integración mínima
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { workerLimpio, pedir, montarFirestore, envDePrueba, PRODUCTO, PEDIDO_BASE } from "./test/helpers/arnes.js";
import { docDePrueba } from "./test/helpers/firestore-falso.js";

let worker;

beforeEach(async () => {
  worker = await workerLimpio();
  montarFirestore({
    "products/prod-1": docDePrueba({ ...PRODUCTO }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Un pedido ya guardado, con su total (lo que el Worker calculó al crearlo). */
const PEDIDO_GUARDADO = {
  orderName: "Ana Perez",
  orderPhone: "1155555555",
  payMethod: "debito",
  status: "nuevo",
  total: 25000,
  items: [{ id: "prod-1", name: "Hoodie Concrete", size: "M", qty: 1, price: 25000 }],
};

/** Pega en el webhook del Worker (por defecto /mp/webhook). */
const pedirWebhook = async (worker, body, { env = {}, headers = {}, method = "POST", url = "https://worker.skul.test/mp/webhook" } = {}) => {
  const req = new Request(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
  const res = await worker.fetch(req, envDePrueba(env));
  const texto = await res.text();
  let json = null;
  try {
    json = JSON.parse(texto);
  } catch {
    /* no todas las respuestas son JSON */
  }
  return { status: res.status, texto, json };
};

/** Firma de MP para el manifiesto "id:...;request-id:...;ts:...;". */
const firma = (secreto, id, requestId, ts) =>
  createHmac("sha256", secreto).update(`id:${id};request-id:${requestId};ts:${ts};`).digest("hex");

describe("createOrder — Mercado Pago", () => {
  it("no devuelve paymentUrl si no hay MP_ACCESS_TOKEN", async () => {
    const { status, json } = await pedir(worker, {
      ...PEDIDO_BASE,
      payMethod: "debito",
    });
    expect(status).toBe(200);
    expect(json.paymentUrl).toBeUndefined();
  });

  it("devuelve paymentUrl cuando paga con tarjeta y hay token", async () => {
    const { status, json } = await pedir(
      worker,
      {
        ...PEDIDO_BASE,
        payMethod: "debito",
      },
      { env: { MP_ACCESS_TOKEN: "test_token" } }
    );
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.orderId).toBeTruthy();
    expect(json.paymentUrl).toBeTruthy();
    expect(json.paymentUrl).toContain("mercadopago");
  });

  it("devuelve paymentUrl también con crédito", async () => {
    const { status, json } = await pedir(
      worker,
      {
        ...PEDIDO_BASE,
        payMethod: "credito",
      },
      { env: { MP_ACCESS_TOKEN: "test_token" } }
    );
    expect(status).toBe(200);
    expect(json.paymentUrl).toBeTruthy();
  });

  it("en modo prueba manda al sandbox_init_point (no al checkout de producción)", async () => {
    // Con credenciales de prueba, MP devuelve las dos urls. Si el sitio
    // redirige al init_point (producción), esa página no conoce la
    // preferencia de prueba y el pago queda muerto. Con MP_MODO_PRUEBA=1
    // tiene que elegir el sandbox.
    const { status, json } = await pedir(
      worker,
      { ...PEDIDO_BASE, payMethod: "debito" },
      { env: { MP_ACCESS_TOKEN: "test_token", MP_MODO_PRUEBA: "1" } }
    );
    expect(status).toBe(200);
    expect(json.paymentUrl).toContain("sandbox.");
  });

  it("sin el flag de modo prueba sigue usando el init_point de producción", async () => {
    const { status, json } = await pedir(
      worker,
      { ...PEDIDO_BASE, payMethod: "debito" },
      { env: { MP_ACCESS_TOKEN: "test_token" } }
    );
    expect(status).toBe(200);
    expect(json.paymentUrl).toContain("www.mercadopago");
    expect(json.paymentUrl).not.toContain("sandbox.");
  });

  it("no devuelve paymentUrl con transferencia (no usa MP)", async () => {
    const { status, json } = await pedir(
      worker,
      {
        ...PEDIDO_BASE,
        payMethod: "transferencia",
      },
      { env: { MP_ACCESS_TOKEN: "test_token" } }
    );
    expect(status).toBe(200);
    expect(json.paymentUrl).toBeUndefined();
  });

  it("no devuelve paymentUrl con efectivo", async () => {
    const { status, json } = await pedir(
      worker,
      {
        ...PEDIDO_BASE,
        payMethod: "efectivo",
      },
      { env: { MP_ACCESS_TOKEN: "test_token" } }
    );
    expect(status).toBe(200);
    expect(json.paymentUrl).toBeUndefined();
  });

  it("le pasa a la preferencia el notification_url del webhook", async () => {
    // Reescribo el Firestore falso para poder mirar las llamadas que salen.
    const { llamadas } = montarFirestore({
      "products/prod-1": docDePrueba({ ...PRODUCTO }),
    });

    const { status } = await pedir(
      worker,
      { ...PEDIDO_BASE, payMethod: "debito" },
      { env: { MP_ACCESS_TOKEN: "test_token" } }
    );
    expect(status).toBe(200);

    const pref = llamadas.find((l) => l.url.includes("/checkout/preferences"));
    expect(pref).toBeTruthy();
    expect(pref.cuerpo.notification_url).toBe("https://worker.skul.test/mp/webhook");
    expect(pref.cuerpo.external_reference).toBeTruthy();
  });

  it("los ítems de la preferencia suman el total e incluyen el envío", async () => {
    // El bug clásico: mandar solo las prendas y que MP cobre sin el flete.
    const { llamadas } = montarFirestore({
      "products/prod-1": docDePrueba({ ...PRODUCTO }),
    });

    const { status, json } = await pedir(
      worker,
      {
        ...PEDIDO_BASE,
        zoneId: "correo",
        orderAddress: "Av Siempreviva 742",
        correoQuote: { type: "domicilio", postalCode: "1425", provinceCode: "C" },
        payMethod: "debito",
      },
      { env: { MP_ACCESS_TOKEN: "test_token" } }
    );
    expect(status).toBe(200);
    // 25.000 de la prenda + 2.500 del envío simulado.
    expect(json.total).toBe(27500);

    const pref = llamadas.find((l) => l.url.includes("/checkout/preferences"));
    const items = pref.cuerpo.items;
    const suma = items.reduce((a, i) => a + i.unit_price * i.quantity, 0);
    // MP cobra la suma de los ítems: tiene que dar EXACTO el total.
    expect(suma).toBe(json.total);
    expect(items.some((i) => i.title === "Envío")).toBe(true);
    // Nunca mandamos precios en 0 ni negativos (MP los rechaza).
    expect(items.every((i) => i.unit_price > 0)).toBe(true);
  });

  it("con cupón, los ítems de la preferencia siguen sumando el total (no cobra de más)", async () => {
    const { llamadas } = montarFirestore({
      "products/prod-1": docDePrueba({ ...PRODUCTO }),
      "coupons/BIEN10": docDePrueba({ active: true, type: "percent", value: 10 }),
    });

    const { status, json } = await pedir(
      worker,
      { ...PEDIDO_BASE, payMethod: "debito", couponCode: "BIEN10" },
      { env: { MP_ACCESS_TOKEN: "test_token" } }
    );
    expect(status).toBe(200);
    // 25.000 menos el 10% del cupón.
    expect(json.total).toBe(22500);

    const pref = llamadas.find((l) => l.url.includes("/checkout/preferences"));
    const items = pref.cuerpo.items;
    const suma = items.reduce((a, i) => a + i.unit_price * i.quantity, 0);
    // El descuento va repartido dentro de las líneas: la suma da el total.
    expect(suma).toBe(json.total);
    expect(items.every((i) => i.unit_price > 0)).toBe(true);
  });
});

describe("webhook de Mercado Pago", () => {
  const pagoAprobado = (extra = {}) => ({
    id: 123,
    status: "approved",
    transaction_amount: 25000,
    external_reference: "ORD1",
    ...extra,
  });

  it("marca el pedido como pagado con un pago aprobado por el total", async () => {
    const { fs } = montarFirestore(
      { "orders/ORD1": docDePrueba({ ...PEDIDO_GUARDADO }) },
      { mpPagos: { "123": pagoAprobado() } }
    );

    const { status } = await pedirWebhook(
      worker,
      { type: "payment", data: { id: "123" } },
      { env: { MP_ACCESS_TOKEN: "tok" } }
    );

    expect(status).toBe(200);
    const pedido = fs.docs.get("orders/ORD1").data;
    expect(pedido.paymentStatus).toBe("paid");
    expect(pedido.mpPaymentId).toBe("123");
    expect(pedido.paidAmount).toBe(25000);
    // La copia pública también refleja el pago.
    expect(fs.docs.get("orderTracking/ORD1").data.paymentStatus).toBe("paid");
  });

  it("NO marca pagado si el monto es menor al total (queda para revisar)", async () => {
    const { fs } = montarFirestore(
      { "orders/ORD1": docDePrueba({ ...PEDIDO_GUARDADO }) },
      { mpPagos: { "123": pagoAprobado({ transaction_amount: 10000 }) } }
    );

    const { status } = await pedirWebhook(
      worker,
      { type: "payment", data: { id: "123" } },
      { env: { MP_ACCESS_TOKEN: "tok" } }
    );

    expect(status).toBe(200);
    expect(fs.docs.get("orders/ORD1").data.paymentStatus).toBe("underpaid");
    expect(fs.docs.has("orderTracking/ORD1")).toBe(false);
  });

  it("anota un pago pendiente como pendiente, no como pagado", async () => {
    const { fs } = montarFirestore(
      { "orders/ORD1": docDePrueba({ ...PEDIDO_GUARDADO }) },
      { mpPagos: { "123": pagoAprobado({ status: "in_process" }) } }
    );

    await pedirWebhook(worker, { type: "payment", data: { id: "123" } }, { env: { MP_ACCESS_TOKEN: "tok" } });

    expect(fs.docs.get("orders/ORD1").data.paymentStatus).toBe("pending");
  });

  it("ignora avisos que no son de pago", async () => {
    const { fs } = montarFirestore({ "orders/ORD1": docDePrueba({ ...PEDIDO_GUARDADO }) }, { mpPagos: {} });

    const { status } = await pedirWebhook(
      worker,
      { type: "merchant_order", data: { id: "123" } },
      { env: { MP_ACCESS_TOKEN: "tok" } }
    );

    expect(status).toBe(200);
    expect(fs.docs.get("orders/ORD1").data.paymentStatus).toBeUndefined();
  });

  it("con firma inválida igual procesa: la decisión sale de releer MP (red de seguridad)", async () => {
    const { fs } = montarFirestore(
      { "orders/ORD1": docDePrueba({ ...PEDIDO_GUARDADO }) },
      { mpPagos: { "123": pagoAprobado() } }
    );

    const { status } = await pedirWebhook(
      worker,
      { type: "payment", data: { id: "123" } },
      { env: { MP_ACCESS_TOKEN: "tok", MP_WEBHOOK_SECRET: "s3cr3t0" }, headers: { "x-signature": "ts=1,v1=deadbeef" } }
    );

    expect(status).toBe(200);
    expect(fs.docs.get("orders/ORD1").data.paymentStatus).toBe("paid");
  });

  it("con MP_WEBHOOK_FIRMA_ESTRICTA=1 descarta el aviso de firma inválida", async () => {
    const { fs } = montarFirestore(
      { "orders/ORD1": docDePrueba({ ...PEDIDO_GUARDADO }) },
      { mpPagos: { "123": pagoAprobado() } }
    );

    const { status } = await pedirWebhook(
      worker,
      { type: "payment", data: { id: "123" } },
      {
        env: { MP_ACCESS_TOKEN: "tok", MP_WEBHOOK_SECRET: "s3cr3t0", MP_WEBHOOK_FIRMA_ESTRICTA: "1" },
        headers: { "x-signature": "ts=1,v1=deadbeef" },
      }
    );

    expect(status).toBe(401);
    expect(fs.docs.get("orders/ORD1").data.paymentStatus).toBeUndefined();
  });

  it("acepta el aviso con firma válida", async () => {
    const { fs } = montarFirestore(
      { "orders/ORD1": docDePrueba({ ...PEDIDO_GUARDADO }) },
      { mpPagos: { "123": pagoAprobado() } }
    );

    const ts = "1700000000";
    const requestId = "req-1";
    const { status } = await pedirWebhook(
      worker,
      { type: "payment", data: { id: "123" } },
      {
        env: { MP_ACCESS_TOKEN: "tok", MP_WEBHOOK_SECRET: "s3cr3t0" },
        headers: { "x-request-id": requestId, "x-signature": `ts=${ts},v1=${firma("s3cr3t0", "123", requestId, ts)}` },
      }
    );

    expect(status).toBe(200);
    expect(fs.docs.get("orders/ORD1").data.paymentStatus).toBe("paid");
  });

  it("acepta la firma si coincide con el secreto de prueba (MP firma distinto según el modo)", async () => {
    const { fs } = montarFirestore(
      { "orders/ORD1": docDePrueba({ ...PEDIDO_GUARDADO }) },
      { mpPagos: { "123": pagoAprobado() } }
    );

    const requestId = "req-prueba";
    const ts = "1";
    const { status } = await pedirWebhook(
      worker,
      { type: "payment", data: { id: "123" } },
      {
        env: { MP_ACCESS_TOKEN: "tok", MP_WEBHOOK_SECRET: "produccion", MP_WEBHOOK_SECRET_PRUEBA: "prueba" },
        headers: { "x-request-id": requestId, "x-signature": `ts=${ts},v1=${firma("prueba", "123", requestId, ts)}` },
      }
    );

    expect(status).toBe(200);
    expect(fs.docs.get("orders/ORD1").data.paymentStatus).toBe("paid");
  });

  it("si la firma no coincide con ninguno de los secretos, igual procesa (red de seguridad)", async () => {
    const { fs } = montarFirestore(
      { "orders/ORD1": docDePrueba({ ...PEDIDO_GUARDADO }) },
      { mpPagos: { "123": pagoAprobado() } }
    );

    const requestId = "req-x";
    const ts = "1";
    const { status } = await pedirWebhook(
      worker,
      { type: "payment", data: { id: "123" } },
      {
        env: { MP_ACCESS_TOKEN: "tok", MP_WEBHOOK_SECRET: "produccion", MP_WEBHOOK_SECRET_PRUEBA: "prueba" },
        headers: { "x-request-id": requestId, "x-signature": `ts=${ts},v1=${firma("otro", "123", requestId, ts)}` },
      }
    );

    expect(status).toBe(200);
    expect(fs.docs.get("orders/ORD1").data.paymentStatus).toBe("paid");
  });

  it("es idempotente: no vuelve a escribir si MP reintenta el mismo aviso", async () => {
    const { fs } = montarFirestore(
      {
        "orders/ORD1": docDePrueba({
          ...PEDIDO_GUARDADO,
          paymentStatus: "paid",
          mpPaymentId: "123",
          paidAmount: 25000,
        }),
      },
      { mpPagos: { "123": pagoAprobado() } }
    );

    const { status } = await pedirWebhook(
      worker,
      { type: "payment", data: { id: "123" } },
      { env: { MP_ACCESS_TOKEN: "tok" } }
    );

    expect(status).toBe(200);
    expect(fs.commits).toHaveLength(0);
  });

  it("sin MP_ACCESS_TOKEN no toca el pedido", async () => {
    const { fs } = montarFirestore({ "orders/ORD1": docDePrueba({ ...PEDIDO_GUARDADO }) }, { mpPagos: {} });

    const { status } = await pedirWebhook(worker, { type: "payment", data: { id: "123" } }, { env: {} });

    expect(status).toBe(200);
    expect(fs.docs.get("orders/ORD1").data.paymentStatus).toBeUndefined();
  });

  it("acepta el IPN viejo (GET con la query)", async () => {
    const { fs } = montarFirestore(
      { "orders/ORD1": docDePrueba({ ...PEDIDO_GUARDADO }) },
      { mpPagos: { "123": pagoAprobado() } }
    );

    const { status } = await pedirWebhook(
      worker,
      null,
      { env: { MP_ACCESS_TOKEN: "tok" }, method: "GET", url: "https://worker.skul.test/mp/webhook?type=payment&data.id=123" }
    );

    expect(status).toBe(200);
    expect(fs.docs.get("orders/ORD1").data.paymentStatus).toBe("paid");
  });
});

