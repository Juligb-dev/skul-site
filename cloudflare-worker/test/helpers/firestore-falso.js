/**
 * ============================================================
 *  FALSO DE LA API REST DE FIRESTORE (para probar el Worker)
 * ------------------------------------------------------------
 *  El Worker no usa el SDK de firebase: habla HTTP con la API REST de
 *  Firestore (`firestore.googleapis.com/v1/projects/.../documents`).
 *
 *  Para poder testearlo contra la lógica REAL sin tocar la base de
 *  verdad, este archivo simula ESA API: guarda los documentos en un Map
 *  y traduce de/ao el formato con `fields` que usa Firestore
 *  ({ stringValue, integerValue, mapValue... }).
 *
 *  Por qué simular la API y no "mockear" fsGetDoc: si el test metiera un
 *  mock adentro del módulo, estaría probando una versión del Worker
 *  distinta de la que se despliega. interceptando `fetch` (el punto de
 *  contacto real), el código del Worker se ejecuta tal cual, con sus
 *  `encodeURIComponent`, sus `updateMask` y sus `currentDocument`.
 *  Los tests pueden después verificar que los precondiciones que se
 *  mandan son los correctos, que es justamente lo que evita el oversell.
 * ============================================================
 */

/** Un valor JS → valor con el formato de Firestore. */
export const encodeValue = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  return { mapValue: { fields: encodeFields(v) } };
};

/** Un objeto plano → `{ campo: { ... } }` como los `fields` de Firestore. */
export const encodeFields = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = encodeValue(v);
  return out;
};

/** El documento completo como lo devuelve la API GET. */
export const encodeDoc = (name, data, updateTime) => ({
  name: `projects/skullt/databases/(default)/documents/${name}`,
  fields: encodeFields(data),
  createTime: new Date(0).toISOString(),
  updateTime,
});

/**
 * Estado del Firestore falso.
 * - docs: Map de "coleccion/id" → datos (ya en JS plano).
 * - commits: todos los cuerpos que llegaron a `:commit`, para poder
 *   revisar qué se iba a escribir y con qué precondición.
 */
export const crearFirestoreFalso = () => ({
  docs: new Map(),
  commits: [],
  /** Marca el próximo `:commit` con este error (para probar el 409). */
  fallaCommit: null,
  /** Cuántas veces se leyó cada documento (para detectar lecturas de más). */
  lecturas: [],
});

/** Crea un documento de prueba con una marca de tiempo fija. */
export const docDePrueba = (datos, updateTime = "2026-01-01T00:00:00.000Z") => ({
  data: datos,
  updateTime,
});

/**
 * Instala el falso en `globalThis.fetch`.
 *
 * Se ocupa de:
 *  - GET .../documents/<coleccion>/<id>   → documento o 404
 *  - POST .../documents:commit             → escribe y guarda el commit
 *  - POST identitytoolkit...:lookup        → el UID que se le pida
 *  - POST api.telegram.org/...             → 200 (notificación)
 *  - POST <CORREO_BASE_URL>/token          → { token }
 *  - POST <CORREO_BASE_URL>/rates          → las tarifas que se configuren
 *  - GET  <CORREO_BASE_URL>/agencies       → las sucursales configuradas
 *  - GET  nominatim.../search              → la ubicación del CP (geoCp)
 *
 * Lo que no reconoce lo tira con un error claro: si el Worker empieza a
 * pegarle a un servicio que el test no conoce, el test se cae con un
 * mensaje que dice qué URL encontró, en vez de devolver algo raro en
 * silencio.
 */
