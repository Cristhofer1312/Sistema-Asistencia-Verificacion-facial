"use client";
import { useState } from "react";
export default function Login() {
  const [u, setU] = useState("gerente.ventas");
  return (
    <main className="wrap" style={{ maxWidth: 480 }}>
      <h2>Ingreso</h2>
      <div className="card">
        <label>Usuario prediseñado (Gerente / Coordinador por gerencia, RRHH, Administrador)</label>
        <input value={u} onChange={(e) => setU(e.target.value)} />
        <label>Contraseña</label>
        <input type="password" placeholder="••••••••" />
        <div className="row" style={{ marginTop: 12 }}>
          <a className="btn btn-primary" href="/admin/dashboard">Entrar (mock)</a>
          <a className="btn" href="/cambio-clave">Primera vez</a>
        </div>
        <p className="muted">Mock: si requiere cambio, redirige a /cambio-clave.</p>
      </div>
      <a href="/">← Volver</a>
    </main>
  );
}
