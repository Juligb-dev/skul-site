/**
 * ============================================================
 *  AVISO — ESTE ARCHIVO NO SE USA (y hoy no compilaría si se usara)
 * ============================================================
 *  `@imgly/background-removal` NO está en `package.json`. El build pasa
 *  igual porque Vite ni siquiera mira este archivo: nadie lo importa.
 *
 *  Para conectarlo hay que:
 *    1) `npm i @imgly/background-removal`
 *    2) importarlo con `await import()` DENTRO de la función, no arriba del
 *       todo: el paquete pesa varios MB y si queda en el import estático
 *       entra en el bundle del cliente.
 *
 *  Ojo con el nombre del archivo: es `productImage.js`, sin `i`.
 *
 *  ─────────────────────────────────────────────────────────────
 *  Qué hay abajo y por qué lo dejé
 *  ─────────────────────────────────────────────────────────────
 *  Es el código de respaldo para cuando las fotos se guardaban como
 *  texto adentro de Firestore: en esa versión el panel quita el
 *  fondo de la foto de la prenda con un modelo de IA que corre en el
 *  navegador (nada sale de la máquina del usuario), saca un color
 *  representativo para pintar el fondo de la tarjeta del producto y
 *  devuelve la imagen lista para guardar.
 *
 *  Hoy quedó sin uso porque las fotos van a Cloudinary (ver
 *  src/utils/cloudinary.js), que recorta y optimiza solo, así que
 *  quitar el fondo a mano dejó de hacer falta.
 *
 *  Si algún día lo querés usar de nuevo:
 *    - Instalar el paquete y cambiar el import de la línea siguiente
 *      por `const { removeBackground } = await import("@imgly/background-removal");`
 *      DENTRO de removeProductBackground (si queda arriba del todo,
 *      los varios MB del modelo se descargan para todo visitante).
 *    - Llamar a removeProductBackground(file) desde el /admin, con el
 *      File del <input> de la foto.
 *    - Con lo que devuelve ({ dataUrl, color }) seguir el mismo
 *      camino que hoy usa uploadToCloudinary: subir la dataUrl y
 *      guardar la secure_url y el color en el producto.
 *    - Ojo: el modelo se descarga la primera vez (~100 MB la primera,
 *      después queda en la caché del navegador), por eso conviene
 *      avisarlo en la UI.
 * ============================================================
 */
import {removeBackground} from "@imgly/background-removal";

/**
 * Convierte una imagen subida por el usuario
 * en una imagen con fondo transparente.
 *
 *  Recibe el File del <input> del admin y devuelve dos cosas: la
 *  imagen ya recortada como data URL (la foto entera codificada en
 *  base64 adentro de un string "data:image/png;base64,...") y el
 *  color representativo de la prenda.
 */
export async function removeProductBackground(file) {
  // "large" recorta mejor los bordes que el modelo por defecto
  // ("medium") — pesa más y tarda un poco más en la primera vez
  // (descarga el modelo una sola vez, después queda en caché del
  // navegador), pero esto solo corre acá en /admin, nunca en el
  // navegador de un cliente, así que vale la pena.
  const blob = await removeBackground(file, {
    model: "large",
    // PNG con calidad 1 (o sea, sin pérdida): el recorte deja bordes
    // semi-transparentes y cualquier recompresión con pérdida los
    // vuelve opacos, con el halo gris caracteristico alrededor.
    output: { format: "image/png", quality: 1 },
  });

  // Para poder medir y recortar, el navegador necesita la imagen
  // cargada como elemento <img>: primero la saco del Blob con una
  // URL temporal, la cargo, y recién ahí la revoco para no dejar la
  // memoria colgada.
  const url = URL.createObjectURL(blob);
  const img = await loadImage(url);
  URL.revokeObjectURL(url);

  // El canvas es un lienzo en memoria del que se puede leer y escribir
  // píxel a píxel. willReadFrequently avisa al navegador de que voy a
  // leer los píxeles enseguida, así lo guarda sin pasarlo por la GPU.
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  // Antes esto bajaba a 800px y comprimía como webp con pérdida
  // (calidad 0.86) porque la foto terminaba guardada como texto
  // adentro de Firestore y había que mantenerla chica. Ahora que las
  // fotos van a Cloudinary, no hace falta sacrificar calidad: dejamos
  // más resolución y exportamos como PNG (sin pérdida), que es
  // justamente lo que evita que la prenda cambie de color al
  // recomprimir los bordes semi-transparentes del recorte.
  const maxWidth = 1600;
  // Math.min con 1 es clave: si la foto ya es más chica que 1600,
  // el factor da más de 1 y la agrandaría con pérdida. Así nunca
  // escalo hacia arriba.
  const scale = Math.min(1, maxWidth / img.width);
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  // Dibujo la imagen ya escalada al tamaño del canvas: es el mismo
  // paso que hacer zoom con el tamaño de destino.
  ctx.drawImage(
    img,
    0,
    0,
    canvas.width,
    canvas.height
  );

  // El color sale del recorte ya limpio, así que los píxeles
  // transparentes no cuentan.
  const color = getDominantProductColor(canvas);

  const dataUrl = canvas.toDataURL("image/png");

  return {
    dataUrl,
    color,
  };
}

