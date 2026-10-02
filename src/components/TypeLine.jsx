import React, { useEffect, useState } from "react";

/* tipea un texto letra por letra, con cursor parpadeante */
/**
 * Efecto de máquina de escribir. Lo usa No-Restock para el texto del
 * drop.
 *
 * Props:
 *  - text: el texto completo a tipear.
 *  - speed: milisegundos entre letra y letra (default 34).
 *  - className / style: los aplico al <span> contenedor, así el que
 *    lo usa decide la tipografía sin que yo imponga nada.
 *
 * No uso CSS para esto a propósito: una animación de "typing" con
 * steps() tiene que conocer de antemano cuántos caracteres tiene el
 * texto, y acá el texto puede cambiar en cualquier momento.
 */
export default function TypeLine({ text, speed = 34, className = "", style = {} }) {
  // El pedazo de texto ya "escrito". Vacío al principio.
  const [shown, setShown] = useState("");

  useEffect(() => {
    setShown("");
    let i = 0;
    // Cada tick agrega un carácter: slice(0, i) toma los primeros i.
    const id = setInterval(() => {
      i++;
      setShown(text.slice(0, i));
      // Ya se escribió todo: paro el interval (dentro del propio
      // callback, así no queda un timer vivo hasta el próximo cambio).
      if (i >= text.length) clearInterval(id);
    }, speed);
    // El cleanup corre si el texto o la velocidad cambian antes de
    // terminar, y en ese caso arranco de cero con el texto nuevo.
    return () => clearInterval(id);
  }, [text, speed]);

  return (
    <span className={className} style={style}>
      {/* El "_" final es el cursor: el CSS lo hace parpadear. */}
      {shown}
      <span className="type-cursor">_</span>
    </span>
  );
}