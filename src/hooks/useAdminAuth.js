import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "../firebase.js";

/**
 * useAdminAuth — quién está logueado en /admin.
 *
 * Qué es: Firebase Authentication es el servicio de login de Google (mail +
 * contraseña). Él guarda la sesión en el navegador y la mantiene viva entre
 * visitas. Yo no manejo ni guardo contraseñas en ningún lado: lo único que
 * me llega es el usuario ya logueado.
 *
 * Qué problema resuelve: /admin tiene que decidir entre mostrar el login o el
 * panel, y además el sitio entero (SiteGate) necesita saber si el visitante
 * es el admin para dejarlo ver la tienda aunque esté cerrada. Esa pregunta se
 * responde en un solo lugar en vez de repetir la lógica en tres pantallas.
 *
 * Qué devuelve:
 *   - user: el usuario de Firebase con null si no hay sesión, o `undefined`
 *     si todavía no sabemos (estamos consultando). Ese `undefined` a propósito
 *     es lo que le permite a AdminApp pintar "Cargando…" en vez de mostrar un
 *     destello del login en cada recarga.
 *   - isAdmin: true SOLO si ese usuario es el uid de abajo, que es el mismo
 *     uid que está escrito en firestore.rules. Ojo: esto NO es una validación
 *     de seguridad, es una comparación de texto que el navegador puede ver y
 *     falsear; lo que frena de verdad a los demás son las reglas de Firestore,
 *     que rechazan toda escritura que no venga de ese mismo uid.
 *   - login(mail, contraseña): devuelve una promesa; el que la llama (AdminLogin)
 *     la espera con try/catch y muestra el error si el mail o la contraseña
 *     están mal.
 *   - logout(): cierra sesión. Como onAuthStateChanged está escuchando, al
 *     cambiar el estado React vuelve a pintar el login solo, sin recargar.
 *
 * De qué colecciones depende: ninguna. No toca Firestore: solo habla con
 * Authentication. Quien consume esto: /admin/AdminApp.jsx, /admin/AdminLogin.jsx
 * y /admin/SiteGate.jsx.
 */
export function useAdminAuth() {
  // Tres estados posibles, no dos: undefined = todavía no sé, null = no hay
  // sesión. Arranca en undefined a propósito para no confundir "todavía no
  // consulté" con "el visitante no está logueado".
  const [user, setUser] = useState(undefined); // undefined = cargando, null = sin sesión

  useEffect(() => {
    // onAuthStateChanged se queda escuchando: dispara una vez con el estado
    // actual y otra vez cada vez que cambia (login, logout, o cuando Firebase
    // refresca el token solo). Me devuelve una función para desuscribirme; si
    // no la llamo al desmontar, el listener queda vivo intentando pintar un
    // componente que ya no existe.
    const unsub = onAuthStateChanged(auth, setUser);
    return () => unsub();
  }, []);

  // login y logout no son async/await: devuelven la promesa de Firebase tal
  // cual, para que la maneje el componente que las llama (y muestre el error
  // sin que este hook tenga que saber de UI).
  const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
  const logout = () => signOut(auth);

  // uid (identificador único e inmutable de un usuario de Firebase) hardcodeado:
  // tiene que coincidir con el isAdmin() de firestore.rules. Si algún día se
  // cambia uno, hay que cambiar el otro.
  return { user, isAdmin: user?.uid === "Ii35YTENxZePLzloJkaC99AL5rn1", login, logout };
}