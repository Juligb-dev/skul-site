import React, { useState } from "react";
import { toPng } from "html-to-image";
import { useProducts } from "../hooks/useProducts.js";
import { fmt } from "../utils/format.js";

/* ============================================================
 *  FLYERSTAB — generador de flyers para las historias de Instagram.
 *  ------------------------------------------------------------
 *
 *  Qué es: una pestaña más del panel. El dueño elige una prenda, una
 *  de las composiciones, el tema (claro u oscuro), retoca el título y
 *  el número de drop, y exporta un PNG de 1080×1350 (historia /
 *  portada vertical de Instagram) listo para postear.
 *
 *  LA REGLA DEL DISEÑO: contención. Fotos nunca torcidas ni cortadas,
 *  una sola tipografía, sin collage ni decoración encima del texto.
 *  Lo "profesional" acá es el aire y la alineación, no la cantidad de
 *  elementos. Son seis composiciones distintas entre sí (misma
 *  planta, distinta disposición) y un toggle claro/oscuro para ver
 *  cuál le queda mejor a cada prenda.
 *
 *  LA FOTO NUNCA SE CORTA: las fotos de las prendas son verticales
 *  (800×1000 a 800×1200) y en un marco horizontal object-fit: cover
 *  corta el género. Acá se mide el ratio natural de la imagen al
 *  cargar (`Foto`) y el marco adopta ESA proporción: la prenda entra
 *  completa. Por eso la foto va en una columna y no a sangre.
 *
 *  Cómo se exporta: el nodo se dibuja a 540×675 (la mitad de lo
 *  final) y `toPng` con pixelRatio 2 lo lleva a 1080×1350.
 *
 *  Qué exporta: `FlyersTab`, el componente completo de la pestaña.
 */

const DIS = 540; // ancho de diseño, en CSS px
const ALT = 675;

const PLANTILLAS = [
  { id: "centro", nombre: "CENTRO" },
  { id: "grilla", nombre: "GRILLA" },
  { id: "lateral", nombre: "LATERAL" },
  { id: "min", nombre: "MÍNIMA" },
  { id: "duo", nombre: "DÚO" },
  { id: "tipo", nombre: "TIPOGRAFÍA" },
];

// Colores de marca. El tema (claro u oscuro) vive en TEMAS y lo elige
// el dueño con un toggle para probar qué le queda mejor a la prenda.
const EMBER = "#bf4d26";
const TEMAS = {
  oscuro: {
    bg: "#0d0c0a",
    tinta: "#f2efe6",
    tenue: "#8a8577",
    linea: "rgba(242,239,230,.2)",
    foto: "rgba(242,239,230,.22)",
  },
  claro: {
    bg: "#eceae1",
    tinta: "#15120d",
    tenue: "#6f6759",
    linea: "rgba(21,18,13,.35)",
    foto: "rgba(21,18,13,.35)",
  },
};

const MONO = "'SF Mono','Menlo','Consolas',monospace"; // solo números

const T = {
  o: (f) => ({ fontFamily: "'Arimo','Helvetica Neue',Arial,sans-serif", fontWeight: 700, letterSpacing: f || ".12em", textTransform: "uppercase" }),
  m: (f) => ({ fontFamily: MONO, letterSpacing: f || ".18em" }),
};

/** Cabecera de sistema: wordmark SKUL a la izquierda, número de drop a
 *  la derecha y una línea fina. Misma en las seis composiciones, así
 *  el drop se reconoce como SKUL antes que nada. */
const Cabecera = ({ numero, tema }) => (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <span style={{ ...T.o("30px"), fontSize: 25, color: tema.tinta }}>SKUL</span>
      <span style={{ ...T.m("10px"), fontSize: 12, color: tema.tenue }}>DROP {numero}</span>
    </div>
    <div style={{ height: 1, background: tema.linea, marginTop: 9 }} />
  </div>
);

/** Pie de página quieto: una línea y una sola línea de texto. Nada más. */
const Pie = ({ tema }) => (
  <div>
    <div style={{ borderTop: "1px solid " + tema.linea, marginTop: 26, paddingTop: 12, display: "flex", justifyContent: "space-between", ...T.m("10px"), fontSize: 9.5, color: tema.tenue }}>
      <span>SKUL STREETWEAR</span>
      <span>LOS TOLDOS · BUENOS AIRES</span>
    </div>
  </div>
);

