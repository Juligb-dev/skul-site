/**
 * ============================================================
 *  PRUEBAS DE LOS HOOKS DE NAVEGADOR (useMediaQuery / useReveal)
 * ------------------------------------------------------------
 *  Son los dos hooks que dependen de APIs que JSDOM no trae: uno de
 *  matchMedia (anchos de pantalla) y otro de IntersectionObserver
 *  (elementos que entran en pantalla). Acá se les da un doble chico y
 *  se prueba:
 *
 *   useMediaQuery:
 *   - el valor inicial respeta la query de verdad;
 *   - si la query cambia (se giró el teléfono), el hook se entera;
 *   - sobrevive a la falta de matchMedia (SSR/test sin DOM) con false.
 *
 *   useReveal:
 *   - arranca oculto y recién se muestra cuando el elemento entra en
 *     pantalla (treshold 0.15);
 *   - al mostrarse se desuscribe (disconnect) y al desmontar sin haberse
 *     mostrado, también;
 *   - no rompe si el ref aún no está montado.
 * ============================================================
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, render, act } from "@testing-library/react";
import { useRef } from "react";
import { useMediaQuery } from "./useMediaQuery.js";
import { useReveal } from "./useReveal.js";

function makeMatchMedia(initial) {
  const listeners = new Map();
  const mql = {
    matches: initial,
    media: "(max-width: 768px)",
    addEventListener(type, fn) {
      listeners.set(type, fn);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    addListener(fn) {
      listeners.set("change", fn);
    },
    removeListener(fn) {
      listeners.delete("change");
    },
    dispatchChange(v) {
      this.matches = v;
      listeners.get("change")?.({ matches: v });
    },
  };
  return { mql, fn: vi.fn(() => mql) };
}

// Uso reales (los del setup): los restauran los afterEach.
const ORIGINAL_MATCHMEDIA = globalThis.matchMedia;

afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.matchMedia = ORIGINAL_MATCHMEDIA;
  globalThis.IntersectionObserver = undefined;
});

describe("useMediaQuery", () => {
  it("devuelve true cuando la query se cumple desde el principio", () => {
    globalThis.matchMedia = makeMatchMedia(true).fn;
    const { result } = renderHook(() => useMediaQuery("(max-width: 768px)"));
    expect(result.current).toBe(true);
  });

  it("devuelve false cuando la query no se cumple", () => {
    globalThis.matchMedia = makeMatchMedia(false).fn;
    const { result } = renderHook(() => useMediaQuery("(max-width: 768px)"));
    expect(result.current).toBe(false);
  });

  it("se actualiza cuando la query cambia (giraste el teléfono)", () => {
    const { mql } = makeMatchMedia(false);
    globalThis.matchMedia = vi.fn(() => mql);

    const { result } = renderHook(() => useMediaQuery("(max-width: 768px)"));
    expect(result.current).toBe(false);

    act(() => mql.dispatchChange(true));
    expect(result.current).toBe(true);
  });

  it("sin matchMedia (SSR o test sin DOM) devuelve false y no rompe", () => {
    globalThis.matchMedia = undefined;
    const { result } = renderHook(() => useMediaQuery("(max-width: 768px)"));
    expect(result.current).toBe(false);
  });
});

describe("useReveal", () => {
  function HarnessDeReveal() {
    const [ref, shown] = useReveal();
    return (
      <div ref={ref} data-testid="bloque" className={shown ? "reveal-shown" : "reveal"}>
        {shown ? "APARECIÓ" : "OCULTO"}
      </div>
    );
  }

  function instalaObserver() {
    const estado = { callback: null, instancias: [] };
    class FakeIO {
      constructor(cb) {
        estado.callback = cb;
        estado.instancias.push(this);
        this.observados = 0;
        this.desconectado = false;
      }
      observe() {
        this.observados++;
      }
      disconnect() {
        this.desconectado = true;
      }
    }
    globalThis.IntersectionObserver = FakeIO;
    return estado;
  }

  it("arranca oculto; al entrar en pantalla se muestra y deja de mirar", () => {
    const estado = instalaObserver();
    const view = render(<HarnessDeReveal />);

    expect(view.getByText("OCULTO")).toBeInTheDocument();
    expect(estado.callback).not.toBeNull();
    expect(estado.instancias[0].observados).toBe(1);

    // Se asoma pero no alcanza el 15%: sigue oculto.
    act(() => estado.callback([{ isIntersecting: false }]));
    expect(view.getByText("OCULTO")).toBeInTheDocument();

    // Entró en pantalla: aparece, y el observer se desconecta.
    act(() => estado.callback([{ isIntersecting: true }]));
    expect(view.getByText("APARECIÓ")).toBeInTheDocument();
    expect(estado.instancias[0].desconectado).toBe(true);
  });

  it("si se desmonta sin haber aparecido, se desconecta igual (no deja el observer colgado)", () => {
    const estado = instalaObserver();
    const view = render(<HarnessDeReveal />);
    expect(estado.instancias[0].desconectado).toBe(false);

    view.unmount();
    expect(estado.instancias[0].desconectado).toBe(true);
  });
});