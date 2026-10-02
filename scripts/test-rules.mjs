/**
 * ============================================================================
 * Pruebas de las reglas de Firestore contra el emulador local.
 *
 * NO toca producción: levanta el emulador en un proyecto falso y corre
 * todo en memoria. Sirve para responder "¿qué puede hacer realmente un
 * visitante, un usuario cualquiera y el admin?" sin arriesgar datos.
 *
 *   firebase emulators:exec --only firestore "node scripts/test-rules.mjs"
 * ============================================================================
 *
 * QUÉ SON LAS REGLAS, POR QUÉ IMPORTAN: `firestore.rules` es lo que decide, en
 * el servidor de Google, quién puede leer y quién puede escribir cada
 * documento. El código del navegador no las puede esquivar: si la regla dice
 * que no, la escritura no entra. Por eso si una regla está mal, el panel de
 * admin no guarda nada aunque el código esté impecable, y el síntoma es un
 * "permission-denied" que suele terminar tragado por un catch.
 *
 * POR QUÉ NO PROBAR CONTRA PRODUCCIÓN: las reglas se prueban con escrituras
 * reales. Probar "un visitante no puede escribir /products" contra la base de
 * verdad implica intentar escribir en la base de verdad: si la regla estuviera
 * mal, de verdad modifies la tienda.
 *
 * QUÉ ES EL EMULADOR: un servidor de Firestore falso que corre en tu máquina
 * y levanta en memoria, sin tocar la nube. `firebase emulators:exec` lo
 * levanta, pasa la variable de entorno FIRESTORE_EMULATOR_HOST al script
 * (con eso el SDK de Firebase se da cuenta de que tiene que hablar con el
 * emulador en vez de con internet), corre el comando que le pidas y después
 * lo apaga. Las reglas las carga solo desde firestore.rules.
 *
 * PARA QUIÉN ES: para el dev, cada vez que toca firestore.rules. La idea es
 * que el archivo de reglas tenga su propio test: si cambiás una regla, corré
 * esto y vas a ver de entrada si abriste o cerraste un agujero.
 *
 * CÓMO SE CORRE (no es `node` pelado, hace falta el emulador):
 *   npm run test:rules
 *
 * Si termina con "N ok, 0 fallas" sale bien. Si hay fallas, el script devuelve
 * código 1 y el emulador:exec lo reporta como error.
 *
 * CÓMO FUNCIONA EL ARMADO DE LAS PRUEBAS:
 *   1) con las reglas DESACTIVADAS se siembran los documentos de prueba (si
 *      no, no habría con qué probar),
 *   2) se crean cuatro "actores" con distintos permisos,
 *   3) cada `check()` corre una operación y dice si tenía que poder o no.
 * ============================================================================
 */
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";

// Los tres identifiants que aparecen en firestore.rules. Si cambiás alguno
// de los dos lados, hay que cambiarlo en los tres: el test falla, y con razón.
const ADMIN_UID = "Ii35YTENxZePLzloJkaC99AL5rn1";
const WORKER_EMAIL = "firebase-adminsdk-fbsvc@skullt.iam.gserviceaccount.com";

// `firebase emulators:exec` ya exporta FIRESTORE_EMULATOR_HOST; las reglas
// las carga sola desde firestore.rules.
// El projectId es solo un nombre para el emulador: tiene que empezar con
// "demo-" para que el SDK sepa que NO está hablando con la nube.
const projectId = process.env.GCLOUD_PROJECT || "demo-skul-rules";
const testEnv = await initializeTestEnvironment({ projectId });

