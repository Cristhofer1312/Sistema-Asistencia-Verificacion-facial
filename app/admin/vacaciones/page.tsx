"use client";
import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { type Empleado, nombreCompleto } from "@/lib/types";
import { formatFriendlyDate } from "@/lib/date-utils";
import { Select } from "@/components/ui/Select";

type Vacacion = {
  id: number;
  empleadoId: number;
  inicio: string;
  fin: string;
  motivo: string | null;
  aprobadorId: number | null;
  creadoEn: string;
  empleado: { nombre: string; apellido: string; cedula: string; gerencia: string };
};

export default function Vacaciones() {
  const [vacaciones, setVacaciones] = useState<Vacacion[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    empleadoId: "",
    inicio: "",
    fin: "",
    motivo: "",
  });
  const [creating, setCreating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    async function cargar() {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      try {
        const [emps, vacs] = await Promise.all([
          api.empleados.list() as Promise<Empleado[]>,
          api.vacaciones.list() as Promise<Vacacion[]>,
        ]);
        if (!abortRef.current.signal.aborted) {
          setEmpleados(emps.filter(e => e.activo));
          setVacaciones(vacs);
        }
      } catch (e: any) {
        if (e.name !== 'AbortError') setError(e.message || "Error cargando datos");
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
    if (!formData.empleadoId || !formData.inicio || !formData.fin) {
      setError("Complete empleado, fecha inicio y fin");
      return;
    }
    if (new Date(formData.inicio) > new Date(formData.fin)) {
      setError("Fecha inicio debe ser anterior o igual a fecha fin");
      return;
    }
    setCreating(true);
    try {
      await api.vacaciones.create({
        empleadoId: Number(formData.empleadoId),
        inicio: formData.inicio,
        fin: formData.fin,
        motivo: formData.motivo || undefined,
      });
      setFormData({ empleadoId: "", inicio: "", fin: "", motivo: "" });
      const vacs = await api.vacaciones.list() as unknown as Vacacion[];
      setVacaciones(vacs);
    } catch (e: any) {
      setError(e.data?.error || e.message || "Error asignando vacaciones");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("¿Eliminar estas vacaciones?")) return;
    try {
      await api.vacaciones.delete(id);
      const vacs = await api.vacaciones.list() as unknown as Vacacion[];
      setVacaciones(vacs);
    } catch (e: any) {
      alert(e.data?.error || e.message || "Error eliminando");
    }
  }

  if (loading) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>Cargando…</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ marginBottom: 4 }}>Vacaciones</h2>
        <p className="muted">Asignación por empleado · rango inicio/fin · sin solapamiento</p>
      </div>

      {/* Form */}
      <div className="card">
        <h3 style={{ marginBottom: 18 }}> Asignar vacaciones</h3>
        {error && <div className="alert alert-warn" style={{ marginBottom: 16 }}><span></span><span>{error}</span></div>}
        <form onSubmit={handleSubmit}>
          <div className="grid2" style={{ gap: 18 }}>
            <div className="form-group">
              <label htmlFor="vac-emp">Empleado <span style={{ color: "var(--bad)" }}>*</span></label>
              <Select
                id="vac-emp"
                value={formData.empleadoId}
                onChange={e => setFormData({ ...formData, empleadoId: e.target.value })}
                required
              >
                <option value="">Seleccione empleado</option>
                {empleados.map(emp => (
                  <option key={emp.id} value={emp.id}>{nombreCompleto(emp)} ({emp.cedula})</option>
                ))}
              </Select>
            </div>
            <div className="form-group">
              <label htmlFor="vac-motivo">Motivo</label>
              <input
                id="vac-motivo"
                value={formData.motivo}
                onChange={e => setFormData({ ...formData, motivo: e.target.value })}
                placeholder="Ej. Vacaciones anuales"
              />
            </div>
            <div className="form-group">
              <label htmlFor="vac-ini">Fecha inicio <span style={{ color: "var(--bad)" }}>*</span></label>
              <input
                id="vac-ini"
                type="date"
                value={formData.inicio}
                onChange={e => setFormData({ ...formData, inicio: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="vac-fin">Fecha fin <span style={{ color: "var(--bad)" }}>*</span></label>
              <input
                id="vac-fin"
                type="date"
                value={formData.fin}
                onChange={e => setFormData({ ...formData, fin: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="alert alert-info" style={{ marginTop: 16, marginBottom: 16 }}>
            <span></span>
            <span>
              <b>Sin asistencia registrada</b> → el período queda como VACACIONES (no genera falta).<br />
              <b>Con asistencia</b> → se contabilizan extras por jornada completa. Se valida que no haya solapamiento.
            </span>
          </div>

          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? "Asignando…" : "Asignar vacaciones"}
            </button>
          </div>
        </form>
      </div>

      {/* List */}
      <div className="card" style={{ marginTop: 20, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3>Vacaciones registradas</h3>
          <span className="chip">{vacaciones.length} períodos</span>
        </div>
        <div className="table-wrap" style={{ border: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Período</th>
                <th>Motivo</th>
                <th>Aprobador</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {vacaciones.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "32px" }}>
                    <p className="muted">No hay vacaciones registradas</p>
                  </td>
                </tr>
              ) : (
                vacaciones.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{nombreCompleto(v.empleado)}</div>
                      <div className="muted mono" style={{ fontSize: ".75rem" }}>{v.empleado.cedula}</div>
                    </td>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      {formatFriendlyDate(v.inicio)} → {formatFriendlyDate(v.fin)}
                    </td>
                    <td className="muted">{v.motivo || "—"}</td>
                    <td className="muted mono">User {v.aprobadorId ?? "—"}</td>
                    <td>
                      <button
                        className="btn btn-sm btn-danger"
                        style={{ background: "var(--bad-l)", color: "var(--bad)", border: "1.5px solid var(--bad-b)" }}
                        onClick={() => handleDelete(v.id)}
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