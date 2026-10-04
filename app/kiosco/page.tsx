"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { formatExtras } from "@/lib/types";

const FaceIdentifyDynamic = dynamic(() => import("@/components/face/FaceIdentify").then(m => m.FaceIdentify), {
  ssr: false,
  loading: () => <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400, color: "#94a3b8" }}>Cargando módulo de reconocimiento…</div>,
});

const MSG_TYPES = {
  ok: { bg: "rgba(5,150,105,.18)", border: "#34d39950", color: "#34d399", icon: "" },
  bad: { bg: "rgba(220,38,38,.20)", border: "#f8717150", color: "#f87171", icon: "" },
  warn: { bg: "rgba(217,119,6,.20)", border: "#fbbf2450", color: "#fbbf24", icon: "" },
};

function GuideRow({ label, ok, hint }: { label: string; ok: boolean | undefined; hint: string | undefined }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: ".85rem" }}>
      <span style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${ok ? "#10b981" : "#ef4444"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {ok ? <span style={{ color: "#10b981", fontSize: ".7rem", fontWeight: 700 }}></span> : <span style={{ color: "#ef4444", fontSize: ".6rem", fontWeight: 700 }}></span>}
      </span>
      <span style={{ color: ok ? "#e2e8f0" : "#94a3b8", fontWeight: ok ? 600 : 400, minWidth: 80 }}>{label}</span>
      {hint && <span style={{ color: "#64748b", fontSize: ".75rem", flex: 1 }}>{hint}</span>}
    </div>
  );
}

function GuideDot({ label, ok }: { label: string; ok: boolean | undefined }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1 }}>
      <div style={{ width: 12, height: 12, borderRadius: "50%", background: ok ? "#10b981" : "#374151", border: `2px solid ${ok ? "#10b981" : "#4b5563"}` }} />
      <span style={{ color: ok ? "#10b981" : "#64748b", fontSize: ".7rem", fontWeight: 500 }}>{label}</span>
    </div>
  );
}

