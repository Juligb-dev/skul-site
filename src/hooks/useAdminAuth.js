import { useEffect, useState } from "react";
import { getFirebaseAuth } from "../firebaseAuth.js";

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
 * y /admin/SiteGate.jsx (este último solo cuando la tienda está cerrada).
 *
 * OJO con el peso: el SDK de Firebase Auth se pide con `getFirebaseAuth()` en
 * vez de importarse arriba. Así este hook no arrastra `firebase/auth` al bundle
 * principal y el visitante que solo mira la tienda abierta nunca lo descarga.
 */
export function useAdminAuth() {
  // Tres estados posibles, no dos: undefined = todavía no sé, null = no hay
  // sesión. Arranca en undefined a propósito para no mostrar un destello del
  // login en cada recarga mientras Firebase responde.
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    let vivo = true;
    let desuscribir = null;

    // getFirebaseAuth() resuelve cuando el módulo de Auth ya se descargó (la
    // primera vez) y devuelve la instancia además de las funciones. Una vez
    // resuelta, onAuthStateChanged avisa el estado actual y cada cambio.
    getFirebaseAuth().then(({ modulo, auth }) => {
      if (!vivo) return;
      desuscribir = modulo.onAuthStateChanged(auth, (usuario) => {
        if (vivo) setUser(usuario);
      });
    }).catch(() => {
      // Si el chunk de Auth no se pudo descargar (red cortada), no dejamos la
      // pantalla colgada en "Cargando…": tratamos al visitante como "sin
      // sesión". El login que llama después volverá a pedir el módulo y ahí
      // sí mostrará el error real.
      if (vivo) setUser(null);
    });

    return () => {
      vivo = false;
      if (desuscribir) desuscribir();
    };
  }, []);

  // login/logout devuelven una promesa, igual que antes, pero esperan primero
  // a que el módulo de Auth esté cargado. El que llama (AdminLogin) hace
  // await con try/catch y muestra el error si el mail o la contraseña fallan.
  const login = (email, password) =>
    getFirebaseAuth().then(({ modulo, auth }) => modulo.signInWithEmailAndPassword(auth, email, password));
  const logout = () => getFirebaseAuth().then(({ modulo, auth }) => modulo.signOut(auth));

  // uid (identificador único e inmutable de un usuario de Firebase) hardcodeado:
  // tiene que coincidir con el isAdmin() de firestore.rules. Si algún día se
  // cambia uno, hay que cambiar el otro.
  return { user, isAdmin: user?.uid === "Ii35YTENxZePLzloJkaC99AL5rn1", login, logout };
}