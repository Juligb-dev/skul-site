/**
 * ============================================================
 *  PRUEBAS DE LA SESIÓN DEL ADMIN (useAdminAuth)
 * ------------------------------------------------------------
 *  useAdminAuth es la puerta de /admin: decide si mostrar el login o el
 *  panel, y también (vía SiteGate) si el visitante logueado puede ver la
 *  tienda aunque esté cerrada.
 *
 *  La sesión simulada la maneja el setup (globalThis.__auth): el test
 *  pone o saca el usuario y vuelve a montar el hook, igual que si el
 *  visitante entrara a /admin después de loguearse (cada entrada relee
 *  la sesión con onAuthStateChanged).
 *
 *  OJO: que `isAdmin` dé true NO es una validación de seguridad. Es una
 *  comparación de texto en el navegador; lo que frena de verdad a quien
 *  no es admin son las reglas de Firestore (ver npm run test:rules).
 * ============================================================
 */
import { describe, it, expect } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useAdminAuth } from "./useAdminAuth.js";

const ADMIN_UID = "Ii35YTENxZePLzloJkaC99AL5rn1";

const renderoAdmin = () => {
  const { result, unmount } = renderHook(() => useAdminAuth());
  return { result, unmount };
};

describe("useAdminAuth", () => {
  it("sin sesión: user null y isAdmin false", async () => {
    const { result } = renderoAdmin();
    await waitFor(() => expect(result.current.user).toBeNull());
    expect(result.current.isAdmin).toBe(false);
  });

  it("con el usuario admin de entrada: isAdmin true", async () => {
    globalThis.__auth.currentUser = { uid: ADMIN_UID, email: "admin@skul.test" };
    const { result } = renderoAdmin();
    await waitFor(() => expect(result.current.user).not.toBeNull());
    expect(result.current.isAdmin).toBe(true);
  });

  it("logueado pero sin ser el admin: isAdmin false (aunque tuviera sesión)", async () => {
    globalThis.__auth.currentUser = { uid: "otro-uid", email: "juan@mail.com" };
    const { result } = renderoAdmin();
    await waitFor(() => expect(result.current.user).not.toBeNull());
    expect(result.current.user.email).toBe("juan@mail.com");
    expect(result.current.isAdmin).toBe(false);
  });

  it("login correcto: deja el usuario admin (y si recargás, entrás de una)", async () => {
    const { result } = renderoAdmin();
    await waitFor(() => expect(result.current.user).toBeNull());

    await act(async () => {
      await result.current.login("admin@skul.test", "clave");
    });
    expect(globalThis.__auth.currentUser.uid).toBe(ADMIN_UID);

    // Recargar la página: el hook de nuevo montaje lee la sesión guardada.
    const segundo = renderoAdmin();
    await waitFor(() => expect(segundo.result.current.user).not.toBeNull());
    expect(segundo.result.current.isAdmin).toBe(true);
  });

  it("login con credenciales inválidas: la promesa rechaza (el login muestra el error)", async () => {
    globalThis.__auth.signInError = new Error("auth/invalid-credential");
    const { result } = renderoAdmin();
    await waitFor(() => expect(result.current.user).toBeNull());

    await act(async () => {
      await expect(result.current.login("admin@skul.test", "mal")).rejects.toThrow();
    });
    expect(globalThis.__auth.currentUser).toBeNull();
  });

  it("logout: vuelve a null y a no-admin", async () => {
    globalThis.__auth.currentUser = { uid: ADMIN_UID };
    const { result } = renderoAdmin();
    await waitFor(() => expect(result.current.user).not.toBeNull());

    await act(async () => {
      await result.current.logout();
    });
    expect(globalThis.__auth.currentUser).toBeNull();

    const segundo = renderoAdmin();
    await waitFor(() => expect(segundo.result.current.user).toBeNull());
    expect(segundo.result.current.isAdmin).toBe(false);
  });

  it("desmontar no rompe ni deja suscripciones colgadas", async () => {
    const { result, unmount } = renderoAdmin();
    await waitFor(() => expect(result.current.user).toBeNull());
    expect(() => unmount()).not.toThrow();
  });
});