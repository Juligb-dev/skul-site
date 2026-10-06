/**
 * ============================================================
 *  PRUEBAS DEL AVISO DE SUSCRIPCIÓN POR TELEGRAM
 * ------------------------------------------------------------
 *  notifyNewSubscriber es la definición de "el aviso es un extra": el
 *  mail ya quedó guardado en Firestore, así que si el aviso falla, NADIE
 *  puede decirle al visitante que no se suscribió. Por eso nunca tira.
 *
 *  Reglas que se pinan acá:
 *   - Al Worker solo le llega el subscriberId (el ID del doc), nunca
 *     texto libre: si el endpoint se descubriera, no sirve para escribir
 *     en el Telegram de la tienda.
 *   - Sin ORDER_NOTIFY_WORKER_URL: warning en consola y salida limpia.
 *   - Worker que responde mal o red caída: error a consola, nunca throw.
 * ============================================================
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const cfg = vi.hoisted(() => ({
  url: "https://worker.test",
}));
vi.mock("../data/config.js", () => ({
  get ORDER_NOTIFY_WORKER_URL() {
    return cfg.url;
  },
}));

import { notifyNewSubscriber } from "./notifyTelegram.js";

beforeEach(() => {
  cfg.url = "https://worker.test";
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("notifyNewSubscriber", () => {
  it("manda solo el subscriberId (nunca texto libre) con el action 'subscribe'", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    await notifyNewSubscriber("ana@ejemplo.com");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://worker.test");
    expect(JSON.parse(init.body)).toEqual({ action: "subscribe", subscriberId: "ana@ejemplo.com" });
    expect(console.error).not.toHaveBeenCalled();
  });

  it("sin Worker configurado: warning en la consola y NO falla la suscripción", async () => {
    cfg.url = "";
    await expect(notifyNewSubscriber("ana@ejemplo.com")).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });

  it("el Worker que responde mal se loguea, pero el aviso no tira", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, text: async () => "sin permisos" })));
    await expect(notifyNewSubscriber("ana@ejemplo.com")).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it("la red caída tampoco tira: el mail ya quedó guardado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );
    await expect(notifyNewSubscriber("ana@ejemplo.com")).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});