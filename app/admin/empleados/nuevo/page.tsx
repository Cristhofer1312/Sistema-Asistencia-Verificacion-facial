"use client";
import { useState } from "react";

export default function NuevoEmpleado() {
  const [paso, setPaso] = useState(1);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ marginBottom: 4 }}>Nuevo empleado</h2>
        <p className="muted">Registro en 2 pasos: datos personales → captura biométrica</p>
      </div>

      {/* Step indicator */}
      <div className="steps" style={{ marginBottom: 28 }}>
        <div className="step-item">
          <div className={"step-circle" + (paso > 1 ? " done" : paso === 1 ? " active" : "")}>
            {paso > 1 ? "✓" : "1"}
          </div>
          <span className={"step-label" + (paso === 1 ? " active" : "")} style={{ color: paso > 1 ? "var(--ok)" : undefined }}>
            Datos personales
          </span>
        </div>
        <div className={"step-connector" + (paso > 1 ? " done" : "")} />
        <div className="step-item">
          <div className={"step-circle" + (paso === 2 ? " active" : "")}>2</div>
          <span className={"step-label" + (paso === 2 ? " active" : "")}>Captura biométrica</span>
        </div>
      </div>

      {/* Step 1 */}
      {paso === 1 && (
        <div className="card">
          <h3 style={{ marginBottom: 18 }}>📋 Paso 1 — Datos personales</h3>
          <div className="grid2" style={{ gap: 18 }}>
            <div className="form-group">
              <label htmlFor="n-doc">Documento (cédula/DNI) <span style={{ color: "var(--bad)" }}>*</span></label>
              <input id="n-doc" placeholder="Ej. V-12345678" />
            </div>
            <div className="form-group">
              <label htmlFor="n-cargo">Cargo <span style={{ color: "var(--bad)" }}>*</span></label>
              <input id="n-cargo" placeholder="Ej. Vendedor senior" />
            </div>
            <div className="form-group">
              <label htmlFor="n-nombre">Nombres <span style={{ color: "var(--bad)" }}>*</span></label>
              <input id="n-nombre" placeholder="Ej. Ana María" />
            </div>
            <div className="form-group">
              <label htmlFor="n-apell">Apellidos <span style={{ color: "var(--bad)" }}>*</span></label>
              <input id="n-apell" placeholder="Ej. Pérez García" />
            </div>
            <div className="form-group">
              <label htmlFor="n-ger">Gerencia <span style={{ color: "var(--bad)" }}>*</span></label>
              <select id="n-ger">
                <option>Ventas</option>
                <option>RRHH</option>
                <option>Operaciones</option>
                <option>Finanzas</option>
              </select>
            </div>
          </div>

          <hr className="divider" />
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <a href="/admin/empleados" className="btn btn-ghost">Cancelar</a>
            <button className="btn btn-primary" onClick={() => setPaso(2)}>
              Continuar a biometría →
            </button>
          </div>
        </div>
      )}

      {/* Step 2 */}
      {paso === 2 && (
        <div className="card">
          <h3 style={{ marginBottom: 6 }}>📷 Paso 2 — Captura biométrica</h3>
          <p className="muted" style={{ marginBottom: 20 }}>
            La cámara permanece activa con vista previa. El recuadro verde indica que el rostro es apto para captura (iluminación, ángulo, nitidez). Se capturan 128 valores como descriptor facial.
          </p>

          {/* Camera mock */}
          <div className="kiosco" style={{ minHeight: 300, borderRadius: 14 }}>
            <div className="kiosco-scan-ring" style={{ width: 160, height: 160 }} />
            <div className="overlay-top">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f87171", boxShadow: "0 0 8px #f87171" }} />
                <span style={{ color: "#94a3b8", fontSize: ".72rem", fontWeight: 600 }}>SIN CÁMARA (DEMO)</span>
              </div>
            </div>
            <div className="overlay" style={{ textAlign: "center", paddingBottom: 24 }}>
              <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: "1rem", marginBottom: 6 }}>
                Vista previa enrolamiento
              </div>
              <div style={{ color: "#64748b", fontSize: ".875rem" }}>
                Recuadro verde cuando el rostro es apto → capturar firma facial
              </div>
            </div>
          </div>

          <div className="alert alert-info" style={{ marginTop: 16 }}>
            <span>ℹ️</span>
            <span>Asegúrese de buena iluminación frontal y que el empleado mire directamente a la cámara sin lentes oscuros.</span>
          </div>

          <hr className="divider" />
          <div className="row" style={{ justifyContent: "space-between" }}>
            <button className="btn" onClick={() => setPaso(1)}>← Atrás</button>
            <button className="btn btn-ok">✓ Capturar firma facial (mock)</button>
          </div>
        </div>
      )}
    </div>
  );
}
