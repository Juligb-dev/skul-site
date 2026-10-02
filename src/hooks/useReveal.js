/**
 * useReveal — el bloque que aparece cuando lo estás por ver.
 *
 * Qué es: la animación "fade up" del sitio. El elemento arranca invisible y
 * corrido 24px hacia abajo, y cuando entra en pantalla se muestra. Es el
 * hook que hace que las secciones del home se digan aparecidas a
 * medida que scrolleás, en vez de todas de golpe.
 *
 * Por qué un hook: porque la lógica (mirar un elemento y decir "ya apareció")
 * no tiene nada que ver con el diseño y se usa en decenas de bloques. El
 * componente Reveal.jsx lo usa y solo se ocupa del HTML y de las clases CSS.
 *
 * Qué devuelve: un array con dos cosas — `ref` y `shown`:
 *  - ref: el ref que hay que poner en el elemento a observar. Ref = la
 *    referencia al nodo real del DOM que React te deja leer.
 *  - shown: true en el instante en que el elemento ya se vio. Sirve para
 *    poner la clase CSS que termina la animación.
 *
 * De qué colecciones depende: ninguna. Es 100% navegador.
 * Quién lo consume: /src/components/Reveal.jsx.
 */
import { useEffect, useRef, useState } from "react";

export function useReveal() {
  const ref = useRef(null);
  // Arranca en false: el elemento está oculto hasta que se lo ve. El CSS es
  // el que pone opacity: 0 y el corrimiento (clase .reveal), y `.reveal-shown`
  // lo devuelve a su lugar.
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    // Si no hay elemento (el componente todavía no se montó), no hay nada que
    // observar. OJO: en ese caso no queda otro intento pendiente; con el
    // montaje normal de React el ref ya está puesto cuando corren los
    // efectos, así que no pasa.
    if (!el) return;

    // IntersectionObserver es la API del navegador que avisa cuando un
    // elemento entra o sale de la pantalla. Sirve para esto porque el scroll
    // dispara eventos a una frecuencia altísima y con esta API el navegador
    // hace el trabajo internamente, sin saturar el hilo de JavaScript.
    const obs = new IntersectionObserver(
      // Cada vez que algo cambia, nos pasa un array de entradas (una por
      // elemento observado) y destructuramos la primera, que es el único que
      // estamos mirando.
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          // Ya apareció: me desuscribo (disconnect corta la observación).
          // Sin esto, el callback seguiría despertando en cada scroll por
          // todo el resto de la vida de la página para hacer un setState con
          // el mismo valor.
          obs.disconnect();
        }
      },
      // threshold: 0.15 = avisame cuando el 15% del elemento ya se ve. Con
      // 0 saltaría apenas asomara un píxel y la animación arrancaría antes de
      // que se pueda ver nada.
      { threshold: 0.15 }
    );
    obs.observe(el);
    // Cleanup: si el componente se desmonta sin haber aparecido, el observer
    // queda observing un nodo que ya no está en el DOM.
    return () => obs.disconnect();
  }, []);

  // El array es porque son dos valores relacionados y tiene sentido leerlos
  // juntos como en Reveal.jsx: const [ref, shown] = useReveal().
  return [ref, shown];
}