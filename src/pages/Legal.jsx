/**
 * ============================================================================
 * PÁGINAS LEGALES E INSTITUCIONALES DE SKUL
 * ----------------------------------------------------------------------------
 * Acá viven, juntas, las ocho pantallas de texto legal que el footer muestra:
 * términos, privacidad, cookies, consentimiento de analítica, accesibilidad,
 * botón de arrepentimiento, envíos y contacto/reclamos. Más una novena
 * (cambios y devoluciones) que se exporta pero se muestra en otra ruta.
 *
 * POR QUÉ ESTÁN TODAS EN UN SOLO ARCHIVO Y NO UNA PANTALLA POR ARCHIVO:
 *   - El contenido es texto fijo: no lee nada de Firebase, no depende del
 *     carrito ni del estado global. Salvo el botón de arrepentimiento, que sí
 *     escribe en Firestore, ninguna necesita hooks ni props.
 *   - Todas comparten el mismo esqueleto (título, fecha de actualización,
 *     secciones) y los mismos datos del proveedor. Tenerlas juntas garantiza
 *     que si cambia el mail, el teléfono o el domicilio se actualicen las ocho
 *     juntas, sin que ninguna quede vieja.
 *   - La Ley 24.240 de Defensa del Consumidor y la 25.326 de Protección de
 *     Datos Personales piden que los datos del proveedor y los canales de
 *     reclamo estén publicados y al día. Al estar todo en un archivo, revisar
 *     "que los textos estén al día" es revisar un solo lugar.
 *
 * CÓMO ENTRAN AL MENÚ Y QUÉ RUTA URL CORRESPONDE A CADA UNA:
 *   El footer (src/components/Footer.jsx) llama a nav("terminos"), nav("privacidad"),
 *   etc. Eso cambia el estado `page` de StoreApp.jsx, que monta el componente
 *   correspondiente. src/utils/routes.js traduce ese estado a una URL real, para
 *   que la página se pueda compartir, recargar y que Google la indexe.
 *
 *     Componente                    Ruta URL                        Enlace del menú
 *     TerminosYCondiciones          /terminos-y-condiciones        Términos y condiciones
 *     PoliticaPrivacidad            /politica-de-privacidad        Política de privacidad
 *     PoliticaCookies               /politica-de-cookies           Política de cookies
 *     ConsentimientoAnaliticas      /consentimiento-analiticas     Consentimiento de analítica
 *     CambiosYDevolucionesLegal     /cambios-y-devoluciones        (columna Ayuda, no Legal)
 *     Envios                        /politica-de-envios            Política de envíos
 *     Arrepentimiento               /boton-de-arrepentimiento      Botón de arrepentimiento
 *     Accesibilidad                 /accesibilidad                 Accesibilidad
 *     InformacionLegal              /informacion-legal             Contacto y reclamos
 *
 *   El caso de CambiosYDevolucionesLegal es el único aparte: el footer linkea
 *   "Cambios y devoluciones" (columna Ayuda), y esa ruta la sirve una pantalla
 *   finita en src/pages/CambiosYDevoluciones.jsx que sólo re-exporta este
 *   componente, para conservar la URL /cambios-y-devoluciones que los clientes
 *   ya tienen guardada.
 *
 * SI DESDE LA CONSOLA LA REDACCIÓN LEGAL QUEDÓ VIEJA:
 *   No se arregla editando JSX ni inventándose un párrafo: los textos son
 *   declaráciones legales del negocio y tienen que firmarse así. El flujo sano
 *   es (1) revisar el texto con quien conoce del tema, (2) recién ahí editar la
 *   redacción acá, (3) subir LEGAL.fecha al mes/año nuevo (se muestra arriba y
 *   abajo de cada página) y (4) si cambió un dato del proveedor, cambiarlo en
 *   el bloque LEGAL de más abajo y en src/data/config.js, nunca duplicarlo.
 * ============================================================================
 */
import React, { useState } from "react";
// Fuente única de verdad de los datos que aparecen en los textos legales:
// mail de contacto, WhatsApp y titular/CUIT. Si cambian allá, cambian las 8 páginas.
import { CONTACT_EMAIL, WHATSAPP_NUMBER, CVU_DATA, ORDER_NOTIFY_WORKER_URL } from "../data/config.js";
// Firestore, sólo para la pantalla del botón de arrepentimiento (guarda la solicitud).
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase.js";

/* ============================================================
   DATOS DEL PROVEEDOR QUE APARECEN EN LOS TEXTOS LEGALES
   ------------------------------------------------------------
   TODO lo que tenés que completar o actualizar una sola vez está
   en este bloque. Lo que está entre corchetes [COMO ESTE] es un
   dato que todavía hay que cargar: no es un error de la web, es un
   dato que la ley pide que figure y que solo tenemos nosotros.

   Con un solo cambio: si algún día cambiás el mail, el teléfono, el
   domicilio o la fecha, se actualizan solos los 8 textos legales
   (no hay que editarlos uno por uno).
   ------------------------------------------------------------
   Ojo: hoy ya no queda ningún campo entre corchetes, están todos
   cargados. Si faltara alguno, se completa acá y no en los textos.
   ============================================================ */
const LEGAL = {
  /* Titular del negocio. SKUL es la marca (nombre comercial), pero el
     que vende y es responsable legal es Julian Gualberto, como
     persona humana. Va nombre y apellido + CUIT, no "razón social":
     esa palabra es para sociedades (S.R.L., S.A., etc.). */
  razonSocial: CVU_DATA.titular, // Julian Gualberto, desde config.js
  nombreComercial: "SKUL",
  cuit: CVU_DATA.cuit, // viene de config.js (CVU_DATA.cuit)
  domicilio: "Alem 55",
  localidad: "Los Toldos",
  provincia: "Buenos Aires",
  pais: "República Argentina",
  /* Email y WhatsApp vienen de config.js: no hace falta repetirlos acá. */
  /* Dejalo igual al de contacto salvo que quieras un mail exclusivo
     para pedidos de datos personales (recomendado, pero opcional). */
  emailPrivacidad: CONTACT_EMAIL,
  web: "https://skullt.web.app/",
  /* Fecha de la última revisión de los textos. Cambiala cada vez que
     modifiques cualquiera de las políticas. */
  fecha: "septiembre de 2026",
};

/* Convierte 5492358412562 en "+54 9 2355 41-2562" para mostrarlo. */
// Por qué existe: el número en config.js viene para armar el link de WhatsApp
// (wa.me) y no se lee bien como texto. En los textos legales el teléfono tiene
// que aparecer escrito, con el 0 delante del área, así que lo formateo una vez
// acá y lo reuso en las ocho páginas.
function waLegible(numero) {
  const d = String(numero).replace(/\D/g, "");
  const local = d.startsWith("54") ? d.slice(2) : d;
  const movil = local.startsWith("9") ? local.slice(1) : local;
  const area = movil.slice(0, 4);
  const num = movil.slice(4);
  return `+54 9 ${area} ${num.slice(0, 2)}-${num.slice(2)}`;
}

// Los tres links de contacto se calculan una sola vez. Ojo: WA_LINK usa el
// número crudo (wa.me no acepta formato legible), WA_TXT el formateado.
const WA_TXT = waLegible(WHATSAPP_NUMBER);
const WA_LINK = `https://wa.me/${WHATSAPP_NUMBER}`;
const MAILTO = `mailto:${CONTACT_EMAIL}`;

/* ------------------------------------------------------------
   Piezas de estilo (mismas que-usaba antes, para no cambiar el
   aspecto de las páginas legales).
   ------------------------------------------------------------
   Van en objetos sueltos y no en CSS porque las ocho pantallas comparten
   el mismo esqueleto: si un día hay que cambiar el ancho o el tamaño del
   título, se cambia acá y se actualizan todas. Los colores salen de
   variables CSS del tema (--grey-1, --grey-3, --black, --font-mono).
   ------------------------------------------------------------ */
const pageStyle = {
  maxWidth: 850, // ancho de columna: holgado para que el texto largo sea legible
  margin: "0 auto",
  padding: "70px 20px 100px",
};

// clamp() hace que el título crezca con la pantalla pero con techo, para que
// no quede gigante en desktop ni diminuto en mobile.
const titleStyle = {
  fontSize: "clamp(30px, 5vw, 48px)",
  margin: "0 0 8px",
};

// La fecha de última actualización: la ley de datos personales y de defensa
// del consumidor exigen poder saber cuándo se cambió el texto publicado.
const updatedStyle = {
  fontSize: 12,
  letterSpacing: ".06em",
  color: "var(--grey-3)",
  margin: "0 0 22px",
};

// Bajada del encabezado: el párrafo introductorio que va antes de las secciones.
const introStyle = {
  fontSize: 15,
  lineHeight: 1.75,
  color: "var(--grey-3)",
  marginBottom: 38,
};

// Separación entre párrafos: la más usada de todas, por eso tiene su propio objeto.
const pStyle = { margin: "0 0 12px" };

/**
 * Bloque de sección numerado: el título en mayúsculas con `tracked` (letter
 * spacing de la tipografía de títulos) y el cuerpo con el tamaño de lectura
 * cómodo. Lo uso en las ocho páginas para que el esqueleto sea idéntico y sólo
 * cambie el texto legal de adentro.
 */
function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2
        className="tracked"
        style={{
          fontSize: 14,
          margin: "0 0 10px",
          fontWeight: 700,
          textTransform: "uppercase",
        }}
      >
        {title}
      </h2>

      <div style={{ fontSize: 15, lineHeight: 1.75 }}>{children}</div>
    </section>
  );
}

/** Párrafo normal. */
// Existe sólo para no escribir `<p style={pStyle}>` veinte veces por página: los
// textos legales son todos párrafos del mismo tamaño y separados igual.
function P({ children }) {
  return <p style={pStyle}>{children}</p>;
}

/** Lista con viñetas (o con letras/números si se pasan como children). */
// `ordered` cambia la etiqueta a <ol> (numerada) para los pasos del proceso de
// compra o los plazos. El resto de listas van con viñetas.
function List({ ordered = false, children }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag style={{ margin: "0 0 12px", paddingLeft: 22, fontSize: 15, lineHeight: 1.75 }}>
      {children}
    </Tag>
  );
}

/** Datos del proveedor / canales de contacto, en bloque. */
// La ley argentina obliga a publicar un canal de contacto concreto para
// reclamos, así que lo repetimos con el mismo formato en las páginas donde
// tiene que estar (términos, arrepentimiento, accesibilidad, info legal).
// `showAddress={false}` lo uso donde el domicilio ya se يعيش.
function ContactBlock({ showAddress = true }) {
  return (
    <div
      style={{
        marginTop: 14,
        padding: "16px 18px",
        border: "1px solid var(--grey-1)",
        borderRadius: 10,
        fontSize: 14,
        lineHeight: 1.8,
      }}
    >
      <div>
        Email:{" "}
        <a href={MAILTO} style={{ textDecoration: "underline" }}>
          {CONTACT_EMAIL}
        </a>
      </div>
      <div>
        WhatsApp:{" "}
        <a href={WA_LINK} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
          {WA_TXT}
        </a>
      </div>
      {showAddress && (
        <div>
          Domicilio: {LEGAL.domicilio}, {LEGAL.localidad}, {LEGAL.provincia}, {LEGAL.pais}
        </div>
      )}
    </div>
  );
}

/**
 * Esqueleto común de las ocho páginas legales: <main>, título (h1), fecha de
 * última actualización, bajada introductoria, las secciones que le pasa cada
 * página y un pie que repite la fecha.
 * Lo separo del contenido para que el formato sea idéntico en todas y para que
 * cada pantalla sea sólo `return <LegalLayout ...>secciones</LegalLayout>`.
 * No usa estado ni props más allá del texto: es puramente presentacional.
 */
