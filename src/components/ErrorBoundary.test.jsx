/**
 * ============================================================
 *  PRUEBAS DE ErrorBoundary (la red de seguridad de toda la app)
 * ============================================================
 *
 *  El ErrorBoundary es la razón de que un fallo de Firestore no apague
 *  la tienda entera: cuando un componente de adentro revienta durante
 *  el render, en vez de pantalla blanca dibuja el aviso con el botón de
 *  recarga.
 *
 *  Dos detalles de este test que no son ganas de escribir documentación:
 *
 *   1. React loguea cada error capturado por un boundary en
 *      console.error. Sin silenciarlo, la salida del suite queda ilegible
 *      (y se parece mucho a "el test falló"). Por eso se espía y se
 *      verifica además que el error se registró: que se loguee es parte
 *      del contrato del componente (es lo único que deja rastro para
 *      poder reproducirlo).
 *
 *   2. El error tiene que lanzarse DURANTE EL RENDER, no dentro de un
 *      handler. Esa es una regla de React, no del proyecto: los
 *      boundaries solo atrapan errores de renderizado. Un onClick que
 *      revienta tiene que manejarse donde se dispara.
 * ============================================================
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary.jsx";

/** Un hijo que revienta al dibujarse. La causa del fallo es siempre
 *  "boom": el mensaje es para distinguirlo de cualquier otro error que
 *  pudiera aparecer. */
function Explosion({ mensaje = "boom" }) {
  throw new Error(mensaje);
}

beforeEach(() => {
  // React manda el stack del error capturado por console.error. Se
  // espía en vez de reemplazarlo para poder verificarlo y para que la
  // salida de la suite quede limpia.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ErrorBoundary — camino feliz", () => {
  it("dibuja los hijos tal cual cuando nada falló", () => {
    render(
      <ErrorBoundary>
        <p>TODO BIEN</p>
      </ErrorBoundary>
    );

    expect(screen.getByText("TODO BIEN")).toBeInTheDocument();
    expect(screen.queryByText(/Algo salió mal/)).not.toBeInTheDocument();
  });

  it("es invisible: no agrega ningún texto ni nodo propio en el camino feliz", () => {
    const { container } = render(
      <ErrorBoundary>
        <p>UN SOLO HIJO</p>
      </ErrorBoundary>
    );

    // exacto: un solo hijo, sin nada colgado al costado.
    expect(container.children).toHaveLength(1);
  });

  it("no loguea nada si no hubo error", () => {
    render(
      <ErrorBoundary>
        <p>TODO BIEN</p>
      </ErrorBoundary>
    );

    expect(console.error).not.toHaveBeenCalled();
  });

  it("pasa las props nuevas en vivo (si el padre le cambia el hijo, lo actualiza)", () => {
    const { rerender } = render(
      <ErrorBoundary>
        <p>PRIMERA VERSIÓN</p>
      </ErrorBoundary>
    );
    expect(screen.getByText("PRIMERA VERSIÓN")).toBeInTheDocument();

    rerender(
      <ErrorBoundary>
        <p>SEGUNDA VERSIÓN</p>
      </ErrorBoundary>
    );
    expect(screen.getByText("SEGUNDA VERSIÓN")).toBeInTheDocument();
  });
});

describe("ErrorBoundary — cuando algo revienta", () => {
  it("atrapa el error y muestra el aviso, NO la pantalla blanca", () => {
    render(
      <ErrorBoundary>
        <Explosion />
      </ErrorBoundary>
    );

    expect(screen.getByText(/Algo salió mal/)).toBeInTheDocument();
    expect(screen.getByText(/Recargá la página/)).toBeInTheDocument();
  });

  it("deja de dibujar el contenido roto (no queda a medio render)", () => {
    render(
      <ErrorBoundary>
        <Explosion mensaje="falta la API key" />
        <p>ESTO NO DEBERÍA VENIRSE ABAJO EN LA PANTALLA</p>
      </ErrorBoundary>
    );

    expect(screen.queryByText(/ESTO NO DEBERÍA/)).not.toBeInTheDocument();
  });

  it("ofrece la salida: un botón visible para recargar", () => {
    render(
      <ErrorBoundary>
        <Explosion />
      </ErrorBoundary>
    );

    const boton = screen.getByRole("button", { name: /Recargar Página/ });
    expect(boton).toBeEnabled();
  });

  it("loguea el error con su detalle, así se puede reproducir", () => {
    render(
      <ErrorBoundary>
        <Explosion mensaje="falló la base" />
      </ErrorBoundary>
    );

    expect(console.error).toHaveBeenCalled();
    // El primer argumento es la etiqueta del log del componente; en algún
    // argumento (o agrupado) tiene que estar el error real.
    const todoLlego = console.error.mock.calls.flat().join(" ");
    expect(todoLlego).toContain("Error de renderizado capturado");
  });

  it("el error profundo también se atrapa (no hace falta que sea hijo directo)", () => {
    render(
      <ErrorBoundary>
        <div>
          <div>
            <div>
              <Explosion />
            </div>
          </div>
        </div>
      </ErrorBoundary>
    );

    expect(screen.getByText(/Algo salió mal/)).toBeInTheDocument();
  });

  it("el resto de la app FUERA del boundary sigue viva (el fallo no es contagioso)", () => {
    render(
      <>
        <p>LA PARTE SANA SIGUE VIVA</p>
        <ErrorBoundary>
          <Explosion />
        </ErrorBoundary>
        <p>Y ESTA OTRA TAMBIÉN</p>
      </>
    );

    expect(screen.getByText("LA PARTE SANA SIGUE VIVA")).toBeInTheDocument();
    expect(screen.getByText("Y ESTA OTRA TAMBIÉN")).toBeInTheDocument();
    expect(screen.getByText(/Algo salió mal/)).toBeInTheDocument();
  });
});

describe("ErrorBoundary — el estado no se resetea solo", () => {
  it("una vez que falló, sigue en el aviso aunque el padre vuelva a renderizar", () => {
    // Si el boundary se reiniciara solo con cualquier re-render del
    // padre, entraría en un loop de "explota, vuelve a explotar".
    const { rerender } = render(
      <ErrorBoundary>
        <Explosion />
      </ErrorBoundary>
    );
    expect(screen.getByText(/Algo salió mal/)).toBeInTheDocument();

    rerender(
      <ErrorBoundary>
        <Explosion mensaje="otra vez" />
      </ErrorBoundary>
    );

    expect(screen.getByText(/Algo salió mal/)).toBeInTheDocument();
    // Sigue habiendo UN solo intento registrado, no uno por render.
    expect(screen.queryAllByText(/Algo salió mal/)).toHaveLength(1);
  });
});

describe("ErrorBoundary — el aviso no depende del CSS de la tienda", () => {
  it("los estilos del fallback son inline: si el CSS es el que se rompió, igual se ve", () => {
    // Éste es el motivo real de que el fallback use style={{}} en vez de
    // una clase: el caso más probable de "algo salió mal" es que el CSS
    // no cargó, y un fallback estilado con una clase no se vería.
    const { container } = render(
      <ErrorBoundary>
        <Explosion />
      </ErrorBoundary>
    );

    // El div EXTERNO es el que lleva los estilos inline (el interior
    // solo agrupa el texto): por eso se toma la raíz renderizada.
    const aviso = container.firstElementChild;
    expect(aviso).toHaveStyle({ backgroundColor: "rgb(0, 0, 0)" });
    expect(aviso).toHaveStyle({ color: "rgb(255, 255, 255)" });
  });
});
