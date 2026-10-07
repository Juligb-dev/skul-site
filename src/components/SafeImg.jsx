import React, { useState, useEffect } from "react";
import { esVideoUrl } from "../utils/cloudinary.js";

/**
 * <img> (o <video>) que nunca muestra el ícono de "imagen rota" del navegador.
 * Si `src` no carga (URL vieja, caída, borrada de Cloudinary, etc.)
 * cae automáticamente a `fallback`. Si `fallback` también falla,
 * se oculta por completo en vez de mostrar el ícono roto.
 *
 * Si `src` es un VIDEO de Cloudinary, dibuja un <video> en vez de un
 * <img>: autoplay silenciado en loop, con las mismas clases y estilos
 * que tendría la foto (el CSS de cada sección aplica igual, porque
 * casi todos los selectores son por clase). Así cualquier sección que
 * ya usaba SafeImg (hero del Home, looks, categorías del menú…) acepta
 * video sin tocar su código: solo cambia lo que se sube desde /admin.
 *
 * Props:
 *  - src: la foto (o video) principal.
 *  - fallback: la foto de repuesto (un SVG del repo, por ejemplo). Si el
 *    video falla, se muestra esta como <img>.
 *  - alt: texto alternativo (vacío por defecto porque casi todas son
 *    decorativas).
 *  - ...rest: cualquier otra prop (className, loading, style...) se
 *    pasa tal cual al <img> o al <video>.
 */
export default function SafeImg({ src, fallback, alt = "", ...rest }) {
  // current es la URL que se está mostrando ahora. Puede ser la de
  // src o, si falló, la del fallback: el elemento siempre dibuja esta.
  const [current, setCurrent] = useState(src || fallback);
  // hidden es el último recurso: ni src ni fallback cargaron, así que
  // el elemento desaparece en vez de dejar un ícono roto.
  const [hidden, setHidden] = useState(false);

  // Si el padre cambia la foto (por ejemplo, la categoría activa del
  // menú), hay que volver a intentar con la nueva y despertar el
  // elemento si estaba oculto. Sin esto seguiría mostrando el
  // fallback viejo para siempre.
  useEffect(() => {
    setCurrent(src || fallback);
    setHidden(false);
  }, [src, fallback]);

  // Si no quedó ninguna URL que funcione, no renderizo nada.
  if (hidden) return null;

  // Mismo onError para los dos tipos: si falla, probamos con el
  // fallback; si el fallback también falla, nos ocultamos. El
  // `current !== fallback` evita quedarse en un loop reintentando
  // la misma URL rota.
  const onError = () => {
    if (fallback && current !== fallback) setCurrent(fallback);
    else setHidden(true);
  };

  // ¿Es video? Entonces <video> con las mismas clases/estilos que
  // tendría la foto. muted + playsInline son obligatorios para que los
  // navegadores (sobre todo iOS) permitan el autoplay.
  if (esVideoUrl(current)) {
    return (
      <video
        src={current}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        onError={onError}
        {...rest}
      />
    );
  }

  return (
    <img
      src={current}
      alt={alt}
      onError={onError}
      {...rest}
    />
  );
}
