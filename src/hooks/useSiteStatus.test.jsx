/**
 * ============================================================
 *  PRUEBAS DEL ESTADO DEL SITIO (useSiteStatus)
 * ------------------------------------------------------------
 *  El documento /settings/site es "cerrar la tienda" en un solo lugar:
 *  cuando el admin aprieta "Cerrar la web", todos los visitantes ven la
 *  pantalla de cierre a los segundos, sin reload y sin deploy.
 *
 *  Las reglas que se prueban acá:
 *
 *   - Sin documento = tienda abierta (los defaults). Si el admin todavía
 *     no guardó nada, el sitio no puede quedar cerrado.
 *   - Un documento con la mitad de los campos no rompe: los que faltan
 *     salen del default (y el orden del merge hace posible BORRAR un
 *     texto dejándolo vacío).
 *   - Si Firebase falla, NO se bloquea el sitio: se muestra abierto (con
 *     error anotado), nunca la pantalla de "cerrada".
 *   - setSiteStatus pisa SOLO los campos que mandás (merge), para que
 *     guardar la cinta de anuncios no borre el hero.
 * ============================================================
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { __fs } from "../test/mocks/firestore.js";
import { useSiteStatus, setSiteStatus } from "./useSiteStatus.js";

beforeEach(() => {
  __fs.reset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useSiteStatus — la lectura en vivo", () => {
  it("sin documento: tienda abierta y mensaje por defecto (no queda cerrada)", async () => {
    const { result } = renderHook(() => useSiteStatus());
    await waitFor(() => expect(result.current.status).not.toBeNull());
    expect(result.current.status.open).toBe(true);
    expect(result.current.status.message).toBe("Ya volvemos.");
    expect(result.current.status.announcement).toBe("");
  });

  it("lo que guardó el admin pisa los defaults campo por campo", async () => {
    __fs.seed("settings/site", { open: false, message: "Cambiamos de local." });
    const { result } = renderHook(() => useSiteStatus());
    await waitFor(() => expect(result.current.status).not.toBeNull());
    expect(result.current.status.open).toBe(false);
    expect(result.current.status.message).toBe("Cambiamos de local.");
    // Los campos que el admin no guardó siguen con el default.
    expect(result.current.status.announcement).toBe("");
    expect(result.current.status.outletEnabled).toBe(false);
  });

  it("un texto guardado como vacío VENCE al default (así se puede borrar algo)", async () => {
    __fs.seed("settings/site", { announcement: "" });
    const { result } = renderHook(() => useSiteStatus());
    await waitFor(() => expect(result.current.status).not.toBeNull());
    expect(result.current.status.announcement).toBe("");
  });

  it("si Firestore falla, el sitio se muestra ABIERTO (nunca cerrado por un error de red)", async () => {
    const { result } = renderHook(() => useSiteStatus());
    await waitFor(() => expect(result.current.status).not.toBeNull());
    __fs.emitError("settings/site", Object.assign(new Error("offline"), { code: "unavailable" }));

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.status.open).toBe(true);
  });

  it("se actualiza solo cuando el admin guarda (sin recargar)", async () => {
    const { result } = renderHook(() => useSiteStatus());
    await waitFor(() => expect(result.current.status).not.toBeNull());
    expect(result.current.status.open).toBe(true);

    await act(async () => {
      await setSiteStatus({ open: false, announcement: "Hoy no abrimos" });
    });
    await waitFor(() => expect(result.current.status.open).toBe(false));
    expect(result.current.status.announcement).toBe("Hoy no abrimos");
  });
});

describe("setSiteStatus — el guardado con merge", () => {
  it("pisa solo los campos mandados y deja el resto", async () => {
    __fs.seed("settings/site", { open: true, heroImage: "https://cdn/foto.jpg" });
    await setSiteStatus({ announcement: "Drop viernes 20" });

    const doc = __fs.get("settings/site");
    expect(doc.announcement).toBe("Drop viernes 20");
    expect(doc.heroImage).toBe("https://cdn/foto.jpg"); // no se perdió
  });

  it("funciona aunque el documento no exista todavía (crea settings/site)", async () => {
    await setSiteStatus({ open: true });
    expect(__fs.has("settings/site")).toBe(true);
  });
});