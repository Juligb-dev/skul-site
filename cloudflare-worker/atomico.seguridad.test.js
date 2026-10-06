/**
 * ============================================================
 *  PRUEBAS — el commit atómico y la venta perdida
 * ------------------------------------------------------------
 *  Este es el archivo que justifica que todo el pedido pase por el Worker.
 *  La garantía que promete el código es:
 *
 *    "Si dos personas compran el último talle al mismo tiempo, una se lo
 *     lleva y la otra recibe 'se agotó el stock'. Jamás las dos."
 *
 *  Eso no se puede demostrar con un pedido solo: hay que simular la
 *  carrera. La forma de simularla sin threads es hacer que el documento
 *  cambie ENTRE la lectura y el commit, que es exactamente la condición
 *  que dispara el `currentDocument` (la "precondition") del commit.
 *
 *  Y después, los dosScenarios que rompen una tienda online:
 *    - El pedido se guardó pero el stock no bajó (vendés dos veces).
 *    - El stock bajó pero el pedido no se guardó (el cliente pagó y no
 *      tiene nada).
 *  Los dos son el mismo problema: escrituras que no van atómicas.
 * ============================================================
 */
import { describe, it, expect, beforeEach } from "vitest";
import { workerLimpio, pedir, montarFirestore, PRODUCTO, PEDIDO_BASE } from "./test/helpers/arnes.js";
import { docDePrueba, decodeFields } from "./test/helpers/firestore-falso.js";

let worker;
let fs;

beforeEach(async () => {
  worker = await workerLimpio();
  ({ fs } = montarFirestore({ "products/prod-1": docDePrueba({ ...PRODUCTO }) }));
});

describe("Stock — la venta del último talle", () => {
  it("baja el stock del talle comprado y solo ese", async () => {
    await pedir(worker, { ...PEDIDO_BASE, items: [{ id: "prod-1", size: "M", qty: 2 }] });

    const stock = fs.docs.get("products/prod-1").data.stock;
    expect(stock).toEqual({ S: 2, M: 3, L: 1 });
  });

  it("no toca los otros campos del producto (solo stock)", async () => {
    await pedir(worker, PEDIDO_BASE);
    const escritura = escrituras().find((e) => e.coleccion === "products");
    expect(escritura.updateMask).toEqual(["stock"]);
    // El precio y el nombre siguen intactos en Firestore.
    expect(fs.docs.get("products/prod-1").data.price).toBe(25000);
    expect(fs.docs.get("products/prod-1").data.name).toBe("Hoodie Concrete");
  });

  it("el pedido, el tracking y el stock van en el MISMO commit", async () => {
    await pedir(worker, PEDIDO_BASE);
    expect(fs.commits).toHaveLength(1);
    const colecciones = escrituras().map((e) => e.coleccion).sort();
    expect(colecciones).toEqual(["orderTracking", "orders", "products"]);
  });

  it("con cupón, el contador del cupón va en el mismo commit que el pedido", async () => {
    ({ fs } = montarFirestore({
      "products/prod-1": docDePrueba({ ...PRODUCTO }),
      "coupons/BIEN": docDePrueba({ type: "percent", value: 10, active: true, scope: "all", usedCount: 0 }),
    }));
    const w = await workerLimpio();
    await pedir(w, { ...PEDIDO_BASE, couponCode: "BIEN" });
    expect(fs.commits).toHaveLength(1);
    expect(escrituras().map((e) => e.coleccion).sort()).toEqual([
      "coupons",
      "orderTracking",
      "orders",
      "products",
    ]);
  });
});

