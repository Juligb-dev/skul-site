/**
 * ============================================================
 *  PRUEBAS DE SEGURIDAD — cupones y gift cards
 * ------------------------------------------------------------
 *  Los dos son "dinero que el cliente dice que tiene". El Worker no se
 *  fía de nada: los dos se vuelven a leer del documento de Firestore y
 *  se recalculan. Estos tests atacan justamente esa parte.
 *
 *  Ataques que se prueban:
 *   - Usar un cupón apagado, agotado, o que no existe.
 *   - Mandar el descuento ya calculado en vez del código.
 *   - Usar la misma gift card dos veces en el mismo pedido.
 *   - Usar una gift card dada de baja, vencida o sin saldo.
 *   - Comprar una gift card por 1 peso.
 *   - Que el saldo nunca quede negativo después de un pedido.
 * ============================================================
 */
import { describe, it, expect, beforeEach } from "vitest";
import { workerLimpio, pedir, montarFirestore, PRODUCTO, PEDIDO_BASE } from "./test/helpers/arnes.js";
import { docDePrueba, decodeFields } from "./test/helpers/firestore-falso.js";

const HOY = new Date("2026-06-01T12:00:00Z");

let worker;
let fs;

const conCupon = (extra = {}) => ({
  action: "createOrder",
  orderName: "Ana Perez",
  orderPhone: "1155555555",
  zoneId: "local",
  payMethod: "debito",
  items: [{ id: "prod-1", size: "M", qty: 1 }],
  ...extra,
});

beforeEach(async () => {
  worker = await workerLimpio();
  ({ fs } = montarFirestore({
    "products/prod-1": docDePrueba({ ...PRODUCTO }),
    // Un producto de otra categoría, para probar el alcance del cupón.
    "products/prod-remera": docDePrueba({ name: "Remera", cat: "remeras", price: 10000 }),
    "coupons/BIENVENIDA": docDePrueba({
      type: "percent",
      value: 20,
      active: true,
      scope: "all",
      usedCount: 0,
      maxUses: 3,
    }),
    "coupons/APAGADO": docDePrueba({ type: "percent", value: 90, active: false, scope: "all" }),
    "coupons/AGOTADO": docDePrueba({ type: "percent", value: 20, active: true, usedCount: 3, maxUses: 3 }),
    "coupons/SOLO_REMERAS": docDePrueba({
      type: "fixed",
      value: 5000,
      active: true,
      scope: "category",
      scopeCategory: "remeras",
    }),
    "coupons/UN_PRODUCTO": docDePrueba({
      type: "fixed",
      value: 5000,
      active: true,
      scope: "products",
      scopeProductIds: ["prod-remera"],
    }),
    "coupons/FIJO": docDePrueba({ type: "fixed", value: 5000, active: true, scope: "all" }),
    "coupons/PORCIENTO_ENORM": docDePrueba({ type: "percent", value: 500, active: true, scope: "all" }),
    "giftCards/SKUL-ABC123": docDePrueba({
      balance: 10000,
      usedAmount: 0,
      active: true,
      createdAt: HOY,
    }),
    "giftCards/SKUL-VENCID": docDePrueba({ balance: 50000, usedAmount: 0, active: true, createdAt: "2020-01-01T00:00:00Z" }),
    "giftCards/SKUL-APAGAD": docDePrueba({ balance: 50000, usedAmount: 0, active: false, createdAt: HOY }),
    "giftCards/SKUL-SINSAL": docDePrueba({ balance: 1000, usedAmount: 1000, active: true, createdAt: HOY }),
  }));
});

