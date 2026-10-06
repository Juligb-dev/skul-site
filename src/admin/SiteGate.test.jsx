/**
 * ============================================================
 *  PRUEBAS DE SiteGate (la puerta de la vidriera)
 * ============================================================
 *
 *  SiteGate toma TODA la decisión de qué ve el visitante con dos datos:
 *   - `status` (de useSiteStatus, el documento settings/site),
 *   - `isAdmin` y `user` (de useAdminAuth, la sesión de Firebase Auth).
 *
 *  Acá se mockean esos dos hooks a propósito: lo que se prueba es la
 *  LÓGICA DE DECISIÓN de SiteGate (sus cuatro ramas y qué renderiza en
 *  cada una), no que los hooks hablen bien con Firebase. Que los hooks
 *  lean bien la base ya está cubierto en src/hooks/*.test.jsx, con el
 *  Firestore en memoria.
 *
 *  Las cuatro ramas:
 *    1. cargando (status null o user undefined) → pantalla "Cargando…"
 *    2. abierta → la tienda (children)
 *    3. cerrada y no sos admin → la pantalla de cierre, SIN children
 *    4. cerrada y SÍ sos admin → la tienda + aviso naranja de admin
 * ============================================================
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import SiteGate from "./SiteGate.jsx";

/* ---------------------------------------------------------------
 * Los dos hooks que SiteGate consume, reemplazados por funciones
 * que los tests controlan con mockReturnValue.
 * --------------------------------------------------------------- */
const { useSiteStatus, useAdminAuth } = vi.hoisted(() => ({
  useSiteStatus: vi.fn(),
  useAdminAuth: vi.fn(),
}));

vi.mock("../hooks/useSiteStatus.js", () => ({ useSiteStatus }));
vi.mock("../hooks/useAdminAuth.js", () => ({ useAdminAuth }));

/** La tienda completa, de mentira: si SiteGate la dibuja, se ve este texto. */
function Tienda() {
  return <p>CONTENIDO DE LA TIENDA</p>;
}

/** El mismo estado que usa useSiteStatus cuando Firestore ya respondió. */
function sitio(abierto = true) {
  return { open: abierto, message: "Ya volvemos.", announcement: "" };
}

/** Visitante sin sesión: user ya resuelto (null), nunca admin. */
function visitante() {
  return { user: null, isAdmin: false, login: vi.fn(), logout: vi.fn() };
}

/** El dueño: mismo uid que está escrito en firestore.rules. */
function duenio() {
  return {
    user: { uid: "Ii35YTENxZePLzloJkaC99AL5rn1" },
    isAdmin: true,
    login: vi.fn(),
    logout: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SiteGate — rama 1: todavía no sé", () => {
  it("muestra 'Cargando…' mientras settings/site no respondió", () => {
    useSiteStatus.mockReturnValue({ status: null, error: null });
    useAdminAuth.mockReturnValue(visitante());

    render(<SiteGate><Tienda /></SiteGate>);

    expect(screen.getByText("Cargando…")).toBeInTheDocument();
    expect(screen.queryByText("CONTENIDO DE LA TIENDA")).not.toBeInTheDocument();
  });

  it("también espera si la sesión de auth todavía no se resolvió (user undefined)", () => {
    useSiteStatus.mockReturnValue({ status: sitio(true), error: null });
    useAdminAuth.mockReturnValue({ user: undefined, isAdmin: false });

    render(<SiteGate><Tienda /></SiteGate>);

    expect(screen.getByText("Cargando…")).toBeInTheDocument();
    expect(screen.queryByText("CONTENIDO DE LA TIENDA")).not.toBeInTheDocument();
  });

  it("el 'Cargando…' es una región viva: un lector de pantalla lo anuncia sin tocar nada", () => {
    useSiteStatus.mockReturnValue({ status: null, error: null });
    useAdminAuth.mockReturnValue(visitante());

    render(<SiteGate><Tienda /></SiteGate>);

    const aviso = screen.getByRole("status");
    expect(aviso).toHaveAttribute("aria-live", "polite");
    expect(aviso).toHaveTextContent("Cargando…");
  });

  it("mientras carga NO deja ver la tienda a medio montar (evita el flash de contenido)", () => {
    useSiteStatus.mockReturnValue({ status: null, error: null });
    useAdminAuth.mockReturnValue({ user: undefined, isAdmin: false });

    render(
      <SiteGate>
        <Tienda />
        <Tienda />
      </SiteGate>
    );

    expect(screen.queryAllByText("CONTENIDO DE LA TIENDA")).toHaveLength(0);
  });
});

