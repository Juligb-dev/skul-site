import React, { useState } from "react";
import { toPng } from "html-to-image";
import { useProducts } from "../hooks/useProducts.js";
import { fmt } from "../utils/format.js";

/* ============================================================
 *  FLYERSTAB — generador de flyers para las historias de Instagram.
 *  ------------------------------------------------------------
 *
 *  Qué es: una pestaña más del panel. El dueño elige una prenda, una
 *  plantilla, retoca el título y el número de drop, y exporta un PNG
 *  de 1080×1350 (historia / portada vertical de Instagram) listo para
 *  postear.
 *
 *  CÓMO EVITA EL LOOK GENÉRICO: no hay fotos torcidas, ni cinta de
 *  enmascarar, ni polaroids: todas muletillas de plantilla IA. El
 *  sistema visual es el mismo que ya usa la tienda — tipografía
 *  pesada alineada, líneas finas, numeración, papel y una textura de
 *  marca (public/editorial) — sumado a detalles de imprenta reales:
 *  marcas de registro en las esquinas, reglas punteadas, numerales
 *  fantasma y cuadrícula de papel técnico. Cuatro composiciones muy
 *  distintas entre sí (una sola foto, ficha técnica con datos, dúo de
 *  fotos, póster tipográfico), así nunca sale dos veces lo mismo.
 *
 *  LA FOTO NUNCA SE CORTA: las fotos de las prendas son verticales
 *  (800×1000 a 800×1200) y en un marco horizontal se descuadraturaban
 *  con object-fit: cover, cortando el género. Acá el ayate real de la
 *  imagen se mide al cargar (`Foto` mide el ratio natural) y el marco
 *  adopta ESA proporción: la prenda entra siempre completa, y por eso
 *  la foto va en una columna y no a sangre.
 *
 *  Cómo se exporta: el nodo se dibuja a 540×675 (la mitad de lo
 *  final) y `toPng` con pixelRatio 2 lo lleva a 1080×1350. En la
 *  pantalla se ve en miniatura (escalado al 45%).
 *
 *  Qué exporta: `FlyersTab`, el componente completo de la pestaña.
 */

const DIS = 540; // ancho de diseño, en CSS px
const ALT = 675;

const PLANTILLAS = [
  { id: "report", nombre: "REPORTE" },
  { id: "ficha", nombre: "FICHA" },
  { id: "duo", nombre: "DÚO" },
  { id: "poster", nombre: "POSTER" },
];

// Colores de marca, hardcodeados a propósito: el flyer tiene que verse
// igual sin importar el tema claro/oscuro del sitio.
const NEGRO = "#0d0c0a";
const CARBON = "#14120f";
const PAPEL = "#eceae1";
const TINTA = "#15120d";
const HUMO = "#f2efe6";
const MUTAO = "#8a8577";
const GRIS = "#6f6759";
const EMBER = "#bf4d26";
const TEXTO_OSCURO = "url(/editorial/skul-street.svg) center/cover"; // textura de marca

const MONO = "'SF Mono','Menlo','Consolas',monospace"; // números/etiquetas

/* Marionetas de texto compartidas, para que las plantillas hablen el
   mismo idioma visual. */
const T = {
  o: (f) => ({ fontFamily: "'Arimo','Helvetica Neue',Arial,sans-serif", fontWeight: 700, letterSpacing: f || ".12em", textTransform: "uppercase" }),
  m: (f) => ({ fontFamily: MONO, letterSpacing: f || ".18em" }),
};

/** Cabecera común: wordmark SKUL a la izquierda, número de drop a la
 *  derecha, y una línea fina abajo. Es el mismo patrón del header de
 *  la tienda: montaje coherente, no collage. */
const Cabecera = ({ numero, dark = false }) => {
  const tinta = dark ? HUMO : TINTA;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ ...T.o("28px"), fontSize: 26, color: tinta }}>SKUL</span>
        <span style={{ ...T.m("10px"), fontSize: 12, color: dark ? MUTAO : GRIS }}>DROP Nº {numero}</span>
      </div>
      <div style={{ height: 1, background: dark ? "rgba(242,239,230,.22)" : "rgba(21,18,13,.35)", marginTop: 9 }} />
    </div>
  );
};

/** Marcas de registro (cuatro cantoneras): la firma de "material de
 *  imprenta", algo que ninguna herramienta de flyers genéricos pone. */
const Marca = ({ color = "rgba(242,239,230,.34)", tam = 16 }) => {
  const lados = [
    { top: 0, left: 0, borderTop: `1px solid ${color}`, borderLeft: `1px solid ${color}` },
    { top: 0, right: 0, borderTop: `1px solid ${color}`, borderRight: `1px solid ${color}` },
    { bottom: 0, left: 0, borderBottom: `1px solid ${color}`, borderLeft: `1px solid ${color}` },
    { bottom: 0, right: 0, borderBottom: `1px solid ${color}`, borderRight: `1px solid ${color}` },
  ];
  return (
    <div style={{ position: "absolute", inset: 13, pointerEvents: "none" }}>
      {lados.map((s, i) => <div key={i} style={{ position: "absolute", width: tam, height: tam, ...s }} />)}
    </div>
  );
};

