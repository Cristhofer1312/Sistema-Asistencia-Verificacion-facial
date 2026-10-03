"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export default function Login() {
  return (
    <Suspense fallback={<main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>Cargando…</main>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: session, status } = useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const callbackUrl = params.get("callbackUrl") || "/admin/dashboard";

  // Si ya hay sesión, redirigir según claveInicial
  useEffect(() => {
    if (status === "authenticated") {
      const claveInicial = (session?.user as any)?.claveInicial;
      router.replace(claveInicial ? "/cambio-clave" : callbackUrl);
    }
  }, [status, session, router, callbackUrl]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError("Ingrese usuario y contraseña.");
      return;
    }
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        username: username.trim(),
        password,
        redirect: false,
      });
      if (!res || res.error) {
        setError("Credenciales inválidas o usuario inactivo.");
        return;
      }
      // Refrescar sesión del servidor y redirigir según claveInicial
      router.refresh();
      // Pequeña espera para que la cookie se propague, luego ir al destino.
      // El middleware redirigirá a /cambio-clave si claveInicial=true.
      router.push(callbackUrl);
      router.refresh();
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
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, background: "#2563eb", borderRadius: 14, fontSize: "1.5rem", marginBottom: 16, boxShadow: "0 8px 24px rgba(37,99,235,.4)" }}>
            
          </div>
          <h1 style={{ color: "#f8fafc", fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-.03em", marginBottom: 6 }}>
            Ingreso al panel
          </h1>
          <p style={{ color: "#64748b", fontSize: ".875rem" }}>
            Control de Asistencias — Fase 1 UX
          </p>
        </div>

        {/* Card */}
        <form onSubmit={onSubmit} style={{ background: "rgba(255,255,255,.97)", borderRadius: 20, padding: "32px 28px", boxShadow: "0 24px 80px rgba(0,0,0,.3)" }}>
          {params.get("cambiada") === "1" && (
            <div className="alert" style={{ marginBottom: 16, background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46", borderRadius: 10, padding: "10px 12px", fontSize: ".85rem" }}>
              Clave actualizada. Ingrese con su nueva contraseña.
            </div>
          )}
          {error && (
            <div className="alert alert-warn" role="alert" style={{ marginBottom: 16 }}>
              <span></span>
              <span>{error}</span>
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 18 }}>
            <label htmlFor="login-user">Usuario</label>
            <input
              id="login-user"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="gerente.ventas, rrhh, admin…"
              autoComplete="username"
              disabled={loading}
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                style={{ paddingRight: 44 }}
                disabled={loading}
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
                {showPwd ? "" : ""}
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: "100%", padding: "11px", fontSize: ".9375rem", borderRadius: 10, marginBottom: 12 }}>
            {loading ? "Verificando…" : "Ingresar"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0", color: "#94a3b8", fontSize: ".8rem" }}>
            <hr style={{ flex: 1, border: "none", borderTop: "1px solid #e2e8f4" }} />
            o
            <hr style={{ flex: 1, border: "none", borderTop: "1px solid #e2e8f4" }} />
          </div>

          <Link href="/cambio-clave" className="btn" style={{ width: "100%", padding: "10px", fontSize: ".875rem", borderRadius: 10, justifyContent: "center" }}>
             Primera vez / cambio de clave
          </Link>

          <p className="muted" style={{ textAlign: "center", marginTop: 20, fontSize: ".78rem" }}>
            Si requiere cambio de clave, redirige automáticamente.
          </p>
        </form>

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <Link href="/kiosco" style={{ color: "#94a3b8", fontSize: ".875rem", textDecoration: "none", fontWeight: 500, padding: "8px 16px", borderRadius: 8, background: "rgba(255,255,255,0.05)" }}>Ir al Kiosco de Asistencia</Link>
        </div>
      </div>
    </main>
  );
}
