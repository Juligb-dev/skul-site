import React, { useState } from "react";
import { useAdminAuth } from "../hooks/useAdminAuth.js";

/**
 * ADMINLOGIN — el formulario de entrada de /admin.
 *
 * Qué es: la pantalla que ve cualquiera que entra a /admin sin
 * sesión. Un <form> con mail y contraseña, nada más. No escribe en
 * Firestore: no toca la base, solo le pide a Firebase Authentication
 * (el servicio de login de Google) que verifique las credenciales.
 *
 * Props que recibe: ninguna.
 *
 * A qué parte del sistema pertenece: es el login del lado del
 * cliente. Ojo con la aclaración importante: que el login viva en el
 * navegador NO significa que la seguridad esté acá. Que yo muestre
 * el panel o el login es una decisión de interfaz que cualquiera
 * puede falsear; lo que de verdad frena a los demás son las reglas
 * de firestore.rules, que corren en los servidores de Google y
 * rechazan toda escritura que no venga del uid del admin.
 *
 * Cuándo se monta: cuando AdminApp detecta que hay sesión abierta
 * pero no es la del dueño, o directamente que no hay sesión. En el
 * momento en que el login tiene éxito, useAdminAuth dispara su
 * listener y AdminApp se redibuja solo con el panel: por eso este
 * componente no tiene que hacer la transición, solo esperar.
 *
 * El valor real de `loading` es triple: deshabilita el botón, cambia
 * el texto a "Entrando…" y evita el segundo intento.
 */
export default function AdminLogin() {
  const { login } = useAdminAuth();
  // Los dos campos son controlados (van con value + onChange) para
  // poder limpiar el error y bloquear el envío mientras espera.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Un solo string para el error: no hace falta distinguir tipos, el
  // login solo tiene dos finales posibles.
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Se dispara al mandar el formulario (Enter o clic en "Entrar").
  // e.preventDefault() corta el envío nativo del <form>, que si no
  // recargaría la página entera.
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // login devuelve la promesa de Firebase: si el mail no existe,
      // la contraseña está mal o la cuenta está deshabilitada, revienta
      // acá y caigo en el catch.
      await login(email, password);
    } catch (err) {
      // Mensaje genérico a propósito: no le digo al visitante cuál de
      // las dos cosas falló, porque "ese mail no existe" alcanza para
      // que alguien pruebe correos ajenos.
      setError("Email o contraseña incorrectos.");
    } finally {
      // El finally corre siempre, haya pasado bien o mal: si dejara el
      // botón en "Entrando…" el admin no podría reintentar.
      setLoading(false);
    }
  };

  return (
    // Pantalla entera centrada: no hay header ni menú, la idea es que
    // sea la única cosa en pantalla mientras estás por entrar.
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "var(--font-body)" }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 360, border: "1px solid var(--black)", padding: 28 }}>
        <p className="display" style={{ fontSize: 20, margin: "0 0 4px" }}>SKUL</p>
        <p className="tracked" style={{ fontSize: 11, color: "var(--grey-3)", marginBottom: 24 }}>Panel de administración</p>
        {/* El required lo pone el navegador: si el mail está vacío o
            mal formado, ni siquiera llega a submit y se ve el cartel
            nativo. El type="email" además hace esa validación. */}
        <label style={{ display: "grid", gap: 6, marginBottom: 14 }}>
          <span className="tracked" style={{ fontSize: 11, fontWeight: 700 }}>Email</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ display: "grid", gap: 6, marginBottom: 18 }}>
          <span className="tracked" style={{ fontSize: 11, fontWeight: 700 }}>Contraseña</span>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
        </label>
        {/* El error va entre los campos y el botón para que se lea sin
            perder de vista qué es lo que falló. */}
        {error && <p style={{ fontSize: 12.5, color: "var(--accent)", marginBottom: 14 }}>{error}</p>}
        {/* disabled mientras espera: es el freno contra el doble envío,
            que con credenciales válidas abriría dos sesiones. */}
        <button disabled={loading} type="submit" className="btn-primary tracked" style={{ width: "100%" }}>
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
// Estilo compartido por los dos inputs, declarado acá abajo porque solo
// se usa en esta pantalla. Se podría haber hecho una clase de CSS, pero
// así el archivo se lee entero sin saltar a la hoja de estilos.
const inputStyle = { border: "1px solid var(--black)", background: "var(--white)", padding: "10px 12px", fontSize: 14 };
