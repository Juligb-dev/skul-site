/**
 * ============================================================
 *  PRUEBAS DEL FORMULARIO DEL NEWSLETTER (en Footer)
 * ============================================================
 *
 *  El formulario de suscripción es el único punto del sitio donde un
 *  visitante escribe texto libre y el sitio lo guarda en la base. Acá se
 *  prueba la máquina de estados del formulario, no los hooks (eso está
 *  en src/hooks/useCoupons.test.jsx):
 *
 *    idle → guardando → listo / repetido / invalido / error
 *
 *  Lo más importante que protegen estos tests:
 *
 *   1. EL CONSENTIMIENTO: sin la casilla marcada no se manda nada. Es
 *      una obligación legal (marketing por mail), no una preferencia de
 *      UI: si un refactor dejara el botón habilitado sin consent, el
 *      sitio estaría recolectando mails sin permiso explícito.
 *
 *   2. EL MENSAJE VERDADERO: un correo mal escrito no puede responder
 *      "ya estabas en la lista". Ese era un bug real: las reglas de
 *      Firestore rechazan un email inválido con el mismo error que un
 *      correo repetido (permission-denied), el hook los traducía igual
 *      y el visitante quedaba leyendo algo falso.
 *
 *   3. LA AUSENCIA DE ESCRITURA: los casos de error no tienen que dejar
 *      ni un documento en la base. Se verifica con el Firestore en
 *      memoria (__fs), que es el mismo que usa el código real.
 * ============================================================
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Footer from "./Footer.jsx";
import { __fs } from "../test/mocks/firestore.js";

/* ---------------------------------------------------------------
 * El aviso por Telegram se manda DESPUÉS de guardar. No es lo que se
 * prueba acá (y si fallara, no debería romper el formulario, que es
 * exactamente lo que ya está comentado en Footer: "Si falla, la
 * suscripción sigue guardada").
 * --------------------------------------------------------------- */
const { notifyNewSubscriber } = vi.hoisted(() => ({ notifyNewSubscriber: vi.fn() }));
vi.mock("../utils/notifyTelegram.js", () => ({ notifyNewSubscriber }));

function montar() {
  return render(<Footer nav={() => {}} goCatalog={() => {}} />);
}

/** El formulario completo, para buscar adentro sin enredar con selectores. */
function form() {
  return document.querySelector(".rotten-newsletter-form-wrap");
}

async function escribir(user, correo) {
  const input = screen.getByLabelText("Correo electrónico");
  await user.clear(input);
  if (correo) await user.type(input, correo);
  return input;
}

async function marcarConsentimiento(user) {
  const check = screen.getByLabelText(/Quiero recibir novedades/);
  await user.click(check);
  return check;
}

beforeEach(() => {
  vi.clearAllMocks();
  // El aviso de Telegram tampoco debe salir a la red desde los tests.
  notifyNewSubscriber.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Newsletter — sin consentimiento no se manda nada", () => {
  it("el botón de enviar arranca deshabilitado", () => {
    montar();
    expect(screen.getByRole("button", { name: "Suscribirse" })).toBeDisabled();
  });

  it("se habilita recién cuando marca la casilla de consentimiento", async () => {
    const user = userEvent.setup();
    montar();
    await user.type(screen.getByLabelText("Correo electrónico"), "ana@ejemplo.com");

    expect(screen.getByRole("button", { name: "Suscribirse" })).toBeDisabled();

    await user.click(screen.getByLabelText(/Quiero recibir novedades/));

    expect(screen.getByRole("button", { name: "Suscribirse" })).toBeEnabled();
  });

  it("con consentimiento pero sin escribir nada, tampoco se guarda", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByLabelText(/Quiero recibir novedades/));

    // El input es type="required", pero si el navegador no valida (o el
    // evento de submit se dispara a mano), el hook corta igual.
    fireEvent.submit(form());

    await waitFor(() =>
      expect(screen.getByText("Ese correo no parece un correo. Revisalo y volvé a intentar.")).toBeInTheDocument()
    );
    expect(__fs.ids("newsletter")).toHaveLength(0);
  });

  it("al desmarcar la casilla se vuelve a bloquear el envío", async () => {
    const user = userEvent.setup();
    montar();
    const check = screen.getByLabelText(/Quiero recibir novedades/);

    await user.click(check);
    expect(screen.getByRole("button", { name: "Suscribirse" })).toBeEnabled();

    await user.click(check);
    expect(screen.getByRole("button", { name: "Suscribirse" })).toBeDisabled();
  });
});

