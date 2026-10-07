import React, { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { useProducts } from "../hooks/useProducts.js";
import { fmt } from "../utils/format.js";

/* ============================================================
 *  FLYERSTAB — generador de flyers para las historias de Instagram.
 *  ------------------------------------------------------------
 *
 *  Qué es: una pestaña más del panel. El dueño elige una prenda,
 *  una de las tres plantillas (todas distintas entre sí), retoca el
 *  título y el número de drop, y exporta un PNG de 1080×1350 (el
 *  tamaño de una historia/portada vertical de Instagram) listo para
 *  postear.
 *
 *  Por qué existe: los drops salen seguido y hacer el flyer a mano
 *  cada vez lleva media hora. Acá se hace en un minuto, pero SIN
 *  caer en el look de plantilla genérica: solo tipografía pesada,
 *  líneas finas, detalles de barcode/etiqueta y la textura de marca
 *  (public/editorial). No hay gradientes de moda, ni imágenes de
 *  stock, ni fuentes decorativas: lo que destaca es la foto real de
 *  la prenda. Y como son tres plantillas + textos editables, nunca
 *  sale dos veces el mismo flyer.
 *
 *  Cómo se exporta: el nodo se dibuja a 540×675 (la mitad de lo
 *  final) y `toPng` con pixelRatio 2 lo lleva a 1080×1350. En la
 *  pantalla se ve en miniatura (escalado al 45%).
 *
 *  Qué exporta: `FlyersTab`, el componente completo de la pestaña.
 */

const DIS = 540; // ancho de diseño, en CSS px
const ALT = 675;
const CN = { crossOrigin: "anonymous" }; // para que Cloudinary haga CORS y la foto entre en el PNG

const PLANTILLAS = [
  { id: "tag", nombre: "TAG DE PRECIO" },
  { id: "postal", nombre: "POSTAL" },
  { id: "boletin", nombre: "BOLETÍN" },
];

// Colores de marca, hardcodeados a propósito: el flyer tiene que verse
// igual sin importar el tema claro/oscuro del sitio.
const NEGRO = "#0d0c0a";
const CARBON = "#14120f";
const PAPEL = "#e9e4d8";
const MUTED = "#8a8577";
const CENIZA = "#2a2722";
const MIEL = "#d8a24a";
const HUMO = "#f2efe6";

const MONO = "'SF Mono','Menlo','Consolas',monospace"; // números/etiquetas

/* Marionetas de texto compartidas, para que las tres plantillas
   hablen el mismo idioma visual. */
const T = {
  o: (f) => ({ fontFamily: "'Arimo','Helvetica Neue',Arial,sans-serif", fontWeight: 700, letterSpacing: f || ".12em", textTransform: "uppercase" }),
  m: (f) => ({ fontFamily: MONO, letterSpacing: f || ".18em" }),
};

/** Una plantilla por función. Todas reciben lo mismo (producto,
 *  textos y si va el precio) y devuelven el 540×675 completo. */
const PlantillaTag = ({ p, titulo, numero, precio }) => (
  <div style={{
    width: DIS, height: ALT, background: `url(/editorial/skul-street.svg) center/cover, ${NEGRO}`,
    color: HUMO, padding: 24, display: "flex", flexDirection: "column",
  }}>
    {/* agujero de etiqueta colgada + hilera de puntos */}
    <div style={{ display: "flex", justifyContent: "center", padding: "6px 0 14px" }}>
      <div style={{ width: 34, height: 34, borderRadius: "50%", border: "2px solid " + CENIZA, background: "transparent" }} />
    </div>
    <div style={{ height: 3, background: "repeating-linear-gradient(90deg," + CENIZA + " 0 2px,transparent 2px 8px)", marginBottom: 18 }} />
    {/* cabecera tipo etiqueta de despacho */}
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
      <span style={T.o("24px")}>SKUL</span>
      <span style={T.m("8px")}>KSSS—{numero}</span>
    </div>
    {/* la prenda: siempre recta, siempre arriba */}
    <div style={{ width: "100%", height: 358, borderRadius: 4, border: "1px solid " + CENIZA, overflow: "hidden", background: CARBON }}>
      <img src={p.photos[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} {...CN} />
    </div>
    <div style={{ flex: 1 }} />
    {/* nombre + precio con descuento al lado */}
    <p style={{ ...T.o("16px"), fontSize: 22, margin: "10px 0 0", lineHeight: 1.15 }}>{p.name}</p>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 6 }}>
      {precio
        ? <span style={{ ...T.m("6px"), fontSize: 46, color: HUMO }}>{fmt(p.transferPrice || p.basePrice)}</span>
        : <span style={{ ...T.m("6px"), fontSize: 46, color: HUMO }}>{titulo}</span>}
      <div style={{ textAlign: "right", ...T.m("12px"), fontSize: 13, color: MIEL, lineHeight: 1.5 }}>
        <span>10% OFF</span><br /><span>EN EFECTIVO</span>
      </div>
    </div>
    {/* barcode + pie */}
    <div style={{ width: "100%", height: 46, background: "repeating-linear-gradient(90deg," + HUMO + " 0 2px,transparent 2px 5px," + HUMO + " 5px 6px,transparent 6px 11px)", marginTop: 14, opacity: .94 }} />
    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, ...T.m("10px"), fontSize: 10, color: MUTED }}>
      <span>SKUL STREETWEAR</span>
      <span>LOS TOLDOS · BUENOS AIRES</span>
    </div>
  </div>
);

