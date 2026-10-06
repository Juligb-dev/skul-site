/**
 * ============================================================
 *  PRUEBAS DE SEGURIDAD DEL WORKER — precios y cantidades
 * ------------------------------------------------------------
 *  El Worker es el único que decide cuánto se cobra. Si acepta un
 *  precio que le manda el navegador, un atacante con la consola del
 *  navegador (o con un curl) compra una hoodie de $25.000 por $1.
 *
 *  ESTOS TESTS ASUMEN QUE EL NAVEGADOR ES MALICIOSO. Todos arman el
 *  pedido a mano, con `curl` en la cabeza, mandando cosas que el sitio
 *  real nunca mandaría.
 *
 *  Qué se verifica acá:
 *   - El precio sale del catálogo (Firestore), nunca del `items`.
 *   - El `qty` está acotado y es un entero.
 *   - El costo de envío lo calcula el Worker, no el cliente.
 *   - Un producto apagado desde el panel no se puede comprar.
 *   - Un producto inexistente (o un id con traversal) no se compra.
 * ============================================================
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { workerLimpio, pedir, montarFirestore, PRODUCTO, PEDIDO_BASE } from "./test/helpers/arnes.js";
import { docDePrueba, decodeFields } from "./test/helpers/firestore-falso.js";

let worker;
let fs;

beforeEach(async () => {
  worker = await workerLimpio();
  ({ fs } = montarFirestore({
    "products/prod-1": docDePrueba({ ...PRODUCTO }),
    "products/prod-outlet": docDePrueba({ ...PRODUCTO, outlet: true, outletPrice: 12000, price: 25000 }),
    "products/prod-apagado": docDePrueba({ ...PRODUCTO, active: false }),
    "products/prod-sin-stock": docDePrueba({ name: "Remera", cat: "remeras", price: 8000, stock: { S: 0 } }),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createOrder — el precio NUNCA viene del cliente", () => {
  it("ignora el price que manda el cliente y cobra el del catálogo", async () => {
    const { status, json } = await pedir(worker, {
      ...PEDIDO_BASE,
      items: [{ id: "prod-1", size: "M", qty: 1, price: 1, name: "Hoodie Concrete" }],
    });
    expect(status).toBe(200);
    // 25.000 del catálogo, no el $1 del atacante.
    expect(json.total).toBe(25000);
  });

  it("ignora el nombre del producto que manda el cliente (no puede renombrar la prenda)", async () => {
    await pedir(worker, {
      ...PEDIDO_BASE,
      items: [{ id: "prod-1", size: "M", qty: 1, name: "Camiseta de $1", price: 1 }],
    });
    const pedido = verPedidoGuardado();
    expect(pedido.items[0].name).toBe("Hoodie Concrete");
  });

  it("ignora el precio del envío que manda el cliente", async () => {
    const { json } = await pedir(worker, {
      ...PEDIDO_BASE,
      // shippingCost: 0 y total: 1 son los intentos clásicos de pagar nada.
      shippingCost: 0,
      total: 1,
      items: [{ id: "prod-1", size: "M", qty: 2 }],
    });
    // 2 prendas de 25.000 y envío gratis, porque la zona es el retiro.
    expect(json.total).toBe(50000);
  });

  it("multiplica por la cantidad real (no por una qty manipulada)", async () => {
    const { json } = await pedir(worker, {
      ...PEDIDO_BASE,
      items: [{ id: "prod-1", size: "M", qty: 3, price: 1 }],
    });
    expect(json.total).toBe(25000 * 3 + 3 * ENVIO_LOCAL);
  });

  it("usa el precio de outlet cuando el producto está en outlet", async () => {
    const { json } = await pedir(worker, {
      ...PEDIDO_BASE,
      items: [{ id: "prod-outlet", size: "M", qty: 1, price: 1 }],
    });
    expect(json.total).toBe(12000 + ENVIO_LOCAL);
  });

  it("el discount del cliente no cambia el total (el 10% es solo por efectivo)", async () => {
    const conDescuento = await pedir(worker, {
      ...PEDIDO_BASE,
      discount: 999999,
      couponDiscount: 999999,
      giftCardDiscount: 999999,
      items: [{ id: "prod-1", size: "M", qty: 1 }],
    });
    expect(conDescuento.json.total).toBe(25000 + ENVIO_LOCAL);
  });
});

describe("createOrder — cantidades mal formadas", () => {
  it.each([
    ["0", "cero unidades"],
    ["-3", "cantidad negativa"],
    ["1.5", "fracción"],
    ["null", "null"],
    ["999", "cantidad enorme"],
  ])("rechaza qty = %s (%s)", async (qty) => {
    const { status } = await pedir(worker, {
      ...PEDIDO_BASE,
      items: [{ id: "prod-1", size: "M", qty: JSON.parse(qty) }],
    });
    expect(status).toBe(400);
  });

  it("rechaza un item sin qty (que es lo mismo que NaN)", async () => {
    // Sin la clave qty, Number(undefined) es NaN y no es entero.
    const { status } = await pedir(worker, {
      ...PEDIDO_BASE,
      items: [{ id: "prod-1", size: "M" }],
    });
    expect(status).toBe(400);
  });

  it("acepta qty enviado como texto si el número es entero válido", async () => {
    // Number("2") es 2: no es una vulnerabilidad porque el valor sigue
    // pasando por el chequeo de entero y el de stock. Se documenta para
    // que quede claro que la coerción es deliberada y no un descuido.
    const { status, json } = await pedir(worker, {
      ...PEDIDO_BASE,
      items: [{ id: "prod-1", size: "M", qty: "2" }],
    });
    expect(status).toBe(200);
    expect(json.total).toBe(50000);
  });

  it("acepta el máximo permitido (20 unidades) si hay stock", async () => {
    montarFirestore({ "products/prod-grande": docDePrueba({ name: "Pack", price: 1000, stock: { M: 50 } }) });
    const { status } = await pedir(worker, {
      ...PEDIDO_BASE,
      items: [{ id: "prod-grande", size: "M", qty: 20 }],
    });
    expect(status).toBe(200);
  });

  it("rechaza más de 20 unidades aunque haya stock", async () => {
    const { status } = await pedir(worker, {
      ...PEDIDO_BASE,
      items: [{ id: "prod-1", size: "M", qty: 21 }],
    });
    expect(status).toBe(400);
  });

  it("el mismo producto dos veces acumula el stock (no se pasa)", async () => {
    // prod-1 tiene 2 unidades de S. Dos líneas de 1 = 2, entra justo.
    const entra = await pedir(worker, {
      ...PEDIDO_BASE,
      items: [
        { id: "prod-1", size: "S", qty: 1 },
        { id: "prod-1", size: "S", qty: 1 },
      ],
    });
    expect(entra.status).toBe(200);

    // Y tres no entran: el control de stock tiene que mirar el ACUMULADO,
    // no cada línea por separado. Si mirara línea por línea, tres
    // unidades pasarían porque cada una tiene 2 disponibles.
    const worker2 = await workerLimpio();
    montarFirestore({ "products/prod-1": docDePrueba({ ...PRODUCTO }) });
    const noEntra = await pedir(worker2, {
      ...PEDIDO_BASE,
      items: [
        { id: "prod-1", size: "S", qty: 2 },
        { id: "prod-1", size: "S", qty: 1 },
      ],
    });
    expect(noEntra.status).toBe(409);
  });

  it("no deja pasar un talle que no existe en el control de stock", async () => {
    // prod-1 tiene S/M/L. Pedir XX no es "sin control": es un talle
    // inexistente, y tiene que rechazarse.
    const { status } = await pedir(worker, {
      ...PEDIDO_BASE,
      items: [{ id: "prod-1", size: "XXL", qty: 1 }],
    });
    expect(status).toBe(409);
  });

  it("permite comprar prendas sin control de stock cargado", async () => {
    // Es el comportamiento buscado: hay productos sin stock en la base
    // y siguen vendiéndose (los que nunca se controlan).
    montarFirestore({ "products/sin-stock": docDePrueba({ name: "Remera", price: 8000 }) });
    const { status } = await pedir(worker, {
      ...PEDIDO_BASE,
      items: [{ id: "sin-stock", size: "M", qty: 1 }],
    });
    expect(status).toBe(200);
  });
});

describe("createOrder — productos que no se pueden comprar", () => {
  it("no compra un producto que no existe", async () => {
    const { status, json } = await pedir(worker, {
      ...PEDIDO_BASE,
      items: [{ id: "inventado", size: "M", qty: 1 }],
    });
    expect(status).toBe(400);
    expect(json.error).toMatch(/no está disponible/);
  });

  it("no compra un producto apagado desde el panel", async () => {
    // Este es el caso real: alguien dejó el carrito abierto con un
    // producto que después escondió del catálogo.
    const { status } = await pedir(worker, {
      ...PEDIDO_BASE,
      items: [{ id: "prod-apagado", size: "M", qty: 1 }],
    });
    expect(status).toBe(400);
  });

  it("un producto sin el campo active sigue vendiéndose (compatibilidad)", async () => {
    montarFirestore({ "products/legacy": docDePrueba({ name: "Legacy", price: 5000 }) });
    const { status } = await pedir(worker, {
      ...PEDIDO_BASE,
      items: [{ id: "legacy", size: "M", qty: 1 }],
    });
    expect(status).toBe(200);
  });

  it.each([
    ["products/../settings/site", "sube a otra colección"],
    ["settings/site", "lee un documento de configuración"],
    ["__proto__", "intenta tocar el prototipo"],
    ["prod-1/../../orders/algo", "intenta colarse en orders"],
  ])("un id con traversal (%s) no compra nada raro", async (id) => {
    const { status } = await pedir(worker, {
      ...PEDIDO_BASE,
      items: [{ id, size: "M", qty: 1 }],
    });
    // O bien no encuentra el documento (400), o bien lo encuentra pero no
    // logra escribir fuera de orders/. Lo que no puede pasar es que pase
    // algo raro, así que el status tiene que ser uno de los conocidos.
    expect([200, 400, 409]).toContain(status);
    // Y si llegó a escribir, que no haya escrito fuera de las tres
    // colecciones que el Worker tiene permitidas.
    for (const commit of fs.commits) {
      for (const w of commit.writes) {
        expect(w.update.name).toMatch(/\/documents\/(orders|orderTracking|products|coupons|giftCards)\//);
      }
    }
  });
});

describe("createOrder — validación de los datos del cliente", () => {
  it.each([
    [{ orderName: "" }, "nombre vacío"],
    [{ orderName: "A" }, "nombre de 1 letra"],
    [{ orderName: "x".repeat(81) }, "nombre larguísimo"],
    [{ orderPhone: "123" }, "teléfono corto"],
    [{ orderPhone: "9".repeat(41) }, "teléfono larguísimo"],
    [{ items: [] }, "carrito vacío"],
    [{ items: "no-es-un-array" }, "items no es un array"],
    [{ payMethod: "bitcoin" }, "medio de pago inventado"],
    [{ payMethod: "tarjeta-falsa" }, "medio de pago raro"],
    [{ zoneId: "tucuman-aeropuerto" }, "zona de envío inventada"],
    [{ zoneId: "" }, "zona vacía"],
  ])("rechaza %o (%s) con 400", async (parche) => {
    const { status } = await pedir(worker, { ...PEDIDO_BASE, ...parche });
    expect(status).toBe(400);
  });

  it("acepta los cuatro medios de pago que el sitio realmente ofrece", async () => {
    for (const payMethod of ["debito", "credito", "transferencia", "efectivo"]) {
      const w = await workerLimpio();
      montarFirestore({ "products/prod-1": docDePrueba({ ...PRODUCTO }) });
      const { status } = await pedir(w, { ...PEDIDO_BASE, payMethod, items: [{ id: "prod-1", size: "M", qty: 1 }] });
      expect(status, `medio de pago ${payMethod}`).toBe(200);
    }
  });

  it("el 10% de descuento solo existe en efectivo y sin Correo", async () => {
    const efectivo = await pedir(worker, {
      ...PEDIDO_BASE,
      payMethod: "efectivo",
      items: [{ id: "prod-1", size: "M", qty: 1 }],
    });
    const debito = await pedir(await workerLimpio(), {
      ...PEDIDO_BASE,
      payMethod: "debito",
      items: [{ id: "prod-1", size: "M", qty: 1 }],
    });
    // 25.000 - 10% = 22.500 en efectivo; 25.000 en débito.
    expect(efectivo.json.total).toBe(22500);
    expect(debito.json.total).toBe(25000);
  });

  it("un nombre con <script> se guarda como texto, no como HTML", async () => {
    await pedir(worker, {
      ...PEDIDO_BASE,
      orderName: "<script>alert(1)</script>",
      items: [{ id: "prod-1", size: "M", qty: 1 }],
    });
    const pedido = verPedidoGuardado();
    // Sigue siendo la cadena exacta. Lo importante es que nunca se
    // interpola en HTML sin escapar: eso se testea en el frontend, con
    // React, que escapa todo por default.
    expect(pedido.orderName).toBe("<script>alert(1)</script>");
  });

  it("no acepta una dirección enorme (se rechaza antes de guardar)", async () => {
    // La validación exige entre 5 y 200 caracteres: una dirección de 5 KB
    // se rechaza con 400 en vez de cortarse. Así no hay dos caminos
    // distintos para la misma regla.
    const { status } = await pedir(worker, {
      ...PEDIDO_BASE,
      zoneId: "correo",
      orderAddress: "a".repeat(5000),
      correoQuote: { type: "domicilio", postalCode: "1425", provinceCode: "C" },
      items: [{ id: "prod-1", size: "M", qty: 1 }],
    });
    expect(status).toBe(400);
  });

  it("guarda la dirección con los espacios sobrantes recortados", async () => {
    await pedir(worker, {
      ...PEDIDO_BASE,
      zoneId: "correo",
      orderAddress: "   Av Siempreviva 742   ",
      correoQuote: { type: "domicilio", postalCode: "1425", provinceCode: "C" },
      items: [{ id: "prod-1", size: "M", qty: 1 }],
    });
    expect(verPedidoGuardado().orderAddress).toBe("Av Siempreviva 742");
  });
});

describe("createOrder — envío por Correo Argentino", () => {
  const pedidoCorreo = (correoQuote) => ({
    ...PEDIDO_BASE,
    zoneId: "correo",
    orderAddress: "Av Siempreviva 742",
    correoQuote,
    items: [{ id: "prod-1", size: "M", qty: 1 }],
  });

  it("el precio del envío lo pone la API de Correo, no el cliente", async () => {
    const { status, json } = await pedir(
      worker,
      pedidoCorreo({ type: "domicilio", postalCode: "1425", provinceCode: "C", price: 1 })
    );
    expect(status).toBe(200);
    // 25.000 del producto + 2.500 de la cotización simulada.
    expect(json.total).toBe(25000 + 2500);
  });

  it("retiro en sucursal usa el precio de sucursal", async () => {
    const { json } = await pedir(
      worker,
      pedidoCorreo({ type: "sucursal", postalCode: "1425", provinceCode: "C", agencyCode: "AG-1", agencyName: "Palermo" })
    );
    expect(json.total).toBe(25000 + 1500);
  });

  it("no acepta un tipo de envío inventado", async () => {
    const { status } = await pedir(worker, pedidoCorreo({ type: "teletransporte", postalCode: "1425" }));
    expect(status).toBe(400);
  });

  it("exige elegir sucursal si el retiro es en la sucursal", async () => {
    const { status } = await pedir(worker, pedidoCorreo({ type: "sucursal", postalCode: "1425" }));
    expect(status).toBe(400);
  });

  it("exige dirección si el envío es a domicilio", async () => {
    const { status } = await pedir(
      worker,
      { ...pedidoCorreo({ type: "domicilio", postalCode: "1425" }), orderAddress: "" }
    );
    expect(status).toBe(400);
  });

  it("no da el 10% de efectivo con envío por Correo", async () => {
    const { json } = await pedir(
      worker,
      { ...pedidoCorreo({ type: "domicilio", postalCode: "1425" }), payMethod: "efectivo" }
    );
    expect(json.total).toBe(25000 + 2500);
  });

  it("si Correo no puede cotizar, avisa y NO guarda el pedido", async () => {
    // Un 503 con el pedido a medio hacer sería lo peor: el cliente
    // cree que compró y no hay nada.
    const w = await workerLimpio();
    const { fs } = montarFirestore({ "products/prod-1": docDePrueba({ ...PRODUCTO }) }, { correoFalla: true });
    const { status, json } = await pedir(
      w,
      pedidoCorreo({ type: "domicilio", postalCode: "1425", provinceCode: "C" })
    );
    expect(status).toBe(503);
    expect(json.error).toMatch(/Correo/);
    expect(fs.commits).toHaveLength(0);
  });
});

/* ---------------------------------------------------------------
 * Helpers
 * --------------------------------------------------------------- */

/**
 * El precio de envío de la zona "local" (retiro en el local) es $0, así
 * que en estos tests el total es exactamente el precio de las prendas.
 * Eso es lo que hace legibles los números: si el total fuera 25.000 +
 * un flete difícil de leer, cualquier error de un peso no se vería.
 */
const ENVIO_LOCAL = 0;

/** El pedido tal como quedó guardado en Firestore (campos desenvueltos). */
function verPedidoGuardado() {
  const commit = fs.commits.at(-1);
  expect(commit, "no se hizo ningún commit: el pedido no se guardó").toBeTruthy();
  const escritura = commit.writes.find((w) => w.update.name.includes("/orders/"));
  expect(escritura, "el commit no tiene ninguna escritura en orders/").toBeTruthy();
  return decodeFields(escritura.update.fields);
}

/** Todos los documentos que el commit intentó escribir, por colección. */
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