describe("Newsletter — camino feliz", () => {
  it("con consentimiento y un correo válido, guarda el suscriptor y confirma", async () => {
    const user = userEvent.setup();
    montar();

    await user.type(screen.getByLabelText("Correo electrónico"), "  Ana@Ejemplo.com  ");
    await user.click(screen.getByLabelText(/Quiero recibir novedades/));
    fireEvent.submit(form());

    await waitFor(() => expect(screen.getByText("¡Listo, ya estás en la lista!")).toBeInTheDocument());

    // Se guarda normalizado: sin espacios y en minúsculas, para que la
    // misma persona no aparezca dos veces en la lista.
    expect(__fs.ids("newsletter")).toEqual(["ana@ejemplo.com"]);
  });

  it("después de suscribirse, el formulario queda limpio para la próxima persona", async () => {
    const user = userEvent.setup();
    montar();

    await user.type(screen.getByLabelText("Correo electrónico"), "ana@ejemplo.com");
    await user.click(screen.getByLabelText(/Quiero recibir novedades/));
    fireEvent.submit(form());
    await waitFor(() => expect(screen.getByText("¡Listo, ya estás en la lista!")).toBeInTheDocument());

    // "Suscribir otro correo" vuelve al formulario: el campo está vacío y
    // la casilla desmarcada (nada de lo que escribió la persona anterior
    // queda en pantalla).
    await user.click(screen.getByRole("button", { name: "Suscribir otro correo" }));

    expect(screen.getByLabelText("Correo electrónico")).toHaveValue("");
    expect(screen.getByLabelText(/Quiero recibir novedades/)).not.toBeChecked();
  });

  it("un correo repetido dice 'ya estabas en la lista', y lo deja legible", async () => {
    __fs.seed("newsletter/ana@ejemplo.com", { email: "ana@ejemplo.com", consent: true, source: "footer" });

    const user = userEvent.setup();
    montar();

    await user.type(screen.getByLabelText("Correo electrónico"), "ana@ejemplo.com");
    await user.click(screen.getByLabelText(/Quiero recibir novedades/));
    fireEvent.submit(form());

    await waitFor(() => expect(screen.getByText("Ese correo ya estaba en la lista")).toBeInTheDocument());
    // Un solo documento: no se duplicó ni se pisó la fecha original.
    expect(__fs.ids("newsletter")).toEqual(["ana@ejemplo.com"]);
  });

  it("'Suscribir otro correo' devuelve el formulario al estado inicial", async () => {
    const user = userEvent.setup();
    montar();

    await user.type(screen.getByLabelText("Correo electrónico"), "ana@ejemplo.com");
    await user.click(screen.getByLabelText(/Quiero recibir novedades/));
    fireEvent.submit(form());
    await waitFor(() => expect(screen.getByText("¡Listo, ya estás en la lista!")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Suscribir otro correo" }));

    expect(screen.getByLabelText("Correo electrónico")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suscribirse" })).toBeDisabled();
  });

  it("manda el aviso por Telegram, pero aunque ese aviso falle la suscripción quedó guardada", async () => {
    notifyNewSubscriber.mockRejectedValue(new Error("Telegram no responde"));

    const user = userEvent.setup();
    montar();

    await user.type(screen.getByLabelText("Correo electrónico"), "ana@ejemplo.com");
    await user.click(screen.getByLabelText(/Quiero recibir novedades/));
    fireEvent.submit(form());

    // El estado de éxito NO depende del aviso: la promesa de Telegram se
    // descarta adentro del try y, si explota, no se pisa el estado.
    await waitFor(() => expect(screen.getByText("¡Listo, ya estás en la lista!")).toBeInTheDocument());
    expect(__fs.ids("newsletter")).toEqual(["ana@ejemplo.com"]);
  });
});

describe("Newsletter — correo mal escrito (el bug de los mensajes cruzados)", () => {
  it.each([
    ["sin arroba", "hola"],
    ["con arroba pero nada más", "ana@"],
    ["dominio sin punto", "ana@ejemplo"],
    ["solo espacios", "   "],
  ])("%s: dice que el correo no es válido y NO dice que ya estaba en la lista", async (_caso, texto) => {
    const user = userEvent.setup();
    montar();

    await user.type(screen.getByLabelText("Correo electrónico"), texto);
    await user.click(screen.getByLabelText(/Quiero recibir novedades/));
    fireEvent.submit(form());

    await waitFor(() =>
      expect(screen.getByText("Ese correo no parece un correo. Revisalo y volvé a intentar.")).toBeInTheDocument()
    );

    // Éste es el punto: jamás puede aparecer el mensaje de "repetido"
    // para un correo que nunca existió en la lista.
    expect(screen.queryByText("Ese correo ya estaba en la lista")).not.toBeInTheDocument();
    expect(__fs.ids("newsletter")).toHaveLength(0);
  });

  it("el aviso de correo inválido no se confunde con el de 'no pudimos guardar'", async () => {
    const user = userEvent.setup();
    montar();

    await user.type(screen.getByLabelText("Correo electrónico"), "esto-no-es-un-mail");
    await user.click(screen.getByLabelText(/Quiero recibir novedades/));
    fireEvent.submit(form());

    await waitFor(() =>
      expect(screen.getByText(/no parece un correo/)).toBeInTheDocument()
    );
    expect(screen.queryByText("No pudimos guardarlo. Probá de nuevo o escribinos por WhatsApp.")).not.toBeInTheDocument();
  });

  it("después de un correo inválido se puede reintentar sin recargar la página", async () => {
    const user = userEvent.setup();
    montar();

    const input = screen.getByLabelText("Correo electrónico");
    await user.type(input, "malo");
    await user.click(screen.getByLabelText(/Quiero recibir novedades/));
    fireEvent.submit(form());
    await waitFor(() => expect(screen.getByText(/no parece un correo/)).toBeInTheDocument());

    // Corrige el correo y vuelve a mandar: el formulario sigue vivo.
    await user.clear(input);
    await user.type(input, "ana@ejemplo.com");
    fireEvent.submit(form());

    await waitFor(() => expect(screen.getByText("¡Listo, ya estás en la lista!")).toBeInTheDocument());
    expect(__fs.ids("newsletter")).toEqual(["ana@ejemplo.com"]);
  });
});

describe("Newsletter — accesibilidad y semántica del formulario", () => {
  it("el campo de correo tiene nombre accesible (no depende solo del placeholder)", async () => {
    montar();
    const input = screen.getByLabelText("Correo electrónico");
    expect(input).toHaveAttribute("type", "email");
  });

  it("la casilla de consentimiento tiene etiqueta con texto visible", () => {
    montar();
    expect(screen.getByLabelText(/Quiero recibir novedades/)).toBeInTheDocument();
  });

  it("el formulario es un <form> real: se puede mandar con Enter", async () => {
    const user = userEvent.setup();
    montar();

    // Enter dispara el submit nativo, sin pasar por el botón.
    await user.click(screen.getByLabelText(/Quiero recibir novedades/));
    await user.type(screen.getByLabelText("Correo electrónico"), "ana@ejemplo.com{Enter}");

    await waitFor(() => expect(screen.getByText("¡Listo, ya estás en la lista!")).toBeInTheDocument());
    expect(__fs.ids("newsletter")).toEqual(["ana@ejemplo.com"]);
  });

  it("un envío doble (doble Enter / doble click) no manda dos avisos", async () => {
    const user = userEvent.setup();
    montar();

    await user.type(screen.getByLabelText("Correo electrónico"), "ana@ejemplo.com");
    await user.click(screen.getByLabelText(/Quiero recibir novedades/));

    // Dos submits seguidos, sin esperar: es lo que pasa con un doble
    // Enter o con dos clicks rápidos. La guarda `estado === "guardando"`
    // tiene que frenar el segundo.
    fireEvent.submit(form());
    fireEvent.submit(form());

    await waitFor(() => expect(screen.getByText("¡Listo, ya estás en la lista!")).toBeInTheDocument());

    // Lo observable de un envío duplicado: el aviso por Telegram se
    // mandaría dos veces (el segundo doc quedaría pisado igual, así que
    // el conteo de documentos no alcanza para detectarlo).
    expect(notifyNewSubscriber).toHaveBeenCalledTimes(1);
    expect(__fs.ids("newsletter")).toHaveLength(1);
  });

  it("el aviso de estado se muestra junto al formulario, dentro del mismo bloque", async () => {
    const user = userEvent.setup();
    montar();

    await user.type(screen.getByLabelText("Correo electrónico"), "malo");
    await user.click(screen.getByLabelText(/Quiero recibir novedades/));
    fireEvent.submit(form());

    await waitFor(() =>
      expect(within(form()).getByText(/no parece un correo/)).toBeInTheDocument()
    );
  });
});
