/**
 * ============================================================
 *  FIRESTORE EN MEMORIA (mock para las pruebas)
 * ------------------------------------------------------------
 *  Qué es: una implementación de las funciones de `firebase/firestore` que
 *  guarda los documentos en un Map, dentro del proceso del test. No hay
 *  red, no hay emulador, no hay riesgo de tocar el Firebase real.
 *
 *  Por qué.exists: para poder probar la lógica REAL de los hooks
 *  (useCoupons, useGiftCards, useOrders, useNewsletter) tal como la ve la
 *  app, sin reescribir el código que se quiere testear. Si en vez de esto
 *  reescribimos los hooks para los tests, estaríamos probando una copia y
 *  no el código que corre en producción.
 *
 *  Qué NO simula (y está bien que no):
 *   - Las REGLAS de seguridad. Estas las testean los tests del emulador
 *     (`npm run test:rules`), que levantan el Firestore real con el
 *     firestore.rules del proyecto. Acá no hay reglas: el mock deja
 *     escribir cualquier cosa, porque acá probamos LÓGICA, no permisos.
 *   - La atomicidad de los batches. `commit()` aplica todo o nada, como
 *     el real, pero sin concurrencia real.
 *
 *  Control desde los tests:
 *    - `__fs.seed("products/abc", {...})` pone un documento.
 *    - `__fs.get("coupons/SKUL10")` lee uno (o devuelve null).
 *    - `__fs.reset()` borra todo: se llama entre tests.
 *    - `__fs.fail(path, error)` hace que las escrituras/lecturas de ese
 *      documento tiren el error indicado (para probar los catch).
 *    - `__fs.emit(collPath)` dispara los onSnapshot suscritos, como si
 *      alguien guardara algo en la base.
 * ============================================================
 */
import { vi } from "vitest";

/* ------------------------------------------------------------------
 * Estado: el "almacén" de documentos
 * ------------------------------------------------------------------ */
const docs = new Map(); // "coleccion/id" -> { campos }
const listeners = new Map(); // path -> Set<handler>
const failures = new Map(); // path -> error que se tira al tocar ese doc

const pathOf = (...segs) => segs.filter(Boolean).join("/");

/** Timestamp que imita al de Firestore (tiene toDate y toMillis). */
export class FakeTimestamp {
  constructor(ms = Date.now()) {
    this.ms = ms;
    this._isFakeTimestamp = true;
  }
  toDate() {
    return new Date(this.ms);
  }
  toMillis() {
    return this.ms;
  }
}

/** serverTimestamp(): en el SDK real devuelve algo que se resuelve al guardar. */
export const serverTimestamp = () => new FakeTimestamp();

/* ------------------------------------------------------------------
 * Referencias: collection() y doc()
 * ------------------------------------------------------------------ */
export const collection = (_db, name) => ({ __kind: "collection", path: name });

export const doc = (_db, ...path) => {
  const parts = Array.isArray(path[0]) ? path[0] : path;
  return { __kind: "doc", path: pathOf(...parts) };
};

/** query()/where()/orderBy(): el mock los acepta y no filtra nada. */
export const query = (ref, ..._constraints) => ({ ...ref, __kind: "query" });
export const where = () => ({ __kind: "constraint" });
export const orderBy = () => ({ __kind: "constraint" });
export const limit = () => ({ __kind: "constraint" });
export const startAt = () => ({ __kind: "constraint" });
export const endAt = () => ({ __kind: "constraint" });

/* ------------------------------------------------------------------
 * Snapshots: el objeto que el código recibe de getDoc / onSnapshot
 * ------------------------------------------------------------------ */
const snapshot = (id, data) => ({
  id,
  exists: () => data !== null,
  data: () => (data === null ? undefined : { ...data }),
  ref: { path: id },
});

/** Busca los docs de una colección (o un doc exacto si la ref es de doc). */
function readRef(ref) {
  const p = ref.path;
  if (p.includes("/")) {
    const data = docs.get(p);
    return { id: p.split("/")[1], data: data ?? null };
  }
  const prefix = p + "/";
  const found = [...docs.entries()]
    .filter(([k]) => k.startsWith(prefix))
    .map(([k, v]) => ({ id: k.slice(prefix.length), data: v }));
  return found;
}