function LegalLayout({ title, intro, children }) {
  return (
    <main style={pageStyle}>
      <h1 className="display" style={titleStyle}>
        {title}
      </h1>

      <p style={updatedStyle}>Última actualización: {LEGAL.fecha}.</p>

      <p style={introStyle}>{intro}</p>

      {children}

      <div
        style={{
          borderTop: "1px solid var(--grey-1)",
          marginTop: 50,
          paddingTop: 20,
          fontSize: 12,
          color: "var(--grey-3)",
        }}
      >
        Última actualización: {LEGAL.fecha}.
      </div>
    </main>
  );
}

/* ============================================================
   1. TÉRMINOS Y CONDICIONES
   ============================================================ */
/**
 * El contrato de uso de la tienda: qué se compra, cómo se paga, cómo se
 * entrega y qué pasa si algo sale mal. Es la pantalla que más obligaciones
 * legales cumple: identificación del proveedor, información de precios, medios
 * de pago, plazo de arrepentimiento, garantía legal y legislación aplicable.
 *
 * Ruta: /terminos-y-condiciones (state `terminos`, menú footer columna Legal).
 * No usa estado ni props: es texto fijo envuelto en LegalLayout.
 * Está separada del resto de páginas porque es la más larga y la única que
 * recorre TODO el flujo comercial, de punta a punta.
 */