const PlantillaPostal = ({ p, titulo, numero, precio }) => (
  <div style={{
    width: DIS, height: ALT, background: PAPEL, color: "#12100c", padding: 26,
    display: "flex", flexDirection: "column",
  }}>
    {/* titular grande arriba, número en la punta */}
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <h2 style={{ ...T.o("10px"), fontSize: 58, margin: 0, lineHeight: 1 }}>{titulo}</h2>
      <span style={{ ...T.m("10px"), fontSize: 14, color: "#7a6f5b" }}>Nº {numero}</span>
    </div>
    <div style={{ width: 74, height: 5, background: "#12100c", marginTop: 14 }} />
    {/* foto a sangre de borde a borde, con filete negro arriba y abajo */}
    <div style={{ margin: "18px -26px 0", borderTop: "3px solid #12100c", borderBottom: "3px solid #12100c", height: 360, overflow: "hidden" }}>
      <img src={p.photos[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} {...CN} />
    </div>
    {/* datos del drop */}
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 18 }}>
      <div>
        <p style={{ ...T.o("14px"), fontSize: 20, margin: 0 }}>{p.name}</p>
        {precio && <p style={{ ...T.m("8px"), fontSize: 30, margin: "8px 0 0" }}>{fmt(p.transferPrice || p.basePrice)}</p>}
      </div>
      <p style={{ ...T.o("16px"), fontSize: 13, color: "#7a6f5b", margin: 0 }}>EFECTIVO 10% OFF</p>
    </div>
    <div style={{ flex: 1 }} />
    {/* barra negra de cierre */}
    <div style={{ margin: "0 -26px -26px", background: "#12100c", color: HUMO, padding: "18px 26px", display: "flex", justifyContent: "space-between", ...T.o("14px"), fontSize: 12 }}>
      <span>SKUL STREETWEAR</span>
      <span style={T.m("12px")}>SKULLT.WEB.APP</span>
    </div>
  </div>
);

const PlantillaBoletin = ({ p, titulo, numero, precio }) => (
  <div style={{
    width: DIS, height: ALT, background: NEGRO, color: HUMO, padding: 30,
    display: "flex", flexDirection: "column",
  }}>
    {/* arriba: el número a la izquierda, la marca a la derecha */}
    <div style={{ display: "flex", justifyContent: "space-between", ...T.m("12px"), fontSize: 12, color: MUTED }}>
      <span>Nº {numero}</span>
      <span style={T.o("20px")}>SKUL</span>
    </div>
    {/* titular + raya de acento */}
    <h2 style={{ ...T.o("8px"), fontSize: 52, margin: "40px 0 0", lineHeight: 1 }}>{titulo}</h2>
    <div style={{ width: 84, height: 4, background: MIEL, marginTop: 16 }} />
    {/* foto con marco blanco fino, corrida a la derecha (asimetría de fanzine) */}
    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 26 }}>
      <div style={{ width: "86%", height: 330, border: "2px solid " + HUMO, overflow: "hidden" }}>
        <img src={p.photos[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} {...CN} />
      </div>
    </div>
    <div style={{ flex: 1 }} />
    <p style={{ ...T.o("14px"), fontSize: 21, margin: 0 }}>{p.name}</p>
    {precio && <p style={{ ...T.m("8px"), fontSize: 30, margin: "10px 0 0", color: MIEL }}>{fmt(p.transferPrice || p.basePrice)}</p>}
    {/* línea de cierre */}
    <div style={{ borderTop: "1px solid " + CENIZA, marginTop: 22, paddingTop: 12, display: "flex", justifyContent: "space-between", ...T.m("10px"), fontSize: 10, color: MUTED }}>
      <span>LOS TOLDOS, ARGENTINA</span>
      <span>SKULLT.WEB.APP</span>
    </div>
  </div>
);

const PLANTILLA_COMP = { tag: PlantillaTag, postal: PlantillaPostal, boletin: PlantillaBoletin };

