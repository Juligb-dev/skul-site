import React, { useEffect, useState } from "react";

/**
 * Calcula el tiempo que falta para una fecha y lo devuelve partido en
 * días/horas/minutos/segundos. Devuelve null si la fecha ya pasó o si
 * no viene: en ese caso el componente no dibuja nada.
 *
 * El "%" de cada línea es lo que hace el reparto: por ejemplo, los
 * minutos son (total en minutos) módulo 60, o sea "los minutos que no
 * son horas".
 */
function getTimeLeft(targetDate) {
  // +new Date() es el mismo objeto Date convertido a número de milisegundos
  // desde 1970. Restarlos me da la diferencia en milisegundos.
  const diff = +new Date(targetDate) - +new Date();
  if (!targetDate || isNaN(diff) || diff <= 0) return null;
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

/**
 * Barra negra con el nombre del próximo drop y la cuenta regresiva.
 * Va arriba de todo, entre el header y el contenido, y también sirve
 * de link al drop (por eso el onClick opcional).
 *
 * Props:
 *  - name: nombre del drop ("Drop 04" o similar).
 *  - date: fecha del drop (string que new Date() pueda parsear).
 *  - onClick: si viene, toda la barra es clickeable y lleva al drop;
 *    si no viene, es sólo informativa.
 */
export default function DropCountdown({ name, date, onClick }) {
  // Inicializo el estado ya calculado (la función del useState) para
  // que en el primer render los segundos ya estén bien y no haya un
  // frame con valores viejos.
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(date));

  useEffect(() => {
    // Recalculo por si cambió la prop date.
    setTimeLeft(getTimeLeft(date));
    // Y de ahí en adelante, un tick por segundo. El id del intervalo
    // se guarda para poder limpiarlo; sin ese clearInterval, al
    // cambiar de fecha se acumularían timers viejos.
    const id = setInterval(() => setTimeLeft(getTimeLeft(date)), 1000);
    return () => clearInterval(id);
  }, [date]);

  // Sin fecha válida o con fecha vencida, no hay nada que mostrar.
  if (!timeLeft) return null;

  return (
    // Barra entera. El cursor cambia a pointer sólo si hay onClick,
    // así no promete que sea clickeable cuando no lo es.
    <div onClick={onClick} style={{ background: "var(--black)", color: "var(--white)", borderBottom: "1px solid var(--black)", padding: "18px 20px", cursor: onClick ? "pointer" : "default" }}>
      {/* Fila interna: nombre a la izquierda, reloj a la derecha. */}
      <div style={{ maxWidth: 1240, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <p className="mono tracked" style={{ fontSize: 11, color: "var(--grey-1)", marginBottom: 4 }}>PRÓXIMO DROP</p>
          <p className="display" style={{ fontSize: "clamp(18px,3vw,26px)", fontStyle: "italic", margin: 0 }}>{name || "Nueva caída"}</p>
        </div>
        {/* Los cuatro números. Mono para que no bailen de ancho al
            cambiar de dígito. */}
        <div className="mono tracked" style={{ display: "flex", gap: 16, fontSize: 20, fontWeight: 700 }}>
          <TimeBlock value={timeLeft.days} label="d" />
          <TimeBlock value={timeLeft.hours} label="h" />
          <TimeBlock value={timeLeft.minutes} label="m" />
          <TimeBlock value={timeLeft.seconds} label="s" />
        </div>
      </div>
    </div>
  );
}

/**
 * Un número del reloj con su unidad pegada al costado. El padStart
 * rellena con ceros a la izquierda ("05" en vez de "5"), que es lo que
 * hace que el reloj no se mueva de lado mientras corre.
 */
function TimeBlock({ value, label }) {
  return (
    <span>
      {String(value).padStart(2, "0")}
      <span style={{ fontSize: 11, color: "var(--grey-1)", fontWeight: 400 }}>{label}</span>
    </span>
  );
}