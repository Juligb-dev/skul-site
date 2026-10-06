/**
 * ============================================================
 *  PRUEBAS DE LA SUBIDA A CLOUDINARY
 * ------------------------------------------------------------
 *  El camino de una foto desde el panel hasta el catálogo es de los que
 *  más rápido se pueden romper en silencio, porque hay DOS servicios
 *  intermedios (el Worker que firma y Cloudinary que guarda) y el nombre
 *  de la cuenta va en la URL.
 *
 *  Las reglas que se prueban acá:
 *
 *   - Sin sesión de admin, no se sube nada (cortar antes que fallar).
 *   - El navegador le manda al Worker SU idToken como Bearer, y el
 *     Worker es quien decide si firma o no (nunca confía en quién llama).
 *   - La subida a Cloudinary lleva api_key + timestamp + signature +
 *     folder, y devuelve la secure_url, que es la que se guarda y se
 *     muestra. Sin el secreto nunca, obvio.
 *   - Un 502 del Worker o un rechazo de Cloudinary se traducen en un
 *     error que el panel pueda mostrar, no en un JSON raro.
 * ============================================================
 */
import { describe, it, expect, vi } from "vitest";

const cfg = vi.hoisted(() => ({
  cloudName: "skul",
  apiKey: "123456",
  url: "https://worker.test",
}));
vi.mock("../data/config.js", () => ({
  get CLOUDINARY_CLOUD_NAME() {
    return cfg.cloudName;
  },
  get CLOUDINARY_CLOUD_API_KEY() {
    return cfg.apiKey;
  },
  get ORDER_NOTIFY_WORKER_URL() {
    return cfg.url;
  },
}));

// El auth del navegador: acá lo controla el test (admin logueado o no).
const authStub = vi.hoisted(() => ({ currentUser: null }));
vi.mock("../firebase.js", () => ({ auth: authStub }));

import { uploadToCloudinary } from "./cloudinary.js";

beforeEach(() => {
  cfg.cloudName = "skul";
  cfg.apiKey = "123456";
  cfg.url = "https://worker.test";
  authStub.currentUser = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const foto = "data:image/png;base64,AAAA";

describe("uploadToCloudinary", () => {
  it("sin configuración corta antes de hacer nada, con mensaje útil", async () => {
    cfg.cloudName = "";
    await expect(uploadToCloudinary(foto)).rejects.toThrow(/configurar/i);
  });

  it("sin sesión no se sube (el panel está protegiendo las fotos)", async () => {
    await expect(uploadToCloudinary(foto)).rejects.toThrow(/sesión/i);
  });

  it("le pide la firma al Worker con el token del admin, y sube la imagen para guardar la secure_url", async () => {
    const admin = {
      getIdToken: vi.fn(async () => "jwt-admin"),
    };
    authStub.currentUser = admin;

    const firma = {
      ok: true,
      json: async () => ({ cloudName: "skul", apiKey: "123456", timestamp: 1700000000, signature: "firma", folder: "tienda" }),
    };
    const subida = {
      ok: true,
      json: async () => ({ secure_url: "https://res.cloudinary.com/skul/image/upload/v1/tienda/foto.jpg" }),
    };
    const fetchMock = vi.fn(async (input) =>
      String(input).includes("api.cloudinary.com") ? subida : firma
    );
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await uploadToCloudinary(foto);

    // 1) Pidió la firma con el Bearer del admin.
    const [firmaUrl, firmaInit] = fetchMock.mock.calls[0];
    expect(firmaUrl).toBe("https://worker.test");
    expect(JSON.parse(firmaInit.body)).toEqual({ action: "signUpload" });
    expect(firmaInit.headers.Authorization).toBe("Bearer jwt-admin");

    // 2) Subió a Cloudinary con api_key + timestamp + signature + folder.
    const [cldUrl, cldInit] = fetchMock.mock.calls[1];
    expect(String(cldUrl)).toContain("api.cloudinary.com/v1_1/skul/image/upload");
    const formData = cldInit.body;
    expect(formData.get("api_key")).toBe("123456");
    expect(formData.get("signature")).toBe("firma");
    expect(formData.get("folder")).toBe("tienda");

    // 3) Devuelve la secure_url (la que se guarda en el producto).
    expect(resultado).toBe("https://res.cloudinary.com/skul/image/upload/v1/tienda/foto.jpg");
  });

  it("el Worker que rechaza la firma (no sos admin) lo muestra", async () => {
    authStub.currentUser = { getIdToken: async () => "jwt" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({ error: "No sos admin." }) }))
    );
    await expect(uploadToCloudinary(foto)).rejects.toThrow("No sos admin.");
  });

  it("Cloudinary que rechaza la imagen: el motivo de Cloudinary, no un JSON crudo", async () => {
    authStub.currentUser = { getIdToken: async () => "jwt" };
    const fetchMock = vi.fn(async (input) =>
      String(input).includes("api.cloudinary.com")
        ? { ok: false, json: async () => ({ error: { message: "invalid signature" } }) }
        : { ok: true, json: async () => ({ cloudName: "skul", apiKey: "1", timestamp: 1, signature: "x", folder: "f" }) }
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadToCloudinary(foto)).rejects.toThrow("invalid signature");
  });
});