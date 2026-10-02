import React, { useEffect, useRef } from "react";

/* ============================================================
   ANIMATED BG — fondo en canvas, corre en loop constante.
   - "ink": para la Home. Líneas de tinta fluyendo despacio +
     un resplandor que deriva lento. Se dobla un poco cerca
     del mouse.
   - "grain": para No-Restock. Grano de película + viñeta +
     brillo cálido que cambia de tono + chispas tipo brasa
     subiendo. Va en TODA la página (main), no solo el hero.
   Respeta prefers-reduced-motion (dibuja quieto, sin loop).
   ============================================================ */
/**
 * Fondo animado dibujado en canvas. Se usa en el Home (variant="ink",
 * tinta) y en No-Restock (variant="grain", grano + brasa).
 *
 * Props:
 *  - variant: "ink" | "grain". Decide qué se dibuja en cada frame. Es
 *    lo único que está en las dependencias del useEffect, así que
 *    cambiarla remonta el efecto y redibuja todo desde cero.
 *  - style: estilos inline que se fusionan al final, para poder pisar
 *    el position/inset/zIndex del canvas si el padre lo necesita.
 *
 * Decisiones que importan:
 *  - El <canvas> va absolute + inset:0 + pointerEvents:"none", o sea
 *    se estira al contenedor y NO se come los clicks del contenido que
 *    tiene arriba. Por eso escucho el mousemove en el padre y no en el
 *    canvas: si escuchara en el canvas nunca recibiría el evento.
 *  - Todo el dibujo vive en UN useEffect con requestAnimationFrame.
 *    No hay estado de React adentro del loop: guardar cada frame en un
 *    useState tiraría un render por frame y mataría el rendimiento.
 *  - prefers-reduced-motion: si el visitante pidió menos movimiento en
 *    el sistema, dibujo un solo frame y no pido otro. El
 *    efecto igual corre una vez, así el fondo no queda en blanco.
 */