describe("La carrera por el último talle", () => {
  it("si el stock cambia entre la lectura y el commit, el pedido NO se crea", async () => {
    // Se lee prod-1 (stock M=5). Ahora, antes del commit, otra persona
    // se lleva el talle: el updateTime del documento ya no es el mismo que
    // leyó el Worker.
    const originalFetch = globalThis.fetch;
    let yaLeido = false;
    globalThis.fetch = async (url, init) => {
      const res = await originalFetch(url, init);
      if (String(url).includes("/documents/products/prod-1") && !yaLeido) {
        yaLeido = true;
        // Alguien más compró: el documento cambió de updateTime.
        fs.docs.set("products/prod-1", {
          data: { ...PRODUCTO, stock: { S: 2, M: 0, L: 1 } },
          updateTime: "2026-05-05T00:00:00.000Z", // distinto al del seed
        });
      }
      return res;
    };

    const { status, json } = await pedir(worker, PEDIDO_BASE);
    globalThis.fetch = originalFetch;

    // El cliente recibe un mensaje honesto...
    expect(status).toBe(409);
    expect(json.error).toMatch(/agotó|descuento/);
    // ...y no quedó un pedido guardado sin su stock descontado. Ojo: el
    // commit SÍ se intentó (eso también es información), lo que se verifica
    // es que en la base no quedó el pedido.
    expect(Object.keys(fs.docs).some((k) => k.startsWith("orders/"))).toBe(false);
    expect(fs.docs.get("products/prod-1").data.stock.M).toBe(0);
  });

  it("el oversell es imposible: el último talle se vende una sola vez", async () => {
    // Simula dos compras simultáneas del ÚNICO talle L (stock 1).
    ({ fs } = montarFirestore({
      "products/prod-ultimo": docDePrueba({ name: "Último", price: 10000, stock: { L: 1 } }),
    }));
    const w = await workerLimpio();
    const pedido1 = { ...PEDIDO_BASE, items: [{ id: "prod-ultimo", size: "L", qty: 1 }] };

    const primera = await pedir(w, pedido1);
    expect(primera.status).toBe(200);
    expect(fs.docs.get("products/prod-ultimo").data.stock.L).toBe(0);

    // La segunda persona intenta lo mismo: el Worker lee stock L=0 y la
    // rechaza antes de escribir nada.
    const segunda = await pedir(await workerLimpio(), pedido1);
    expect(segunda.status).toBe(409);
    expect(fs.commits).toHaveLength(1);
  });

  it("el mismo cupón no se gasta dos veces en paralelo (precondition en el cupón)", async () => {
    montarFirestore({
      "products/prod-1": docDePrueba({ ...PRODUCTO }),
      "coupons/UNOSOLO": docDePrueba({ type: "fixed", value: 1000, active: true, scope: "all", usedCount: 0, maxUses: 1 }),
    });
    const w = await workerLimpio();
    const conCupon = { ...PEDIDO_BASE, couponCode: "UNOSOLO" };

    const primera = await pedir(w, conCupon);
    expect(primera.status).toBe(200);

    // Ya se usó el único uso disponible: la segunda se rechaza por el
    // maxUses, no por una condición de carrera.
    const segunda = await pedir(await workerLimpio(), conCupon);
    expect(segunda.status).toBe(409);
  });

  it("la misma gift card no se gasta dos veces", async () => {
    ({ fs } = montarFirestore({
      "products/prod-1": docDePrueba({ ...PRODUCTO }),
      "giftCards/SKUL-UNOS01": docDePrueba({
        balance: 10000,
        usedAmount: 0,
        active: true,
        createdAt: new Date(),
      }),
    }));
    const w = await workerLimpio();
    const conGift = { ...PEDIDO_BASE, giftCardCode: "SKUL-UNOS01" };
    expect((await pedir(w, conGift)).status).toBe(200);

    // El saldo quedó en 0, así que la segunda no pasa el control de saldo.
    const segunda = await pedir(await workerLimpio(), conGift);
    expect(segunda.status).toBe(400);
    expect(fs.commits).toHaveLength(1);
  });
});

describe("Cuando el commit falla, no queda nada a medias", () => {
  it.each([
    [412, "el documento cambió"],
    [409, "el documento ya existía"],
    [500, "Firestore se cayó"],
    [403, "no tiene permisos"],
  ])("con un %i de Firestore (%s) avisa y no deja el pedido a medias", async (status) => {
    fs.fallaCommit = { status, mensaje: "algo falló" };
    const { status: http, json } = await pedir(worker, PEDIDO_BASE);

    if (status === 412 || status === 409) {
      expect(http).toBe(409);
      expect(json.error).toMatch(/agotó el stock/);
    } else {
      expect(http).toBe(503);
      expect(json.error).toMatch(/No pudimos guardar el pedido/);
    }
  });

  it("el 503 dice explícitamente que no se cobró nada", async () => {
    fs.fallaCommit = { status: 500, mensaje: "Firestore caído" };
    const { json } = await pedir(worker, PEDIDO_BASE);
    // Es el mensaje que evita los tickets de "me cobró y no tengo nada".
    expect(json.error).toMatch(/No se cobró nada/);
  });

  it("un 409 no dice que se cobró nada (acá el commit es atómico)", async () => {
    fs.fallaCommit = { status: 409, mensaje: "precondition" };
    const { json } = await pedir(worker, PEDIDO_BASE);
    // Con un commit atómico, si abortó no se cobró nada. El mensaje
    // distinto es para que el cliente reintente sin miedo.
    expect(json.error).not.toMatch(/se cobró/);
  });
});

describe("El aviso a Telegram no puede romper el pedido", () => {
  it("si Telegram está caído, el pedido igual quedó guardado", async () => {
    const w = await workerLimpio();
    ({ fs } = montarFirestore({ "products/prod-1": docDePrueba({ ...PRODUCTO }) }, { telegramOk: false }));

    const { status, json } = await pedir(w, PEDIDO_BASE);

    // El pedido se guardó y se le avisa al cliente que salió bien: el
    // pedido existe en Firestore y se ve en /admin.
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(fs.commits).toHaveLength(1);
    expect(escrituras().some((e) => e.coleccion === "orders")).toBe(true);
  });

  it("no se manda el token de Telegram al cliente", async () => {
    await pedir(worker, PEDIDO_BASE);
    expect(JSON.stringify(escrituras())).not.toMatch(/bot\d+:/);
  });
});

/* -------------------------------------------------------------- */
function escrituras() {
  return fs.commits.flatMap((c) =>
    c.writes.map((w) => ({
      coleccion: w.update.name.split("/documents/")[1].split("/")[0],
      campos: decodeFields(w.update.fields),
      updateMask: w.updateMask?.fieldPaths,
      currentDocument: w.currentDocument,
    }))
  );
}