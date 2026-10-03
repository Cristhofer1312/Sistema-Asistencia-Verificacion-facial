"use client";
import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { type Empleado, nombreCompleto, getHoyVE } from "@/lib/types";
import { Select } from "@/components/ui/Select";
import { formatFriendlyDate } from "@/lib/date-utils";

type Reposo = {
  id: number;
  empleadoId: number;
  inicio: string;
  fin: string;
  motivo: string | null;
  documento: string | null;
  registradoPorId: number | null;
  creadoEn: string;
  empleado: { nombre: string; apellido: string; cedula: string };
};

function diasEntre(inicio: string, fin: string) {
  return Math.round((new Date(fin).getTime() - new Date(inicio).getTime()) / 86400000) + 1;
}

export default function Reposos() {
  const [reposos, setReposos] = useState<Reposo[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [formData, setFormData] = useState({ empleadoId: "", inicio: "", fin: "", motivo: "", documento: "" });
  const [creating, setCreating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const hoy = getHoyVE();

  useEffect(() => {
    async function cargar() {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      try {
        const [emps, reps] = await Promise.all([
          api.empleados.list() as Promise<Empleado[]>,
          api.reposos.list() as Promise<Reposo[]>,
        ]);
        if (!abortRef.current.signal.aborted) {
          setEmpleados(emps.filter((e) => e.activo));
          setReposos(reps);
        }
      } catch (e: any) {
        if (e.name !== "AbortError") setError(e.message || "Error cargando datos");
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
    setAviso(null);
    if (!formData.empleadoId || !formData.inicio || !formData.fin) {
      setError("Complete empleado, fecha inicio y fin");
      return;
    }
    if (formData.inicio > formData.fin) {
      setError("Fecha inicio debe ser anterior o igual a fecha fin");
      return;
    }
    setCreating(true);
    try {
      const res = await api.reposos.create({
        empleadoId: Number(formData.empleadoId),
        inicio: formData.inicio,
        fin: formData.fin,
        motivo: formData.motivo || undefined,
        documento: formData.documento || undefined,
      });
      setFormData({ empleadoId: "", inicio: "", fin: "", motivo: "", documento: "" });
      if (res?.faltasConvertidas > 0) {
        setAviso(`${res.faltasConvertidas} falta(s) ya registradas en ese rango pasaron a REPOSO MÉDICO.`);
      }
      setReposos((await api.reposos.list()) as Reposo[]);
    } catch (e: any) {
      setError(e.data?.error || e.message || "Error registrando reposo");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("¿Eliminar este reposo médico? Los días proyectados sin marcaje volverán a FALTA.")) return;
    try {
      await api.reposos.delete(id);
      setReposos((await api.reposos.list()) as Reposo[]);
    } catch (e: any) {
      alert(e.data?.error || e.message || "Error eliminando");
    }
  }

  if (loading) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>Cargando…</div>;
  }

  const estadoDe = (r: Reposo) =>
    r.fin < hoy ? { label: "FINALIZADO", cls: "badge" } : r.inicio > hoy ? { label: "PROGRAMADO", cls: "badge b-just" } : { label: "VIGENTE", cls: "badge b-rep" };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ marginBottom: 4 }}>Reposos médicos</h2>
        <p className="muted">Asignación por empleado · rango inicio/fin · sin solapamiento</p>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 18 }}> Registrar reposo médico</h3>
        {error && <div className="alert alert-warn" style={{ marginBottom: 16 }}><span></span><span>{error}</span></div>}
        {aviso && <div className="alert alert-info" style={{ marginBottom: 16 }}><span></span><span>{aviso}</span></div>}
        <form onSubmit={handleSubmit}>
          <div className="grid2" style={{ gap: 18 }}>
            <div className="form-group">
              <label htmlFor="rep-emp">Empleado <span style={{ color: "var(--bad)" }}>*</span></label>
              <Select id="rep-emp" value={formData.empleadoId} onChange={(e) => setFormData({ ...formData, empleadoId: e.target.value })} required>
                <option value="">Seleccione empleado</option>
                {empleados.map((emp) => (
                  <option key={emp.id} value={emp.id}>{nombreCompleto(emp)} ({emp.cedula})</option>
                ))}
              </Select>
            </div>
            <div className="form-group">
              <label htmlFor="rep-motivo">Motivo / diagnóstico <span className="muted">(opcional)</span></label>
              <input id="rep-motivo" value={formData.motivo} onChange={(e) => setFormData({ ...formData, motivo: e.target.value })} placeholder="Ej. Reposo por intervención quirúrgica" maxLength={300} />
            </div>
            <div className="form-group">
              <label htmlFor="rep-ini">Fecha inicio <span style={{ color: "var(--bad)" }}>*</span></label>
              <input id="rep-ini" type="date" value={formData.inicio} onChange={(e) => setFormData({ ...formData, inicio: e.target.value })} required />
            </div>
            <div className="form-group">
              <label htmlFor="rep-fin">Fecha fin <span style={{ color: "var(--bad)" }}>*</span></label>
              <input id="rep-fin" type="date" value={formData.fin} min={formData.inicio || undefined} onChange={(e) => setFormData({ ...formData, fin: e.target.value })} required />
            </div>
            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="rep-doc">Documento <span className="muted">(URL o nombre del archivo, opcional)</span></label>
              <input id="rep-doc" value={formData.documento} onChange={(e) => setFormData({ ...formData, documento: e.target.value })} placeholder="reposo-1234.pdf · https://…" maxLength={500} />
            </div>
          </div>

          <div className="alert alert-info" style={{ marginTop: 16, marginBottom: 16 }}>
            <span></span>
            <span>
              Durante el reposo el día queda como <b>REPOSO MÉDICO</b> (no genera falta) y el kiosco
              <b> no permite fichar</b> al empleado, mostrando un aviso.
            </span>
          </div>

          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? "Registrando…" : "Registrar reposo"}
            </button>
          </div>
        </form>
      </div>

      <div className="card" style={{ marginTop: 20, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3>Reposos registrados</h3>
          <span className="chip">{reposos.length} reposos</span>
        </div>
        <div className="table-wrap" style={{ border: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Período</th>
                <th>Motivo</th>
                <th>Documento</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {reposos.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "32px" }}>
                    <p className="muted">No hay reposos médicos registrados</p>
                  </td>
                </tr>
              ) : (
                reposos.map((r) => {
                  const est = estadoDe(r);
                  return (
                    <tr key={r.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{nombreCompleto(r.empleado)}</div>
                        <div className="muted mono" style={{ fontSize: ".75rem" }}>{r.empleado.cedula}</div>
                      </td>
                      <td className="mono" style={{ fontWeight: 600 }}>
                        {formatFriendlyDate(r.inicio)} → {formatFriendlyDate(r.fin)}
                        <div className="muted" style={{ fontSize: ".72rem", fontWeight: 400 }}>{diasEntre(r.inicio, r.fin)} día(s)</div>
                        <div className={est.cls} style={{ display: "inline-flex", marginTop: 4, fontSize: ".65rem" }}>{est.label}</div>
                      </td>
                      <td className="muted">{r.motivo || "—"}</td>
                      <td className="muted" style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.documento
                          ? /^https?:\/\//.test(r.documento)
                            ? <a href={r.documento} target="_blank" rel="noopener noreferrer">{r.documento}</a>
                            : r.documento
                          : "—"}
                      </td>
                      <td>
                        <button
                          className="btn btn-sm btn-danger"
                          style={{ background: "var(--bad-l)", color: "var(--bad)", border: "1.5px solid var(--bad-b)" }}
                          onClick={() => handleDelete(r.id)}
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
