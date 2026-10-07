import React, { useState } from "react";
import { toPng } from "html-to-image";
import { useProducts } from "../hooks/useProducts.js";
import { fmt } from "../utils/format.js";

/* ============================================================
 *  FLYERSTAB — generador de flyers para las historias de Instagram.
 *  ------------------------------------------------------------
 *
 *  MODELO DE REFERENCIA
 *  --------------------
 *  El sistema es el del catálogo editorial streetwear que usan las
 *  marcas premium (minimal fashion / lookbook de marca): prenda
 *  monocroma sobre placa, tipografía editorial grande, un solo acento
 *  y MUCHO aire. Nada de collage, nada de elementos apilados: la
 *  contención es lo que separa a una marca de una plantilla.
 *
 *  FONDO DE LA PRENDA
 *  ------------------
 *  Las fotos de SKUL están tomadas sobre negro (fondo real, no
 *  recorte). Por eso, en vez de encerrarlas en un cuadro que choca,
 *  acá van montadas en una "placa" negra con un filete apenas visible:
 *   - tema oscuro: la placa se funde con el fondo y la prenda se ve
 *     limpia, sin borde raro;
 *   - tema claro: la placa es un panel negro deliberado sobre el papel,
 *     como una lámina impresa. La foto siempre queda integrada.
 *
 *  LA FOTO NUNCA SE CORTA: se mide el ratio natural de la imagen al
 *  cargar (`Foto`) y el marco adopta esa proporción. Y los títulos se
 *  achican solos para entrar en una sola línea (jamás se corta una
 *  letra). El nodo lleva overflow hidden: nada se sale del lienzo.
 *
 *  Cómo se exporta: nodo de 540×675 dibujado y `toPng` con pixelRatio
 *  2 → PNG de 1080×1350 (historia / portada vertical de Instagram).
 */

const DIS = 540;
const ALT = 675;
const CONTENIDO = 468; // ancho de diseño útil (540 − 2·36); base del auto-titulo

const PLANTILLAS = [
  { id: "placa", nombre: "PLACA" },
  { id: "noir", nombre: "NOIR" },
  { id: "cover", nombre: "COVER" },
  { id: "min", nombre: "MÍNIMA" },
  { id: "duo", nombre: "DÚO" },
];

const EMBER = "#bf4d26"; // acento de marca: solo precios y lo urgente
const TEMAS = {
  oscuro: {
    bg: "#0e0d0b",
    placa: "#0a0908",
    placaLinea: "rgba(244,241,234,.14)",
    tinta: "#f4f1ea",
    tenue: "#8b8376",
    linea: "rgba(244,241,234,.16)",
  },
  claro: {
    bg: "#eceae1",
    placa: "#0e0d0b", // sobre papel, la placa es un panel negro imprimido
    placaLinea: "rgba(23,19,13,.55)",
    tinta: "#17130d",
    tenue: "#6f6759",
    linea: "rgba(23,19,13,.45)",
  },
};

const MONO = "'SF Mono','Menlo','Consolas',monospace"; // solo números/piezas

const T = {
  o: (f) => ({ fontFamily: "'Arimo','Helvetica Neue',Arial,sans-serif", fontWeight: 700, letterSpacing: f || ".12em", textTransform: "uppercase" }),
  m: (f) => ({ fontFamily: MONO, letterSpacing: f || ".18em" }),
};

/** Cabecera de sistema: marca a la izquierda, número de drop a la
 *  derecha y una línea fina. Igual en todas las composiciones. */
const Cabecera = ({ numero, tema }) => (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <span style={{ ...T.o(".06em"), fontSize: 26 }}>SKUL</span>
      <span style={{ ...T.m("10px"), fontSize: 12, color: tema.tenue }}>DROP {numero}</span>
    </div>
    <div style={{ height: 1, background: tema.linea, marginTop: 9 }} />
  </div>
);

/** Pie quieto: una línea, una sola línea de texto. */
const Pie = ({ tema }) => (
  <div>
    <div style={{ borderTop: "1px solid " + tema.linea, marginTop: 26, paddingTop: 12, display: "flex", justifyContent: "space-between", ...T.m("10px"), fontSize: 9.5, color: tema.tenue }}>
      <span>SKUL STREETWEAR</span>
      <span>LOS TOLDOS · BUENOS AIRES</span>
    </div>
  </div>
);

/** La foto a proporción REAL: el ratio natural se mide al cargar y el
 *  marco lo adopta. La prenda entra siempre completa. */
function Foto({ src, pos = "center 32%" }) {
  const [ratio, setRatio] = useState(null);
  const cargar = (e) => setRatio((e.currentTarget.naturalWidth || 800) / (e.currentTarget.naturalHeight || 1000));
  const r = ratio || 0.75;
  return (
    <div style={{ width: "100%", aspectRatio: String(r), overflow: "hidden", background: "#0a0908" }}>
      <img src={src} alt="" onLoad={cargar} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: pos }} />
    </div>
  );
}

