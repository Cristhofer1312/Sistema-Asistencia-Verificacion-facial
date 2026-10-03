"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import { api } from "@/lib/api";
import { BadgeEstadoEntrada } from "@/components/ui/BadgeEstadoEntrada";
import { type Asistencia, type Empleado, badgeClass, nombreCompleto, getHoyVE, getSemanaVE, getGerenciaName, ESTADOS_FILTRO, formatExtras } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";
import { Select } from "@/components/ui/Select";

export default function Asistencias() {
  const [filtroEstado, setFiltroEstado] = useState("Todos");
  const [filtroGerenciaId, setFiltroGerenciaId] = useState<string>("Todas");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [mounted, setMounted] = useState(false);
  const [just, setJust] = useState<{ empleadoId: number; fecha: string; estado: string; cedula: string; justificacionDoc?: string; justificacionObs: string } | null>(null);
  const [pase, setPase] = useState<{ empleadoId: number; fecha: string; motivo: string; cedula: string; nombre: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [asistencias, setAsistencias] = useState<Asistencia[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [gerencias, setGerencias] = useState<{ id: number; nombre: string }[]>([]);
  const [justificando, setJustificando] = useState(false);
  const [creandoPase, setCreandoPase] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const { addToast } = useToast();
  const [vista, setVista] = useState<"dia" | "historial">("dia");
  const [dia, setDia] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [asisDia, setAsisDia] = useState<Asistencia[]>([]);
  const [pasesDia, setPasesDia] = useState<{ empleadoId: number; tipo: string; autorizado: boolean }[]>([]);
  const [loadingDia, setLoadingDia] = useState(false);

  useEffect(() => { setDia(getHoyVE()); }, []);

  async function cargarDia() {
    if (!dia) return;
    setLoadingDia(true);
    try {
      const [a, p] = await Promise.all([
        fetch(`/api/asistencias?desde=${dia}&hasta=${dia}`).then(r => r.json()),
        fetch(`/api/pase-previo?fecha=${dia}`).then(r => r.json()),
      ]);
      setAsisDia(Array.isArray(a) ? a : []);
      setPasesDia(Array.isArray(p) ? p : []);
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'No se pudo cargar el día' });
    } finally {
      setLoadingDia(false);
    }
  }

  useEffect(() => {
    if (vista === "dia") cargarDia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dia, vista]);

  const filasDia = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return empleados
      .filter(e => e.activo)
      .filter(e => filtroGerenciaId === "Todas" || String(e.gerenciaId) === filtroGerenciaId)
      .filter(e => !q || nombreCompleto(e).toLowerCase().includes(q) || e.cedula.includes(q))
      .map(e => ({
        emp: e,
        asis: asisDia.find(a => a.empleadoId === e.id),
        pase: pasesDia.find(p => p.empleadoId === e.id),
      }))
      .sort((a, b) => nombreCompleto(a.emp).localeCompare(nombreCompleto(b.emp)));
  }, [empleados, asisDia, pasesDia, busqueda, filtroGerenciaId]);

  useEffect(() => {
    setMounted(true);
    const hoy = getHoyVE();
    const semana = getSemanaVE();
    setDesde(semana);
    setHasta(hoy);
  }, []);

  async function cargarDatos() {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    
    setLoading(true);
    setError(null);
    try {
      const [emps, asis] = await Promise.all([
        api.empleados.list() as Promise<Empleado[]>,
        fetch(`/api/asistencias?desde=${desde}&hasta=${hasta}${filtroGerenciaId !== "Todas" ? `&gerenciaId=${filtroGerenciaId}` : ""}${filtroEstado !== "Todos" ? `&estado=${encodeURIComponent(filtroEstado)}` : ""}`, { 
          signal: abortRef.current.signal 
        }).then(r => r.json()),
      ]);
      setEmpleados(emps);
      setAsistencias(asis);
      const gers = [{ id: 0, nombre: "Todas" }, ...Array.from(new Map(emps.map(e => [e.gerenciaId, { id: e.gerenciaId, nombre: getGerenciaName(e.gerencia) }])).values())].sort((a, b) => a.nombre.localeCompare(b.nombre));
      setGerencias(gers);
    } catch (e: any) {
      if (e.name !== 'AbortError') setError(e.message || "Error cargando datos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargarDatos();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [desde, hasta, filtroGerenciaId, filtroEstado]);

  const filasFiltradas = useMemo(() =>
    asistencias.filter(f => filtroEstado === "Todos" || f.estadoEntrada === filtroEstado),
    [asistencias, filtroEstado]);

  async function handleJustificar() {
    if (!just || !just.justificacionObs) return;
    setJustificando(true);
    try {
      await api.justificar({
        empleadoId: just.empleadoId,
        fecha: just.fecha,
        justificacionDoc: just.justificacionDoc,
        justificacionObs: just.justificacionObs,
      });
      setJust(null);
      addToast({ type: 'success', title: 'Justificado', message: 'La justificación se guardó correctamente' });
      await cargarDatos();
      if (vista === "dia") await cargarDia();
    } catch (e: any) {
      addToast({ type: 'error', title: 'Error', message: e.data?.error || e.message || "Error al justificar" });
    } finally {
      setJustificando(false);
    }
  }

  async function handleCrearPase() {
    if (!pase || !pase.motivo) return;
    setCreandoPase(true);
    try {
      await api.pases.create({
        empleadoId: pase.empleadoId,
        fecha: pase.fecha,
        motivo: pase.motivo,
      });
      setPase(null);
      addToast({ type: 'success', title: 'Pase creado', message: 'El pase previo se creó correctamente' });
      await cargarDatos();
      if (vista === "dia") await cargarDia();
    } catch (e: any) {
      addToast({ type: 'error', title: 'Error', message: e.data?.error || e.message || "Error al crear pase" });
    } finally {
      setCreandoPase(false);
    }
  }

  if (!mounted) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>Cargando…</div>;
  }

  if (loading) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>Cargando datos…</div>;
  }

  if (error) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 40 }}>
        <div style={{ fontSize: "2rem", marginBottom: 12 }}></div>
        <p style={{ color: "var(--bad)" }}>{error}</p>
        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={cargarDatos}>Reintentar</button>
      </div>
    );
  }

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 20 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Crear pase</h2>
          <p className="muted">Vista proyectada con FALTA / FERIADO / VACACIONES · {filasFiltradas.length} registros</p>
        </div>
        <button className="btn btn-primary" onClick={() => setPase({ empleadoId: 0, fecha: getHoyVE(), motivo: "", cedula: "", nombre: "" })}>
           Crear pase previo
        </button>
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 16 }}>
        <button className={"preset-btn" + (vista === "dia" ? " active" : "")} onClick={() => setVista("dia")}> Por día</button>
        <button className={"preset-btn" + (vista === "historial" ? " active" : "")} onClick={() => setVista("historial")}> Historial</button>
      </div>

      {vista === "dia" && (
        <div>
          <div className="filter-bar" style={{ marginBottom: 20 }}>
            <div className="filter-row">
              <div className="form-group" style={{ flex: "1 1 140px" }}>
                <label>Fecha</label>
                <input type="date" value={dia} onChange={e => setDia(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: "1 1 160px" }}>
                <label>Gerencia</label>
                <Select value={filtroGerenciaId} onChange={e => setFiltroGerenciaId(e.target.value)}>
                  {gerencias.map(g => <option key={g.id} value={g.id === 0 ? "Todas" : g.id}>{g.nombre}</option>)}
                </Select>
              </div>
              <div className="form-group" style={{ flex: "2 1 200px" }}>
                <label>Buscar</label>
                <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Nombre o cédula" />
              </div>
            </div>
          </div>
          <div className="card" style={{ padding: 0, overflow: "hidden", opacity: loadingDia ? 0.6 : 1 }}>
            <div className="table-wrap" style={{ border: "none" }}>
              <table>
                <thead>
                  <tr><th>Empleado</th><th>Entrada / Salida</th><th>Estado</th><th>Pase</th><th>Acción</th></tr>
                </thead>
                <tbody>
                  {filasDia.map(({ emp, asis, pase: p }) => (
                    <tr key={emp.id}>
                      <td>
                        <a href={`/admin/empleados/${emp.cedula}`} style={{ fontWeight: 600 }}>{nombreCompleto(emp)}</a>
                        <div className="muted mono" style={{ fontSize: ".75rem" }}>{emp.cedula}</div>
                      </td>
                      <td className="mono">{asis?.entrada ?? "—"} / {asis?.salida ?? "—"}</td>
                      <td>
                        {asis
                          ? <BadgeEstadoEntrada estadoEntrada={asis.estadoEntrada} estadoOriginal={asis.estadoOriginal} />
                          : <span className="muted">Sin registro</span>}
                      </td>
                      <td>{p ? <span style={{ color: "var(--ok)", fontWeight: 600 }}> {p.autorizado ? "Usado" : "Activo"}</span> : <span className="muted">—</span>}</td>
                      <td>
                        <button
                          className="btn btn-sm btn-warn-outline"
                          disabled={!!p || dia < getHoyVE()}
                          title={dia < getHoyVE() ? "No se pueden crear pases para fechas pasadas" : undefined}
                          onClick={() => setPase({ empleadoId: emp.id, fecha: dia, motivo: "", cedula: emp.cedula, nombre: nombreCompleto(emp) })}
                        >
                           Otorgar pase
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filasDia.length === 0 && (
                    <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 24 }}>Sin empleados</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {vista === "historial" && (<>
      {/* Filters */}
      <div className="filter-bar" style={{ marginBottom: 20 }}>
        <div className="filter-row">
          <div className="form-group" style={{ flex: "1 1 140px" }}>
            <label>Desde</label>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: "1 1 140px" }}>
            <label>Hasta</label>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: "1 1 140px" }}>
            <label>Gerencia</label>
            <Select value={filtroGerenciaId} onChange={e => setFiltroGerenciaId(e.target.value)}>
              {gerencias.map(g => <option key={g.id} value={g.id === 0 ? "Todas" : g.id}>{g.nombre}</option>)}
            </Select>
          </div>
          <div className="form-group" style={{ flex: "2 1 200px" }}>
            <label>Estado (8 estados)</label>
            <div className="row" style={{ gap: 5, flexWrap: "wrap" }}>
              {ESTADOS_FILTRO.map(s => (
                <button
                  key={s}
                  className={"preset-btn" + (filtroEstado === s ? " active" : "")}
                  onClick={() => setFiltroEstado(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="table-wrap" style={{ border: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Fecha</th>
                <th>Entrada / Salida</th>
                <th>Estado</th>
                <th>Extras</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filasFiltradas.map((f, i) => (
                <tr key={i}>
                  <td>
                    <a href={`/admin/empleados/${f.empleado.cedula}`} style={{ fontWeight: 600 }}>
                      {nombreCompleto(f.empleado)}
                    </a>
                  </td>
                  <td className="mono" style={{ color: "var(--muted)" }}>{f.fecha}</td>
                  <td className="mono">{f.entrada ?? "—"} / {f.salida ?? "—"}</td>
                  <td><BadgeEstadoEntrada estadoEntrada={f.estadoEntrada} estadoOriginal={f.estadoOriginal} /></td>
                  <td>
                    {f.extrasH > 0
                      ? <span style={{ color: "var(--ok)", fontWeight: 600 }}>{formatExtras(f.extrasH)}</span>
                      : <span className="muted">—</span>
                    }
                  </td>
                  <td>
                    {(f.estadoEntrada === "TARDE" || f.estadoEntrada === "FALTA" || (f.estadoEntrada === "JUSTIFICADO" && f.estadoOriginal)) ? (
                      <button className="btn btn-sm btn-warn-outline" onClick={() => setJust({ empleadoId: f.empleadoId, fecha: f.fecha, estado: f.estadoEntrada, cedula: f.empleado.cedula, justificacionDoc: "", justificacionObs: "" })}>
                         {f.estadoEntrada === "JUSTIFICADO" ? "Ver justificación" : "Justificar"}
                      </button>
                    ) : (
                      <span className="muted" style={{ fontSize: ".8rem" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </>)}

      {/* Modal justificar */}
      {just && (
        <div className="modal-bg" onClick={() => setJust(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title"> Justificar — {just.cedula}</div>
              <button className="modal-close" onClick={() => setJust(null)}>×</button>
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Respaldo (URL o archivo, opcional)</label>
              <input
                value={just.justificacionDoc}
                onChange={e => setJust({ ...just, justificacionDoc: e.target.value })}
                placeholder="reposo.pdf, https://…"
              />
            </div>
            <div className="form-group">
              <label>Observaciones <span style={{ color: "var(--bad)" }}>*</span></label>
              <textarea
                rows={3}
                value={just.justificacionObs}
                onChange={e => setJust({ ...just, justificacionObs: e.target.value })}
                placeholder="Detalle del motivo de justificación"
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-ok" onClick={handleJustificar} disabled={justificando || !just.justificacionObs}>
                {justificando ? "Guardando…" : " Guardar JUSTIFICADO"}
              </button>
              <button className="btn btn-ghost" onClick={() => setJust(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal pase previo */}
      {pase && (
        <div className="modal-bg" onClick={() => setPase(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title"> Pase previo — permite entrar fuera de margen</div>
              <button className="modal-close" onClick={() => setPase(null)}>×</button>
            </div>
            <p className="muted" style={{ marginBottom: 16 }}>Crea una autorización para que el empleado entre hoy fuera del margen de 60 min.</p>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Empleado <span style={{ color: "var(--bad)" }}>*</span></label>
              <Select
                value={pase.cedula}
                onChange={e => {
                  const emp = empleados.find(x => x.cedula === e.target.value);
                  setPase({ ...pase!, empleadoId: emp?.id || 0, nombre: emp ? nombreCompleto(emp) : "", cedula: e.target.value });
                }}
              >
                {empleados.filter(e => e.activo).map(e => (
                  <option key={e.cedula} value={e.cedula}>{nombreCompleto(e)} ({e.cedula})</option>
                ))}
              </Select>
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Fecha <span style={{ color: "var(--bad)" }}>*</span></label>
              <input
                type="date"
                value={pase.fecha}
                onChange={e => setPase({ ...pase, fecha: e.target.value })}
                min={getHoyVE()}
              />
            </div>
            <div className="form-group">
              <label>Motivo <span style={{ color: "var(--bad)" }}>*</span></label>
              <input
                value={pase.motivo}
                onChange={e => setPase({ ...pase, motivo: e.target.value })}
                placeholder="Ej. cita médica, llegará 09:30"
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={handleCrearPase} disabled={creandoPase || !pase.motivo || !pase.empleadoId}>
                {creandoPase ? "Creando…" : " Crear pase"}
              </button>
              <button className="btn btn-ghost" onClick={() => setPase(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}