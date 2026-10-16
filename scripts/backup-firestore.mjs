/**
 * ============================================================================
 * BACKUP (Y RESTAURACIÓN) DE FIRESTORE
 * ============================================================================
 *
 * Baja TODAS las colecciones de la base a archivos JSON en una carpeta local,
 * y sabe volver a subirlas. Es el respaldo de los datos de la tienda: pedidos,
 * productos, gift cards, cupones, newsletter y solicitudes de arrepentimiento.
 *
 * POR QUÉ EXISTE: el plan gratis de Firebase NO tiene backups automáticos (los
 * respaldos administrados de Google piden el plan pago: el comando responde
 * "This API method requires billing to be enabled"). Sin esto, un borrado
 * accidental desde /admin no tiene vuelta atrás.
 *
 * LO QUE NO ES: no es un snapshot de la infraestructura ni de las reglas. Las
 * reglas viven en `firestore.rules` (versionado en git) y los secretos en el
 * Worker de Cloudflare. Acá solo van DATOS.
 *
 * ---------------------------------------------------------------------------
 * CÓMO SE USA
 * ---------------------------------------------------------------------------
 *   npm run backup                       → baja todo a backups/firestore-<fecha>/
 *   npm run backup -- --out <carpeta>    → elige la carpeta de salida
 *   node scripts/backup-firestore.mjs --restore <carpeta>            (simula)
 *   node scripts/backup-firestore.mjs --restore <carpeta> --confirmar (escribe)
 *
 * La restauración escribe documento por documento con PATCH (upsert): los
 * documentos que están en el backup se pisan con el contenido respaldado y los
 * que no están en el backup NO se tocan. No borra nada.
 *
 * ---------------------------------------------------------------------------
 * CREDENCIALES (sólo cuando NO está el emulador)
 * ---------------------------------------------------------------------------
 * Hace falta una clave de servicio de Firebase, que se baja desde la consola:
 *   Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada
 *
 * El archivo tiene permiso TOTAL sobre la base, así que:
 *   - guardalo FUERA de este repo (por defecto se busca en ~/.skul-backup-key.json),
 *   - nunca lo subas a git ni lo pegues en un chat.
 *
 * La ruta se puede pasar por `--key <ruta>` o por la variable de entorno
 * `GOOGLE_APPLICATION_CREDENTIALS` (la convención de Google).
 *
 * ---------------------------------------------------------------------------
 * OJO CON LOS DATOS PERSONALES
 * ---------------------------------------------------------------------------
 * El backup de /orders incluye nombre, teléfono y dirección de tus clientes.
 * Por eso `backups/` está en .gitignore: esa carpeta NUNCA va a GitHub.
 *
 * ---------------------------------------------------------------------------
 * CÓMO FUNCIONA (para el que lo tenga que tocar)
 * ---------------------------------------------------------------------------
 * Habla directo con la API REST de Firestore, sin dependencias nuevas:
 *   1) firma un JWT con la clave de servicio (RS256, con `node:crypto`),
 *   2) lo canjea por un token de acceso en el endpoint de OAuth de Google,
 *   3) lista las colecciones (`:listCollectionIds`) y pagina los documentos,
 *   4) traduce cada valor del formato de Firestore a JSON común y viceversa.
 *
 * El formato de Firestore es raro: cada campo es un objeto con el tipo adentro
 * (`{ stringValue: "hola" }`) y no todos los tipos tienen equivalente en JSON
 * (un timestamp no es un string). Por eso lo que no es JSON nativo se guarda
 * marcado con `__tipo` (por ejemplo `{ "__tipo": "timestamp", "valor": "..." }`):
 * así el round-trip no pierde tipos y la restauración queda exacta.
 * ============================================================================
 */
import { createSign } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// El proyecto sale del entorno cuando corre dentro del emulador (que exporta
// GCLOUD_PROJECT); si no, es el proyecto de verdad.
export const PROYECTO =
  process.env.FIRESTORE_PROJECT || process.env.GCLOUD_PROJECT || "skullt";
export const BASE_DE_DATOS = "(default)";

// `firebase emulators:exec` exporta FIRESTORE_EMULATOR_HOST. Si está, todo el
// script apunta al emulador y no hace falta ninguna credencial.
export const EN_EMULADOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

const RAIZ = EN_EMULADOR
  ? `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${PROYECTO}/databases/${BASE_DE_DATOS}/documents`
  : `https://firestore.googleapis.com/v1/projects/${PROYECTO}/databases/${BASE_DE_DATOS}/documents`;

/**
 * El nombre de recurso de los documentos, SIN el host. Es el que espera la API
 * adentro de un lote de escrituras (`:commit`): ahí el `name` tiene que ser
 * `projects/.../documents/...`, no una URL.
 */