export default function AnimatedBg({ variant = "ink", style = {} }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const parent = canvas.parentElement;
    // prefers-reduced-motion es la preferencia del sistema ("reducir el
    // movimiento"). La consulto una sola vez al montar: si el visitante
    // la cambia en caliente mientras mira la página, no me entero (y
    // está bien, se entera al recargar).
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf;
    // El tamaño en CSS (w/h) y el devicePixelRatio (dpr) los leen todas
    // las funciones de dibujo, por eso viven acá y no en un useState:
    // se actualizan acá y el loop los lee.
    let w = 0, h = 0, dpr = 1;

    // Guardo la posición del mouse en coordenadas del canvas, con -9999
    // como "no hay mouse adentro". Uso un número absurdo en vez de null
    // para que los cálculos con la distancia den un número gigante y no
    // reviente la tinta en ningún lado.
    const mouse = { x: -9999, y: -9999 };
    function onMove(e) {
      const r = parent.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    }
    function onLeave() { mouse.x = -9999; mouse.y = -9999; }
    if (variant === "ink") {
      // Solo la tinta reacciona al mouse. El grano de No-Restock va por
      // su cuenta, así que ahí ni registro los listeners.
      parent.addEventListener("mousemove", onMove);
      parent.addEventListener("mouseleave", onLeave);
    }

    // Las chispas de brasa viven en este array y se reciclan: cuando una
    // muere se le reasignan valores nuevos en el lugar, así nunca se crea
    // basura nueva. Coordenadas normalizadas (0 a 1) para que se adapten
    // al resize sin recalcular nada.
    let sparks = [];
    function newSpark() {
      return {
        // Arrancan abajo de la pantalla (y > 1) y suben.
        x: Math.random(), y: 1.05 + Math.random() * 0.1,
        vy: 0.00035 + Math.random() * 0.00055,
        vx: (Math.random() - 0.5) * 0.00025,
        life: 0, maxLife: 120 + Math.random() * 180,
        r: 0.8 + Math.random() * 1.8,
        // Una de cada cuatro sale clarita (blanco cálido), el resto
        // naranja brasa.
        hot: Math.random() > 0.75,
      };
    }
    function initSparks() {
      sparks = Array.from({ length: 90 }, newSpark);
    }

    // El canvas no usa width/height en CSS: el atributo width del
    // elemento es la resolución real de drawing, y lo multiplico por
    // dpr (device pixel ratio, cuántos píxeles físicos hay por píxel de
    // CSS) para que en pantallas retina no se vea borroso. Con
    // devicePixelRatio 3 lo limito a 2 porque el costo de dibujar el
    // triple de píxeles no se ve, pero sí se siente.
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = parent.clientWidth;
      h = parent.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      // Y después le digo al estilo que mida w/h CSS, así el elemento
      // ocupa el tamaño correcto en pantalla.
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      // setTransform aplica la escala dpr de una a todas las operaciones
      // de dibujo que vengan, así el resto del código puede usar
      // coordenadas en CSS y no en píxeles físicos.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (variant === "grain" && sparks.length === 0) initSparks();
    }
    resize();
    window.addEventListener("resize", resize);

        // Ruido tipo Perlin, a mano y sin librerías. Se usa para que la
    // "tinta" del Home se mueva de forma orgánica (como humo o tinta
    // difundiéndose en agua) en vez de con líneas de seno prolijas.
    // Las tablas cosTable/sinTable evitan llamar Math.cos/Math.sin en
    // cada píxel de cada frame (carísimo); se calculan una sola vez.
    function makeNoise(seed) {
      const N = 256;
      // Tablas de senos y cosenos precalculadas de 0 a 2π. El ruido
      // necesita evaluar un coseno y un seno por píxel por frame; si
      // los saco de estas tablas me ahorro las llamadas a Math, que en
      // JS son lentas. N y el "& 255" de abajo son el mismo recorte: los
      // índices dan la vuelta en 256, como el ruido original.
      const cosTable = new Float32Array(N);
      const sinTable = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const a = Math.random() * Math.PI * 2;
        cosTable[i] = Math.cos(a);
        sinTable[i] = Math.sin(a);
      }
      // dot(): producto escalar entre un ángulo al azar (sacado de las
      // tablas) y el vector desde la esquina de la celda hasta el punto
      // que estoy evaluando. Es la base del ruido de gradiente.
      function dot(ix, iy, x, y) {
        const idx = (ix * 13 + iy * 7 + seed) & 255;
        return cosTable[idx] * (x - ix) + sinTable[idx] * (y - iy);
      }
      // Suavizado: sin esto el ruido tiene escalones y se ve como una
      // grilla. Esta curva (6t⁵−15t⁴+10t³, la "quinta" de Ken Perlin)
      // deja los valores y sus derivadas continuos en el borde de cada
      // celda.
      function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
      // Ruido de gradiente 2D clásico: evalúo las 4 esquinas de la celda
      // y las interpolo dos veces, primero en x y después en y.
      return function noise(x, y) {
        const x0 = Math.floor(x), y0 = Math.floor(y), x1 = x0 + 1, y1 = y0 + 1;
        const sx = fade(x - x0), sy = fade(y - y0);
        const n0 = dot(x0, y0, x, y), n1 = dot(x1, y0, x, y);
        const ix0 = n0 + sx * (n1 - n0);
        const n2 = dot(x0, y1, x, y), n3 = dot(x1, y1, x, y);
        const ix1 = n2 + sx * (n3 - n2);
        return ix0 + sy * (ix1 - ix0);
      };
    }

    // ---- HOME: corrientes de tinta (ruido) + resplandor lento ----
    // Se dibuja en un canvas chiquito "buf" (bw x bh, bastante más
    // chico que el hero real) y después se estira sobre el canvas
    // grande con drawImage. Eso hace dos cosas: 1) evita calcular el
    // ruido píxel por píxel del hero completo (sería carísimo), y
    // 2) el estirado suaviza los bordes y le da ese aire de tinta
    // difuminada en vez de manchas duras.

    // Ahora, las variables de la animación. Éstos son los ángulos
    // acumulados entre frames, NO leen el reloj: los
    // incremento con valores fijos. Así la animación corre a la misma
    // velocidad en cualquier monitor (que puede refrescar a 60, 120 o
    // 144 Hz) y no se acelera en las pantallas rápidas.
    const inkNoise = makeNoise(11);
    let t1 = 0, orbA = Math.random() * 10;
    // El canvas chiquito donde hago el ruido.
    const inkBuf = document.createElement("canvas");
    const inkBufCtx = inkBuf.getContext("2d");
    let bw = 0, bh = 0, bufImageData = null;

    // bw/bh son las dimensiones del buffer. Divido el ancho y el alto
    // reales por 6 para que tenga pocos píxeles, con un piso de 60x40
    // para que en pantallas chicas no quede deforme.
    function resizeInkBuf() {
      bw = Math.max(60, Math.round(w / 6));
      bh = Math.max(40, Math.round(h / 6));
      inkBuf.width = bw;
      inkBuf.height = bh;
      // createImageData devuelve el array de píxeles RGBA (4 bytes por
      // píxel) vacío para escribir de una; escribirlo entero por
      // putImageData es mucho más rápido que ir pintando puntitos.
      bufImageData = inkBufCtx.createImageData(bw, bh);
    }
    resizeInkBuf();

    function drawInk() {
      // Chequeo defensivo del buffer: si el contenedor cambió (por
      // ejemplo aparece un scrollbar) lo regenero antes de escribirle.
      if (bw !== Math.max(60, Math.round(w / 6)) || bh !== Math.max(40, Math.round(h / 6))) {
        resizeInkBuf();
      }
      t1 += 0.006;

      const data = bufImageData.data;
      const scaleX = w / bw, scaleY = h / bh;
      // Doble loop sobre el buffer chico. Cada píxel pasa por:
      for (let by = 0; by < bh; by++) {
        for (let bx = 0; bx < bw; bx++) {
          // Del buffer chico a coordenadas de pantalla, así el mouse y
          // las escalas tienen sentido.
          const x = bx * scaleX, y = by * scaleY;
                    let n = inkNoise(x * 0.0026, y * 0.0026 + t1 * 8);
          // Dos capas de ruido a escala y velocidad distintas: la
          // primera da la mancha grande, la segunda los filamentos finos
          // que van al revés. Los 0.0026 y 0.006 son la frecuencia del ruido:
          // más chico, manchas más grandes.
          n += inkNoise(x * 0.006 - t1 * 3, y * 0.006) * 0.35;
          // Cerca del mouse sumo ruido: es el "se dobla un poco" del
          // comentario de cabecera. Math.hypot da la distancia al mouse.
          if (mouse.x > -9000) {
            const d = Math.hypot(x - mouse.x, y - mouse.y);
            if (d < 220) n += (1 - d / 220) * 0.4;
          }
          // El ruido viene en -1..1; lo paso a 0..1 con (n+1)/2.
          const v = (n + 1) / 2;
          // Índice del píxel dentro del buffer RGBA (4 canales).
          const idx = (by * bw + bx) * 4;
          // Tinta casi negra (21,20,18) con alfa variable: pinto el
          // ruido como transparencia sobre el papel crudo, no como
          // color. El 0.45 es el corte: por debajo no hay nada de tinta.
          data[idx] = 21; data[idx + 1] = 20; data[idx + 2] = 18;
          data[idx + 3] = v > 0.45 ? Math.min(0.68, (v - 0.45) * 1.3) * 255 : 0;
        }
      }
      // Subo el array de píxeles al canvas del buffer.
      inkBufCtx.putImageData(bufImageData, 0, 0);

      // Primero pinto el papel (241,237,228) de fondo: si no, la tinta
      // transparente de este frame se mezclaría con la del anterior.
      ctx.fillStyle = "rgba(241,237,228,1)";
      ctx.fillRect(0, 0, w, h);
      // El estirado es lo que difumina (con el suavizado prendido).
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(inkBuf, 0, 0, bw, bh, 0, 0, w, h);

      // El resplandor que deriva lento: un gradiente radial (mancha
      // circular que se desvanece del centro al borde) que orbita sin que
      // se note y además respira con el radio.
      orbA += 0.0028;
      const ox = w * (0.5 + Math.sin(orbA * 0.6) * 0.34);
      const oy = h * (0.5 + Math.cos(orbA * 0.5) * 0.34);
      const rad = 150 + Math.sin(orbA * 2) * 20;
      const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, rad);
      g.addColorStop(0, "rgba(21,20,18,0.05)");
      g.addColorStop(1, "rgba(21,20,18,0)");
      ctx.fillStyle = g;
      // beginPath + arc acotan el pintado al círculo; con fillRect
      // sólo saldría un cuadrado de gradiente.
      ctx.beginPath(); ctx.arc(ox, oy, rad, 0, Math.PI * 2); ctx.fill();
    }

    // ---- NO-RESTOCK: grano + brillo cálido + chispas ----
    let sweepA = 0;
    // drawGrain(now) recibe el timestamp que pasa requestAnimationFrame:
    // lo uso para el parpadeo de las chispas y el cambio de tono, que
    // sí deben ir a tiempo real. sweepA, en cambio, suma por frame.
    function drawGrain(now) {
      // Fondo negro total (21,20,18) en toda el área.
      ctx.fillStyle = "rgba(21,20,18,1)";
      ctx.fillRect(0, 0, w, h);

      // Barrita de luz cálida que barre la pantalla de lado, como un
      // reflejo de brasa. Va translate + rotate + gradiente lineal
      // de 520px de ancho.
      sweepA += 0.34;
      const diag = w + h * 0.6;
      const pos = (sweepA % (diag + 520)) - 260;
      // El tono del brillo va del rojo al naranja, muy despacio.
      const hueShift = (Math.sin(now * 0.0004) + 1) / 2;
      const c1 = `rgba(${190 + hueShift * 30},${60 + hueShift * 40},${50 + hueShift * 60},0.14)`;
      // save/restore guardan y restauran transform y estilos, así el
      // translate/rotate no se me filtran al resto del dibujo.
      ctx.save();
      ctx.translate(pos, 0); ctx.rotate(-0.35);
      const g = ctx.createLinearGradient(-260, 0, 260, 0);
      g.addColorStop(0, "rgba(200,80,60,0)");
      g.addColorStop(0.5, c1);
      g.addColorStop(1, "rgba(200,80,60,0)");
      ctx.fillStyle = g;
      // Relleno alto (h*3) para que al rotar cubra toda la pantalla.
      ctx.fillRect(-260, -h, 520, h * 3);
      ctx.restore();

      // Las 90 chispas: avanzo su vida y su posición; si se apagaron o
      // salieron por arriba, las reciclo en el lugar con una nueva. El
      // alpha sale del fade (muerte lenta) por el flicker (parpadeo
      // rápido): una brasa que se apaga titilando.
      sparks.forEach((s) => {
        s.life++;
        s.x += s.vx; s.y -= s.vy;
        if (s.life > s.maxLife || s.y < -0.05) Object.assign(s, newSpark());
        const fade = 1 - Math.min(1, s.life / s.maxLife);
        const flicker = 0.55 + 0.45 * Math.sin(now * 0.02 + s.x * 40);
        const alpha = fade * flicker * 0.85;
        ctx.beginPath();
        ctx.fillStyle = s.hot ? `rgba(255,225,200,${alpha})` : `rgba(224,110,80,${alpha})`;
        ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        ctx.fill();
      });

      // Grano de película: en el 0,1% de los píxeles de la pantalla tiro
      // un punto de 1x1 blanco o negro al azar, con opacidad
      // proporcional al azar. Se sortean en cada frame, así que la
      // textura hierve como la de una película vieja.
      const n = Math.floor(w * h * 0.0011);
      for (let i = 0; i < n; i++) {
        const x = Math.random() * w, y = Math.random() * h;
        const v = Math.random();
        ctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${(v - 0.5) * 0.18})` : `rgba(0,0,0,${(0.5 - v) * 0.26})`;
        ctx.fillRect(x, y, 1, 1);
      }

      // Viñeta: gradiente radial que oscurece los bordes y deja el
      // centro limpio, para que la mirada vaya al centro.
      const vg = ctx.createRadialGradient(w / 2, h * 0.3, h * 0.35, w / 2, h * 0.3, h * 1.1);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.42)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    }

    // El loop: requestAnimationFrame pide el próximo frame justo antes
    // de que la pantalla refresque, así el dibujo entra sincronizado
    // con el monitor (un bucle con setTimeout, en cambio, da tirones).
    // Si el visitante pidió menos movimiento, hago UN frame y no pido
    // otro: el fondo queda congelado pero presente.
    function loop(now) {
      if (variant === "ink") drawInk(); else drawGrain(now);
      if (!reduced) raf = requestAnimationFrame(loop);
    }
    loop(0);

    // Limpieza: al desmontar o cambiar de variant, saco los listeners
    // y cancelo el frame pendiente. Sin este cancelAnimationFrame el
    // loop seguiría dibujando sobre un canvas que ya no está en
    // pantalla (y filtrando memoria).
    return () => {
      window.removeEventListener("resize", resize);
      if (variant === "ink") {
        parent.removeEventListener("mousemove", onMove);
        parent.removeEventListener("mouseleave", onLeave);
      }
      cancelAnimationFrame(raf);
    };
  }, [variant]);

  // El canvas no lleva children: acá sólo existe para pintar. El
  // pointerEvents:"none" es lo que deja clickeables los botones y
  // links que están por arriba; el ...style final permite que el padre
  // lo repinte si necesita otra cosa.
  return (
    <canvas
      ref={canvasRef}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0, ...style }}
    />
  );
}