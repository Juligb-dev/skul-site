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
 *   1. Todavía no sé (no llegó Firestore) → muestro un "Cargando…".
 *   2. La tienda está abierta → muestro los hijos, sin preguntar nada más.
 *   3. Está cerrada → ahí sí pregunto la sesión (CerradaGate): si sos el
 *      admin, ves la tienda con una franja naranja; si no, la pantalla de
 *      cierre (y si la sesión todavía no resolvió, "Cargando…").
 *
 * Por qué la rama "abierta" no consulta la sesión: es un atajo de
 * rendimiento. El visitante común nunca necesita loguearse para ver la
 * tienda abierta, y no preguntar por la sesión evita descargar el SDK de
 * Firebase Auth en la primera visita. Ver `src/firebaseAuth.js`.
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

  // Todavía cargando el estado del sitio.
  //
  // Antes devolvía `null`: en una conexión lenta el visitante veía un
  // rectángulo blanco (a veces varios segundos) sin ninguna pista de que
  // la página estaba trabajando. Se muestra el mismo fondo de la tienda
  // con un aviso mínimo para que no parezca que la web está rota.
  //
  // OJO: acá NO esperamos la sesión de admin. Si la tienda está abierta,
  // dejamos pasar a los hijos enseguida; preguntar "¿sos el dueño?" solo
  // hace falta cuando está cerrada, y esa pregunta vive en CerradaGate
  // (que además es la única que descarga el SDK de Firebase Auth).
  if (status === null) {
    return <Cargando />;
  }

  // Tienda abierta: entra todo el mundo, sin mirar sesiones. La tienda no
  // se monta dos veces ni pierde estado porque solo pasamos los hijos.
  if (status.open) {
    return <>{children}</>;
  }

  // Tienda cerrada: ahora sí necesitamos saber si sos el admin para
  // dejarte pasar (y avisarte con la franja naranja).
  return <CerradaGate message={status.message}>{children}</CerradaGate>;
}

/**
 * CERRADAGATE — la decisión fina de la tienda cerrada.
 *
 * Qué problema resuelve: separar en dos el caso "abierto" del "cerrado" es
 * lo que permite que useAdminAuth (y con él, todo el SDK de Firebase Auth)
 * NO se monte cuando la tienda está abierta. Es un componente aparte y no
 * un `if` adentro de SiteGate porque los hooks no se pueden llamar
 * condicionalmente.
 *
 * Ramas: sin sesión resuelta → "Cargando…"; admin → hijos + franja naranja;
 * visitante común → pantalla de cierre.
 */
function CerradaGate({ message, children }) {
  const { isAdmin, user } = useAdminAuth();

  if (user === undefined) {
    return <Cargando />;
  }

  if (isAdmin) {
    return (
      <>
        <AdminPreviewBar />
        {children}
      </>
    );
  }

  // Paso el mensaje tal cual lo escribió el dueño; ClosedScreen tiene su
  // propio texto de respaldo si viene vacío.
  return <ClosedScreen message={message} />;
}

/**
 * CARGANDO — el estado de espera mientras Firestore responde.
 *
 * Antes devolvía `null`: en una conexión lenta el visitante veía un
 * rectángulo blanco (a veces varios segundos) sin ninguna pista de que la
 * página estaba trabajando. Se muestra el mismo fondo de la tienda con un
 * aviso mínimo para que no parezca que la web está rota.
 */
function Cargando() {
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