/* ------------------------------------------------------------------
 * Lecturas
 * ------------------------------------------------------------------ */
export const getDoc = async (ref) => {
  throwIfFails(ref.path);
  const { id, data } = readRef(ref);
  return snapshot(id, data);
};

export const getDocs = async (ref) => {
  throwIfFails(ref.path);
  const rows = readRef(ref);
  return { docs: rows.map((r) => snapshot(r.id, r.data)), empty: rows.length === 0, size: rows.length };
};

export const exists = async (ref) => (await getDoc(ref)).exists();

/* ------------------------------------------------------------------
 * Escrituras
 * ------------------------------------------------------------------ */
function throwIfFails(path) {
  if (failures.has(path)) throw failures.get(path);
}

const mergeInto = (base, patch) => {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    // Un objeto común se fusiona campo a campo (por ejemplo el mapa `stock`
    // de un producto: si solo se manda una talla, las demás no se borran).
    // Los arrays y los Timestamp se reemplazan enteros.
    const esObjeto = v && typeof v === "object" && !Array.isArray(v) && !(v instanceof FakeTimestamp);
    out[k] = esObjeto ? mergeInto(base?.[k] ?? {}, v) : v;
  }
  return out;
};

export const setDoc = async (ref, data, opts = {}) => {
  throwIfFails(ref.path);
  const current = docs.get(ref.path);

  // Simula UNA regla de firestore.rules, la única de la que depende la
  // lógica del sitio: /newsletter deja "create" a cualquiera pero
  // "update" SOLO al admin y al Worker. El hook subscribeToNewsletter
  // escribe con el ID fijo (el email) y usa el "permission-denied" de
  // una reescritura para saber que el correo ya estaba en la lista (las
  // reglas impiden al visitante LEER la colección, así que no puede
  // consultarlo antes). Si este mock dejara sobreescribir aunque sea el
  // de newsletter, el mensaje "ya estabas en la lista" no solo no se
  // probaría: tampoco existiría en el sitio real, porque depende de
  // esta regla.
  if (ref.path.startsWith("newsletter/") && current) {
    const err = new Error("Permission denied (la regla de newsletter deja update solo al admin y al Worker)");
    err.code = "permission-denied";
    throw err;
  }

  docs.set(ref.path, opts.merge && current ? mergeInto(current, data) : { ...data });
  notify(ref.path);
};

export const addDoc = async (colRef, data) => {
  const id = `mock-id-${docs.size + 1}`;
  const path = pathOf(colRef.path, id);
  throwIfFails(path);
  docs.set(path, { ...data });
  notify(colRef.path);
  return { id };
};

export const updateDoc = async (ref, data) => {
  throwIfFails(ref.path);
  const current = docs.get(ref.path);
  if (!current) {
    // El Firestore real tira FAILED_PRECONDITION si updateDoc apunta a un
    // doc que no existe. Lo reproducimos: hay un test que depende de eso.
    const err = new Error("No document to update: " + ref.path);
    err.code = "not-found";
    throw err;
  }
  docs.set(ref.path, mergeInto(current, data));
  notify(ref.path);
};

export const deleteDoc = async (ref) => {
  throwIfFails(ref.path);
  docs.delete(ref.path);
  notify(ref.path);
};

export const deleteField = vi.fn();

/* ------------------------------------------------------------------
 * Batch (lo usa setOrderStatus / setOrderTracking)
 * ------------------------------------------------------------------ */
export const writeBatch = (_db) => {
  const ops = [];
  const api = {
    set: (ref, data, opts = {}) => ops.push(() => setDoc(ref, data, opts)),
    update: (ref, data) => ops.push(() => updateDoc(ref, data)),
    delete: (ref) => ops.push(() => deleteDoc(ref)),
    commit: async () => {
      // Todas o ninguna: si una falla, ninguna se aplica (como el real).
      const snapshotDocs = new Map(docs);
      try {
        for (const op of ops) await op();
      } catch (err) {
        docs.clear();
        for (const [k, v] of snapshotDocs) docs.set(k, v);
        throw err;
      } finally {
        ops.length = 0;
      }
    },
  };
  return api;
};

/* ------------------------------------------------------------------
 * onSnapshot: suscripción en vivo
 * ------------------------------------------------------------------ */