export function TerminosYCondiciones() {
  return (
    <LegalLayout
      title="Términos y condiciones"
      intro="Estos términos regulan el acceso, la navegación y la utilización del sitio web de SKUL, así como las operaciones de compra de productos realizadas a través de la plataforma."
    >
      {/* 1-2. Identificación del proveedor y objeto: la ley de Defensa del
          Consumidor exige identificar a quién se le compra y publicar los
          canales de contacto antes de cualquier otra cláusula. */}
      <Section title="1. Identificación del proveedor">
        <P>El sitio web es operado por:</P>
        <List>
          <li>
            Titular: <strong>{LEGAL.razonSocial}</strong>
          </li>
          <li>Nombre comercial: {LEGAL.nombreComercial}</li>
          <li>CUIT: {LEGAL.cuit}</li>
          <li>
            Domicilio: {LEGAL.domicilio}, {LEGAL.localidad}, {LEGAL.provincia}, {LEGAL.pais}
          </li>
          <li>
            Correo electrónico:{" "}
            <a href={MAILTO} style={{ textDecoration: "underline" }}>
              {CONTACT_EMAIL}
            </a>
          </li>
          <li>
            Teléfono / WhatsApp:{" "}
            <a href={WA_LINK} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
              {WA_TXT}
            </a>
          </li>
        </List>
        <P>
          En adelante, “{LEGAL.nombreComercial}”, “el proveedor”, “el vendedor” o
          “nosotros”. La información de identificación del proveedor se mantiene
          actualizada y disponible para los consumidores.
        </P>
      </Section>

      {/*
        2-4. Qué vende la tienda, cómo se informa lo que se ofrece y qué pasa si el
        stock se agota antes de confirmar. Los productos sin reposición (No-Restock,
        Tirada Única) se avisan explícitamente acá.
      */}
      <Section title="2. Objeto del sitio">
        <P>
          {LEGAL.nombreComercial} utiliza este sitio para ofrecer y comercializar
          productos de indumentaria y accesorios. A través del sitio el usuario
          puede consultar productos, talles y características, consultar
          disponibilidad, agregar productos al carrito, seleccionar modalidades de
          entrega, calcular determinados costos de envío, seleccionar un medio de
          pago disponible, realizar pedidos, consultar el estado de determinados
          pedidos y comunicarse con {LEGAL.nombreComercial}.
        </P>
        <P>
          El sitio está destinado a consumidores finales y las operaciones realizadas
          a través del mismo se encuentran sujetas a la legislación vigente de la
          República Argentina, incluyendo la normativa de defensa del consumidor,
          protección de datos personales y demás normas que resulten aplicables.
        </P>
        <P>
          Al utilizar el sitio, el usuario acepta estos Términos y Condiciones en
          aquello que resulte aplicable, sin que ninguna de sus disposiciones pueda
          interpretarse como una renuncia, limitación o reducción de derechos
          reconocidos por normas imperativas de protección al consumidor.
        </P>
        <P>
          La publicación de un producto no implica que el mismo se encuentre
          disponible indefinidamente.
        </P>
        <P>
          Los productos identificados como “No-Restock”, “Limited Pieces” o
          “Tirada Única”, o mediante expresiones similares, podrán no ser repuestos
          una vez agotado el stock.
        </P>
      </Section>

      <Section title="3. Información de los productos">
        <P>
          {LEGAL.nombreComercial} procura que las fotografías, colores,
          descripciones, materiales, talles, medidas y demás características de los
          productos sean presentados de manera clara y precisa.
        </P>
        <P>
          Las fotografías tienen finalidad ilustrativa y pueden existir diferencias
          menores en la representación de colores debido a la configuración del
          dispositivo, pantalla, navegador o condiciones de visualización utilizadas
          por el usuario.
        </P>
        <P>
          Antes de confirmar una compra, el usuario deberá verificar el producto
          seleccionado, el talle, la cantidad, el precio, la modalidad de entrega y
          demás información mostrada durante el proceso de compra.
        </P>
      </Section>

      <Section title="4. Stock y disponibilidad">
        <P>
          La disponibilidad de los productos depende del stock existente al momento
          de la compra. El sistema actualiza el stock de los productos cuando se
          registra un pedido.
        </P>
        <P>
          Si durante el proceso de compra un producto o talle deja de encontrarse
          disponible, {LEGAL.nombreComercial} podrá informar al usuario y adoptar la
          solución que corresponda conforme a la legislación aplicable.
        </P>
        <P>
          {LEGAL.nombreComercial} no garantiza la reposición de productos
          identificados como ediciones limitadas, productos sin reposición o
          productos sujetos a stock limitado.
        </P>
      </Section>

      {/*
        5-6. Información y transparencia de precios: el total y el costo de envío tienen
        que estar visibles antes de confirmar, y las promociones se rigen por las
        condiciones que se publican en cada una.
      */}
      <Section title="5. Precios">
        <P>
          Los precios publicados en el sitio se expresan en pesos argentinos, salvo
          indicación expresa en contrario.
        </P>
        <P>
          El precio final aplicable a una operación será el informado al consumidor
          antes de la confirmación de la compra. Cuando corresponda, los costos de
          envío serán informados durante el proceso de compra antes de confirmar el
          pedido.
        </P>
        <P>
          Los descuentos, promociones y cupones se aplicarán únicamente de acuerdo
          con las condiciones informadas para cada promoción.
        </P>
        <P>
          {LEGAL.nombreComercial} podrá modificar precios, promociones, descuentos,
          disponibilidad y condiciones comerciales para operaciones futuras. Las
          modificaciones de precio no afectarán las operaciones que ya hayan sido
          debidamente confirmadas, salvo que exista un error manifiesto y se actúe
          conforme a la legislación aplicable.
        </P>
        <P>
          Los precios y promociones se exhiben de conformidad con la normativa
          vigente sobre información y transparencia de precios.
        </P>
      </Section>

      <Section title="6. Promociones y cupones">
        <P>
          {LEGAL.nombreComercial} puede ofrecer cupones, descuentos o promociones
          sujetos a condiciones particulares. Las condiciones de cada promoción
          podrán establecer período de vigencia, cantidad máxima de usos, productos
          incluidos, categorías incluidas, porcentaje o monto de descuento, medios de
          pago aplicables y cualquier otra condición necesaria para su utilización.
        </P>
        <P>
          Salvo indicación expresa, los descuentos no son acumulables. El uso de un
          cupón podrá estar sujeto a disponibilidad y límite de usos.
        </P>
        <P>
          {LEGAL.nombreComercial} podrá impedir la utilización futura de un código
          cuando haya alcanzado su límite de usos o haya dejado de encontrarse
          activo. Nada de esta sección limita derechos reconocidos por la legislación
          aplicable.
        </P>
      </Section>

      {/*
        7-8. El camino del checkout. La lista numerada es el orden real de la pantalla de
        compra, y el punto 8 aclara que un pedido registrado todavía no es un pago
        acreditado cuando el medio de pago requiere confirmación.
      */}
      <Section title="7. Proceso de compra">
        <P>Para realizar una compra, el usuario deberá:</P>
        <List ordered>
          <li>Seleccionar los productos.</li>
          <li>Seleccionar el talle y, cuando corresponda, el color.</li>
          <li>Agregar los productos al carrito.</li>
          <li>Seleccionar la modalidad de entrega.</li>
          <li>Completar los datos solicitados.</li>
          <li>Seleccionar el medio de pago disponible.</li>
          <li>Revisar el resumen de la operación.</li>
          <li>Confirmar el pedido.</li>
        </List>
        <P>
          Antes de confirmar, el usuario tendrá la posibilidad de revisar los
          productos, cantidades, precios, descuentos, costos de envío y total. El
          usuario deberá proporcionar información verdadera, completa y actualizada.
        </P>
      </Section>

      <Section title="8. Confirmación del pedido">
        <P>
          La recepción técnica de un pedido no implica necesariamente que el pago haya
          sido acreditado ni que la operación se encuentre completamente
          perfeccionada cuando el medio de pago seleccionado requiera una
          confirmación posterior.
        </P>
        <P>
          Una vez registrado el pedido, {LEGAL.nombreComercial} podrá proporcionar un
          código de seguimiento o identificación. Cuando corresponda,{" "}
          {LEGAL.nombreComercial} podrá comunicarse con el comprador para verificar
          información relacionada con el pedido, el pago, la entrega o cualquier
          circunstancia necesaria para completar la operación.
        </P>
      </Section>

      {/*
        9-11. Cómo se paga. Mercado Pago procesa la tarjeta (la web nunca ve el número
        completo), y los pagos por transferencia o efectivo quedan pendientes hasta
        acreditar el comprobante.
      */}
      <Section title="9. Medios de pago">
        <P>
          {LEGAL.nombreComercial} podrá ofrecer distintos medios de pago disponibles
          a través de la plataforma y de los proveedores de servicios de pago
          habilitados para la tienda.
        </P>
        <P>
          Entre ellos podrá encontrarse Mercado Pago, incluyendo las modalidades de
          pago que dicha plataforma permita habilitar para la operación, tales como
          tarjetas de crédito, tarjetas de débito, dinero disponible en cuenta,
          cuotas u otros medios disponibles al momento de la compra.
        </P>
        <P>
          Cuando el pago se realice mediante un proveedor externo de servicios de pago,
          el procesamiento de la operación estará sujeto adicionalmente a los
          términos, condiciones, políticas de seguridad y procedimientos de dicho
          proveedor.
        </P>
        <P>
          {LEGAL.nombreComercial} no almacena directamente los datos completos de
          las tarjetas bancarias de los compradores cuando el procesamiento del
          pago se realiza mediante una plataforma de pagos que gestione dichos datos
          directamente.
        </P>
        <P>
          La disponibilidad de determinados medios de pago, cuotas, promociones,
          límites, costos financieros, condiciones de financiación y aprobación de una
          operación dependerá de la plataforma de pago, de la entidad emisora, del
          medio de pago seleccionado y de las condiciones vigentes al momento de la
          operación.
        </P>
        <P>
          Una orden de compra no se considerará abonada hasta que el sistema de pago
          correspondiente confirme la aprobación de la operación, cuando dicha
          confirmación sea necesaria para completar la compra.
        </P>
      </Section>

      <Section title="10. Transferencias bancarias">
        <P>
          Cuando el usuario seleccione transferencia bancaria, el sitio podrá mostrar
          los datos necesarios para realizarla. La operación podrá requerir el envío
          de un comprobante a {LEGAL.nombreComercial} mediante el canal informado.
        </P>
        <P>
          El pedido podrá permanecer pendiente de confirmación hasta que{" "}
          {LEGAL.nombreComercial} verifique la acreditación correspondiente.
        </P>
      </Section>

      <Section title="11. Pago en efectivo">
        <P>
          Cuando el pago en efectivo se encuentre disponible, podrá requerirse una
          cita previa en el local o showroom de {LEGAL.nombreComercial}. Las
          condiciones particulares de la promoción o descuento asociado al pago en
          efectivo serán informadas antes de confirmar el pedido.
        </P>
        <P>
          La existencia de una solicitud de pedido no implica que el producto haya
          sido entregado ni que la operación haya finalizado hasta completar las
          condiciones correspondientes.
        </P>
      </Section>

      {/*
        12-14. Entregas: modalidades, plazos y seguimiento. Los plazos son los del
        transportista y sólo estimativos; los datos mal cargados son causa de demora.
      */}
      <Section title="12. Envíos y entregas">
        <P>
          {LEGAL.nombreComercial} ofrece modalidades de entrega que pueden incluir
          retiro en {LEGAL.localidad}, envío mediante Correo Argentino y retiro en una
          sucursal de Correo Argentino cuando dicha modalidad se encuentre disponible.
        </P>
        <P>
          Las modalidades disponibles podrán variar según el destino y las
          condiciones operativas vigentes. Cuando se utilice Correo Argentino, el costo
          podrá calcularse mediante información proporcionada por su sistema de
          cotización. El costo mostrado antes de confirmar la compra será el
          correspondiente a la cotización disponible en ese momento.
        </P>
        <P>
          Los plazos de entrega informados por el transportista son estimativos y
          pueden verse afectados por circunstancias ajenas a {LEGAL.nombreComercial}.
        </P>
        <P>
          El comprador deberá proporcionar correctamente los datos necesarios para la
          entrega. Cuando la información proporcionada sea incorrecta, incompleta o
          insuficiente, podrán producirse demoras o inconvenientes en la entrega.
        </P>
      </Section>

      <Section title="13. Retiro en sucursal">
        <P>
          Cuando se seleccione retiro en una sucursal de Correo Argentino, el usuario
          deberá revisar cuidadosamente la sucursal seleccionada antes de confirmar la
          operación. La disponibilidad, horarios y condiciones de retiro dependerán del
          operador logístico.
        </P>
        <P>
          El código de seguimiento informado por {LEGAL.nombreComercial} o por el
          operador deberá conservarse para consultar el estado del envío cuando
          corresponda.
        </P>
      </Section>

      <Section title="14. Seguimiento del pedido">
        <P>
          {LEGAL.nombreComercial} puede proporcionar un código individual para
          consultar el estado de un pedido. La sección pública de seguimiento está
          diseñada para mostrar únicamente información necesaria para conocer el
          estado de la operación.
        </P>
        <P>
          El código de seguimiento debe conservarse y no compartirse innecesariamente
          con terceros. El estado informado puede depender de actualizaciones realizadas
          por el equipo de {LEGAL.nombreComercial} y, cuando corresponda, por el
          operador logístico.
        </P>
      </Section>

      {/*
        15. Remite a la política de cambios y deja asentado que una política comercial
        nunca limita los derechos por defecto o incumplimiento.
      */}
      <Section title="15. Cambios">
        <P>
          {LEGAL.nombreComercial} podrá ofrecer cambios comerciales de productos de
          acuerdo con su Política de Cambios y Devoluciones.
        </P>
        <P>
          Las condiciones comerciales para cambios por talle, preferencia o
          circunstancias similares no limitan los derechos que correspondan al
          consumidor por defectos, falta de conformidad, incumplimiento, derecho de
          arrepentimiento u otras situaciones reguladas por la legislación vigente.
        </P>
      </Section>

      {/*
        16-17. El derecho de arrepentimiento (10 días corridos desde la entrega, art. 34
        de la Ley 24.240), quién paga la devolución y las excepciones legales.
        Acá también se anuncia el botón de arrepentimiento.
      */}
      <Section title="16. Derecho de arrepentimiento">
        <P>
          Las compras realizadas a distancia se encuentran alcanzadas, cuando
          corresponda, por el derecho de arrepentimiento previsto por la legislación
          argentina. El consumidor puede revocar la aceptación dentro de los diez
          (10) días corridos contados desde la entrega del bien o desde la celebración
          del contrato, lo que ocurra último, conforme al artículo 34 de la Ley
          24.240.
        </P>
        <P>
          Este derecho no puede ser renunciado ni limitado mediante una política
          interna de {LEGAL.nombreComercial}. Los gastos de devolución correspondientes
          al ejercicio del derecho de arrepentimiento estarán a cargo del vendedor en
          los términos establecidos por la legislación aplicable.
        </P>
        <P>
          {LEGAL.nombreComercial} dispone de un mecanismo denominado BOTÓN DE
          ARREPENTIMIENTO para facilitar el ejercicio de este derecho.
        </P>
      </Section>

      <Section title="17. Excepciones al derecho de arrepentimiento">
        <P>
          El derecho de arrepentimiento se aplicará de acuerdo con las excepciones y
          condiciones previstas por la legislación vigente.
        </P>
        <P>
          Entre otras situaciones previstas legalmente, pueden existir excepciones
          relacionadas con determinados productos o servicios, productos perecederos,
          productos efectivamente utilizados o consumidos y operaciones realizadas con
          determinados fines comerciales o de reventa.
        </P>
        <P>
          Cuando una excepción legal resulte aplicable a una operación concreta,{" "}
          {LEGAL.nombreComercial} informará dicha circunstancia de manera clara.
        </P>
      </Section>

      {/*
        18-20. Garantía legal y soluciones por incumplimiento: la garantía no se acota por
        contrato y, si hay falla o producto incorrecto, se aplica lo que corresponda según
        la Ley de Defensa del Consumidor.
      */}
      <Section title="18. Garantía legal">
        <P>
          Los productos comercializados se encuentran sujetos a la garantía legal que
          corresponda conforme a la Ley 24.240 y demás normativa aplicable. En el caso
          de bienes muebles no consumibles nuevos, la garantía legal tendrá el plazo
          establecido por la legislación vigente.
        </P>
        <P>
          Nada de estos Términos y Condiciones limita los derechos derivados de la
          garantía legal.
        </P>
        <P>
          Cuando un producto presente una falla, defecto o falta de correspondencia con
          lo ofrecido, el consumidor deberá comunicarse con {LEGAL.nombreComercial} para
          gestionar la situación correspondiente.
        </P>
      </Section>

      <Section title="19. Productos defectuosos o incorrectos">
        <P>
          Si el consumidor recibe un producto defectuoso, dañado, incorrecto o
          diferente del adquirido, deberá comunicarse con {LEGAL.nombreComercial}.
          {LEGAL.nombreComercial} analizará la situación y adoptará la solución que
          corresponda conforme a la legislación vigente.
        </P>
        <P>
          Cuando corresponda una obligación legal de reparación, sustitución,
          devolución, reintegro u otra solución, se respetarán los derechos reconocidos
          al consumidor.
        </P>
      </Section>

      <Section title="20. Incumplimiento de la oferta o del contrato">
        <P>
          Cuando exista un incumplimiento imputable al proveedor respecto de la oferta
          o del contrato, se aplicarán los derechos y alternativas reconocidos por la
          Ley de Defensa del Consumidor y demás legislación aplicable.
        </P>
        <P>
          Las soluciones podrán incluir, según corresponda legalmente, exigir el
          cumplimiento, aceptar una prestación equivalente o rescindir la operación
          con restitución de lo abonado.
        </P>
      </Section>

      {/*
        21-24. Reglas de uso del sitio: propiedad intelectual, proveedores técnicos,
        falta de garantía de disponibilidad permanente y usos prohibidos.
      */}
      <Section title="21. Propiedad intelectual">
        <P>
          Los nombres, logotipos, fotografías, diseños, textos, identidad visual,
          gráficos, elementos audiovisuales, código y demás contenidos originales
          utilizados por {LEGAL.nombreComercial} son propiedad de{" "}
          {LEGAL.nombreComercial} o son utilizados legítimamente por ella.
        </P>
        <P>
          No está permitido copiar, reproducir, modificar, distribuir, publicar,
          comercializar o utilizar dichos contenidos con fines comerciales sin
          autorización previa, salvo los usos permitidos por la legislación vigente.
        </P>
      </Section>

      <Section title="22. Servicios tecnológicos de terceros">
        <P>
          Para el funcionamiento del sitio se utilizan servicios tecnológicos
          proporcionados por terceros, entre ellos: Firebase / Google, para
          infraestructura, base de datos y autenticación administrativa;
          Cloudinary, para almacenamiento y distribución de imágenes de productos;
          Cloudflare, para determinadas operaciones intermediarias; Correo Argentino,
          para determinados servicios de cotización y logística; Telegram, para
          determinadas notificaciones internas; WhatsApp, cuando el usuario decide
          utilizar dicho canal de comunicación; e Instagram, cuando el usuario accede
          voluntariamente a dicho servicio.
        </P>
        <P>
          Cada proveedor puede estar sujeto a sus propios términos y políticas. La
          información específica sobre tratamiento de datos se encuentra en la Política
          de Privacidad.
        </P>
      </Section>

      <Section title="23. Disponibilidad y funcionamiento del sitio">
        <P>
          {LEGAL.nombreComercial} procura mantener el sitio disponible y funcionando
          correctamente. Sin embargo, pueden producirse interrupciones temporales por
          tareas de mantenimiento, errores técnicos, fallas de terceros, problemas de
          conectividad, ataques informáticos, fuerza mayor u otras circunstancias.
        </P>
        <P>
          {LEGAL.nombreComercial} procurará restablecer el funcionamiento cuando
          resulte razonablemente posible.
        </P>
      </Section>

      <Section title="24. Uso prohibido">
        <P>El usuario no podrá utilizar el sitio para:</P>
{/* Los primeros cinco ítems son los que también se apoyan en las
            reglas de seguridad de Firestore: el backend los hace cumplir
            aunque alguien intente manipular el front. */}
        <List>
          <li>Realizar actividades ilícitas.</li>
          <li>Intentar acceder a áreas administrativas.</li>
          <li>Acceder a información de otros usuarios.</li>
          <li>Alterar o manipular pedidos.</li>
          <li>Modificar precios o información enviada por el navegador.</li>
          <li>Realizar ataques contra la infraestructura.</li>
          <li>Introducir código malicioso.</li>
          <li>Interferir con el funcionamiento del sitio.</li>
          <li>Utilizar vulnerabilidades para obtener beneficios indebidos.</li>
        </List>
        <P>El uso indebido podrá dar lugar a las acciones legales que correspondan.</P>
      </Section>

      {/*
        25-26. No repito los textos: renuevo a privacidad y cookies, que viven en sus
        propias páginas del footer.
      */}
      <Section title="25. Protección de datos personales">
        <P>
          El tratamiento de los datos personales se encuentra regulado por la Política
          de Privacidad de {LEGAL.nombreComercial}, en la que se detalla qué datos se
          recopilan, para qué se utilizan, qué proveedores pueden intervenir,
          durante cuánto tiempo pueden conservarse, cuáles son los derechos del
          titular y cómo solicitar acceso, rectificación, actualización o supresión.
        </P>
      </Section>

      <Section title="26. Cookies y tecnologías de almacenamiento">
        <P>
          El sitio utiliza determinadas tecnologías de almacenamiento del navegador
          para funciones técnicas, incluyendo la conservación del carrito de compras y
          determinadas preferencias temporales. El sitio no utiliza actualmente cookies
          propias destinadas a publicidad comportamental.
        </P>
        <P>La información detallada se encuentra en la Política de Cookies.</P>
      </Section>

      {/*
        27-28. Vigencia y ley aplicable: los términos pueden cambiar hacia adelante, no
        sobre compras ya hechas, y mandan las normas imperativas de protección al
        consumidor.
      */}
      <Section title="27. Modificaciones">
        <P>
          {LEGAL.nombreComercial} podrá modificar estos Términos y Condiciones cuando
          resulte necesario por cambios en sus servicios, funcionalidades, procesos,
          proveedores o legislación aplicable. La versión vigente será la publicada
          en el sitio.
        </P>
        <P>
          Las modificaciones no afectarán retroactivamente derechos derivados de
          operaciones ya perfeccionadas cuando ello se encuentre prohibido por la
          legislación vigente.
        </P>
      </Section>

      <Section title="28. Legislación aplicable">
        <P>
          Estos Términos y Condiciones se regirán por las leyes de la República
          Argentina. En las relaciones de consumo serán aplicables las normas
          imperativas de protección al consumidor, sin que una cláusula contractual
          pueda interpretarse en perjuicio de los derechos reconocidos por dichas
          normas.
        </P>
      </Section>

      {/*
        29-30. La ley pide un canal de reclamo publicado y que el comprador guarde su
        constancia (código de pedido, comprobante) por si hace falta.
      */}
      <Section title="29. Contacto y reclamos">
        <P>
          Para realizar consultas, reclamos, solicitudes de cambio, devoluciones,
          pedidos de información o ejercer derechos, el usuario podrá comunicarse
          mediante los canales informados en esta página. {LEGAL.nombreComercial}{" "}
          procurará brindar atención por esos canales durante los días y horarios
          correspondientes.
        </P>
        <ContactBlock />
      </Section>

      <Section title="30. Documentación y constancia de la operación">
        <P>
          El consumidor deberá conservar la información relacionada con su compra,
          incluyendo el código de pedido, comprobantes de pago, comunicaciones y
          cualquier otra documentación relacionada con la operación.
        </P>
        <P>
          {LEGAL.nombreComercial} conservará los registros de las operaciones durante
          el tiempo necesario para cumplir las finalidades correspondientes y las
          obligaciones legales aplicables.
        </P>
      </Section>
    </LegalLayout>
  );
}

