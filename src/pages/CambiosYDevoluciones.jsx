import React from "react";
import { CambiosYDevolucionesLegal } from "./Legal.jsx";

/* La política de cambios y devoluciones vive en Legal.jsx (junto con el
   resto de los textos legales, para que todos se mantengan juntos y
   despidan el mismo formato). Esta página existe para conservar la URL
   /cambios-y-devoluciones, que es la que ya está linkeada en el footer
   y compartida por los clientes. */

/**
 * Aclaración de por qué esta pantalla es tan finísima:
 *
 * NO tiene ni una línea propia. Es un wrapper (envoltorio) que sólo
 * reexporta el componente legal CambiosYDevolucionesLegal de
 * src/pages/Legal.jsx.
 *
 * Existe por dos motivos, y los dos importan:
 *  1. La ruta. El footer y los clientes ya tienen guardado el link
 *     /cambios-y-devoluciones. Con esta pantalla finita, el caso "page
 *     = 'cambios'" de StoreApp.jsx sigue montando algo y esa URL nunca
 *     se rompe, aunque el texto legal se mueva o cambie de archivo.
 *  2. El nombre legible. En el menú esta entrada se llama "Cambios y
 *     devoluciones" y está en la columna Ayuda, no en la columna Legal.
 *     Tener el archivo con ese nombre hace que el import de StoreApp y
 *     el caso del switch se lean igual que la etiqueta del menú.
 *
 * Ojo con esto si someday la cambian: el texto real, al que hay que
 * editar para tocar la política, está en Legal.jsx. Acá no hay nada que
 * cambiar salvo el nombre.
 *
 * Props: ninguna. StoreApp la monta así: <CambiosYDevoluciones />
 */
export default function CambiosYDevoluciones() {
  // Y nada más: el componente legal ya se encarga del layout, del
  // título, de la fecha de vigencia y de todos los artículos.
  return <CambiosYDevolucionesLegal />;
}