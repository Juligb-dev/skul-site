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
 *  - Pide provincia + código postal, cotiza domicilio y sucursal.
 *  - Si el cliente elige "sucursal", muestra la lista de agencias
 *    de esa provincia para que busque la suya por nombre/localidad.
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
// "B" es Buenos Aires: la provincia por defecto.
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

  /** Cotiza el envío a domicilio y a sucursal para el CP tipeado. */
  const calcular = async () => {
    if (!postalCode.trim()) return;
    setLoadingRates(true);
    setRatesError("");
    setRates(null);
    onChange(null); // limpiar lo que estaba elegido antes de recalcular
    setAgencies(null);
    try {
    const r = await getShippingRates(postalCode.trim(), weight);
      setRates(r);
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

  /** Pide la lista de agencias y abre la búsqueda, lo más cerca posible
   *  del CP del cliente.
   *  1. En paralelo: geocodifica el CP (coordenadas para ordenar por
   *     cercanía) y pide las agencias de la provincia tildada.
   *  2. Si el geocodificador dice que el CP es de OTRA provincia,
   *     corrige el selector y vuelve a pedir: así no se listan
   *     sucursales de una provincia que no le corresponde al cliente
   *    (MiCorreo solo filtra por provincia, el filtro fino es acá).
   *  3. Ordena por distancia al CP y anota los km de cada sucursal.
   *  Si el geocoding falla o el CP no existe, la lista se muestra igual
   *  (sin ordenar), tal cual como antes.
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
      let [geo, list] = await Promise.all([
        geocodificarCP(cp).catch(() => null),
        getAgencies(provinceCode),
      ]);
      if (geo?.provinceCode && geo.provinceCode !== provinceCode) {
        setProvinceCode(geo.provinceCode);
        list = await getAgencies(geo.provinceCode);
      }
      let conDistancia = list;
      if (geo?.lat != null) {
        conDistancia = list
          .map((a) => (a.lat != null ? { ...a, distKm: distanciaKm(geo.lat, geo.lng, a.lat, a.lng) } : a))
          .sort((x, y) => (x.distKm ?? Infinity) - (y.distKm ?? Infinity));
        setDestino(geo.localidad || cp);
      }
      setAgencies(conDistancia);
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
          {/* Aviso de orden: si se geocodificó el CP, la lista está de más
              cercana a más lejana; si no, queda el orden de la API. */}
          {destino && (
            <p style={{ fontSize: 11.5, color: "var(--grey-3)" }}>
              Más cercanas primero a tu CP ({destino}). Fijá la calle en cada sucursal.
            </p>
          )}
          <input value={agencyFilter} onChange={(e) => setAgencyFilter(e.target.value)} placeholder="Buscar sucursal por calle o localidad…" style={inputStyle} />
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