/** La foto de la prenda, a proporción REAL (ratio natural medido al
 *  cargar): la prenda entra siempre completa, sin recortes. */
function Foto({ src, borde, pos = "center 30%" }) {
  const [ratio, setRatio] = useState(null);
  const cargar = (e) => setRatio((e.currentTarget.naturalWidth || 800) / (e.currentTarget.naturalHeight || 1000));
  const r = ratio || 0.75; // 3:4 mientras carga
  return (
    <div style={{ width: "100%", aspectRatio: String(r), overflow: "hidden", background: "#15130f", ...(borde || {}) }}>
      <img src={src} alt="" onLoad={cargar} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: pos }} />
    </div>
  );
}

/** Bloque de precio del catálogo: lista en grande y, abajo, el 10% por
 *  efectivo/transferencia (igual que las tarjetas de la tienda). */
const Precio = ({ p, tema, grande = 40, alinear = "left" }) => {
  const transfer = p.transferPrice || Math.round((Number(p.basePrice) || 0) * 0.9);
  return (
    <div style={{ textAlign: alinear }}>
      <div style={{ ...T.m("4px"), fontSize: grande, color: tema.tinta, lineHeight: 1 }}>{fmt(p.basePrice)}</div>
      <div style={{ ...T.o("12px"), fontSize: 12.5, color: EMBER, marginTop: 8 }}>EFECTIVO 10% OFF — {fmt(transfer)}</div>
    </div>
  );
};

/** Título del drop: una sola línea a prueba de desbordes. */
const Titulo = ({ tema, size = 48, children }) => (
  <h2 style={{ ...T.o("6px"), fontSize: size, margin: 0, lineHeight: 1, color: tema.tinta, whiteSpace: "nowrap" }}>{children}</h2>
);

/* ─────────────────────── 1. CENTRO ────────────────────────────────────
   Todo al centro: título, foto y precio en un único eje vertical.
   La más tranquila y "de marca". */
const CentroPlantilla = ({ p, titulo, numero, precio, tema }) => (
  <div style={{ width: DIS, height: ALT, boxSizing: "border-box", padding: 36, background: tema.bg, color: tema.tinta, display: "flex", flexDirection: "column" }}>
    <Cabecera numero={numero} tema={tema} />
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 0, textAlign: "center" }}>
      <Titulo tema={tema} size={44}>{titulo}</Titulo>
      <div style={{ width: "54%", marginTop: 20, minWidth: 0 }}>
        <Foto src={p.photos[0]} borde={{ border: "1px solid " + tema.foto }} />
      </div>
      <p style={{ ...T.o("14px"), fontSize: 20, margin: "18px 0 0", color: tema.tinta }}>{p.name}</p>
      {precio && <div style={{ marginTop: 14 }}><Precio p={p} tema={tema} alinear="center" /></div>}
    </div>
  </div>
);

/* ─────────────────────── 2. GRILLA ────────────────────────────────────
   División clásica en dos columnas: foto a la izquierda, datos a la
   derecha. La composición estándar de un catálogo. */
const GrillaPlantilla = ({ p, titulo, numero, precio, tema }) => (
  <div style={{ width: DIS, height: ALT, boxSizing: "border-box", padding: 36, background: tema.bg, color: tema.tinta, display: "flex", flexDirection: "column" }}>
    <Cabecera numero={numero} tema={tema} />
    <div style={{ display: "flex", gap: 26, marginTop: 26, minHeight: 0 }}>
      <div style={{ flex: "0 0 50%", minWidth: 0 }}>
        <Foto src={p.photos[0]} borde={{ border: "1px solid " + tema.foto }} />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <Titulo tema={tema} size={46}>{titulo}</Titulo>
        <p style={{ ...T.o("14px"), fontSize: 22, margin: "16px 0 0", color: tema.tinta }}>{p.name}</p>
        <p style={{ ...T.m("8px"), fontSize: 10.5, color: tema.tenue, margin: "8px 0 0" }}>
          {(p.cat || "pieza").toUpperCase()} · {(p.sizes || []).join(" / ") || "ÚNICA"}
        </p>
        <div style={{ flex: 1 }} />
        {precio && <Precio p={p} tema={tema} />}
      </div>
    </div>
    <Pie tema={tema} />
  </div>
);

