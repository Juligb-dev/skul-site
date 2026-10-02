import React from "react";
import { MessageCircle, Instagram } from "lucide-react";
import { WHATSAPP_NUMBER, INSTAGRAM_HANDLE } from "../data/config.js";
import SkulWatermark from "../components/SkulWatermark.jsx";

/**
 * Pantalla de contacto ("Hablemos").
 *
 * Qué es: el formulario de consulta más los links directos a WhatsApp
 * e Instagram. El showroom es solo con cita previa, así que todo lo
 * que llega por acá termina siendo una coordinación de visita.
 *
 * Cuándo se muestra: cuando el estado `page` de StoreApp.jsx vale
 * "contacto" (la ruta /contacto), linkeada desde el footer.
 *
 * Props: el formulario NO es estado local de esta pantalla. Todo viene
 * de arriba y vuelve hacia arriba:
 *  - contactForm: { nombre, motivo }, los dos campos del formulario.
 *  - setContactForm: para escribir en ese objeto.
 *  - handleContactSubmit: el onSubmit del form. El que arma el mensaje
 *    y abre WhatsApp es StoreApp, no esta pantalla.
 *
 * Por qué el estado vive arriba y no acá: el mismo objeto se usa para
 * mandar la consulta a Telegram, y si el estado estuviera local, el
 * panel no lo vería.
 */
export default function Contacto({ contactForm, setContactForm, handleContactSubmit }) {
  // Los dos links se arman con las constantes de config.js, así que
  // cambiar el número o el usuario en un solo lugar los actualiza en
  // toda la tienda (también los textos legales y el footer).
  const waLink = `https://wa.me/${WHATSAPP_NUMBER}`;
  const igLink = `https://instagram.com/${INSTAGRAM_HANDLE}`;

  // "fx-host" es la clase que habilita las capas de efecto del sitio
  // como fondo fijo de la pantalla.
  return (
    <main className="fx-host" style={{ maxWidth: 900, margin: "0 auto", padding: "60px 20px 90px" }}>
      {/* Wordmark gigante de fondo, de adorno. */}
      <SkulWatermark />

      {/* Este <p> vacío está en el original: es el lugar del eyebrow que
          por ahora no lleva texto. */}
      <p className="mono tracked" style={{ fontSize: 12, marginBottom: 6, color: "var(--grey-3)" }}></p>
      <h1 className="display" style={{ fontSize: "clamp(30px,5vw,48px)", margin: "0 0 12px" }}>Hablemos</h1>
      <p style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 34, maxWidth: 520, color: "var(--grey-3)" }}>
        El showroom es SOLO con cita previa. Contanos qué necesitás y coordinamos día y horario.
      </p>

      {/* El formulario: controlado, con los dos campos que el negocio
          necesita para poder responder (quién sos y qué necesitás). */}
      <form onSubmit={handleContactSubmit} style={{ display: "grid", gap: 18, maxWidth: 480, marginBottom: 50 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span className="tracked" style={{ fontSize: 12, fontWeight: 700 }}>Nombre y apellido</span>
          <input required value={contactForm.nombre} onChange={(e) => setContactForm((f) => ({ ...f, nombre: e.target.value }))} style={inputStyle} placeholder="Tu nombre completo" />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span className="tracked" style={{ fontSize: 12, fontWeight: 700 }}>Motivo de tu consulta</span>
          <textarea required rows={5} value={contactForm.motivo} onChange={(e) => setContactForm((f) => ({ ...f, motivo: e.target.value }))} style={{ ...inputStyle, resize: "vertical" }} placeholder="Escribí acá tu consulta..." />
        </label>
        <button type="submit" className="btn-ghost tracked" style={{ justifySelf: "start" }}>Enviar consulta</button>

        {/* Aviso de que el submit no manda un mail: arma un link de
            WhatsApp con el mensaje ya escrito y lo abre en otra pestaña. */}
        <p style={{ fontSize: 12, color: "var(--grey-3)" }}>Se abrirá WhatsApp con tu mensaje precargado.</p>
      </form>

      {/* Los links sueltos, para quien solo quiere escribir directo. */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <a href={waLink} target="_blank" rel="noopener noreferrer" className="btn-ghost tracked" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <MessageCircle size={16} /> WhatsApp
        </a>
        <a href={igLink} target="_blank" rel="noopener noreferrer" className="btn-ghost tracked" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Instagram size={16} /> Instagram
        </a>
      </div>
    </main>
  );
}

// Estilo compartido por los dos campos, declarado una sola vez para que
// no se recreen el input y el textarea.
const inputStyle = { border: "1px solid var(--black)", background: "var(--white)", padding: "12px 14px", fontSize: 14 };