/** La foto de la prenda, a proporción REAL: mide el ratio natural de
 *  la imagen al cargar (las fotos van de 0.67 a 0.8) y el marco
 *  adopta esa proporción con object-fit: cover. Como marco y foto
 *  comparten ratio, no recorta: la prenda entra siempre completa. */
function Foto({ src, borde, pos = "center 30%", extra }) {
  const [ratio, setRatio] = useState(null);
  const cargar = (e) => setRatio((e.currentTarget.naturalWidth || 800) / (e.currentTarget.naturalHeight || 1000));
  const r = ratio || 0.75; // 3:4 por defecto mientras carga
  return (
    <div style={{ width: "100%", aspectRatio: String(r), overflow: "hidden", background: CARBON, ...(borde || {}), ...extra }}>
      <img src={src} alt="" onLoad={cargar} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: pos }} />
    </div>
  );
}

/** El número de drop en tipografía fantasma, de fondo. */
const Fantasma = ({ numero, color = "rgba(242,239,230,.08)" }) => (
  <div style={{ position: "absolute", top: 30, right: 16, zIndex: 0, ...T.m("0px"), fontSize: 152, lineHeight: 1, color, pointerEvents: "none" }}>{numero}</div>
);

/** Bloque de precio del catálogo: lista en grande y abajo, más chico,
 *  el 10% por efectivo/transferencia (igual que las tarjetas). */
const Precio = ({ p, grande = 40, tinta = HUMO }) => {
  const transfer = p.transferPrice || Math.round((Number(p.basePrice) || 0) * 0.9);
  return (
    <div>
      <div style={{ ...T.m("3px"), fontSize: grande, color: tinta }}>{fmt(p.basePrice)}</div>
      <div style={{ ...T.o("12px"), fontSize: 12.5, color: EMBER, marginTop: 6 }}>
        EFECTIVO — 10% OFF · {fmt(transfer)}
      </div>
    </div>
  );
};

/* ─────────────────────────── 1. REPORTE ───────────────────────────────
   Informe oscuro: foto en columna + datos. La textura de marca está
   tan atenuada que el ojo la lee como atmósfera, no como fondo. */