export const NOMBRE_RAIZ = `projects/${PROYECTO}/databases/${BASE_DE_DATOS}/documents`;

// Cuando no hay emulador, el token viene de la clave de servicio. En el
// emulador alcanza con "owner": el emulador trata ese valor como admin y saltea
// las reglas (es el mismo truco que usa @firebase/rules-unit-testing).
export const TOKEN_EMULADOR = "owner";
export const RUTA_CLAVE_POR_DEFECTO = path.join(homedir(), ".skul-backup-key.json");

/* ============================================================================
   TRADUCCIÓN DE VALORES (Firestore ⇄ JSON)
   ============================================================================ */

/**
 * Convierte un valor del formato de Firestore a JSON común.
 * Lo que no existe en JSON (timestamp, referencia, geopunto, bytes) sale
 * marcado con `__tipo` para poder reconstruirlo al restaurar.
 */
export function fromFirestoreValue(v) {
  if (v == null) throw new Error("Valor de Firestore vacío");
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return { __tipo: "timestamp", valor: v.timestampValue };
  if ("referenceValue" in v) return { __tipo: "referencia", valor: v.referenceValue };
  if ("geoPointValue" in v) return { __tipo: "geopunto", valor: { ...v.geoPointValue } };
  if ("bytesValue" in v) return { __tipo: "bytes", valor: v.bytesValue };
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromFirestoreValue);
  if ("mapValue" in v) return fromFirestoreFields(v.mapValue.fields || {});
  throw new Error(`Tipo de valor de Firestore no soportado: ${JSON.stringify(v).slice(0, 80)}`);
}

/** El camino de vuelta: JSON común → valor de Firestore. */
export function toFirestoreValue(x) {
  if (x === null || x === undefined) return { nullValue: null };
  switch (typeof x) {
    case "boolean":
      return { booleanValue: x };
    case "number":
      if (!Number.isFinite(x)) throw new Error(`Número inválido: ${x}`);
      // Firestore distingue entero de decimal (y manda el entero como string).
      return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
    case "string":
      return { stringValue: x };
    case "object":
      break;
    default:
      throw new Error(`Tipo de valor no soportado: ${typeof x}`);
  }
  if (Array.isArray(x)) return { arrayValue: { values: x.map(toFirestoreValue) } };
  if (x.__tipo === "timestamp") return { timestampValue: x.valor };
  if (x.__tipo === "referencia") return { referenceValue: x.valor };
  if (x.__tipo === "geopunto") return { geoPointValue: x.valor };
  if (x.__tipo === "bytes") return { bytesValue: x.valor };
  return { mapValue: { fields: toFirestoreFields(x) } };
}

/** Convierte el mapa de campos completo (el `fields` de un documento). */
export function fromFirestoreFields(fields) {
  const salida = {};
  for (const [clave, valor] of Object.entries(fields || {})) {
    salida[clave] = fromFirestoreValue(valor);
  }
  return salida;
}

/** El camino de vuelta del mapa de campos. */
export function toFirestoreFields(datos) {
  const salida = {};
  for (const [clave, valor] of Object.entries(datos || {})) {
    salida[clave] = toFirestoreValue(valor);
  }
  return salida;
}

/**
 * Saca el id del documento de su nombre completo.
 * `.../documents/products/ABC` → `ABC` (decodificado: los ids pueden traer
 * caracteres escapados, como los emails del newsletter).
 */
export function docIdFromName(nombre) {
  const partes = String(nombre).split("/documents/");
  const relativo = partes.length > 1 ? partes[1] : String(nombre);
  const segmentos = relativo.split("/");
  return decodeURIComponent(segmentos[segmentos.length - 1]);
}

/* ============================================================================
   CREDENCIALES
   ============================================================================ */

/** Dónde está la clave de servicio: la que le pasaron o la de siempre. */
export function rutaDeCredenciales(rutaPasada) {
  return rutaPasada || process.env.GOOGLE_APPLICATION_CREDENTIALS || RUTA_CLAVE_POR_DEFECTO;
}

/**
 * Firma un JWT con la clave privada de la cuenta de servicio y lo canjea por un
 * token de acceso. Es el mismo mecanismo que usan las librerías de Google, pero
 * escrito a mano para no sumar dependencias.
 */
