"use client";
import { useState } from "react";
import Link from "next/link";

export default function Login() {
  const [u, setU] = useState("gerente.ventas");
  const [showPwd, setShowPwd] = useState(false);

  return (
    <main style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px",
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, background: "#2563eb", borderRadius: 14, fontSize: "1.5rem", marginBottom: 16, boxShadow: "0 8px 24px rgba(37,99,235,.4)" }}>
            🎯
          </div>
          <h1 style={{ color: "#f8fafc", fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-.03em", marginBottom: 6 }}>
            Ingreso al panel
          </h1>
          <p style={{ color: "#64748b", fontSize: ".875rem" }}>
            Control de Asistencias — Fase 1 UX
          </p>
        </div>

        {/* Card */}
        <div style={{ background: "rgba(255,255,255,.97)", borderRadius: 20, padding: "32px 28px", boxShadow: "0 24px 80px rgba(0,0,0,.3)" }}>
          <div className="form-group" style={{ marginBottom: 18 }}>
            <label htmlFor="login-user">Usuario</label>
            <input
              id="login-user"
              value={u}
              onChange={(e) => setU(e.target.value)}
              placeholder="gerente.ventas, rrhh, admin…"
              autoComplete="username"
            />
            <p className="muted" style={{ marginTop: 4 }}>
              Cuentas: gerente/coordinador por gerencia, RRHH, admin
            </p>
          </div>

          <div className="form-group" style={{ marginBottom: 24 }}>
            <label htmlFor="login-pwd">Contraseña</label>
            <div style={{ position: "relative" }}>
              <input
                id="login-pwd"
                type={showPwd ? "text" : "password"}
                placeholder="••••••••"
                autoComplete="current-password"
                style={{ paddingRight: 44 }}
              />
              <button
                type="button"
                onClick={() => setShowPwd(s => !s)}
                style={{
                  position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer", fontSize: "1rem",
                  color: "#94a3b8", padding: "4px",
                  boxShadow: "none",
                }}
              >
                {showPwd ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          <Link href="/admin/dashboard" className="btn btn-primary" style={{ width: "100%", padding: "11px", fontSize: ".9375rem", borderRadius: 10, marginBottom: 12 }}>
            Ingresar (mock)
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0", color: "#94a3b8", fontSize: ".8rem" }}>
            <hr style={{ flex: 1, border: "none", borderTop: "1px solid #e2e8f4" }} />
            o
            <hr style={{ flex: 1, border: "none", borderTop: "1px solid #e2e8f4" }} />
          </div>

          <Link href="/cambio-clave" className="btn" style={{ width: "100%", padding: "10px", fontSize: ".875rem", borderRadius: 10, justifyContent: "center" }}>
            🔑 Primera vez / cambio de clave
          </Link>

          <p className="muted" style={{ textAlign: "center", marginTop: 20, fontSize: ".78rem" }}>
            Si requiere cambio de clave, redirige automáticamente.
          </p>
        </div>

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <Link href="/" style={{ color: "#475569", fontSize: ".8125rem" }}>← Volver al inicio</Link>
        </div>
      </div>
    </main>
  );
}
