/**
 * APP — el componente raíz: decide si lo que se dibuja es el panel de /admin o
 * la tienda pública.
 *
 * Qué problema resuelve: el sitio tiene dos aplicaciones distintas adentro del
 * mismo build (la vidriera y el panel de carga), y acá está la única bifurcación
 * entre ambas. Todo lo demás cuelga de acá.
 *
 * Qué exporta: el componente `App` por default. Lo importa main.jsx, que es el
 * único lugar del proyecto que lo usa.
 *
 * Cómo decide: no hay router (no uso react-router). Lee el path real de la URL
 * una única vez, al montar, y a partir de ahí el resto de la navegación la
 * maneja StoreApp con su propio estado `page`. Por eso este archivo no tiene
 * estado: es una decisión de una vez y listo.
 */

import React, { Suspense, lazy } from "react";
import SiteGate from "./admin/SiteGate.jsx";
import StoreApp from "./StoreApp.jsx";

// El panel de admin va en su propio bundle. Antes esto se hacía para que
// el modelo de IA de quitar fondos de fotos (varios MB) no lo descargara
// el visitante que solo quiere comprar —esa parte ya no está conectada
// (ver el aviso en src/utils/productImage.js), pero separar /admin del
// resto sigue conviene: el panel es mucho más pesado y casi nadie lo abre.
// O sea: lazy() + import() dinámico = code-splitting, Vite parte el código en
// un archivo aparte que el navegador pide únicamente si entra a /admin.
const AdminApp = lazy(() => import("./admin/AdminApp.jsx"));

/**
 * Arranco de la app: leo la URL real al cargar, la convierto a una decisión
 * (panel o tienda) y devuelvo lo que corresponde.
 *
 * Nota: también es el archivo donde se monta el "gate" de la web cerrada
 * (SiteGate), o sea que TODA visita de la vidriera pasa por ahí, admin
 * incluido.
 */
export default function App() {
  // El typeof es una guarda por si este archivo se llegara a renderizar en un
  // entorno sin window (SSR/pruebas). En el navegador siempre existe, así que
  // acá la condición real es solo el prefijo de la ruta.
  const isAdminRoute = typeof window !== "undefined" && window.location.pathname.startsWith("/admin");

  // Rama del panel: no lleva SiteGate, porque el admin tiene que poder entrar
  // con la tienda cerrada para poder abrirla.
  if (isAdminRoute) {
    return (
      // Suspense es el acompañante obligatorio de lazy: mientras se descarga el
      // bundle del panel todavía no hay nada que dibujar, así que le decimos
      // qué mostrar en ese rato.
      <Suspense fallback={<div style={{ padding: 40, textAlign: "center" }}>Cargando…</div>}>
        <AdminApp />
      </Suspense>
    );
  }

  // Rama de la tienda pública.

  return (
  <>
    {/* Skip link de accesibilidad: queda invisible hasta que alguien navega con
        el teclado (tabulador), y ahí saltea el header entero al contenido.
        Apunta al id="contenido-principal" que define la <main> de cada pantalla. */}
    <a href="#contenido-principal" className="skul-skip-link">
      Saltar al contenido principal
    </a>

    {/* SiteGate es la puerta: consulta en Firestore si la web está abierta y,
        si no lo está, reemplaza a los hijos por la pantalla de "cerrada"
        (salvo que estés logueado como admin). StoreApp —la vidriera completa,
        con su página actual, carrito y checkout— va como children. */}
    <SiteGate>
      <StoreApp />
    </SiteGate>
  </>
);
}
