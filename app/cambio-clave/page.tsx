"use client";
import { useState } from "react";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function CambioClave() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nueva || !confirmar) {
      setError("Complete la nueva contraseña y su confirmación.");
      return;
    }
    if (nueva !== confirmar) {
      setError("La confirmación no coincide.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/cambio-clave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(actual ? { actual } : {}),
          nueva,
          confirmar,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "No se pudo cambiar la clave.");
        return;
      }
      // Cerrar sesión antigua y forzar inicio manual con la nueva clave
      await signOut({ redirect: false });
      window.location.href = "/?cambiada=1";
    } catch {
      setError("Error de conexión. Intente de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px",
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, background: "#d97706", borderRadius: 12, fontSize: "1.4rem", marginBottom: 14, boxShadow: "0 8px 24px rgba(217,119,6,.4)" }}>
            
          </div>
          <h1 style={{ color: "#f8fafc", fontSize: "1.4rem", fontWeight: 800, letterSpacing: "-.03em", marginBottom: 6 }}>
            Cambio de clave
          </h1>
          <p style={{ color: "#64748b", fontSize: ".875rem" }}>
            Su cuenta requiere un cambio de contraseña antes de continuar.
          </p>
        </div>

        {/* Card */}
        <form onSubmit={onSubmit} style={{ background: "rgba(255,255,255,.97)", borderRadius: 20, padding: "28px 24px", boxShadow: "0 24px 80px rgba(0,0,0,.3)" }}>
          <div className="alert alert-warn" style={{ marginBottom: 20 }}>
            <span></span>
            <span>Primera vez o contraseña temporal detectada. Defina una clave definitiva.</span>
          </div>

          {status === "unauthenticated" && (
            <div className="alert alert-warn" style={{ marginBottom: 16 }}>
              <span></span>
              <span>Debe <Link href="/">iniciar sesión</Link> antes de cambiar la clave.</span>
            </div>
          )}

          {error && (
            <div className="alert alert-warn" role="alert" style={{ marginBottom: 16 }}>
              <span></span>
              <span>{error}</span>
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label htmlFor="cc-actual">Contraseña actual (opcional)</label>
            <input
              id="cc-actual"
              type="password"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              placeholder="Su clave temporal"
              autoComplete="current-password"
              disabled={loading}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label htmlFor="cc-nueva">Nueva contraseña <span style={{ color: "var(--bad)" }}>*</span></label>
            <input
              id="cc-nueva"
              type="password"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              placeholder="Mínimo 8 caracteres, mayúscula, minúscula y número"
              autoComplete="new-password"
              disabled={loading}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 22 }}>
            <label htmlFor="cc-conf">Confirmar contraseña <span style={{ color: "var(--bad)" }}>*</span></label>
            <input
              id="cc-conf"
              type="password"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              placeholder="Repita la contraseña"
              autoComplete="new-password"
              disabled={loading}
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading || status === "unauthenticated"} style={{ width: "100%", padding: "11px", fontSize: ".9375rem", borderRadius: 10, marginBottom: 12, justifyContent: "center" }}>
            {loading ? "Guardando…" : " Guardar y entrar"}
          </button>
          <Link href="/" className="btn btn-ghost" style={{ width: "100%", justifyContent: "center" }}>
            ← Volver al login
          </Link>
        </form>
      </div>
    </main>
  );
}
