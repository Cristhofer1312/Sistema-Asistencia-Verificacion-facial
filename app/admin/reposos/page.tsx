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
  anulada: boolean;
  motivoAnulacion: string | null;
  anuladoEn: string | null;
  empleado: { nombre: string; apellido: string; cedula: string };
};

type Filtros = { q: string; gerenciaId: string; desde: string; hasta: string; estado: string; situacion: string };
const FILTROS_INICIALES: Filtros = { q: "", gerenciaId: "", desde: "", hasta: "", estado: "todas", situacion: "todas" };

function diasEntre(inicio: string, fin: string) {
  return Math.round((new Date(fin).getTime() - new Date(inicio).getTime()) / 86400000) + 1;
}

export default function Reposos() {
  const [reposos, setReposos] = useState<Reposo[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [gerencias, setGerencias] = useState<{ id: number; nombre: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIALES);
  const [anular, setAnular] = useState<{ id: number | null; motivo: string; error: string | null; procesando: boolean }>({ id: null, motivo: "", error: null, procesando: false });
  const [formData, setFormData] = useState({ empleadoId: "", inicio: "", fin: "", motivo: "", documento: "" });
  const [creating, setCreating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const primerRef = useRef(true);
  const hoy = getHoyVE();

  async function cargar(f: Filtros, inicial = false) {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    if (inicial) setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (f.q.trim()) params.q = f.q.trim();
      if (f.gerenciaId) params.gerenciaId = f.gerenciaId;
      if (f.desde) params.desde = f.desde;
      if (f.hasta) params.hasta = f.hasta;
      if (f.estado !== "todas") params.estado = f.estado;
      if (f.situacion !== "todas") params.situacion = f.situacion;
      const [emps, reps, gers] = await Promise.all([
        api.empleados.list() as Promise<Empleado[]>,
        api.reposos.list(params) as unknown as Promise<Reposo[]>,
        api.gerencias.list() as Promise<{ id: number; nombre: string }[]>,
      ]);
      if (!abortRef.current.signal.aborted) {
        setEmpleados(emps.filter((e) => e.activo));
        setReposos(reps);
        setGerencias(gers);
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') setError(e.message || "Error cargando datos");
    } finally {
      if (!abortRef.current.signal.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    cargar(FILTROS_INICIALES, true);
    return () => { if (abortRef.current) abortRef.current.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (primerRef.current) {
      primerRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => cargar(filtros), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros]);

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
      await cargar(filtros);
    } catch (e: any) {
      setError(e.data?.error || e.message || "Error registrando reposo");
    } finally {
      setCreating(false);
    }
  }

  function abrirAnular(id: number) {
    setAnular({ id, motivo: "", error: null, procesando: false });
  }

  async function handleAnular() {
    if (anular.id == null) return;
    if (anular.motivo.trim().length < 5) {
      setAnular(a => ({ ...a, error: "El motivo de anulación es obligatorio (mínimo 5 caracteres)" }));
      return;
    }
    setAnular(a => ({ ...a, procesando: true, error: null }));
    try {
      await api.reposos.anular(anular.id, anular.motivo.trim());
      setAnular({ id: null, motivo: "", error: null, procesando: false });
      await cargar(filtros);
    } catch (e: any) {
      setAnular(a => ({ ...a, procesando: false, error: e.data?.error || e.message || "Error anulando" }));
    }
  }

  if (loading) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>Cargando…</div>;
  }

  const estadoDe = (r: Reposo) =>
    r.anulada
      ? { label: "ANULADA", cls: "badge b-inactive" }
      : r.fin < hoy
        ? { label: "FINALIZADO", cls: "badge" }
        : r.inicio > hoy
          ? { label: "PROGRAMADO", cls: "badge b-just" }
          : { label: "VIGENTE", cls: "badge b-rep" };

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

      {/* Filtros */}
      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ marginBottom: 14 }}> Buscar reposos otorgados</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="form-group" style={{ flex: "2 1 220px" }}>
            <label htmlFor="rep-f-q">Empleado o motivo</label>
            <input
              id="rep-f-q"
              type="text"
              value={filtros.q}
              onChange={e => setFiltros({ ...filtros, q: e.target.value })}
              placeholder="Nombre, cédula o motivo…"
            />
          </div>
          <div className="form-group" style={{ flex: "1 1 160px" }}>
            <label htmlFor="rep-f-ger">Gerencia</label>
            <Select id="rep-f-ger" value={filtros.gerenciaId} onChange={e => setFiltros({ ...filtros, gerenciaId: e.target.value })}>
              <option value="">Todas</option>
              {gerencias.map(g => (
                <option key={g.id} value={g.id}>{g.nombre}</option>
              ))}
            </Select>
          </div>
          <div className="form-group" style={{ flex: "1 1 140px" }}>
            <label htmlFor="rep-f-desde">Desde</label>
            <input id="rep-f-desde" type="date" value={filtros.desde} onChange={e => setFiltros({ ...filtros, desde: e.target.value })} />
          </div>
          <div className="form-group" style={{ flex: "1 1 140px" }}>
            <label htmlFor="rep-f-hasta">Hasta</label>
            <input id="rep-f-hasta" type="date" value={filtros.hasta} onChange={e => setFiltros({ ...filtros, hasta: e.target.value })} />
          </div>
          <div className="form-group" style={{ flex: "1 1 140px" }}>
            <label htmlFor="rep-f-est">Estado</label>
            <Select id="rep-f-est" value={filtros.estado} onChange={e => setFiltros({ ...filtros, estado: e.target.value })}>
              <option value="todas">Todas</option>
              <option value="vigentes">Vigentes</option>
              <option value="anuladas">Anuladas</option>
            </Select>
          </div>
          <div className="form-group" style={{ flex: "1 1 140px" }}>
            <label htmlFor="rep-f-sit">Situación</label>
            <Select id="rep-f-sit" value={filtros.situacion} onChange={e => setFiltros({ ...filtros, situacion: e.target.value })}>
              <option value="todas">Todas</option>
              <option value="vigente">En curso</option>
              <option value="programada">Programados</option>
              <option value="finalizada">Finalizados</option>
            </Select>
          </div>
          <div className="form-group">
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setFiltros(FILTROS_INICIALES)}>
              Limpiar
            </button>
          </div>
        </div>
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
                    <tr key={r.id} style={{ opacity: r.anulada ? 0.65 : 1 }}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{nombreCompleto(r.empleado)}</div>
                        <div className="muted mono" style={{ fontSize: ".75rem" }}>{r.empleado.cedula}</div>
                      </td>
                      <td className="mono" style={{ fontWeight: 600 }}>
                        {formatFriendlyDate(r.inicio)} → {formatFriendlyDate(r.fin)}
                        <div className="muted" style={{ fontSize: ".72rem", fontWeight: 400 }}>{diasEntre(r.inicio, r.fin)} día(s)</div>
                        <div className={est.cls} style={{ display: "inline-flex", marginTop: 4, fontSize: ".65rem" }}>{est.label}</div>
                        {r.anulada && r.motivoAnulacion && (
                          <div className="muted" style={{ fontSize: ".72rem", fontWeight: 400, marginTop: 4, maxWidth: 220 }}>
                            Motivo: {r.motivoAnulacion}
                          </div>
                        )}
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
                        {!r.anulada && (
                          <button
                            className="btn btn-sm btn-danger"
                            style={{ background: "var(--bad-l)", color: "var(--bad)", border: "1.5px solid var(--bad-b)" }}
                            onClick={() => abrirAnular(r.id)}
                          >
                            Anular
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal anular */}
      {anular.id != null && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(2,6,23,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => { if (!anular.procesando) setAnular({ id: null, motivo: "", error: null, procesando: false }); }}
        >
          <div
            className="card"
            style={{ width: "100%", maxWidth: 480, margin: 0 }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ marginBottom: 8 }}>Anular reposo médico</h3>
            <p className="muted" style={{ fontSize: ".8125rem", marginBottom: 16 }}>
              El registro no se elimina: queda marcado como anulado y se revierten sus días.
              Indique el motivo de la revocación (obligatorio).
            </p>
            <div className="form-group">
              <label htmlFor="rep-anular-motivo">Motivo de anulación <span style={{ color: "var(--bad)" }}>*</span></label>
              <textarea
                id="rep-anular-motivo"
                value={anular.motivo}
                onChange={e => setAnular(a => ({ ...a, motivo: e.target.value }))}
                placeholder="Ej. Alta médica anticipada, error en fechas…"
                rows={3}
                disabled={anular.procesando}
                style={{ width: "100%" }}
              />
            </div>
            {anular.error && <div className="alert alert-warn" style={{ marginTop: 12 }}><span></span><span>{anular.error}</span></div>}
            <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={anular.procesando}
                onClick={() => setAnular({ id: null, motivo: "", error: null, procesando: false })}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                disabled={anular.procesando}
                onClick={handleAnular}
              >
                {anular.procesando ? "Anulando…" : "Confirmar anulación"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
