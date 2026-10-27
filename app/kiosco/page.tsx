"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { formatExtras } from "@/lib/types";
import type { IdentifyState } from "@/components/face/FaceIdentify";

const FaceIdentifyDynamic = dynamic(() => import("@/components/face/FaceIdentify").then(m => m.FaceIdentify), {
  ssr: false,
  loading: () => <div className="kq-cam-placeholder">Cargando módulo de reconocimiento…</div>,
});

type Tono = "neutral" | "accent" | "ok" | "warn" | "bad";

type Resultado = {
  tipo: "entrada" | "salida" | "warn" | "error";
  nombre: string;
  estado: string;
  extras?: number;
  duracionMs: number;
};

type Calidad = {
  oneFace: boolean; oneFaceHint: string;
  centered: boolean; centeredHint: string;
  distance: boolean; distanceHint: string;
  frontLight: boolean; frontLightHint: string;
  allOk: boolean;
  ts: number;
};

type Liveness = { step: string; stepIndex: number; totalSteps: number; steps?: string[] };

// La calidad solo llega cuando hay un rostro en cuadro: si deja de llegar, el dato es viejo.
const CALIDAD_VIGENCIA_MS = 1500;

const PASO_TEXTO: Record<string, string> = {
  IZQUIERDA: "Gire la cabeza a la izquierda",
  DERECHA: "Gire la cabeza a la derecha",
  FRENTE: "Mire al frente",
};
const PASO_CORTO: Record<string, string> = { IZQUIERDA: "Izquierda", DERECHA: "Derecha", FRENTE: "Frente" };

const RESULTADO_META: Record<Resultado["tipo"], { titulo: string; tono: Tono }> = {
  entrada: { titulo: "Entrada registrada", tono: "ok" },
  salida: { titulo: "Salida registrada", tono: "accent" },
  warn: { titulo: "Atención", tono: "warn" },
  error: { titulo: "No se registró", tono: "bad" },
};

function instruccion(estado: IdentifyState, mensaje: string, q: Calidad | null, live: Liveness | null, error: string | null): { texto: string; tono: Tono } {
  if (error) return { texto: error, tono: "bad" };
  switch (estado) {
    case "loading_models": return { texto: "Preparando el reconocimiento…", tono: "neutral" };
    case "starting_camera": return { texto: "Iniciando cámara…", tono: "neutral" };
    case "challenge_requested": return { texto: "Mantenga la posición…", tono: "accent" };
    case "challenge_active": return { texto: (live && PASO_TEXTO[live.step]) || "Siga la indicación", tono: "accent" };
    case "matching": return { texto: "Verificando identidad…", tono: "accent" };
    case "success": return { texto: "Registro completado", tono: "ok" };
    case "multi_face": return { texto: "Solo una persona frente a la cámara", tono: "warn" };
    case "unknown": return { texto: "Rostro no reconocido", tono: "bad" };
    case "rejected": return { texto: mensaje || "Marcaje rechazado", tono: "warn" };
    case "cooldown": return { texto: "Espere un momento para volver a marcar", tono: "warn" };
    case "error": return { texto: "El lector presentó un error", tono: "bad" };
    case "scanning":
    default: {
      if (!q) return { texto: "Colóquese frente a la cámara", tono: "neutral" };
      const pista = q.oneFaceHint || q.distanceHint || q.centeredHint || q.frontLightHint;
      if (!q.allOk) return { texto: pista || "Ajuste su posición", tono: "warn" };
      return { texto: "Perfecto, mantenga la posición", tono: "ok" };
    }
  }
}

