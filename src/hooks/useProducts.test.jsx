/**
 * ============================================================
 *  PRUEBAS DEL CATÁLOGO (useProducts) — qué se muestra y qué no
 * ------------------------------------------------------------
 *  El catálogo es la lista que todas las pantallas dibujan, así que su
 *  hook tiene tres responsabilidades que se prueban acá por separado:
 *
 *   - TRAER y repintar: la lista llega con el `id` adelante (en el
 *     documento el ID no está adentro de los datos), y la suscripción
 *     en vivo actualiza la pantalla sola cuando el admin agrega o edita.
 *
 *   - DEVOLVER HASTA LOS DESACTIVADOS: el filtro de `active` NO va acá
 *     (ese fue un bug viejo que hacía desaparecer del panel el producto
 *     recién escondido). Cada pantalla filtra lo suyo.
 *
 *   - NO MENTIR SI FIRESTORE FALLA: en desarrollo se muestran los
 *     productos semilla para poder tocar el diseño (con la banderita
 *     `usingFallback`), pero en producción el catálogo queda VACÍO con
 *     el error a la vista. Nunca se muestra un catálogo falso con
 *     precios viejos en el sitio real.
 * ============================================================
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { __fs } from "../test/mocks/firestore.js";
import { useProducts, addProduct, updateProduct, deleteProduct } from "./useProducts.js";

beforeEach(() => {
  __fs.reset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("useProducts — la lista en vivo", () => {
  it("trae el catálogo con el id adelante (el documento no lo trae adentro)", async () => {
    __fs.seed("products/remera-1", { name: "Remera", price: 5000 });
    const { result } = renderHook(() => useProducts());
    await waitFor(() => expect(result.current.products).not.toBeNull());
    expect(result.current.products[0]).toMatchObject({ id: "remera-1", name: "Remera", price: 5000 });
  });

  it("no filtra los productos desactivados (eso lo hace cada pantalla)", async () => {
    __fs.seed("products/visible", { name: "Hoodie", active: true });
    __fs.seed("products/oculto", { name: "Remera", active: false });
    const { result } = renderHook(() => useProducts());
    await waitFor(() => expect(result.current.products).toHaveLength(2));
    expect(result.current.products.map((p) => p.id).sort()).toEqual(["oculto", "visible"]);
  });

  it("se actualiza solo cuando el admin agrega una prenda (sin recargar)", async () => {
    const { result } = renderHook(() => useProducts());
    await waitFor(() => expect(result.current.products).toEqual([]));

    await act(async () => {
      await addProduct({ name: "Buzo", price: 8000 });
    });
    await waitFor(() => expect(result.current.products).toHaveLength(1));
    expect(result.current.products[0].name).toBe("Buzo");
  });

  it("en DEV si Firestore falla usa los semilla y lo avisa con usingFallback", async () => {
    // import.meta.env.DEV es true en los tests (y en `npm run dev`).
    const { result } = renderHook(() => useProducts());
    await waitFor(() => expect(result.current.products).not.toBeNull());
    __fs.emitError("products", new Error("unavailable"));

    await waitFor(() => expect(result.current.usingFallback).toBe(true));
    expect(result.current.products.length).toBeGreaterThan(0);
    expect(result.current.products[0].id).toMatch(/^seed-/);
  });

  it("en producción NO usa los semilla: catálogo vacío y error visible", async () => {
    // Esto es la decisión importante: una tienda en blanco antes que una
    // tienda con precios falsos. El visitante ve "no hay productos" y se
    // entera del error en vez de comprar algo que no existe a un precio
    // que no vale.
    vi.stubEnv("DEV", false);
    const { result } = renderHook(() => useProducts());
    await waitFor(() => expect(result.current.products).not.toBeNull());

    __fs.emitError("products", new Error("permission-denied"));
    await waitFor(() => expect(result.current.products).toEqual([]));
    expect(result.current.usingFallback).toBe(false);
    expect(result.current.productsError).toBeTruthy();
  });
});

describe("addProduct / updateProduct / deleteProduct — las UNA escrituras del admin", () => {
  it("addProduct: crea con active: true por defecto", async () => {
    const ref = await addProduct({ name: "Campera", price: 15000 });
    expect(__fs.has(`products/${ref.id}`)).toBe(true);
    expect(__fs.get(`products/${ref.id}`).active).toBe(true);
  });

  it("updateProduct: pisa solo los campos mandados (no pisa el resto)", async () => {
    __fs.seed("products/remera-1", { name: "Remera", price: 5000, stock: { M: 3, L: 2 } });
    await updateProduct("remera-1", { price: 5200, stock: { L: 5 } });

    const doc = __fs.get("products/remera-1");
    expect(doc.price).toBe(5200);
    expect(doc.stock).toEqual({ M: 3, L: 5 }); // la M no se perdió
  });

  it("updateProduct: ocultar una prenda (active: false) no la borra", async () => {
    __fs.seed("products/remera-1", { name: "Remera", price: 5000, active: true });
    await updateProduct("remera-1", { active: false });
    expect(__fs.has("products/remera-1")).toBe(true);
    expect(__fs.get("products/remera-1").active).toBe(false);
  });

  it("deleteProduct: borra la prenda entera", async () => {
    __fs.seed("products/vieja", { name: "Vieja" });
    await deleteProduct("vieja");
    expect(__fs.has("products/vieja")).toBe(false);
  });
});