export default function Kiosco() {
  const [lastResult, setLastResult] = useState<{
    tipo: "entrada" | "salida" | "error" | "warn";
    estado: string;
    nombre: string;
    extras?: number;
    previewCanvas?: HTMLCanvasElement | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hora, setHora] = useState(() =>
    new Date().toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
  );
  const [camOk, setCamOk] = useState(false);
  const [faceQuality, setFaceQuality] = useState<{
    oneFace: boolean; oneFaceHint: string;
    centered: boolean; centeredHint: string;
    distance: boolean; distanceHint: string;
    frontLight: boolean; frontLightHint: string;
    allOk: boolean;
  } | null>(null);
  const [livenessQuality, setLivenessQuality] = useState<{
    move: boolean;
    step: string;
    stepIndex: number;
    totalSteps: number;
  } | null>(null);
  const [regla, setRegla] = useState<any>(null);

  useEffect(() => {
    fetch("/api/reglas")
      .then(r => r.json())
      .then(data => {
        if (data && data.length > 0) setRegla(data[0]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const id = setInterval(() =>
      setHora(new Date().toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }))
    , 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    navigator.mediaDevices?.getUserMedia({ video: true })
      .then(s => { 
        setCamOk(true);
        s.getTracks().forEach(t => t.stop());
      })
      .catch(() => {});
  }, []);

  const handleMatch = async (data: { 
    ok: boolean; 
    tipo: string; 
    msg: string; 
    extrasH?: number;
    empleadoId: number | undefined;
    nombre: string | undefined;
    apellido: string | undefined;
    cedula: string | undefined;
    error?: string;
  }) => {
    try {
      if (!data.ok || data.error) {
        handleApiError(data, data.tipo === 'cooldown' ? 429 : data.tipo === 'duplicado' ? 400 : 404, { nombre: data.nombre ?? '', apellido: data.apellido ?? '' });
        return;
      }

      // El match endpoint ya hizo el fichaje; usar su respuesta directamente
      const isEntrada = data.tipo?.includes("entrada") || data.tipo === "a_tiempo" || data.tipo === "tarde" || data.tipo === "justificado" || data.tipo === "feriado" || data.tipo === "vacaciones" || data.tipo === "reposo_medico";
      setLastResult({
        tipo: isEntrada ? "entrada" : "salida",
        estado: data.msg,
        nombre: `${data.nombre} ${data.apellido}`,
        extras: data.extrasH,
        previewCanvas: previewCanvasRef.current,
      });
      setTimeout(() => setLastResult(null), 2000);
    } catch (e) {
      setError("Error de conexión con el servidor");
    }
  };

  const handleApiError = (data: any, status: number, empleado?: { nombre: string; apellido: string }) => {
    const isWarn = data.tipo === "cooldown" || data.tipo === "duplicado" || data.tipo === "reposo_medico";
    setLastResult({
      tipo: isWarn ? "warn" : "error",
      estado: data.msg || "Error desconocido",
      nombre: empleado ? `${empleado.nombre} ${empleado.apellido}` : "",
      previewCanvas: undefined,
    });
    setTimeout(() => setLastResult(null), 2000);
  };

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const FECHA_LABEL = new Date().toLocaleDateString("es-VE", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const handleMultiFace = () => {};
  const handleUnknown = () => {};
  const handleCooldown = (minutos: number) => {};

  return (
    <main
      style={{ minHeight: "100vh", background: "#050a14", display: "flex", flexDirection: "column", fontFamily: "'Inter', system-ui, sans-serif" }}
      aria-label="Kiosco de fichaje facial"
    >
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: "1px solid rgba(255,255,255,.07)" }} role="banner">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div aria-hidden="true" style={{ width: 36, height: 36, background: "#2563eb", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem" }}></div>
          <div>
            <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: "1rem" }}>Kiosco de Fichaje</div>
            <div style={{ color: "#475569", fontSize: ".75rem" }}>Control de asistencias · Fase 2</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            aria-live="polite"
            aria-label={`Hora actual: ${hora}`}
            style={{ color: "#60a5fa", fontSize: "1.65rem", fontWeight: 800, fontVariantNumeric: "tabular-nums", letterSpacing: ".02em", lineHeight: 1 }}
            suppressHydrationWarning
          >
            {hora}
          </div>
          <div style={{ color: "#475569", fontSize: ".72rem", marginTop: 2 }} aria-label={FECHA_LABEL} suppressHydrationWarning>
            {FECHA_LABEL}
          </div>
        </div>
      </header>

      <div style={{ flex: 1, display: "flex", flexDirection: "row", flexWrap: "nowrap", alignItems: "stretch", justifyContent: "center", gap: 40, padding: "40px", width: "100%", maxWidth: 1800, margin: "0 auto" }}>
        
        {/* COLUMNA IZQUIERDA: Normas de Posición */}
        <div style={{ width: 320, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12, order: 1 }}>
          <div style={{ background: "rgba(15,23,42,0.9)", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 16, padding: "28px 24px", flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: "1.2rem", color: "#f1f5f9", marginBottom: 16 }}>Posición correcta</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <GuideRow label="1 rostro" ok={faceQuality?.oneFace} hint={faceQuality?.oneFaceHint} />
              <GuideRow label="Centrado" ok={faceQuality?.centered} hint={faceQuality?.centeredHint} />
              <GuideRow label="Distancia" ok={faceQuality?.distance} hint={faceQuality?.distanceHint} />
              <GuideRow label="Frente + luz" ok={faceQuality?.frontLight} hint={faceQuality?.frontLightHint} />
            </div>
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid rgba(148,163,184,0.2)" }}>
              {livenessQuality && livenessQuality.totalSteps > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".85rem" }}>
                    <span style={{ color: "#64748b", minWidth: 80 }}>Desafío</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      {Array.from({ length: livenessQuality.totalSteps }, (_, i) => (
                        <div key={i} style={{ 
                          width: 12, height: 12, borderRadius: "50%", 
                          background: i < livenessQuality.stepIndex ? "#10b981" : 
                                     i === livenessQuality.stepIndex ? "#f59e0b" : "#374151",
                          border: `2px solid ${i < livenessQuality.stepIndex ? "#10b981" : i === livenessQuality.stepIndex ? "#f59e0b" : "#4b5563"}`,
                          transition: "all 0.3s"
                        }} />
                      ))}
                    </div>
                    <span style={{ color: "#fbbf24", fontSize: ".75rem", marginLeft: 8 }}>
                      {livenessQuality.step} ({livenessQuality.stepIndex + 1}/{livenessQuality.totalSteps})
                    </span>
                  </div>
                </div>
              ) : (
                <GuideDot label="Movimiento" ok={livenessQuality?.move} />
              )}
            </div>
            <div style={{ marginTop: 20, padding: 12, borderRadius: 8, background: faceQuality?.allOk ? "rgba(5,150,105,0.2)" : "rgba(217,119,6,0.2)", border: `1px solid ${faceQuality?.allOk ? "#10b981" : "#f59e0b"}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: "1.05rem", color: faceQuality?.allOk ? "#10b981" : "#fbbf24" }}>{faceQuality?.allOk ? "Listo para escanear" : "Ajusta posición"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* COLUMNA CENTRAL: Cámara */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", order: 2, minWidth: 500 }}>
          <div style={{ width: "100%", maxWidth: 1000, margin: "0 auto", borderRadius: 16, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
            <FaceIdentifyDynamic
              onMatch={handleMatch}
              onMultiFace={handleMultiFace}
              onUnknown={handleUnknown}
              onCooldown={handleCooldown}
              onError={setError}
              onQualityChange={setFaceQuality}
              onLivenessChange={setLivenessQuality}
            />
          </div>
        </div>
        
        {/* COLUMNA DERECHA: Reglas de Fichaje */}
        <div style={{ width: 320, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12, order: 3 }}>
          <div style={{ background: "rgba(15,23,42,0.9)", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 16, padding: "28px 24px", flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: "1.2rem", color: "#f1f5f9", marginBottom: 16 }}>Reglas de fichaje actuales</div>
            {regla ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 10, borderBottom: "1px solid rgba(148,163,184,0.1)" }}>
                  <span style={{ color: "#94a3b8", fontSize: "1rem" }}>Límite de entrada</span>
                  <span style={{ color: "#f1f5f9", fontSize: "1.1rem", fontWeight: 700 }}>{regla.horaLimite}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 10, borderBottom: "1px solid rgba(148,163,184,0.1)" }}>
                  <span style={{ color: "#94a3b8", fontSize: "1rem" }}>Salida de ref.</span>
                  <span style={{ color: "#f1f5f9", fontSize: "1.1rem", fontWeight: 700 }}>{regla.horaReferencia}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 10, borderBottom: "1px solid rgba(148,163,184,0.1)" }}>
                  <span style={{ color: "#94a3b8", fontSize: "1rem" }}>Margen</span>
                  <span style={{ color: "#f1f5f9", fontSize: "1.1rem", fontWeight: 700 }}>{regla.margenMin} min</span>
                </div>
                <p style={{ fontSize: ".85rem", color: "#64748b", marginTop: 8, lineHeight: 1.5 }}>
                  Entradas fuera del margen sin justificación resultarán en Falta. Extras se calculan a la salida.
                </p>
              </div>
            ) : (
              <div style={{ color: "#94a3b8", fontSize: ".9rem" }}>Cargando reglas...</div>
            )}
          </div>
        </div>
      </div>

      {lastResult && (
        <div style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          zIndex: 1000, width: "90%", maxWidth: 400,
          background: "rgba(15,23,42,0.98)", 
          border: `2px solid ${lastResult.tipo === "entrada" ? "#10b981" : lastResult.tipo === "salida" ? "#3b82f6" : lastResult.tipo === "warn" ? "#eab308" : "#ef4444"}`,
          borderRadius: 16, padding: 24, textAlign: "center",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          animation: "fadeIn 0.3s ease"
        }}>
          <div style={{ fontSize: "2rem", marginBottom: 8 }}>
            {lastResult.tipo === "entrada" ? "" : 
             lastResult.tipo === "salida" ? "" : 
             lastResult.tipo === "warn" ? "" : ""}
          </div>
          <h2 style={{ 
            color: lastResult.tipo === "entrada" ? "#10b981" : lastResult.tipo === "salida" ? "#3b82f6" : lastResult.tipo === "warn" ? "#eab308" : "#ef4444", 
            marginBottom: 4, fontSize: "1.5rem" 
          }}>
            {lastResult.nombre}
          </h2>
          <p style={{ color: "#94a3b8", marginBottom: 12, fontSize: "1.1rem" }}>
            {lastResult.estado}
          </p>
          {lastResult.previewCanvas && (
            <canvas width={128} height={128} style={{ 
              margin: "0 auto 12px", borderRadius: 8, 
              border: `2px solid ${lastResult.tipo === "entrada" ? "#10b981" : lastResult.tipo === "salida" ? "#3b82f6" : lastResult.tipo === "warn" ? "#eab308" : "#ef4444"}` 
            }}
              ref={(c) => { if (c) c.getContext("2d")?.drawImage(lastResult.previewCanvas!, 0, 0); }}
            />
          )}
          {lastResult.extras && lastResult.extras > 0 ? (
            <p style={{ color: "#10b981", fontWeight: 700, fontSize: "1.2rem" }}>
              {formatExtras(lastResult.extras)} extra
            </p>
          ) : null}
        </div>
      )}

      <footer style={{ padding: "12px 24px", borderTop: "1px solid rgba(255,255,255,.06)", textAlign: "center" }} role="contentinfo">
        <Link
          href="/"
          style={{ color: "#475569", fontSize: ".875rem" }}
          aria-label="Volver al inicio"
        >
          ← Volver al inicio
        </Link>
      </footer>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>
    </main>
  );
}