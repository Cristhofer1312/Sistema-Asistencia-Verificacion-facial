"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type MsgTipo = "ok" | "bad" | "warn";
type Msg = { tipo: MsgTipo; titulo: string; detalle: string } | null;

const HORA_MOCK = new Date().toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

export default function Kiosco() {
  const video = useRef<HTMLVideoElement>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [cooldown, setCooldown] = useState<string | null>(null);
  const [camOk, setCamOk] = useState(false);
  const [hora, setHora] = useState(HORA_MOCK);

  useEffect(() => {
    const tick = setInterval(() => {
      setHora(new Date().toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true });
        if (video.current) video.current.srcObject = s;
        setCamOk(true);
      } catch { /* demo sin cámara */ }
    })();
  }, []);

  function show(m: Msg, ms = 3000) {
    setMsg(m);
    const t = window.setTimeout(() => setMsg(null), ms);
    return t;
  }

  const stateBg: Record<MsgTipo, string> = {
    ok:   "linear-gradient(135deg,rgba(5,150,105,.22),rgba(5,150,105,.08))",
    bad:  "linear-gradient(135deg,rgba(220,38,38,.22),rgba(220,38,38,.08))",
    warn: "linear-gradient(135deg,rgba(217,119,6,.22),rgba(217,119,6,.08))",
  };
  const stateColor: Record<MsgTipo, string> = { ok: "#34d399", bad: "#f87171", warn: "#fbbf24" };
  const stateIcon:  Record<MsgTipo, string> = { ok: "✅", bad: "❌", warn: "⚠️" };

  return (
    <main style={{
      minHeight: "100vh",
      background: "#050a14",
      display: "flex", flexDirection: "column",
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {/* Topbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,.07)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, background: "#2563eb", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem" }}>🎯</div>
          <div>
            <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: ".9rem" }}>Kiosco de Fichaje</div>
            <div style={{ color: "#475569", fontSize: ".72rem" }}>Fase 1 UX · mock</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "#60a5fa", fontSize: "1.5rem", fontWeight: 800, fontVariantNumeric: "tabular-nums", letterSpacing: ".02em" }}>{hora}</div>
          <div style={{ color: "#334155", fontSize: ".72rem" }}>
            {new Date().toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long" })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px" }}>
        {/* Camera */}
        <div className="kiosco" style={{ width: "100%", maxWidth: 680 }}>
          <video ref={video} autoPlay muted playsInline />

          {/* Scan ring */}
          {!msg && <div className="kiosco-scan-ring" />}

          {/* Overlay top */}
          <div className="overlay-top">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: camOk ? "#34d399" : "#f87171", boxShadow: camOk ? "0 0 8px #34d399" : "0 0 8px #f87171", animation: "pulse-ring 2s ease infinite" }} />
              <span style={{ color: "#94a3b8", fontSize: ".72rem", fontWeight: 600 }}>{camOk ? "CÁMARA ACTIVA" : "SIN CÁMARA (DEMO)"}</span>
            </div>
            <div style={{ background: "rgba(37,99,235,.2)", border: "1px solid rgba(96,165,250,.3)", borderRadius: 6, padding: "3px 10px" }}>
              <span style={{ color: "#93c5fd", fontSize: ".72rem", fontWeight: 600 }}>Cooldown 30 min · Límite 08:00 · Margen 60 min</span>
            </div>
          </div>

          {/* Bottom overlay */}
          <div className="overlay">
            {!msg && (
              <div style={{ textAlign: "center" }}>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: "1.1rem", marginBottom: 6 }}>
                  En espera…
                </div>
                <div style={{ color: "#64748b", fontSize: ".875rem" }}>
                  Presente un solo rostro frente a la cámara
                </div>
              </div>
            )}
            {msg && (
              <div style={{
                background: stateBg[msg.tipo],
                border: `1.5px solid ${stateColor[msg.tipo]}40`,
                borderLeft: `4px solid ${stateColor[msg.tipo]}`,
                borderRadius: 12,
                padding: "16px 20px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: "1.25rem" }}>{stateIcon[msg.tipo]}</span>
                  <span style={{ color: "#f1f5f9", fontWeight: 700, fontSize: "1rem" }}>{msg.titulo}</span>
                </div>
                <div style={{ color: "#94a3b8", fontSize: ".875rem", paddingLeft: 34 }}>{msg.detalle}</div>
                {cooldown && (
                  <div style={{ color: "#fbbf24", fontSize: ".8rem", paddingLeft: 34, marginTop: 6, fontWeight: 600 }}>
                    ⏱ Cooldown: {cooldown}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Simulation buttons */}
        <div style={{ marginTop: 24, display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", maxWidth: 680, width: "100%" }}>
          <button className="btn btn-sm" style={{ background: "rgba(5,150,105,.15)", border: "1.5px solid rgba(52,211,153,.3)", color: "#34d399" }}
            onClick={() => show({ tipo: "ok", titulo: "Entrada A TIEMPO — Ana Pérez", detalle: "07:55 · Jornada abierta. Puede marcar salida a partir de las 17:00." })}>
            ✅ A tiempo
          </button>
          <button className="btn btn-sm" style={{ background: "rgba(217,119,6,.15)", border: "1.5px solid rgba(251,191,36,.3)", color: "#fbbf24" }}
            onClick={() => show({ tipo: "warn", titulo: "Entrada TARDE — Luis Gómez", detalle: "08:40 · Dentro del margen 60 min. Se registra como TARDE." })}>
            ⚠️ Tarde
          </button>
          <button className="btn btn-sm" style={{ background: "rgba(5,150,105,.15)", border: "1.5px solid rgba(52,211,153,.3)", color: "#34d399" }}
            onClick={() => { setCooldown("29:59 min para poder remarcar"); show({ tipo: "ok", titulo: "Salida COMPLETADO + 0.2 h extra", detalle: "17:10 · Jornada cerrada. ¡Hasta mañana!" }); }}>
            🏁 Salida + extras
          </button>
          <button className="btn btn-sm" style={{ background: "rgba(220,38,38,.15)", border: "1.5px solid rgba(248,113,113,.3)", color: "#f87171" }}
            onClick={() => show({ tipo: "bad", titulo: "Fuera de horario — requiere autorización", detalle: "Superó el margen 60 min y no tiene pase previo. Queda FALTA proyectada." }, 6000)}>
            🚫 Fuera de margen
          </button>
          <button className="btn btn-sm" style={{ background: "rgba(220,38,38,.12)", border: "1.5px solid rgba(248,113,113,.25)", color: "#f87171" }}
            onClick={() => show({ tipo: "bad", titulo: "Rostro no registrado", detalle: "No se encontró coincidencia. Intente de nuevo. (10s)" }, 10000)}>
            👤 No registrado 10s
          </button>
          <button className="btn btn-sm" style={{ background: "rgba(217,119,6,.12)", border: "1.5px solid rgba(251,191,36,.25)", color: "#fbbf24" }}
            onClick={() => show({ tipo: "warn", titulo: "Solo una persona", detalle: "Se detectó más de un rostro en el encuadre. (5s)" }, 5000)}>
            👥 Multi-rostro 5s
          </button>
        </div>

        <p style={{ color: "#334155", fontSize: ".75rem", marginTop: 20, textAlign: "center" }}>
          Fase 2: integración @vladmandic/face-api · d&lt;0.5 · parpadeo/movimiento · 1 req/s · /api/fichaje
        </p>
      </div>

      {/* Back */}
      <div style={{ padding: "12px 24px", borderTop: "1px solid rgba(255,255,255,.06)", textAlign: "center" }}>
        <Link href="/" style={{ color: "#475569", fontSize: ".8125rem" }}>← Volver al inicio</Link>
      </div>
    </main>
  );
}
