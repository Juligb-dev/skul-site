/**
 * ============================================================
 *  PRUEBAS DE SEGURIDAD — endpoints, permisos y datos privados
 * ------------------------------------------------------------
 *  El Worker expone seis acciones. Cinco son públicas por diseño
 *  (createOrder, rates, agencies, subscribe, notify) y una exige el token
 *  del admin (signUpload). Estos tests atacan esa frontera y, además,
 *  miran dos cosas que se filtran fácil y casi nunca se buscan: los datos
 *  personales del comprador y los secretos.
 *
 *  Qué se verifica:
 *   - signUpload sin token / con token falso / con token de otro usuario.
 *   - La IP se lee del header que Cloudflare no deja falsear.
 *   - El rate limit corta y se reabre por ventana.
 *   - CORS: origen permitido sí, desconocido no, y nunca "*".
 *   - orderTracking (público) NO tiene PII.
 *   - El archivo del Worker no tiene secretos escritos a mano.
 *   - Un error de Firestore no filtra detalles internos al cliente.
 * ============================================================
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { workerLimpio, pedir, pedirDesdeIp, montarFirestore, PRODUCTO, PEDIDO_BASE } from "./test/helpers/arnes.js";
import { docDePrueba, decodeFields } from "./test/helpers/firestore-falso.js";

const ADMIN_UID = "Ii35YTENxZePLzloJkaC99AL5rn1"; // el que el Worker acepta
// El archivo tal cual se despliega: el test lo lee del disco y lo audita
// como texto, para poder buscar secretos escritos a mano.
const RUTA_WORKER = fileURLToPath(new URL("./worker.js", import.meta.url));

let worker;
let fs;

beforeEach(async () => {
  worker = await workerLimpio();
  ({ fs } = montarFirestore(
    {
      "products/prod-1": docDePrueba({ ...PRODUCTO }),
      "newsletter/suscriptor%40ejemplo.com": docDePrueba({
        email: "suscriptor@ejemplo.com",
        source: "footer",
        consent: true,
      }),
    },
    { adminUid: null }
  ));
});

afterEach(() => vi.restoreAllMocks());

/* -------------------------------------------------------------- */
describe("Frontera de los endpoints", () => {
  it("solo acepta POST (un GET no hace nada)", async () => {
    const res = await worker.fetch(new Request("https://w.test", { method: "GET" }), {});
    expect(res.status).toBe(405);
  });

  it.each(["PUT", "DELETE", "PATCH", "HEAD"])("rechaza %s", async (method) => {
    const res = await worker.fetch(new Request("https://w.test", { method }), {});
    expect([405, 501]).toContain(res.status);
  });

  it("responde el preflight de CORS sin cuerpo", async () => {
    const res = await worker.fetch(
      new Request("https://w.test", { method: "OPTIONS", headers: { Origin: "https://skullt.web.app" } }),
      {}
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://skullt.web.app");
  });

  it("rechaza un body que no es JSON", async () => {
    const res = await worker.fetch(
      new Request("https://w.test", { method: "POST", body: "no soy json" }),
      {}
    );
    expect(res.status).toBe(400);
  });

  it("una acción desconocida da 400 (no 500)", async () => {
    const { status, texto } = await pedir(worker, { action: "borrar-todo" });
    expect(status).toBe(400);
    expect(texto).toMatch(/desconocida/);
  });

  it("sin action se cae en notify (comportamiento viejo, deliberado)", async () => {
    const { status, texto } = await pedir(worker, { orderId: "no-existe" });
    expect(status).toBe(404);
    expect(texto).toMatch(/no encontrado/i);
  });
});

/* -------------------------------------------------------------- */
describe("agencias y geocp — lo que el checkout necesita para armar la lista de sucursales", () => {
  it("las agencias vienen con dirección completa, CP y coordenadas (y las cerradas se filtran)", async () => {
    montarFirestore({}, {
      correoAgencies: [
        {
          code: "AG1", name: "Correo Los Toldos", status: "ACTIVE",
          location: {
            latitude: "-35.0067", longitude: "-61.0475",
            address: {
              streetName: "Av. San Martín", streetNumber: "1234",
              locality: "Los Toldos", city: "General Viamonte",
              province: "Buenos Aires", provinceCode: "B", postalCode: "6015",
            },
          },
        },
        {
          code: "AG2", name: "Sucursal cerrada", status: "CLOSED",
          location: { latitude: "", longitude: "", address: { streetName: "X", streetNumber: "1" } },
        },
      ],
    });
    const { status, json } = await pedir(worker, { action: "agencies", provinceCode: "B" });
    expect(status).toBe(200);
    expect(json.agencies).toHaveLength(1);
    expect(json.agencies[0]).toMatchObject({
      code: "AG1",
      locality: "Los Toldos",
      address: "Av. San Martín 1234",
      postalCode: "6015",
      lat: -35.0067,
      lng: -61.0475,
    });
  });

  it("geocp devuelve la ubicación del CP (coords para ordenar por cercanía)", async () => {
    const { status, json } = await pedir(worker, { action: "geocp", postalCode: "1704" });
    expect(status).toBe(200);
    expect(json).toEqual({ lat: -34.6476, lng: -58.558, state: "Buenos Aires", localidad: "Ramos Mejía" });
  });

  it("geocp con un CP malformado ni consulta a Nominatim (400)", async () => {
    const { llamadas } = montarFirestore({}, { adminUid: null });
    const { status } = await pedir(worker, { action: "geocp", postalCode: "12" });
    expect(status).toBe(400);
    expect(llamadas.some((l) => l.url.includes("nominatim"))).toBe(false);
  });

  it("geocp sin resultado → { lat: null }: no es error, la lista sigue sin ordenar", async () => {
    montarFirestore({}, { geoCp: [], adminUid: null });
    const { status, json } = await pedir(worker, { action: "geocp", postalCode: "9999" });
    expect(status).toBe(200);
    expect(json).toEqual({ lat: null });
  });
});

/* -------------------------------------------------------------- */
describe("CORS — la lista blanca de orígenes", () => {
  it.each(["https://skullt.web.app", "https://skullt.firebaseapp.com", "http://localhost:5173"])(
    "devuelve el Allow-Origin para %s",
    async (origin) => {
      const res = await worker.fetch(
        new Request("https://w.test", { method: "OPTIONS", headers: { Origin: origin } }),
        {}
      );
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    }
  );

  it.each([
    "https://sitio-falso.com",
    "https://skullt.web.app.ataque.com",
    "http://skullt.web.app",
    "null",
    "",
  ])("NO devuelve Allow-Origin para %s", async (origin) => {
    const res = await worker.fetch(
      new Request("https://w.test", { method: "OPTIONS", headers: origin ? { Origin: origin } : {} }),
      {}
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("NUNCA devuelve '*' (con credenciales no sirve y abre el Worker a cualquiera)", async () => {
    const res = await worker.fetch(
      new Request("https://w.test", { method: "OPTIONS", headers: { Origin: "https://sitio-falso.com" } }),
      {}
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).not.toBe("*");
  });

  it("también manda Vary: Origin (el caché de Cloudflare no mezcla respuestas)", async () => {
    const res = await worker.fetch(
      new Request("https://w.test", { method: "OPTIONS", headers: { Origin: "https://skullt.web.app" } }),
      {}
    );
    expect(res.headers.get("Vary")).toContain("Origin");
  });
});

/* -------------------------------------------------------------- */
describe("Rate limit — frena el abuso antes de gastar APIs", () => {
  it("corta createOrder después de 5 pedidos en el minuto", async () => {
    const IP = "1.2.3.4";
    for (let i = 0; i < 5; i++) {
      const res = await pedirDesdeIp(worker, PEDIDO_BASE, IP);
      expect(res.status, `pedido ${i + 1}`).toBe(200);
    }
    const sexto = await pedirDesdeIp(worker, PEDIDO_BASE, IP);
    expect(sexto.status).toBe(429);
    expect(sexto.texto).toMatch(/Demasiadas/);
  });

  it("el límite es por IP: otra IP puede seguir comprando", async () => {
    // Producto sin control de stock a propósito: si no, al quinto pedido
    // se acaba el stock y la sixth sería un 409 de stock, no un 429 de
    // rate limit, y el test no probaría lo que dice probar.
    montarFirestore({ "products/prod-1": docDePrueba({ name: "Hoodie", price: 25000 }) });
    const w = await workerLimpio();
    for (let i = 0; i < 5; i++) await pedirDesdeIp(w, PEDIDO_BASE, "1.1.1.1");
    expect((await pedirDesdeIp(w, PEDIDO_BASE, "1.1.1.1")).status).toBe(429);
    expect((await pedirDesdeIp(w, PEDIDO_BASE, "2.2.2.2")).status).toBe(200);
  });

  it("el límite es por acción:agotar pedidos no frena las cotizaciones", async () => {
    for (let i = 0; i < 6; i++) await pedirDesdeIp(worker, PEDIDO_BASE, "3.3.3.3");
    // rates tiene su propio cupo: no lo tocaron los 6 pedidos.
    const cotizacion = await pedirDesdeIp(worker, { action: "rates", postalCodeDestination: "1425" }, "3.3.3.3");
    expect(cotizacion.status).toBe(200);
  });

  it("las 6 peticiones del atacante ni siquiera tocan Firestore", async () => {
    // El corte tiene que ser ANTES de gastar cualquier API: por eso el
    // rate limit va arriba de todo en el fetch().
    for (let i = 0; i < 5; i++) await pedirDesdeIp(worker, PEDIDO_BASE, "4.4.4.4");
    const lecturasAntes = fs.lecturas.length;
    await pedirDesdeIp(worker, PEDIDO_BASE, "4.4.4.4");
    expect(fs.lecturas).toHaveLength(lecturasAntes);
  });

  it("la ventana se reabre sola pasado el minuto", async () => {
    montarFirestore({ "products/prod-1": docDePrueba({ name: "Hoodie", price: 25000 }) });
    const w = await workerLimpio();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const IP = "5.5.5.5";
    for (let i = 0; i < 6; i++) await pedirDesdeIp(w, PEDIDO_BASE, IP);
    expect((await pedirDesdeIp(w, PEDIDO_BASE, IP)).status).toBe(429);
    vi.advanceTimersByTime(61_000);
    expect((await pedirDesdeIp(w, PEDIDO_BASE, IP)).status).toBe(200);
    vi.useRealTimers();
  });

  it("sin CF-Connecting-IP no rompe (degrada a una IP compartida)", async () => {
    // Cloudflare siempre lo manda, pero si faltara, el Worker tiene que
    // seguir funcionando en vez de romperse con un TypeError.
    const res = await pedir(worker, PEDIDO_BASE, { "CF-Connecting-IP": undefined });
    expect(res.status).toBe(200);
  });

  it("limita notify aparte (10 por minuto)", async () => {
    const IP = "6.6.6.6";
    let saw429 = false;
    for (let i = 0; i < 12; i++) {
      const res = await pedirDesdeIp(worker, { action: "notify", orderId: "x" }, IP);
      if (res.status === 429) {
        saw429 = true;
        break;
      }
    }
    expect(saw429).toBe(true);
  });
});

/* -------------------------------------------------------------- */
describe("signUpload — solo el administrador", () => {
  const pedirFirma = (token, opciones = {}) => {
    const w = opciones.worker || worker;
    return pedir(w, { action: "signUpload" }, token ? { Authorization: `Bearer ${token}` } : {});
  };

  it("sin token: 403", async () => {
    const { status, json } = await pedirFirma(null);
    expect(status).toBe(403);
    expect(json.error).toMatch(/administrador/);
  });

  it("con un token con formato raro: 403 y no se rompe", async () => {
    for (const token of ["abc", "Bearer", "Bearer ", "null", "undefined", "a".repeat(5000)]) {
      const { status } = await pedir(worker, { action: "signUpload" }, { Authorization: token });
      expect(status, `token ${JSON.stringify(token.slice(0, 20))}`).toBe(403);
    }
  });

  it("Firebase rechaza el token: 403 (fail closed)", async () => {
    // El falso de identitytoolkit responde 401 cuando no hay adminUid.
    const { status } = await pedirFirma("token-falso");
    expect(status).toBe(403);
  });

  it("con un usuario logueado que NO es el admin: 403", async () => {
    montarFirestore({}, { adminUid: "un-uid-cualquiera" });
    const { status } = await pedirFirma("token-de-otro-usuario");
    expect(status).toBe(403);
  });

  it("con el UID del admin: firma y devuelve los datos públicos", async () => {
    montarFirestore({}, { adminUid: ADMIN_UID });
    const w = await workerLimpio();
    const { status, json } = await pedir(
      w,
      { action: "signUpload" },
      { Authorization: "Bearer token-del-admin", env: { CLOUDINARY_CLOUD_NAME: "skul" } }
    );
    expect(status).toBe(200);
    expect(json.signature).toMatch(/^[0-9a-f]{40}$/);
    expect(json.folder).toBe("skul-productos");
    expect(json.cloudName).toBe("skul");
  });

  it("NUNCA devuelve el API secret (aunque firme)", async () => {
    montarFirestore({}, { adminUid: ADMIN_UID });
    const w = await workerLimpio();
    const { texto } = await pedir(
      w,
      { action: "signUpload" },
      { Authorization: "Bearer token", env: { CLOUDINARY_API_SECRET: "SECRETO-SUPREMO", CLOUDINARY_CLOUD_NAME: "skul" } }
    );
    expect(texto).not.toContain("SECRETO-SUPREMO");
  });

  it("falla 403 (no 503) si faltan los secretos: primero permisos, después config", async () => {
    // El orden importa: sin token, ni siquiera tiene que mirar la config.
    const { status } = await pedirFirma("cualquier-token");
    expect(status).toBe(403);
  });
});

/* -------------------------------------------------------------- */
describe("Los datos del comprador NO se filtran", () => {
  it("orderTracking (público) no tiene nombre, teléfono ni dirección", async () => {
    await pedir(worker, {
      ...PEDIDO_BASE,
      zoneId: "correo",
      orderName: "Ana Perez",
      orderPhone: "1155555555",
      orderAddress: "Av Siempreviva 742",
      correoQuote: { type: "domicilio", postalCode: "1425", provinceCode: "C" },
    });

    const tracking = escriturasDelCommit().find((e) => e.coleccion === "orderTracking");
    expect(tracking).toBeTruthy();
    const serializado = JSON.stringify(tracking.campos);
    expect(serializado).not.toContain("Ana");
    expect(serializado).not.toContain("1155555555");
    expect(serializado).not.toContain("Siempreviva");
  });

  it("orderTracking tampoco guarda el medio de pago", async () => {
    await pedir(worker, { ...PEDIDO_BASE, payMethod: "transferencia" });
    const tracking = escriturasDelCommit().find((e) => e.coleccion === "orderTracking");
    expect(JSON.stringify(tracking.campos)).not.toContain("transferencia");
  });

  it("el pedido privado SÍ tiene los datos (es lo que usa el admin)", async () => {
    await pedir(worker, { ...PEDIDO_BASE, orderName: "Ana Perez", orderPhone: "1155555555" });
    const pedido = escriturasDelCommit().find((e) => e.coleccion === "orders");
    expect(pedido.campos.orderName).toBe("Ana Perez");
    expect(pedido.campos.orderPhone).toBe("1155555555");
  });

  it("subscribe arma el mensaje con el email del documento, no con el que manda el cliente", async () => {
    const { llamadas, fs: store } = montarFirestore(
      {
        "newsletter/juan%40ejemplo.com": docDePrueba({ email: "juan@ejemplo.com", source: "footer", consent: true }),
      },
      {}
    );
    const w = await workerLimpio();
    const { status } = await pedir(w, {
      action: "subscribe",
      subscriberId: "juan@ejemplo.com",
      // El atacante intenta escribir lo que quiera en el mensaje:
      text: " hacked",
      email: "victima@banco.com",
    });
    expect(status).toBe(200);
    const telegram = llamadas.find((c) => c.url.includes("telegram"));
    const mensaje = telegram.cuerpo.text;
    expect(mensaje).toContain("juan@ejemplo.com");
    expect(mensaje).not.toContain("victima@banco.com");
    expect(mensaje).not.toContain("hacked");
    expect(store.commits).toHaveLength(0);
  });

  it("subscribe rechaza un id con traversal (no lee otras colecciones)", async () => {
    for (const id of ["../settings/site", "a/../../orders/x", "x".repeat(300)]) {
      const { status } = await pedir(worker, { action: "subscribe", subscriberId: id });
      expect(status, `id ${id}`).toBe(400);
    }
  });

  it("notify devuelve 404 si el pedido no existe, sin revelar nada más", async () => {
    const { status, texto } = await pedir(worker, { action: "notify", orderId: "no-existe" });
    expect(status).toBe(404);
    expect(texto).not.toMatch(/stack|at \w+|node_modules/);
  });
});

/* -------------------------------------------------------------- */
describe("Los errores no filtran detalles internos", () => {
  it("si Firestore está caído, el cliente recibe un mensaje genérico", async () => {
    const w = await workerLimpio();
    const original = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (String(url).includes("firestore")) {
        return new Response(
          JSON.stringify({
            error: { message: "PERMISSION_DENIED: project skul-private missing", status: "PERMISSION_DENIED" },
          }),
          { status: 403 }
        );
      }
      return original(url);
    };
    const { status, texto } = await pedir(w, PEDIDO_BASE);
    globalThis.fetch = original;

    expect(status).toBe(500);
    // El mensaje del cliente es genérico...
    expect(texto).toMatch(/No se pudo completar/);
    // ...y el detalle crudo NO viaja al cliente.
    expect(texto).not.toContain("PERMISSION_DENIED");
    expect(texto).not.toContain("skul-private");
  });

  it("el detalle sí queda en el log del Worker (para poder diagnosticar)", async () => {
    const w = await workerLimpio();
    const logs = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...a) => logs.push(a.join(" ")));
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response("boom", { status: 403 });

    await pedir(w, PEDIDO_BASE);

    globalThis.fetch = original;
    spy.mockRestore();
    expect(logs.join("\n")).toMatch(/createOrder|boom|Error/);
  });
});

/* -------------------------------------------------------------- */
describe("El archivo del Worker no tiene secretos escritos a mano", () => {
  const codigo = readFileSync(RUTA_WORKER, "utf8");

  it("nunca asigna una clave privada a un texto fijo", () => {
    // La palabra "-----BEGIN PRIVATE KEY-----" SÍ aparece en el archivo,
    // pero en comentarios que explican el formato y en el `.replace()` que
    // LIMPIA el header de la clave que viene de `env`. Lo peligroso sería
    // una asignación de una clave completa, que quedaría en el repo (y en
    // el historial de git) para siempre.
    const asignaciones = codigo.match(/PRIVATE_KEY\s*[:=]\s*["'`]/g) || [];
    expect(asignaciones).toHaveLength(0);
  });

  it("la clave privada solo se lee de env", () => {
    expect(codigo).toMatch(/env\.FIREBASE_PRIVATE_KEY/);
    // Y el uso real es sobre el valor de env, nunca sobre un literal.
    expect(codigo).not.toMatch(/signerJwt\(\s*["']-----BEGIN/);
  });

  it("no hay un bloque base64 largo al lado de la palabra PRIVATE KEY", () => {
    // Segunda red: aunque el header esté en un string partido, el cuerpo
    // de la clave (miles de caracteres base64) seguiría en el archivo.
    const bloques = codigo.match(/[A-Za-z0-9+/=]{200,}/g) || [];
    expect(bloques, "hay un bloque larguísimo de texto: ¿es una clave?").toHaveLength(0);
  });

  it.each([
    [/AIza[0-9A-Za-z_-]{35}/, "API key de Google"],
    [/\b\d{10}-[0-9]{8}-[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{10}\b/, "un CUIT/CUIL hardcodeado"],
    [/[\w.-]+@[\w-]+\.[a-z]{2,}/i, "un email de cuenta"],
  ])("no tiene %s pegado en el código", (patron, que) => {
    // Los emails de documentación están permitidos si son de ejemplo;
    // lo que no puede aparecer es una credencial.
    const encontrados = codigo.match(patron) || [];
    const sospechosos = encontrados.filter(
      (v) => !/example|ejemplo|tu-usuario|firma|@skul|test/i.test(v)
    );
    expect(sospechosos, `encontrado: ${sospechosos.join(", ")}`).toHaveLength(0);
  });

  it("el token de Telegram y la contraseña de MiCorreo SOLO se leen de env", () => {
    // Si alguno estuviera escrito como literal, la credencial quedaría en
    // el repositorio y en el historial de git para siempre.
    expect(codigo).not.toMatch(/TELEGRAM_BOT_TOKEN\s*=\s*["']\d+:/);
    expect(codigo).not.toMatch(/CORREO_PASSWORD\s*=\s*["'][^"']+["']/);
    expect(codigo).not.toMatch(/CLOUDINARY_API_SECRET\s*=\s*["'][a-z0-9]{15,}["']/i);
  });

  it("las credenciales se leen siempre de env.X", () => {
    for (const clave of ["TELEGRAM_BOT_TOKEN", "CORREO_USER", "CORREO_PASSWORD", "CLOUDINARY_API_SECRET"]) {
      expect(codigo).toMatch(new RegExp(`env\\.${clave}`));
    }
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