/** Entrega los datos con la forma que corresponde al tipo de referencia.
 *
 *  El Firestore real no devuelve "una lista de documentos" para todo: un
 *  doc suelto llega como snapshot con exists()/data(), y una colección
 *  llega como snapshot con docs/empty/size. Mezclarlas (como hacía la
 *  primera versión de este mock) hacía reventar a TODO hook que se
 *  suscribiera a un documento concreto: `snap.exists` no existía y el
 *  componente se caía con un TypeError que parecía un bug del sitio.
 */
function deliver(ref, onNext) {
  if (ref.__kind === "doc") {
    const { id, data } = readRef(ref);
    onNext(snapshot(id, data));
    return;
  }
  const docsList = readRef(ref).map((r) => snapshot(r.id, r.data));
  onNext({ docs: docsList, empty: docsList.length === 0, size: docsList.length });
}

export const onSnapshot = (ref, onNext, onError) => {
  const handler = { onNext, onError };
  if (!listeners.has(ref.path)) listeners.set(ref.path, new Set());
  listeners.get(ref.path).add(handler);

  // El Firestore real entrega el estado actual apenas se suscribe.
  deliver(ref, onNext);

  return () => {
    listeners.get(ref.path)?.delete(handler);
  };
};

function notify(path) {
  // Un cambio en products/abc notifica a /products y a /products/abc.
  const affected = [path, path.split("/")[0]];
  for (const p of affected) {
    const set = listeners.get(p);
    if (!set) continue;
    const ref = { path: p, __kind: p.includes("/") ? "doc" : "query" };
    for (const h of set) deliver(ref, h.onNext);
  }
}

/* ------------------------------------------------------------------
 * Controles que usan los tests desde afuera
 * ------------------------------------------------------------------ */
export const __fs = {
  docs,
  /** Pone un documento: seed("products/abc", { name: "Hoodie" }). */
  seed(path, data) {
    docs.set(path, { ...data });
    return data;
  },
  /** Lee un documento, o null si no está. */
  get(path) {
    return docs.get(path) ?? null;
  },
  /** ¿Existe? (para.assert de las escrituras). */
  has(path) {
    return docs.has(path);
  },
  /** Lista los ids de una colección. */
  ids(collPath) {
    return [...docs.keys()]
      .filter((k) => k.startsWith(collPath + "/"))
      .map((k) => k.slice(collPath.length + 1));
  },
  /** Hace que tocar este path tire el error dado (para probar los catch). */
  fail(path, error = Object.assign(new Error("Firestore mock failure"), { code: "unavailable" })) {
    failures.set(path, error);
  },
  /** Borra todo el estado. Se llama en el beforeEach de cada suite. */
  reset() {
    docs.clear();
    listeners.clear();
    failures.clear();
  },
  /** Dispara los onSnapshot de una colección, como si alguien guardara. */
  emit(collPath) {
    notify(collPath);
  },
  /** Fuerza el callback de error de los onSnapshot de una ruta. */
  emitError(path, err = new Error("permission-denied")) {
    const set = listeners.get(path);
    if (set) for (const h of set) h.onError?.(err);
  },
  /** El número de batch commits, para verificar que se escriben 2 docs juntos. */
  commitSpy: null,
};

/* Lo que el código real importa pero no usamos en los tests. */
export const getFirestore = () => ({ name: "firestore-falso", type: "firestore" });
export const connectFirestoreEmulator = vi.fn();
export const enableNetwork = vi.fn();
export const disableNetwork = vi.fn();
export const waitForPendingWrites = async () => {};

/** increment(n): el "sumar 1" atómico de Firestore. Acá solo se anota
 *  como un objeto especial, porque el mock no lleva la cuenta (los tests
 *  que lo necesitan revisan el valor final con sus propios cálculos). */
export const increment = (n = 1) => ({ __increment: n });

export const runTransaction = async (_db, fn) => fn({ get: getDoc, set: setDoc, update: updateDoc, delete: deleteDoc });
export const arrayUnion = (...v) => ({ __arrayUnion: v });
export const arrayRemove = (...v) => ({ __arrayRemove: v });
export const Timestamp = FakeTimestamp;
export const FieldValue = { serverTimestamp };