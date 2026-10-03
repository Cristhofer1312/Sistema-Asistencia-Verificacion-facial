"use client";
import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { BadgeEstadoEntrada } from "@/components/ui/BadgeEstadoEntrada";
import { 
  type Asistencia, 
  type Empleado, 
  badgeClass, 
  nombreCompleto, 
  getHoyVE, 
  getSemanaVE,
  isLaborable,
  toDateOnly,
  getVenezuelaDate,
  getGerenciaName,
  formatExtras
} from "@/lib/types";
import { useToast } from "@/components/ui/Toast";

export default function Historial({ params }: { params: Promise<{ cedula: string }> }) {
  const { addToast } = useToast();
  const [empleado, setEmpleado] = useState<Empleado | null>(null);
  const [asistencias, setAsistencias] = useState<Asistencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [desde, setDesde] = useState(getSemanaVE());
  const [hasta, setHasta] = useState(getHoyVE());
  const [justAnticipada, setJustAnticipada] = useState<{ motivo: string } | null>(null);
  const [creandoJustAnt, setCreandoJustAnt] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    async function cargar() {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      try {
        const { cedula: rawCedula } = await params;
        const cedula = decodeURIComponent(rawCedula);

        const [emp, asis] = await Promise.all([
          fetch(`/api/empleados/${cedula}`, { signal: abortRef.current.signal }).then(r => r.ok ? r.json() : null),
          fetch(`/api/asistencias?empleadoCedula=${encodeURIComponent(cedula)}&desde=${desde}&hasta=${hasta}`, { signal: abortRef.current.signal }).then(r => r.json()),
        ]);
        if (!abortRef.current.signal.aborted) {
          setEmpleado(emp);
          setAsistencias(asis);
        }
      } catch (e: any) {
        if (e.name !== 'AbortError') setError(e.message || "Error cargando datos");
      } finally {
        if (!abortRef.current.signal.aborted) setLoading(false);
      }
    }
    cargar();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [params, desde, hasta]);

  const tardes = asistencias.filter(f => f.estadoEntrada === "TARDE" || (f.estadoEntrada === "JUSTIFICADO" && f.estadoOriginal === "TARDE")).length;
  const faltas = asistencias.filter(f => f.estadoEntrada === "FALTA" || (f.estadoEntrada === "JUSTIFICADO" && f.estadoOriginal === "FALTA")).length;
  const justs  = asistencias.filter(f => f.estadoEntrada === "JUSTIFICADO").length;
  const extras = asistencias.reduce((a, f) => a + (f.extrasH || 0), 0);

  // Verificar si hoy es laborable y no hay entrada registrada
  const hoy = getHoyVE();
  const hoyDate = toDateOnly(getVenezuelaDate());
  const tieneEntradaHoy = asistencias.some(f => f.fecha === hoy && f.entrada);
  const esFeriadoHoy = asistencias.some(f => f.fecha === hoy && f.estadoEntrada === "FERIADO");
  const esVacacionesHoy = asistencias.some(f => f.fecha === hoy && f.estadoEntrada === "VACACIONES");
  const puedeJustificarHoy = empleado?.activo && isLaborable(hoyDate) && !tieneEntradaHoy && !esFeriadoHoy && !esVacacionesHoy;

  async function handleCrearJustAnticipada() {
    if (!justAnticipada?.motivo || !empleado) return;
    setCreandoJustAnt(true);
    try {
      await api.pases.create({
        empleadoId: empleado.id,
        fecha: hoy,
        motivo: justAnticipada.motivo,
        tipo: "JUSTIFICACION_ANTICIPADA",
      });
      setJustAnticipada(null);
      // Recargar asistencias
      const asis = await fetch(`/api/asistencias?empleadoCedula=${encodeURIComponent(empleado.cedula)}&desde=${desde}&hasta=${hasta}`).then(r => r.json());
      setAsistencias(asis);
      addToast({ type: 'success', title: 'Justificación creada', message: 'La justificación anticipada se guardó correctamente' });
    } catch (e: any) {
      addToast({ type: 'error', title: 'Error', message: e.data?.error || e.message || "Error creando justificación anticipada" });
    } finally {
      setCreandoJustAnt(false);
    }
  }

  if (loading) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>Cargando…</div>;
  }

  if (error || !empleado) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 40 }}>
        <div style={{ fontSize: "2rem", marginBottom: 12 }}></div>
        <p style={{ color: "var(--bad)" }}>{error || "Empleado no encontrado"}</p>
        <a href="/admin/empleados" className="btn btn-primary" style={{ marginTop: 16 }}>← Volver</a>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div className="breadcrumb" style={{ marginBottom: 10 }}>
          <a href="/admin/empleados">Empleados</a>
          <span>/</span>
          <span style={{ color: "var(--ink-2)" }}>{nombreCompleto(empleado)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 50, height: 50, borderRadius: 14, background: "var(--brand-l)", color: "var(--brand)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "1.1rem", flexShrink: 0 }}>
            {empleado.nombre[0]}{empleado.apellido[0]}
          </div>
          <div>
            <h2 style={{ marginBottom: 3 }}>{nombreCompleto(empleado)}</h2>
            <p className="muted">
              <span className="mono">{empleado.cedula}</span>
              · {empleado.cargo} · {getGerenciaName(empleado.gerencia)}
              <span className={`badge ${empleado.activo ? "b-tiempo" : "b-inactive"}`} style={{ marginLeft: 8, fontSize: ".68rem" }}>
                {empleado.activo ? "Activo" : "Inactivo"}
              </span>
            </p>
          </div>
          {puedeJustificarHoy && (
            <button 
              className="btn btn-warn" 
              style={{ marginLeft: "auto" }}
              onClick={() => setJustAnticipada({ motivo: "" })}
            >
               Justificar entrada de hoy
            </button>
          )}
        </div>
      </div>

      {/* Totals + filter row */}
      <div className="row" style={{ marginBottom: 20, gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="form-group" style={{ flex: "1 1 140px" }}>
          <label>Desde</label>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} />
        </div>
        <div className="form-group" style={{ flex: "1 1 140px" }}>
          <label>Hasta</label>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
        </div>

        <div style={{ flex: "2 1 auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            { label: "Tardanzas", val: tardes, cls: "b-tarde" },
            { label: "Faltas",    val: faltas, cls: "b-falta" },
            { label: "Justific.", val: justs,  cls: "b-just" },
            { label: "Extras",    val: formatExtras(extras) || "00:00", cls: "b-comp" },
          ].map(s => (
            <div key={s.label} style={{ textAlign: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "8px 16px", minWidth: 80 }}>
              <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--ink)" }}>{s.val}</div>
              <div style={{ fontSize: ".72rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="table-wrap" style={{ border: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Entrada</th>
                <th>Salida</th>
                <th>Estado entrada</th>
                <th>Estado salida</th>
                <th>Extras</th>
                <th>Autorizador</th>
              </tr>
            </thead>
            <tbody>
              {asistencias.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state" style={{ padding: "32px 0" }}>
                      <div className="empty-icon"></div>
                      <h4>Sin registros en el rango</h4>
                      <p>Ajuste las fechas para ver el histórico completo.</p>
                    </div>
                  </td>
                </tr>
              )}
              {asistencias.map((f, i) => (
                <tr key={i}>
                  <td className="mono" style={{ fontWeight: 600 }}>{f.fecha}</td>
                  <td className="mono">{f.entrada ?? <span className="muted">—</span>}</td>
                  <td className="mono">{f.salida  ?? <span className="muted">—</span>}</td>
                  <td><BadgeEstadoEntrada estadoEntrada={f.estadoEntrada} estadoOriginal={f.estadoOriginal} /></td>
                  <td>{f.estadoSalida ? <span className={badgeClass(f.estadoSalida)}>{f.estadoSalida}</span> : <span className="muted">—</span>}</td>
                  <td>{f.extrasH > 0 ? <span style={{ color: "var(--ok)", fontWeight: 600 }}>{formatExtras(f.extrasH)}</span> : <span className="muted">—</span>}</td>
                  <td className="muted">{f.autorizadorId ? `User ${f.autorizadorId}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <a href="/admin/empleados" className="btn btn-ghost btn-sm">← Volver a empleados</a>
      </div>

      {/* Modal Justificación Anticipada */}
      {justAnticipada && (
        <div className="modal-bg" onClick={() => setJustAnticipada(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title"> Justificar entrada de hoy</div>
              <button className="modal-close" onClick={() => setJustAnticipada(null)}>×</button>
            </div>
            <p className="muted" style={{ marginBottom: 16 }}>
              Permitirá a <b>{nombreCompleto(empleado!)}</b> fichar entrada aunque exceda el margen de tardanza.
              Quedará registrada como <span className="badge b-just">JUSTIFICADO</span> con la hora real.
            </p>
            <div className="form-group">
              <label>Motivo <span style={{ color: "var(--bad)" }}>*</span></label>
              <textarea
                rows={3}
                value={justAnticipada.motivo}
                onChange={e => setJustAnticipada({ motivo: e.target.value })}
                placeholder="Ej. Retraso por trámite médico, cita previa..."
                required
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-warn" onClick={handleCrearJustAnticipada} disabled={creandoJustAnt || !justAnticipada.motivo}>
                {creandoJustAnt ? "Guardando…" : " Crear justificación anticipada"}
              </button>
              <button className="btn btn-ghost" onClick={() => setJustAnticipada(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}