export const instalarFetchFalso = (fs, opciones = {}) => {
  const {
    adminUid = null, // lo que devuelve identitytoolkit
    telegramOk = true,
    correoRates = { rates: [{ deliveredType: "D", price: 2500 }, { deliveredType: "S", price: 1500 }] },
    correoAgencies = [],
    correoFalla = false,
    geoCp = [{ lat: "-34.6476", lon: "-58.558", address: { state: "Buenos Aires", city: "Ramos Mejía" } }],
  } = opciones;

  const llamadas = [];

  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const metodo = (init.method || "GET").toUpperCase();
    const cuerpo = init.body ? JSON.parse(init.body) : null;
    llamadas.push({ url: u, metodo, init, cuerpo });

    // --- Firestore: leer un documento ---
    if (metodo === "GET" && u.includes("/documents/")) {
      const path = u.split("/documents/")[1].split("?")[0];
      fs.lecturas.push(path);
      const data = fs.docs.get(path);
      if (!data) return new Response("NOT FOUND", { status: 404 });
      return new Response(JSON.stringify(encodeDoc(path, data.data, data.updateTime)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // --- Firestore: commit atómico ---
    if (u.endsWith(":commit")) {
      if (fs.fallaCommit) {
        const { status, mensaje } = fs.fallaCommit;
        return new Response(mensaje || "ERROR", { status });
      }
      fs.commits.push(cuerpo);

      // Se aplican las escrituras respetando las tres reglas que hacen que
      // el commit sea atómico y condicional. Esto NO es decorativo: es lo
      // que permite testear el oversell (que dos compras no se lleven el
      // último talle) y que dos pedidos no usen dos veces el mismo cupón.
      const copia = new Map([...fs.docs].map(([k, v]) => [k, { ...v }]));

      for (const w of cuerpo.writes || []) {
        const name = w.update.name.split("/documents/")[1];
        const data = decodeFields(w.update.fields || {});
        const previo = fs.docs.get(name);

        // 1) update SIN updateMask sobre un documento que ya existe:
        //    Firestore lo rechaza (409). Es lo que impide que dos pedidos
        //    compartan el mismo ID de gift card emitida.
        if (!w.updateMask && previo) {
          fs.docs.clear();
          for (const [k, v] of copia) fs.docs.set(k, v);
          return new Response(
            JSON.stringify({ error: { code: 409, message: "ALREADY_EXISTS", status: "ABORTED" } }),
            { status: 409 }
          );
        }

        // 2) currentDocument: el documento tiene que seguir como estaba
        //    cuando lo leímos. Si alguien lo tocó en el meantime, el
        //    commit ENTERO se aborta con 412.
        if (w.currentDocument?.updateTime && previo?.updateTime !== w.currentDocument.updateTime) {
          fs.docs.clear();
          for (const [k, v] of copia) fs.docs.set(k, v);
          return new Response(
            JSON.stringify({ error: { code: 412, message: "FAILED_PRECONDITION", status: "ABORTED" } }),
            { status: 412 }
          );
        }

        // 3) updateMask: solo se pisan los campos de la máscara.
        const base = w.updateMask ? { ...(previo?.data || {}) } : {};
        for (const ruta of w.updateMask?.fieldPaths || []) {
          const partes = ruta.split(".");
          if (partes.length === 1) base[partes[0]] = data[partes[0]];
          else {
            const padre = (base[partes[0]] ||= {});
            padre[partes[1]] = data[partes[0]]?.[partes[1]];
          }
        }
        if (!w.updateMask) Object.assign(base, data);

        fs.docs.set(name, { data: base, updateTime: new Date().toISOString() });
      }

      return new Response(JSON.stringify({ writeResults: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // --- Firebase Auth: accounts:lookup ---
    if (u.includes("identitytoolkit.googleapis.com")) {
      if (!adminUid) return new Response("UNAUTHORIZED", { status: 401 });
      return new Response(JSON.stringify({ users: [{ localId: adminUid }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // --- Telegram ---
    if (u.includes("api.telegram.org")) {
      if (!telegramOk) return new Response("TELEGRAM CAIDO", { status: 500 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // --- MiCorreo ---
    if (u.includes("/token")) {
      if (correoFalla) return new Response("sin credenciales", { status: 401 });
      return new Response(JSON.stringify({ token: "token-de-prueba" }), { status: 200 });
    }
    if (u.includes("/rates")) {
      if (correoFalla) return new Response(JSON.stringify({ message: "Cliente FAP no identificado" }), { status: 500 });
      return new Response(JSON.stringify(correoRates), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (u.includes("/agencies")) {
      return new Response(JSON.stringify(correoAgencies), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // --- Nominatim: geocodificación de CP (acción geocp del Worker) ---
    if (u.includes("nominatim.openstreetmap.org")) {
      return new Response(JSON.stringify(geoCp), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    throw new Error(`installFetchFalso: el Worker pegó a una URL no mockeada: ${u}`);
  };

  return llamadas;
};

/** El camino inverso de encodeValue (para simular que el commit se aplicó). */
export const decodeValue = (v) => {
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.nullValue !== undefined) return null;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.mapValue !== undefined) return decodeFields(v.mapValue.fields);
  if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(decodeValue);
  return null;
};

export const decodeFields = (fields) => {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = decodeValue(v);
  return out;
};