import React from "react";
import { useSiteStatus } from "../hooks/useSiteStatus.js";
import { useAdminAuth } from "../hooks/useAdminAuth.js";
import ClosedScreen from "./ClosedScreen.jsx";

/**
 * SITEGATE — la puerta de la vidriera: ¿dejo ver la tienda o la tapo?
 *
 * Qué es: el componente que App.jsx envuelve alrededor de StoreApp (o sea,
 * TODA visita a la tienda pública pasa por acá, sin excepción). Lee el
 * estado del sitio en Firestore y decide entre tres desenlaces:
 *
 *   1. Todavía no sé → muestro un "Cargando…".
 *   2. La tienda está abierta (o sos el admin) → muestro los hijos.
 *   3. Está cerrada y no sos admin → muestro la pantalla de cierre.
 *
 * Props que recibe:
 *   - children: la tienda completa (StoreApp). No lo renderizo ni lo
 *     clono, solo lo dejo pasar o no, así que la tienda no se monta dos
 *     veces ni pierde su estado cuando cambia el estado del sitio.
 *
 * A qué parte del sistema pertenece: es la parte del "gate" que el README
 * describe como el sistema de cierre. Usa dos hooks: useSiteStatus (el
 * documento /settings/site, que el dueño edita en /admin → "Estado del
 * sitio") y useAdminAuth (para saber si el visitante es el dueño).
 *
 * OJO CON LA SEGURIDAD: este componente NO protege nada. Decide qué se
 * dibuja en el navegador, y eso cualquiera lo puede falsear con la consola
 * abierta. Para leer el estado del sitio no hace falta ser admin (está en
 * "allow read: if true"), y lo único protegido de verdad son las
 * escrituras, por las reglas de firestore.rules del lado de Google.
 *
 * Cuándo se monta: siempre que se monte la rama pública de App.jsx. El
 * panel /admin NO pasa por acá (App.jsx lo cuelga de otro lado), justamente
 * para que el dueño pueda entrar a abrir la tienda con la web cerrada.
 */
export default function SiteGate({ children }) {
  // status === null significa "todavía no llegó la respuesta de Firestore".
  const { status } = useSiteStatus();
  // user === undefined significa "todavía no sé si hay sesión"; con eso
  // armo el mismo "Cargando…" de abajo.
  const { isAdmin, user } = useAdminAuth();

  // Todavía cargando el estado de Firestore / la sesión de admin.
  //
  // Antes devolvía `null`: en una conexión lenta el visitante veía un
  // rectángulo blanco (a veces varios segundos) sin ninguna pista de que
  // la página estaba trabajando. Se muestra el mismo fondo de la tienda
  // con un aviso mínimo para que no parezca que la web está rota.
  if (status === null || user === undefined) {
    return (
      // role/aria-live le dicen a un lector de pantalla que esto es un
      // estado que cambia solo, así que lo anuncia sin que haga falta
      // que el visitante haga algo.
      <div className="closed-screen" role="status" aria-live="polite">
        <p className="mono tracked-lg" style={{ fontSize: 11, color: "var(--grey-2)", marginBottom: 22 }}>SKUL</p>
        <p style={{ fontSize: 13.5, color: "var(--grey-2)" }}>Cargando…</p>
      </div>
    );
  }

  // Si estás logueado como admin, siempre podés ver y probar el sitio,
  // aunque esté "cerrado" para el resto.
  //
  // El aviso naranja va arriba para que el dueño no se confunda: si
  // está revisando el sitio pensando que los clientes lo están viendo,
  // y en realidad lo único que ve es el panel de admin.
  if (status.open || isAdmin) {
    return (
      <>
        {isAdmin && !status.open && <AdminPreviewBar />}
        {children}
      </>
    );
  }

  // Última salida: cerrada y sin sesión de admin. Paso el mensaje tal
  // cual lo escribió el dueño; ClosedScreen tiene su propio texto de
  // respaldo si viene vacío.
  return <ClosedScreen message={status.message} />;
}

/**
 * ADMINPREVIEWBAR — la franja naranja de "estás viendo la tienda por dentro".
 *
 * Qué es: un cartelito finito que se dibuja arriba de todo, solo cuando el
 * dueño está mirando el sitio con la tienda cerrada. No es un aviso para
 * el público: es un recordatorio para el admin de que lo que está viendo
 * no es lo que ven los clientes.
 *
 * Por qué vive en el admin y no en SiteGate: es el único componente que
 * necesita un caso "admin mirando el sitio", y meterlo en su propio
 * archivo sería excessive para cinco líneas.
 */
function AdminPreviewBar() {
  return (
    <div className="mono tracked" style={{ background: "var(--accent)", color: "var(--white)", textAlign: "center", fontSize: 11, padding: "8px 10px" }}>
      Vista de admin — la tienda está CERRADA para el resto de los visitantes. Cambiá esto en /admin.
    </div>
  );
}
