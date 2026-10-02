/**
 * ESTADO DEL SITIO — documento /settings/site (un solo documento, no una
 * colección).
 *
 * Qué es: todo lo que el admin puede cambiar de la tienda sin tocar código:
 * abierto/cerrado, mensaje de cierre, cinta de anuncios, mostrar Outlet,
 * countdown del drop, foto del hero, fotos de Shop the Look. Todo vive en UN
 * documento con ID fijo ("site"), no en una colección, porque es una sola
 * cosa con una sola versión.
 *
 * Qué problema resuelve: que "cerrar la tienda" funcione para todo el mundo y
 * no solo en la computadora del admin. El estado se lee desde Firestore, así
 * que si el admin aprieta "Cerrar la web", a los dos segundos todos los
 * visitantes (de cualquier lado del país) ven la pantalla de cierre, sin
 * recargar y sin esperar un deploy.
 *
 * De qué colecciones depende: /settings/site.
 * Quién lo consume: /src/StoreApp.jsx y /admin/SiteGate.jsx (useSiteStatus)
 * y /admin/AdminPanel.jsx (useSiteStatus, setSiteStatus).
 */

import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebase.js";

// Referencia al documento único de configuración. El mismo objeto se usa para
// leer y para escribir: no hay una colección de "settings".
const SITE_DOC = doc(db, "settings", "site");

// Valores por defecto: son los que se usan si el documento todavía no existe
// o si le falta algún campo.
// OJO con el merge de abajo ({ ...DEFAULT_STATUS, ...snap.data() }): los datos
// de Firestore pisan a los defaults, así que un campo vacío guardado en la
// base (por ejemplo heroImage: "") gana y no se llena con el default. Por eso
// los textos de ejemplo están vacíos y no como contenido de verdad: un valor
// por defecto con contenido taparía el "vacío" que el admin dejó a propósito.
// El orden inverso (defaults por encima) haría imposible borrar un texto desde
// el panel.
const DEFAULT_STATUS = {
  open: true,
  message: "Ya volvemos.",
  announcement: "", // cinta de anuncios de arriba de todo (editable desde /admin)
  outletEnabled: false,
  dropEnabled: false,
  dropName: "",
  dropDate: "", // formato datetime-local, ej: "2026-08-10T20:00"
  heroImage: "", // URL de Cloudinary. Si está vacío, el Home muestra la animación de siempre.
  lookbookPhotos: [], // URLs de Cloudinary para la sección "Así se usa" del Home.
};

/**
 * Se suscribe en vivo al documento settings/site de Firestore.
 * Si todavía no existe (primera vez), asume tienda abierta.
 *
 * onSnapshot sobre un documento: cada vez que el admin guarda algo en la
 * pestaña "Estado del sitio", el sitio entero se entera solo. Eso es lo que
 * hace que cerrar la tienda tome efecto en las pantallas ya abiertas.
 *
 * Devuelve:
 *  - status: el objeto con los ajustes, ya mergeado con los defaults, o null
 *    mientras todavía no llegó la respuesta. Ese null lo usa SiteGate para
 *    pintar "Cargando…" en lugar de dejar ver la tienda a medio cargar (o de
 *    taparla de más con la pantalla de cerrado).
 *  - error: el error crudo de Firestore, por si hay que mostrarlo o loguearlo.
 */
export function useSiteStatus() {
  const [status, setStatus] = useState(null); // null = cargando
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(
      SITE_DOC,
      (snap) => {
        // snap.exists() false = todavía no se guardó nada. En ese caso tiro
        // los defaults (tienda abierta). Con el merge, un documento con la
        // mitad de los campos funciona igual: los que faltan salen del
        // default.
        setStatus(snap.exists() ? { ...DEFAULT_STATUS, ...snap.data() } : DEFAULT_STATUS);
      },
      (err) => {
        console.error(err);
        setError(err);
        // Si Firebase no está configurado todavía, no bloqueamos el sitio.
        // Esta decisión es la importante: prefiero mostrar la tienda abierta
        // (aunque sea sin los ajustes del admin) que dejar a todos los
        // visitantes mirando una pantalla de "cerrada" por un error de red.
        setStatus(DEFAULT_STATUS);
      }
    );
    return () => unsub();
  }, []);

  return { status, error };
}

/**
 * Guarda un parche de ajustes (un "patch" es un objeto con solo los campos
 * que cambian). Desde /admin, pestaña "Estado del sitio".
 *
 * Importante que venga con nombre patch: setDoc con merge: true pisa SOLO los
 * campos enviados y deja el resto como estaban. Si el admin cambia una sola
 * cosa, no se pisa el hero ni la cinta de anuncios.
 *
 * Lo escribe el navegador con la sesión del admin, y las reglas dejan
 * /settings/site en `allow write: if isAdmin()`: ningún visitante puede
 * escribir acá, aunque entre por la consola del navegador.
 *
 * Ojo lo que NO hace: no valida nada. Si el panel manda un heroImage que no
 * es una URL, o un dropDate con cualquier cosa, se guarda tal cual y lo que
 * se rompe es la foto del home o el countdown. La única validación real son
 * las reglas de permisos, no de contenido.
 */
export async function setSiteStatus(patch) {
  await setDoc(SITE_DOC, patch, { merge: true });
}