/** La "placa": la foto montada sobre negro con un filete. En oscuro se
 *  funde con el fondo; en claro es un panel negro deliberado. */
const Placa = ({ tema, src, pos, pad = 10 }) => (
  <div style={{ background: tema.placa, border: "1px solid " + tema.placaLinea, padding: pad }}>
    <Foto src={src} pos={pos} />
  </div>
);

/** Título del drop: SIEMPRE a lo ancho del lienzo (masthead), en una
 *  sola línea que se achica sola para nunca cortarse. */
const Titulo = ({ tema, children, max = 66 }) => {
  const s = String(children || "");
  const size = Math.max(34, Math.min(max, Math.floor(CONTENIDO / (Math.max(1, s.length) * 0.74))));
  return <h2 style={{ ...T.o(".05em"), fontSize: size, margin: 0, lineHeight: 1.02, color: tema.tinta, whiteSpace: "nowrap" }}>{s}</h2>;
};

/** Precio del catálogo: lista en grande en mono y el 10% por
 *  efectivo/transferencia en el acento, debajo. */
const Precio = ({ p, tema, grande = 40, alinear = "left" }) => {
  const transfer = p.transferPrice || Math.round((Number(p.basePrice) || 0) * 0.9);
  return (
    <div style={{ textAlign: alinear }}>
      <div style={{ ...T.m("3px"), fontSize: grande, color: tema.tinta, lineHeight: 1 }}>{fmt(p.basePrice)}</div>
      <div style={{ ...T.o("12px"), fontSize: 12.5, color: EMBER, marginTop: 8 }}>EFECTIVO 10% OFF — {fmt(transfer)}</div>
    </div>
  );
};

/* 1. PLACA — el catálogo editorial sobre papel: cabecera de revista
 *    (título grande a lo ancho), placa negra a la izquierda y los datos
 *    a la derecha. La más "publicación". */
const PlacaPlantilla = ({ p, titulo, numero, precio, tema }) => (
  <div style={{ width: DIS, height: ALT, boxSizing: "border-box", padding: 36, background: tema.bg, color: tema.tinta, display: "flex", flexDirection: "column", overflow: "hidden" }}>
    <Cabecera numero={numero} tema={tema} />
    <Titulo tema={tema} max={62}>{titulo}</Titulo>
    <div style={{ display: "flex", gap: 28, marginTop: 26, minHeight: 0 }}>
      <div style={{ flex: "0 0 48%", minWidth: 0 }}>
        <Placa tema={tema} src={p.photos[0]} />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <p style={{ ...T.o("14px"), fontSize: 24, margin: "2px 0 0", color: tema.tinta, lineHeight: 1.12, whiteSpace: "normal" }}>{p.name}</p>
        <p style={{ ...T.m("8px"), fontSize: 10.5, color: tema.tenue, margin: "12px 0 0" }}>
          {(p.cat || "pieza").toUpperCase()} · {(p.sizes || []).join(" / ") || "ÚNICA"}
        </p>
        <div style={{ flex: 1 }} />
        {precio && <Precio p={p} tema={tema} />}
      </div>
    </div>
    <Pie tema={tema} />
  </div>
);

/* 2. NOIR — el split oscuro: título arriba a lo ancho, datos a la
 *    izquierda y la placa abajo a la derecha. Misma lámina, dos zonas. */
