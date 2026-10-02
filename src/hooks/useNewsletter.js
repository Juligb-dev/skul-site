/**
 * NEWSLETTER — colección /newsletter.
 *
 * Qué es: la lista de correos que escriben en el pie de página. Cada
 * suscripción es un documento mínimo: el email, el consentimiento, de qué
 * parte del sitio vino y la fecha. Nada más, a propósito.
 *
 * Qué problema resuelve: que el visitante se suscriba sin cuenta ni login,
 * que no se pueda repetir el mismo correo, y que la colección no sirva de
 * casillero para guardar cualquier otra cosa. Eso último no lo logramos acá
 * sino con las reglas: isValidNewSubscriber acepta el documento SOLO si tiene
 * exactamente esos cuatro campos y el email tiene forma de email.
 *
 * Dónde está lo lindo: como las reglas dejan "create" abierto pero "update"
 * cerrado, un getDoc previo (que el visitante no tiene permitido) sería
 * rechazado. Entonces la forma de saber si el correo ya estaba es intentar
 * escribir y mirar el código de error. Abajo lo explico.
 *
 * De qué colecciones depende: /newsletter.
 * Quién lo consume: /src/components/Footer.jsx (subscribeToNewsletter) y
 * /admin/AdminPanel.jsx (useSubscribers, deleteSubscriber).
 */

import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase.js";

const NEWSLETTER_COL = collection(db, "newsletter");

/**
 * Guarda una suscripción al newsletter.
 *
 * Lo que se guarda es lo mínimo: el email, que el usuario marcó
 * expresamente que quiere recibir novedades, de qué parte del
 * sitio se suscribió y la fecha. Nada más.
 *
 * El ID del documento ES el email normalizado. Con eso:
 *   - nadie puede crear dos veces el mismo correo,
 *   - y las reglas de Firestore (isValidNewSubscriber) siguen
 *     rechazando el documento si le sobra cualquier campo o si el
 *     email no tiene forma de email.
 *
 * Si el correo ya estaba, el pie de página lo muestra como "ya estabas
 * en la lista". No se vuelve a guardar ni se pisa la fecha original.
 */
export async function subscribeToNewsletter(email) {
  // Normalizo el correo: sin espacios y en minúsculas, para que
  // " Ana@Ejemplo.COM " y "ana@ejemplo.com" sean el mismo documento y el
  // mismo suscriptor (con las mayúsculas sueltas, se duplicarían).
  const limpio = String(email || "").trim().toLowerCase();

  // No se consulta antes si el documento ya existe: las reglas dejan
  // leer la colección solo al admin y al Worker, así que ese getDoc
  // sería rechazado. En su lugar escribimos con el ID fijo (el email):
  // si el documento no existe, Firestore lo trata como "create" y las
  // reglas lo permiten; si ya existe, lo trata como "update" y las
  // reglas lo rechazan, porque modificar suscripciones es tarea del
  // admin. Por eso un "permission-denied" acá significa, en la
  // práctica, "ese correo ya está en la lista".
  //
  // O sea que el error de permisos lo uso como señal de negocio: las reglas
  // de Firestore no distinguen "ya existe" de "no tenés permiso", pero para
  // este caso puntual las dos cosas significan lo mismo y el visitante solo
  // necesita el mensaje.
  try {
    await setDoc(doc(db, "newsletter", limpio), {
      email: limpio,
      consent: true, // dejó el tild marcado: sin esto, las reglas rechazan
      source: "footer", // de qué parte del sitio vino (las reglas lo acotan a 40 caracteres)
      createdAt: serverTimestamp(), // hora del servidor, para ordenar la lista después
    });
  } catch (err) {
    if (err?.code === "permission-denied") {
      console.info("Suscripción omitida: el correo ya estaba en la lista.");
      // Armo un error propio con un código ("already-exists") para que el
      // pie de página pueda distinguirlo del error genérico y escribir "ya
      // estabas en la lista" en lugar de "no pudimos guardarlo".
      const yaEsta = new Error("Ya estabas en la lista");
      yaEsta.code = "already-exists";
      throw yaEsta;
    }
    // Cualquier otro error (red caída, cuota, id inválido) se relanza tal
    // cual: acá no lo puedo arreglar, y el que llama decide qué mostrar.
    throw err;
  }

  // Devuelvo el email limpio, para que el pie de página lo muestre sin
  // volver a transformarlo.
  return limpio;
}

/**
 * Suscripciones del newsletter, de la más nueva a la más vieja.
 *
 * Solo se usa desde /admin: las reglas no dejan que un visitante
 * lea la lista.
 */
export function useSubscribers() {
  // null = todavía no cargué la lista; [] = cargué y no hay nadie. El panel
  // usa esa diferencia para no mostrar "0 suscriptores" mientras espera.
  const [subscribers, setSubscribers] = useState(null);

  useEffect(() => {
    // query + orderBy: el "de la más nueva a la más vieja" lo hace Firestore,
    // no el JS. Ordena por un campo de servidor (serverTimestamp), así que
    // el orden es parejo aunque dos personas se suscriban en el mismo
    // segundo. Un solo campo ordena con índice automático, no hace falta
    // índice compuesto.
    const q = query(NEWSLETTER_COL, orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        setSubscribers(
          snap.docs.map((d) => ({
            id: d.id, // el id del documento es el email normalizado
            ...d.data(),
          }))
        );
      },
      (err) => {
        console.error("No se pudieron cargar las suscripciones:", err);
        setSubscribers([]); // tabla vacía en vez de un spinner eterno
      }
    );

    return () => unsub(); // desuscribo al desmontar
  }, []);

  return { subscribers };
}

/**
 * Da de baja una suscripción (la borra de la lista).
 * Es lo que se usa cuando alguien pide dejar de recibir novedades.
 */
export async function deleteSubscriber(id) {
  // Borrado duro: no queda rastro del correo. Las reglas solo dejan borrar
  // al admin, así que esto no se puede pedir desde el sitio: si alguien
  // quiere darse de baja, se lo hace a mano desde el panel.
  await deleteDoc(doc(db, "newsletter", id));
}