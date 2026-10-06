/**
 * ============================================================
 *  PRUEBAS DE INTEGRACIÓN — hooks contra un Firestore de mentira
 * ------------------------------------------------------------
 *  Estos tests no reescriben los hooks: usan los de verdad, con la base de
 *  datos interceptada (el mock de src/test/mocks/firestore.js). Si mañana
 *  el hook cambia, el test se rompe solo.
 *
 *  Qué se mira acá, que los unitarios de lógica pura no pueden ver:
 *   - Que el hook lea el documento correcto (el ID mal escrito es el bug
 *     clásico: " skul10 " no encuentra "SKUL10").
 *   - Qué devuelve cuando el documento no está.
 *   - Que un permiso denegado no deje la pantalla girando para siempre.
 *   - Que los valores que salen de un <input> (texto) se guarden como
 *     números, porque el Worker compara con números.
 *
 *  Lo que NO se prueba acá y va en otro lado: los permisos. El mock deja
 *  escribir cualquier cosa; quién puede hacer qué lo contesta el emulador
 *  (`npm run test:rules`).
 * ============================================================
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { __fs } from "../test/mocks/firestore.js";
import { checkCoupon, saveCoupon, deleteCoupon, useCoupons } from "../hooks/useCoupons.js";
import { subscribeToNewsletter, deleteSubscriber, useSubscribers } from "../hooks/useNewsletter.js";

beforeEach(() => {
  __fs.reset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------- */
describe("checkCoupon — el chequeo que hace el checkout", () => {
  it("acepta un cupón activo y devuelve solo lo que el checkout necesita", async () => {
    __fs.seed("coupons/BIENVENIDA", {
      type: "percent",
      value: 20,
      active: true,
      scope: "all",
      maxUses: null,
      usedCount: 3,
    });

    const res = await checkCoupon("BIENVENIDA");
    expect(res.ok).toBe(true);
    expect(res.coupon.code).toBe("BIENVENIDA");
    expect(res.coupon.value).toBe(20);
  });

  it("NO le pasa usedCount ni maxUses al navegador (eso es del Worker)", async () => {
    __fs.seed("coupons/X", { type: "fixed", value: 1000, active: true, maxUses: 5, usedCount: 1 });
    const res = await checkCoupon("X");
    // Si el navegador usara estos números para calcular, un atacante
    // podría falsearlos: el descuento real lo recalcula el Worker.
    expect(res.coupon.usedCount).toBeUndefined();
    expect(res.coupon.maxUses).toBeUndefined();
  });

  it("normaliza el código: minúsculas y espacios alrededor", async () => {
    __fs.seed("coupons/BIENVENIDA", { type: "percent", value: 20, active: true });
    // El error clásico: buscar " skul10 " y no encontrar "SKUL10".
    for (const escrito of ["BIENVENIDA", "bienvenida", "  bienvenida  ", "Bienvenida "]) {
      const res = await checkCoupon(escrito);
      expect(res.ok, `escrito como "${escrito}"`).toBe(true);
      expect(res.coupon.code).toBe("BIENVENIDA");
    }
  });

  it("devuelve un motivo SIEMPRE en castellano y siempre un string", async () => {
    const casos = [
      [{ active: false }, "existe pero apagado", "ya no está activo"],
      [{ active: true, maxUses: 3, usedCount: 3 }, "agotado", "límite de usos"],
      [{ active: true, maxUses: 1, usedCount: 5 }, "pasado de usos", "límite de usos"],
    ];
    for (const [doc, escenario, esperado] of casos) {
      __fs.seed("coupons/CASO", doc);
      const res = await checkCoupon("CASO");
      expect(res.ok, escenario).toBe(false);
      expect(res.reason, escenario).toContain(esperado);
    }
  });

  it("un cupón inexistente no rompe (devuelve motivo, no exception)", async () => {
    const res = await checkCoupon("NO-EXISTE");
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/No existe/i);
  });

  it("un código vacío no rompe (el checkout lo llama en cada tecla)", async () => {
    await expect(checkCoupon("")).resolves.toMatchObject({ ok: false });
    await expect(checkCoupon(null)).resolves.toMatchObject({ ok: false });
    await expect(checkCoupon(undefined)).resolves.toMatchObject({ ok: false });
  });

  it("maxUses en null = sin límite (no confunde con 0 usos)", async () => {
    __fs.seed("coupons/SINLIMITE", { type: "percent", value: 5, active: true, maxUses: null, usedCount: 9999 });
    expect((await checkCoupon("SINLIMITE")).ok).toBe(true);
  });

  it("si Firestore falla, el error sube (el checkout muestra 'no pudimos verificar')", async () => {
    __fs.fail("coupons/ROTO", Object.assign(new Error("offline"), { code: "unavailable" }));
    await expect(checkCoupon("ROTO")).rejects.toThrow();
  });
});