/* ─────────────────────── 3. LATERAL ───────────────────────────────────
   Asimetría editorial: el título arriba a la izquierda, la foto abajo
   a la derecha. Sin rotar nada: el desnivel lo hace el espacio. */
const LateralPlantilla = ({ p, titulo, numero, precio, tema }) => (
  <div style={{ width: DIS, height: ALT, boxSizing: "border-box", padding: 36, background: tema.bg, color: tema.tinta, display: "flex", flexDirection: "column" }}>
    <Cabecera numero={numero} tema={tema} />
    <div style={{ display: "flex", gap: 26, marginTop: 24, minHeight: 0 }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <Titulo tema={tema} size={52}>{titulo}</Titulo>
        <p style={{ ...T.o("14px"), fontSize: 22, margin: "18px 0 0", color: tema.tinta }}>{p.name}</p>
        <p style={{ ...T.m("8px"), fontSize: 10.5, color: tema.tenue, margin: "8px 0 0" }}>
          {(p.sizes || []).join(" / ") || "ÚNICA"}
        </p>
        <div style={{ flex: 1 }} />
        {precio && <Precio p={p} tema={tema} />}
      </div>
      <div style={{ flex: "0 0 46%", minWidth: 0, alignSelf: "flex-end" }}>
        <Foto src={p.photos[0]} borde={{ border: "1px solid " + tema.foto }} />
      </div>
    </div>
    <Pie tema={tema} />
  </div>
);

/* ─────────────────────── 4. MÍNIMA ────────────────────────────────────
   Lo mínimo indispensable: cabecera, foto, precio. Casi nada más.
   La foto sola ocupa el centro y el resto es aire. */
const MinPlantilla = ({ p, titulo, numero, precio, tema }) => (
  <div style={{ width: DIS, height: ALT, boxSizing: "border-box", padding: 36, background: tema.bg, color: tema.tinta, display: "flex", flexDirection: "column" }}>
    <Cabecera numero={numero} tema={tema} />
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ flex: 1 }} />
      <div style={{ width: "52%", margin: "0 auto", minWidth: 0 }}>
        <Foto src={p.photos[0]} borde={{ border: "1px solid " + tema.foto }} />
      </div>
      <div style={{ flex: 1 }} />
      <p style={{ ...T.m("10px"), fontSize: 10.5, color: tema.tenue, textAlign: "center", margin: 0 }}>{titulo} — {p.name.toUpperCase()}</p>
      {precio && <div style={{ marginTop: 14 }}><Precio p={p} tema={tema} alinear="center" /></div>}
    </div>
  </div>
);

/* ─────────────────────── 5. DÚO ───────────────────────────────────────
   Dos fotos en grilla limpia: vista general a la izquierda y un
   encuadre distinto a la derecha (usa la 2ª foto si tiene). Sin
   tijera: solo un cambio de encuadre. */
const DuoPlantilla = ({ p, titulo, numero, precio, tema }) => (
  <div style={{ width: DIS, height: ALT, boxSizing: "border-box", padding: 36, background: tema.bg, color: tema.tinta, display: "flex", flexDirection: "column" }}>
    <Cabecera numero={numero} tema={tema} />
    <div style={{ display: "flex", gap: 18, marginTop: 26, minHeight: 0 }}>
      <div style={{ flex: "0 0 55%", minWidth: 0 }}>
        <Foto src={p.photos[0]} borde={{ border: "1px solid " + tema.foto }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Foto src={p.photos[1] || p.photos[0]} borde={{ border: "1px solid " + tema.foto }} pos="center 75%" />
      </div>
    </div>
    <div style={{ flex: 1 }} />
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20 }}>
      <div style={{ minWidth: 0 }}>
        <Titulo tema={tema} size={44}>{titulo}</Titulo>
        <p style={{ ...T.o("14px"), fontSize: 20, margin: "12px 0 0", color: tema.tinta }}>{p.name}</p>
      </div>
      {precio && <Precio p={p} tema={tema} grande={32} />}
    </div>
    <Pie tema={tema} />
  </div>
);

/* ─────────────────────── 6. TIPOGRAFÍA ────────────────────────────────
   El título manda: tipografía gigante y una foto chica como
   comprobante. La composición "póster" de la serie. */
