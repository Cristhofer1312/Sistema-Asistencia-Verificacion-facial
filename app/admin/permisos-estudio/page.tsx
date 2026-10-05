"use client";
import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { type Empleado, type PermisoEstudiantil, nombreCompleto, diasSemanaLabel, getHoyVE } from "@/lib/types";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";

const DIAS_OPTS = [
  { v: 1, label: "Lun" }, { v: 2, label: "Mar" }, { v: 3, label: "Mié" },
  { v: 4, label: "Jue" }, { v: 5, label: "Vie" }, { v: 6, label: "Sáb" }, { v: 0, label: "Dom" },
];

export default function PermisosEstudio() {
  const { addToast } = useToast();
  const [permisos, setPermisos] = useState<PermisoEstudiantil[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [formData, setFormData] = useState({ empleadoId: "", dias: [] as number[], horaLimite: "10:30", desde: "", hasta: "", motivo: "" });
  const [creating, setCreating] = useState(false);
  const [permisoToDelete, setPermisoToDelete] = useState<PermisoEstudiantil | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function cargar(inicial = false) {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    if (inicial) setLoading(true);
    try {
      const [emps, perms] = await Promise.all([
        api.empleados.list() as Promise<Empleado[]>,
        api.permisosEstudio.list() as Promise<PermisoEstudiantil[]>,
      ]);
      if (!abortRef.current.signal.aborted) {
        setEmpleados(emps.filter(e => e.activo));
        setPermisos(perms);
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') setError(e.message || "Error cargando datos");
    } finally {
      if (!abortRef.current.signal.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    cargar(true);
    return () => { if (abortRef.current) abortRef.current.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleDia(v: number) {
    setFormData(f => ({ ...f, dias: f.dias.includes(v) ? f.dias.filter(d => d !== v) : [...f.dias, v] }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!formData.empleadoId || formData.dias.length === 0 || !formData.horaLimite || !formData.desde || !formData.hasta) {
      setError("Complete empleado, días, hora límite y vigencia");
      return;
    }
    setCreating(true);
    try {
      await api.permisosEstudio.create({
        empleadoId: Number(formData.empleadoId),
        diasSemana: formData.dias,
        horaLimite: formData.horaLimite,
        validoDesde: formData.desde,
        validoHasta: formData.hasta,
        motivo: formData.motivo || undefined,
      });
      setFormData({ empleadoId: "", dias: [], horaLimite: "10:30", desde: "", hasta: "", motivo: "" });
      await cargar();
      addToast({ type: 'success', title: 'Permiso otorgado', message: 'El permiso estudiantil se guardó correctamente' });
    } catch (e: any) {
      setError(e.data?.error || e.message || "Error otorgando permiso");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(p: PermisoEstudiantil) {
    try {
      const upd = await api.permisosEstudio.update(p.id, { activo: !p.activo }) as PermisoEstudiantil;
      setPermisos(ps => ps.map(x => x.id === p.id ? upd : x));
      addToast({ type: 'success', title: p.activo ? 'Permiso suspendido' : 'Permiso reactivado', message: nombreCompleto(upd.empleado ?? { nombre: "", apellido: "" }) });
    } catch (e: any) {
      setError(e.data?.error || e.message || "Error actualizando permiso");
    }
  }

  async function confirmAndDelete() {
    if (!permisoToDelete) return;
    const p = permisoToDelete;
    try {
      await api.permisosEstudio.delete(p.id);
      setPermisoToDelete(null);
      setPermisos(ps => ps.filter(x => x.id !== p.id));
      addToast({ type: 'success', title: 'Permiso eliminado', message: 'El permiso fue eliminado completamente' });
    } catch (e: any) {
      setPermisoToDelete(null);
      setError(e.data?.error || e.message || "Error eliminando permiso");
    }
  }

  const hoy = getHoyVE();
  const filtrados = permisos.filter(p => {
    if (filtroEstado === "activos" && !p.activo) return false;
    if (filtroEstado === "suspendidos" && p.activo) return false;
    if (filtroEstado === "vigentes" && !(p.activo && String(p.validoDesde).slice(0, 10) <= hoy && hoy <= String(p.validoHasta).slice(0, 10))) return false;
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      const hay = `${p.empleado?.nombre ?? ""} ${p.empleado?.apellido ?? ""} ${p.empleado?.cedula ?? ""} ${p.motivo ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  if (loading) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>Cargando…</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ marginBottom: 4 }}>Permisos estudiantiles</h2>
        <p className="muted">Extienden la hora límite solo los días indicados · solo pueden alargar, nunca recortar</p>
      </div>

      {/* Form */}
      <div className="card">
        <h3 style={{ marginBottom: 18 }}>Otorgar permiso</h3>
        {error && <div className="alert alert-warn" style={{ marginBottom: 16 }}><span></span><span>{error}</span></div>}
        <form onSubmit={handleSubmit}>
          <div className="grid2" style={{ gap: 18 }}>
            <div className="form-group">
              <label htmlFor="pe-emp">Empleado <span style={{ color: "var(--bad)" }}>*</span></label>
              <Select
                id="pe-emp"
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
              <label htmlFor="pe-hora">Hora límite <span style={{ color: "var(--bad)" }}>*</span></label>
              <input
                id="pe-hora"
                type="time"
                value={formData.horaLimite}
                onChange={e => setFormData({ ...formData, horaLimite: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="form-group" style={{ marginTop: 14 }}>
            <label>Días de semana <span style={{ color: "var(--bad)" }}>*</span></label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {DIAS_OPTS.map(d => (
                <label key={d.v} style={{ display: "flex", alignItems: "center", gap: 5, border: "1px solid var(--border)", borderRadius: 8, padding: "5px 10px", cursor: "pointer", background: formData.dias.includes(d.v) ? "var(--brand-l)" : "transparent" }}>
                  <input type="checkbox" checked={formData.dias.includes(d.v)} onChange={() => toggleDia(d.v)} />
                  {d.label}
                </label>
              ))}
            </div>
          </div>

          <div className="grid2" style={{ gap: 18, marginTop: 14 }}>
            <div className="form-group">
              <label htmlFor="pe-desde">Válido desde <span style={{ color: "var(--bad)" }}>*</span></label>
              <input
                id="pe-desde"
                type="date"
                value={formData.desde}
                onChange={e => setFormData({ ...formData, desde: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="pe-hasta">Válido hasta <span style={{ color: "var(--bad)" }}>*</span></label>
              <input
                id="pe-hasta"
                type="date"
                value={formData.hasta}
                onChange={e => setFormData({ ...formData, hasta: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="form-group" style={{ marginTop: 14 }}>
            <label htmlFor="pe-motivo">Motivo</label>
            <input
              id="pe-motivo"
              value={formData.motivo}
              onChange={e => setFormData({ ...formData, motivo: e.target.value })}
              placeholder="Ej. Semestre universitario, Lun y Mié hasta las 11:00"
              maxLength={300}
            />
          </div>

          <div className="alert alert-info" style={{ marginTop: 16, marginBottom: 16 }}>
            <span></span>
            <span>
              Esos días, llegar hasta la hora indicada marca <b>A_TIEMPO</b> automáticamente.
              Feriados, vacaciones y reposos siguen mandando. Si hay varios permisos el mismo día, gana el más amplio.
            </span>
          </div>

          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? "Otorgando…" : "Otorgar permiso"}
            </button>
          </div>
        </form>
      </div>

      {/* Filtros + lista */}
      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ marginBottom: 14 }}>Permisos otorgados</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
          <div className="form-group" style={{ flex: "2 1 220px" }}>
            <label htmlFor="pe-f-q">Empleado o motivo</label>
            <input
              id="pe-f-q"
              type="text"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Nombre, cédula o motivo…"
            />
          </div>
          <div className="form-group" style={{ flex: "1 1 160px" }}>
            <label htmlFor="pe-f-est">Estado</label>
            <Select id="pe-f-est" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="vigentes">Vigentes hoy</option>
              <option value="activos">Activos</option>
              <option value="suspendidos">Suspendidos</option>
            </Select>
          </div>
        </div>

        <div className="table-wrap" style={{ border: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Días</th>
                <th>Límite</th>
                <th>Vigencia</th>
                <th>Motivo</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "32px" }}>
                    <p className="muted">No hay permisos registrados</p>
                  </td>
                </tr>
              ) : (
                filtrados.map((p) => (
                  <tr key={p.id} style={{ opacity: p.activo ? 1 : 0.6 }}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.empleado ? nombreCompleto(p.empleado) : `ID ${p.empleadoId}`}</div>
                      <div className="muted mono" style={{ fontSize: ".75rem" }}>{p.empleado?.cedula ?? ""}</div>
                    </td>
                    <td style={{ fontWeight: 600 }}>{diasSemanaLabel(p.diasSemana)}</td>
                    <td className="mono">{p.horaLimite}</td>
                    <td className="mono" style={{ fontSize: ".8rem" }}>{String(p.validoDesde).slice(0, 10)} → {String(p.validoHasta).slice(0, 10)}</td>
                    <td className="muted" style={{ fontSize: ".85rem" }}>{p.motivo || "—"}</td>
                    <td>
                      <span className={`badge ${p.activo ? "b-tiempo" : "b-inactive"}`} style={{ fontSize: ".68rem" }}>
                        {p.activo ? "Activo" : "Suspendido"}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleToggle(p)}>
                          {p.activo ? "Suspender" : "Reactivar"}
                        </button>
                        <button className="btn btn-sm" onClick={() => setPermisoToDelete(p)} style={{ backgroundColor: 'var(--bad)', color: 'white', border: 'none', padding: '0 8px', fontSize: '1.2rem' }} title="Eliminar definitivamente">
                          &times;
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Styled Delete Confirmation Modal */}
      {permisoToDelete && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ backgroundColor: 'var(--bg)', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.2)', width: '100%', maxWidth: 420, borderTop: '4px solid var(--bad)', margin: '16px' }}>
            <div style={{ padding: '20px 24px 0 24px', position: 'relative' }}>
              <h2 style={{ color: 'var(--bad)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '1.25rem' }}>
                ⚠️ Confirmar Eliminación
              </h2>
            </div>
            <div style={{ padding: '16px 24px' }}>
              <p style={{ fontSize: '1.05rem', lineHeight: '1.5', margin: 0, color: 'var(--fg)' }}>
                ¿Estás seguro de que quieres eliminar permanentemente el permiso de <strong>{permisoToDelete.empleado ? nombreCompleto(permisoToDelete.empleado) : 'este empleado'}</strong>?
              </p>
              <p className="muted" style={{ fontSize: '0.9rem', marginTop: '12px', marginBottom: 0 }}>
                Solo podrás eliminarlo si no ha sido usado. Si este permiso ya justificó asistencias pasadas, debes <strong>suspenderlo</strong> en su lugar.
              </p>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', padding: '16px 24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setPermisoToDelete(null)}>
                Cancelar
              </button>
              <button type="button" className="btn" onClick={confirmAndDelete} style={{ backgroundColor: 'var(--bad)', color: 'white', border: 'none' }}>
                Eliminar definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