export async function tokenDeServicio(credenciales) {
  if (!credenciales?.client_email || !credenciales?.private_key) {
    throw new Error("La clave de servicio no tiene client_email o private_key.");
  }
  const ahora = Math.floor(Date.now() / 1000);
  const jwt = [
    base64url(JSON.stringify({ alg: "RS256", typ: "JWT" })),
    base64url(
      JSON.stringify({
        iss: credenciales.client_email,
        scope: "https://www.googleapis.com/auth/datastore",
        aud: "https://oauth2.googleapis.com/token",
        iat: ahora,
        exp: ahora + 3600,
      })
    ),
  ];
  const firmador = createSign("RSA-SHA256");
  firmador.update(jwt.join("."));
  jwt.push(base64url(firmador.sign(credenciales.private_key)));

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt.join("."),
    }),
  });
  const datos = await res.json().catch(() => null);
  if (!res.ok || !datos?.access_token) {
    throw new Error(
      `No pude pedir el token de acceso (HTTP ${res.status}): ${JSON.stringify(datos).slice(0, 300)}`
    );
  }
  return datos.access_token;
}

function base64url(texto) {
  return Buffer.from(texto).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Lee la clave de servicio del disco y avisa con un mensaje claro si falta. */
export async function cargarCredenciales(ruta) {
  if (!existsSync(ruta)) {
    throw new Error(
      `No encontré la clave de servicio en "${ruta}".\n` +
        "  Bajala desde Firebase → Configuración del proyecto → Cuentas de servicio →\n" +
        "  Generar nueva clave privada, guardala FUERA del repo y pasá la ruta con\n" +
        "  --key <ruta> o con la variable GOOGLE_APPLICATION_CREDENTIALS."
    );
  }
  const credenciales = JSON.parse(await readFile(ruta, "utf8"));
  return credenciales;
}

/* ============================================================================
   CLIENTE HTTP
   ============================================================================ */

/** Cliente mínimo: arma el header de autorización y traduce los errores. */
export function crearCliente(token) {
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  return {
    async pedir(url, opciones = {}) {
      const metodo = opciones.method || "GET";
      const res = await fetch(url, {
        method: metodo,
        headers,
        body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
      });
      const texto = await res.text();
      if (!res.ok) {
        throw new Error(`${metodo} ${url} → ${res.status} ${res.statusText}: ${texto.slice(0, 400)}`);
      }
      return texto ? JSON.parse(texto) : null;
    },
  };
}

/**
 * Resuelve el token: en el emulador no hace falta nada, y contra producción se
 * pide a partir de la clave de servicio.
 */
export async function resolverToken(rutaClave) {
  if (EN_EMULADOR) return TOKEN_EMULADOR;
  return tokenDeServicio(await cargarCredenciales(rutaDeCredenciales(rutaClave)));
}

/* ============================================================================
   LECTURA Y ESCRITURA
   ============================================================================ */

/** Nombres de todas las colecciones de la base (paginado). */
export async function listarColecciones(cli) {
  const ids = [];
  let pageToken;
  do {
    const r = await cli.pedir(`${RAIZ}:listCollectionIds`, {
      method: "POST",
      body: { pageSize: 300, ...(pageToken ? { pageToken } : {}) },
    });
    ids.push(...(r.collectionIds || []));
    pageToken = r.nextPageToken;
  } while (pageToken);
  return ids.sort();
}

/**
 * Todos los documentos de una colección, ya traducidos a JSON común.
 * Va paginado porque la API devuelve como mucho 300 por vuelta: si no se
 * siguiera el `nextPageToken`, un backup de una colección grande guardaría
 * solo los primeros 300 documentos y parecería que salió bien.
 */
export async function leerColeccion(cli, nombre) {
  const docs = [];
  let pageToken;
  do {
    const q = new URLSearchParams({ pageSize: "300" });
    if (pageToken) q.set("pageToken", pageToken);
    const r = await cli.pedir(`${RAIZ}/${encodeURIComponent(nombre)}?${q.toString()}`);
    for (const d of r.documents || []) {
      docs.push({ id: docIdFromName(d.name), datos: fromFirestoreFields(d.fields) });
    }
    pageToken = r.nextPageToken;
  } while (pageToken);
  return docs;
}

/**
 * Baja todas las colecciones a `carpeta` (un JSON por colección + manifest.json
 * con el resumen). Devuelve el manifiesto.
 */
export async function respaldar(cli, { carpeta }) {
  const colecciones = await listarColecciones(cli);
  await mkdir(carpeta, { recursive: true });
  const manifiesto = {
    proyecto: PROYECTO,
    base: BASE_DE_DATOS,
    fecha: new Date().toISOString(),
    emulador: EN_EMULADOR,
    colecciones: {},
  };
  for (const nombre of colecciones) {
    const docs = await leerColeccion(cli, nombre);
    const archivo = `${nombre.replace(/[^\w.-]/g, "_")}.json`;
    await writeFile(path.join(carpeta, archivo), JSON.stringify(docs, null, 2) + "\n", "utf8");
    manifiesto.colecciones[nombre] = { documentos: docs.length, archivo };
    console.log(`  ${nombre}: ${docs.length} documento(s)`);
  }
  await writeFile(path.join(carpeta, "manifest.json"), JSON.stringify(manifiesto, null, 2) + "\n", "utf8");
  return manifiesto;
}

/**
 * Vuelve a escribir en la base lo que hay en `carpeta`.
 * Con `seco: true` solo cuenta lo que haría, sin escribir nada.
 * No borra documentos: los del backup se pisan, el resto queda igual.
 */
export async function restaurar(cli, { carpeta, seco = false }) {
  const manifiesto = JSON.parse(await readFile(path.join(carpeta, "manifest.json"), "utf8"));
  let escritos = 0;
  for (const [nombre, info] of Object.entries(manifiesto.colecciones || {})) {
    const docs = JSON.parse(await readFile(path.join(carpeta, info.archivo), "utf8"));
    for (const doc of docs) {
      escritos++;
      if (seco) continue;
      await cli.pedir(`${RAIZ}/${encodeURIComponent(nombre)}/${encodeURIComponent(doc.id)}`, {
        method: "PATCH",
        body: { fields: toFirestoreFields(doc.datos) },
      });
    }
    console.log(`  ${nombre}: ${docs.length} documento(s)`);
  }
  return escritos;
}

/* ============================================================================
   INTERFAZ DE LÍNEA DE COMANDOS
   ============================================================================ */

function marcaDeTiempo() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function leerArgumentos(argv) {
  const args = { clave: null, salida: null, restaurar: null, seco: false, confirmar: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--key") args.clave = argv[++i];
    else if (a === "--out") args.salida = argv[++i];
    else if (a === "--restore") args.restaurar = argv[++i];
    else if (a === "--dry-run") args.seco = true;
    else if (a === "--confirmar") args.confirmar = true;
    else if (a === "--help" || a === "-h") args.ayuda = true;
    else throw new Error(`Argumento desconocido: ${a}`);
  }
  return args;
}

const AYUDA = `Backup y restauración de Firestore (proyecto ${PROYECTO})

  npm run backup                         baja todo a backups/firestore-<fecha>/
  npm run backup -- --out <carpeta>      elige la carpeta de salida
  node scripts/backup-firestore.mjs --restore <carpeta> --dry-run
  node scripts/backup-firestore.mjs --restore <carpeta> --confirmar

  --key <ruta>   clave de servicio (si no, GOOGLE_APPLICATION_CREDENTIALS o
                 ${RUTA_CLAVE_POR_DEFECTO})
`;

async function main() {
  const args = leerArgumentos(process.argv.slice(2));
  if (args.ayuda) {
    console.log(AYUDA);
    return;
  }

  const token = await resolverToken(args.clave);
  const cli = crearCliente(token);

  const destino = EN_EMULADOR
    ? `emulador ${process.env.FIRESTORE_EMULATOR_HOST}`
    : `proyecto ${PROYECTO}`;
  console.log(`\nFirestore (${destino})\n`);

  if (args.restaurar) {
    if (!EN_EMULADOR && !args.confirmar) {
      throw new Error(
        "Estás por restaurar sobre la base DE VERDAD. Si es lo que querés, agregá --confirmar.\n" +
          "  (Probá primero con --dry-run, que muestra qué haría sin escribir nada.)"
      );
    }
    console.log(`Restaurando desde ${args.restaurar}${args.seco ? " (simulación)" : ""}...`);
    const escritos = await restaurar(cli, { carpeta: args.restaurar, seco: args.seco });
    console.log(`\n${escritos} documento(s) ${args.seco ? "a restaurar" : "restaurado(s)"}.\n`);
    return;
  }

  const carpeta = args.salida || path.resolve(process.cwd(), "backups", `firestore-${marcaDeTiempo()}`);
  console.log(`Respaldando en ${carpeta} ...`);
  const manifiesto = await respaldar(cli, { carpeta });
  const total = Object.values(manifiesto.colecciones).reduce((n, c) => n + c.documentos, 0);
  console.log(`\nListo: ${total} documento(s) en ${Object.keys(manifiesto.colecciones).length} colección(es).`);
  console.log(`Carpeta: ${carpeta}`);
  if (!EN_EMULADOR) {
    console.log("OJO: esta carpeta tiene datos de clientes. No la subas a git ni la compartas.\n");
  }
}

// Solo corre main() cuando se lo llama de verdad (no cuando un test lo importa).
const esEjecucionDirecta =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esEjecucionDirecta) {
  main().catch((err) => {
    console.error(`\n${err.message}\n`);
    process.exit(1);
  });
}
