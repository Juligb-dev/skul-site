import React, { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import SafeImg from "./SafeImg.jsx";

/* ============================================================
   CATEGORÍA STICKY (scroll-driven)
   ------------------------------------------------------------
   En vez de una grilla estática, la foto queda FIJADA a pantalla
   completa y los nombres de categoría van pasando por encima a
   medida que bajás: el contenido "sube hacia vos". La categoría
   activa se agranda y las demás se achican, y la foto de fondo
   va cambiando sola según en cuál estés.
   ============================================================ */

/**
 * Bloque de categorías del Home con scroll "clavado": la foto queda
 * fija a pantalla completa y los nombres van pasando por encima a
 * medida que bajás. La categoría activa cambia sola según hasta dónde
 * llegaste.
 *
 * Props:
 *  - categories: array de tuplas [nombreVisible, idDeCategoria,
 *    imagenFallback]. El Home arma esta lista.
 *  - images: mapa id -> URL de la foto cargada desde el panel de
 *    control. Si no hay, cae al fallback de la tupla.
 *  - goCatalog(id): al clickear un nombre. "all" abre el catálogo entero.
 *
 * Cómo funciona el scroll-driven: la <section> es N veces más alta que
 * la ventana (el height inline de abajo) y adentro hay un hijo con
 * position: sticky, que se queda pegado al viewport mientras la
 * section sigue bajando. Con sólo CSS puedo saber qué tan adentro está
 * la sección midiendo su offsetTop: de ahí salen el progress y la
 * categoría activa.
 */
export default function CategoryStory({ categories, images = {}, goCatalog }) {
  const wrapRef = useRef(null);
  // progress va de 0 a 1: cuánto de la sección ya recorrí.
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // update corre en cada scroll y en cada resize.
    const update = () => {
      const el = wrapRef.current;
      if (!el) return;
      // Alto total menos una ventana: esto es la distancia máxima que
      // se puede scrollear antes de que la sección salga de pantalla.
      const total = el.offsetHeight - window.innerHeight;
      // getBoundingClientRect().top es la distancia del borde de la
      // sección al borde de arriba del viewport: 0 cuando acaba de
      // entrar, negativa cuando ya pasó.
      const top = el.getBoundingClientRect().top;
      // -top va de 0 (arriba) a total (abajo), así que el cociente es
      // el progreso normalizado. Lo clampo entre 0 y 1 para que un
      // scroll con inercia más allá de los bordes no se salga.
      const p = total > 0 ? Math.min(1, Math.max(0, -top / total)) : 0;
      setProgress(p);
    };
    // Llamo una vez al montar, así la primera categoría ya aparece
    // activa sin esperar al primer scroll.
    update();
    // passive:true avisa al navegador que este listener no llama a
    // preventDefault, así no frena el scroll en móvil.
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const count = categories.length;
  // Qué categoría está activa: reparto el progreso en `count` tramos y
  // me quedo con el tramo. El 0.999 esquiva el borde en progress=1, que
  // sin esto daría el índice count (fuera del array).
  const active = Math.min(count - 1, Math.floor(progress * count * 0.999));

  return (
    // La section es la "pista" larga: 34vh extra por categoría, más 100vh
    // base. Esa altura es lo que hace que el hijo sticky tenga por dónde
    // clavarse mientras se lee la lista.
    <section
      className="rf-catstory"
      ref={wrapRef}
      style={{ height: `${count * 34 + 100}vh` }}
      aria-label="Categorías destacadas"
    >
      {/* El hijo sticky: se queda clavado al viewport mientras la
          section sigue bajando. */}
      <div className="rf-catstory-sticky">
        {/* Todas las fotos montadas a la vez, una encima de otra; el
            CSS hace crossfade con la clase is-active. Montarlas todas
            evita el flash de carga al cambiar de categoría. */}
        <div className="rf-catstory-bg">
          {categories.map(([name, cat, fallback], i) => (
            <SafeImg
              key={cat}
              src={images[cat]}
              fallback={fallback}
              alt=""
              className={`rf-catstory-img ${i === active ? "is-active" : ""}`}
            />
          ))}
        </div>
        {/* Velo oscuro encima de la foto para que el texto se lea. */}
        <div className="rf-catstory-shade" />

        {/* Columna de contenido sobre la foto. */}
        <div className="rf-catstory-inner">
          <div className="rf-catstory-list">
            {categories.map(([name, cat], i) => {
              // d es la distancia en posiciones respecto de la activa.
              // Ojo: hoy no lo usa nadie (el desplazamiento de abajo
              // mira isActive, no d), quedó de una versión anterior
              // que escalonaba más las lejanas. Lo dejo porque no molesta,
              // pero si tocás esto, no busques usages de d.
              const d = Math.abs(i - active);
              const isActive = i === active;
              return (
                <button
                  key={cat}
                  className={`rf-catstory-item ${isActive ? "is-active" : ""}`}
                  style={{
                      // opacity clavado en 1 a propósito: el escalado y
                      // el desvanecido los hace el CSS con la clase
                      // is-active, y pisar la opacidad acá desde el
                      // inline style le ganaría al CSS y las inactivas
                      // se verían igual de fuertes.
                      opacity: 1,

                    // La activa queda en su lugar y las demás se corren
                    // 14px a la derecha: da la sensación de que el texto
                    // activo "avanza" entre los demás.
                    transform: `translateX(${isActive ? 0 : 14}px)`,
                  }}
                  onClick={() => goCatalog(cat)}
                >
                  <span className="rf-catstory-name">{name}</span>
                  <ArrowUpRight className="rf-catstory-arrow" size={22} />
                </button>
              );
            })}
          </div>

          {/* Atajo al catálogo completo. */}
          <button className="rf-catstory-all" onClick={() => goCatalog("all")}>
            VER TODOS <ArrowUpRight size={15} />
          </button>

          {/* Indicador 1 / 2 / 3 de en qué categoría estás. aria-hidden
              porque la info ya está en el texto de arriba. */}
          <div className="rf-catstory-steps" aria-hidden="true">
            {categories.map(([name, cat], i) => (
              <span key={cat} className={i === active ? "is-active" : ""}>{i + 1}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
