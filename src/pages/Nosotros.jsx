import React from "react";
import SkulWatermark from "../components/SkulWatermark.jsx";

/**
 * Pantalla "Quiénes somos" (nosotros).
 *
 * Qué es: la presentación de la marca. Es de las páginas más simples
 * del sitio: texto y nada más, sin productos ni estado.
 *
 * Cuándo se muestra: cuando el estado `page` de StoreApp.jsx vale
 * "nosotros" (la ruta /nosotros). El link está en el footer.
 *
 * Props: ninguna. La tienda le pasa cero props.
 *
 * Un detalle de copy: los párrafos están escritos en minúsculas
 * ("nació", "elegimos", "tenemos") y con la indentación corrida del
 * original. Es el tono del texto, no un error: lo dejé igual.
 */
export default function Nosotros() {
  // "fx-host" es la clase que habilita las capas de efecto del sitio
  // como fondo fijo de la pantalla.
  return (
    <main className="fx-host" style={{ maxWidth: 800, margin: "0 auto", padding: "60px 20px 90px" }}>
      {/* Wordmark gigante de fondo, de adorno, para que la página no
          quede tan vacía. */}
      <SkulWatermark />

      {/* Este <p> vacío está en el original: es el lugar del eyebrow
          ("/ SOBRE NOSOTROS") que por ahora no lleva texto. Lo mantengo
          porque el ritmo de arriba del título depende de él. */}
      <p className="mono tracked" style={{ fontSize: 12, marginBottom: 6, color: "var(--grey-3)" }}></p>
      <h1 className="display" style={{ fontSize: "clamp(30px,5vw,48px)", margin: "0 0 26px" }}>Quiénes somos</h1>

      {/* --- los tres párrafos de la marca ---
          1. De dónde viene el proyecto (local en Los Toldos).
          2. Cómo se elige el producto, y el puntero a la sección
             No-Restock como fuente de prendas difíciles.
          3. El showroom con cita previa: el otro canal de contacto. */}
      <p style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 18 }}>
       SKUL nació en Los Toldos como un local
        de ropa más, y ahora se reinventa: mismo lugar, otra mirada, otra forma.
        trayendo esas prendas que no conseguís sin viajar a Buenos Aires y 
        algunas que quizá ni siquiera encontrás
      </p>
      <p style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 18 }}>
        Elegimos cada prenda pensando en vos y en tu
        uso diario, no en la vidriera: cortes cómodos, telas que aguantan y
        diseños que no vas a ver en cualquier lado, gracias a nuestra sección
        No-Restock.
      </p>
      <p style={{ fontSize: 15, lineHeight: 1.7 }}>
        tenemos showroom con cita previa para poder
        dedicarle tiempo a cada persona que viene a probarse algo, así que
        cualquier consulta, escribinos.
      </p>
    </main>
  );
}