import React, { useState } from "react";
import { CORREO_PROVINCES } from "../data/config.js";
import { getShippingRates, getAgencies, geocodificarCP, distanciaKm } from "../utils/correo.js";
import { fmt } from "../utils/format.js";

// Estilo compartido por los dos campos de arriba. Lo saco a una
// constante porque los <select>/<input> nativos se resisten a tomar
// clases del diseño y así los dos quedan iguales.
const inputStyle = {
  border: "1px solid var(--black)", padding: "10px 12px", fontSize: 13, width: "100%",
};

/** Calculadora de envío por Correo Argentino para el checkout.
 *  - Pide código postal (la provincia la deriva sola del CP), cotiza
 *    domicilio y sucursal y, de paso, deja pre-cargada la lista de
 *    sucursales: el cliente escribe UNA sola cosa (el CP) y cuando
 *    elige "retiro en sucursal" la lista ya aparece ordenada con las
 *    de su CP primero. El filtro de texto sigue existiendo, pero es
 *    opcional: solo por si no ve la suya.
 *  - Cuando el cliente confirma una opción, llama a onChange con
 *    { type, price, postalCode, provinceCode, agencyCode, agencyName }
 *    (onChange(null) si todavía no hay nada confirmado).
 *
 * Props:
 *  - value: la opción ya elegida (o null). Sólo la leo para pintar la
 *    opción activa y para saber si ya eligió sucursal.
 *  - onChange: avisa al checkout qué se eligió. null = nada elegido.
 *  - weight: peso total del pedido en kg, lo necesita la API de Correo
 *    para calcular el precio.
 *
 * Nota: todo el estado es local y efímero; el checkout sólo se entera
 * del resultado final vía onChange. Cada vez que se recalcula, libero
 * la selección anterior con onChange(null) para que nunca quede un
 * precio viejo pegado a un código postal nuevo.
 */
