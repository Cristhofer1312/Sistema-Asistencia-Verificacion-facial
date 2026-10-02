"use client";
import { useState } from "react";
export default function NuevoEmpleado() {
  const [paso, setPaso] = useState(1);
  return (
    <div className="card">
      <h3>Nuevo empleado — Paso {paso}/2 (cámara siempre activa en paso 2)</h3>
      {paso === 1 && (
        <div className="grid2">
          <div><label>Documento</label><input placeholder="Cédula/DNI único" /></div>
          <div><label>Cargo</label><input placeholder="Cargo" /></div>
          <div><label>Nombres</label><input /></div>
          <div><label>Apellidos</label><input /></div>
          <div><label>Gerencia</label><select><option>Ventas</option><option>RRHH</option></select></div>
          <div style={{ alignSelf: "end" }}><button className="btn btn-primary" onClick={() => setPaso(2)}>Continuar a biometría</button></div>
        </div>
      )}
      {paso === 2 && (
        <div>
          <p className="muted">La cámara permanece encendida con vista previa hasta capturar la firma 128 valores. Guía con recuadro y control de luz.</p>
          <div className="kiosco" style={{ minHeight: 260 }}><div className="overlay"><b>Vista previa enrolamiento (mock)</b><div className="muted">Recuadro verde cuando el rostro es apto → Capturar firma</div></div></div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => setPaso(1)}>Atrás</button>
            <button className="btn btn-ok">Capturar firma (mock)</button>
          </div>
        </div>
      )}
    </div>
  );
}
