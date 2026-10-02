/**
 * useMediaQuery — un booleanito que le dice al componente si la pantalla
 * cumple una consulta de CSS.
 *
 * Qué es una media query: la misma cosa que usás en el CSS (`@media
 * (max-width: 768px)`), pero consultada desde JavaScript. Sirve cuando el
 * layout no se resuelve solo con CSS, por ejemplo para cargar una foto
 * distinta en celular y en compu.
 *
 * Por qué un hook y no leer `window.matchMedia` en el componente: porque el
 * valor cambia con el tiempo (girás el teléfono o cambiás el tamaño de la ventana) y
 * quien tiene que enterarse es React. Con un hook, el componente se vuelve a
 * pintar solo cuando el valor cambia, sin lógica de listeners en cada uno.
 *
 * Qué devuelve: `true` o `false`. Nada más, no hay estado de error.
 * OJO con el nombre de la función: no pregunta por un ancho, pregunta por la
 * query que le pases. El que la llama arma la query (y decide el breakpoint).
 * De qué colecciones depende: ninguna, es 100% navegador.
 * Quién lo consume: /src/pages/Home.jsx, para elegir la foto de portada.
 */
import { useState, useEffect } from "react";

/**
 * Devuelve true mientras la pantalla cumpla la media query dada.
 * Se usa para elegir la imagen de portada según sea celular o compu,
 * reaccionando si se gira el teléfono o se cambia el tamaño.
 */
export function useMediaQuery(query) {
  // El valor inicial se calcula apenas al montar, y con una función para que
  // React lo lea una sola vez por montar (y no en cada render). El chequeo de
  // typeof window es una red de seguridad: si este archivo llegara a
  // renderizarse en un servidor (o en un test sin DOM), matchMedia no existe
  // y prefiero `false` que romper.
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    // Salida temprana: sin matchMedia no hay nada que escuchar ni que
    // desuscribir, y el cleanup tiene que ser una función.
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    // onChange() sin argumentos: sincronizo una vez al entrar, porque el
    // listener solo dispara cuando la query CAMBIA. Si entre el estado
    // inicial y este efecto la ventana cambió de tamaño, esto lo corrige.
    onChange();
    // addEventListener es la API moderna; el addListener es la vieja, que
    // algunos navegadores viejos (y los viejos Safari de iOS) todavía
    // necesitan. Por eso el ternario.
    mq.addEventListener ? mq.addEventListener("change", onChange) : mq.addListener(onChange);
    // Cleanup: saco el listener para no dejar el componente suscripto a un
    // evento que ya no le importa (y para no acumular si se monta y desmonta
    // muchas veces en la misma sesión).
    return () => {
      mq.removeEventListener ? mq.removeEventListener("change", onChange) : mq.removeListener(onChange);
    };
    // [query] es la dependencia: si el componente pasa otra query, React
    // desuscribe de la vieja y se suscribe a la nueva. Si faltara esto,
    // quedaría escuchando la query anterior para siempre.
  }, [query]);

  return matches;
}

export default useMediaQuery;