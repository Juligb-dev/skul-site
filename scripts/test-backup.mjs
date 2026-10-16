/**
 * ============================================================================
 * Pruebas del backup y la restauración (contra el emulador local)
 * ============================================================================
 *
 * NO toca producción: corre entero contra el emulador, en memoria. Si no hay
 * emulador, el script se niega a correr a propósito: un test que escribe en la
 * base de verdad no es un test, es un accidente esperando el momento.
 *
 *   firebase emulators:exec --only firestore "node scripts/test-backup.mjs"
 *   (o `npm run test:backup`)
 *
 * QUÉ SE PRUEBA, Y POR QUÉ ESTOS CASOS:
 *   1) que el respaldo baje TODAS las colecciones (no solo las conocidas),
 *   2) que los tipos que no existen en JSON sobrevivan la ida y la vuelta
 *      (timestamp, mapa anidado, lista, null, decimal): si esto se rompe, el
 *      backup se ve bien pero restaura datos distintos,
 *   3) que una colección de más de 300 documentos venga completa: la API
 *      devuelve 300 por vuelta, así que sin paginar el backup guardaría solo
 *      los primeros 300 y parecería exitoso,
 *   4) que la restauración deje la base IGUAL a como estaba (esto se prueba
 *      borrando todo primero y comparando los dos respaldos),
 *   5) que la restauración NO toque los documentos que no están en el backup.
 * ============================================================================
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  EN_EMULADOR,
  NOMBRE_RAIZ,
  PROYECTO,
  TOKEN_EMULADOR,
  crearCliente,
  respaldar,
  restaurar,
  toFirestoreFields,
} from "./backup-firestore.mjs";

if (!EN_EMULADOR) {
  console.error(
    "\nEste test SOLO corre contra el emulador (falta FIRESTORE_EMULATOR_HOST).\n" +
      "Corrélo con: npm run test:backup\n"
  );
  process.exit(1);
}

const BASE = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${PROYECTO}/databases/(default)/documents`;
const HEADERS = { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN_EMULADOR}` };
const cli = crearCliente(TOKEN_EMULADOR);

// Nombres propios para no chocar con nada del emulador.
const COL_PRODUCTOS = "prueba_backup_productos";
const COL_PEDIDOS = "prueba_backup_pedidos";
const COL_MUCHOS = "prueba_backup_muchos";
const DOC_COMPLETO = "completo";

let ok = 0;
let fallos = 0;

async function comprobar(nombre, fn) {
  try {
    await fn();
    console.log(`  ok   ${nombre}`);
    ok++;
  } catch (e) {
    console.log(`  FALLA ${nombre}\n         ${e.message.split("\n")[0]}`);
    fallos++;
  }
}

function afirmar(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

/** Compara dos valores ignorando el orden de las claves (la API no lo garantiza). */
function canonico(x) {
  if (Array.isArray(x)) return x.map(canonico);
  if (x && typeof x === "object") {
    const salida = {};
    for (const k of Object.keys(x).sort()) salida[k] = canonico(x[k]);
    return salida;
  }
  return x;
}

function iguales(a, b) {
  return JSON.stringify(canonico(a)) === JSON.stringify(canonico(b));
}

/**
 * El endpoint de escrituras por lote. Se usa para sembrar y para borrar:
 * 320 documentos de a uno tardarían muchísimo más.
 */
