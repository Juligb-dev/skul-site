import React from "react";
import { useAdminAuth } from "../hooks/useAdminAuth.js";
import AdminLogin from "./AdminLogin.jsx";
import AdminPanel from "./AdminPanel.jsx";

/**
 * ADMINAPP — el portero de /admin: decide si se dibuja el login o el panel.
 *
 * Qué es: toda la rama "panel" del sitio, en un archivo de diez líneas.
 * App.jsx lo carga con lazy() (o sea, en un bundle aparte que el
 * navegador solo pide si alguien entra a /admin) y lo monta dentro de
 * un <Suspense>. No recibe props: todo lo que necesita se lo da el
 * hook useAdminAuth.
 *
 * Props que recibe: ninguna.
 *
 * A qué parte del sistema pertenece: es la bisagra entre Firebase
 * Authentication (el servicio de login de Google) y el panel. Yo acá
 * NO decido quién puede escribir: solo le pregunto al hook si el
 * usuario que hay logueado es el dueño. La autoridad real son las
 * reglas de firestore.rules, que corren en los servidores de Google:
 * aunque alguien falsee esta pantalla desde la consola del navegador,
 * Firestore le responde permission-denied a cualquier escritura que
 * no venga del uid del admin.
 *
 * Cuándo se monta: una sola vez, cuando App.jsx detecta que la URL
 * arranca con "/admin".
 */
export default function AdminApp() {
  const { user, isAdmin } = useAdminAuth();
  // "undefined" significa "todavía no sé": el hook todavía está
  // preguntarle a Firebase si hay sesión. Pinto null (nada) a
  // propósito, porque dibujar el login un ratito y después cambiar
  // al panel se ve como un parpadeo feo en cada recarga.
  if (user === undefined) return null; // cargando sesión
  // Dos pantallas y ninguna más: si el uid es el del dueño entra
  // derecho al panel; si no, al login. Para cualquier otro caso
  // (nadie logueado, un usuario de Firebase que no es el dueño) lo
  // que ve es el login, y desde ahí no hay salida: las reglas no
  // le dejan escribir nada.
  return isAdmin ? <AdminPanel /> : <AdminLogin />;
}