/* -------------------------------------------------------------- */
describe("Cupones — el descuento lo recalcula el Worker", () => {
  it("aplica el 20% de BIENVENIDA sobre el precio del catálogo", async () => {
    const { json } = await pedir(worker, conCupon({ couponCode: "BIENVENIDA" }));
    // 25.000 - 20% = 20.000.
    expect(json.total).toBe(20000);
  });

  it("acepta el cupón en minúsculas (el código es un ID, no un dato sensible)", async () => {
    const { json } = await pedir(worker, conCupon({ couponCode: "bienvenida" }));
    expect(json.total).toBe(20000);
  });

  it("IGNORA el cupón y el descuento que manda el cliente", async () => {
    const { json } = await pedir(
      worker,
      conCupon({ couponCode: "BIENVENIDA", couponDiscount: 999999, total: 1, subtotal: 1 })
    );
    expect(json.total).toBe(20000);
  });

  it("rechaza un cupón apagado ( aunque el cliente mande el descuento hecho)", async () => {
    const { status, json } = await pedir(
      worker,
      conCupon({ couponCode: "APAGADO", couponDiscount: 999999 })
    );
    expect(status).toBe(400);
    expect(json.error).toMatch(/activo/);
    expect(fs.commits).toHaveLength(0);
  });

  it("rechaza un cupón que llegó al límite de usos", async () => {
    const { status, json } = await pedir(worker, conCupon({ couponCode: "AGOTADO" }));
    expect(status).toBe(409);
    expect(json.error).toMatch(/límite/);
  });

  it("rechaza un cupón que no existe (sin inventar discounts)", async () => {
    const { status } = await pedir(worker, conCupon({ couponCode: "NOEXISTE" }));
    expect(status).toBe(400);
  });

  it("un cupón de categoría no se aplica a otra categoría", async () => {
    const { json } = await pedir(worker, conCupon({ couponCode: "SOLO_REMERAS" }));
    // Es un cupón fijo de $5.000 solo para remeras, y el carrito tiene una
    // hoodie: no descuenta nada.
    expect(json.total).toBe(25000);
  });

  it("un cupón de categoría SÍ se aplica a esa categoría", async () => {
    const { json } = await pedir(
      worker,
      conCupon({ couponCode: "SOLO_REMERAS", items: [{ id: "prod-remera", size: "M", qty: 1 }] })
    );
    expect(json.total).toBe(5000);
  });

  it("un cupón por producto no se aplica a otro producto", async () => {
    const { json } = await pedir(worker, conCupon({ couponCode: "UN_PRODUCTO" }));
    expect(json.total).toBe(25000);
  });

  it("un cupón fijo nunca deja el total negativo", async () => {
    const { json } = await pedir(
      worker,
      conCupon({ couponCode: "FIJO", items: [{ id: "prod-remera", size: "M", qty: 1 }] })
    );
    // 10.000 - 5.000 = 5.000, nunca -5.000 ni 0.
    expect(json.total).toBe(5000);
    expect(json.total).toBeGreaterThanOrEqual(0);
  });

  it("un porcentaje absurdo se acota al total (no genera plata)", async () => {
    const { json } = await pedir(worker, conCupon({ couponCode: "PORCIENTO_ENORM" }));
    // value: 500% sobre 25.000 daría -100.000: tiene que quedar en 0.
    expect(json.total).toBe(0);
  });

  it("el descuento de un cupón fijo se aplica UNA vez, no por prenda", async () => {
    const { json } = await pedir(
      worker,
      conCupon({ couponCode: "FIJO", items: [{ id: "prod-remera", size: "M", qty: 3 }] })
    );
    // 3 remeras de 10.000 = 30.000, menos 5.000 UNA vez = 25.000.
    // Si se descontara por línea serían 15.000.
    expect(json.total).toBe(25000);
  });

  it("el cupón se.normaliza a mayúsculas antes de buscar el documento", async () => {
    await pedir(worker, conCupon({ couponCode: "  bienvenida  " }));
    expect(fs.lecturas).toContain("coupons/BIENVENIDA");
  });

  it.each([
    ["../../settings/site", "traversal hacia otra colección"],
    ["BIENVENIDA' or '1'='1", "inyección de comillas"],
    ["A".repeat(30), "código demasiado largo"],
    ["", "código vacío"],
  ])("un código de cupón sospechoso (%s) no rompe nada", async (codigo) => {
    const { status } = await pedir(worker, conCupon({ couponCode: codigo }));
    // Vacío = no hay cupón (200). Los demás o se rechazan o no existen.
    if (codigo === "") {
      expect(status).toBe(200);
    } else {
      expect([400, 409]).toContain(status);
    }
    // Lo que nunca puede pasar: que se lea o escriba algo fuera de
    // coupons/.
    for (const lectura of fs.lecturas) expect(lectura).toMatch(/^(products|coupons|giftCards)\//);
  });

  it("el contador de usos se sube en el MISMO commit que el pedido", async () => {
    await pedir(worker, conCupon({ couponCode: "BIENVENIDA" }));
    const escrituras = escriturasDelCommit();
    const cupon = escrituras.find((e) => e.coleccion === "coupons");
    expect(cupon).toBeTruthy();
    expect(cupon.campos.usedCount).toBe(1);
    // Y el pedido está en el mismo commit: si el commit se aborta, el
    // cupón tampoco se gasta.
    expect(escrituras.some((e) => e.coleccion === "orders")).toBe(true);
  });

  it("el commit del cupón lleva la marca de tiempo del documento (evita el uso doble)", async () => {
    await pedir(worker, conCupon({ couponCode: "BIENVENIDA" }));
    const cupon = escriturasDelCommit().find((e) => e.coleccion === "coupons");
    // Sin este currentDocument, dos personas podrían usar el último uso
    // del cupón al mismo tiempo.
    expect(cupon.currentDocument).toBeTruthy();
    expect(cupon.updateMask).toEqual(["usedCount"]);
  });
});

/* -------------------------------------------------------------- */
describe("Gift cards — el saldo lo descuenta el Worker", () => {
  it("descuenta hasta el saldo disponible", async () => {
    const { json } = await pedir(worker, conCupon({ giftCardCode: "SKUL-ABC123" }));
    // Saldo 10.000 sobre un total de 25.000: total 15.000.
    expect(json.giftCardDiscount).toBe(10000);
    expect(json.total).toBe(15000);
  });

  it("acepta el código escrito con espacio y minúsculas, reponiendo el guion", async () => {
    const { status, json } = await pedir(worker, conCupon({ giftCardCode: "skul abc123" }));
    // Antes del fix, el Worker borraba los espacios pero NO reponía el
    // guion: "skul abc123" → "SKULABC123" y el checkeo buscaba ese ID
    // inexistente, así que un cliente que había tipeado un código REAL lo
    // veía rechazado (mientras que el checkout lo aceptaba). Ahora el
    // Worker normaliza IGUAL que el frontend: mismo código, mismo veredicto.
    expect(status).toBe(200);
    expect(json.giftCardDiscount).toBe(10000);
    expect(json.total).toBe(15000);
  });

  it("acepta el código pegado, sin espacios y sin guion (SKULABC123)", async () => {
    const { status, json } = await pedir(worker, conCupon({ giftCardCode: "SKULABC123" }));
    expect(status).toBe(200);
    expect(json.total).toBe(15000);
  });

  it("sigue rechazando con código de otra longitud o que no sea gift card", async () => {
    // "SKUL" sin sufijo / "SKULA-BC123" con el guion corrido: estar en el
    // rango de "parece una gift card" no alcanza para que el Worker lo
    // acepte; el documento simplemente no existe.
    const { status } = await pedir(worker, conCupon({ giftCardCode: "SKUL-ABC12" }));
    expect(status).toBe(400);
  });

  it("rechaza una gift card que no existe", async () => {
    const { status, json } = await pedir(worker, conCupon({ giftCardCode: "SKUL-ZZZZZZ" }));
    expect(status).toBe(400);
    expect(json.error).toMatch(/no existe/);
  });

  it("rechaza una gift card dada de baja", async () => {
    const { status, json } = await pedir(worker, conCupon({ giftCardCode: "SKUL-APAGAD" }));
    expect(status).toBe(400);
    expect(json.error).toMatch(/baja/);
  });

  it("rechaza una gift card vencida (más de 6 meses)", async () => {
    const { status, json } = await pedir(worker, conCupon({ giftCardCode: "SKUL-VENCID" }));
    expect(status).toBe(400);
    expect(json.error).toMatch(/venció/);
  });

  it("rechaza una gift card sin saldo", async () => {
    const { status, json } = await pedir(worker, conCupon({ giftCardCode: "SKUL-SINSAL" }));
    expect(status).toBe(400);
    expect(json.error).toMatch(/saldo/);
  });

  it("NO alcanza para pagar el envío (la gift card no cubre el flete)", async () => {
    // Es la regla del negocio: el saldo descuenta prendas, no envío.
    const { json } = await pedir(
      worker,
      conCupon({
        giftCardCode: "SKUL-ABC123",
        zoneId: "correo",
        orderAddress: "Av Siempreviva 742",
        correoQuote: { type: "domicilio", postalCode: "1425", provinceCode: "C" },
      })
    );
    // 25.000 - 10.000 de saldo = 15.000 de prendas, más 2.500 de envío.
    expect(json.total).toBe(17500);
  });

  it("el saldo descontado se escribe en el MISMO commit que el pedido", async () => {
    await pedir(worker, conCupon({ giftCardCode: "SKUL-ABC123" }));
    const gift = escriturasDelCommit().find((e) => e.coleccion === "giftCards");
    expect(gift).toBeTruthy();
    expect(gift.campos.usedAmount).toBe(10000);
    expect(gift.updateMask).toEqual(["usedAmount"]);
    // Que lleve la marca de tiempo: si otra persona gastó de la misma
    // gift card en el medio, el commit entero se aborta.
    expect(gift.currentDocument).toBeTruthy();
  });

  it("no guarda el saldo si el commit falla (todo o nada)", async () => {
    fs.fallaCommit = { status: 500, mensaje: "Firestore caído" };
    const { status } = await pedir(worker, conCupon({ giftCardCode: "SKUL-ABC123" }));
    expect(status).toBe(503);
    // El falso de Firestore revierte todo el commit, igual que el real.
    expect(fs.docs.get("giftCards/SKUL-ABC123").data.usedAmount).toBe(0);
  });

  it("rechaza un código de gift card con formato inválido antes de tocar la base", async () => {
    const { status } = await pedir(worker, conCupon({ giftCardCode: "../../coupons/BIENVENIDA" }));
    expect(status).toBe(400);
    expect(fs.lecturas.filter((l) => l.startsWith("giftCards/"))).toHaveLength(0);
  });
});

/* -------------------------------------------------------------- */
describe("Gift cards — comprar una gift card", () => {
  const comprarGiftCard = (amount, extra = {}) =>
    conCupon({
      items: [{ id: "giftcard", qty: 1, amount }],
      ...extra,
    });

  it("crea la gift card con el monto pagado y la marca activa", async () => {
    const { json } = await pedir(worker, comprarGiftCard(20000));
    expect(json.giftCardIssued).toMatch(/^SKUL-[A-Z0-9]{6}$/);

    const creada = escriturasDelCommit().find((e) => e.coleccion === "giftCards");
    expect(creada.campos.balance).toBe(20000);
    expect(creada.campos.usedAmount).toBe(0);
    expect(creada.campos.active).toBe(true);
  });

  it("el total es el monto de la gift card (más el envío si hay)", async () => {
    const { json } = await pedir(worker, comprarGiftCard(20000));
    expect(json.total).toBe(20000);
  });

  it("acepta los tres nombres de campo que manda el checkout", async () => {
    // El checkout manda `amount`; los otros dos son alternativas que el
    // Worker acepta como compatibilidad.
    const { status } = await pedir(
      worker,
      conCupon({ items: [{ id: "giftcard", qty: 1, giftcardAmount: 15000 }] })
    );
    expect(status).toBe(200);
  });

  it.each([
    [0, "monto cero"],
    [999, "por debajo del mínimo"],
    [100001, "por encima del máximo"],
    [1500.5, "con centavos"],
    [-5000, "monto negativo"],
  ])("rechaza comprar una gift card de %s (%s)", async (amount) => {
    const { status } = await pedir(worker, comprarGiftCard(amount));
    expect(status).toBe(400);
    expect(fs.commits).toHaveLength(0);
  });

  it("no se puede comprar más de una gift card por pedido", async () => {
    const { status, json } = await pedir(
      worker,
      conCupon({
        items: [
          { id: "giftcard", qty: 1, amount: 10000 },
          { id: "giftcard", qty: 1, amount: 10000 },
        ],
      })
    );
    expect(status).toBe(400);
    expect(json.error).toMatch(/una gift card/);
  });

  it("no se puede comprar 2 gift cards con qty 2", async () => {
    const { status } = await pedir(
      worker,
      conCupon({ items: [{ id: "giftcard", qty: 2, amount: 10000 }] })
    );
    expect(status).toBe(400);
  });

  it("la gift card comprada NO lleva datos del comprador", async () => {
    await pedir(worker, comprarGiftCard(20000, { orderName: "Ana Perez", orderAddress: "Av X 123" }));
    const creada = escriturasDelCommit().find((e) => e.coleccion === "giftCards");
    // /giftcards tiene lectura pública por código: cualquier nota con
    // datos personales quedaría a la vista de quien tuviera el código.
    const campos = Object.keys(creada.campos);
    for (const prohibido of ["orderName", "orderAddress", "orderPhone", "email", "nombre"]) {
      expect(campos).not.toContain(prohibido);
    }
  });

  it("no guarda el nombre del comprador en la gift card recién emitida", async () => {
    await pedir(worker, comprarGiftCard(20000, { orderName: "Ana Perez" }));
    const creada = escriturasDelCommit().find((e) => e.coleccion === "giftCards");
    expect(JSON.stringify(creada.campos)).not.toContain("Ana");
  });
});

/* -------------------------------------------------------------- */
describe("Descuento encadenado — cupón y gift card juntos", () => {
  it("la gift card se aplica DESPUÉS del cupón (no sobre el subtotal entero)", async () => {
    const { json } = await pedir(
      worker,
      conCupon({ couponCode: "BIENVENIDA", giftCardCode: "SKUL-ABC123" })
    );
    // 25.000 - 20% (cupón) = 20.000; gift card de 10.000 sobre esos 20.000
    // deja 10.000. Si la gift card se aplicara sobre el subtotal completo
    // (25.000 - 10.000 = 15.000), el cliente pagaría 2.500 más.
    expect(json.total).toBe(10000);
    expect(json.giftCardDiscount).toBe(10000);
  });

  it("con efectivo el orden es: efectivo 10%, cupón sobre lo que queda, gift card", async () => {
    const { json } = await pedir(
      worker,
      conCupon({ payMethod: "efectivo", couponCode: "BIENVENIDA", giftCardCode: "SKUL-ABC123" })
    );
    //   subtotal 25.000
    //   - efectivo 10%  ............  2.500
    //   - cupón 20% ................  4.500  (sobre 22.500, no sobre 25.000)
    //   - gift card ............... 10.000
    //   = 8.000
    // El cupón % se calcula sobre lo que el cliente paga en serio: un
    // 20% de plata que igual no se paga sería un 30% total (antes era la
    // cuenta aditiva). Ahora es 10% y después el 20% de lo que queda:
    // 28% efectivo. El cupón FIJO no se toca, solo el porcentual.
    // El response solo expone total/giftCardDiscount; el detalle se lee
    // del pedido ya commiteado en Firestore.
    expect(json.total).toBe(8000);

    const pedido = escriturasDelCommit().find((e) => e.coleccion === "orders");
    expect(pedido).toBeTruthy();
    expect(pedido.campos.discount).toBe(2500); // 10% de efectivo, sobre subtotal
    expect(pedido.campos.couponDiscount).toBe(4500); // 20% sobre 22.500
    expect(pedido.campos.total).toBe(8000);
  });

  it("el total nunca es negativo con cupón + gift card + efectivo", async () => {
    const { json } = await pedir(
      worker,
      conCupon({
        payMethod: "efectivo",
        couponCode: "PORCIENTO_ENORM",
        giftCardCode: "SKUL-ABC123",
      })
    );
    expect(json.total).toBe(0);
    expect(json.total).toBeGreaterThanOrEqual(0);
  });
});

/* -------------------------------------------------------------- */
function escriturasDelCommit() {
  return fs.commits.flatMap((c) =>
    c.writes.map((w) => ({
      coleccion: w.update.name.split("/documents/")[1].split("/")[0],
      campos: decodeFields(w.update.fields),
      updateMask: w.updateMask?.fieldPaths,
      currentDocument: w.currentDocument,
    }))
  );
}