const TipoPlantilla = ({ p, titulo, numero, precio, tema }) => (
  <div style={{ width: DIS, height: ALT, boxSizing: "border-box", padding: 36, background: tema.bg, color: tema.tinta, display: "flex", flexDirection: "column" }}>
    <Cabecera numero={numero} tema={tema} />
    <div style={{ marginTop: 40, minHeight: 0 }}>
      <Titulo tema={tema} size={64}>{titulo}</Titulo>
      <p style={{ ...T.o("14px"), fontSize: 22, margin: "16px 0 0", color: tema.tinta }}>{p.name}</p>
      <p style={{ ...T.m("8px"), fontSize: 10.5, color: tema.tenue, margin: "8px 0 0" }}>
        {(p.cat || "pieza").toUpperCase()} · {(p.sizes || []).join(" / ") || "ÚNICA"}
      </p>
    </div>
    <div style={{ flex: 1 }} />
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24 }}>
      {precio && <Precio p={p} tema={tema} />}
      <div style={{ flex: "0 0 30%", minWidth: 0 }}>
        <Foto src={p.photos[1] || p.photos[0]} borde={{ border: "1px solid " + tema.foto }} pos="center 45%" />
      </div>
    </div>
    <Pie tema={tema} />
  </div>
);

const PLANTILLA_COMP = { centro: CentroPlantilla, grilla: GrillaPlantilla, lateral: LateralPlantilla, min: MinPlantilla, duo: DuoPlantilla, tipo: TipoPlantilla };

export default function FlyersTab() {
  const { products } = useProducts();
  const [productId, setProductId] = useState("");
  const [plantilla, setPlantilla] = useState("grilla");
  const [tema, setTema] = useState("oscuro");
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
  const temaAct = TEMAS[tema];

  return (
    <section>
      <p className="tracked" style={{ fontSize: 12, fontWeight: 700, marginBottom: 18 }}>
        Flyers para Instagram Drop
      </p>
      <p style={{ fontSize: 12.5, color: "#5c5a52", margin: "-8px 0 18px", maxWidth: 700, lineHeight: 1.5 }}>
        Se exporta en 1080×1350 (historia / portada vertical). Seis composiciones para elegir, con la prenda a su
        proporción real (nunca se corta) y un toggle claro/oscuro para ver qué le queda mejor. "Dúo" y "Tipografía"
        usan la segunda foto de la prenda si está cargada.
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
            <p className="tracked" style={{ fontWeight: 700, fontSize: 11.5, margin: "0 0 8px" }}>Composición</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {PLANTILLAS.map((pl) => (
                <button
                  key={pl.id}
                  onClick={() => setPlantilla(pl.id)}
                  className="tracked"
                  style={{
                    flex: 1, minWidth: 86, padding: "10px 8px", fontSize: 10.5, fontWeight: 700,
                    border: "1px solid var(--black)", background: plantilla === pl.id ? "var(--black)" : "transparent",
                    color: plantilla === pl.id ? "var(--white)" : "var(--black)", cursor: "pointer",
                  }}
                >
                  {pl.nombre}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="tracked" style={{ fontWeight: 700, fontSize: 11.5, margin: "0 0 8px" }}>Tema</p>
            <div style={{ display: "flex", gap: 8 }}>
              {Object.keys(TEMAS).map((t) => (
                <button
                  key={t}
                  onClick={() => setTema(t)}
                  className="tracked"
                  style={{
                    flex: 1, padding: "10px 8px", fontSize: 10.5, fontWeight: 700,
                    border: "1px solid var(--black)", background: tema === t ? "var(--black)" : "transparent",
                    color: tema === t ? "var(--white)" : "var(--black)", cursor: "pointer",
                  }}
                >
                  {t === "oscuro" ? "Oscuro" : "Claro"}
                </button>
              ))}
            </div>
          </div>

          <label className="tracked" style={{ fontWeight: 700, fontSize: 11.5, display: "block" }}>
            Título del flyer
            <input value={titulo} maxLength={12} onChange={(e) => setTitulo(e.target.value)} style={{ marginTop: 6 }} />
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
                <div ref={setNodo}>{React.createElement(Plantilla, { p: product, titulo, numero, precio, tema: temaAct })}</div>
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