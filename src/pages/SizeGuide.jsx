import React from "react";
import { ChevronLeft } from "lucide-react";

/**
 * Guía de talles.
 *
 * Qué es: la pantalla con la tabla de medidas de una prenda. La abre el
 * botón "Ver guía de talles" de la ficha de producto, o el footer.
 *
 * Cuándo se muestra: cuando el estado `page` de StoreApp.jsx vale
 * "size-guide" (la ruta /guia-de-talles).
 *
 * Props:
 *  - nav(pagina): es el mismo nav de la app. Lo uso para el botón
 *    "Volver", que devuelve a la ficha del producto si hay una abierta.
 *  - hasProduct: booleano, dice si hay un producto seleccionado. Define
 *    a dónde vuelve el botón: a la ficha o al catálogo.
 *  - chart: la tabla de talles del producto, con forma { cols, rows }.
 *    La arma el panel de admin a partir de un texto con comas, así que
 *    puede no existir: puede ser null si el producto no tiene tabla
 *    cargada.
 */
export default function SizeGuide({ nav, hasProduct, chart }) {
  // Normalizo el chart a null para que la comprobación de abajo sea una
  // sola y no tenga que proteger por undefined.
  const table = chart || null;

  /**
   * REGLA DE LA PÁGINA: si el producto no tiene tabla de talles cargada,
   * NO se rompe la pantalla ni se dibuja una tabla vacía; se muestra un
   * aviso que deriva la consulta a contacto. El motivo es de negocio:
   * esta pantalla siempre se abre desde un producto, y si ese producto
   * no cargó medidas es porque el admin todavía no las puso. Es más
   * honesto y más útil que una tabla en blanco.
   */
  if (!table) {
    return (
      <main style={{ maxWidth: 700, margin: "0 auto", padding: "50px 20px 90px" }}>
        {/* Volver: a la ficha si había producto, si no al catálogo. */}
        <button onClick={() => nav(hasProduct ? "product" : "catalog")} className="tracked" style={{ background: "none", border: "none", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 24, color: "var(--grey-3)" }}>
          <ChevronLeft size={14} /> Volver
        </button>
        <p className="mono tracked" style={{ fontSize: 12, marginBottom: 6, color: "var(--grey-3)" }}>/ GUÍA DE TALLES</p>
        <h1 className="display" style={{ fontSize: "clamp(28px,5vw,42px)", margin: "0 0 20px" }}>Cómo elegir tu talle</h1>

        {/* El aviso: mismo título que la versión con tabla, para que el
            cliente no quede pensando que se rompió el link. */}
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--grey-3)" }}>
          Todavía no cargamos una tabla de talles para esta prenda. Escribinos y te ayudamos a elegir.
        </p>
      </main>
    );
  }

  // Con tabla cargada: el botón Volver y el título se repiten porque son
  // JSX, no un componente. Es la parte que más se encima, pero prefiero
  // la repetición a inventar otro componente para dos usos.
  return (
    <main style={{ maxWidth: 700, margin: "0 auto", padding: "50px 20px 90px" }}>
      <button onClick={() => nav(hasProduct ? "product" : "catalog")} className="tracked" style={{ background: "none", border: "none", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 24, color: "var(--grey-3)" }}>
        <ChevronLeft size={14} /> Volver
      </button>
      <p className="mono tracked" style={{ fontSize: 12, marginBottom: 6, color: "var(--grey-3)" }}>/ GUÍA DE TALLES</p>
      <h1 className="display" style={{ fontSize: "clamp(28px,5vw,42px)", margin: "0 0 20px" }}>Cómo elegir tu talle</h1>

      {/* La aclaración de cómo se toman las medidas y qué hacer cuando
          estás entre dos talles. */}
      <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--grey-3)", marginBottom: 30, maxWidth: 480 }}>
        Medidas en centímetros, tomadas con la prenda extendida. Si estás
        entre dos talles y te gusta más suelto, elegí el más grande.
      </p>

      {/* La tabla. Las columnas salen de table.cols y cada fila trae sus
          celdas en row.cells: el admin las carga con un texto de
          "encabezado" y una línea por talle, separado por comas. */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--black)" }}>
            {table.cols.map((c) => (
              <th key={c} className="tracked" style={thStyle}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
  {/* OJO con la indentación rare de este bloque: quedó así de origen y la
      dejé como estaba. Acá van los cuerpos de la tabla. */}
  {table.rows.map((row, i) => (
    <tr key={i} style={{ borderBottom: "1px solid var(--grey-1)" }}>
      {row.cells.map((cell, j) => (
        <td key={j} className="mono" style={tdStyle}>{cell}</td>
      ))}
    </tr>
  ))}
</tbody>
      </table>
    </main>
  );
}

// Estilos de la tabla, arriba del componente para recrearlos una sola
// vez: si fueran objetos inline, React los vería como nuevos en cada
// render y las celdas se volverían a pintar siempre.
const thStyle = { textAlign: "left", padding: "10px 6px", fontSize: 11.5, fontWeight: 700 };
const tdStyle = { padding: "12px 6px", fontSize: 14 };