const NoirPlantilla = ({ p, titulo, numero, precio, tema }) => (
  <div style={{ width: DIS, height: ALT, boxSizing: "border-box", padding: 36, background: tema.bg, color: tema.tinta, display: "flex", flexDirection: "column", overflow: "hidden" }}>
    <Cabecera numero={numero} tema={tema} />
    <Titulo tema={tema} max={66}>{titulo}</Titulo>
    <div style={{ display: "flex", gap: 28, marginTop: 24, minHeight: 0 }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <p style={{ ...T.o("14px"), fontSize: 23, margin: "2px 0 0", color: tema.tinta, lineHeight: 1.12, whiteSpace: "normal" }}>{p.name}</p>
        <p style={{ ...T.m("8px"), fontSize: 10.5, color: tema.tenue, margin: "12px 0 0" }}>
          {(p.sizes || []).join(" / ") || "ÚNICA"}
        </p>
        <div style={{ flex: 1 }} />
        {precio && <Precio p={p} tema={tema} />}
      </div>
      <div style={{ flex: "0 0 44%", minWidth: 0, alignSelf: "flex-end" }}>
        <Placa tema={tema} src={p.photos[0]} />
      </div>
    </div>
    <Pie tema={tema} />
  </div>
);

/* 3. COVER — la prenda manda: placa pegada al borde derecho (a sangre)
 *    y el título enorme arriba. Sin margen a la derecha a propósito,
 *    así la foto toca el filo del lienzo. */
const CoverPlantilla = ({ p, titulo, numero, precio, tema }) => (
  <div style={{ width: DIS, height: ALT, boxSizing: "border-box", padding: "36px 0 34px 36px", background: tema.bg, color: tema.tinta, display: "flex", flexDirection: "column", overflow: "hidden" }}>
    <div style={{ paddingRight: 36 }}>
      <Cabecera numero={numero} tema={tema} />
    </div>
    <div style={{ paddingRight: 36 }}>
      <Titulo tema={tema} max={78}>{titulo}</Titulo>
    </div>
    <div style={{ display: "flex", gap: 26, marginTop: 24, minHeight: 0 }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <p style={{ ...T.o("14px"), fontSize: 24, margin: 0, color: tema.tinta, lineHeight: 1.12, whiteSpace: "normal" }}>{p.name}</p>
        <p style={{ ...T.m("8px"), fontSize: 10.5, color: tema.tenue, margin: "12px 0 0" }}>
          {(p.cat || "pieza").toUpperCase()}
        </p>
        <div style={{ flex: 1 }} />
        {precio && <Precio p={p} tema={tema} grande={34} />}
      </div>
      <div style={{ flex: "0 0 48%", minWidth: 0 }}>
        <Placa tema={tema} src={p.photos[0]} pad={0} />
      </div>
    </div>
  </div>
);

/* 4. MÍNIMA — casi nada: título, placa al centro y precio. El resto es
 *    silencio. La que más confía en la prenda. */
const MinPlantilla = ({ p, titulo, numero, precio, tema }) => (
  <div style={{ width: DIS, height: ALT, boxSizing: "border-box", padding: 36, background: tema.bg, color: tema.tinta, display: "flex", flexDirection: "column", overflow: "hidden" }}>
    <Cabecera numero={numero} tema={tema} />
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 0, textAlign: "center" }}>
      <Titulo tema={tema} max={56}>{titulo}</Titulo>
      <div style={{ width: "48%", marginTop: 26, minWidth: 0 }}>
        <Placa tema={tema} src={p.photos[0]} pad={8} />
      </div>
      <p style={{ ...T.o("14px"), fontSize: 21, margin: "24px 0 0", color: tema.tinta }}>{p.name}</p>
      {precio && <div style={{ marginTop: 14 }}><Precio p={p} tema={tema} alinear="center" /></div>}
    </div>
  </div>
);

/* 5. DÚO — dos placas en grilla limpia (usa la 2ª foto si la prenda
 *    tiene), título a lo ancho abajo y un bottom de lookbook. */
const DuoPlantilla = ({ p, titulo, numero, precio, tema }) => (
  <div style={{ width: DIS, height: ALT, boxSizing: "border-box", padding: 36, background: tema.bg, color: tema.tinta, display: "flex", flexDirection: "column", overflow: "hidden" }}>
    <Cabecera numero={numero} tema={tema} />
    <div style={{ display: "flex", gap: 18, marginTop: 26, minHeight: 0 }}>
      <div style={{ flex: "0 0 52%", minWidth: 0 }}>
        <Placa tema={tema} src={p.photos[0]} />
      </div>
      <div style={{ flex: 1, minWidth: 0, alignSelf: "flex-end" }}>
        <Placa tema={tema} src={p.photos[1] || p.photos[0]} pos="center 75%" />
      </div>
    </div>
    <div style={{ flex: 1 }} />
    <Titulo tema={tema} max={52}>{titulo}</Titulo>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20, marginTop: 16 }}>
      <p style={{ ...T.o("14px"), fontSize: 20, margin: 0, color: tema.tinta }}>{p.name}</p>
      {precio && <Precio p={p} tema={tema} grande={30} alinear="right" />}
    </div>
    <Pie tema={tema} />
  </div>
);

const PLANTILLA_COMP = { placa: PlacaPlantilla, noir: NoirPlantilla, cover: CoverPlantilla, min: MinPlantilla, duo: DuoPlantilla };

export default function FlyersTab() {
  const { products } = useProducts();
  const [productId, setProductId] = useState("");
  const [plantilla, setPlantilla] = useState("noir");
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
        Catálogo editorial: la prenda va montada en una placa negra (su fondo real es negrura) que en oscuro se funde y
        en claro queda como lámina impresa. La foto se adapta a su proporción y los títulos nunca se cortan. Cinco
        composiciones y un toggle claro/oscuro. "Dúo" usa la segunda foto si está cargada.
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
            <input value={titulo} maxLength={14} onChange={(e) => setTitulo(e.target.value)} style={{ marginTop: 6 }} />
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