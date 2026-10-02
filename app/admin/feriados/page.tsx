"use client";
import { useState } from "react";
export default function Feriados() {
  const [modo, setModo] = useState<"dia" | "rango">("dia");
  return (
    <div className="card">
      <h3>Feriados — un día o rango + motivo</h3>
      <div className="row">
        <button className={modo === "dia" ? "btn btn-primary" : "btn"} onClick={() => setModo("dia")}>Un día</button>
        <button className={modo === "rango" ? "btn btn-primary" : "btn"} onClick={() => setModo("rango")}>Rango</button>
      </div>
      {modo === "dia" ? <div><label>Fecha</label><input type="date" /></div> : <div className="grid2"><div><label>Inicio</label><input type="date" /></div><div><label>Fin</label><input type="date" /></div></div>}
      <label>Motivo</label><input placeholder="Ej. Fiesta nacional" />
      <div className="row" style={{ marginTop: 8 }}><button className="btn btn-primary">Guardar (mock, expande rango a días)</button></div>
      <p className="muted">Sin marca = FERIADO. Con marca = asistencia + extras totales.</p>
    </div>
  );
}