async function escribirPorLote(escrituras) {
  const res = await fetch(`${BASE}:commit`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ writes: escrituras }),
  });
  if (!res.ok) throw new Error(`commit → ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

/** Un documento suelto, para el caso de "lo que no está en el backup". */
async function escribirUno(coleccion, id, datos) {
  const res = await fetch(`${BASE}/${coleccion}/${id}`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify({ fields: toFirestoreFields(datos) }),
  });
  if (!res.ok) throw new Error(`PATCH → ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

/** Borra los documentos de una colección (por nombre completo). */
async function borrarDocumentos(nombres) {
  await escribirPorLote(nombres.map((name) => ({ delete: name })));
}

// ---------------------------------------------------------------------------
// SIEMBRA: un documento con todos los tipos soportados, dos pedidos, y una
// colección larga a propósito para probar la paginación de 300.
// ---------------------------------------------------------------------------
const PRODUCTO = {
  name: "Hoodie Negro",
  price: 85000, // entero
  descuento: 12.5, // decimal
  active: true, // booleano
  nota: null, // null
  tags: ["nuevo", "drop", "unisex"], // lista de strings
  stock: { S: 2, M: 0, L: 5 }, // mapa anidado
  detalle: { medidas: { largo: 70, ancho: 55 }, origen: "Argentina" }, // dos niveles
  createdAt: { __tipo: "timestamp", valor: "2026-08-20T20:52:11.479646Z" }, // timestamp
};

const TOTAL_LARGOS = 320;
const largos = Array.from({ length: TOTAL_LARGOS }, (_, i) => ({
  name: `Producto ${i}`,
  price: 1000 + i,
  stock: { M: i },
}));

await escribirPorLote([
  { update: { name: `${NOMBRE_RAIZ}/${COL_PRODUCTOS}/${DOC_COMPLETO}`, fields: toFirestoreFields(PRODUCTO) } },
  { update: { name: `${NOMBRE_RAIZ}/${COL_PEDIDOS}/o1`, fields: toFirestoreFields({ orderName: "Ana", total: 85000, status: "nuevo" }) } },
  { update: { name: `${NOMBRE_RAIZ}/${COL_PEDIDOS}/o2`, fields: toFirestoreFields({ orderName: "Beto", total: 12000, status: "pagado" }) } },
  ...largos.map((datos, i) => ({
    update: { name: `${NOMBRE_RAIZ}/${COL_MUCHOS}/p${String(i).padStart(3, "0")}`, fields: toFirestoreFields(datos) },
  })),
]);

const carpetaA = await mkdtemp(path.join(tmpdir(), "skul-backup-a-"));
const carpetaB = await mkdtemp(path.join(tmpdir(), "skul-backup-b-"));

console.log("\nRespaldo");
const manifiesto = await respaldar(cli, { carpeta: carpetaA });

await comprobar("el respaldo incluye las colecciones sembradas", () => {
  for (const col of [COL_PRODUCTOS, COL_PEDIDOS, COL_MUCHOS]) {
    afirmar(manifiesto.colecciones[col], `falta la colección ${col} en el manifiesto`);
  }
  afirmar(manifiesto.colecciones[COL_PRODUCTOS].documentos === 1, "productos debería tener 1 documento");
  afirmar(manifiesto.colecciones[COL_PEDIDOS].documentos === 2, "pedidos debería tener 2 documentos");
});

await comprobar("los tipos raros sobreviven al respaldo", async () => {
  const docs = JSON.parse(
    await readFile(path.join(carpetaA, manifiesto.colecciones[COL_PRODUCTOS].archivo), "utf8")
  );
  const doc = docs.find((d) => d.id === DOC_COMPLETO);
  afirmar(doc, "no está el documento completo");
  const d = doc.datos;
  afirmar(d.name === "Hoodie Negro", `string mal: ${d.name}`);
  afirmar(d.price === 85000, `entero mal: ${d.price}`);
  afirmar(d.descuento === 12.5, `decimal mal: ${d.descuento}`);
  afirmar(d.active === true, `booleano mal: ${d.active}`);
  afirmar(d.nota === null, `null mal: ${d.nota}`);
  afirmar(Array.isArray(d.tags) && d.tags.length === 3, `lista mal: ${JSON.stringify(d.tags)}`);
  afirmar(d.stock.M === 0, `mapa anidado mal: ${JSON.stringify(d.stock)}`);
  afirmar(d.detalle.medidas.largo === 70, `mapa de dos niveles mal: ${JSON.stringify(d.detalle)}`);
  afirmar(d.createdAt?.__tipo === "timestamp", `timestamp mal: ${JSON.stringify(d.createdAt)}`);
  afirmar(typeof d.createdAt.valor === "string", "el timestamp debería guardarse como texto");
});

await comprobar(`una colección de ${TOTAL_LARGOS} documentos baja completa (paginación)`, () => {
  const info = manifiesto.colecciones[COL_MUCHOS];
  afirmar(
    info.documentos === TOTAL_LARGOS,
    `bajó ${info.documentos} de ${TOTAL_LARGOS}: se está perdiendo la paginación`
  );
  afirmar(info.documentos > 300, "el caso tiene que superar el límite de 300 por vuelta");
});

// ---------------------------------------------------------------------------
// ANTES DE RESTAURAR: se borra todo, para que el test pruebe de verdad que la
// restauración escribe. Si no se borrara, esto pasaría incluso sin restaurar.
// ---------------------------------------------------------------------------
const nombres = [];
for (const col of [COL_PRODUCTOS, COL_PEDIDOS, COL_MUCHOS]) {
  const docs = JSON.parse(
    await readFile(path.join(carpetaA, manifiesto.colecciones[col].archivo), "utf8")
  );
  for (const doc of docs) nombres.push(`${NOMBRE_RAIZ}/${col}/${doc.id}`);
}
await borrarDocumentos(nombres);

// Un documento que NO está en el backup: sirve para probar que la restauración
// no lo toca.
await escribirUno(COL_PEDIDOS, "posterior-al-backup", { orderName: "Carla", total: 999 });

console.log("\nRestauración");
await comprobar("después de borrar, la colección quedó vacía", async () => {
  const r = await fetch(`${BASE}/${COL_MUCHOS}`, { headers: HEADERS });
  const j = await r.json();
  afirmar((j.documents || []).length === 0, `quedaron ${(j.documents || []).length} documentos`);
});

const restaurados = await restaurar(cli, { carpeta: carpetaA });
await comprobar(`${restaurados} documentos restaurados`, () => {
  afirmar(restaurados === TOTAL_LARGOS + 3, `restauró ${restaurados}, esperaba ${TOTAL_LARGOS + 3}`);
});

const manifiestoB = await respaldar(cli, { carpeta: carpetaB });

await comprobar("la base quedó igual a la del backup original", async () => {
  for (const col of [COL_PRODUCTOS, COL_MUCHOS]) {
    const a = JSON.parse(
      await readFile(path.join(carpetaA, manifiesto.colecciones[col].archivo), "utf8")
    );
    const b = JSON.parse(
      await readFile(path.join(carpetaB, manifiestoB.colecciones[col].archivo), "utf8")
    );
    afirmar(iguales(a, b), `${col} no quedó igual:\n         antes: ${JSON.stringify(a).slice(0, 200)}\n         ahora: ${JSON.stringify(b).slice(0, 200)}`);
  }
});

await comprobar("los pedidos volvieron, y el documento posterior sigue intacto", async () => {
  const b = JSON.parse(
    await readFile(path.join(carpetaB, manifiestoB.colecciones[COL_PEDIDOS].archivo), "utf8")
  );
  const ids = b.map((d) => d.id).sort();
  afirmar(ids.includes("o1") && ids.includes("o2"), `faltan pedidos restaurados: ${ids.join(", ")}`);
  afirmar(ids.includes("posterior-al-backup"), "la restauración borró un documento que no estaba en el backup");
  const o1 = b.find((d) => d.id === "o1");
  afirmar(o1.datos.orderName === "Ana" && o1.datos.total === 85000, `pedido mal restaurado: ${JSON.stringify(o1)}`);
});

await rm(carpetaA, { recursive: true, force: true });
await rm(carpetaB, { recursive: true, force: true });

console.log(`\n${ok} ok, ${fallos} fallas\n`);
process.exit(fallos ? 1 : 0);