/**
 * Siembra los documentos que las pruebas van a usar. Va dentro de
 * `withSecurityRulesDisabled` porque las reglas están apagadas: si no, el
 * propio seed sería rechazado por la regla que estoy probando.
 *
 * Los datos están elegidos para cubrir los casos límite: un producto visible
 * y uno apagado, un cupón activo y otro vencido, una gift card con saldo y
 * otra dada de baja.
 */
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await db.doc("settings/site").set({ open: true, message: "Ya volvemos." });
  await db.doc("products/p1").set({ name: "Hoodie", active: true, price: 100, stock: { M: 2 } });
  await db.doc("products/p2").set({ name: "Oculto", active: false, price: 100, stock: { M: 5 } });
  await db.doc("coupons/BIEN10").set({ active: true, type: "percent", value: 10, usedCount: 0 });
  await db.doc("coupons/OCULTO").set({ active: false, type: "percent", value: 90 });
  await db.doc("giftCards/SKUL-ABC123").set({ balance: 5000, usedAmount: 0, active: true });
  await db.doc("giftCards/SKUL-OFF000").set({ balance: 5000, usedAmount: 0, active: false });
  await db.doc("orders/o1").set({ orderName: "Ana", orderPhone: "11", status: "nuevo" });
  await db.doc("orderTracking/o1").set({ total: 100, status: "nuevo" });
  await db.doc("newsletter/ana@mail.com").set({ email: "ana@mail.com", consent: true, source: "footer", createdAt: new Date() });
});

/*
 * Los cuatro actores de las pruebas. Un "contexto" es una sesión de Firestore
 * con una identidad: cada llamada que hace pasa por las reglas con esa
 * identidad, y las reglas la comparan con las de /newsletter, /products, etc.
 * Con esto pruebo los cuatro caminos que existen de verdad en la vida real.
 */
const visitor = testEnv.unauthenticatedContext(); // noiniti sesión: es el visitante de la web
const admin = testEnv.authenticatedContext(ADMIN_UID, { email: "admin@skul.com" }); // el del panel
const worker = testEnv.authenticatedContext("worker-uid", { email: WORKER_EMAIL }); // el Cloudflare Worker, vía cuenta de servicio
const otro = testEnv.authenticatedContext("usuario-raro-999", {}); // alguien con cuenta pero que no es admin

// Contadores que se imprimen al final y que deciden el código de salida.
let ok = 0;
let fallos = 0;

/**
 * Corre una prueba y registra el resultado, sin cortar el resto.
 * Por eso está todo en un try/catch: una prueba que falla tiene que
 * seguir dejando correr las de abajo, y al final vemos el resumen.
 *
 * `fn` devuelve una promesa de `assertSucceeds` o de `assertFails`: esas dos
 * lanzan un error si la operación NO era la que yo esperaba que fuera.
 * `assertSucceeds` = tiene que poder; `assertFails` = tiene que ser rechazado.
 */
async function check(nombre, fn) {
  try {
    await fn();
    console.log(`  ok   ${nombre}`);
    ok++;
  } catch (e) {
    console.log(`  FALLA ${nombre}\n         ${e.message.split("\n")[0]}`);
    fallos++;
  }
}

// ---------------------------------------------------------------------------
// CASO 1 — Catálogo y ajustes: público para leer, cerrado para escribir.
// La única forma de cambiar precios o stock es entrar con el panel.
// ---------------------------------------------------------------------------
console.log("\nCatálogo y ajustes");
await check("visitante lee productos", () => assertSucceeds(visitor.firestore().doc("products/p1").get()));
await check("visitante lee settings/site", () => assertSucceeds(visitor.firestore().doc("settings/site").get()));
await check("visitante NO escribe productos", () => assertFails(visitor.firestore().doc("products/p1").set({ name: "x" })));
await check("visitante NO borra productos", () => assertFails(visitor.firestore().doc("products/p1").delete()));
await check("visitante NO cambia settings", () => assertFails(visitor.firestore().doc("settings/site").set({ open: false })));
await check("admin SÍ edita productos", () => assertSucceeds(admin.firestore().doc("products/p1").update({ price: 120 })));

// ---------------------------------------------------------------------------
// CASO 2 — Cupones: "get" público porque el comprador tiene que poder
// comprobar el código que escribió, pero "list" cerrada porque con una sola
// consulta se llevarían TODOS los cupones.
// ---------------------------------------------------------------------------
console.log("\nCupones (get público, list privada)");
await check("visitante get de un cupón", () => assertSucceeds(visitor.firestore().doc("coupons/BIEN10").get()));
await check("visitante NO lista cupones", () => assertFails(visitor.firestore().collection("coupons").get()));
await check("visitante NO crea cupones", () => assertFails(visitor.firestore().doc("coupons/NUEVO").set({ active: true })));
await check("admin lista cupones", () => assertSucceeds(admin.firestore().collection("coupons").get()));