/* ============================================================
   2. POLÍTICA DE PRIVACIDAD
   ============================================================ */
/**
 * La política de datos personales, exigida por la Ley 25.326 y su complementaria.
 * Dice qué datos junta la web (compras, contacto, newsletter, seguimiento), con
 * qué finalidad y base legal los trata, qué proveedores los ven, cuánto tiempo
 * se conservan y qué derechos tiene el titular (acceso, rectificación, supresión)
 * con sus plazos.
 *
 * Ruta: /politica-de-privacidad (state `privacidad`).
 * No usa estado ni props. Está separada de los términos porque es el documento
 * que se lee aunque la persona nunca compre: es la política de privacidad del
 * sitio, no de una venta.
 */
export function PoliticaPrivacidad() {
  return (
    <LegalLayout
      title="Política de privacidad"
      intro={
        "En SKUL respetamos la privacidad de las personas que utilizan nuestro sitio web. Esta política explica qué información puede ser tratada cuando una persona navega por el sitio, realiza una compra, consulta un pedido, se comunica con SKUL o utiliza alguna de sus funcionalidades. El tratamiento de los datos personales se realiza de acuerdo con la legislación argentina aplicable, incluyendo la Ley 25.326 de Protección de los Datos Personales y sus normas complementarias."
      }
    >
      <Section title="1. Responsable">
        <P>
          Responsable / titular: <strong>{LEGAL.razonSocial}</strong>. Nombre
          comercial: {LEGAL.nombreComercial}. CUIT: {LEGAL.cuit}.
        </P>
        <P>
          Domicilio: {LEGAL.domicilio}, {LEGAL.localidad}, {LEGAL.provincia},{" "}
          {LEGAL.pais}.
        </P>
        <P>
          Email de contacto:{" "}
          <a href={MAILTO} style={{ textDecoration: "underline" }}>
            {CONTACT_EMAIL}
          </a>
          .
        </P>
      </Section>

      {/*
        2. Inventario de datos. El principio de finalidad de la Ley 25.326 pide decir
        qué datos se guardan: compras, contacto, comunicaciones, newsletter y
        seguimiento. Aclaro que el seguimiento público no expone nombre, teléfono ni
        dirección.
      */}
      <Section title="2. Qué datos podemos tratar">
        <P>
          Dependiendo de la funcionalidad utilizada, {LEGAL.nombreComercial} puede
          tratar diferentes categorías de información.
        </P>

        <P>
          <strong>2.1. Datos de compra.</strong> Cuando una persona realiza un pedido, el
          sistema puede registrar:
        </P>
        <List>
          <li>Nombre y apellido.</li>
          <li>Número de teléfono.</li>
          <li>Dirección de entrega, cuando se selecciona envío a domicilio.</li>
          <li>Productos adquiridos, talle y color cuando corresponda.</li>
          <li>Cantidad y precio de cada producto.</li>
          <li>Subtotal, descuentos y código de cupón utilizado.</li>
          <li>Modalidad de entrega y costo de envío.</li>
          <li>Información de cotización de envío.</li>
          <li>Código postal y provincia.</li>
          <li>Sucursal seleccionada, cuando corresponda.</li>
          <li>Medio de pago seleccionado e importe total.</li>
          <li>Estado del pedido y fecha de creación.</li>
          <li>Código de seguimiento de Correo Argentino, cuando corresponda.</li>
        </List>

        <P>
          <strong>2.2. Datos de contacto.</strong> Cuando una persona utiliza el
          formulario de contacto del sitio puede proporcionar su nombre y el contenido
          de su consulta. Actualmente el formulario de contacto abre WhatsApp con el
          mensaje preparado para que el usuario lo envíe, y el usuario decide
          voluntariamente si desea enviarlo. Una vez enviado a través de WhatsApp, el
          tratamiento de esa información también queda sujeto a las políticas y
          condiciones de WhatsApp y de su operador.
        </P>

        <P>
          <strong>2.3. Datos de comunicación.</strong> {LEGAL.nombreComercial} puede
          recibir información que una persona proporcione voluntariamente al
          comunicarse por WhatsApp, correo electrónico, Instagram u otros canales
          oficiales que se habiliten. El contenido de dichas comunicaciones puede
          utilizarse para responder consultas, gestionar reclamos, coordinar compras,
          gestionar cambios, devoluciones, pagos, entregas o cualquier otra solicitud
          realizada por el usuario.
        </P>

        <P>
          <strong>2.4. Datos del newsletter.</strong> Cuando una persona se suscribe
          al newsletter desde el pie de página, se registra únicamente su correo
          electrónico, la constancia de que marcó la casilla de consentimiento, la
          sección del sitio desde la que se suscribió y la fecha de la suscripción.
          No se almacenan con esa suscripción datos de compras, pagos ni otros datos
          personales.
        </P>

        <P>
          <strong>2.5. Datos del seguimiento del pedido.</strong> Se utiliza una
          colección específica para permitir el seguimiento público de determinados
          pedidos. Esta sección está diseñada para no publicar datos personales como
          nombre, teléfono, dirección, información de pago o cupón utilizado.
        </P>
        <P>
          El seguimiento puede mostrar la información necesaria para conocer el estado
          de la operación, incluyendo determinados productos, importes, estado,
          modalidad de entrega y código de seguimiento logístico cuando corresponda.
        </P>
        <P>
          El código de seguimiento debe tratarse como información personal de carácter
          práctico y no debería compartirse públicamente.
        </P>
      </Section>

      {/*
        3-4. Para qué se usan y con qué base legal: contrato, obligación legal,
        interés legítimo y consentimiento. La diferencia importa: el newsletter es el
        único tratamiento que necesita consentimiento expreso.
      */}
      <Section title="3. Finalidades del tratamiento">
        <P>Los datos personales podrán utilizarse para:</P>
        {/* Las letras van dentro del <li> y no como `ordered`: el listado es
            alfabético (a..r) y la lista de bases legales de abajo vuelve a
            numerar desde a, para poder referenciar "la base c" sin ambigüedad. */}
        <List>
          <li>a. Registrar y gestionar pedidos.</li>
          <li>b. Procesar y administrar compras.</li>
          <li>c. Gestionar la disponibilidad y el stock.</li>
          <li>d. Coordinar pagos.</li>
          <li>e. Coordinar envíos.</li>
          <li>f. Calcular costos de envío.</li>
          <li>g. Seleccionar sucursales de entrega.</li>
          <li>h. Comunicarnos con el comprador.</li>
          <li>i. Gestionar cambios y devoluciones.</li>
          <li>j. Gestionar solicitudes de arrepentimiento.</li>
          <li>k. Atender consultas y reclamos.</li>
          <li>l. Gestionar cupones y promociones.</li>
          <li>m. Prevenir usos fraudulentos o abusivos.</li>
          <li>n. Mantener la seguridad del sitio.</li>
          <li>o. Mantener registros comerciales y administrativos.</li>
          <li>p. Cumplir obligaciones legales.</li>
          <li>q. Ejercer o defender derechos cuando resulte necesario.</li>
          <li>r. Enviar comunicaciones comerciales (novedades, lanzamientos y promociones)
            únicamente a quienes lo aceptaron suscribiéndose al newsletter.</li>
        </List>
      </Section>

      <Section title="4. Base del tratamiento">
        <P>Los datos pueden ser tratados cuando resulten necesarios para:</P>
        <List>
          <li>Ejecutar una compra solicitada por el usuario.</li>
          <li>Cumplir obligaciones legales.</li>
          <li>Atender una solicitud realizada voluntariamente.</li>
          <li>Proteger la seguridad del sitio.</li>
          <li>Ejercer o defender derechos.</li>
          <li>
            Enviar comunicaciones comerciales: en el caso del newsletter, la base es
            el <strong>consentimiento</strong> que la persona marca de forma expresa
            al suscribirse, y que puede retirar cuando quiera.
          </li>
          <li>Cumplir otra base legal válida conforme a la legislación aplicable.</li>
        </List>
        <P>
          Cuando una finalidad requiera consentimiento, éste será solicitado mediante un
          mecanismo adecuado y podrá ser retirado posteriormente.
        </P>
      </Section>

      {/*
        5. Aviso de datos obligatorios: sin nombre o medio de contacto no se puede
        cerrar ni coordinar el pedido.
      */}
      <Section title="5. Datos necesarios para comprar">
        <P>
          Determinados datos son necesarios para procesar una compra: sin un nombre y
          un medio de contacto adecuados puede resultar imposible coordinar el pedido.
        </P>
        <P>
          Cuando el usuario selecciona envío a domicilio, será necesario proporcionar
          los datos de dirección requeridos para realizar la entrega. Cuando
          selecciona retiro en sucursal, pueden requerirse los datos necesarios para
          identificar y cotizar la modalidad correspondiente.
        </P>
        <P>
          La negativa a proporcionar los datos necesarios puede impedir que{" "}
          {LEGAL.nombreComercial} complete una operación.
        </P>
      </Section>

      {/*
        6. Mapa de transferencias: qué dato va a qué proveedor. Está escrito con el
        proyecto real encima (Firebase, Cloudinary, Cloudflare, Correo Argentino,
        Telegram, WhatsApp, Instagram).
      */}
      <Section title="6. Proveedores y terceros">
        <P>
          {LEGAL.nombreComercial} utiliza determinados proveedores tecnológicos y
          comerciales para prestar sus servicios.
        </P>

        <P>
          <strong>6.1. Firebase / Google.</strong> Se utiliza para determinadas
          funciones de infraestructura, base de datos y autenticación administrativa.
          Los datos de pedidos y otros registros necesarios para el funcionamiento de
          la tienda pueden almacenarse en Firebase / Google Cloud. La autenticación de
          Firebase se utiliza para restringir el acceso al panel administrativo.
        </P>

        <P>
          <strong>6.2. Cloudinary.</strong> Se utiliza para almacenar y entregar
          imágenes de productos. Las imágenes de los productos son enviadas a
          Cloudinary mediante su servicio de carga y posteriormente servidas desde su
          infraestructura. Cloudinary no es utilizado actualmente como sistema de
          almacenamiento de los datos personales del comprador.
        </P>

        <P>
          <strong>6.3. Cloudflare.</strong> Se utiliza infraestructura de Cloudflare
          para determinadas operaciones técnicas. Actualmente existe un Worker
          encargado de realizar determinadas operaciones relacionadas con envíos y
          notificaciones, que puede recibir datos técnicos y los parámetros necesarios
          para ejecutar esas operaciones.
        </P>

        <P>
          <strong>6.4. Correo Argentino.</strong> Cuando el usuario selecciona una
          modalidad de envío mediante Correo Argentino, el sitio puede enviar los datos
          necesarios para realizar la cotización o consultar sucursales. Entre estos
          datos pueden encontrarse código postal, provincia, peso del pedido y los
          parámetros necesarios para la cotización. Cuando corresponda, la información
          del envío también puede quedar asociada al pedido almacenado.
        </P>

        <P>
          <strong>6.5. Telegram.</strong> Se utiliza para determinadas notificaciones
          internas de pedidos. Una vez creado un pedido, el sistema puede enviar al
          canal interno información necesaria para gestionar la operación, que puede
          incluir nombre del comprador, teléfono, dirección cuando corresponda,
          productos, cantidades, precios, descuentos, envío, total, medio de pago y
          modalidad de entrega. Telegram se utiliza como canal interno de notificación
          y no como plataforma pública de seguimiento del pedido.
        </P>

        <P>
          <strong>6.6. WhatsApp.</strong> Puede utilizarse cuando el usuario decide
          comunicarse voluntariamente, por ejemplo para enviar comprobantes, coordinar
          una cita, realizar consultas, solicitar cambios o comunicarse con atención al
          cliente. Una vez que la información es enviada a WhatsApp, su tratamiento
          queda también sujeto a las políticas de WhatsApp y del proveedor
          correspondiente.
        </P>

        <P>
          <strong>6.7. Instagram.</strong> El sitio incluye enlaces hacia Instagram. El
          acceso es voluntario y, una vez que el usuario abandona el sitio y accede al
          servicio externo, queda sujeto a las políticas y condiciones de Instagram.
        </P>
      </Section>

      {/*
        7-9. Terceros, transferencias internacionales (hay que declararlas) y medidas
        de seguridad: controles de acceso al panel y reglas en Firestore.
      */}
      <Section title="7. Transferencia o acceso por terceros">
        <P>
          Los proveedores mencionados podrán acceder o recibir información cuando ello
          sea necesario para prestar el servicio correspondiente.{" "}
          {LEGAL.nombreComercial} procurará limitar la información compartida a
          aquella necesaria para cada finalidad.
        </P>
        <P>
          Cuando corresponda, el tratamiento por parte de terceros se regirá además por
          sus propios términos, condiciones y políticas de privacidad.
        </P>
      </Section>

      <Section title="8. Transferencias internacionales">
        <P>
          Algunos proveedores tecnológicos utilizados pueden operar infraestructura,
          servidores o servicios ubicados fuera de la República Argentina.
        </P>
        <P>
          Cuando el tratamiento implique una transferencia internacional de datos
          personales, se procurará realizarla de acuerdo con las condiciones y
          garantías exigidas por la legislación aplicable. Los proveedores tecnológicos
          podrán estar sujetos además a sus propios mecanismos legales de transferencia
          y protección de datos.
        </P>
      </Section>

      <Section title="9. Seguridad">
        <P>
          {LEGAL.nombreComercial} adopta medidas técnicas y organizativas razonables
          destinadas a proteger los datos personales frente a acceso, modificación,
          pérdida, divulgación o tratamiento no autorizado.
        </P>
        <P>
          Entre las medidas implementadas se encuentran controles de acceso al panel
          administrativo y reglas de seguridad en la base de datos. Sin embargo,
          ningún sistema conectado a Internet puede garantizar seguridad absoluta.
        </P>
      </Section>

      {/*
        10-11. Quién ve qué y cuánto tiempo se guarda: el panel con pedidos es privado
        y la conservación responde a fines y obligaciones legales.
      */}
      <Section title="10. Acceso administrativo">
        <P>
          El panel administrativo del sitio se encuentra protegido mediante
          autenticación. El acceso a la información privada de pedidos está destinado
          exclusivamente al personal autorizado.
        </P>
        <P>Los usuarios generales no necesitan crear una cuenta para comprar.</P>
      </Section>

      <Section title="11. Conservación de datos">
        <P>Los datos personales serán conservados durante el tiempo necesario para:</P>
        <List>
          <li>Cumplir las finalidades para las cuales fueron obtenidos.</li>
          <li>Gestionar operaciones.</li>
          <li>Cumplir obligaciones contables, fiscales o legales.</li>
          <li>Resolver reclamos.</li>
          <li>Ejercer o defender derechos.</li>
          <li>Mantener los registros necesarios de las operaciones.</li>
        </List>
        <P>
          Cuando los datos ya no sean necesarios y no exista obligación legal de
          conservarlos, podrán eliminarse, anonimizarse o tratarse de acuerdo con la
          legislación aplicable.
        </P>
      </Section>

      {/*
        12-14. Derechos ARPET (libre acceso a los datos), plazos de respuesta (10 y 5
        días hábiles) y la AAIP como autoridad de control donde reclamar.
      */}
      <Section title="12. Derechos del titular">
        <P>
          El titular de los datos puede ejercer los derechos reconocidos por la Ley
          25.326 y demás normativa aplicable, entre ellos: solicitar información sobre
          la existencia de datos personales, solicitar acceso a los datos, solicitar
          rectificación, solicitar actualización, solicitar supresión cuando corresponda
          y solicitar confidencialidad en los casos previstos por la legislación.
        </P>
        <P>
          Las solicitudes podrán enviarse a{" "}
          <a href={`mailto:${LEGAL.emailPrivacidad}`} style={{ textDecoration: "underline" }}>
            {LEGAL.emailPrivacidad}
          </a>
          . El ejercicio de estos derechos podrá requerir la acreditación de identidad
          cuando corresponda.
        </P>
      </Section>

      <Section title="13. Plazos de respuesta">
        <P>
          Las solicitudes serán atendidas dentro de los plazos establecidos por la
          legislación aplicable. En particular, la Ley 25.326 contempla un plazo de
          diez (10) días corridos para responder solicitudes de acceso y un plazo de
          cinco (5) días hábiles para solicitudes de rectificación, actualización o
          supresión, cuando corresponda.
        </P>
      </Section>

      <Section title="14. Reclamos ante la autoridad de control">
        <P>
          La Agencia de Acceso a la Información Pública es la autoridad de control
          nacional en materia de protección de datos personales. El titular podrá
          recurrir a los mecanismos de reclamo previstos por la legislación si
          considera que sus derechos no fueron respetados.
        </P>
      </Section>

      {/*
        15. Newsletter: consentimiento previo, informado y revocable; la baja se
        efectúa dentro de los 5 días hábiles.
      */}
      <Section title="15. Comunicaciones comerciales y newsletter">
        <P>
          El sitio ofrece un formulario de suscripción al newsletter en el pie de
          página. Al completarlo, el usuario marca voluntariamente una casilla
         ifestando que desea recibir novedades, lanzamientos y promociones de SKUL.
          Ese consentimiento es específico, informado, previo y revocable en
          cualquier momento, como exige la Ley 25.326 de Protección de los Datos
          Personales.
        </P>
        <P>
          Los datos que se almacenan con esa suscripción son únicamente: el
          correo electrónico, la constancia del consentimiento, la sección del
          sitio desde la que se suscribió y la fecha de la suscripción. No se
          almacenan con ella datos de pedidos, pagos ni otros datos personales.
        </P>
        <P>
          El consentimiento no es condición para comprar ni para navegar el sitio,
          y no implica que se ofrezcan precios o condiciones diferentes entre
          suscriptos y no suscriptos. La lista de suscriptores no se vende, cede
          ni comparte con terceros con fines ajenos al envío de las comunicaciones
          descriptas.
        </P>
        <P>
          Para dejar de recibir comunicaciones comerciales, el usuario puede
          darse de baja desde el enlace incluido en cada correo o solicitarlo por
          correo electrónico o por WhatsApp al contacto indicado en esta política.
          La baja se efectúa dentro de los cinco (5) días hábiles de la solicitud.
        </P>
      </Section>

      {/* 16-17. Menores de edad y cambios en la política. */}
      <Section title="16. Menores de edad">
        <P>
          El sitio está destinado a consumidores y usuarios capaces de realizar
          operaciones conforme a la legislación aplicable. No se solicitan
          deliberadamente datos personales de menores de edad para finalidades
          comerciales que no resulten legalmente permitidas.
        </P>
        <P>
          Si un representante legal considera que un menor proporcionó datos personales
          de manera indebida, podrá comunicarse con {LEGAL.nombreComercial} mediante{" "}
          <a href={MAILTO} style={{ textDecoration: "underline" }}>
            {CONTACT_EMAIL}
          </a>
          .
        </P>
      </Section>

      <Section title="17. Cambios en esta política">
        <P>
          {LEGAL.nombreComercial} podrá actualizar esta Política de Privacidad cuando
          resulte necesario debido a cambios en el sitio, la incorporación de nuevos
          servicios, la modificación de proveedores o cambios normativos. La versión
          vigente será publicada en esta página.
        </P>
      </Section>
    </LegalLayout>
  );
}

