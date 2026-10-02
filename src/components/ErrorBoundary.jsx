import React from "react";

/**
 * Error Boundary: la red de seguridad de toda la app. Lo envuelve
 * main.jsx y envuelve TODO lo que se dibuja.
 *
 * Qué es y por qué existe: en React, si un componente lanza un error
 * durante el render, sin un Error Boundary se cae la página entera y
 * el visitante ve la pantalla blanca del navegador. Este componente es
 * el único tipo de componente que puede "atrapar" ese error (por eso
 * es una class y no una función): cuando uno de sus hijos falla, lo
 * intercepta, dibuja la pantalla de "algo salió mal" y el resto de la
 * app sigue viva. Importa sobre todo para las llamadas a Firestore:
 * si la base no responde, la tienda muestra el aviso de recargar en
 * vez de romperse en blanco.
 *
 * Props: children (lo que envuelve). No usa ninguna otra.
 */
export default class ErrorBoundary extends React.Component {
  // El único estado: ¿ya falló algo? Con false dibuja children tal cual.
  state = { failed: false };

  // La primera de las dos etapas de React cuando algo explota en el
  // render: acá se cambia el estado y React vuelve a dibujar el árbol
  // saltando el componente que falló.
  static getDerivedStateFromError() { 
    return { failed: true }; 
  }

  // La segunda etapa, que corre después: acá sólo se loguea, para
  // poder ver el error y el component stack en la consola del
  // navegador y reproducirlo.
  componentDidCatch(err, info) { 
    console.error("Error de renderizado capturado:", err, info); 
  }

  render() {
    // Camino feliz: el boundary es invisible, sólo pasa sus hijos.
    if (!this.state.failed) return this.props.children;

    // Camino de error: pantalla negra a pantalla completa con un
    // botón de recarga. Los estilos son inline a propósito: si el CSS
    // de la app fuera la causa del fallo, no quiero depender de él.
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", textAlign: "center", padding: 24, backgroundColor: "#000", color: "#fff" }}>
        <div>
          <h2 style={{ fontWeight: 700, fontSize: 20, marginBottom: 12 }}>¡Ups! Algo salió mal.</h2>
          <p style={{ fontSize: 14, marginBottom: 18, color: "#ccc" }}>Recargá la página para continuar. Si el problema persiste, contactanos por WhatsApp.</p>
          <button 
            onClick={() => window.location.reload()}
            style={{ padding: "10px 20px", background: "#fff", color: "#000", border: "none", fontWeight: "bold", cursor: "pointer" }}
          >
            Recargar Página
          </button>
        </div>
      </div>
    );
  }
}