import React, { useState } from "react";
import { MessageCircle, Instagram, ArrowRight } from "lucide-react";
import { WHATSAPP_NUMBER, INSTAGRAM_HANDLE, CONTACT_EMAIL } from "../data/config.js";
import { subscribeToNewsletter } from "../hooks/useNewsletter.js";
import { notifyNewSubscriber } from "../utils/notifyTelegram.js";

/**
 * Pie de página del sitio: newsletter, contacto, navegación, legales y
 * redes. Lo dibuja StoreApp en todas las pantallas menos el checkout.
 *
 * Props:
 *  - nav(pagina): cambia de pantalla ("nosotros", "privacidad"...). Lo
 *    paso desde StoreApp porque acá no hay router.
 *  - goCatalog(id): abre el catálogo. Se usa para el link "Shop".
 *
 * Datos de contacto (WhatsApp, Instagram, mail) salen de data/config.js
 * para no repetirlos en el código.
 */
export default function Footer({ nav, goCatalog }) {
  // El mail que está escribiendo el visitante.
  const [email, setEmail] = useState("");
  // Consentimiento explícito para recibir novedades. Es una decisión
  // comercial del visitante, separada del aviso de que puede leer la
  // política de privacidad (que va como texto, no como casilla).
  const [consent, setConsent] = useState(false);
  // Un solo estado para toda la máquina del formulario: idle (normal),
  // guardando (spinner), listo, repetido (ya estaba en la lista) o
  // error. Con una variable sola el render es obvio.
  const [estado, setEstado] = useState("idle"); // idle | guardando | listo | repetido | error
  // Armo los links de contacto una vez y los reutilizo en las dos
  // columnas donde aparecen.
  const waLink = `https://wa.me/${WHATSAPP_NUMBER}`;
  const igLink = `https://instagram.com/${INSTAGRAM_HANDLE}`;

  /** Suscripción al newsletter. Va como handler del <form>, así que
   *  el primer parámetro es el evento y hay que frenar el envío
   *  nativo con preventDefault. */
  async function handleSubscribe(e) {
    e.preventDefault();

    // Sin consentimiento no se manda nada, y si ya se está guardando
    // no dejo que un doble click dispare dos escrituras.
    if (!consent || estado === "guardando") return;

    setEstado("guardando");

    try {
      const id = await subscribeToNewsletter(email);

      // Aviso por Telegram. Si falla, la suscripción sigue guardada.
      notifyNewSubscriber(id);

      setEstado("listo");
      // Vacío el formulario para que no quede el mail escrito si el
      // visitante quiere suscribir a otro.
      setEmail("");
      setConsent(false);
    } catch (err) {
      // El ID del documento es el email: si ya estaba en la lista,
      // Firestore lo rechaza y en realidad ya está suscrito.
      if (err?.code === "already-exists") {
        setEstado("repetido");
        setEmail("");
        setConsent(false);
        return;
      }

      console.error("No se pudo guardar la suscripción:", err);
      setEstado("error");
    }
  }

  return (
    <footer className="rotten-footer">
      <p className="mono tracked rotten-footer-kicker">Información del sitio</p>
      {/* Grilla de columnas: newsletter, contacto, general, legal y
          redes. Cada bloque es una <div> suelta y el CSS las acomoda. */}
      <div className="rotten-footer-grid">
        <div>
          <h4>Suscribite al newsletter</h4>
          {/* Una vez enviada la suscripción (o detectada como repetida)
              el formulario desaparece y queda el mensaje + la chance de
              suscribir otro correo. */}
          {estado === "listo" || estado === "repetido" ? (
            <>
              <p className="mono tracked" style={{ fontSize: 12 }}>
                {estado === "repetido" ? "Ese correo ya estaba en la lista" : "¡Listo, ya estás en la lista!"}
              </p>
              <p style={{ fontSize: 12.5, color: "var(--grey-1)" }}>
                Te avisamos por mail cuando hay un drop o una promoción.
              </p>
              <button
                onClick={() => setEstado("idle")}
                className="rotten-newsletter-again"
                style={{ marginTop: 10, background: "none", border: 0, color: "#fff", textDecoration: "underline", fontSize: 11, cursor: "pointer" }}
              >
                Suscribir otro correo
              </button>
            </>
          ) : (
            <form onSubmit={handleSubscribe} className="rotten-newsletter-form-wrap">
              {/* Campo + flechita de enviar. El botón es type="submit"
                  para que baste con apretar Enter, y queda deshabilitado
                  sin consentimiento o mientras se guarda. */}
              <div className="rotten-newsletter-form">
                <input
                  type="email"
                  required
                  placeholder="Correo electrónico"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={estado === "guardando"}
                />
                <button type="submit" aria-label="Suscribirse" disabled={estado === "guardando" || !consent}>
                  <ArrowRight size={18} />
                </button>
              </div>

              {/* Consentimiento explícito y separado: es lo que la
                  ley exige para mandar comunicaciones comerciales. */}
              <label className="rotten-privacy-check">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  disabled={estado === "guardando"}
                />
                Quiero recibir novedades, lanzamientos y promociones de SKUL
              </label>

              <p style={{ fontSize: 11.5, color: "var(--grey-1)", margin: "8px 0 0" }}>
                Al suscribirte declarás haber leído la{" "}
                <button onClick={() => nav("privacidad")} style={{ background: "none", border: 0, padding: 0, color: "#fff", textDecoration: "underline", cursor: "pointer", font: "inherit" }}>
                  Política de Privacidad
                </button>
                . Podés pedir la baja cuando quieras.
              </p>

              {/* Avisos de error y de "guardando" debajo del formulario. */}
              {estado === "guardando" && (
                <p className="mono tracked" style={{ fontSize: 11, margin: "8px 0 0" }}>Guardando…</p>
              )}
              {estado === "error" && (
                <p style={{ fontSize: 11.5, margin: "8px 0 0", color: "#ffb4a2" }}>
                  No pudimos guardarlo. Probá de nuevo o escribinos por WhatsApp.
                </p>
              )}
            </form>
          )}
        </div>

        <div>
          <h4>Contacto</h4>
          {/* Enlaces reales (<a>) porque son destinos externos: mail y
              WhatsApp. target="_blank" con rel="noopener noreferrer" por
              seguridad: noreferrer impide que el destino reciba la URL
              de la tienda. */}
          <ul className="rotten-footer-links">
            <li><a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></li>
            <li><a href={waLink} target="_blank" rel="noopener noreferrer">WhatsApp</a></li>
          </ul>
        </div>

        <div>
          <h4>General</h4>
          {/* Acá son <button> y no <a> porque cambian de pantalla dentro
              de la app (no recarga la página ni cambian la URL). */}
          <ul className="rotten-footer-links">
            <li><button onClick={() => goCatalog("all")}>Shop</button></li>
            <li><button onClick={() => nav("noreastock")}>No-Restock</button></li>
            <li><button onClick={() => nav("nosotros")}>Nosotros</button></li>
            <li><button onClick={() => nav("cambios")}>Cambios y devoluciones</button></li>
            <li><button onClick={() => nav("seguimiento")}>Seguimiento de pedido</button></li>
            <li><button onClick={() => nav("contacto")}>Centro de ayuda</button></li>
          </ul>
        </div>

<div>
  <h4>Legal</h4>

  {/* Políticas y textos legales. Todos van por nav() como el resto de
      las páginas internas; el botón "arrepentimiento" es el que exige
      la ley argentina de comercio electrónico (derecho de retraction
      dentro de los 10 días). */}

  <ul className="rotten-footer-links">
    <li>
      <button onClick={() => nav("terminos")}>
        Términos y condiciones
      </button>
    </li>

    <li>
      <button onClick={() => nav("privacidad")}>
        Política de privacidad
      </button>
    </li>

    <li>
      <button onClick={() => nav("cookies")}>
        Política de cookies
      </button>
    </li>

    <li>
      <button onClick={() => nav("envios")}>
        Política de envíos
      </button>
    </li>

    <li>
      <button onClick={() => nav("analitica")}>
        Consentimiento de analítica
      </button>
    </li>

    <li>
      <button onClick={() => nav("accesibilidad")}>
        Accesibilidad
      </button>
    </li>

    <li>
      <button onClick={() => nav("arrepentimiento")}>
        Botón de arrepentimiento
      </button>
    </li>

    <li>
      <button onClick={() => nav("informacion-legal")}>
        Contacto y reclamos
      </button>
    </li>
  </ul>
</div>

        <div>
          <h4>Socials</h4>
          {/* Enlaces externos otra vez (Instagram y WhatsApp). */}
          <ul className="rotten-footer-links">
            <li><a href={igLink} target="_blank" rel="noopener noreferrer">Instagram</a></li>
            <li><a href={waLink} target="_blank" rel="noopener noreferrer">WhatsApp</a></li>
          </ul>
        </div>
      </div>

      {/* Wordmark gigante de fondo del pie y, debajo, el copyright. El año
          sale de la fecha actual, así que no hay que actualizarlo a
          mano cada enero. */}
      <p className="rotten-footer-wordmark">SKUL</p>
      <div className="rotten-footer-bottom">{new Date().getFullYear()} © SKUL ™</div>
    </footer>
  );
}