/* ============================================================
   3. POLÍTICA DE COOKIES Y TECNOLOGÍAS DE ALMACENAMIENTO
   ============================================================ */
/**
 * Qué tecnologías de almacenamiento usa el navegador del visitante.
 * Hoy el sitio no instala cookies de publicidad comportamental: sólo usa
 * localStorage (carrito) y sessionStorage (primera visita), que son funciones
 * esenciales y por eso no piden consentimiento.
 *
 * Ruta: /politica-de-cookies (state `cookies`).
 * Sin estado ni props. Va aparte de privacidad porque los textos de cookies
 * casi siempre se revisan por separado cuando se mete alguna herramienta de
 * medición o publicidad.
 */
export function PoliticaCookies() {
  return (
    <LegalLayout
      title="Política de cookies y tecnologías de almacenamiento"
      intro="Esta política explica qué cookies y tecnologías de almacenamiento utiliza actualmente SKUL, con qué fines y cómo puede controlarlas."
    >
      {/*
        1-2. Definición y situación real: hoy no hay cookies propias de publicidad
        comportamental ni de perfilado.
      */}
      <Section title="1. Qué son las cookies">
        <P>
          Las cookies son pequeños archivos de información que un sitio puede
          almacenar en el dispositivo del usuario. Las cookies pueden utilizarse para
          funciones técnicas, recordar preferencias, medir actividad o realizar
          determinadas funciones publicitarias.
        </P>
      </Section>

      <Section title="2. Situación actual de SKUL">
        <P>
          SKUL no implementa cookies propias destinadas a publicidad comportamental ni
          cookies propias destinadas a crear perfiles comerciales de los visitantes.
        </P>
        <P>
          Tampoco se encuentra implementado actualmente Google Analytics, Meta Pixel ni
          otro sistema equivalente de analítica de comportamiento.
        </P>
      </Section>

      {/*
        3-4. Almacenamiento técnico propio: localStorage para que el carrito no se pierda
        al recargar, y sessionStorage para recordar la pantalla de bienvenida.
        Son funciones esenciales, por eso no requieren consentimiento.
      */}
      <Section title="3. localStorage">
        <P>
          El sitio utiliza localStorage del navegador para determinadas funciones
          técnicas. Actualmente se utiliza principalmente para conservar el carrito de
          compras cuando el usuario recarga o vuelve a cargar la página.
        </P>
        <P>
          La información almacenada puede incluir los productos seleccionados y los
          datos necesarios para reconstruir el carrito. Esta información permanece en el
          navegador del usuario y puede eliminarse mediante las opciones del navegador
          o cuando el propio sitio elimina el carrito.
        </P>
      </Section>

      <Section title="4. sessionStorage">
        <P>
          El sitio utiliza sessionStorage para conservar información temporal durante
          la sesión de navegación. Actualmente se utiliza para recordar determinadas
          decisiones relacionadas con la pantalla inicial de presentación del sitio.
        </P>
        <P>
          El sessionStorage se elimina de acuerdo con el comportamiento normal del
          navegador al finalizar la sesión correspondiente.
        </P>
      </Section>

      {/*
        5. Servicios externos: lo que hagan Firebase, Cloudinary, Correo Argentino y
        los demás ya no lo controlamos nosotros.
      */}
      <Section title="5. Cookies de terceros">
        <P>
          El funcionamiento de determinados servicios externos puede involucrar
          tecnologías propias de dichos proveedores cuando el usuario interactúa con
          ellos. Entre los servicios externos utilizados se encuentran Firebase,
          Cloudinary, Cloudflare, WhatsApp, Instagram, Telegram y Correo Argentino.
        </P>
        <P>
          El tratamiento realizado directamente por esos terceros queda sujeto a sus
          propias políticas y configuraciones.
        </P>
      </Section>

      {/*
        6. Versión en lenguaje llano del punto 3: los datos quedan sólo en el navegador
        del visitante y se borran borrando los datos de navegación.
      */}
      <Section title="6. Almacenamiento local del navegador (localStorage)">
        <P>
          Además de lo indicado arriba, el sitio guarda de forma local en el
          navegador ciertos datos que no son cookies: el contenido del carrito
          de compras y otras preferencias de navegación que el visitante haya
          elegido guardar.
        </P>
        <P>
          Estos datos nunca salen del dispositivo del visitante: se conservan
          solo en su navegador, sirven para que la experiencia funcione (por
          ejemplo, no perder el carrito al recargar) y se pueden eliminar en
          cualquier momento borrando los datos de navegación del navegador.
          Firestore (la base de datos del sitio) guarda por separado los datos
          necesarios para gestionar la compra y las suscripciones al
          newsletter.
        </P>
      </Section>

      {/*
        7-9. Analítica y publicidad: no hay herramientas de medición hoy. Si se suman,
        esta política se actualiza y se pide consentimiento previo (el procedimiento
        está detallado en ConsentimientoAnaliticas).
      */}
      <Section title="7. Analítica">
        <P>
          SKUL no activa herramientas de analítica de comportamiento como Google
          Analytics o Meta Pixel. Por este motivo, no se solicita consentimiento
          específico para una herramienta de analítica de comportamiento.
        </P>
        <P>
          Si en el futuro se incorpora una herramienta de analítica no esencial, esta
          política será actualizada y se implementará el mecanismo de consentimiento
          correspondiente cuando sea requerido.
        </P>
      </Section>

      <Section title="8. Publicidad y perfilado">
        <P>
          SKUL no utiliza herramientas propias destinadas a realizar perfiles
          publicitarios de los visitantes del sitio. No se utilizan actualmente
          píxeles publicitarios propios para crear perfiles comerciales.
        </P>
      </Section>

      <Section title="9. Suscripción al newsletter">
        <P>
          El formulario de suscripción al newsletter del pie de página no utiliza
          cookies ni tecnologías de seguimiento de terceros: guarda directamente en
          el navegador del visitante que la casilla de consentimiento fue marcada,
          y el consentimiento como tal queda registrado en la base de datos del
          sitio para poder acreditar que la persona lo aceptó de forma libre.
        </P>
      </Section>

      {/*
        10-11. Cómo lo controla el visitante y qué pasa el día que agreguemos tecnologías
        nuevas.
      */}
      <Section title="10. Cómo controlar el almacenamiento">
        <P>
          El usuario puede controlar, bloquear o eliminar determinadas tecnologías de
          almacenamiento mediante la configuración de su navegador. La desactivación
          de mecanismos técnicos puede afectar algunas funcionalidades del sitio,
          especialmente aquellas que dependen de recordar temporalmente información del
          carrito o de la sesión.
        </P>
      </Section>

      <Section title="11. Cambios">
        <P>
          Si SKUL incorpora nuevas tecnologías, cookies, herramientas de analítica,
          publicidad o proveedores que modifiquen sustancialmente el tratamiento de
          información, esta política será actualizada.
        </P>
      </Section>
    </LegalLayout>
  );
}