describe("SiteGate — rama 2: tienda abierta", () => {
  it("dibuja los children cuando la tienda está abierta", () => {
    useSiteStatus.mockReturnValue({ status: sitio(true), error: null });
    useAdminAuth.mockReturnValue(visitante());

    render(<SiteGate><Tienda /></SiteGate>);

    expect(screen.getByText("CONTENIDO DE LA TIENDA")).toBeInTheDocument();
    expect(screen.queryByText("Cargando…")).not.toBeInTheDocument();
  });

  it("los children van tal cual, sin clonarlos ni agregarles nada", () => {
    useSiteStatus.mockReturnValue({ status: sitio(true), error: null });
    useAdminAuth.mockReturnValue(visitante());

    render(
      <SiteGate>
        <Tienda />
        <p>OTRO BLOQUE</p>
      </SiteGate>
    );

    expect(screen.getByText("OTRO BLOQUE")).toBeInTheDocument();
    expect(screen.getByText("CONTENIDO DE LA TIENDA")).toBeInTheDocument();
  });
});

describe("SiteGate — rama 3: tienda cerrada (visitante)", () => {
  it("NO muestra la tienda: tapa todo con la pantalla de cierre", () => {
    useSiteStatus.mockReturnValue({ status: sitio(false), error: null });
    useAdminAuth.mockReturnValue(visitante());

    render(<SiteGate><Tienda /></SiteGate>);

    expect(screen.queryByText("CONTENIDO DE LA TIENDA")).not.toBeInTheDocument();
  });

  it("usa el mensaje que escribió el dueño en /admin, no uno fijo", () => {
    useSiteStatus.mockReturnValue({
      status: { ...sitio(false), message: "Cerramos por inventario" },
      error: null,
    });
    useAdminAuth.mockReturnValue(visitante());

    render(<SiteGate><Tienda /></SiteGate>);

    expect(screen.getByText(/Cerramos por inventario/)).toBeInTheDocument();
  });

  it("los niños no se montan siquiera (no es 'oculto con CSS': no se renderizan)", () => {
    // Si SiteGate los renderizara y solo los escondiera con CSS, la tienda
    // seguiría pidiendo precios, stock y descuentos a Firestore con la
    // vidriera cerrada.
    const alMontarse = vi.fn();
    function TiendaConEfecto() {
      alMontarse();
      return <p>CONTENIDO DE LA TIENDA</p>;
    }

    useSiteStatus.mockReturnValue({ status: sitio(false), error: null });
    useAdminAuth.mockReturnValue(visitante());

    render(<SiteGate><TiendaConEfecto /></SiteGate>);

    expect(alMontarse).not.toHaveBeenCalled();
  });
});

describe("SiteGate — rama 4: cerrada pero entró el dueño", () => {
  it("deja ver la tienda al admin aunque esté cerrada", () => {
    useSiteStatus.mockReturnValue({ status: sitio(false), error: null });
    useAdminAuth.mockReturnValue(duenio());

    render(<SiteGate><Tienda /></SiteGate>);

    expect(screen.getByText("CONTENIDO DE LA TIENDA")).toBeInTheDocument();
  });

  it("le muestra un aviso claro de que SOLO ÉL la ve, para que no confunda el estado real", () => {
    useSiteStatus.mockReturnValue({ status: sitio(false), error: null });
    useAdminAuth.mockReturnValue(duenio());

    render(<SiteGate><Tienda /></SiteGate>);

    // La franja naranja de "esto lo ves solo vos".
    expect(screen.getByText(/Vista de admin/)).toBeInTheDocument();
    expect(screen.getByText(/CERRADA para el resto/)).toBeInTheDocument();
  });
});

describe("SiteGate — lo que NO protege (regresión documentada)", () => {
  it("si el estado llega como objeto abierto, no rompe aunque le falten campos", () => {
    // settings/site guardado sin message/announcement: el merge con los
    // defaults de useSiteStatus lo resuelve, pero SiteGate tiene que
    // tolerar el objeto aunque venga corto (defensa ante datos viejos).
    useSiteStatus.mockReturnValue({
      status: { open: false },
      error: null,
    });
    useAdminAuth.mockReturnValue(visitante());

    expect(() => render(<SiteGate><Tienda /></SiteGate>)).not.toThrow();
    expect(screen.queryByText("CONTENIDO DE LA TIENDA")).not.toBeInTheDocument();
  });
});