/**
 * Carga una imagen desde URL/blob.
 *
 *  Es el envoltorio clásico de Image: como onload/onerror son
 *  eventos y no promesas, los envuelvo en una Promise para poder
 *  hacer `await img = await loadImage(url)` y no seguir con un
 *  callback. Si la carga falla, se rechaza con el error del <img>.
 */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => resolve(img);
    img.onerror = reject;

    img.src = src;
  });
}


/**
 * Busca un color representativo de la prenda.
 *
 *  Ignora los píxeles transparentes y evita que los
 *  colores casi blancos/negros dominen demasiado.
 *
 *  Sirve para pintar de ese color el fondo de la tarjeta del
 *  producto en el catálogo: no es un análisis de color exacto, es un
 *  promedio que después se oscurece para que el texto blanco se lea
 *  siempre encima.
 */
function getDominantProductColor(canvas) {
  const ctx = canvas.getContext("2d", {
    willReadFrequently: true,
  });

  const { width, height } = canvas;

  // getImageData devuelve un array plano con los 4 canales de cada
  // píxel en orden R, G, B, A (rojo, verde, azul, transparencia).
  const imageData = ctx.getImageData(
    0,
    0,
    width,
    height
  );

  const data = imageData.data;

  // Acumuladores: voy sumando canal por canal para después dividir
  // por la cantidad de píxeles que sirvieron (el promedio).
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  // De a 4 posiciones porque cada píxel ocupa 4 bytes del array.
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];

    // Ignorar transparente
    // Un píxel con alpha casi 0 es del recorte, no de la prenda: si
    // lo contara, arrastraría el promedio hacia un negro sucio.
    // El umbral 90 descarta lo invisible y conserva los bordes.
    if (alpha < 90) continue;

    const rr = data[i];
    const gg = data[i + 1];
    const bb = data[i + 2];

    // Ignorar blancos extremos
    // El fondo blanco de la foto contaminaría el promedio hacia
    // el blanco. Corto solo los casi puros (245+) para no perder los
    // blancos reales de una prenda blanca.
    if (rr > 245 && gg > 245 && bb > 245) {
      continue;
    }

    r += rr;
    g += gg;
    b += bb;

    count++;
  }

  // Si no quedó ni un píxel usable (todo transparente o todo blanco),
  // devuelvo el carbón de la marca en vez de dividir por cero y
  // devolver NaN, que rompería el style del color.
  if (!count) {
    return "#292722";
  }

  r = Math.round(r / count);
  g = Math.round(g / count);
  b = Math.round(b / count);

  /*
   * Oscurecemos muchísimo el color.
   * un carbón ligeramente teñido.
   *
   * El motivo: sobre la foto de la prenda va texto en mayúsculas
   * claras. Multiplicar por 0.32 deja siempre un fondo oscuro con el
   * tinte de la prenda, sin importar que la foto haya salido clara.
   */
  r = Math.round(r * 0.32);
  g = Math.round(g * 0.32);
  b = Math.round(b * 0.32);

  return rgbToHex(r, g, b);
}


/** Convierte las tres componentes 0-255 de un color RGB en "#rrggbb",
 *  que es como los espera el CSS. El padStart(2, "0") es el detalle
 *  que importa: sin él, un canal chico como 5 daría "#5" en vez de
 *  "#05" y el color sería inválido. */
function rgbToHex(r, g, b) {
  return (
    "#" +
    [r, g, b]
      .map((value) =>
        value.toString(16).padStart(2, "0")
      )
      .join("")
  );
}