/* ============================================================
   4. POLÍTICA DE CONSENTIMIENTO DE ANALÍTICA
   ============================================================ */
/**
 * Página "preventiva" del consentimiento de analítica: hoy no hay Google
 * Analytics ni Meta Pixel, así que no hay nada que consentir. Documenta qué se
 * va a informar y cómo se va a pedir el consentimiento el día que se sume una
 * herramienta no esencial, para no improvisar cuando pase.
 *
 * Ruta: /consentimiento-analiticas (state `analitica`).
 * Sin estado ni props. Existe aunque no haya nada que consentir porque el link
 * tiene que estar publicado y el criterio declarado desde antes.
 */
export function ConsentimientoAnaliticas() {
  return (
    <LegalLayout
      title="Consentimiento de analítica"
      intro="Información sobre la situación actual de SKUL respecto de la analítica y sobre cómo se gestionará el consentimiento si se incorpora alguna herramienta."
    >
      {/*
        1. Hoy no hay nada que consentir. La página existe igual y publicada en el footer
        para dejar constancia del criterio desde ya.
      */}
      <Section title="1. Situación actual">
        <P>
          SKUL no utiliza Google Analytics, Meta Pixel ni otra herramienta equivalente
          de analítica de comportamiento. Por lo tanto, no se activa ninguna
          herramienta de analítica no esencial que requiera un consentimiento
          específico.
        </P>
      </Section>

      {/*
        2-5. El compromiso a futuro: qué se informa antes de activar una herramienta, que
        el consentimiento se da con una acción afirmativa (nunca casillas premarcadas),
        que se puede retirar después y que rechazar analítica no puede dejarte sin acceso
        a la tienda.
      */}
      <Section title="2. Futura incorporación de analítica">
        <P>
          Si SKUL incorpora una herramienta de analítica en el futuro, se informará
          antes de su activación, cuando corresponda: el nombre del proveedor, la
          finalidad, las categorías de información tratadas, las tecnologías utilizadas,
          la duración, los posibles destinatarios, la posibilidad de aceptar, la
          posibilidad de rechazar y la posibilidad de retirar posteriormente el
          consentimiento.
        </P>
      </Section>

      <Section title="3. Consentimiento">
        <P>
          Cuando resulte legalmente necesario solicitar consentimiento para una
          herramienta de analítica no esencial, dicho consentimiento será solicitado
          mediante una acción afirmativa del usuario. No se utilizarán casillas
          premarcadas como mecanismo de consentimiento.
        </P>
        <P>
          La negativa a aceptar analítica no esencial no deberá impedir el acceso a
          las funciones esenciales de la tienda.
        </P>
      </Section>

      <Section title="4. Retiro del consentimiento">
        <P>
          Cuando se implemente una herramienta de analítica que requiera
          consentimiento, el usuario podrá retirar dicho consentimiento mediante un
          mecanismo accesible. La retirada del consentimiento no afectará la licitud
          de los tratamientos realizados antes de su retirada.
        </P>
      </Section>

      <Section title="5. Actualización">
        <P>
          Esta política será actualizada cuando se incorporen herramientas de
          analítica o tecnologías similares.
        </P>
      </Section>
    </LegalLayout>
  );
}

/* ============================================================
   5. POLÍTICA DE CAMBIOS Y DEVOLUCIONES
   (se muestra en su propia página: /cambios-y-devoluciones)
   ============================================================ */
/**
 * Política comercial de cambios y devoluciones, más los derechos que no se
 * pueden recortar (defecto, producto incorrecto, arrepentimiento).
 *
 * Ruta: /cambios-y-devoluciones, pero NO desde StoreApp: la sirve
 * src/pages/CambiosYDevoluciones.jsx, que sólo re-exporta este componente para
 * conservar la URL que el footer y los clientes ya usan.
 * Sin estado ni props.
 */
