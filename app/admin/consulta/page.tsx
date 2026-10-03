"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import { api } from "@/lib/api";
import { BadgeEstadoEntrada } from "@/components/ui/BadgeEstadoEntrada";
import { 
  type Asistencia, 
  type Empleado, 
  type EstadoEntrada,
  type EstadoSalida,
  badgeClass, 
  nombreCompleto, 
  estadoDe, 
  getHoyVE, 
  getAyerVE, 
  getSemanaVE,
  getGerenciaName,
  ESTADOS,
  ESTADO_META,
  formatExtras
} from "@/lib/types";
import { useToast } from "@/components/ui/Toast";
import { Select } from "@/components/ui/Select";

const ESTADOS_FILTRO = ["Todos", ...ESTADOS];

function ActiveFiltersSummary({
  q,
  gerencia,
  estados,
  soloExtras,
  soloAnticipadas,
  soloSinSalida,
  onClear,
}: {
  q: string;
  gerencia: string;
  estados: string[];
  soloExtras: boolean;
  soloAnticipadas: boolean;
  soloSinSalida: boolean;
  onClear: () => void;
}) {
  const hasFilters = q || gerencia !== "Todas" || estados.length > 0 || soloExtras || soloAnticipadas || soloSinSalida;
  if (!hasFilters) return null;

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--border)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span style={{ fontSize: ".72rem", color: "var(--muted)", fontWeight: 600 }}>FILTROS ACTIVOS:</span>
      {q && <span className="chip"> "{q}"</span>}
      {gerencia !== "Todas" && <span className="chip"> {gerencia}</span>}
      {estados.map(s => <span key={s} className="chip" style={{ background: "var(--brand-l)", borderColor: "var(--brand-mid)", color: "var(--brand)" }}>{s}</span>)}
      {soloExtras && <span className="chip" style={{ background: "var(--ok-l)", borderColor: "var(--ok-b)", color: "var(--ok)" }}>Solo extras</span>}
      {soloAnticipadas && <span className="chip" style={{ background: "var(--orange-l)", borderColor: "var(--orange-b)", color: "var(--orange)" }}>S. anticipada</span>}
      {soloSinSalida && <span className="chip" style={{ background: "var(--warn-l)", borderColor: "var(--warn-b)", color: "var(--warn)" }}>Sin salida</span>}
      <button className="btn btn-sm btn-ghost" style={{ fontSize: ".72rem", padding: "2px 8px" }} onClick={onClear}>✕</button>
    </div>
  );
}