export default function FlyersTab() {
  const { products } = useProducts();
  const [productId, setProductId] = useState("");
  const [plantilla, setPlantilla] = useState("tag");
  const [titulo, setTitulo] = useState("NUEVO DROP");
  const [numero, setNumero] = useState("001");
  const [precio, setPrecio] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState("");
  const nodeRef = useRef(null);

  const conFoto = (products || []).filter((p) => (p.photos || []).length > 0);
  const product = conFoto.find((p) => p.id === productId) || conFoto[0];

  const descargar = async () => {
    if (!nodeRef.current || !product) return;
    setExportando(true);
    setError("");
    try {
      // pixelRatio 2 sobre un lienzo de 540×675 = PNG de 1080×1350.
      const dataUrl = await toPng(nodeRef.current, { pixelRatio: 2 });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `skul-${plantilla}-${String(numero).trim().replace(/\s+/g, "-") || "drop"}.png`;
      a.click();
    } catch {
      setError("No se pudo generar la imagen. Probá de nuevo.");
    } finally {
      setExportando(false);
    }
  };

  const Plantilla = PLANTILLA_COMP[plantilla];

  return (
    <section>
      <p className="tracked" style={{ fontSize: 12, fontWeight: 700, marginBottom: 18 }}>
        Flyers para Instagram Drop
      </p>
      <p style={{ fontSize: 12.5, color: "#5c5a52", margin: "-8px 0 18px", maxWidth: 640, lineHeight: 1.5 }}>
        Se exporta en 1080×1350 (historia / portada vertical). Elegí prenda, plantilla y textos; el precio
        opcional usa el de transferencia. Cada plantilla compone distinto para que no salgan dos flyers iguales.
      </p>

      <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
        {/* ── controles ── */}
        <div style={{ flex: 1, minWidth: 260, maxWidth: 380, display: "flex", flexDirection: "column", gap: 14 }}>
          <label className="tracked" style={{ fontWeight: 700, fontSize: 11.5 }}>
            Prenda
            <select value={product ? product.id : productId} onChange={(e) => setProductId(e.target.value)} style={{ marginTop: 6 }}>
              {conFoto.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>

          <div>
            <p className="tracked" style={{ fontWeight: 700, fontSize: 11.5, margin: "0 0 8px" }}>Plantilla</p>
            <div style={{ display: "flex", gap: 8 }}>
              {PLANTILLAS.map((pl) => (
                <button
                  key={pl.id}
                  onClick={() => setPlantilla(pl.id)}
                  className="tracked"
                  style={{
                    flex: 1, padding: "10px 8px", fontSize: 10.5, fontWeight: 700,
                    border: "1px solid var(--black)", background: plantilla === pl.id ? "var(--black)" : "transparent",
                    color: plantilla === pl.id ? "var(--white)" : "var(--black)", cursor: "pointer",
                  }}
                >
                  {pl.nombre}
                </button>
              ))}
            </div>
          </div>

          <label className="tracked" style={{ fontWeight: 700, fontSize: 11.5, display: "block" }}>
            Título del flyer
            <input value={titulo} maxLength={28} onChange={(e) => setTitulo(e.target.value)} style={{ marginTop: 6 }} />
          </label>
          <label className="tracked" style={{ fontWeight: 700, fontSize: 11.5, display: "block" }}>
            Nº de drop
            <input value={numero} maxLength={6} onChange={(e) => setNumero(e.target.value)} style={{ marginTop: 6 }} />
          </label>

          <label className="tracked" style={{ fontWeight: 700, fontSize: 11.5, display: "flex", alignItems: "center", gap: 10 }}>
            <input type="checkbox" checked={precio} onChange={(e) => setPrecio(e.target.checked)} style={{ width: 16, height: 16, flex: 0 }} />
            Mostrar precio
          </label>

          <button
            onClick={descargar}
            disabled={exportando || !product}
            className="tracked"
            style={{ padding: "13px 16px", fontSize: 12, fontWeight: 700, border: "1px solid var(--black)", background: "var(--black)", color: "var(--white)", cursor: "pointer", marginTop: 4 }}
          >
            {exportando ? "Generando PNG…" : "Descargar PNG (1080×1350)"}
          </button>
          {error && <p style={{ color: "#7a1f14", fontSize: 12 }}>{error}</p>}
        </div>

        {/* ── vista previa ── */}
        <div style={{ flex: "0 0 243px" }}>
          {product ? (
            <div style={{ width: 243, height: 304, overflow: "hidden", border: "1px solid var(--black)", lineHeight: 0 }}>
              <div style={{ transform: "scale(.45)", transformOrigin: "top left", width: DIS, height: ALT }}>
                <div ref={nodeRef}>{React.createElement(Plantilla, { p: product, titulo, numero, precio })}</div>
              </div>
            </div>
          ) : (
            <div style={{ width: 243, height: 304, border: "1px dashed #999", display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: 12, textAlign: "center", padding: 20 }}>
              No hay prendas con foto
            </div>
          )}
        </div>
      </div>
    </section>
  );
}