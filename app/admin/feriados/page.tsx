"use client";
import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";

type Feriado = {
  id: number;
  fecha: string;
  motivo: string;
  creadoEn: string;
};

export default function Feriados() {
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modo, setModo] = useState<"dia" | "rango">("dia");
  const [formData, setFormData] = useState({
    fecha: "",
    fechaIni: "",
    fechaFin: "",
    motivo: "",
  });
  const [creating, setCreating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    async function cargar() {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      try {
        const data = await api.feriados.list();
        if (!abortRef.current.signal.aborted) setFeriados(data);
      } catch (e: any) {
        if (e.name !== 'AbortError') setError(e.message || "Error cargando feriados");
      } finally {
        if (!abortRef.current.signal.aborted) setLoading(false);
      }
    }
    cargar();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      if (modo === "dia") {
        if (!formData.fecha || !formData.motivo) {
          setError("Complete fecha y motivo");
          return;
        }
        await api.feriados.create({ fecha: formData.fecha, motivo: formData.motivo });
        setFormData({ ...formData, fecha: "", motivo: "" });
      } else {
        if (!formData.fechaIni || !formData.fechaFin || !formData.motivo) {
          setError("Complete fechas y motivo");
          return;
        }
        // Create multiple feriados for range
        const ini = new Date(formData.fechaIni);
        const fin = new Date(formData.fechaFin);
        const promesas = [];
        for (let d = new Date(ini); d <= fin; d.setDate(d.getDate() + 1)) {
          const fechaStr = d.toISOString().split("T")[0];
          promesas.push(api.feriados.create({ fecha: fechaStr, motivo: formData.motivo }));
        }
        await Promise.all(promesas);
        setFormData({ ...formData, fechaIni: "", fechaFin: "", motivo: "" });
      }
      const data = await api.feriados.list();
      setFeriados(data);
    } catch (e: any) {
      setError(e.data?.error || e.message || "Error guardando feriado");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("¿Eliminar este feriado?")) return;
    try {
      // No DELETE endpoint yet, would need to add one
      alert("Eliminar no implementado aún - use DB directamente");
    } catch (e: any) {
      alert(e.message || "Error eliminando");
    }
  }

  if (loading) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>Cargando…</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ marginBottom: 4 }}>Feriados</h2>
        <p className="muted">Un día o rango con motivo · El rango se expande a filas diarias</p>
      </div>

      {/* New feriado form */}
      <div className="card">
        <h3 style={{ marginBottom: 16 }}> Registrar feriado</h3>
        {error && <div className="alert alert-warn" style={{ marginBottom: 16 }}><span></span><span>{error}</span></div>}

        {/* Mode toggle */}
        <div style={{ display: "flex", gap: 8, marginBottom: 18, background: "var(--surface-2)", borderRadius: "var(--r-md)", padding: 4, width: "fit-content" }}>
          <button
            className={"btn btn-sm" + (modo === "dia" ? " btn-primary" : " btn-ghost")}
            style={{ boxShadow: modo === "dia" ? undefined : "none" }}
            onClick={() => setModo("dia")}
          >
             Un día
          </button>
          <button
            className={"btn btn-sm" + (modo === "rango" ? " btn-primary" : " btn-ghost")}
            style={{ boxShadow: modo === "rango" ? undefined : "none" }}
            onClick={() => setModo("rango")}
          >
             Rango de días
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid2" style={{ gap: 16, marginBottom: 16 }}>
            {modo === "dia" ? (
              <div className="form-group">
                <label htmlFor="fer-fecha">Fecha <span style={{ color: "var(--bad)" }}>*</span></label>
                <input
                  id="fer-fecha"
                  type="date"
                  value={formData.fecha}
                  onChange={e => setFormData({ ...formData, fecha: e.target.value })}
                  required
                />
              </div>
            ) : (
              <>
                <div className="form-group">
                  <label htmlFor="fer-ini">Fecha inicio <span style={{ color: "var(--bad)" }}>*</span></label>
                  <input
                    id="fer-ini"
                    type="date"
                    value={formData.fechaIni}
                    onChange={e => setFormData({ ...formData, fechaIni: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="fer-fin">Fecha fin <span style={{ color: "var(--bad)" }}>*</span></label>
                  <input
                    id="fer-fin"
                    type="date"
                    value={formData.fechaFin}
                    onChange={e => setFormData({ ...formData, fechaFin: e.target.value })}
                    required
                  />
                </div>
              </>
            )}
            <div className="form-group" style={modo === "rango" ? { gridColumn: "1 / -1" } : {}}>
              <label htmlFor="fer-motivo">Motivo <span style={{ color: "var(--bad)" }}>*</span></label>
              <input
                id="fer-motivo"
                value={formData.motivo}
                onChange={e => setFormData({ ...formData, motivo: e.target.value })}
                placeholder="Ej. Fiesta nacional, asueto especial…"
                required
              />
            </div>
          </div>

          <div className="alert alert-info" style={{ marginBottom: 16 }}>
            <span></span>
            <span>
              <b>Sin marca de asistencia</b> → el día queda como FERIADO (no cuenta como falta, no justificable).<br />
              <b>Con asistencia</b> → se registran horas extras por jornada completa.
            </span>
          </div>

          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? "Guardando…" : "Guardar feriado"}
            </button>
          </div>
        </form>
      </div>

      {/* List */}
      <div className="card" style={{ marginTop: 20, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3>Feriados registrados</h3>
          <span className="chip">{feriados.length} feriados</span>
        </div>
        <div className="table-wrap" style={{ border: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Motivo</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {feriados.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ textAlign: "center", padding: "32px" }}>
                    <p className="muted">No hay feriados registrados</p>
                  </td>
                </tr>
              ) : (
                feriados.map((f) => (
                  <tr key={f.id}>
                    <td className="mono" style={{ fontWeight: 600 }}>{f.fecha}</td>
                    <td>
                      <span className="badge b-fer" style={{ marginRight: 8 }}>FERIADO</span>
                      {f.motivo}
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-danger"
                        style={{ background: "var(--bad-l)", color: "var(--bad)", border: "1.5px solid var(--bad-b)" }}
                        onClick={() => handleDelete(f.id)}
                        disabled
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}