export default function Consulta() {
  const { addToast } = useToast();
  const [q, setQ] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [mounted, setMounted] = useState(false);
  const [gerenciaId, setGerenciaId] = useState<string>("Todas");
  const [estados, setEstados] = useState<string[]>([]);
  const [soloExtras, setSoloExtras] = useState(false);
  const [soloAnticipadas, setSoloAnticipadas] = useState(false);
  const [soloSinSalida, setSoloSinSalida] = useState(false);
  const [orden, setOrden] = useState<"nombre" | "tardes" | "extras" | "faltas">("nombre");
  const [expandida, setExpandida] = useState<string | null>(null);
  const [ficha, setFicha] = useState<string | null>(null);
  const [just, setJust] = useState<{ cedula: string; fecha: string; estado: string; empleadoId: number; justificacionDoc?: string; justificacionObs: string } | null>(null);
  const [pase, setPase] = useState<{ cedula: string; empleadoId: number; nombre: string; motivo: string; fecha: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [asistencias, setAsistencias] = useState<Asistencia[]>([]);
  const [gerencias, setGerencias] = useState<{ id: number; nombre: string }[]>([]);
  const [justificando, setJustificando] = useState(false);
  const [creandoPase, setCreandoPase] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

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
      const [emps, asis, gersApi] = await Promise.all([
        api.empleados.list() as Promise<Empleado[]>,
        fetch(`/api/asistencias?desde=${desde}&hasta=${hasta}${gerenciaId !== "Todas" ? `&gerenciaId=${gerenciaId}` : ""}`, { 
          signal: abortRef.current.signal 
        }).then(r => r.json()),
        fetch('/api/gerencias').then(r => r.json()),
      ]);
      setEmpleados(emps);
      setAsistencias(asis);
      const gers = [{ id: 0, nombre: "Todas" }, ...gersApi].sort((a, b) => a.nombre.localeCompare(b.nombre));
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
  }, [desde, hasta, gerenciaId]);

  function preset(dias: number) {
    const fin = getHoyVE();
    const ini = dias === 1 ? getHoyVE() : dias === 2 ? getAyerVE() : getSemanaVE();
    setDesde(ini); setHasta(fin);
  }

  function toggleEstado(e: string) {
    setEstados(s => s.includes(e) ? s.filter(x => x !== e) : [...s, e]);
  }

  function limpiar() {
    setQ(""); setEstados([]); setSoloExtras(false);
    setSoloAnticipadas(false); setSoloSinSalida(false); setGerenciaId("Todas");
  }

  const grupos = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const emps = empleados.filter((e) => {
      if (gerenciaId !== "Todas" && e.gerenciaId !== Number(gerenciaId)) return false;
      if (ql && !`${e.nombre} ${e.apellido} ${e.cedula} ${e.cargo}`.toLowerCase().includes(ql)) return false;
      return true;
    });
    return emps
      .map((e) => {
        let filas = asistencias.filter((f) => f.empleado.cedula === e.cedula && f.fecha >= desde && f.fecha <= hasta);
        if (estados.length) filas = filas.filter((f) => estadoDe(f).some((x) => estados.includes(x)));
        if (soloExtras) filas = filas.filter((f) => f.extrasH > 0);
        if (soloAnticipadas) filas = filas.filter((f) => f.estadoSalida === "TEMPRANO");
        if (soloSinSalida) filas = filas.filter((f) => f.entrada && !f.salida);
        const tiempos = filas.filter((f) => f.estadoEntrada === "A_TIEMPO" as EstadoEntrada).length;
        const tardes  = filas.filter((f) => f.estadoEntrada === "TARDE" as EstadoEntrada).length;
        const faltas  = filas.filter((f) => f.estadoEntrada === "FALTA" as EstadoEntrada).length;
        const justs   = filas.filter((f) => f.estadoEntrada === "JUSTIFICADO" as EstadoEntrada).length;
        const extras  = filas.reduce((a, f) => a + (f.extrasH || 0), 0);
        return { e, filas, tiempos, tardes, faltas, justs, extras };
      })
      .filter((g) => g.filas.length > 0)
      .sort((a, b) => {
        if (orden === "tardes") return b.tardes - a.tardes;
        if (orden === "extras") return b.extras - a.extras;
        if (orden === "faltas") return b.faltas - a.faltas;
        return `${a.e.nombre}`.localeCompare(b.e.nombre);
      });
  }, [q, desde, hasta, gerenciaId, estados, soloExtras, soloAnticipadas, soloSinSalida, orden, asistencias, empleados]);

  const totalReg    = grupos.reduce((a, g) => a + g.filas.length, 0);
  const totalTardes = grupos.reduce((a, g) => a + g.tardes, 0);
  const totalFaltas = grupos.reduce((a, g) => a + g.faltas, 0);
  const totalExtras = grupos.reduce((a, g) => a + g.extras, 0);
  const fichaEmp    = ficha ? empleados.find((x) => x.cedula === ficha) : null;
  const fichaFilas  = fichaEmp ? asistencias.filter(f => f.empleado.cedula === fichaEmp.cedula && f.fecha >= desde && f.fecha <= hasta) : [];

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
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>

      {/* ── Main column ── */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Page header */}
        <div className="row-between" style={{ marginBottom: 20 }}>
          <div>
            <h2 style={{ marginBottom: 3 }}>Consulta</h2>
            <p className="muted" style={{ fontSize: ".8125rem" }}>Vista única agrupada por empleado · filtros en tiempo real</p>
          </div>
          {/* Live summary chips */}
          <div className="row" style={{ gap: 8 }}>
            <span style={{ background: "var(--surface-2)", border: "1.5px solid var(--border-2)", borderRadius: "var(--r-full)", padding: "4px 12px", fontSize: ".78rem", fontWeight: 700, color: "var(--ink-2)" }}>
              {grupos.length} empleados
            </span>
            <span style={{ background: "var(--warn-l)", border: "1.5px solid var(--warn-b)", borderRadius: "var(--r-full)", padding: "4px 12px", fontSize: ".78rem", fontWeight: 700, color: "var(--warn)" }}>
              {totalTardes} tardes
            </span>
            <span style={{ background: "var(--bad-l)", border: "1.5px solid var(--bad-b)", borderRadius: "var(--r-full)", padding: "4px 12px", fontSize: ".78rem", fontWeight: 700, color: "var(--bad)" }}>
              {totalFaltas} faltas
            </span>
            <span style={{ background: "var(--ok-l)", border: "1.5px solid var(--ok-b)", borderRadius: "var(--r-full)", padding: "4px 12px", fontSize: ".78rem", fontWeight: 700, color: "var(--ok)" }}>
              {formatExtras(totalExtras) || "00:00"} extra
            </span>
          </div>
        </div>

        {/* ── Filter bar ── */}
        <div className="filter-bar" style={{ marginBottom: 16 }}>

          {/* Row 1: search + dates + gerencia + orden */}
          <div className="filter-row">
            <div className="form-group" style={{ flex: "2 1 180px" }}>
              <label htmlFor="q-buscar">Buscador</label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--muted-2)", fontSize: ".9rem", pointerEvents: "none" }}></span>
                <input
                  id="q-buscar" value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Nombre, cédula, cargo…"
                  style={{ paddingLeft: 32 }}
                />
              </div>
            </div>
            <div className="form-group" style={{ flex: "1 1 130px" }}>
              <label>Desde</label>
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="form-group" style={{ flex: "1 1 130px" }}>
              <label>Hasta</label>
              <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
            <div className="form-group" style={{ flex: "1 1 120px" }}>
              <label>Gerencia</label>
              <Select value={gerenciaId} onChange={(e) => setGerenciaId(e.target.value)}>
                {gerencias.map((g) => <option key={g.id} value={g.id === 0 ? "Todas" : g.id}>{g.nombre}</option>)}
              </Select>
            </div>
            <div className="form-group" style={{ flex: "1 1 120px" }}>
              <label>Ordenar por</label>
              <Select value={orden} onChange={(e) => setOrden(e.target.value as typeof orden)}>
                <option value="nombre">Nombre A–Z</option>
                <option value="tardes">Más tardes</option>
                <option value="faltas">Más faltas</option>
                <option value="extras">Más extras</option>
              </Select>
            </div>
          </div>

          {/* Row 2: presets + estado pills + switches */}
          <div className="filter-row" style={{ alignItems: "center" }}>
            {/* Date presets */}
            <div className="row" style={{ gap: 5, flexShrink: 0 }}>
              <button className="preset-btn" onClick={() => preset(1)}>Hoy</button>
              <button className="preset-btn" onClick={() => preset(2)}>Ayer–Hoy</button>
              <button className="preset-btn" onClick={() => preset(7)}>Semana</button>
              <button className="btn btn-sm btn-ghost" style={{ fontSize: ".75rem" }} onClick={limpiar}>✕ Limpiar todo</button>
            </div>

            {/* Vertical separator */}
            <div style={{ width: 1, height: 28, background: "var(--border-2)", flexShrink: 0, margin: "0 4px" }} />

            {/* Estado pills */}
            <div className="row" style={{ flex: 1, gap: 5, flexWrap: "wrap" }}>
              {ESTADOS.map((s) => {
                const meta = ESTADO_META[s];
                const active = estados.includes(s);
                return (
                  <label
                    key={s}
                    title={s}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      padding: "4px 10px",
                      borderRadius: "var(--r-full)",
                      border: `1.5px solid ${active ? "var(--brand-mid)" : "var(--border-2)"}`,
                      background: active ? "var(--brand-l)" : "var(--surface)",
                      color: active ? "var(--brand)" : "var(--muted)",
                      fontSize: ".775rem", fontWeight: 600,
                      cursor: "pointer",
                      transition: "all .15s",
                      userSelect: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <input type="checkbox" style={{ display: "none" }} checked={active} onChange={() => toggleEstado(s)} />
                    <span>{meta.icon}</span>
                    {s}
                  </label>
                );
              })}
            </div>

            {/* Vertical separator */}
            <div style={{ width: 1, height: 28, background: "var(--border-2)", flexShrink: 0, margin: "0 4px" }} />

            {/* Toggle switches */}
            <div className="row" style={{ gap: 14, flexShrink: 0 }}>
              {([
                ["sw-extras",  soloExtras,      setSoloExtras,      "Extras"],
                ["sw-antic",   soloAnticipadas,  setSoloAnticipadas, "Anticipada"],
                ["sw-sin",     soloSinSalida,    setSoloSinSalida,   "Sin salida"],
              ] as const).map(([id, val, setter, label]) => (
                <label key={String(id)} className="switch-wrap" htmlFor={String(id)}>
                  <input id={String(id)} type="checkbox" checked={val} onChange={e => setter(e.target.checked)} />
                  <div className="switch-track" />
                  <span className="switch-label" style={{ fontSize: ".775rem" }}>{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Active filters summary */}
          <ActiveFiltersSummary
            q={q}
            gerencia={gerenciaId !== "Todas" ? (gerencias.find(g => g.id === Number(gerenciaId))?.nombre ?? "Todas") : "Todas"}
            estados={estados}
            soloExtras={soloExtras}
            soloAnticipadas={soloAnticipadas}
            soloSinSalida={soloSinSalida}
            onClear={limpiar}
          />
        </div>

        {/* ── Empty state ── */}
        {grupos.length === 0 && (
          <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 12, opacity: .45 }}></div>
            <h4 style={{ color: "var(--ink-2)", marginBottom: 6 }}>Sin resultados para esos filtros</h4>
            <p className="muted">Amplía el rango de fechas o limpia los filtros de estado.<br />Los empleados inactivos no generan FALTA.</p>
            <button className="btn btn-sm" style={{ marginTop: 14 }} onClick={limpiar}>Limpiar filtros</button>
          </div>
        )}

        {/* ── Employee rows ── */}
        {grupos.map(({ e, filas, tiempos, tardes, faltas, justs, extras }) => {
          const isOpen   = expandida === e.cedula;
          const isFicha  = ficha === e.cedula;

          return (
            <div
              key={e.cedula}
              style={{
                background: "var(--surface)",
                border: `1.5px solid ${isOpen ? "var(--brand-mid)" : "var(--border)"}`,
                borderRadius: "var(--r-lg)",
                marginBottom: 10,
                overflow: "hidden",
                boxShadow: isOpen ? "0 4px 20px rgba(37,99,235,.08)" : "var(--sh-xs)",
                transition: "border-color .15s, box-shadow .15s",
              }}
            >
              {/* Employee header row */}
              <div
                onClick={() => setExpandida(isOpen ? null : e.cedula)}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "14px 18px",
                  cursor: "pointer",
                  background: isOpen ? "var(--brand-l)" : "transparent",
                  transition: "background .15s",
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: 40, height: 40, borderRadius: "var(--r-md)",
                  background: isOpen ? "var(--brand)" : "var(--surface-2)",
                  color: isOpen ? "#fff" : "var(--brand)",
                  border: `2px solid ${isOpen ? "var(--brand)" : "var(--border-2)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 800, fontSize: ".875rem", flexShrink: 0,
                  transition: "all .15s",
                }}>
                  {e.nombre[0]}{e.apellido[0]}
                </div>

                {/* Name + meta */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: ".9375rem", color: "var(--ink)", display: "flex", alignItems: "center", gap: 8 }}>
                    {e.nombre} {e.apellido}
                    {!e.activo && <span className="badge b-inactive" style={{ fontSize: ".65rem" }}>INACTIVO</span>}
                  </div>
                  <div style={{ fontSize: ".775rem", color: "var(--muted)", marginTop: 1 }}>
                    {e.cargo} · {getGerenciaName(e.gerencia)} · <span className="mono">{e.cedula}</span>
                  </div>
                </div>

                {/* Stats mini */}
                <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                  {tiempos > 0 && <span className="badge b-tiempo" style={{ fontSize: ".68rem" }}>{tiempos} </span>}
                  {tardes > 0  && <span className="badge b-tarde"  style={{ fontSize: ".68rem" }}>{tardes} </span>}
                  {faltas > 0  && <span className="badge b-falta"  style={{ fontSize: ".68rem" }}>{faltas} </span>}
                  {justs > 0   && <span className="badge b-just"   style={{ fontSize: ".68rem" }}>{justs} </span>}
                  {extras > 0  && <span className="badge b-comp"   style={{ fontSize: ".68rem" }}>{formatExtras(extras)}</span>}
                </div>

                {/* Ficha button */}
                <button
                  className={"btn btn-sm" + (isFicha ? " btn-primary" : "")}
                  style={{ flexShrink: 0, fontSize: ".78rem" }}
                  onClick={(ev) => { ev.stopPropagation(); setFicha(isFicha ? null : e.cedula); }}
                >
                  {isFicha ? "× Cerrar ficha" : " Ficha"}
                </button>

                {/* Arrow */}
                <span style={{
                  fontSize: ".75rem", color: "var(--muted)", flexShrink: 0,
                  transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                  transition: "transform .2s",
                  display: "inline-block",
                }}>
                  
                </span>
              </div>

              {/* Accordion body */}
              {isOpen && (
                <div style={{ borderTop: "1.5px solid var(--border)" }}>
                  <div className="table-wrap" style={{ border: "none", borderRadius: 0 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Entrada</th>
                          <th>Salida</th>
                          <th>Estado entrada</th>
                          <th>Estado salida</th>
                          <th style={{ textAlign: "right" }}>Extras</th>
                          <th>Autorizador</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filas.map((f, i) => (
                          <tr key={i}>
                            <td className="mono" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{f.fecha}</td>
                            <td className="mono">{f.entrada ?? <span className="muted">—</span>}</td>
                            <td className="mono">{f.salida  ?? <span className="muted">—</span>}</td>
                            <td><BadgeEstadoEntrada estadoEntrada={f.estadoEntrada} estadoOriginal={f.estadoOriginal} /></td>
                            <td>{f.estadoSalida ? <span className={badgeClass(f.estadoSalida)}>{f.estadoSalida}</span> : <span className="muted">—</span>}</td>
                            <td style={{ textAlign: "right" }}>
                              {f.extrasH > 0
                                ? <span style={{ color: "var(--ok)", fontWeight: 700 }}>{formatExtras(f.extrasH)}</span>
                                : <span className="muted">—</span>}
                            </td>
                            <td className="muted" style={{ fontSize: ".8rem" }}>{f.autorizadorId ? `User ${f.autorizadorId}` : "—"}</td>
                            <td>
                              {(f.estadoEntrada === "TARDE" || f.estadoEntrada === "FALTA" || (f.estadoEntrada === "JUSTIFICADO" && f.estadoOriginal)) ? (
                                <div className="row" style={{ gap: 5 }}>
                                  <button
                                    className="btn btn-sm"
                                    style={{ fontSize: ".75rem", background: "var(--warn-l)", color: "var(--warn)", borderColor: "var(--warn-b)" }}
                                    onClick={(ev) => { ev.stopPropagation(); setJust({ cedula: f.empleado.cedula, fecha: f.fecha, estado: f.estadoEntrada, empleadoId: f.empleadoId, justificacionDoc: "", justificacionObs: "" }); }}
                                  >
                                     Justificar
                                  </button>
                                  <button
                                    className="btn btn-sm"
                                    style={{ fontSize: ".75rem" }}
                                    onClick={(ev) => { ev.stopPropagation(); setPase({ cedula: f.empleado.cedula, empleadoId: f.empleadoId, nombre: nombreCompleto(f.empleado), motivo: "", fecha: getHoyVE() }); }}
                                  >
                                     Pase
                                  </button>
                                </div>
                              ) : <span className="muted" style={{ fontSize: ".78rem" }}>—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      {/* Row totals */}
                      <tfoot>
                        <tr style={{ background: "var(--surface-2)", borderTop: "1.5px solid var(--border)" }}>
                          <td colSpan={5} style={{ padding: "8px 14px", fontSize: ".78rem", color: "var(--muted)", fontWeight: 600 }}>
                            {filas.length} registro{filas.length !== 1 ? "s" : ""}
                          </td>
                          <td style={{ textAlign: "right", padding: "8px 14px", fontWeight: 700, color: extras > 0 ? "var(--ok)" : "var(--muted)", fontSize: ".875rem" }}>
                            {extras > 0 ? formatExtras(extras) : "—"}
                          </td>
                          <td colSpan={2} style={{ padding: "8px 14px" }}>
                            <a className="btn btn-sm btn-ghost" style={{ fontSize: ".75rem" }} href={`/admin/empleados/${e.cedula}`}>
                              Ver histórico completo →
                            </a>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Ficha lateral (slide panel) ── */}
      {fichaEmp && (
        <div style={{
          width: 300,
          flexShrink: 0,
          position: "sticky",
          top: 20,
          background: "var(--surface)",
          border: "1.5px solid var(--brand-mid)",
          borderRadius: "var(--r-lg)",
          boxShadow: "0 8px 32px rgba(37,99,235,.12)",
          overflow: "hidden",
          animation: "slideDown .2s ease",
        }}>
          {/* Header */}
          <div style={{ padding: "16px 18px", background: "var(--brand-l)", borderBottom: "1.5px solid var(--brand-mid)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: "var(--r-md)", background: "var(--brand)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: ".9rem", flexShrink: 0 }}>
                {fichaEmp.nombre[0]}{fichaEmp.apellido[0]}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--ink)" }}>{fichaEmp.nombre} {fichaEmp.apellido}</div>
                <div style={{ fontSize: ".72rem", color: "var(--muted)" }}>{fichaEmp.cargo}</div>
              </div>
            </div>
            <button className="modal-close" onClick={() => setFicha(null)} style={{ flexShrink: 0, fontSize: "1.2rem" }}>×</button>
          </div>

          {/* Meta */}
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              <span className="chip"> {getGerenciaName(fichaEmp.gerencia)}</span>
              <span className="chip mono" style={{ fontSize: ".7rem" }}>{fichaEmp.cedula}</span>
              <span className={`badge ${fichaEmp.activo ? "b-tiempo" : "b-inactive"}`} style={{ fontSize: ".65rem" }}>
                {fichaEmp.activo ? "Activo" : "Inactivo"}
              </span>
            </div>
            <p style={{ fontSize: ".78rem", color: "var(--muted)" }}>
              Rango <b style={{ color: "var(--ink-2)" }}>{desde}</b> → <b style={{ color: "var(--ink-2)" }}>{hasta}</b>
            </p>
          </div>

          {/* Mini totals */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, borderBottom: "1px solid var(--border)" }}>
            {[
              { label: "A tiempo", val: fichaFilas.filter(f => f.estadoEntrada === "A_TIEMPO" as EstadoEntrada).length, color: "var(--ok)" },
              { label: "Tardes",   val: fichaFilas.filter(f => f.estadoEntrada === "TARDE" as EstadoEntrada).length,    color: "var(--warn)" },
              { label: "Faltas",   val: fichaFilas.filter(f => f.estadoEntrada === "FALTA" as EstadoEntrada).length,    color: "var(--bad)" },
              { label: "Extras",   val: formatExtras(fichaFilas.reduce((a,f)=>a+(f.extrasH||0),0)) || "00:00", color: "var(--ok)" },
            ].map((s, i) => (
              <div key={i} style={{ padding: "10px 16px", borderRight: i % 2 === 0 ? "1px solid var(--border)" : "none", borderBottom: i < 2 ? "1px solid var(--border)" : "none" }}>
                <div style={{ fontSize: "1.2rem", fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.val}</div>
                <div style={{ fontSize: ".68rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Chrono mini-list */}
          {fichaFilas.length > 0 && (
            <div style={{ padding: "12px 18px", maxHeight: 240, overflowY: "auto" }}>
              <p style={{ fontSize: ".68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", marginBottom: 8 }}>Cronología del rango</p>
{fichaFilas.map((f, i) => {
                const bgColor = f.estadoEntrada === ("A_TIEMPO" as EstadoEntrada) ? "var(--ok)" : f.estadoEntrada === ("TARDE" as EstadoEntrada) ? "var(--warn)" : "var(--bad)";
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 8, marginBottom: 8, borderBottom: i < fichaFilas.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: bgColor }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: ".72rem", fontWeight: 600, color: "var(--ink-2)" }} className="mono">{f.fecha}</div>
                      <div style={{ display: "flex", gap: 4, marginTop: 2, flexWrap: "wrap" }}>
                        <span className={`badge ${badgeClass(f.estadoEntrada)}`} style={{ fontSize: ".62rem", padding: "1px 6px" }}>{f.estadoEntrada}</span>
                        {f.estadoSalida && <span className={`badge ${badgeClass(f.estadoSalida)}`} style={{ fontSize: ".62rem", padding: "1px 6px" }}>{f.estadoSalida}</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: ".72rem", color: "var(--muted)", flexShrink: 0 }} className="mono">
                      {f.entrada ?? "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* CTA */}
          <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
            <a className="btn btn-primary btn-sm" href={`/admin/empleados/${fichaEmp.cedula}`} style={{ justifyContent: "center" }}>
              Histórico completo →
            </a>
            <button className="btn btn-ghost btn-sm" onClick={() => setFicha(null)} style={{ justifyContent: "center" }}>
              Cerrar ficha
            </button>
          </div>
        </div>
      )}

      {/* ── Modal justificar ── */}
      {just && (
        <div className="modal-bg" onClick={() => setJust(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title"> Justificar</div>
                <div className="muted" style={{ fontSize: ".8125rem", marginTop: 3 }}>
                  {just.cedula} · {just.fecha} · <span className={`badge ${badgeClass(just.estado as EstadoEntrada | EstadoSalida)}`} style={{ fontSize: ".68rem" }}>{just.estado}</span>
                </div>
              </div>
              <button className="modal-close" onClick={() => setJust(null)}>×</button>
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Respaldo <span className="muted">(URL o archivo, opcional)</span></label>
              <input
                value={just.justificacionDoc}
                onChange={e => setJust({ ...just, justificacionDoc: e.target.value })}
                placeholder="Ej. reposo.pdf · https://docs.hospital.com/cert/…"
              />
            </div>
            <div className="form-group">
              <label>Motivo / observaciones <span style={{ color: "var(--bad)" }}>*</span></label>
              <textarea
                rows={3}
                value={just.justificacionObs}
                onChange={e => setJust({ ...just, justificacionObs: e.target.value })}
                placeholder="Ej. cita médica con comprobante presentado el día siguiente"
              />
            </div>
            <div className="alert alert-info" style={{ marginTop: 12, fontSize: ".8rem" }}>
              <span></span>
              <span>El estado cambiará a <strong>JUSTIFICADO</strong>. Queda registrado en auditoría con el usuario y la hora.</span>
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

      {/* ── Modal pase previo ── */}
      {pase && (
        <div className="modal-bg" onClick={() => setPase(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title"> Previo aviso</div>
                <div className="muted" style={{ fontSize: ".8125rem", marginTop: 3 }}>{pase.nombre}</div>
              </div>
              <button className="modal-close" onClick={() => setPase(null)}>×</button>
            </div>
            <div className="alert alert-warn" style={{ marginBottom: 16, fontSize: ".8rem" }}>
              <span></span>
              <span>Habilita entrada <strong>fuera del margen de 60 min</strong>. Solo requiere motivo — sin documento.</span>
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Fecha del pase <span style={{ color: "var(--bad)" }}>*</span></label>
              <input
                type="date"
                value={pase.fecha}
                onChange={e => setPase({ ...pase, fecha: e.target.value })}
                min={getHoyVE()}
              />
            </div>
            <div className="form-group">
              <label>Motivo del aviso <span style={{ color: "var(--bad)" }}>*</span></label>
              <input
                value={pase.motivo}
                onChange={e => setPase({ ...pase, motivo: e.target.value })}
                placeholder="Ej. cita médica, llegará 09:30 aproximadamente"
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={handleCrearPase} disabled={creandoPase || !pase.motivo}>
                {creandoPase ? "Creando…" : " Crear pase previo"}
              </button>
              <button className="btn btn-ghost" onClick={() => setPase(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}