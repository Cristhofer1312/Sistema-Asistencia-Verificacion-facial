"use client";
import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";

type Regla = {
  id: number;
  horaLimite: string;
  horaReferencia: string;
  margenMin: number;
  cooldownMin: number;
  vigenciaDesde: string;
  creadoPorId: number | null;
  creadoEn: string;
};

export default function Reglas() {
  const [reglas, setReglas] = useState<Regla[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    horaLimite: "08:00",
    horaReferencia: "17:00",
    margenMin: 60,
    cooldownMin: 30,
    vigenciaDesde: "",
  });
  const [creating, setCreating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    async function cargar() {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      try {
        const data = await api.reglas.list();
        if (!abortRef.current.signal.aborted) setReglas(data);
      } catch (e: any) {
        if (e.name !== 'AbortError') setError(e.message || "Error cargando horarios");
      } finally {
        if (!abortRef.current.signal.aborted) setLoading(false);
      }
    }
    cargar();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      await api.reglas.create({
        horaLimite: formData.horaLimite,
        horaReferencia: formData.horaReferencia,
        margenMin: formData.margenMin,
        cooldownMin: formData.cooldownMin,
        vigenciaDesde: formData.vigenciaDesde,
      });
      const data = await api.reglas.list();
      setReglas(data);
      setFormData({ ...formData, vigenciaDesde: "" });
    } catch (e: any) {
      setError(e.data?.error || e.message || "Error creando horario");
    } finally {
      setCreating(false);
    }
  }

  const vigente = reglas[0];

  if (loading) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>Cargando…</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ marginBottom: 4 }}>Horarios</h2>
        <p className="muted">Horario global único · rige hacia adelante · no altera registros pasados</p>
      </div>

      {/* Current rule highlight */}
      {vigente && (
        <div className="card" style={{ background: "var(--brand-l)", border: "1.5px solid var(--brand-mid)", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: "1.1rem" }}></span>
            <span style={{ fontWeight: 700, color: "var(--brand)", fontSize: ".875rem", textTransform: "uppercase", letterSpacing: ".06em" }}>Horario vigente</span>
            <span className="badge b-just" style={{ marginLeft: "auto" }}>Desde {vigente.vigenciaDesde.split("T")[0]}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 24px" }}>
            {[
              ["Entrada límite", vigente.horaLimite],
              ["Salida referencia", vigente.horaReferencia],
              ["Margen tardanza", `${vigente.margenMin} min`],
              ["Cooldown kiosco", `${vigente.cooldownMin} min`],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: ".8rem", color: "var(--brand)", fontWeight: 600 }}>{k}</span>
                <span style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--ink)" }}>{v}</span>
              </div>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 10, fontSize: ".78rem" }}>Creado por: User {vigente.creadoPorId ?? "—"} · Cada fichaje guarda un snapshot del horario aplicado.</p>
        </div>
      )}

      {/* New rule form */}
      <div className="card">
        <h3 style={{ marginBottom: 18 }}> Crear nuevo horario</h3>
        {error && <div className="alert alert-warn" style={{ marginBottom: 16 }}><span></span><span>{error}</span></div>}
        <form onSubmit={handleCreate}>
          <div className="grid2" style={{ gap: 18 }}>
            <div className="form-group">
              <label htmlFor="hr-entrada">Hora límite entrada <span style={{ color: "var(--bad)" }}>*</span></label>
              <input id="hr-entrada" type="time" value={formData.horaLimite} onChange={e => setFormData({ ...formData, horaLimite: e.target.value })} required />
            </div>
            <div className="form-group">
              <label htmlFor="hr-salida">Hora referencia salida <span style={{ color: "var(--bad)" }}>*</span></label>
              <input id="hr-salida" type="time" value={formData.horaReferencia} onChange={e => setFormData({ ...formData, horaReferencia: e.target.value })} required />
            </div>
            <div className="form-group">
              <label htmlFor="hr-margen">Margen tardanza (min) <span style={{ color: "var(--bad)" }}>*</span></label>
              <input id="hr-margen" type="number" value={formData.margenMin} onChange={e => setFormData({ ...formData, margenMin: Number(e.target.value) })} min={0} max={240} required />
            </div>
            <div className="form-group">
              <label htmlFor="hr-cooldown">Cooldown kiosco (min) <span style={{ color: "var(--bad)" }}>*</span></label>
              <input id="hr-cooldown" type="number" value={formData.cooldownMin} onChange={e => setFormData({ ...formData, cooldownMin: Number(e.target.value) })} min={0} max={120} required />
            </div>
            <div className="form-group">
              <label htmlFor="hr-vigencia">Vigencia desde <span style={{ color: "var(--bad)" }}>*</span></label>
              <input id="hr-vigencia" type="date" value={formData.vigenciaDesde} onChange={e => setFormData({ ...formData, vigenciaDesde: e.target.value })} required />
            </div>
          </div>

          <div className="alert alert-warn" style={{ marginTop: 16 }}>
            <span></span>
            <span>El nuevo horario solo aplica a partir de la fecha de vigencia. Los fichajes anteriores conservan el snapshot original.</span>
          </div>

          <hr className="divider" />
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? "Creando…" : "Crear horario"}
            </button>
          </div>
        </form>
      </div>

      {/* History table */}
      <div className="card" style={{ marginTop: 20, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <h3>Historial de horarios</h3>
        </div>
        <div className="table-wrap" style={{ border: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Vigencia desde</th>
                <th>Entrada</th>
                <th>Salida ref.</th>
                <th>Margen</th>
                <th>Cooldown</th>
                <th>Creador</th>
              </tr>
            </thead>
            <tbody>
              {reglas.map((r, i) => (
                <tr key={r.id}>
                  <td><span className={i === 0 ? "badge b-just" : "mono muted"}>{(r.vigenciaDesde.split("T")[0]) + (i === 0 ? " (actual)" : "")}</span></td>
                  <td className="mono" style={{ fontWeight: 600 }}>{r.horaLimite}</td>
                  <td className="mono" style={{ fontWeight: 600 }}>{r.horaReferencia}</td>
                  <td>{r.margenMin} min</td>
                  <td>{r.cooldownMin} min</td>
                  <td className="muted mono">User {r.creadoPorId ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}