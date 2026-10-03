"use client";
import Link from "next/link";


export default function NotFound() {
  return (
    <main style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #0f172a 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Inter', system-ui, sans-serif",
      padding: 24,
    }}>
      <div style={{ textAlign: "center", maxWidth: 480 }}>

        {/* 404 number */}
        <div style={{
          fontSize: "clamp(5rem,18vw,9rem)",
          fontWeight: 900,
          letterSpacing: "-.06em",
          lineHeight: 1,
          background: "linear-gradient(135deg, #3b82f6, #6366f1, #8b5cf6)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          marginBottom: 8,
          userSelect: "none",
        }}>
          404
        </div>

        {/* Icon */}
        <div style={{ fontSize: "2.5rem", marginBottom: 20, opacity: .7 }}></div>

        {/* Message */}
        <h1 style={{ color: "#f1f5f9", fontSize: "1.5rem", fontWeight: 800, marginBottom: 10 }}>
          Página no encontrada
        </h1>
        <p style={{ color: "#64748b", fontSize: "1rem", lineHeight: 1.7, marginBottom: 32 }}>
          La ruta que buscas no existe o fue movida.<br />
          Verifique la URL o regrese a un lugar conocido.
        </p>

        {/* Actions */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link
            href="/"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "#2563eb", color: "#fff",
              padding: "10px 22px", borderRadius: 10,
              fontWeight: 700, fontSize: ".9375rem",
              textDecoration: "none",
              boxShadow: "0 4px 20px rgba(37,99,235,.4)",
              transition: "opacity .15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = ".85")}
            onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
          >
             Ir al inicio
          </Link>
          <Link
            href="/admin/dashboard"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "rgba(255,255,255,.07)", color: "#94a3b8",
              border: "1.5px solid rgba(255,255,255,.12)",
              padding: "10px 22px", borderRadius: 10,
              fontWeight: 600, fontSize: ".9375rem",
              textDecoration: "none",
              transition: "all .15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.12)"; (e.currentTarget as HTMLElement).style.color = "#f1f5f9"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.07)"; (e.currentTarget as HTMLElement).style.color = "#94a3b8"; }}
          >
             Dashboard
          </Link>
        </div>

        {/* Decoration */}
        <p style={{ color: "#1e293b", fontSize: ".72rem", marginTop: 40 }}>
          AsistenciaFace · SRS v3.2
        </p>
      </div>
    </main>
  );
}
