/**
 * ============================================================
 *  SUBIDA DE FOTOS A CLOUDINARY
 * ------------------------------------------------------------
 *  Qué es Cloudinary: un servicio de imágenes en la nube. Cuando le
 *  pasás un archivo te lo guarda en sus servidores y te devuelve una
 *  URL (una dirección web) que sirve la foto optimizada desde su CDN
 *  (una red de servidores repartidos que la entrega rápido).
 *
 *  Por qué lo usamos en vez de guardar la foto en Firestore: Firestore
 *  guarda documentos de texto de hasta ~1 MB, así que una foto cruda
 *  entra mal o dello. Guardando solo la URL, el catálogo carga mucho
 *  más rápido y nunca se-nos rompe el límite.
 *
 *  Qué exporta: `uploadToCloudinary`, una sola función.
 *
 *  Quién la usa: /admin, cuando cargás la foto de una prenda.
 *
 *  Qué tiene que estar configurado afuera para que ande:
 *    - CLOUDINARY_CLOUD_NAME en src/data/config.js (el nombre de tu
 *      cuenta en Cloudinary; aparece arriba a la derecha al entrar).
 *    - ORDER_NOTIFY_WORKER_URL: la URL del Cloudflare Worker, que es
 *      el que genera la firma de la subida (más abajo te explico por
 *      qué).
 *    - El API secret de Cloudinary cargado como variable privada del
 *      Worker. Ver /cloudflare-worker/README.md y /cloudinary/README.md.
 * ============================================================
 */
import { auth } from "../firebase.js";
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_CLOUD_API_KEY, ORDER_NOTIFY_WORKER_URL } from "../data/config.js";

/**
 * Sube una imagen (un File del <input> o un data URL) a Cloudinary y
 * devuelve la URL pública final (servida por el CDN de Cloudinary).
 *
 * ── Por qué ya no se sube "sin firmar" ─────────────────────────────
 *
 * La primera versión usaba un *unsigned upload preset*: el navegador
 * mandaba el archivo directo a Cloudinary con el nombre del preset y
 * nada más. El problema es que el nombre del preset está escrito en el
 * JavaScript del sitio, o sea que es público. Eso dejaba la cuenta de
 * Cloudinary abierta: cualquier persona en internet podía subir
 * archivos a nuestro nombre y gastar espacio (probado: una subida sin
 * ninguna autenticación fue aceptada).
 *
 * Ahora el navegador le pide al Cloudflare Worker una FIRMA. El
 * signature se calcula con el API secret de Cloudinary, que vive
 * únicamente como secreto del Worker y nunca sale de ahí. Además, el
 * Worker no firma a cualquiera: exige un token del admin (ver
 * uidAdmin en worker.js), así que ni siquiera con el preset firmado
 * puede subir quien no entre al panel.
 *
 * El archivo igual va directo del navegador a Cloudinary (no pasa por
 * el Worker): es más rápido y no gasta ancho de banda nuestro.
 */
export async function uploadToCloudinary(fileOrDataUrl) {
  // Chequeo de configuración: sin cloud name no se puede construir la
  // URL de la API, y sin Worker no hay quién firme la subida. Prefiero
  // cortar acá con un mensaje claro en vez de fallar más abajo con un
  // error de red que no dice nada.
  if (!CLOUDINARY_CLOUD_NAME || !ORDER_NOTIFY_WORKER_URL) {
    throw new Error("Falta configurar Cloudinary (CLOUDINARY_CLOUD_NAME en config.js).");
  }

  // 1) Token del admin. Si no hay sesión iniciada, es que se intentó
  //    subir sin estar logueado y no tiene sentido seguir.
  //    getIdToken() devuelve un JWT (un texto con tres partes separadas
  //    por puntos) que acredita quién sos; el Worker lo valida contra
  //    Firebase y solo firma para los admins.
  const usuario = auth.currentUser;
  if (!usuario) {
    throw new Error("Tu sesión venció. Volvé a entrar al panel y probá de nuevo.");
  }
  const idToken = await usuario.getIdToken();

  // 2) Pedirle la firma al Worker.
  //    El Worker contesta con: cloudName, apiKey, timestamp, folder y la
  //    firma en sí. La firma es un checksum (huella) del archivo+timestamp
  //    hecha con el API secret: sin ese secreto no se puede fabricar.
  const resFirma = await fetch(ORDER_NOTIFY_WORKER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ action: "signUpload" }),
  });

  // Si la respuesta no es JSON (por ejemplo, un 502 de Cloudflare),
  // el catch me deja un objeto vacío en vez de romper todo acá.
  const firma = await resFirma.json().catch(() => ({}));
  if (!resFirma.ok) {
    // El mensaje concreto ("no sos admin", "faltan credenciales") viene
    // del Worker; el texto de acá es el plan B.
    throw new Error(firma.error || "No se pudo autorizar la subida de la imagen.");
  }

  // 3) Subida firmada contra Cloudinary.
  //    multipart/form-data es el formato que entiende un <form> con
  //    archivos: en vez de JSON con comillas, son bloques con un
  //    nombre, una línea de separación y el contenido crudo.
  // ¿Es un video? Cloudinary guarda imágenes y videos en endpoints
  // distintos (image/upload vs video/upload): mandar un video al endpoint
  // de imagen lo hace fallar con un error raro. El MIME del File nos dice
  // de qué se trata. Un data URL (string) se toma como imagen, que es el
  // caso histórico de esta función.
  const esVideo = fileOrDataUrl?.type?.startsWith?.("video/") || false;
  // Los planes gratis de Cloudinary no aceptan archivos de video de más
  // de ~100 MB. Preferimos cortar acá con un mensaje claro antes de que
  // la subida falle a mitad de camino.
  if (esVideo && fileOrDataUrl?.size > 100 * 1024 * 1024) {
    throw new Error("El video pesa más de 100 MB. Comprimilo (por ejemplo con Handbrake o CapCut) y probá de nuevo.");
  }

  const form = new FormData();
  form.append("file", fileOrDataUrl);
  // La api_key sí es pública (se publica en todos los sitios que usan
  // Cloudinary); lo que no puede ir nunca al cliente es el API secret.
  form.append("api_key", firma.apiKey || CLOUDINARY_CLOUD_API_KEY);
  form.append("timestamp", String(firma.timestamp));
  form.append("signature", firma.signature);
  // Carpeta destino dentro de la cuenta, para no mezclarla con otras.
  form.append("folder", firma.folder);

  // La URL tiene esta forma porque el nombre de la cuenta es parte de la
  // dirección: v1_1 es la versión de la API, image/upload o video/upload
  // dicen qué tipo de archivo subimos (no que lo borramos o transformamos).
  // OJO: la firma del Worker solo cubre folder+timestamp, así que cambiar
  // el endpoint según el tipo NO invalida la firma.
  const res = await fetch(`https://api.cloudinary.com/v1_1/${firma.cloudName}/${esVideo ? "video" : "image"}/upload`, {
    method: "POST",
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `No se pudo subir el ${esVideo ? "video" : "imagen"} a Cloudinary`);
  // secure_url es la versión https; secure_http_address sería la misma
  // con certificado. Devuelvo esta porque es la que se guarda en
  // Firestore y se muestra en el <img> del catálogo.
  return data.secure_url;
}