function Icono({ tipo }: { tipo: Resultado["tipo"] }) {
  const comun = { width: 44, height: 44, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (tipo === "entrada") return <svg {...comun}><path d="M20 6 9 17l-5-5" /></svg>;
  if (tipo === "salida") return <svg {...comun}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>;
  if (tipo === "warn") return <svg {...comun}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>;
  return <svg {...comun}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>;
}

const horaVE = () => new Date().toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit", hour12: false });
const fechaVE = () => new Date().toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export default function Kiosco() {
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hora, setHora] = useState(horaVE);
  const [fecha, setFecha] = useState(fechaVE);
  const [estado, setEstado] = useState<IdentifyState>("loading_models");
  const [mensaje, setMensaje] = useState("");
  const [calidad, setCalidad] = useState<Calidad | null>(null);
  const [live, setLive] = useState<Liveness | null>(null);
  // false = el reconocimiento corre en el procesador (varias veces más lento).
  const [conGpu, setConGpu] = useState(true);
  const [regla, setRegla] = useState<{ horaEntrada: string; horaLimite: string; horaReferencia: string } | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetch("/api/reglas")
      .then(r => r.json())
      .then(data => { if (Array.isArray(data) && data.length > 0) setRegla(data[0]); })
      .catch(() => {});
  }, []);

  // El reloj también refresca la vigencia de la calidad (re-render cada segundo).
  useEffect(() => {
    const id = setInterval(() => { setHora(horaVE()); setFecha(fechaVE()); }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // Un solo temporizador: un resultado nuevo reemplaza al anterior sin que el viejo lo cierre antes de tiempo.
  // Solo usa refs y setters: FaceIdentify conserva los callbacks del primer render dentro de su bucle.
  function mostrar(r: Omit<Resultado, "duracionMs">, duracionMs: number) {
    if (timerRef.current) clearTimeout(timerRef.current);
    setResultado({ ...r, duracionMs });
    timerRef.current = setTimeout(() => setResultado(null), duracionMs);
  }

  const handleMatch = (data: {
    ok: boolean;
    tipo: string;
    msg: string;
    extrasH?: number;
    nombre: string | undefined;
    apellido: string | undefined;
    error?: string;
  }) => {
    const nombre = `${data.nombre ?? ""} ${data.apellido ?? ""}`.trim();
    if (!data.ok || data.error) {
      const esAviso = data.tipo === "cooldown" || data.tipo === "duplicado" || data.tipo === "reposo_medico";
      mostrar({ tipo: esAviso ? "warn" : "error", nombre, estado: data.msg || "Error desconocido" }, 2000);
      return;
    }
    if (data.tipo === "reposo_medico") {
      mostrar({ tipo: "warn", nombre, estado: data.msg }, 2000);
      return;
    }
    // Los mensajes de entrada empiezan con "Entrada" (incluye TEMPRANO); los de salida con "Salida".
    // Se usa el msg como fuente de verdad para no confundir TEMPRANO de entrada con el de salida.
    const isEntrada = data.msg?.startsWith("Entrada") || data.tipo?.includes("entrada") || data.tipo === "a_tiempo" || data.tipo === "tarde" || data.tipo === "justificado" || data.tipo === "feriado" || data.tipo === "vacaciones";
    mostrar({ tipo: isEntrada ? "entrada" : "salida", nombre, estado: data.msg, extras: data.extrasH }, 2000);
  };

  const handleUnknown = () => mostrar({ tipo: "error", nombre: "", estado: "Rostro no reconocido. Verifique que esté registrado." }, 2500);

  const handleRejected = (info: { tipo: string; msg: string; nombre?: string; apellido?: string; cedula?: string }) => {
    // Celular/pantalla frente a la cámara: no se identifica a nadie ni aplica pase previo.
    if (info.tipo === "pantalla_detectada") {
      mostrar({ tipo: "error", nombre: "Marcaje bloqueado", estado: info.msg }, 4000);
      return;
    }
    const nombre = info.nombre ? `${info.nombre} ${info.apellido ?? ""}`.trim() : "Rostro reconocido";
    mostrar({
      tipo: "warn",
      nombre: info.cedula ? `${nombre} · ${info.cedula}` : nombre,
      estado: `${info.msg}. Solicite un pase previo en administración.`,
    }, 4000);
  };

  const q = calidad && Date.now() - calidad.ts < CALIDAD_VIGENCIA_MS ? calidad : null;
  const enDesafio = (estado === "challenge_active" || estado === "matching") && live && live.totalSteps > 0;
  // FaceIdentify se recupera solo de la mayoría de errores: el texto solo se muestra mientras siga en 'error'.
  const guia = instruccion(estado, mensaje, q, enDesafio ? live : null, estado === "error" ? error : null);
  const pasos = enDesafio ? (live!.steps ?? Array.from({ length: live!.totalSteps }, () => "")) : [];

  const checks = [
    { label: "Un rostro", ok: q?.oneFace },
    { label: "Distancia", ok: q?.distance },
    { label: "Centrado", ok: q?.centered },
    { label: "Luz y frente", ok: q?.frontLight },
  ];

  return (
    <main className="kq" aria-label="Kiosco de marcaje facial">
      <header className="kq-head" role="banner">
        <div className="kq-brand">
          <div className="kq-logo" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />
              <circle cx="12" cy="10" r="3" /><path d="M7 18a5 5 0 0 1 10 0" />
            </svg>
          </div>
          <div>
            <div className="kq-title">Control de asistencia</div>
            <div className="kq-sub">Marcaje por reconocimiento facial</div>
          </div>
        </div>
        <div className="kq-clock">
          <div className="kq-hora" aria-label={`Hora actual ${hora}`} suppressHydrationWarning>{hora}</div>
          <div className="kq-fecha" suppressHydrationWarning>{fecha}</div>
        </div>
      </header>

      <section className="kq-body">
        <div className={`kq-cam kq-t-${guia.tono}`}>
          <FaceIdentifyDynamic
            onMatch={handleMatch}
            onMultiFace={() => {}}
            onUnknown={handleUnknown}
            onRejected={handleRejected}
            onCooldown={() => {}}
            onError={setError}
            onQualityChange={(c: Omit<Calidad, "ts">) => setCalidad({ ...c, ts: Date.now() })}
            onLivenessChange={setLive}
            onStateChange={(s, m) => { setEstado(s); setMensaje(m); }}
            onAceleracion={(info) => setConGpu(info.gpu)}
            hideStatus
          />
        </div>

        {!conGpu && (
          <p className="kq-aviso-gpu" role="note">
            Este equipo procesa sin aceleración gráfica (GPU) y el reconocimiento será lento.
            Revise en Chrome <b>chrome://gpu</b> que WebGL diga &quot;Hardware accelerated&quot;.
          </p>
        )}

        <div className={`kq-guia kq-t-${guia.tono}`} role="status" aria-live="polite">
          <span className="kq-guia-dot" aria-hidden="true" />
          <span>{guia.texto}</span>
        </div>

        {enDesafio ? (
          <ol className="kq-pasos" aria-label="Pasos de verificación">
            {pasos.map((p, i) => {
              const cls = i < live!.stepIndex || estado === "matching" ? "hecho" : i === live!.stepIndex ? "actual" : "";
              return (
                <li key={i} className={cls}>
                  <span className="kq-paso-num">{i + 1}</span>
                  {PASO_CORTO[p] ?? `Paso ${i + 1}`}
                </li>
              );
            })}
          </ol>
        ) : (
          <ul className="kq-checks" aria-label="Condiciones de captura">
            {checks.map(c => (
              <li key={c.label} className={c.ok ? "ok" : ""}>
                <span className="kq-check-dot" aria-hidden="true" />
                {c.label}
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="kq-foot" role="contentinfo">
        {regla ? (
          <div className="kq-horario">
            <span>Entrada <b>{regla.horaEntrada}</b></span>
            <span>Tolerancia hasta <b>{regla.horaLimite}</b></span>
            <span>Salida <b>{regla.horaReferencia}</b></span>
          </div>
        ) : <div />}
        <Link href="/" className="kq-volver">Volver al inicio</Link>
      </footer>

      {resultado && (
        <div className="kq-res-bg" onClick={() => setResultado(null)}>
          <div className={`kq-res kq-t-${RESULTADO_META[resultado.tipo].tono}`} role="alert">
            <div className="kq-res-icono"><Icono tipo={resultado.tipo} /></div>
            <div className="kq-res-titulo">{RESULTADO_META[resultado.tipo].titulo}</div>
            {resultado.nombre && <div className="kq-res-nombre">{resultado.nombre}</div>}
            <div className="kq-res-estado">{resultado.estado}</div>
            {resultado.extras && resultado.extras > 0 ? (
              <div className="kq-res-extras">{formatExtras(resultado.extras)} de horas extra</div>
            ) : null}
            <div className="kq-res-hora">{hora}</div>
            <div className="kq-res-barra" key={`${resultado.tipo}-${resultado.estado}-${resultado.nombre}`} style={{ animationDuration: `${resultado.duracionMs}ms` }} />
          </div>
        </div>
      )}

      <style jsx global>{`
        .kq {
          --kq-bg: #0b1220; --kq-surface: #111a2e; --kq-border: rgba(148,163,184,.16);
          --kq-ink: #f1f5f9; --kq-ink-2: #cbd5e1; --kq-muted: #8391a7;
          --kq-neutral: #94a3b8; --kq-accent: #3b82f6; --kq-ok: #10b981; --kq-warn: #f59e0b; --kq-bad: #ef4444;
          min-height: 100vh; display: flex; flex-direction: column;
          background: radial-gradient(ellipse at top, #13203a 0%, var(--kq-bg) 60%);
          color: var(--kq-ink); font-family: 'Inter', system-ui, sans-serif;
        }
        .kq-t-neutral { --tono: var(--kq-neutral); }
        .kq-t-accent  { --tono: var(--kq-accent); }
        .kq-t-ok      { --tono: var(--kq-ok); }
        .kq-t-warn    { --tono: var(--kq-warn); }
        .kq-t-bad     { --tono: var(--kq-bad); }
        .kq-aviso-gpu { width: 100%; margin: 0; padding: 10px 14px; border-radius: 10px; border: 1px solid var(--kq-warn); color: var(--kq-warn); background: var(--kq-surface); font-size: .9rem; text-align: center; }

        .kq-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding: 18px 32px; border-bottom: 1px solid var(--kq-border); }
        .kq-brand { display: flex; align-items: center; gap: 14px; }
        .kq-logo { width: 42px; height: 42px; border-radius: 12px; background: var(--kq-accent); color: #fff; display: flex; align-items: center; justify-content: center; }
        .kq-title { font-weight: 700; font-size: 1.05rem; }
        .kq-sub { color: var(--kq-muted); font-size: .8rem; margin-top: 2px; }
        .kq-clock { text-align: right; }
        .kq-hora { font-size: 2.4rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; letter-spacing: .01em; }
        .kq-fecha { color: var(--kq-muted); font-size: .85rem; margin-top: 4px; text-transform: capitalize; }

        .kq-body { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; padding: 28px 16px; width: 100%; max-width: 960px; margin: 0 auto; }
        .kq-cam { width: 100%; border-radius: 20px; overflow: hidden; background: #050a14; border: 3px solid var(--tono); box-shadow: 0 24px 60px rgba(0,0,0,.45); transition: border-color .25s; }
        .kq-cam video { display: block; border-radius: 0 !important; }
        .kq-cam-placeholder { min-height: 420px; display: flex; align-items: center; justify-content: center; color: var(--kq-muted); }

        .kq-guia { display: flex; align-items: center; justify-content: center; gap: 12px; width: 100%; padding: 16px 20px; border-radius: 14px; background: var(--kq-surface); border: 1px solid var(--kq-border); font-size: 1.5rem; font-weight: 600; text-align: center; color: var(--tono); transition: color .25s; }
        .kq-guia-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--tono); flex-shrink: 0; box-shadow: 0 0 0 5px color-mix(in srgb, var(--tono) 22%, transparent); }

        .kq-checks, .kq-pasos { list-style: none; margin: 0; padding: 0; display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
        .kq-checks li { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px; border: 1px solid var(--kq-border); color: var(--kq-muted); font-size: .9rem; transition: all .2s; }
        .kq-checks li.ok { color: var(--kq-ink); border-color: color-mix(in srgb, var(--kq-ok) 55%, transparent); background: color-mix(in srgb, var(--kq-ok) 12%, transparent); }
        .kq-check-dot { width: 9px; height: 9px; border-radius: 50%; background: #475569; }
        .kq-checks li.ok .kq-check-dot { background: var(--kq-ok); }

        .kq-pasos li { display: flex; align-items: center; gap: 10px; padding: 9px 16px; border-radius: 999px; border: 1px solid var(--kq-border); color: var(--kq-muted); font-size: 1rem; font-weight: 500; }
        .kq-paso-num { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: .8rem; font-weight: 700; background: #1e293b; }
        .kq-pasos li.actual { color: var(--kq-ink); border-color: var(--kq-accent); }
        .kq-pasos li.actual .kq-paso-num { background: var(--kq-accent); color: #fff; }
        .kq-pasos li.hecho { color: var(--kq-ok); }
        .kq-pasos li.hecho .kq-paso-num { background: var(--kq-ok); color: #fff; }

        .kq-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 14px 32px; border-top: 1px solid var(--kq-border); font-size: .9rem; color: var(--kq-muted); }
        .kq-horario { display: flex; gap: 24px; flex-wrap: wrap; }
        .kq-horario b { color: var(--kq-ink); font-variant-numeric: tabular-nums; margin-left: 4px; }
        .kq-volver { color: var(--kq-muted); font-size: .8rem; text-decoration: none; }
        .kq-volver:hover { color: var(--kq-ink-2); }

        .kq-res-bg { position: fixed; inset: 0; z-index: 1000; background: rgba(5,10,20,.72); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 16px; animation: kq-fade .2s ease; }
        .kq-res { position: relative; overflow: hidden; width: 100%; max-width: 480px; background: var(--kq-surface); border: 1px solid var(--kq-border); border-top: 6px solid var(--tono); border-radius: 20px; padding: 32px 28px 30px; text-align: center; box-shadow: 0 30px 80px rgba(0,0,0,.55); animation: kq-pop .25s ease; }
        .kq-res-icono { width: 76px; height: 76px; margin: 0 auto 14px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--tono); background: color-mix(in srgb, var(--tono) 16%, transparent); }
        .kq-res-titulo { color: var(--tono); font-size: .85rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
        .kq-res-nombre { font-size: 1.75rem; font-weight: 700; margin-top: 8px; line-height: 1.2; }
        .kq-res-estado { color: var(--kq-ink-2); font-size: 1.1rem; margin-top: 10px; line-height: 1.45; }
        .kq-res-extras { display: inline-block; margin-top: 14px; padding: 6px 14px; border-radius: 999px; background: color-mix(in srgb, var(--kq-ok) 16%, transparent); color: var(--kq-ok); font-weight: 700; }
        .kq-res-hora { color: var(--kq-muted); font-size: .85rem; margin-top: 16px; font-variant-numeric: tabular-nums; }
        .kq-res-barra { position: absolute; left: 0; bottom: 0; height: 4px; width: 100%; background: var(--tono); transform-origin: left; animation-name: kq-barra; animation-timing-function: linear; animation-fill-mode: forwards; }

        @keyframes kq-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes kq-pop { from { opacity: 0; transform: scale(.94); } to { opacity: 1; transform: scale(1); } }
        @keyframes kq-barra { from { transform: scaleX(1); } to { transform: scaleX(0); } }

        @media (max-width: 640px) {
          .kq-head, .kq-foot { padding: 12px 16px; }
          .kq-hora { font-size: 1.8rem; }
          .kq-guia { font-size: 1.15rem; }
          .kq-res-nombre { font-size: 1.4rem; }
        }
        @media (prefers-reduced-motion: reduce) {
          .kq-res-bg, .kq-res { animation: none; }
        }
      `}</style>
    </main>
  );
}