export function CambiosYDevolucionesLegal() {
  return (
    <LegalLayout
      title="Política de cambios y de devoluciones"
      intro={
        "En SKUL buscamos que las condiciones posteriores a una compra sean claras y fáciles de entender. Esta política regula los cambios comerciales ofrecidos por SKUL y se complementa con los derechos reconocidos por la legislación argentina. Ninguna disposición de esta política limita derechos legales del consumidor."
      }
    >
      {/*
        1-2. Política comercial: 3 días desde la recepción y condiciones de reventa. Esto
        es cortesía del negocio, NO un derecho: el plazo legal sigue siendo 10 días.
      */}
      <Section title="1. Cambios por talle">
        <P>
          SKUL ofrece cambios por talle como política comercial. Para solicitar un
          cambio por talle, el cliente deberá comunicarse dentro de los tres (3) días
          corridos desde la recepción del pedido.
        </P>
        <P>El producto deberá encontrarse, salvo que corresponda otra solución legal:</P>
        <List>
          <li>Sin uso.</li>
          <li>Sin lavar.</li>
          <li>Con sus etiquetas originales.</li>
          <li>En condiciones adecuadas para su reventa.</li>
          <li>Acompañado, cuando sea posible, por su packaging original.</li>
        </List>
        <P>
          La existencia de estas condiciones para cambios comerciales no limita los
          derechos que correspondan por ley.
        </P>
      </Section>

      <Section title="2. Cambios por preferencia">
        <P>
          Los cambios solicitados exclusivamente por preferencia personal, color, talle
          o elección del consumidor estarán sujetos a la política comercial de SKUL y
          a la disponibilidad del producto solicitado. Cuando no exista
          disponibilidad, SKUL podrá informar las alternativas disponibles.
        </P>
      </Section>

      {/*
        3-4. Producto con problema: acá no rigen las condiciones comerciales, manda la
        garantía legal.
      */}
      <Section title="3. Producto defectuoso o dañado">
        <P>
          Si el producto recibido presenta un defecto, falla, daño o falta de
          correspondencia con lo adquirido, el cliente deberá comunicarse con SKUL.
          SKUL analizará el caso y aplicará la solución correspondiente conforme a la
          garantía legal y demás derechos establecidos por la legislación.
        </P>
        <P>
          En estos casos no se aplicarán condiciones comerciales de cambios por talle
          que puedan restringir derechos legales del consumidor.
        </P>
      </Section>

      <Section title="4. Producto incorrecto">
        <P>
          Si el cliente recibe un producto diferente al adquirido, deberá comunicarse
          con SKUL, que coordinará la solución correspondiente conforme a la
          legislación aplicable.
        </P>
      </Section>

      {/*
        5-6. El plazo legal de 10 días corridos no se reemplaza por los 3 días comerciales,
        y los gastos de devolución de un arrepentimiento válido los paga SKUL.
      */}
      <Section title="5. Derecho de arrepentimiento">
        <P>
          Las compras realizadas a distancia están alcanzadas, cuando corresponda, por
          el derecho de arrepentimiento. El consumidor puede revocar la aceptación
          dentro de los diez (10) días corridos establecidos por la legislación vigente.
        </P>
        <P>
          Este derecho no puede ser reemplazado ni limitado por el plazo comercial de
          tres (3) días establecido para cambios por talle.
        </P>
        <P>
          Para ejercerlo, deberá utilizar el BOTÓN DE ARREPENTIMIENTO disponible en el
          sitio.
        </P>
      </Section>

      <Section title="6. Costos de devolución por arrepentimiento">
        <P>
          Cuando el consumidor ejerza válidamente el derecho de arrepentimiento, los
          gastos de devolución estarán a cargo de SKUL en los términos establecidos por
          la legislación aplicable. El consumidor deberá poner el producto a
          disposición del vendedor conforme al mecanismo que SKUL indique para
          concretar la devolución.
        </P>
      </Section>

      {/*
        7-8. Quién paga el envío: el cliente si el cambio es por preferencia, SKUL si es
        por defecto o error.
      */}
      <Section title="7. Cambios por talle y costos de envío">
        <P>
          Para cambios comerciales por talle que no correspondan al ejercicio del
          derecho de arrepentimiento ni a una falla o incumplimiento legal del
          producto, el costo de los envíos será asumido por el cliente.
        </P>
        <P>
          Si el cambio corresponde a un defecto, error de entrega, incumplimiento o
          cualquier supuesto en el que legalmente los costos correspondan al vendedor,
          SKUL asumirá los costos que correspondan.
        </P>
      </Section>

      <Section title="8. Estado del producto">
        <P>
          Para cambios comerciales voluntarios por talle o preferencia, el producto
          deberá mantenerse en condiciones adecuadas para su revisión. Estas
          condiciones no se interpretarán como una restricción de derechos legales que
          resulten aplicables a productos defectuosos, incorrectos o a operaciones
          alcanzadas por el derecho de arrepentimiento.
        </P>
      </Section>

      {/*
        9-10. Canales para pedir el cambio y cómo se hacen los reintegros según el medio
        de pago original.
      */}
      <Section title="9. Cómo solicitar un cambio">
        <P>Para solicitar un cambio, el cliente deberá comunicarse mediante:</P>
        <List>
          <li>
            WhatsApp:{" "}
            <a href={WA_LINK} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
              {WA_TXT}
            </a>
          </li>
          <li>
            Email:{" "}
            <a href={MAILTO} style={{ textDecoration: "underline" }}>
              {CONTACT_EMAIL}
            </a>
          </li>
        </List>
        <P>
          Deberá proporcionar, cuando sea posible: nombre y apellido, número de
          pedido, producto, talle y motivo del pedido. SKUL indicará los pasos
          necesarios para continuar.
        </P>
      </Section>

      <Section title="10. Reintegros">
        <P>
          Cuando corresponda realizar un reintegro, SKUL utilizará el medio y el
          procedimiento que correspondan según la operación realizada y la legislación
          aplicable. Los plazos efectivos de acreditación pueden depender del medio de
          pago utilizado y de la entidad correspondiente.
        </P>
      </Section>
    </LegalLayout>
  );
}

/* ============================================================
   6. POLÍTICA DE ENVÍOS
   ============================================================ */
/**
 * Modalidades de entrega, cómo se cotiza el envío, qué datos hacen falta y
 * qué pasa con las demoras. Complementa a los términos sin repetirlos: acá va
 * el detalle operativo (Correo Argentino, sucursales, código postal).
 *
 * Ruta: /politica-de-envios (state `envios`).
 * Sin estado ni props. Está suelta porque el envío cambia seguido (transportista,
 * tarifas, sucursales) y hay que poder actualizarla sin tocar los términos.
 */
export function Envios() {
  return (
    <LegalLayout
      title="Política de envíos"
      intro="Esta política explica las modalidades de entrega disponibles, cómo se calcula el costo del envío, qué datos se necesitan y qué ocurre ante demoras o inconvenientes."
    >
      {/*
        1-2. Qué se puede elegir y cómo se calcula el costo (cotización de Correo Argentino
        según código postal, provincia y peso).
      */}
      <Section title="1. Modalidades">
        <P>Actualmente SKUL puede ofrecer:</P>
        <List>
          <li>Retiro en {LEGAL.localidad}.</li>
          <li>Envío a domicilio mediante Correo Argentino.</li>
          <li>Retiro en sucursal de Correo Argentino, cuando esté disponible.</li>
        </List>
        <P>Las modalidades disponibles pueden variar según el destino.</P>
      </Section>

      <Section title="2. Cotización">
        <P>
          Para determinados envíos, SKUL utiliza información proporcionada por el sistema
          de cotización de Correo Argentino. El cálculo puede considerar, entre otros
          factores:
        </P>
        <List>
          <li>Código postal.</li>
          <li>Provincia.</li>
          <li>Peso del pedido.</li>
          <li>Modalidad de entrega.</li>
          <li>Sucursal seleccionada.</li>
        </List>
        <P>
          El importe mostrado en el checkout corresponde a la cotización disponible al
          momento de realizar la operación.
        </P>
      </Section>

      {/*
        3-5. Datos que pedimos para cotizar y entregar, y responsabilidad del cliente si la
        dirección o la sucursal están mal.
      */}
      <Section title="3. Datos para el envío">
        <P>Para poder cotizar o gestionar un envío pueden solicitarse datos como:</P>
        <List>
          <li>Nombre.</li>
          <li>Teléfono.</li>
          <li>Código postal.</li>
          <li>Provincia.</li>
          <li>Dirección.</li>
          <li>Localidad.</li>
          <li>Sucursal seleccionada, cuando corresponda.</li>
        </List>
        <P>La información será utilizada para gestionar la operación y la entrega.</P>
      </Section>

      <Section title="4. Envío a domicilio">
        <P>
          Cuando el cliente seleccione envío a domicilio deberá proporcionar una
          dirección correcta y suficiente. Los inconvenientes ocasionados por
          información incorrecta o incompleta podrán producir demoras en la entrega.
        </P>
      </Section>

      <Section title="5. Retiro en sucursal">
        <P>
          Cuando se seleccione una sucursal, el cliente será responsable de verificar
          que la sucursal seleccionada sea la adecuada antes de confirmar la compra. La
          disponibilidad de una sucursal y sus horarios dependen del operador logístico.
        </P>
      </Section>

      {/*
        6-7. Los plazos los da el transportista y son estimativos: no garantizamos fecha
        cierta. El seguimiento se apoya en el código de Correo Argentino.
      */}
      <Section title="6. Demoras">
        <P>
          Los plazos de entrega pueden verse afectados por circunstancias ajenas a SKUL,
          incluyendo demoras del operador logístico, condiciones climáticas, feriados,
          problemas de distribución, datos incorrectos y situaciones de fuerza mayor.
        </P>
        <P>
          SKUL realizará las gestiones razonables que correspondan para asistir al
          cliente ante un inconveniente.
        </P>
      </Section>

      <Section title="7. Seguimiento">
        <P>
          Cuando corresponda, SKUL proporcionará un código de seguimiento. El estado
          logístico también puede depender de la información proporcionada por Correo
          Argentino.
        </P>
      </Section>
    </LegalLayout>
  );
}

/* ============================================================
   7. BOTÓN DE ARREPENTIMIENTO
   ============================================================ */
/**
 * El BOTÓN DE ARREPENTIMIENTO: la única pantalla legal que no es sólo texto.
 * Tiene estado propio (useState) porque guarda la solicitud en Firestore
 * (colección "arrepentimientos") y avisa al canal interno vía Worker.
 *
 * Ruta: /boton-de-arrepentimiento (state `arrepentimiento`).
 * Por qué está separada de los términos: es un mecanismo con datos de entrada,
 * con confirmación y con manejo de error. Si el guardado falla, el visitante
 * tiene que enterarse y tener un canal de rescate: un formulario que falla en
 * silencio en un derecho legal es peor que uno que avisa que no pudo guardar.
 */
