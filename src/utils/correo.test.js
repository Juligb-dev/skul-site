/**
 * ============================================================
 *  PRUEBAS DE LA COTIZACIÓN DE CORREO ARGENTINO
 * ------------------------------------------------------------
 *  Estas dos funciones son las ÚNICAS ventanas del navegador a la API
 *  de MiCorreo. Van por el Worker (que guarda el token como secreto) y
 *  devuelven los precios en pesos que el checkout muestra.
 *
 *  Lo que se prueba:
 *   - Que el pedido a la API lleve el action correcto y el peso real.
 *   - Que un error de Correo (CP inexistente) llegue tal cual y pueda
 *     leerse (el checkout lo pinta en rojo).
 *   - Que una respuesta sin JSON (502, rate limit) no reviente el
 *     checkout: error genérico en castellano.
 *   - Que sobrevivir a la falta de configuración dé un error que diga
 *     QUÉ constante falta, no un error de red opaco.
 * ============================================================
 */
import { describe, it, expect, vi } from "vitest";

// Configurable por test: RENDERIZA el caso "sin URL configurada".
const cfg = vi.hoisted(() => ({
  url: "https://worker.test",
}));
vi.mock("../data/config.js", () => ({
  get ORDER_NOTIFY_WORKER_URL() {
    return cfg.url;
  },
}));

import { getShippingRates, getAgencies } from "./correo.js";

const fetchOk = (body) =>
  vi.fn(async () => ({ ok: true, json: async () => body }));

beforeEach(() => {
  cfg.url = "https://worker.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getShippingRates", () => {
  it("pide la cotización al Worker con action 'rates' y el peso", async () => {
    const fetchMock = fetchOk({ domicilio: 3200, sucursal: 2600 });
    vi.stubGlobal("fetch", fetchMock);

    const r = await getShippingRates("1704", 900);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://worker.test");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ action: "rates", postalCodeDestination: "1704", weight: 900 });

    expect(r).toEqual({ domicilio: 3200, sucursal: 2600 });
  });

  it("un CP sin cobertura: el mensaje del Worker llega tal cual (el cliente lo entiende)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({ error: "Código postal inexistente." }) }))
    );
    await expect(getShippingRates("99999", 500)).rejects.toThrow("Código postal inexistente.");
  });

  it("una respuesta sin JSON no revienta: error genérico en castellano", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => {
          throw new SyntaxError("boom");
        },
      }))
    );
    await expect(getShippingRates("1704", 500)).rejects.toThrow(/no se pudo cotizar/i);
  });

  it("sin Worker configurado, el error dice QUÉ falta (no confunde al setup)", async () => {
    cfg.url = "";
    await expect(getShippingRates("1704", 500)).rejects.toThrow(/DATA_CONFIG|config/i);
  });
});

describe("getAgencies", () => {
  it("pide la lista con el action 'agencies' y el código de provincia", async () => {
    const fetchMock = fetchOk({
      agencies: [{ code: "AG1", name: "Correo Central", city: "Los Toldos", address: "Av. 1" }],
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await getAgencies("B");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ action: "agencies", provinceCode: "B" });
    expect(r[0].code).toBe("AG1");
  });

  it("si viene sin lista (o vacía), devuelve [] y no rompe el render del checkout", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}), })));
    expect(await getAgencies("B")).toEqual([]);
  });

  it("si el Worker falla, tira su mensaje", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({ error: "Sin sucursales para esa provincia." }) }))
    );
    await expect(getAgencies("Z")).rejects.toThrow("Sin sucursales para esa provincia.");
  });
});