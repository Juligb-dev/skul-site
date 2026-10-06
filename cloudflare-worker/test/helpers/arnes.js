/**
 * ============================================================
 *  ARNÉS PARA LLAMAR AL WORKER
 * ------------------------------------------------------------
 *  Tres cosas que se repiten en cada test y que conviene tener en un
 *  solo lugar:
 *
 *  1. `workerLimpio()`: una instancia NUEVA del módulo en cada test.
 *     No es purismo: el Worker tiene dos variables a nivel de módulo
 *     (`golpes`, el cuaderno del rate limit, y `cachedToken`). Si dos
 *     tests compartieran la instancia, el segundo encontraría la
 *     ventana del rate limit ya abierta por el primero y los
 *     resultados dependerían del orden. Con un módulo nuevo por test,
 *     cada uno arranca limpio.
 *
 *  2. `pedir()`: atajo para armar el POST con el body JSON y devolver
 *     { status, json, headers } en vez de tener que hacer await
 *     res.json() en cada test.
 *
 *  3. `envDePrueba()`: un `env` sin secretos. OJO — acá NO se pone
 *     ninguna credencial real: los tests del Worker tienen que poder
 *     correr en cualquier máquina sin configurar nada, y un secreto
 *     pegado en un archivo de test es un secreto en el repositorio.
 * ============================================================
 */
import { vi } from "vitest";
import { instalarFetchFalso, crearFirestoreFalso } from "./firestore-falso.js";

/** Módulo nuevo del Worker (rate limit y token en blanco). */
export const workerLimpio = async () => {
  vi.resetModules();
  const mod = await import("../../worker.js");
  return mod.default;
};

/** `env` sin ningún secreto real. */
export const envDePrueba = (extra = {}) => ({
  FIREBASE_API_KEY: "api-key-de-prueba",
  // Sin FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY el Worker no pide
  // token a Google, que es lo más simple para testear: los docs privados
  // los probamos aparte con las reglas de verdad (`npm run test:rules`).
  TELEGRAM_BOT_TOKEN: "",
  TELEGRAM_CHAT_ID: "",
  CORREO_BASE_URL: "https://micorreo-de-prueba.test",
  CORREO_USER: "usuario-de-prueba",
  CORREO_PASSWORD: "clave-de-prueba",
  CORREO_CUSTOMER_ID: "00000000",
  CORREO_ORIGIN_POSTAL_CODE: "1408",
  CLOUDINARY_API_SECRET: "secreto-de-prueba-para-firmar",
  CLOUDINARY_API_KEY: "key-de-prueba",
  ...extra,
});

/** Un pedido POST con el body JSON que espera el Worker. */
export const pedir = async (worker, body, cabeceras = {}) => {
  const req = new Request("https://worker.skul.test", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cabeceras },
    body: JSON.stringify(body),
  });
  const res = await worker.fetch(req, envDePrueba(cabeceras.env || {}));
  const texto = await res.text();
  let json = null;
  try {
    json = JSON.parse(texto);
  } catch {
    /* no todas las respuestas son JSON */
  }
  return { status: res.status, texto, json, headers: res.headers };
};

/** Pide algo con una IP concreta (para probar el rate limit). */
export const pedirDesdeIp = async (worker, body, ip, cabeceras = {}) =>
  pedir(worker, body, { "CF-Connecting-IP": ip, ...cabeceras });

/** Prepara el Firestore falso + el fetch falso y devuelve el set. */
export const montarFirestore = (docs = {}, opcionesFetch = {}) => {
  const fs = crearFirestoreFalso();
  for (const [path, doc] of Object.entries(docs)) fs.docs.set(path, doc);
  const llamadas = instalarFetchFalso(fs, opcionesFetch);
  return { fs, llamadas };
};

/** Los productos que se usan en los tests de pedidos. */
export const PRODUCTO = {
  name: "Hoodie Concrete",
  cat: "hoodies",
  price: 25000,
  weight: 600,
  active: true,
  stock: { S: 2, M: 5, L: 1 },
};

/** Un pedido mínimo válido (todo lo demás es opcional).
 *  `zoneId: "local"` es el retiro en el local: cuesta $0, que deja los
 *  números de los tests easy de leer (el total es solo el precio de las
 *  prendas). Los envíos con costo se prueban aparte, con Correo.
 */
export const PEDIDO_BASE = {
  action: "createOrder",
  orderName: "Ana Perez",
  orderPhone: "1155555555",
  zoneId: "local",
  payMethod: "debito",
  items: [{ id: "prod-1", size: "M", qty: 1 }],
};