export function Arrepentimiento() {
  // Un solo objeto con los 5 campos del formulario, más tres banderas de estado
  // de la operación (mandando / éxito / mensaje de error). Nada más: no depende
  // del carrito ni del pedido, el visitante escribe el número a mano.
  const [form, setForm] = useState({
    pedido: "",
    nombre: "",
    contacto: "",
    fecha: "",
    motivo: "",
  });
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Doble clic Protection: si ya hay un envío en curso se ignora el nuevo,
    // así no se generan dos solicitudes por el mismo pedido.
    if (enviando) return;
    setEnviando(true);
    setError("");
    setOk(false);
    try {
      // El aviso a Telegram es un ADELANTE, no el guardado. Por eso va
      // después del addDoc y protegido: si Telegram falla, la solicitud
      // igual quedó registrada en Firestore.
      // serverTimestamp() lo pone el servidor, no el reloj del visitante: la
      // fecha del reclamo tiene que ser creíble para el plazo de 10 días.
      await addDoc(collection(db, "arrepentimientos"), {
        ...form,
        createdAt: serverTimestamp(),
      });
      // El try/catch vacío es deliberado: la notificación interna es opcional
      // y no debe romper un derecho que ya quedó registrado.
      try {
        if (ORDER_NOTIFY_WORKER_URL) {
          await fetch(ORDER_NOTIFY_WORKER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "notify",
              tipo: "arrepentimiento",
              data: form,
            }),
          });
        }
      } catch {}
      // Éxito: muestro la confirmación y limpio el formulario (aunque se
      // conserva el texto legal de alrededor, que es el que explica el plazo).
      setOk(true);
      setForm({ pedido: "", nombre: "", contacto: "", fecha: "", motivo: "" });
    } catch (err) {
      // Antes esto solo hacía console.error y el visitante no se enteraba
      // de NADA: ni confirmación ni error, como si el botón no funcionara.
      // Formulario que falla en silencio en un derecho legal es peor que uno
      // que avisa que no pudo guardarlo.
      console.error(err);
      // Distingo el error de permisos (reglas de Firestore) del de conexión:
      // en el primero insistir no sirve, hay que ofrecer otro canal.
      setError(
        err?.code === "permission-denied"
          ? "No pudimos registrar tu solicitud. Escribinos por WhatsApp o al mail de contacto y la resolvemos ahí."
          : "No pudimos registrar tu solicitud. Revisá tu conexión y probá de nuevo."
      );
    } finally {
      setEnviando(false);
    }
  };

  return (
    <LegalLayout
      title="Botón de arrepentimiento"
      intro="Si realizaste una compra a distancia y corresponde legalmente el derecho de arrepentimiento, podés solicitar la revocación de la aceptación de la compra desde esta página."
    >
      {/*
        1-2. El texto legal y el formulario: el derecho se ejerce sin crear cuenta. Los
        datos que pido abajo son los mínimos para poder localizar el pedido y gestionar
        la devolución.
      */}
      <Section title="1. Derecho de arrepentimiento">
        <P>
          Si realizaste una compra a distancia y corresponde legalmente el derecho de
          arrepentimiento, podés solicitar la revocación de la aceptación de la compra.
        </P>
        <P>
          El derecho puede ejercerse dentro de los diez (10) días corridos establecidos
          por la legislación vigente, contados desde la entrega del bien o desde la
          celebración del contrato, lo que ocurra último.
        </P>
      </Section>

      <Section title="2. Cómo ejercerlo">
        <P>
          SKUL dispone de un mecanismo denominado BOTÓN DE ARREPENTIMIENTO. El
          mecanismo permite iniciar la solicitud sin necesidad de crear una cuenta
          previamente.
        </P>

        {/* Formulario controlado: cada input escribe en `form` con la
            actualización funcional de useState, así no se pisan los campos.
            `required` alcanza para la validación: no agrego reglas propias
            porque el pedido sólo tiene que ser localizable. */}
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12, marginTop: 16, maxWidth: 480 }}>
          <input
            required
            value={form.pedido}
            onChange={(e) => setForm((f) => ({ ...f, pedido: e.target.value }))}
            placeholder="Número de pedido"
            style={{ padding: 10, border: "1px solid var(--black)", fontFamily: "var(--font-mono)" }}
          />
          <input
            required
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            placeholder="Nombre y apellido"
            style={{ padding: 10, border: "1px solid var(--black)" }}
          />
          <input
            required
            value={form.contacto}
            onChange={(e) => setForm((f) => ({ ...f, contacto: e.target.value }))}
            placeholder="Email o teléfono de contacto"
            style={{ padding: 10, border: "1px solid var(--black)" }}
          />
          <input
            required
            type="date"
            value={form.fecha}
            onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
            placeholder="Fecha de compra"
            style={{ padding: 10, border: "1px solid var(--black)" }}
          />
          <textarea
            rows={3}
            value={form.motivo}
            onChange={(e) => setForm((f) => ({ ...f, motivo: e.target.value }))}
            placeholder="Motivo de la solicitud (opcional)"
            style={{ padding: 10, border: "1px solid var(--black)" }}
          />
          {/* El botón se bloquea mientras se guarda, y los dos mensajes finales
              son condicionales: los pintan las banderas ok/error.
              `role="alert"` hace que un lector de pantalla anuncie el error. */}
          <button type="submit" disabled={enviando} className="btn-ghost tracked" style={{ padding: "10px 14px" }}>
            {enviando ? "Enviando..." : "Enviar solicitud"}
          </button>
          {ok && <p style={{ fontSize: 13, color: "green" }}>Solicitud enviada correctamente.</p>}
          {error && <p role="alert" style={{ fontSize: 13, color: "crimson", marginTop: 8 }}>{error}</p>}
        </form>
      </Section>

      {/*
        3-7. Qué datos requiere la solicitud, cuándo se confirma la recepción, quién paga la
        devolución, las excepciones legales y los canales alternativos.
      */}
      <Section title="3. Datos de la solicitud">
        <P>La solicitud podrá requerir:</P>
        <List>
          <li>Número de pedido.</li>
          <li>Nombre y apellido.</li>
          <li>Email o medio de contacto, cuando resulte necesario.</li>
          <li>Información adicional necesaria para identificar la operación.</li>
        </List>
        <P>
          No se solicitarán trámites innecesarios como condición para iniciar la
          solicitud.
        </P>
      </Section>

      <Section title="4. Confirmación">
        <P>
          Una vez recibida la solicitud, SKUL asignará un número o código de
          identificación y comunicará la recepción por el medio correspondiente dentro
          del plazo establecido por la normativa vigente.
        </P>
      </Section>

      <Section title="5. Devolución">
        <P>
          El consumidor deberá poner el producto a disposición de SKUL para concretar la
          devolución. Los gastos de devolución correspondientes al ejercicio válido del
          derecho de arrepentimiento estarán a cargo del vendedor conforme a la
          legislación vigente.
        </P>
      </Section>

      <Section title="6. Excepciones">
        <P>
          El derecho de arrepentimiento se encuentra sujeto a las excepciones
          establecidas por la legislación aplicable. Cuando una excepción resulte
          aplicable a un producto u operación concreta, SKUL informará dicha
          circunstancia.
        </P>
      </Section>

      <Section title="7. Consultas">
        <P>
          También podés comunicarte por WhatsApp o por correo electrónico. SKUL
          procurará responder dentro del plazo establecido por la normativa vigente.
        </P>
        <ContactBlock showAddress={false} />
      </Section>
    </LegalLayout>
  );
}

/* ============================================================
   8. ACCESIBILIDAD
   ============================================================ */
/**
 * Declaración de accesibilidad: el compromiso de que el sitio se pueda usar
 * con teclado, lector de pantalla y distintas configuraciones de movimiento,
 * más el canal para reportar una barrera concreta.
 *
 * Ruta: /accesibilidad (state `accesibilidad`).
 * Sin estado ni props.
 */
export function Accesibilidad() {
  return (
    <LegalLayout
      title="Accesibilidad"
      intro="SKUL busca que el sitio pueda ser utilizado por la mayor cantidad posible de personas, independientemente del dispositivo, navegador o configuración utilizada."
    >
      {/*
        1. Declaración de accesibilidad: el compromiso es voluntario (no estamos
        certificados contra WCAG, el estándar internacional de accesibilidad), pero tiene
        que estar publicado y con un canal para reportar barreras.
      */}
      <Section title="1. Compromiso">
        <P>
          SKUL busca que el sitio pueda ser utilizado por la mayor cantidad posible de
          personas, independientemente del dispositivo, navegador o configuración
          utilizada.
        </P>
        <P>Trabajamos progresivamente para mejorar:</P>
        <List>
          <li>Navegación mediante teclado.</li>
          <li>Contraste.</li>
          <li>Estructura del contenido.</li>
          <li>Etiquetas de controles.</li>
          <li>Textos alternativos.</li>
          <li>Legibilidad.</li>
          <li>Adaptación a dispositivos móviles.</li>
          <li>Compatibilidad con tecnologías de asistencia.</li>
          <li>Reducción de movimiento cuando el dispositivo lo solicita.</li>
        </List>
      </Section>

      {/*
        2-4. Recordatorio de que el sitio respeta prefers-reduced-motion, los textos
        alternativos de imágenes y la navegación por teclado.
      */}
      <Section title="2. Movimiento y animaciones">
        <P>
          El sitio contempla la preferencia del navegador para reducir determinadas
          animaciones cuando el usuario tiene activada la opción de reducción de
          movimiento (prefers-reduced-motion).
        </P>
      </Section>

      <Section title="3. Imágenes">
        <P>
          Las imágenes relevantes procuran contar con información alternativa adecuada
          cuando corresponde. Las imágenes utilizadas únicamente con finalidad decorativa
          pueden no contener una descripción textual.
        </P>
      </Section>

      <Section title="4. Navegación">
        <P>
          SKUL trabaja para que los elementos interactivos puedan identificarse
          correctamente y para que la información importante no dependa exclusivamente de
          un color, una animación o un elemento visual.
        </P>
      </Section>

      {/*
        5. Canal para reportar barreras de accesibilidad, pidiendo los datos justos para
        poder reproducirlas y arreglarlas.
      */}
      <Section title="5. Reporte de problemas">
        <P>
          Si encontrás una dificultad para utilizar una parte del sitio, podés
          comunicarte por correo electrónico. Cuando sea posible, indicá la página donde
          ocurrió el problema, el dispositivo utilizado, el navegador y una descripción
          del inconveniente. Esto nos permitirá investigar y mejorar el sitio.
        </P>
        <ContactBlock showAddress={false} />
      </Section>
    </LegalLayout>
  );
}

/* ============================================================
   9. INFORMACIÓN DE CONTACTO, RECLAMOS E INFORMACIÓN LEGAL
   ============================================================ */
/**
 * La pantalla de "Contacto y reclamos" del footer: la ficha del proveedor
 * (nombre, CUIT, domicilio) y los canales por los que se puede pedir algo o
 * reclamar. La Ley 24.240 exige que esos datos estén publicados y sean fáciles
 * de encontrar; por eso vive como página propia y no repartida en los términos.
 *
 * Ruta: /informacion-legal (state `informacion-legal`).
 * Sin estado ni props.
 */
export function InformacionLegal() {
  return (
    <LegalLayout
      title="Información de contacto y reclamos"
      intro="Datos del proveedor, canales de atención y plazos de respuesta aplicables a cada tipo de solicitud."
    >
      {/*
        1. Ficha del proveedor: nombre, CUIT, domicilio y canales. Es el bloque que la
        Ley 24.240 exige que esté publicado y accesible para el consumidor.
      */}
      <Section title="1. Datos del proveedor">
        <List>
          <li>
            Titular / proveedor: <strong>{LEGAL.razonSocial}</strong>
          </li>
          <li>Nombre comercial: {LEGAL.nombreComercial}</li>
          <li>CUIT: {LEGAL.cuit}</li>
          <li>
            Domicilio: {LEGAL.domicilio}, {LEGAL.localidad}, {LEGAL.provincia},{" "}
            {LEGAL.pais}
          </li>
          <li>
            Email:{" "}
            <a href={MAILTO} style={{ textDecoration: "underline" }}>
              {CONTACT_EMAIL}
            </a>
          </li>
          <li>
            WhatsApp:{" "}
            <a href={WA_LINK} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
              {WA_TXT}
            </a>
          </li>
          <li>
            Sitio:{" "}
            <a href={LEGAL.web} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
              {LEGAL.web}
            </a>
          </li>
        </List>
      </Section>

      {/*
        2. Qué se puede pedir por cada canal y que los plazos de respuesta dependen de la
        normativa de cada derecho (por ejemplo, la baja del newsletter son 5 días hábiles).
      */}
      <Section title="2. Qué consultas podés hacer por estos canales">
        <P>
          Para consultas, reclamos, solicitudes de cambio, devoluciones, solicitudes de
          arrepentimiento o cuestiones relacionadas con privacidad, podés comunicarte
          mediante:
        </P>
        <List>
          <li>
            Email:{" "}
            <a href={MAILTO} style={{ textDecoration: "underline" }}>
              {CONTACT_EMAIL}
            </a>
          </li>
          <li>
            WhatsApp:{" "}
            <a href={WA_LINK} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
              {WA_TXT}
            </a>
          </li>
          <li>
            Domicilio: {LEGAL.domicilio}, {LEGAL.localidad}, {LEGAL.provincia},{" "}
            {LEGAL.pais}
          </li>
        </List>
        <P>
          El canal de WhatsApp podrá utilizarse para atención y coordinación de
          determinadas solicitudes. SKUL procurará atender las consultas durante los
          días y horarios comerciales informados.
        </P>
        <P>
          Cuando una solicitud corresponda a un derecho regulado por una normativa
          específica, se aplicarán los plazos establecidos por dicha normativa.
        </P>
      </Section>

      {/* 3. La fecha se mueve junto con el resto de las políticas: es LEGAL.fecha. */}
      <Section title="3. Última actualización general">
        <P>
          Esta información se actualiza junto con el resto de las políticas del sitio.
          Última actualización: {LEGAL.fecha}.
        </P>
      </Section>
    </LegalLayout>
  );
}