const ReportePlantilla = ({ p, titulo, numero, precio }) => (
  <div style={{ width: DIS, height: ALT, boxSizing: "border-box", padding: 28, position: "relative", overflow: "hidden", color: HUMO, background: `linear-gradient(rgba(10,9,8,.82),rgba(10,9,8,.82)), ${TEXTO_OSCURO}` }}>
    <Marca />
    <Fantasma numero={numero} />
    <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%" }}>
      <Cabecera numero={numero} dark />
      <div style={{ display: "flex", gap: 26, alignItems: "flex-start", marginTop: 24, minHeight: 0 }}>
        <div style={{ flex: "0 0 46%", minWidth: 0 }}>
          <Foto src={p.photos[0]} borde={{ border: "1px solid rgba(242,239,230,.22)" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <span style={{ ...T.m("12px"), fontSize: 10.5, color: MUTAO }}>INFORME DE DROP</span>
          <h2 style={{ ...T.o("6px"), fontSize: 52, margin: "10px 0 0", lineHeight: 1, color: HUMO }}>{titulo}</h2>
          <p style={{ ...T.o("14px"), fontSize: 21, margin: "16px 0 0", color: HUMO, whiteSpace: "pre-line" }}>{p.name}</p>
          <p style={{ ...T.m("8px"), fontSize: 10.5, color: MUTAO, margin: "8px 0 0", whiteSpace: "pre-line" }}>
            {(p.cat || "pieza").toUpperCase()} · {(p.sizes || []).join(" / ") || "UNICA"}
          </p>
          <div style={{ flex: 1 }} />
          {precio && <Precio p={p} />}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", ...T.m("10px"), fontSize: 10, color: MUTAO, borderTop: "1px solid rgba(242,239,230,.18)", marginTop: 22, paddingTop: 12 }}>
        <span>SKUL STREETWEAR</span>
        <span>LOS TOLDOS · BUENOS AIRES</span>
      </div>
    </div>
  </div>
);

/* ─────────────────────────── 2. FICHA ─────────────────────────────────
   Hoja técnica clara: cuadrícula de papel, datos en una grilla de
   filas punteadas y la foto con marco corrido (desplazado, técnica de
   imprenta). Es la plantilla más "de estudio de diseño". */
const FichaPlantilla = ({ p, titulo, numero, precio }) => {
  const transfer = p.transferPrice || Math.round((Number(p.basePrice) || 0) * 0.9);
  const grilla = "repeating-linear-gradient(90deg, rgba(21,18,13,.09) 0 1px, transparent 1px 44px), repeating-linear-gradient(0deg, rgba(21,18,13,.07) 0 1px, transparent 1px 44px)";
  const Fila = ({ k, v, embR = false }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1px dotted rgba(21,18,13,.4)", padding: "9px 0", ...T.m("8px"), fontSize: 11.5 }}>
      <span style={{ color: GRIS }}>{k}</span>
      <span style={{ color: embR ? EMBER : TINTA, textTransform: "uppercase", textAlign: "right" }}>{v}</span>
    </div>
  );
  return (
    <div style={{ width: DIS, height: ALT, boxSizing: "border-box", padding: 28, position: "relative", overflow: "hidden", color: TINTA, background: `${PAPEL} , ${grilla}` }}>
      <Marca color="rgba(21,18,13,.30)" />
      <Fantasma numero={numero} color="rgba(21,18,13,.06)" />
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%" }}>
        <Cabecera numero={numero} />
        <div style={{ display: "flex", gap: 26, alignItems: "flex-start", marginTop: 22, minHeight: 0 }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <span style={{ ...T.m("12px"), fontSize: 10.5, color: GRIS }}>HOJA DE PIEZA</span>
            <h2 style={{ ...T.o("12px"), fontSize: 30, margin: "8px 0 14px", lineHeight: 1.05 }}>{p.name}</h2>
            <Fila k="CATEGORÍA" v={(p.cat || "pieza").toUpperCase()} />
            <Fila k="TALLES" v={(p.sizes || []).join(" / ") || "ÚNICA"} />
            <Fila k="SERIE" v={titulo} />
            <Fila k="DROP" v={numero} />
            {precio && <Fila k="PRECIO LISTA" v={fmt(p.basePrice)} />}
            {precio && <Fila k="EFECTIVO 10% OFF" v={fmt(transfer)} embR />}
            <p style={{ ...T.m("9px"), fontSize: 10, color: GRIS, margin: "14px 0 0", whiteSpace: "pre-line" }}>
              {p.composition || "MATERIAL 100% ALGODÓN PESADO"} ·{p.sizeChart ? " TALLAJE EN LA WEB" : " TALLAJE REAL"}
            </p>
          </div>
          <div style={{ flex: "0 0 56%", minWidth: 0 }}>
            <div style={{ marginLeft: 8, width: "100%" }}>
              <Foto src={p.photos[0]} borde={{ border: "1px solid " + TINTA }} extra={{ boxShadow: `0 0 0 4px ${PAPEL}, 0 0 0 5px ${TINTA}`, margin: 5 }} />
            </div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", justifyContent: "space-between", ...T.m("10px"), fontSize: 10, color: GRIS, borderTop: "1px solid rgba(21,18,13,.3)", paddingTop: 12 }}>
          <span>SKUL STREETWEAR</span>
          <span>NUESTRO REPORTE ES LA PRENDA</span>
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────── 3. DÚO ──────────────────────────────────
   Dos fotos en grilla editorial claras, sin collage ni cintas: una
   general y un "detalle" corriendo el encuadre. El titular sale por
   debajo, superpuesto a la grilla (juego tipográfico real). */
const DuoPlantilla = ({ p, titulo, numero, precio }) => (
  <div style={{ width: DIS, height: ALT, boxSizing: "border-box", padding: 28, position: "relative", overflow: "hidden", color: TINTA, background: PAPEL }}>
    <Marca color="rgba(21,18,13,.30)" />
    <Fantasma numero={numero} color="rgba(21,18,13,.06)" />
    <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%" }}>
      <Cabecera numero={numero} />
      <div style={{ display: "flex", gap: 18, alignItems: "flex-start", marginTop: 22 }}>
        <div style={{ flex: "0 0 55%", minWidth: 0 }}>
          <Foto src={p.photos[0]} borde={{ border: "1px solid " + TINTA }} />
          <p style={{ ...T.m("10px"), fontSize: 10, color: GRIS, margin: "10px 0 0" }}>01 — VISTA GENERAL</p>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Foto src={p.photos[1] || p.photos[0]} borde={{ border: "1px solid " + TINTA }} pos="center 78%" />
          <p style={{ ...T.m("10px"), fontSize: 10, color: GRIS, margin: "10px 0 0" }}>02 — DETALLE</p>
          <div style={{ width: 46, height: 4, background: EMBER, marginTop: 18 }} />
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20 }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ ...T.o("6px"), fontSize: 46, margin: 0, lineHeight: 1, whiteSpace: "nowrap" }}>{titulo}</h2>
          <p style={{ ...T.o("14px"), fontSize: 20, margin: "12px 0 0", whiteSpace: "nowrap" }}>{p.name}</p>
        </div>
        {precio && <Precio p={p} grande={32} tinta={TINTA} />}
      </div>
    </div>
  </div>
);

/* ─────────────────────────── 4. POSTER ────────────────────────────────
   Póster tipográfico oscuro: la tipografía manda (versión gigante del
   título), la foto va en columna con una pestaña ember. Cerca del
   lenguaje de los afiches de marca. */
const PosterPlantilla = ({ p, titulo, numero, precio }) => (
  <div style={{ width: DIS, height: ALT, boxSizing: "border-box", padding: 28, position: "relative", overflow: "hidden", color: HUMO, background: `linear-gradient(rgba(8,7,6,.8),rgba(8,7,6,.8)), ${TEXTO_OSCURO}` }}>
    <Marca />
    <Fantasma numero={numero} />
    <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%" }}>
      <Cabecera numero={numero} dark />
      <div style={{ display: "flex", gap: 24, marginTop: 22, alignItems: "stretch", minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <h2 style={{ ...T.o("6px"), fontSize: 64, margin: 0, lineHeight: .96, color: HUMO, whiteSpace: "pre-line" }}>{titulo}</h2>
          <div style={{ width: 42, height: 5, background: EMBER, marginTop: 22 }} />
          <p style={{ ...T.o("14px"), fontSize: 21, margin: "18px 0 0", color: HUMO }}>{p.name}</p>
          <p style={{ ...T.m("8px"), fontSize: 10.5, color: MUTAO, margin: "8px 0 0" }}>
            {(p.cat || "pieza").toUpperCase()} · {(p.sizes || []).join(" / ") || "UNICA"}
          </p>
          <div style={{ flex: 1 }} />
          {precio && <Precio p={p} />}
          <div style={{ ...T.m("10px"), fontSize: 10, color: MUTAO, marginTop: 16 }}>BUENOS AIRES / {numero}</div>
        </div>
        <div style={{ flex: "0 0 44%", minWidth: 0, position: "relative" }}>
          <Foto src={p.photos[0]} borde={{ border: "1px solid rgba(242,239,230,.25)" }} pos="center 25%" />
          <div style={{ position: "absolute", left: -10, top: 0, bottom: 12, width: 6, background: EMBER }} />
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", ...T.m("10px"), fontSize: 10, color: MUTAO, borderTop: "1px solid rgba(242,239,230,.18)", marginTop: 22, paddingTop: 12 }}>
        <span>SKUL STREETWEAR</span>
        <span>SKULLT.WEB.APP</span>
      </div>
    </div>
  </div>
);

const PLANTILLA_COMP = { report: ReportePlantilla, ficha: FichaPlantilla, duo: DuoPlantilla, poster: PosterPlantilla };

export default function FlyersTab() {
  const { products } = useProducts();
  const [productId, setProductId] = useState("");
  const [plantilla, setPlantilla] = useState("report");
  const [titulo, setTitulo] = useState("NUEVO DROP");
  const [numero, setNumero] = useState("001");
  const [precio, setPrecio] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState("");
  const [nodo, setNodo] = useState(null);

  const conFoto = (products || []).filter((p) => (p.photos || []).length > 0);
  const product = conFoto.find((p) => p.id === productId) || conFoto[0];

  const descargar = async () => {
    if (!nodo || !product) return;
    setExportando(true);
    setError("");
    try {
      // pixelRatio 2 sobre un lienzo de 540×675 = PNG de 1080×1350.
      const dataUrl = await toPng(nodo, { pixelRatio: 2 });
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
      <p style={{ fontSize: 12.5, color: "#5c5a52", margin: "-8px 0 18px", maxWidth: 700, lineHeight: 1.5 }}>
        Se exporta en 1080×1350 (historia / portada vertical). La foto se muestra a su proporción real: la prenda
        nunca se corta. Cuatro composiciones sin collage — reporte, ficha técnica con datos, dúo de fotos y póster
        tipográfico. "Dúo" usa la segunda foto de la prenda si está cargada; el precio de lista es opcional y el de
        transferencia sale debajo.
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
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {PLANTILLAS.map((pl) => (
                <button
                  key={pl.id}
                  onClick={() => setPlantilla(pl.id)}
                  className="tracked"
                  style={{
                    flex: 1, minWidth: 84, padding: "10px 8px", fontSize: 10.5, fontWeight: 700,
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
            <input value={titulo} maxLength={16} onChange={(e) => setTitulo(e.target.value)} style={{ marginTop: 6 }} />
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
                <div ref={setNodo}>{React.createElement(Plantilla, { p: product, titulo, numero, precio })}</div>
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