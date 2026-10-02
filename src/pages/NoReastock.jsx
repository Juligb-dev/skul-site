import React, { useState } from "react";
import ProductGrid from "../components/ProductGrid.jsx";
import TypeLine from "../components/TypeLine.jsx";
import Reveal from "../components/Reveal.jsx";
import AnimatedBg from "../components/AnimatedBg.jsx";
import SkulWatermark from "../components/SkulWatermark.jsx";

/**
 * Pantalla de No-Restock: el drop único.
 *
 * Qué es: la sección de prendas que NO se reponen. Cada diseño se lanza
 * una sola vez en un drop; cuando se agota, se baja de la web y no
 * vuelve. Por eso la pantalla tiene su propio diseño, oscuro y con
 * "candado" de acceso: no es una categoría más del catálogo, es un
 * lugar con reglas propias.
 *
 * Por qué el trato visual es otro: en el home estas prendas aparecen
 * VELADAS (solo siluetas tapadas con un cartel BLOQUEADO) para generar
 * ganas de entrar. Recién acá adentro se destapan. Por eso la página
 * fuerza el fondo negro (`var(--black)` + la clase `nrs-page`) en vez
 * de dejar el fondo claro del resto del sitio.
 *
 * Cuándo se muestra: cuando el estado `page` de StoreApp.jsx vale
 * "noreastock" (la ruta /no-restock). StoreApp le pasa los productos
 * que tienen `p.nrs` prendido, así que acá solo hay prendas del drop.
 *
 * Props:
 *  - products: las prendas del drop, ya filtradas y activas.
 *  - openProduct(id): abre la ficha de la prenda.
 */
export default function NoReastock({ products, openProduct }) {
  /**
   * El "número de serie" del drop, que se muestra como si fuera un lote
   * impreso en la prenda. Lo calculo UNA sola vez al montar la pantalla
   * (la función initializer del useState corre una vez) y lo dejo fijo
   * aunque el visitante navegue adentro y vuelva: es adorno, no un dato
   * de negocio, así que se arma en el cliente y no se guarda en Firebase.
   */
  const [serial] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const n = Math.floor(100 + Math.random() * 899);
    return `DROP NRS-${y}-${m} · SERIE ${n}`;
  });

  // El fondo negro va inline además de la clase: la clase sola no
  // alcanza, la quiero forzar desde la página y no depender del orden
  // de cascada de los estilos globales.
  return (
    <main className="fx-host nrs-page" style={{ background: "var(--black)" }}>
      {/* Fondo animado en versión "grain": grano de película + viñeta +
          brasa. Le da la textura de pátina que busca la sección. */}
      <AnimatedBg variant="grain" />

      {/* Wordmark gigante de fondo con onDark, porque acá el fondo es
          negro y necesita el tono cálido en vez del oscuro. */}
      <SkulWatermark onDark />

      {/* --- cinta corriendo del aviso "no se repone" ---
          Duplico el mismo texto dos veces para que la cinta se repita
          al looping: si el texto no se duplica, al terminar el primer
          span queda un hueco vacío antes de volver al principio. */}
      <div style={{ borderBottom: "1px solid #333", overflow: "hidden", padding: "8px 0" }}>
        <div className="marquee-track mono tracked-lg" style={{ color: "var(--grey-1)", fontSize: 11, whiteSpace: "nowrap" }}>
          {Array(2).fill("DROP ÚNICO — NO SE REPONE — CUANDO SE ACABA, SE ACABA — DROP ÚNICO — NO SE REPONE — CUANDO SE ACABA, SE ACABA — DROP ÚNICO — NO SE REPONE — CUANDO SE ACABA, SE ACABA —").map((t, i) => (
            <span key={i} style={{ paddingRight: 40 }}>{t}</span>
          ))}
        </div>
      </div>

      {/* --- cabecera del drop --- */}
      <section style={{ color: "var(--white)", padding: "64px 20px" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto" }}>
          {/* TypeLine tipea el texto letra por letra: el "acceso concedido"
              es el recurso que vende la idea de drop. */}
          <p className="mono tracked-lg nrs-access" style={{ fontSize: 11, marginBottom: 14, color: "var(--grey-2)" }}>
            <TypeLine text="SOLICITANDO ACCESO... CONCEDIDO" />
          </p>
          <h1 className="display" style={{ fontSize: "clamp(38px,7vw,76px)", margin: "0 0 20px", lineHeight: 0.9, fontStyle: "italic" }}>No-Restock</h1>

          {/* El texto que aclara la regla del drop: una sola vez y no
              vuelve. Es la promesa que sostiene la sección. */}
          <p style={{ maxWidth: 600, fontSize: 15, lineHeight: 1.65, color: "var(--grey-1)" }}>
            Cada pieza se lanza en un pequeño drop, una sola vez. Cuando se
            agota, se quita de la web y ese diseño no vuelve a existir. Lo que
            ves ahora es todo lo que va a haber.
          </p>

          {/* Tres datos del drop, revelados de a uno en uno con el
              escalonado de delay para que no aparezcan juntos. */}
          <div style={{ display: "flex", gap: 26, marginTop: 32, flexWrap: "wrap" }}>
            <Reveal><MiniStat label="Drop" value="Unico" /></Reveal>
            <Reveal delay={80}><MiniStat label="Reposición" value="Nunca" /></Reveal>
            <Reveal delay={160}><MiniStat label="Exclusividad" value="Garantizada" /></Reveal>
          </div>

          {/* El sello con el número de serie del drop. */}
          <span className="mono" style={{ fontSize: 11, color: "var(--grey-2)", borderTop: "1px solid #333", paddingTop: 12, marginTop: 20, display: "inline-block" }}>{serial}</span>
        </div>
      </section>

      {/* --- las prendas del drop, ya destapadas --- */}
      <section style={{ maxWidth: 1240, margin: "0 auto", padding: "10px 20px 80px" }}>
        {/* Acá sí va la bandera `nrs`: con ella la grilla dibuja la
            versión oscura del drop (fondo negro, fuego detrás de la
            foto, pastilla de talles dentro de la tarjeta en vez de
            arriba). Ese contraste con el velo del home es el efecto. */}
        <ProductGrid products={products} openProduct={openProduct} nrs />
      </section>
    </main>
  );
}

/**
 * MiniStat: un dato del drop (etiqueta arriba, valor abajo), con una
 * línea vertical a la izquierda. Es chiquito y sólo se usa acá, así que
 * no lo separé en otro archivo.
 *
 * Props:
 *  - label: el nombre del dato ("Drop", "Reposición"...).
 *  - value: el valor, que siempre es el mismo texto de adorno.
 */
function MiniStat({ label, value }) {
  return (
    <div style={{ borderLeft: "1px solid var(--grey-2)", paddingLeft: 12 }}>
      <p className="mono tracked" style={{ fontSize: 10, color: "var(--grey-2)", margin: "0 0 4px" }}>{label}</p>
      <p className="tracked" style={{ fontWeight: 700, fontSize: 15, margin: 0, color: "var(--white)" }}>{value}</p>
    </div>
  );
}