/* -------------------------------------------------------------- */
describe("saveCoupon — lo que se guarda está normalizado", () => {
  it("guarda el código como ID en mayúsculas", async () => {
    await saveCoupon("  bienvenida ", { type: "percent", value: "20", active: true });
    expect(__fs.has("coupons/BIENVENIDA")).toBe(true);
  });

  it("convierte los números que vienen de los inputs (texto → número)", async () => {
    // Si guardara "20" como texto, la comparación del Worker fallaría.
    await saveCoupon("NUM", { type: "percent", value: "20", maxUses: "5", active: true });
    const doc = __fs.get("coupons/NUM");
    expect(doc.value).toBe(20);
    expect(doc.maxUses).toBe(5);
  });

  it('maxUses "" significa SIN límite, no cero', async () => {
    // El detalle que hace que "sin límite" no se vuelva "agotado".
    await saveCoupon("SINLIMITE", { type: "percent", value: 10, maxUses: "", active: true });
    expect(__fs.get("coupons/SINLIMITE").maxUses).toBeNull();
  });

  it("un cupón nuevo arranca en usedCount 0 y con fecha", async () => {
    await saveCoupon("NUEVO", { type: "fixed", value: 1000, active: true });
    const doc = __fs.get("coupons/NUEVO");
    expect(doc.usedCount).toBe(0);
    expect(doc.createdAt).toBeTruthy();
  });

  it("EDITAR un cupón NO le resetea el contador de usos", async () => {
    // Si lo resetea, con cada pausa desde el panel el cupón vuelve a
    // regalar descuentos desde cero.
    __fs.seed("coupons/USADO", { type: "percent", value: 10, active: true, usedCount: 7, createdAt: "ayer" });
    await saveCoupon("USADO", { type: "percent", value: 10, active: false });

    const doc = __fs.get("coupons/USADO");
    expect(doc.usedCount).toBe(7);
    expect(doc.active).toBe(false);
    expect(doc.createdAt).toBe("ayer");
  });

  it("el alcance determina qué campos sobran (no deja datos viejos pegados)", async () => {
    // Un cupón que era por categoría y pasa a ser general: si el
    // scopeCategory viejo quedara, el cálculo del Worker seguiría
    // filtrando por esa categoría.
    __fs.seed("coupons/CAMBIO", { type: "fixed", value: 1000, active: true, scopeCategory: "remeras" });
    await saveCoupon("CAMBIO", { type: "fixed", value: 1000, active: true, scope: "all" });

    const doc = __fs.get("coupons/CAMBIO");
    expect(doc.scope).toBe("all");
    expect(doc.scopeCategory).toBeNull();
    expect(doc.scopeProductIds).toEqual([]);
  });

  it("un cupón por productos guarda la lista tal cual", async () => {
    await saveCoupon("PORPROD", {
      type: "fixed",
      value: 500,
      active: true,
      scope: "products",
      scopeProductIds: ["abc", "def"],
    });
    expect(__fs.get("coupons/PORPROD").scopeProductIds).toEqual(["abc", "def"]);
  });

  it("sin alcance explícito, el alcance es 'all' (no queda undefined)", async () => {
    await saveCoupon("PORDEFECTO", { type: "percent", value: 5, active: true });
    expect(__fs.get("coupons/PORDEFECTO").scope).toBe("all");
  });
});

/* -------------------------------------------------------------- */
describe("deleteCoupon", () => {
  it("borra el documento y no deja nada", async () => {
    __fs.seed("coupons/VIEJO", { active: true });
    await deleteCoupon("viejo");
    expect(__fs.has("coupons/VIEJO")).toBe(false);
  });
});