// ---------------------------------------------------------------------------
// CASO 3 — Gift cards: mismo patrón que los cupones. El `get` público es lo
// que permite que el checkout valide el código; la lista (donde están todos
// los saldos) es solo del admin. Y escribir una gift card desde el navegador
// tampoco: el saldo se descuenta con la cuenta de servicio, en el Worker.
// ---------------------------------------------------------------------------
console.log("\nGift cards (get público, list privada)");
await check("visitante get de una gift card", () => assertSucceeds(visitor.firestore().doc("giftCards/SKUL-ABC123").get()));
await check("visitante NO lista gift cards", () => assertFails(visitor.firestore().collection("giftCards").get()));
await check("visitante NO crea gift cards", () => assertFails(visitor.firestore().doc("giftCards/SKUL-ZZZ999").set({ balance: 100, active: true })));
await check("admin SÍ crea gift cards", () => assertSucceeds(admin.firestore().doc("giftCards/SKUL-ZZZ999").set({ balance: 100, active: true })));

// ---------------------------------------------------------------------------
// CASO 4 — Pedidos: la colección más sensible del proyecto (nombre, teléfono,
// dirección). Ni el visitante ni un usuario cualquiera con sesión la leen; solo
// el admin y el Worker (que necesita releer el pedido para armar el Telegram).
// El último caso es el importante: "tener cuenta" no es "ser admin".
// ---------------------------------------------------------------------------
console.log("\nPedidos privados");
await check("visitante NO lee un pedido", () => assertFails(visitor.firestore().doc("orders/o1").get()));
await check("visitante NO lista pedidos", () => assertFails(visitor.firestore().collection("orders").get()));
await check("visitante NO crea pedidos", () => assertFails(visitor.firestore().doc("orders/falso").set({ orderName: "x" })));
await check("admin lee pedidos", () => assertSucceeds(admin.firestore().doc("orders/o1").get()));
await check("worker lee pedidos", () => assertSucceeds(worker.firestore().doc("orders/o1").get()));
await check("usuario con sesión común NO lee pedidos", () => assertFails(otro.firestore().doc("orders/o1").get()));

// ---------------------------------------------------------------------------
// CASO 5 — Seguimiento: /orderTracking es lo que puede leer el comprador con el
// código de su pedido. Tiene que ser un `get` público (si no, la página de
// seguimiento no funciona) pero NO una lista pública (entonces cualquiera
// bajaría el historial entero de la tienda).
// ---------------------------------------------------------------------------
console.log("\nSeguimiento público");
await check("visitante get de tracking", () => assertSucceeds(visitor.firestore().doc("orderTracking/o1").get()));
await check("visitante NO lista tracking", () => assertFails(visitor.firestore().collection("orderTracking").get()));
await check("visitante NO crea tracking", () => assertFails(visitor.firestore().doc("orderTracking/falso").set({ total: 0 })));

// ---------------------------------------------------------------------------
// CASO 6 — Newsletter: acá el visitante SÍ escribe, así que la prueba va al
// revés: no pregunta "¿puede?" sino "¿qué campos puede guardar?". Si la regla
// fuera permisiva, esta colección sería un buzón libre para meter basura y
// y pagarle el costo de lectura/escritura de la cuenta.
// ---------------------------------------------------------------------------
console.log("\nNewsletter");
await check("visitante se suscribe con campos válidos", () =>
  assertSucceeds(visitor.firestore().doc("newsletter/nuevo@mail.com").set({
    email: "nuevo@mail.com", consent: true, source: "footer", createdAt: new Date(),
  })));
await check("visitante NO se suscribe con consent false", () =>
  assertFails(visitor.firestore().doc("newsletter/x1@mail.com").set({
    email: "x1@mail.com", consent: false, source: "footer", createdAt: new Date(),
  })));
