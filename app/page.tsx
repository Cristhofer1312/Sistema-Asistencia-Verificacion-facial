"use client";
import Link from "next/link";

export default function Home() {
  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
      {/* Hero */}
      <div style={{ textAlign: "center", marginBottom: 48, maxWidth: 600 }}>
        <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 72, height: 72, background: "#2563eb", borderRadius: 18, fontSize: "2rem", marginBottom: 24, boxShadow: "0 8px 32px rgba(37,99,235,.4)" }}>
          🎯
        </div>
        <h1 style={{ color: "#f8fafc", fontSize: "2.4rem", fontWeight: 800, letterSpacing: "-.04em", lineHeight: 1.2, marginBottom: 14, fontFamily: "'Inter', system-ui, sans-serif" }}>
          Control de Asistencias<br />
          <span style={{ background: "linear-gradient(90deg,#60a5fa,#34d399)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            con Reconocimiento Facial
          </span>
        </h1>
        <p style={{ color: "#94a3b8", fontSize: "1rem", lineHeight: 1.7, fontFamily: "'Inter', system-ui, sans-serif" }}>
          Maqueta navegable — Fase 1 UX · SRS v3.2<br />
          Toda la lógica es mock local. Los controladores se integran en Fase 2.
        </p>
      </div>

      {/* Cards de acceso */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, width: "100%", maxWidth: 680, marginBottom: 36 }}>
        <Link href="/kiosco" style={{ background: "rgba(255,255,255,.07)", border: "1.5px solid rgba(255,255,255,.12)", borderRadius: 16, padding: "24px 22px", textDecoration: "none", display: "flex", flexDirection: "column", gap: 10, transition: "background .2s, transform .2s", color: "#f1f5f9", fontFamily: "'Inter', system-ui, sans-serif" }}
          onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = "rgba(37,99,235,.18)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(96,165,250,.4)"; }}
          onMouseOut={e  => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.07)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,.12)"; }}>
          <span style={{ fontSize: "1.8rem" }}>📷</span>
          <span style={{ fontSize: "1rem", fontWeight: 700 }}>Kiosco</span>
          <span style={{ fontSize: ".8125rem", color: "#64748b" }}>Fichaje facial en tiempo real</span>
        </Link>

        <Link href="/login" style={{ background: "rgba(255,255,255,.07)", border: "1.5px solid rgba(255,255,255,.12)", borderRadius: 16, padding: "24px 22px", textDecoration: "none", display: "flex", flexDirection: "column", gap: 10, transition: "background .2s", color: "#f1f5f9", fontFamily: "'Inter', system-ui, sans-serif" }}
          onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = "rgba(37,99,235,.18)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(96,165,250,.4)"; }}
          onMouseOut={e  => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.07)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,.12)"; }}>
          <span style={{ fontSize: "1.8rem" }}>🔐</span>
          <span style={{ fontSize: "1rem", fontWeight: 700 }}>Ingreso</span>
          <span style={{ fontSize: ".8125rem", color: "#64748b" }}>Panel administrativo</span>
        </Link>

        <Link href="/admin/dashboard" style={{ background: "linear-gradient(135deg, rgba(37,99,235,.3), rgba(37,99,235,.1))", border: "1.5px solid rgba(96,165,250,.35)", borderRadius: 16, padding: "24px 22px", textDecoration: "none", display: "flex", flexDirection: "column", gap: 10, transition: "background .2s", color: "#f1f5f9", fontFamily: "'Inter', system-ui, sans-serif" }}
          onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = "linear-gradient(135deg, rgba(37,99,235,.45), rgba(37,99,235,.2))"; }}
          onMouseOut={e  => { (e.currentTarget as HTMLElement).style.background = "linear-gradient(135deg, rgba(37,99,235,.3), rgba(37,99,235,.1))"; }}>
          <span style={{ fontSize: "1.8rem" }}>📊</span>
          <span style={{ fontSize: "1rem", fontWeight: 700 }}>Admin (mock)</span>
          <span style={{ fontSize: ".8125rem", color: "#93c5fd" }}>Acceso directo sin login</span>
        </Link>
      </div>

      {/* Regla vigente */}
      <div style={{ background: "rgba(255,255,255,.06)", border: "1.5px solid rgba(255,255,255,.1)", borderRadius: 14, padding: "18px 24px", maxWidth: 520, width: "100%", fontFamily: "'Inter', system-ui, sans-serif" }}>
        <p style={{ fontSize: ".72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "#475569", marginBottom: 10 }}>Regla vigente (mock)</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px" }}>
          {[
            ["Entrada límite", "08:00"],
            ["Salida ref.", "17:00"],
            ["Margen tardanza", "60 min"],
            ["Cooldown kiosco", "30 min"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: ".8rem", color: "#64748b" }}>{k}</span>
              <span style={{ fontSize: ".95rem", fontWeight: 700, color: "#e2e8f0" }}>{v}</span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: ".78rem", color: "#475569", marginTop: 10 }}>
          Fuera de margen sin pase previo → FALTA. Con pase de Gerente/RRHH → JUSTIFICADO.
        </p>
      </div>
    </main>
  );
}
