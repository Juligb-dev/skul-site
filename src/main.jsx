/**
 * MAIN — el punto de entrada de la app: el único módulo que se ejecuta por su
 * cuenta (index.html lo carga con `<script type="module" src="/src/main.jsx">`).
 *
 * Qué problema resuelve: React no dibuja nada solo. Necesita un lugar en el HTML
 * donde colgar y una llamada que le diga "montá acá". Este archivo es
 * exactamente esa llamada y nada más.
 *
 * Qué exporta: nada. Los puntos de entrada no se importan, se ejecutan.
 * Quien importa algo del proyecto es App.jsx, para abajo.
 *
 * Requisito previo: que index.html tenga el <div id="root"> (línea 42). Si lo
 * borrás de ahí, React no encuentra dónde montarse y no se ve nada.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

// Los CSS entran desde acá y no desde App.jsx a propósito: los necesita también
// la pantalla de error del ErrorBoundary, que se dibuja cuando la tienda ya
// reventó y ni siquiera llegó a renderizar <App />.
import './styles/global.css';
import './styles/storefront.css';

// createRoot es el API de React 18: recibe el contenedor del DOM y devuelve una
// "raíz" de React desde la que se dibuja todo lo que le pasamos abajo.
ReactDOM.createRoot(document.getElementById('root')).render(
  // StrictMode no cambia nada en pantalla: en desarrollo monta, desmonta y
  // vuelve a montar cada componente para que te avises de efectos sucios
  // (suscripciones que no se limpian, estados que se actualizan durante el
  // render, etc.). En el build de producción React lo ignora.
  <React.StrictMode>
    {/* Va POR FUERA de App a propósito: si algo revienta adentro de la tienda
        (no solamente en /admin), el visitante igual ve el cartel de error con el
        botón de recargar, en vez de una pantalla en blanco que parece caída. */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);