export default function CorreoShipping({ value, onChange, weight }) {
// "B" es Buenos Aires: la provincia por defecto (si el CP es de otra,
// se corrige sola apenas se cotiza).
const [provinceCode, setProvinceCode] = useState("B");
  const [postalCode, setPostalCode] = useState("");
  const [rates, setRates] = useState(null); // { domicilio, sucursal }
  const [loadingRates, setLoadingRates] = useState(false);
  const [ratesError, setRatesError] = useState("");

  // Estado de la búsqueda de sucursales: la lista, el texto del filtro
  // de búsqueda y sus estados de carga/error.
  const [agencies, setAgencies] = useState(null);
  const [agencyFilter, setAgencyFilter] = useState("");
  const [loadingAgencies, setLoadingAgencies] = useState(false);
  const [agenciesError, setAgenciesError] = useState("");
  // Etiqueta del destino geocodificado ("Ramos Mejía"): si existe, la
  // lista quedó ordenada por cercanía al CP escrito.
  const [destino, setDestino] = useState("");
  // Lista pedida de paso al cotizar, para que al elegir "retiro en
  // sucursal" no haya que esperar ni escribir nada más. Se guarda con
  // el CP y la provincia con los que se pidió: si algo cambió, no sirve
  // y se vuelve a pedir.
  const [prefetch, setPrefetch] = useState(null); // { cp, provinceCode, list, geo }

  /** Cotiza el envío a domicilio y a sucursal para el CP tipeado.
   *  En paralelo geocodifica el CP: con eso (1) la provincia se
   *  corrige sola y (2) queda lista la información para ordenar las
   *  sucursales por cercanía sin que el cliente escriba nada más. */
  const calcular = async () => {
    if (!postalCode.trim()) return;
    const cp = postalCode.trim();
    setLoadingRates(true);
    setRatesError("");
    setRates(null);
    onChange(null); // limpiar lo que estaba elegido antes de recalcular
    setAgencies(null);
    setDestino("");
    setPrefetch(null);
    try {
      const [r, geo] = await Promise.all([
        getShippingRates(cp, weight),
        geocodificarCP(cp).catch(() => null),
      ]);
      setRates(r);
      // Provincia derivada del CP: el select se actualiza solo y el
      // cliente no tiene que tildar nada (los precios no dependen de
      // la provincia, así que la cotización sigue siendo válida).
      let prov = provinceCode;
      if (geo?.provinceCode && geo.provinceCode !== provinceCode) {
        setProvinceCode(geo.provinceCode);
        prov = geo.provinceCode;
      }
      // De paso, en segundo plano: la lista de sucursales para cuando
      // el cliente clickee "retiro en sucursal". Si falla, no pasa
      // nada: ahí se vuelve a pedir al abrir la lista.
      if (r.sucursal != null) {
        Promise.resolve(getAgencies(prov))
          .then((list) => {
            if (Array.isArray(list)) setPrefetch({ cp, provinceCode: prov, list, geo });
          })
          .catch(() => {});
      }
    } catch (err) {
      // El mensaje de la API se muestra tal cual: son errores de
      // Correo (CP inexistente, CP sin cobertura) que el cliente
      // puede entender mejor que un "algo falló".
      setRatesError(err.message);
    } finally {
      // El finally apaga el spinner pase lo que pase.
      setLoadingRates(false);
    }
  };

  /** Confirma envío a domicilio. Sin agencyCode ni agencyName, el
   *  checkout ya sabe que es a puerta (y no retiro en sucursal). */
  const elegirDomicilio = () => {
    onChange({ type: "domicilio", price: rates.domicilio, postalCode: postalCode.trim(), provinceCode });
  };

  /** Abre la lista de sucursales ya ordenada: primero las del CP del
   *  cliente (mismo número de CPA), después por cercanía. No hace
   *  falta que escriba nombre de lugar ninguno.
   *  1. Usa la lista pre-cargada al cotizar si el CP y la provincia
   *    siguen iguales (camino normal: sin esperas).
   *  2. Si no, pide geocoding + agencias en paralelo; si el geo dice
   *     otra provincia, corrige el selector y vuelve a pedir.
   *  Si el geocoding falla, el orden por CP del punto 1 (y la
   *  búsqueda opcional) siguen funcionando igual.
   *  Primero tiro la selección anterior porque el precio de sucursal
   *  sin agencia elegida no sirve. */
  const abrirBusquedaSucursal = async () => {
    onChange(null);
    setAgenciesError("");
    setLoadingAgencies(true);
    setDestino("");
    setAgencyFilter("");
    try {
      const cp = postalCode.trim();
      let geo = null;
      let list;
      if (prefetch && prefetch.cp === cp && prefetch.provinceCode === provinceCode) {
        list = prefetch.list;
        geo = prefetch.geo;
      } else {
        [geo, list] = await Promise.all([
          geocodificarCP(cp).catch(() => null),
          getAgencies(provinceCode),
        ]);
        if (geo?.provinceCode && geo.provinceCode !== provinceCode) {
          setProvinceCode(geo.provinceCode);
          list = await getAgencies(geo.provinceCode);
        }
      }
      // "De mi zona primero": las sucursales cuyo CPA coincide con el
      // CP escrito (mismo pueblo) van arriba aunque otra esté más
      // cerca en línea recta. Es el match que garantiza que el cliente
      // vea LA SUYA sin escribir nada, aunque el geocoding falle.
      const cpNum = (cp.match(/\d{4}/) || [])[0];
      const conOrden = (Array.isArray(list) ? list : [])
        .map((a) => ({
          ...a,
          enMiCP: Boolean(cpNum && a.postalCode && a.postalCode.replace(/\D/g, "") === cpNum),
          distKm: geo?.lat != null && a.lat != null ? distanciaKm(geo.lat, geo.lng, a.lat, a.lng) : null,
        }))
        .sort((x, y) => {
          if (x.enMiCP !== y.enMiCP) return x.enMiCP ? -1 : 1;
          return (x.distKm ?? Infinity) - (y.distKm ?? Infinity);
        });
      if (geo?.lat != null) setDestino(geo.localidad || cp);
      setAgencies(conOrden);
    } catch (err) {
      setAgenciesError(err.message);
    } finally {
      setLoadingAgencies(false);
    }
  };

  /** Confirma retiro en una agencia puntual. El name guardado es
   *  "nombre (calle, localidad)" para que el checkout pueda mostrarlo
   *  en el resumen sin volver a guardar la agencia entera. */
  const elegirSucursal = (agency) => {
    const direccion = [agency.address, agency.locality || agency.city].filter(Boolean).join(", ");
    onChange({
      type: "sucursal", price: rates.sucursal, postalCode: postalCode.trim(), provinceCode,
      agencyCode: agency.code, agencyName: `${agency.name} (${direccion || agency.city})`,
    });
  };

  // Filtro de la lista: sin texto de búsqueda pasa todo; con texto,
  // busca en nombre, calle, localidad y ciudad a la vez, en minúsculas
  // para que no importe cómo lo escribió.
  const filteredAgencies = (agencies || []).filter((a) =>
    !agencyFilter.trim() ||
    [a.name, a.address, a.locality, a.city].filter(Boolean).join(" ").toLowerCase().includes(agencyFilter.toLowerCase())
  );

  /** "3,2 km" para distancias cortas, "148 km" para las largas. */
  const fmtKm = (km) => (km < 10 ? `${km.toFixed(1).replace(".", ",")} km` : `${Math.round(km)} km`);

  // ¿Hay sucursales del mismo CP del cliente en la lista? Se usa para
  // el aviso de arriba: si las hay, el cliente ve la suya sin buscar.
  const cpMatches = (agencies || []).some((a) => a.enMiCP);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {/* Fila 1: provincia y código postal, uno al lado del otro. Al
          cambiar la provincia se borra todo lo cotizado antes, porque
          los precios y las agencias son por provincia. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span className="tracked" style={{ fontSize: 11, fontWeight: 700 }}>Provincia</span>
          <select value={provinceCode} onChange={(e) => { setProvinceCode(e.target.value); setRates(null); setAgencies(null); setDestino(""); onChange(null); }} style={inputStyle}>
            {CORREO_PROVINCES.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span className="tracked" style={{ fontSize: 11, fontWeight: 700 }}>Código postal</span>
          <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="Ej: 1704" style={inputStyle} />
        </label>
      </div>
      {/* Botón de cotizar: deshabilitado sin CP o mientras corre la
          consulta, para no disparar pedidos duplicados. */}
      <button onClick={calcular} disabled={loadingRates || !postalCode.trim()} className="btn-ghost tracked" style={{ fontSize: 12, padding: "10px 14px", width: "fit-content" }}>
        {loadingRates ? "Cotizando…" : "Calcular envío"}
      </button>
      {ratesError && <p style={{ fontSize: 12.5, color: "crimson" }}>{ratesError}</p>}

      {/* Las dos opciones que devolvió la API. Cada una se pinta como
          un botón (no como radio) y se marca active comparando con
          value.type: el checkout es el dueño de la selección. */}
      {rates && (
        <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
          {rates.domicilio != null && (
            <button
              onClick={elegirDomicilio}
              className={`zone-radio ${value?.type === "domicilio" ? "active" : ""}`}
              style={{ textAlign: "left", padding: "12px 14px", fontSize: 13, display: "flex", justifyContent: "space-between" }}
            >
              <span>Envío a domicilio</span>
              <span className="mono">{fmt(rates.domicilio)}</span>
            </button>
          )}
          {rates.sucursal != null && (
            <button
              onClick={abrirBusquedaSucursal}
              className={`zone-radio ${value?.type === "sucursal" ? "active" : ""}`}
              style={{ textAlign: "left", padding: "12px 14px", fontSize: 13, display: "flex", justifyContent: "space-between" }}
            >
              <span>Retiro en sucursal de Correo</span>
              <span className="mono">{fmt(rates.sucursal)}</span>
            </button>
          )}
          {/* Si la API no encontró ni domicilio ni sucursal para ese CP, lo
            digo explícito en vez de mostrar un bloque vacío. */}
          {rates.domicilio == null && rates.sucursal == null && (
            <p style={{ fontSize: 12.5, color: "var(--grey-3)" }}>No hay cotización disponible para ese código postal.</p>
          )}
        </div>
      )}

      {/* Estados de la búsqueda de agencias. */}
      {loadingAgencies && <p style={{ fontSize: 12.5, color: "var(--grey-3)" }}>Buscando sucursales…</p>}
      {agenciesError && <p style={{ fontSize: 12.5, color: "crimson" }}>{agenciesError}</p>}

      {/* Lista de agencias: sólo aparece si ya se cargó la lista y el
          cliente todavía no eligió una. El maxHeight la convierte en
          scroll propio, así el checkout no crece infinito. */}
      {agencies && !value?.agencyCode && (
        <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
          {/* Aviso de orden: con el CP solo ya está todo — primero las
              sucursales del propio CP y después las más cercanas. El
              filtro es para el caso raro, por eso va marcado opcional. */}
          <p style={{ fontSize: 11.5, color: "var(--grey-3)" }}>
            {destino
              ? `Tus sucursales: primero las de ${destino} y las más cercanas. No hace falta buscar.`
              : cpMatches
                ? "Primero las sucursales de tu código postal."
                : "Ordenadas de más cercana a más lejana."}
          </p>
          <input value={agencyFilter} onChange={(e) => setAgencyFilter(e.target.value)} placeholder="Filtrar sucursal (opcional): nombre o calle…" style={{ ...inputStyle, fontSize: 12.5, padding: "8px 10px" }} />
          <div style={{ maxHeight: 220, overflowY: "auto", display: "grid", gap: 4 }}>
            {/* Recorto a 40: con el orden por cercanía son las 40 más
              próximas, así el scroll interno queda usable. */}
            {filteredAgencies.slice(0, 40).map((a) => {
              const direccion = [a.address, a.locality || a.city].filter(Boolean).join(", ");
              return (
                <button key={a.code} onClick={() => elegirSucursal(a)} style={{ textAlign: "left", padding: "8px 10px", fontSize: 12.5, border: "1px solid var(--grey-1)", background: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ display: "grid", gap: 2 }}>
                    <span style={{ fontWeight: 600 }}>{a.name}</span>
                    <span style={{ fontSize: 11.5, color: "var(--grey-3)" }}>{direccion}</span>
                  </span>
                  {a.distKm != null && <span className="mono" style={{ fontSize: 11.5, color: "var(--grey-3)", whiteSpace: "nowrap" }}>{fmtKm(a.distKm)}</span>}
                </button>
              );
            })}
            {filteredAgencies.length === 0 && <p style={{ fontSize: 12.5, color: "var(--grey-3)" }}>Ninguna sucursal coincide con esa búsqueda.</p>}
          </div>
        </div>
      )}

      {/* Confirmación de la agencia elegida: reemplaza la lista. */}
      {value?.type === "sucursal" && value.agencyCode && (
        <p style={{ fontSize: 12.5, color: "var(--accent)" }}>Sucursal elegida: {value.agencyName} ✓</p>
      )}
    </div>
  );
}