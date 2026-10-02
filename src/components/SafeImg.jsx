import React, { useState, useEffect } from "react";

/**
 * <img> que nunca muestra el ícono de "imagen rota" del navegador.
 * Si `src` no carga (URL vieja, caída, borrada de Cloudinary, etc.)
 * cae automáticamente a `fallback`. Si `fallback` también falla,
 * se oculta por completo en vez de mostrar el ícono roto.
 *
 * Props:
 *  - src: la foto principal.
 *  - fallback: la foto de repuesto (un SVG del repo, por ejemplo).
 *  - alt: texto alternativo (vacío por defecto porque casi todas son
 *    decorativas).
 *  - ...rest: cualquier otra prop (className, loading, style...) se
 *    pasa tal cual al <img>.
 */
export default function SafeImg({ src, fallback, alt = "", ...rest }) {
  // current es la URL que se está mostrando ahora. Puede ser la de
  // src o, si falló, la del fallback: el <img> siempre dibuja esta.
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

  return (
    // onError salta cuando el navegador no puede cargar la URL. El
    // trick está en el `current !== fallback`: así, si ya estoy
    // mostrando el fallback y tampoco carga, entro al else y me oculto,
    // en vez de poner el fallback una y otra vez.
    <img
      src={current}
      alt={alt}
      onError={() => {
        if (fallback && current !== fallback) setCurrent(fallback);
        else setHidden(true);
      }}
      {...rest}
    />
  );
}
