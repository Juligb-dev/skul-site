/**
 * ============================================================
 *  PRUEBAS DEL SEGUIMIENTO DE PEDIDO (página PÚBLICA)
 * ------------------------------------------------------------
 *  Esta página es pública: cualquiera que tenga (o adivine) un código
 *  la abre. Por eso las dos cosas que más importan acá son:
 *
 *  1) QUE NO LEA /orders. Esta página solo lee /orderTracking (la copia
 *     limpia que arma el Worker). Es una decisión de privacidad, no una
 *     limitación técnica: si acá se leyera /orders, el nombre, teléfono
 *     y dirección de cada cliente estarían a un código corto de distancia.
 *
 *  2) QUE NO RENDERICE PII NI AUNQUE VINGA: si un documento de
 *     orderTracking llegara "sucio" (con orderName/orderPhone/orderAddress),
 *     esta pantalla no debe pintarlo. El test de PII siembra un doc así a
 *     propósito y verifica que el nombre/email no aparezcan en el DOM.
 *
 *  También se pinna el flujo completo: busca solo con initialCode, busca
 *  con el botón y con Enter, no dispara contra Firestore con el campo
 *  vacío, y distingue "no existe" de "falló la red".
 * ============================================================
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SeguimientoPedido from "./SeguimientoPedido.jsx";
import { __fs } from "../test/mocks/firestore.js";
import { fmt } from "../utils/format.js";

const pedidoEnTrackeo = (over = {}) => ({
  status: "enviado",
  items: [
    { name: "Hoodie", size: "M", color: "Negro", qty: 2, price: 100 },
    { name: "Buzo", size: "L", color: null, qty: 1, price: 150 },
  ],
  total: 350,
  zoneId: "Envío por Correo Argentino — Sucursal Los Toldos",
  correoTracking: "RG123456789AR",
  ...over,
});

// El algo que pude contener PII si alguien escribiera mal el doc.
const docConPII = pedidoEnTrackeo({
  orderName: "Juliana Romero",
  orderPhone: "+54 9 11 5555 1234",
  orderAddress: "Calle Falsa 123, Los Toldos",
  payMethod: "efectivo",
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SeguimientoPedido", () => {
  it("con initialCode (la URL venía con ?pedido=...) busca solo al montar", async () => {
    __fs.seed("orderTracking/TRK7", pedidoEnTrackeo());
    render(<SeguimientoPedido initialCode="TRK7" />);

    expect(await screen.findByText("Hoodie / M / Negro x2")).toBeInTheDocument();
    expect(screen.getByText("Buzo / L x1")).toBeInTheDocument();
    expect(screen.getByText(fmt(350))).toBeInTheDocument();

    // La barra de progreso llega hasta "Enviado / listo".
    expect(screen.getByText("Enviado / listo")).toBeInTheDocument();
    expect(screen.getByText("Recibido")).toBeInTheDocument();
    expect(screen.getByText("Entregado")).toBeInTheDocument();
  });

  it("escribe el código y busca con el botón", async () => {
    __fs.seed("orderTracking/TRK7", pedidoEnTrackeo());
    render(<SeguimientoPedido />);

    fireEvent.change(screen.getByLabelText("Código de tu pedido"), { target: { value: "TRK7" } });
    fireEvent.click(screen.getByText("Buscar"));

    expect(await screen.findByText("Hoodie / M / Negro x2")).toBeInTheDocument();
  });

  it("con Enter también busca", async () => {
    __fs.seed("orderTracking/TRK7", pedidoEnTrackeo());
    render(<SeguimientoPedido />);

    fireEvent.change(screen.getByLabelText("Código de tu pedido"), { target: { value: "TRK7" } });
    fireEvent.keyDown(screen.getByLabelText("Código de tu pedido"), { key: "Enter" });

    expect(await screen.findByText("Hoodie / M / Negro x2")).toBeInTheDocument();
  });

  it("trae al frente el código de la URL, no el campo (trim: espacios afuera)", async () => {
    __fs.seed("orderTracking/TRK7", pedidoEnTrackeo());
    render(<SeguimientoPedido initialCode="  TRK7  " />);

    expect(await screen.findByText("Hoodie / M / Negro x2")).toBeInTheDocument();
  });

  it("campo vacío: no busca, no pide nada a Firestore ni muestra error", async () => {
    render(<SeguimientoPedido />);
    fireEvent.click(screen.getByText("Buscar"));

    expect(screen.queryByText("No encontramos ningún pedido con ese código.")).not.toBeInTheDocument();
    // Sigue mostrando la pantalla de búsqueda, sin resultado.
    expect(screen.getByText("Ingresá el código que te dimos al confirmar la compra.")).toBeInTheDocument();
  });

  it("código inexistente: mensaje claro que no filtra qué pasó", async () => {
    render(<SeguimientoPedido />);
    fireEvent.change(screen.getByLabelText("Código de tu pedido"), { target: { value: "NO-EXISTE" } });
    fireEvent.click(screen.getByText("Buscar"));

    expect(await screen.findByText(/Revisá que esté completo/)).toBeInTheDocument();
  });

  it("si Firestore falla (red/permissions), no tumba la página: 'probá de nuevo'", async () => {
    __fs.fail("orderTracking/TRK7", Object.assign(new Error("unavailable"), { code: "unavailable" }));
    render(<SeguimientoPedido initialCode="TRK7" />);

    expect(await screen.findByText(/No se pudo buscar el pedido/)).toBeInTheDocument();
    expect(console.error).toHaveBeenCalled();
  });

  it("pedido cancelado: lo avisa por fuera de la barra de progreso", async () => {
    __fs.seed("orderTracking/TRK9", pedidoEnTrackeo({ status: "cancelado" }));
    render(<SeguimientoPedido initialCode="TRK9" />);

    expect(await screen.findByText(/Este pedido fue cancelado/)).toBeInTheDocument();
  });

  it("un estado que no está en la barra (ej: 'revisión') no rompe: barra... y avisos normales", async () => {
    __fs.seed("orderTracking/TRK10", pedidoEnTrackeo({ status: "revisión" }));
    render(<SeguimientoPedido initialCode="TRK10" />);

    expect(await screen.findByText("Hoodie / M / Negro x2")).toBeInTheDocument();
    expect(screen.queryByText(/cancelado/i)).not.toBeInTheDocument();
  });

  it("zona de envío y el número de seguimiento de Correo se muestran al cliente", async () => {
    __fs.seed("orderTracking/TRK7", pedidoEnTrackeo());
    render(<SeguimientoPedido initialCode="TRK7" />);

    expect(await screen.findByText(/Envío \/ retiro:/)).toBeInTheDocument();
    expect(screen.getByText("Envío por Correo Argentino — Sucursal Los Toldos")).toBeInTheDocument();
    expect(screen.getByText("RG123456789AR")).toBeInTheDocument();
    expect(screen.getByText(/Ver estado en correoargentino/)).toBeInTheDocument();
  });

  it("sin número de seguimiento todavía, no muestra ese bloque", async () => {
    __fs.seed("orderTracking/TRK7", pedidoEnTrackeo({ correoTracking: null }));
    render(<SeguimientoPedido initialCode="TRK7" />);

    await screen.findByText(/Envío \/ retiro:/);
    expect(screen.queryByText(/Número de seguimiento/)).not.toBeInTheDocument();
  });

  it("PII: aunque el doc viniera 'sucio', esta pantalla NO pinta nombre, teléfono ni dirección", async () => {
    __fs.seed("orderTracking/TRK-SUCIO", docConPII);
    render(<SeguimientoPedido initialCode="TRK-SUCIO" />);

    // El pedido se ve (items, total, zona, tracking)...
    expect(await screen.findByText("Hoodie / M / Negro x2")).toBeInTheDocument();
    // ...pero los datos privados quedaron fuera del DOM.
    expect(screen.queryByText(/Juliana Romero/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Calle Falsa/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$.*Efectivo/i)).not.toBeInTheDocument();
  });
});