/* -------------------------------------------------------------- */
describe("useCoupons — la tabla en vivo del panel", () => {
  it("empieza en null (todavía no cargó) y después trae la lista", async () => {
    __fs.seed("coupons/A", { type: "percent", value: 10, active: true });
    __fs.seed("coupons/B", { type: "fixed", value: 500, active: false });

    const { result } = renderHook(() => useCoupons());
    // null = "cargando". Si arrancara en [] el panel mostraría "0 cupones"
    // antes de tiempo, que es lo que el archivo dice que quiere evitar.
    await waitFor(() => expect(result.current.coupons).not.toBeNull());
    expect(result.current.coupons).toHaveLength(2);
  });

  it("el código (que es el ID del documento) viene en `code`, no suelto", async () => {
    __fs.seed("coupons/SKUL10", { type: "percent", value: 10, active: true });
    const { result } = renderHook(() => useCoupons());
    await waitFor(() => expect(result.current.coupons).toHaveLength(1));
    expect(result.current.coupons[0].code).toBe("SKUL10");
  });

  it("se actualiza solo cuando alguien guarda un cupón (sin recargar)", async () => {
    const { result } = renderHook(() => useCoupons());
    await waitFor(() => expect(result.current.coupons).toEqual([]));

    await act(async () => {
      await saveCoupon("NUEVO", { type: "percent", value: 10, active: true });
    });
    await waitFor(() => expect(result.current.coupons).toHaveLength(1));
    expect(result.current.coupons[0].code).toBe("NUEVO");
  });

  it("si las reglas rechazan la consulta, muestra tabla vacía (no spinner eterno)", async () => {
    const { result } = renderHook(() => useCoupons());
    await waitFor(() => expect(result.current.coupons).not.toBeNull());
    __fs.emitError("coupons", new Error("permission-denied"));

    await waitFor(() => expect(result.current.coupons).toEqual([]));
  });

  it("se desuscribe al desmontar (no deja el canal abierto)", async () => {
    const { unmount } = renderHook(() => useCoupons());
    await waitFor(() => expect(__fs).toBeTruthy());
    expect(() => unmount()).not.toThrow();
    // Guardar después de desmontar no debe romper nada.
    await act(async () => {
      await saveCoupon("TARDE", { type: "percent", value: 1, active: true });
    });
  });
});

