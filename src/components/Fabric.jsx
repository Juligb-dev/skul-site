import React from "react";

/* textura tipo tela en vez de color sólido — placeholder de foto de producto */
// Ruido generado por el navegador y empaquetado en un data URL (o sea
// la imagen entera escrita dentro del propio atributo src), así no hay
// que pedirle un archivo al servidor. feTurbulence es un filtro de SVG
// que genera ruido fractal (manchas suaves en varias escalas);
// stitchTiles hace que el patrón se repita sin costura cuando la textura
// se copia en varias celdas.
const NOISE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";

/**
 * Rectángulo con textura de tela, para usar cuando un producto todavía
 * no tiene foto. Es un placeholder: cada prenda sin foto se ve distinta
 * según su tone, así la grilla no parece una grilla de cajas iguales.
 *
 * Props:
 *  - tone: 0 a 1, define el tono de la tela. El catálogo lo pasa con el
 *    número que tiene cada producto en la base.
 *  - dark: modo oscuro (No-Restock). Pinta la base casi negra y deja
 *    el ruido en tono frío.
 *  - angle: dirección del gradiente de luz sobre la tela, en grados.
 *  - children: lo que va arriba (típicamente el nombre del producto).
 *  - style: estilos inline extra del contenedor.
 */
export default function Fabric({ tone = 0.75, dark, angle = 155, children, style = {} }) {
  // Calculo el RGB de la base a mano: en oscuro va a un gris carbón
  // fijo (22,21,20), y en claro el tone mueve el gris hacia el beige.
  // El canal azul va siempre un toque más bajo para que el resultado
  // sea cálido y no un gris neutro.
  const base = dark ? 22 : Math.round(108 + tone * 118);
  const warm = dark ? 20 : Math.round(104 + tone * 112);
  return (
    // overflow:hidden para que las capas absolutas de adentro no
    // salgan del rectángulo.
    <div style={{ position: "relative", background: `rgb(${base},${base - 1},${warm})`, overflow: "hidden", ...style }}>
      {/* Capa 1: el ruido. mixBlendMode "overlay" lo mezcla con la base
          según sea claro u oscuro, así la textura aparece sin tapar
          el color de la prenda. */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: `url("${NOISE}")`, opacity: 0.45, mixBlendMode: "overlay" }} />
      {/* Capa 2: un gradiente diagonal que simula la caída de la tela
          (luz de un lado, sombra del otro). */}
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(${angle}deg, rgba(255,255,255,0.07), rgba(0,0,0,0.2))` }} />
      {children}
    </div>
  );
}
