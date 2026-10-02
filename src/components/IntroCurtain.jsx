import React, { useEffect, useState } from "react";

/* ============================================================
   INTRO CURTAIN — cortina de entrada al sitio (v2, "puertas")
   ============================================================ */

// Llave en sessionStorage (no localStorage): sessionStorage se borra al
// cerrar la pestaña, así la cortina se ve una vez por visita y no una
// vez por sesión de navegador.
const SESSION_KEY = "skul_intro_seen";
// Los tres tiempos de la animación, en ms:
//  - HOLD_MS: cuánto tiempo queda la cortina cerrada.
//  - GLITCH_MS: el logo titila durante los últimos GLITCH_MS del hold.
//  - SLIDE_MS: cuánto tarda la apertura de las dos puertas.
const HOLD_MS = 1100;
const GLITCH_MS = 350;
const SLIDE_MS = 750;

/**
 * Cortina de entrada: dos paneles (como dos puertas) que cubren toda la
 * pantalla, el logo SKUL en el medio y después se abren para mostrar el
 * sitio. Sólo se ve una vez por visita (sessionStorage) y nunca si el
 * visitante pidió menos movimiento en el sistema.
 *
 * No recibe props: es puro adorno, se monta una vez desde StoreApp.
 *
 * Máquina de estados (phase):
 *   null -> in -> glitch -> out -> done
 * Escribo un solo estado en vez de varias booleanas porque las fases
 * se excluyen entre sí: nunca estoy "abriendo" y "titilando" a la vez.
 */
export default function IntroCurtain() {
  // phase arranca en null (aún no se decidió nada) para poder distinguir
  // "todavía no falló el efecto" de "ya la vi y me la salteó".
  const [phase, setPhase] = useState(null);

  useEffect(() => {
    // Si el visitante pidió reducir el movimiento en el sistema, o ya
    // vio la cortina en esta visita, no la mostramos: directo a "done"
    // y el componente devuelve null.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let alreadySeen = false;

    // sessionStorage puede tirar (modo privado de algunos navegadores,
    // cookies bloqueadas). Por eso va en try/catch: si falla, asumo que
    // no la vio antes y la muestro igual, en vez de romper la página.
    try {
      alreadySeen = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch (e) {
      console.warn("sessionStorage no disponible:", e);
    }

    if (reduced || alreadySeen) {
      setPhase("done");
      return;
    }

    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch (e) {
      console.warn("No se pudo guardar en sessionStorage:", e);
    }

    setPhase("in");

    // Los tres timers escalonados de la animación. Si HOLD_MS fuera
    // menor que GLITCH_MS daría un delay negativo (que el navegador
    // trata como 0), así que el glitch arranca antes de abrir.
    const toGlitch = setTimeout(() => setPhase("glitch"), HOLD_MS - GLITCH_MS);
    const toOut = setTimeout(() => setPhase("out"), HOLD_MS);
    const unmount = setTimeout(() => setPhase("done"), HOLD_MS + SLIDE_MS);
    // Si el componente se desmonta antes de que terminen (o el visitante
    // navega), limpio los tres timers para que no intenten cambiar el
    // estado de un componente que ya no está.
    return () => { clearTimeout(toGlitch); clearTimeout(toOut); clearTimeout(unmount); };
  }, []);

  // "done" (y el primer null) significan "no hay nada que pintar": así
  // la cortina desaparece de verdad del DOM en vez de quedar invisible
  // tapando la página.
  if (!phase || phase === "done") return null;
  const out = phase === "out";

  // A partir de acá va el JSX de la cortina.
  return (
    <div className={`intro-curtain ${out ? "intro-out" : ""}`} aria-hidden="true">
      {/* Las dos mitades de la puerta. La clase intro-out las corre
          hacia arriba y abajo y las deja fuera de pantalla. */}
      <div className="intro-panel intro-panel-top" />
      <div className="intro-panel intro-panel-bottom" />

      {/* El logo, su subtítulo y la barrita de carga. El progreso se
          se anima con CSS y le paso la duración por inline para que esté
          sincronizado con HOLD_MS (el único valor que importa). */}
      <div className="intro-center">
        <span className={`display intro-wordmark ${phase === "glitch" ? "intro-glitch" : ""}`}>SKUL</span>
        <span className="mono tracked intro-subtitle" style={{ fontSize: 10.5 }}>STREETWEAR</span>
        <div className="intro-progress"><span style={{ animationDuration: `${HOLD_MS - 230}ms` }} /></div>
      </div>

      {/* La cinta "- - - -" del borde: dos copias porque el marquee
          es infinito y una sola dejaría ver el empalme. */}
      <div className="intro-curtain-marquee mono tracked-lg">
        {Array(2)
          .fill("-------------------------------------------------------------------------------------------------- — ")
          .map((t, i) => (
            <span key={i}>{t}</span>
          ))}
      </div>
    </div>
  );
}