/* -------------------------------------------------------------- */
describe("subscribeToNewsletter — sin login y sin duplicados", () => {
  it("guarda el email normalizado como ID", async () => {
    await subscribeToNewsletter("  Ana@Ejemplo.COM  ");
    // Sin espacios y en minúscula: si no, "Ana@Ejemplo.COM" y
    // "ana@ejemplo.com" serían dos suscriptores distintos.
    expect(__fs.has("newsletter/ana@ejemplo.com")).toBe(true);
    expect(__fs.get("newsletter/ana@ejemplo.com").email).toBe("ana@ejemplo.com");
  });

  it("guarda consent: true (sin eso, las reglas rechazan el documento)", async () => {
    await subscribeToNewsletter("ana@ejemplo.com");
    const doc = __fs.get("newsletter/ana@ejemplo.com");
    expect(doc.consent).toBe(true);
    expect(doc.source).toBe("footer");
    expect(doc.createdAt).toBeTruthy();
  });

  it("NO guarda nada más que los cuatro campos permitidos", async () => {
    // isValidNewSubscriber en firestore.rules acepta EXACTAMENTE estos
    // campos: uno de más y las reglas rechazan la suscripción.
    await subscribeToNewsletter("ana@ejemplo.com");
    expect(Object.keys(__fs.get("newsletter/ana@ejemplo.com")).sort()).toEqual(
      ["consent", "createdAt", "email", "source"].sort()
    );
  });

  it("devuelve el email limpio", async () => {
    expect(await subscribeToNewsletter("  BOB@Ejemplo.com ")).toBe("bob@ejemplo.com");
  });

  it("si el correo ya está, avisa con 'already-exists' (y no pisa la fecha)", async () => {
    await subscribeToNewsletter("ana@ejemplo.com");
    const antes = __fs.get("newsletter/ana@ejemplo.com");

    // El Firestore real rechaza el update con permission-denied, y el
    // hook traduce ese error a un código de negocio.
    __fs.fail("newsletter/ana@ejemplo.com", Object.assign(new Error("denegado"), { code: "permission-denied" }));

    await expect(subscribeToNewsletter("ana@ejemplo.com")).rejects.toMatchObject({ code: "already-exists" });
    expect(__fs.get("newsletter/ana@ejemplo.com")).toEqual(antes);
  });

  it("un error que NO es de permisos sube tal cual (no miente al usuario)", async () => {
    __fs.fail("newsletter/ana@ejemplo.com", Object.assign(new Error("sin red"), { code: "unavailable" }));
    // Si lo tradujera a "ya estabas en la lista", el visitante pensaría
    // que se suscribió cuando en realidad no se guardó nada.
    await expect(subscribeToNewsletter("ana@ejemplo.com")).rejects.toMatchObject({ code: "unavailable" });
  });

  it.each([
    [null, "nulo"],
    [undefined, "undefined"],
    ["", "vacío"],
    ["   ", "solo espacios"],
    ["hola", "sin arroba"],
    ["ana@", "sin dominio"],
    ["ana@ejemplo", "sin punto en el dominio"],
    ["a@b.c", "demasiado corto"],
    ["ana@ejemplo.com", null],
  ])("valida el correo %p (%s)", async (email, resultado) => {
    if (resultado) {
      // Se corta ANTES de tocar Firestore, con un código propio.
      await expect(subscribeToNewsletter(email)).rejects.toMatchObject({ code: "invalid-email" });
      expect(__fs.ids("newsletter")).toHaveLength(0);
    } else {
      await expect(subscribeToNewsletter(email)).resolves.toBe("ana@ejemplo.com");
      expect(__fs.ids("newsletter")).toEqual(["ana@ejemplo.com"]);
    }
  });

  it("un correo con espacios del medio tampoco pasa (no es un email)", async () => {
    await expect(subscribeToNewsletter("ana perez@ejemplo.com")).rejects.toMatchObject({
      code: "invalid-email",
    });
  });

  it("un correo de más de 120 caracteres se corta (misma cota que las reglas)", async () => {
    const largo = `ana@${"a".repeat(130)}.com`;
    await expect(subscribeToNewsletter(largo)).rejects.toMatchObject({ code: "invalid-email" });
  });

  it("el error de formato NO se confunde con 'ya estabas en la lista'", async () => {
    // Era el bug: un correo mal escrito disparaba permission-denied en las
    // reglas, el hook lo traducía a "already-exists" y el pie de página le
    // decía al visitante que ya estaba suscrito. Dos mensajes distintos
    // para dos cosas distintas.
    await expect(subscribeToNewsletter("malo")).rejects.toMatchObject({ code: "invalid-email" });
    await expect(subscribeToNewsletter("mal@o")).rejects.toMatchObject({ code: "invalid-email" });
  });
});

/* -------------------------------------------------------------- */
describe("useSubscribers — la lista del admin", () => {
  it("trae los suscriptores con el email como id", async () => {
    __fs.seed("newsletter/ana@ejemplo.com", { email: "ana@ejemplo.com", consent: true, source: "footer" });
    const { result } = renderHook(() => useSubscribers());
    await waitFor(() => expect(result.current.subscribers).toHaveLength(1));
    expect(result.current.subscribers[0].id).toBe("ana@ejemplo.com");
  });

  it("si Firestore dice que no, muestra la lista vacía", async () => {
    const { result } = renderHook(() => useSubscribers());
    await waitFor(() => expect(result.current.subscribers).not.toBeNull());
    __fs.emitError("newsletter", new Error("permission-denied"));
    await waitFor(() => expect(result.current.subscribers).toEqual([]));
  });
});

describe("deleteSubscriber", () => {
  it("baja la suscripción (borrado duro, sin rastro)", async () => {
    __fs.seed("newsletter/ana@ejemplo.com", { email: "ana@ejemplo.com" });
    await deleteSubscriber("ana@ejemplo.com");
    expect(__fs.has("newsletter/ana@ejemplo.com")).toBe(false);
  });
});