await check("visitante NO se suscribe con campo extra", () =>
  assertFails(visitor.firestore().doc("newsletter/x2@mail.com").set({
    email: "x2@mail.com", consent: true, source: "footer", createdAt: new Date(), hacked: true,
  })));
await check("visitante NO se suscribe con email inválido", () =>
  assertFails(visitor.firestore().doc("newsletter/x3@mail.com").set({
    email: "no-es-mail", consent: true, source: "footer", createdAt: new Date(),
  })));
await check("visitante NO puede pisar una suscripción existente", () =>
  assertFails(visitor.firestore().doc("newsletter/ana@mail.com").set({
    email: "ana@mail.com", consent: true, source: "footer", createdAt: new Date(),
  })));
await check("visitante NO lee la lista", () => assertFails(visitor.firestore().collection("newsletter").get()));
await check("admin lee la lista", () => assertSucceeds(admin.firestore().collection("newsletter").get()));
await check("worker lee la lista", () => assertSucceeds(worker.firestore().collection("newsletter").get()));

/*
 * CASO 7 — Solicitudes de arrepentimiento (la regla que faltaba).
 *
 * Esta colección no existía en las reglas: como Firestore deniega por defecto
 * todo lo que no matchea, el formulario legal fallaba SIEMPRE con
 * permission-denied y la solicitud nunca se guardaba. Este bloque de pruebas
 * es el que tiene que cubrir exactamente los cinco campos que la función
 * isValidNewArrepentimiento acepta.
 */
console.log("\nSolicitudes de arrepentimiento (la regla que faltaba)");
const ar = (data) => visitor.firestore().doc("arrepentimientos/nueva").set(data);
const valida = {
  pedido: "o1", nombre: "Ana", contacto: "ana@mail.com",
  fecha: "2026-01-01", motivo: "No me quedó bien", createdAt: new Date(),
};
await check("visitante envía una solicitud válida", () => assertSucceeds(ar(valida)));
await check("visitante NO con campo extra", () => assertFails(ar({ ...valida, hackeado: 1 })));
await check("visitante NO con nombre vacío", () => assertFails(ar({ ...valida, nombre: "" })));
await check("visitante NO sin createdAt", () => {
  const { createdAt, ...sinFecha } = valida;
  return assertFails(ar(sinFecha));
});
await check("visitante NO con motivo de 5000 caracteres", () =>
  assertFails(ar({ ...valida, motivo: "x".repeat(5000) })));
await check("visitante NO lista las solicitudes", () =>
  assertFails(visitor.firestore().collection("arrepentimientos").get()));
await check("visitante NO lee una solicitud", () =>
  assertFails(visitor.firestore().doc("arrepentimientos/nueva").get()));
await check("admin SÍ lista las solicitudes", () =>
  assertSucceeds(admin.firestore().collection("arrepentimientos").get()));
await check("visitante NO edita una solicitud existente", () =>
  assertFails(visitor.firestore().doc("arrepentimientos/nueva").update({ pedido: "otro" })));

// ---------------------------------------------------------------------------
// CASO 8 — Lo que NO existe: Firestore deniega por defecto, así que una
// colección que nadie matchea tiene que quedar cerrada para todo. Si algún
// día alguien escribe mal el nombre de una colección en el match, este bloque
// es el que te avisa.
// ---------------------------------------------------------------------------
console.log("\nColecciones que no existen (todo denegado)");
await check("visitante NO lee /pedidos inexistente", () =>
  assertFails(visitor.firestore().collection("pedidos").get()));
await check("visitante NO escribe /config", () =>
  assertFails(visitor.firestore().doc("config/x").set({ a: 1 })));

// Apago el emulador. Va antes del resumen: si esto fallara, el proceso queda
// colgado y los tests de abajo nunca corren.
await testEnv.cleanup();

// Código de salida distinto de cero si hubo alguna falla, así que un CI (o un
// && en un script) lo detecta.
console.log(`\n${ok} ok, ${fallos} fallas\n`);
process.exit(fallos ? 1 : 0);