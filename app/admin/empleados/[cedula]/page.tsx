"use client";
import { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import { api } from "@/lib/api";
import { BadgeEstadoEntrada } from "@/components/ui/BadgeEstadoEntrada";
import {
  type Asistencia,
  type Empleado,
  type PermisoEstudiantil,
  badgeClass,
  nombreCompleto,
  getHoyVE,
  getSemanaVE,
  isLaborable,
  toDateOnly,
  getVenezuelaDate,
  getGerenciaName,
  formatExtras,
  diasSemanaLabel
} from "@/lib/types";
import { useToast } from "@/components/ui/Toast";

const FaceEnrollDynamic = dynamic(() => import("@/components/face/FaceEnroll").then(m => m.FaceEnroll), {
  ssr: false,
  loading: () => <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, color: "#94a3b8" }}>Cargando módulo biométrico…</div>,
});

export default function Historial({ params }: { params: Promise<{ cedula: string }> }) {
  const { addToast } = useToast();
  const [empleado, setEmpleado] = useState<Empleado | null>(null);
  const [asistencias, setAsistencias] = useState<Asistencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [desde, setDesde] = useState(getSemanaVE());
  const [hasta, setHasta] = useState(getHoyVE());
  const [historialCompleto, setHistorialCompleto] = useState(true); // ON: sin rango, todo el histórico
  const [justAnticipada, setJustAnticipada] = useState<{ motivo: string } | null>(null);
  const [creandoJustAnt, setCreandoJustAnt] = useState(false);
  const [permisos, setPermisos] = useState<PermisoEstudiantil[]>([]);
  const [guardandoPermiso, setGuardandoPermiso] = useState(false);
  const [permisoForm, setPermisoForm] = useState({ dias: [] as number[], horaLimite: "10:30", desde: "", hasta: "", motivo: "" });
  const [formAbierto, setFormAbierto] = useState<null | "vacaciones" | "estudiantil" | "reposo">(null);
  const [vacForm, setVacForm] = useState({ inicio: "", fin: "", motivo: "" });
  const [repForm, setRepForm] = useState({ inicio: "", fin: "", motivo: "" });
  const [guardandoVacRep, setGuardandoVacRep] = useState(false);
  const [showRecapture, setShowRecapture] = useState(false);
  const [guardandoBio, setGuardandoBio] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const DIAS_OPTS = [
    { v: 1, label: "Lun" }, { v: 2, label: "Mar" }, { v: 3, label: "Mié" },
    { v: 4, label: "Jue" }, { v: 5, label: "Vie" }, { v: 6, label: "Sáb" }, { v: 0, label: "Dom" },
  ];

  const LIMITE = historialCompleto ? 2000 : 500;

  function queryAsistencias(cedula: string) {
    const sp = new URLSearchParams({ empleadoCedula: cedula, take: String(LIMITE) });
    if (!historialCompleto) {
      sp.set("desde", desde);
      sp.set("hasta", hasta);
    }
    return fetch(`/api/asistencias?${sp}`).then(r => r.json());
  }

  useEffect(() => {
    async function cargar() {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      try {
        const { cedula: rawCedula } = await params;
        const cedula = decodeURIComponent(rawCedula);

        const [emp, asis] = await Promise.all([
          fetch(`/api/empleados/${cedula}`, { signal: abortRef.current.signal }).then(r => r.ok ? r.json() : null),
          queryAsistencias(cedula),
        ]);
        if (!abortRef.current.signal.aborted) {
          setEmpleado(emp);
          setAsistencias(asis);
          if (emp?.id) {
            api.permisosEstudio.list({ empleadoId: emp.id })
              .then(setPermisos)
              .catch(() => {});
          }
        }
      } catch (e: any) {
        if (e.name !== 'AbortError') setError(e.message || "Error cargando datos");
      } finally {
        if (!abortRef.current.signal.aborted) setLoading(false);
      }
    }
    cargar();
    return () => { if (abortRef.current) abortRef.current.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, desde, hasta, historialCompleto]);

  const esTar = (f: Asistencia) => f.estadoEntrada === "TARDE" || (f.estadoEntrada === "JUSTIFICADO" && f.estadoOriginal === "TARDE");
  const esFal = (f: Asistencia) => f.estadoEntrada === "FALTA" || (f.estadoEntrada === "JUSTIFICADO" && f.estadoOriginal === "FALTA");
  const tardes = asistencias.filter(esTar).length;
  const faltas = asistencias.filter(esFal).length;
  const justs  = asistencias.filter(f => f.estadoEntrada === "JUSTIFICADO").length;
  const justTarde = asistencias.filter(f => f.estadoEntrada === "JUSTIFICADO" && f.estadoOriginal === "TARDE").length;
  const justFalta = asistencias.filter(f => f.estadoEntrada === "JUSTIFICADO" && f.estadoOriginal === "FALTA").length;
  const tempranos = asistencias.filter(f => f.estadoEntrada === "TEMPRANO").length;
  const aTiempo = asistencias.filter(f => f.estadoEntrada === "A_TIEMPO").length;
  const conEntrada = asistencias.filter(f => !!f.entrada).length;
  const feriados = asistencias.filter(f => f.estadoEntrada === "FERIADO").length;
  const vacaciones = asistencias.filter(f => f.estadoEntrada === "VACACIONES").length;
  const reposos = asistencias.filter(f => f.estadoEntrada === "REPOSO_MEDICO").length;
  const salTemprano = asistencias.filter(f => f.estadoSalida === "TEMPRANO").length;
  const salCompletadas = asistencias.filter(f => f.estadoSalida === "COMPLETADO").length;
  const extras = asistencias.reduce((a, f) => a + (f.extrasH || 0), 0);
  const presentismo = asistencias.length > 0 ? Math.round((conEntrada / asistencias.length) * 100) : 0;
  const topeAlcanzado = asistencias.length >= LIMITE;

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
      // Recargar asistencias (respeta toggle completo/rango)
      const asis = await queryAsistencias(empleado.cedula);
      setAsistencias(asis);
      addToast({ type: 'success', title: 'Justificación creada', message: 'La justificación anticipada se guardó correctamente' });
    } catch (e: any) {
      addToast({ type: 'error', title: 'Error', message: e.data?.error || e.message || "Error creando justificación anticipada" });
    } finally {
      setCreandoJustAnt(false);
    }
  }

  async function handleCrearPermiso() {
    if (!empleado || permisoForm.dias.length === 0 || !permisoForm.horaLimite || !permisoForm.desde || !permisoForm.hasta) return;
    setGuardandoPermiso(true);
    try {
      const nuevo = await api.permisosEstudio.create({
        empleadoId: empleado.id,
        diasSemana: permisoForm.dias,
        horaLimite: permisoForm.horaLimite,
        validoDesde: permisoForm.desde,
        validoHasta: permisoForm.hasta,
        motivo: permisoForm.motivo || undefined,
      });
      setPermisos(p => [nuevo, ...p]);
      setFormAbierto(null);
      setPermisoForm({ dias: [], horaLimite: "10:30", desde: "", hasta: "", motivo: "" });
      addToast({ type: 'success', title: 'Permiso creado', message: 'El permiso estudiantil se guardó correctamente' });
    } catch (e: any) {
      addToast({ type: 'error', title: 'Error', message: e.data?.error || e.message || "Error creando permiso" });
    } finally {
      setGuardandoPermiso(false);
    }
  }

  async function recargarAsistencias() {
    if (!empleado) return;
    const asis = await queryAsistencias(empleado.cedula);
    setAsistencias(asis);
  }

  async function handleCrearVacaciones() {
    if (!empleado || !vacForm.inicio || !vacForm.fin) return;
    setGuardandoVacRep(true);
    try {
      await api.vacaciones.create({
        empleadoId: empleado.id,
        inicio: vacForm.inicio,
        fin: vacForm.fin,
        motivo: vacForm.motivo || undefined,
      });
      setFormAbierto(null);
      setVacForm({ inicio: "", fin: "", motivo: "" });
      await recargarAsistencias();
      addToast({ type: 'success', title: 'Vacaciones otorgadas', message: 'El período quedó registrado correctamente' });
    } catch (e: any) {
      addToast({ type: 'error', title: 'Error', message: e.data?.error || e.message || "Error otorgando vacaciones" });
    } finally {
      setGuardandoVacRep(false);
    }
  }

  async function handleCrearReposo() {
    if (!empleado || !repForm.inicio || !repForm.fin) return;
    setGuardandoVacRep(true);
    try {
      await api.reposos.create({
        empleadoId: empleado.id,
        inicio: repForm.inicio,
        fin: repForm.fin,
        motivo: repForm.motivo || undefined,
      });
      setFormAbierto(null);
      setRepForm({ inicio: "", fin: "", motivo: "" });
      await recargarAsistencias();
      addToast({ type: 'success', title: 'Reposo reportado', message: 'El reposo médico quedó registrado correctamente' });
    } catch (e: any) {
      addToast({ type: 'error', title: 'Error', message: e.data?.error || e.message || "Error reportando reposo" });
    } finally {
      setGuardandoVacRep(false);
    }
  }

  function abrirForm(cual: "vacaciones" | "estudiantil" | "reposo") {
    setFormAbierto(f => (f === cual ? null : cual));
  }

  async function handleTogglePermiso(p: PermisoEstudiantil) {
    try {
      const upd = await api.permisosEstudio.update(p.id, { activo: !p.activo });
      setPermisos(ps => ps.map(x => x.id === p.id ? upd : x));
    } catch (e: any) {
      addToast({ type: 'error', title: 'Error', message: e.data?.error || e.message || "Error actualizando permiso" });
    }
  }

  function toggleDia(v: number) {
    setPermisoForm(f => ({ ...f, dias: f.dias.includes(v) ? f.dias.filter(d => d !== v) : [...f.dias, v] }));
  }

  async function handleRecapture(descriptor: Float32Array) {
    if (!empleado) return;
    setGuardandoBio(true);
    try {
      const res = await fetch(`/api/empleados/${empleado.id}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descriptor: Array.from(descriptor) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setShowRecapture(false);
      addToast({ type: 'success', title: 'Biometría actualizada', message: 'La nueva firma facial quedó registrada' });
      if (data.warning) addToast({ type: 'error', title: 'Aviso de confusión', message: data.warning });
    } catch (e: any) {
      addToast({ type: 'error', title: 'Error', message: e.message || "Error guardando biometría" });
    } finally {
      setGuardandoBio(false);
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
      {/* Datos filiatorios */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="breadcrumb" style={{ marginBottom: 10 }}>
          <a href="/admin/empleados">Empleados</a>
          <span>/</span>
          <span style={{ color: "var(--ink-2)" }}>Perfil</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "var(--brand-l)", color: "var(--brand)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "1.25rem", flexShrink: 0 }}>
            {empleado.nombre[0]}{empleado.apellido[0]}
          </div>
          <div style={{ flex: "1 1 auto" }}>
            <h2 style={{ marginBottom: 3 }}>{nombreCompleto(empleado)}</h2>
            <p className="muted" style={{ marginBottom: 4 }}>
              <span className="mono">{empleado.cedula}</span>
              {` · ${empleado.cargo} · ${getGerenciaName(empleado.gerencia)}`}
              <span className={`badge ${empleado.activo ? "b-tiempo" : "b-inactive"}`} style={{ marginLeft: 8, fontSize: ".68rem" }}>
                {empleado.activo ? "Activo" : "Inactivo"}
              </span>
            </p>
            <p className="muted" style={{ fontSize: ".78rem", margin: 0 }}>
              En sistema desde: {empleado.creadoEn ? new Date(empleado.creadoEn).toLocaleDateString("es-VE") : "—"}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {puedeJustificarHoy && (
              <button
                className="btn btn-warn"
                onClick={() => setJustAnticipada({ motivo: "" })}
              >
                 Justificar entrada de hoy
              </button>
            )}
            <button
              className="btn btn-ghost btn-sm"
              title="Volver a capturar la firma facial (p. ej. si el kiosco lo confunde)"
              onClick={() => setShowRecapture(true)}
            >
              Re-capturar biometría
            </button>
          </div>
        </div>
      </div>

      {/* Estadísticas + alcance */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={historialCompleto}
              onChange={e => setHistorialCompleto(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: "var(--brand)" }}
            />
            Historial completo
          </label>
          <div className="form-group" style={{ flex: "0 1 150px", opacity: historialCompleto ? 0.45 : 1 }}>
            <label>Desde</label>
            <input type="date" value={desde} disabled={historialCompleto} onChange={e => setDesde(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: "0 1 150px", opacity: historialCompleto ? 0.45 : 1 }}>
            <label>Hasta</label>
            <input type="date" value={hasta} disabled={historialCompleto} onChange={e => setHasta(e.target.value)} />
          </div>
          <span className="muted" style={{ fontSize: ".78rem", marginLeft: "auto" }}>
            {historialCompleto ? "Todo el histórico" : `${desde || "…"} → ${hasta || "…"}`} · {asistencias.length} registros
          </span>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            { label: "Presentismo", val: `${presentismo}%`, cls: "b-tiempo", title: "Registros con entrada sobre el total visible" },
            { label: "Asistencias", val: conEntrada, cls: "b-comp", title: "Registros con hora de entrada" },
            { label: "A tiempo", val: aTiempo, cls: "b-tiempo", title: "Entradas dentro de la ventana" },
            { label: "Tempranos", val: tempranos, cls: "b-temp", title: "Entradas antes de la hora esperada" },
            { label: "Tardanzas", val: tardes, cls: "b-tarde", title: "Tardes (incluye justificadas con origen TARDE)" },
            { label: "Faltas", val: faltas, cls: "b-falta", title: "Faltas (incluye justificadas con origen FALTA)" },
            { label: "Justificadas", val: justs, cls: "b-just", title: `Justificadas: ${justTarde} por tardanza · ${justFalta} por falta` },
            { label: "Extras", val: formatExtras(extras) || "00:00", cls: "b-comp", title: "Horas extras acumuladas" },
            { label: "Sal. temprana", val: salTemprano, cls: "b-tarde", title: `Salidas antes de referencia (completadas: ${salCompletadas})` },
          ].map(s => (
            <div key={s.label} title={s.title} style={{ textAlign: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "8px 14px", minWidth: 86, flex: "1 1 auto" }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--ink)" }}>{s.val}</div>
              <div style={{ fontSize: ".68rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>{s.label}</div>
            </div>
          ))}
        </div>
        <p className="muted" style={{ fontSize: ".78rem", marginTop: 10, marginBottom: 0 }}>
          Feriados: {feriados} · Vacaciones: {vacaciones} · Reposos: {reposos} · Salidas completadas: {salCompletadas}
        </p>
        {topeAlcanzado && (
          <p style={{ fontSize: ".78rem", marginTop: 6, marginBottom: 0, color: "var(--warn)" }}>
            Se alcanzó el tope de {LIMITE} registros: refine por rango para ver el resto.
          </p>
        )}
      </div>

      {/* Otorgar: vacaciones / permiso estudiantil / reposo médico */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>Otorgar</h3>
          <span className="muted" style={{ fontSize: ".8rem" }}>Vacaciones, permiso estudiantil o reposo médico</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className={`btn btn-sm ${formAbierto === "vacaciones" ? "btn-primary" : "btn-ghost"}`} onClick={() => abrirForm("vacaciones")}>
              {formAbierto === "vacaciones" ? "Cerrar" : "+ Vacaciones"}
            </button>
            <button className={`btn btn-sm ${formAbierto === "estudiantil" ? "btn-primary" : "btn-ghost"}`} onClick={() => abrirForm("estudiantil")}>
              {formAbierto === "estudiantil" ? "Cerrar" : "+ Permiso estudiantil"}
            </button>
            <button className={`btn btn-sm ${formAbierto === "reposo" ? "btn-primary" : "btn-ghost"}`} onClick={() => abrirForm("reposo")}>
              {formAbierto === "reposo" ? "Cerrar" : "+ Reposo médico"}
            </button>
          </div>
        </div>

        {formAbierto === "vacaciones" && (
          <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <div className="row" style={{ gap: 10 }}>
              <div className="form-group" style={{ flex: "1 1 140px" }}>
                <label>Inicio <span style={{ color: "var(--bad)" }}>*</span></label>
                <input type="date" value={vacForm.inicio} onChange={e => setVacForm(f => ({ ...f, inicio: e.target.value }))} />
              </div>
              <div className="form-group" style={{ flex: "1 1 140px" }}>
                <label>Fin <span style={{ color: "var(--bad)" }}>*</span></label>
                <input type="date" value={vacForm.fin} onChange={e => setVacForm(f => ({ ...f, fin: e.target.value }))} />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: 10 }}>
              <label>Motivo</label>
              <input type="text" value={vacForm.motivo} onChange={e => setVacForm(f => ({ ...f, motivo: e.target.value }))} placeholder="Ej. Vacaciones anuales" maxLength={200} />
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary btn-sm" onClick={handleCrearVacaciones} disabled={guardandoVacRep || !vacForm.inicio || !vacForm.fin}>
                {guardandoVacRep ? "Guardando…" : "Otorgar vacaciones"}
              </button>
            </div>
          </div>
        )}

        {formAbierto === "reposo" && (
          <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <div className="row" style={{ gap: 10 }}>
              <div className="form-group" style={{ flex: "1 1 140px" }}>
                <label>Inicio <span style={{ color: "var(--bad)" }}>*</span></label>
                <input type="date" value={repForm.inicio} onChange={e => setRepForm(f => ({ ...f, inicio: e.target.value }))} />
              </div>
              <div className="form-group" style={{ flex: "1 1 140px" }}>
                <label>Fin <span style={{ color: "var(--bad)" }}>*</span></label>
                <input type="date" value={repForm.fin} onChange={e => setRepForm(f => ({ ...f, fin: e.target.value }))} />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: 10 }}>
              <label>Motivo / diagnóstico</label>
              <input type="text" value={repForm.motivo} onChange={e => setRepForm(f => ({ ...f, motivo: e.target.value }))} placeholder="Ej. Reposo por gripe" maxLength={300} />
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary btn-sm" onClick={handleCrearReposo} disabled={guardandoVacRep || !repForm.inicio || !repForm.fin}>
                {guardandoVacRep ? "Guardando…" : "Reportar reposo"}
              </button>
            </div>
          </div>
        )}

        {formAbierto === "estudiantil" && (
          <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <p className="muted" style={{ fontSize: ".8rem", marginTop: 0 }}>Extiende la hora límite solo los días indicados (solo alarga, nunca recorta).</p>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label>Días de semana <span style={{ color: "var(--bad)" }}>*</span></label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {DIAS_OPTS.map(d => (
                  <label key={d.v} style={{ display: "flex", alignItems: "center", gap: 5, border: "1px solid var(--border)", borderRadius: 8, padding: "5px 10px", cursor: "pointer", background: permisoForm.dias.includes(d.v) ? "var(--brand-l)" : "transparent" }}>
                    <input type="checkbox" checked={permisoForm.dias.includes(d.v)} onChange={() => toggleDia(d.v)} />
                    {d.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="row" style={{ gap: 10 }}>
              <div className="form-group" style={{ flex: "1 1 120px" }}>
                <label>Hora límite <span style={{ color: "var(--bad)" }}>*</span></label>
                <input type="time" value={permisoForm.horaLimite} onChange={e => setPermisoForm(f => ({ ...f, horaLimite: e.target.value }))} />
              </div>
              <div className="form-group" style={{ flex: "1 1 140px" }}>
                <label>Válido desde <span style={{ color: "var(--bad)" }}>*</span></label>
                <input type="date" value={permisoForm.desde} onChange={e => setPermisoForm(f => ({ ...f, desde: e.target.value }))} />
              </div>
              <div className="form-group" style={{ flex: "1 1 140px" }}>
                <label>Válido hasta <span style={{ color: "var(--bad)" }}>*</span></label>
                <input type="date" value={permisoForm.hasta} onChange={e => setPermisoForm(f => ({ ...f, hasta: e.target.value }))} />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: 10 }}>
              <label>Motivo</label>
              <input type="text" value={permisoForm.motivo} onChange={e => setPermisoForm(f => ({ ...f, motivo: e.target.value }))} placeholder="Ej. Semestre universitario nocturno" maxLength={300} />
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary btn-sm" onClick={handleCrearPermiso} disabled={guardandoPermiso || permisoForm.dias.length === 0 || !permisoForm.horaLimite || !permisoForm.desde || !permisoForm.hasta}>
                {guardandoPermiso ? "Guardando…" : "Guardar permiso"}
              </button>
            </div>
          </div>
        )}

        {permisos.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Sin permisos estudiantiles registrados. Rige la regla general.</p>
        ) : (
          <div className="table-wrap" style={{ border: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>Días</th>
                  <th>Límite</th>
                  <th>Vigencia</th>
                  <th>Motivo</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {permisos.map(p => (
                  <tr key={p.id} style={{ opacity: p.activo ? 1 : 0.6 }}>
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
                      <button className="btn btn-ghost btn-sm" onClick={() => handleTogglePermiso(p)}>
                        {p.activo ? "Suspender" : "Reactivar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Historial */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
          <h3 style={{ margin: 0 }}>Historial de asistencias ({asistencias.length})</h3>
        </div>
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
                <th>Obs.</th>
              </tr>
            </thead>
            <tbody>
              {asistencias.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state" style={{ padding: "32px 0" }}>
                      <div className="empty-icon"></div>
                      <h4>Sin registros en el rango</h4>
                      <p>Ajuste las fechas o active el historial completo.</p>
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
                  <td className="muted" style={{ fontSize: ".8rem", maxWidth: 220 }} title={f.justificacionObs ?? ""}>
                    {f.justificacionObs
                      ? (f.justificacionObs.length > 40 ? `${f.justificacionObs.slice(0, 40)}…` : f.justificacionObs)
                      : "—"}
                  </td>
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

      {/* Modal Re-capturar biometría */}
      {showRecapture && (
        <div className="modal-bg" onClick={() => { if (!guardandoBio) setShowRecapture(false); }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <div className="modal-title">Re-capturar biometría — {empleado && nombreCompleto(empleado)}</div>
              <button className="modal-close" onClick={() => { if (!guardandoBio) setShowRecapture(false); }}>×</button>
            </div>
            <p className="muted" style={{ marginBottom: 16 }}>
              Reemplaza la firma facial actual. Úselo si el kiosco confunde a esta persona:
              capture con <b>luz frontal abundante</b>, rostro centrado y quieto hasta completar las 5 muestras.
            </p>
            <FaceEnrollDynamic
              onCapture={handleRecapture}
              onError={(msg) => addToast({ type: 'error', title: 'Captura', message: msg })}
            />
            {guardandoBio && <p className="muted" style={{ marginTop: 12 }}>Guardando nueva firma…</p>}
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowRecapture(false)} disabled={guardandoBio}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}