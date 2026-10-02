"use client";
import { useEffect, useRef, useState } from "react";

type Msg = { tipo: "ok" | "bad" | "warn"; titulo: string; detalle: string } | null;

export default function Kiosco() {
  const video = useRef<HTMLVideoElement>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [cooldown, setCooldown] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true });
        if (video.current) video.current.srcObject = s;
      } catch { /* sin cámara en demo: se muestra fondo */ }
    })();
  }, []);

  function show(m: Msg, ms = 3000) {
    setMsg(m);
    window.clearTimeout((show as unknown as { t?: number }).t);
    (show as unknown as { t?: number }).t = window.setTimeout(() => setMsg(null), ms);
  }

  return (
    <main style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <h2>Kiosco de fichaje — cámara siempre activa (UX mock)</h2>
      <p className="muted">Regla mock: límite 08:00 · referencia 17:00 · margen 60 min · cooldown 30 min por empleado.</p>
      <div className="kiosco">
        <video ref={video} autoPlay muted playsInline />
        <div className="overlay">
          {!msg && <div><b>En espera…</b><div className="muted">Presente un solo rostro frente a la cámara</div></div>}
          {msg && (
            <div className={msg.tipo === "ok" ? "toast-ok" : msg.tipo === "bad" ? "toast-bad" : "toast-warn"}>
              <b>{msg.titulo}</b><div>{msg.detalle}</div>
              {cooldown && <div className="muted">Cooldown: {cooldown}</div>}
            </div>
          )}
        </div>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn-primary btn" onClick={() => show({ tipo: "ok", titulo: "Entrada A TIEMPO — Ana Pérez", detalle: "07:55 · Jornada abierta. Vuelva en 30 min para la salida." })}>Simular entrada a tiempo</button>
        <button className="btn btn-warn" onClick={() => show({ tipo: "warn", titulo: "Entrada TARDE — Luis Gómez", detalle: "08:40 · Dentro del margen 60 min." })}>Simular tarde</button>
        <button className="btn-ok btn" onClick={() => { setCooldown("29:59 para poder remarcar"); show({ tipo: "ok", titulo: "Salida COMPLETADO + 0.2h extra", detalle: "17:10 · Gracias." }); }}>Simular salida + extras</button>
        <button className="btn" onClick={() => show({ tipo: "bad", titulo: "Fuera de horario — requiere autorización", detalle: "Pasó el margen 60 min y no tiene pase previo. Queda FALTA proyectada." }, 6000)}>Simular fuera de margen</button>
        <button className="btn" onClick={() => show({ tipo: "bad", titulo: "Rostro no registrado", detalle: "Intente de nuevo. (10s)" }, 10000)}>Simular no registrado 10s</button>
        <button className="btn" onClick={() => show({ tipo: "warn", titulo: "Solo una persona", detalle: "Se detectó más de un rostro. (5s)" }, 5000)}>Simular multi-rostro 5s</button>
      </div>
      <p className="muted">Fase 2: aquí se integra @vladmandic/face-api (d&lt;0.5, parpadeo/movimiento, 1 req/s) contra /api/fichaje.</p>
      <a href="/">← Volver</a>
    </main>
  );
}
