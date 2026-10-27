"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import { api, fetchAsistencias } from "@/lib/api";
import { BadgeEstadoEntrada } from "@/components/ui/BadgeEstadoEntrada";
import { AvisoTruncado } from "@/components/ui/AvisoTruncado";
import { RangoFechas, AccionesReporte, EncabezadoImpresion, KpiStrip, Paginacion, paginar, useOrden } from "@/components/ui/Reporte";
import { CLASES, claseAsistencia, porcentajeAsistencia, resumenAsistencias, type Clase, type ResumenAsistencias } from "@/lib/metricas";
import { descargarCSV, horasHHMM, nombreArchivo, type ColumnaCSV } from "@/lib/export";
import { calcularRango } from "@/lib/rangos";
import {
  type Asistencia,
  type EstadoEntrada,
  type EstadoSalida,
  badgeClass,
  nombreCompleto,
  getHoyVE,
  getGerenciaName,
  formatExtras,
} from "@/lib/types";
import { useToast } from "@/components/ui/Toast";
import { Select } from "@/components/ui/Select";

const COLOR_CLASE: Record<Clase, string> = {
  PUNTUAL: "var(--ok)",
  TARDE: "var(--warn)",
  FALTA: "var(--bad)",
  TARDE_JUSTIFICADA: "var(--info)",
  FALTA_JUSTIFICADA: "var(--info)",
  FERIADO: "var(--purple)",
  VACACIONES: "var(--pink)",
  REPOSO_MEDICO: "#0d9488",
};
const LABEL_CLASE = Object.fromEntries(CLASES.map(c => [c.id, c.label])) as Record<Clase, string>;

type Vista = "resumen" | "empleado" | "detalle";
type Emp = Asistencia["empleado"];
type Grupo = { empleadoId: number; e: Emp; filas: Asistencia[]; r: ResumenAsistencias; pct: number | null };

const pctTxt = (p: number | null) => (p == null ? "—" : `${p}%`);
const colorPct = (p: number | null) => p == null ? "var(--muted)" : p >= 95 ? "var(--ok)" : p >= 85 ? "var(--warn)" : "var(--bad)";
const num = (n: number) => (n > 0 ? n : <span className="muted-2">0</span>);

export default function Consulta() {
  const { addToast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [vista, setVista] = useState<Vista>("resumen");
  const [rango, setRango] = useState({ desde: "", hasta: "" });
  const [q, setQ] = useState("");
  const [gerenciaId, setGerenciaId] = useState<string>("Todas");
  const [clases, setClases] = useState<Clase[]>([]);
  const [soloExtras, setSoloExtras] = useState(false);
  const [soloAnticipadas, setSoloAnticipadas] = useState(false);
  const [soloSinSalida, setSoloSinSalida] = useState(false);
  const [soloActivos, setSoloActivos] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [expandida, setExpandida] = useState<number | null>(null);
  const [ficha, setFicha] = useState<number | null>(null);
  const [just, setJust] = useState<{ cedula: string; fecha: string; estado: string; empleadoId: number; justificacionDoc?: string; justificacionObs: string } | null>(null);
  const [pase, setPase] = useState<{ empleadoId: number; nombre: string; motivo: string; fecha: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [truncado, setTruncado] = useState<{ mostradas: number; total: number } | null>(null);
  const [asistencias, setAsistencias] = useState<Asistencia[]>([]);
  const [gerencias, setGerencias] = useState<{ id: number; nombre: string }[]>([]);
  const [justificando, setJustificando] = useState(false);
  const [creandoPase, setCreandoPase] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setMounted(true);
    setRango(calcularRango("semana", getHoyVE()));
    api.gerencias.list().then(setGerencias).catch(() => {});
  }, []);

  async function cargarDatos() {
    if (!rango.desde || !rango.hasta || rango.desde > rango.hasta) return;
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams({ desde: rango.desde, hasta: rango.hasta });
      if (gerenciaId !== "Todas") sp.set("gerenciaId", gerenciaId);
      const asis = await fetchAsistencias<Asistencia>(sp.toString(), abortRef.current.signal);
      setAsistencias(asis.filas);
      setTruncado(asis.truncado ? { mostradas: asis.filas.length, total: asis.total } : null);
    } catch (e: any) {
      if (e.name !== "AbortError") setError(e.message || "Error cargando datos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargarDatos();
    return () => { if (abortRef.current) abortRef.current.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rango, gerenciaId]);

  // Cualquier cambio de filtro vuelve a la primera página
  useEffect(() => { setPage(1); }, [rango, gerenciaId, q, clases, soloExtras, soloAnticipadas, soloSinSalida, soloActivos, vista]);

  function toggleClase(c: Clase) {
    setClases(s => s.includes(c) ? s.filter(x => x !== c) : [...s, c]);
  }

  function limpiar() {
    setQ(""); setClases([]); setSoloExtras(false); setSoloAnticipadas(false);
    setSoloSinSalida(false); setSoloActivos(false); setGerenciaId("Todas");
  }

  // ── Filtrado (cliente: instantáneo sobre el rango ya cargado) ──
  const filas = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return asistencias.filter((f) => {
      if (ql && !`${f.empleado.nombre} ${f.empleado.apellido} ${f.empleado.cedula} ${f.empleado.cargo}`.toLowerCase().includes(ql)) return false;
      if (soloActivos && f.empleado.activo === false) return false;
      if (clases.length && !clases.includes(claseAsistencia(f))) return false;
      if (soloExtras && !(f.extrasH > 0)) return false;
      if (soloAnticipadas && f.estadoSalida !== "TEMPRANO") return false;
      if (soloSinSalida && !(f.entrada && !f.salida)) return false;
      return true;
    });
  }, [asistencias, q, clases, soloExtras, soloAnticipadas, soloSinSalida, soloActivos]);

  const grupos = useMemo<Grupo[]>(() => {
    const m = new Map<number, Asistencia[]>();
    for (const f of filas) {
      if (!m.has(f.empleadoId)) m.set(f.empleadoId, []);
      m.get(f.empleadoId)!.push(f);
    }
    return Array.from(m.entries()).map(([empleadoId, fs]) => {
      const r = resumenAsistencias(fs);
      return { empleadoId, e: fs[0].empleado, filas: fs, r, pct: porcentajeAsistencia(r) };
    });
  }, [filas]);

  const totales = useMemo(() => resumenAsistencias(filas), [filas]);
  const pctGlobal = porcentajeAsistencia(totales);

  const ordenResumen = useOrden(grupos, {
    nombre: g => `${g.e.apellido} ${g.e.nombre}`,
    gerencia: g => getGerenciaName(g.e.gerencia),
    cargo: g => g.e.cargo,
    dias: g => g.filas.length,
    puntuales: g => g.r.puntuales,
    tardes: g => g.r.tardes,
    tardesJ: g => g.r.tardesJustificadas,
    faltas: g => g.r.faltas,
    faltasJ: g => g.r.faltasJustificadas,
    vacaciones: g => g.r.vacaciones,
    reposos: g => g.r.reposos,
    feriados: g => g.r.feriados,
    salidas: g => g.r.salidasAnticipadas,
    extras: g => g.r.extrasH,
    pct: g => g.pct,
  }, { clave: "nombre", dir: "asc" });

  const ordenDetalle = useOrden(filas, {
    fecha: f => f.fecha,
    nombre: f => `${f.empleado.apellido} ${f.empleado.nombre}`,
    gerencia: f => getGerenciaName(f.empleado.gerencia),
    entrada: f => f.entrada,
    salida: f => f.salida,
    estado: f => LABEL_CLASE[claseAsistencia(f)],
    extras: f => f.extrasH,
    autorizador: f => f.autorizador,
  }, { clave: "fecha", dir: "desc" });

  const fichaGrupo = ficha != null ? grupos.find(g => g.empleadoId === ficha) ?? null : null;

  // ── Descripción de filtros (encabezado de impresión / chips) ──
  const nombreGerencia = gerenciaId !== "Todas" ? gerencias.find(g => g.id === Number(gerenciaId))?.nombre ?? "" : "";
  const filtrosTxt = [
    `Período ${rango.desde} a ${rango.hasta}`,
    nombreGerencia && `Gerencia: ${nombreGerencia}`,
    q && `Búsqueda: "${q}"`,
    clases.length && `Categorías: ${clases.map(c => LABEL_CLASE[c]).join(", ")}`,
    soloExtras && "Solo con horas extra",
    soloAnticipadas && "Solo salidas anticipadas",
    soloSinSalida && "Solo sin salida",
    soloActivos && "Solo empleados activos",
  ].filter(Boolean).join(" · ");
  const hayFiltros = q || gerenciaId !== "Todas" || clases.length > 0 || soloExtras || soloAnticipadas || soloSinSalida || soloActivos;

  // ── Exportar ──
  function exportar() {
    if (vista === "resumen") {
      const cols: ColumnaCSV<Grupo>[] = [
        { titulo: "Cédula", valor: g => g.e.cedula },
        { titulo: "Apellido", valor: g => g.e.apellido },
        { titulo: "Nombre", valor: g => g.e.nombre },
        { titulo: "Gerencia", valor: g => getGerenciaName(g.e.gerencia) },
        { titulo: "Cargo", valor: g => g.e.cargo },
        { titulo: "Días registrados", valor: g => g.filas.length },
        { titulo: "Puntuales", valor: g => g.r.puntuales },
        { titulo: "Tardanzas", valor: g => g.r.tardes },
        { titulo: "Tardanzas justificadas", valor: g => g.r.tardesJustificadas },
        { titulo: "Faltas", valor: g => g.r.faltas },
        { titulo: "Faltas justificadas", valor: g => g.r.faltasJustificadas },
        { titulo: "Vacaciones", valor: g => g.r.vacaciones },
        { titulo: "Reposos", valor: g => g.r.reposos },
        { titulo: "Feriados", valor: g => g.r.feriados },
        { titulo: "Salidas anticipadas", valor: g => g.r.salidasAnticipadas },
        { titulo: "Horas extra (HH:MM)", valor: g => horasHHMM(g.r.extrasH) },
        { titulo: "Horas extra (decimal)", valor: g => g.r.extrasH },
        { titulo: "% asistencia", valor: g => g.pct },
      ];
      descargarCSV(nombreArchivo("consulta_resumen", rango.desde, rango.hasta), cols, ordenResumen.ordenadas);
    } else {
      const cols: ColumnaCSV<Asistencia>[] = [
        { titulo: "Fecha", valor: f => f.fecha },
        { titulo: "Cédula", valor: f => f.empleado.cedula },
        { titulo: "Apellido", valor: f => f.empleado.apellido },
        { titulo: "Nombre", valor: f => f.empleado.nombre },
        { titulo: "Gerencia", valor: f => getGerenciaName(f.empleado.gerencia) },
        { titulo: "Cargo", valor: f => f.empleado.cargo },
        { titulo: "Entrada", valor: f => f.entrada },
        { titulo: "Salida", valor: f => f.salida },
        { titulo: "Categoría", valor: f => LABEL_CLASE[claseAsistencia(f)] },
        { titulo: "Estado entrada", valor: f => f.estadoEntrada },
        { titulo: "Estado original", valor: f => f.estadoOriginal },
        { titulo: "Estado salida", valor: f => f.estadoSalida },
        { titulo: "Horas extra (HH:MM)", valor: f => horasHHMM(f.extrasH) },
        { titulo: "Horas extra (decimal)", valor: f => f.extrasH },
        { titulo: "Autorizado por", valor: f => f.autorizador },
        { titulo: "Observación", valor: f => f.justificacionObs },
        { titulo: "Respaldo", valor: f => f.justificacionDoc },
      ];
      descargarCSV(nombreArchivo("consulta_detalle", rango.desde, rango.hasta), cols, ordenDetalle.ordenadas);
    }
  }

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
      addToast({ type: "success", title: "Justificado", message: "La justificación se guardó correctamente" });
      await cargarDatos();
    } catch (e: any) {
      addToast({ type: "error", title: "Error", message: e.data?.error || e.message || "Error al justificar" });
    } finally {
      setJustificando(false);
    }
  }

  async function handleCrearPase() {
    if (!pase || !pase.motivo) return;
    setCreandoPase(true);
    try {
      await api.pases.create({ empleadoId: pase.empleadoId, fecha: pase.fecha, motivo: pase.motivo });
      setPase(null);
      addToast({ type: "success", title: "Pase creado", message: "El pase previo se creó correctamente" });
      await cargarDatos();
    } catch (e: any) {
      addToast({ type: "error", title: "Error", message: e.data?.error || e.message || "Error al crear pase" });
    } finally {
      setCreandoPase(false);
    }
  }

  const accionesFila = (f: Asistencia) =>
    (f.estadoEntrada === "TARDE" || f.estadoEntrada === "FALTA") ? (
      <div className="row no-print" style={{ gap: 5, flexWrap: "nowrap" }}>
        <button
          className="btn btn-sm btn-warn-outline"
          style={{ fontSize: ".75rem" }}
          onClick={(ev) => { ev.stopPropagation(); setJust({ cedula: f.empleado.cedula, fecha: f.fecha, estado: f.estadoEntrada, empleadoId: f.empleadoId, justificacionDoc: "", justificacionObs: "" }); }}
        >
          Justificar
        </button>
        <button
          className="btn btn-sm"
          style={{ fontSize: ".75rem" }}
          title="Pase previo para un día próximo"
          onClick={(ev) => { ev.stopPropagation(); setPase({ empleadoId: f.empleadoId, nombre: nombreCompleto(f.empleado), motivo: "", fecha: getHoyVE() }); }}
        >
          Pase
        </button>
      </div>
    ) : <span className="muted" style={{ fontSize: ".78rem" }}>—</span>;

  if (!mounted) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>Cargando…</div>;
  }

  const filasDetallePagina = paginar(ordenDetalle.ordenadas, page, pageSize);
  const gruposPagina = paginar(ordenResumen.ordenadas, page, pageSize);
  const { Th: ThR } = ordenResumen;
  const { Th: ThD } = ordenDetalle;

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <EncabezadoImpresion
          titulo={vista === "resumen" ? "Resumen de asistencia por empleado" : vista === "detalle" ? "Detalle de asistencias" : "Asistencias por empleado"}
          detalle={filtrosTxt}
        />

        {/* ── Encabezado ── */}
        <div className="page-head">
          <div>
            <h2>Consulta de asistencias</h2>
            <p className="page-sub">
              {rango.desde && rango.hasta ? `${rango.desde} → ${rango.hasta}` : "Seleccione un período"} · {grupos.length} empleado(s) · {filas.length.toLocaleString("es-VE")} registro(s)
            </p>
          </div>
          <AccionesReporte onExportar={exportar} deshabilitado={loading || filas.length === 0}>
            <div className="seg" role="tablist" aria-label="Tipo de vista">
              {([["resumen", "Resumen"], ["empleado", "Por empleado"], ["detalle", "Detalle"]] as const).map(([v, l]) => (
                <button key={v} type="button" role="tab" aria-selected={vista === v} className={vista === v ? "active" : ""} onClick={() => setVista(v)}>{l}</button>
              ))}
            </div>
          </AccionesReporte>
        </div>

        {truncado && <AvisoTruncado {...truncado} />}

        {/* ── Filtros ── */}
        <div className="filter-bar" style={{ marginBottom: 16 }}>
          <div className="filter-row">
            <RangoFechas idPrefix="cons" desde={rango.desde} hasta={rango.hasta} onChange={setRango} />
            <div className="form-group" style={{ flex: "1 1 150px" }}>
              <label>Gerencia</label>
              <Select value={gerenciaId} onChange={(e) => setGerenciaId(String(e.target.value))}>
                <option value="Todas">Todas las gerencias</option>
                {gerencias.map((g) => <option key={g.id} value={String(g.id)}>{g.nombre}</option>)}
              </Select>
            </div>
            <div className="form-group" style={{ flex: "2 1 200px" }}>
              <label htmlFor="q-buscar">Empleado</label>
              <input id="q-buscar" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, cédula o cargo…" />
            </div>
          </div>

          <div className="filter-row" style={{ alignItems: "center" }}>
            <span style={{ fontSize: ".72rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em" }}>Categoría</span>
            <div className="row" style={{ flex: 1, gap: 5 }}>
              {CLASES.map((c) => {
                const activo = clases.includes(c.id);
                return (
                  <button key={c.id} type="button" className={"preset-btn" + (activo ? " active" : "")} onClick={() => toggleClase(c.id)} aria-pressed={activo}>
                    {c.label}
                  </button>
                );
              })}
            </div>
            <div className="row" style={{ gap: 14 }}>
              {([
                ["sw-extras", soloExtras, setSoloExtras, "Con extras"],
                ["sw-antic", soloAnticipadas, setSoloAnticipadas, "Salida anticipada"],
                ["sw-sin", soloSinSalida, setSoloSinSalida, "Sin salida"],
                ["sw-act", soloActivos, setSoloActivos, "Solo activos"],
              ] as const).map(([id, val, setter, label]) => (
                <label key={id} className="switch-wrap" htmlFor={id} style={{ marginBottom: 0 }}>
                  <input id={id} type="checkbox" checked={val} onChange={e => setter(e.target.checked)} />
                  <div className="switch-track" />
                  <span className="switch-label" style={{ fontSize: ".775rem" }}>{label}</span>
                </label>
              ))}
            </div>
          </div>

          {hayFiltros && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--border)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: ".72rem", color: "var(--muted)", fontWeight: 600 }}>FILTROS ACTIVOS:</span>
              <span style={{ fontSize: ".78rem", color: "var(--ink-2)" }}>{filtrosTxt.split(" · ").slice(1).join(" · ")}</span>
              <button className="btn btn-sm btn-ghost" style={{ fontSize: ".72rem", padding: "2px 8px" }} onClick={limpiar}>Limpiar filtros</button>
            </div>
          )}
        </div>

        {error && (
          <div className="card" style={{ textAlign: "center", padding: 32, marginBottom: 16 }}>
            <p style={{ color: "var(--bad)" }}>{error}</p>
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={cargarDatos}>Reintentar</button>
          </div>
        )}

        {/* ── Totales del período ── */}
        <KpiStrip items={[
          { label: "% asistencia", val: pctTxt(pctGlobal), color: colorPct(pctGlobal), title: "Días asistidos sobre días exigibles (excluye feriados, vacaciones y reposos)" },
          { label: "Puntuales", val: totales.puntuales, color: "var(--ok)" },
          { label: "Tardanzas", val: totales.tardes, color: "var(--warn)" },
          { label: "Tard. justif.", val: totales.tardesJustificadas, color: "var(--info)" },
          { label: "Faltas", val: totales.faltas, color: "var(--bad)" },
          { label: "Faltas justif.", val: totales.faltasJustificadas, color: "var(--info)" },
          { label: "Vacaciones", val: totales.vacaciones, color: "var(--pink)" },
          { label: "Reposos", val: totales.reposos, color: "#0d9488" },
          { label: "Feriados", val: totales.feriados, color: "var(--purple)" },
          { label: "Sal. anticipada", val: totales.salidasAnticipadas, color: "var(--orange)" },
          { label: "Horas extra", val: formatExtras(totales.extrasH) || "00:00", color: "var(--ok)" },
        ]} />

        {loading ? (
          <div className="card" style={{ textAlign: "center", padding: 48, color: "var(--muted)" }}>Cargando datos…</div>
        ) : grupos.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <h4>Sin resultados para esos filtros</h4>
              <p>Amplíe el período o limpie los filtros. Los empleados inactivos no generan FALTA.</p>
              {hayFiltros && <button className="btn btn-sm" style={{ marginTop: 14 }} onClick={limpiar}>Limpiar filtros</button>}
            </div>
          </div>
        ) : vista === "resumen" ? (
          /* ── Vista resumen: una fila por empleado ── */
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="table-wrap tabla-sticky" style={{ border: "none", maxHeight: "70vh" }}>
              <table className="tabla-reporte">
                <thead>
                  <tr>
                    <ThR k="nombre">Empleado</ThR>
                    <ThR k="gerencia">Gerencia</ThR>
                    <ThR k="dias" num title="Días con registro en el período">Días</ThR>
                    <ThR k="puntuales" num>Punt.</ThR>
                    <ThR k="tardes" num>Tard.</ThR>
                    <ThR k="tardesJ" num title="Tardanzas justificadas">T. just.</ThR>
                    <ThR k="faltas" num>Faltas</ThR>
                    <ThR k="faltasJ" num title="Faltas justificadas">F. just.</ThR>
                    <ThR k="vacaciones" num>Vac.</ThR>
                    <ThR k="reposos" num>Rep.</ThR>
                    <ThR k="feriados" num>Fer.</ThR>
                    <ThR k="salidas" num title="Salidas anticipadas">S. ant.</ThR>
                    <ThR k="extras" num>Extras</ThR>
                    <ThR k="pct" num title="Asistidos / exigibles">% Asist.</ThR>
                  </tr>
                </thead>
                <tbody>
                  {gruposPagina.map((g) => (
                    <tr key={g.empleadoId} style={{ cursor: "pointer", background: ficha === g.empleadoId ? "var(--brand-l)" : undefined }} onClick={() => setFicha(ficha === g.empleadoId ? null : g.empleadoId)}>
                      <td>
                        <div style={{ fontWeight: 600, color: "var(--ink)" }}>
                          {g.e.apellido}, {g.e.nombre}
                          {g.e.activo === false && <span className="badge b-inactive" style={{ fontSize: ".6rem", marginLeft: 6 }}>INACTIVO</span>}
                        </div>
                        <div className="muted mono" style={{ fontSize: ".72rem" }}>{g.e.cedula} · {g.e.cargo}</div>
                      </td>
                      <td style={{ fontSize: ".8125rem" }}>{getGerenciaName(g.e.gerencia)}</td>
                      <td className="num">{g.filas.length}</td>
                      <td className="num" style={{ color: "var(--ok)", fontWeight: 600 }}>{num(g.r.puntuales)}</td>
                      <td className="num" style={{ color: g.r.tardes ? "var(--warn)" : undefined, fontWeight: 600 }}>{num(g.r.tardes)}</td>
                      <td className="num">{num(g.r.tardesJustificadas)}</td>
                      <td className="num" style={{ color: g.r.faltas ? "var(--bad)" : undefined, fontWeight: 600 }}>{num(g.r.faltas)}</td>
                      <td className="num">{num(g.r.faltasJustificadas)}</td>
                      <td className="num">{num(g.r.vacaciones)}</td>
                      <td className="num">{num(g.r.reposos)}</td>
                      <td className="num">{num(g.r.feriados)}</td>
                      <td className="num">{num(g.r.salidasAnticipadas)}</td>
                      <td className="num mono" style={{ color: g.r.extrasH > 0 ? "var(--ok)" : "var(--muted-2)", fontWeight: 600 }}>{horasHHMM(g.r.extrasH)}</td>
                      <td className="num" style={{ color: colorPct(g.pct), fontWeight: 700 }}>{pctTxt(g.pct)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>Total · {grupos.length} empleado(s)</td>
                    <td className="num">{filas.length}</td>
                    <td className="num">{totales.puntuales}</td>
                    <td className="num">{totales.tardes}</td>
                    <td className="num">{totales.tardesJustificadas}</td>
                    <td className="num">{totales.faltas}</td>
                    <td className="num">{totales.faltasJustificadas}</td>
                    <td className="num">{totales.vacaciones}</td>
                    <td className="num">{totales.reposos}</td>
                    <td className="num">{totales.feriados}</td>
                    <td className="num">{totales.salidasAnticipadas}</td>
                    <td className="num mono">{horasHHMM(totales.extrasH)}</td>
                    <td className="num">{pctTxt(pctGlobal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <Paginacion page={page} pageSize={pageSize} total={grupos.length} onPage={setPage} onPageSize={setPageSize} />
          </div>
        ) : vista === "detalle" ? (
          /* ── Vista detalle: un registro por fila ── */
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="table-wrap tabla-sticky" style={{ border: "none", maxHeight: "70vh" }}>
              <table className="tabla-reporte">
                <thead>
                  <tr>
                    <ThD k="fecha">Fecha</ThD>
                    <ThD k="nombre">Empleado</ThD>
                    <ThD k="gerencia">Gerencia</ThD>
                    <ThD k="entrada">Entrada</ThD>
                    <ThD k="salida">Salida</ThD>
                    <ThD k="estado">Estado</ThD>
                    <th>Salida</th>
                    <ThD k="extras" num>Extras</ThD>
                    <ThD k="autorizador">Autorizó</ThD>
                    <th>Observación</th>
                    <th className="no-print">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filasDetallePagina.map((f) => (
                    <tr key={f.id}>
                      <td className="mono" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{f.fecha}</td>
                      <td>
                        <a href={`/admin/empleados/${f.empleado.cedula}`} style={{ fontWeight: 600 }}>{f.empleado.apellido}, {f.empleado.nombre}</a>
                        <div className="muted mono" style={{ fontSize: ".72rem" }}>{f.empleado.cedula}</div>
                      </td>
                      <td style={{ fontSize: ".8125rem" }}>{getGerenciaName(f.empleado.gerencia)}</td>
                      <td className="mono">{f.entrada ?? <span className="muted">—</span>}</td>
                      <td className="mono">{f.salida ?? <span className="muted">—</span>}</td>
                      <td><BadgeEstadoEntrada estadoEntrada={f.estadoEntrada} estadoOriginal={f.estadoOriginal} /></td>
                      <td>{f.estadoSalida ? <span className={badgeClass(f.estadoSalida)}>{f.estadoSalida === "TEMPRANO" ? "ANTICIPADA" : f.estadoSalida}</span> : <span className="muted">—</span>}</td>
                      <td className="num mono" style={{ color: f.extrasH > 0 ? "var(--ok)" : "var(--muted-2)", fontWeight: 600 }}>{f.extrasH > 0 ? horasHHMM(f.extrasH) : "—"}</td>
                      <td style={{ fontSize: ".8rem" }}>{f.autorizador ?? <span className="muted">—</span>}</td>
                      <td className="muted" style={{ fontSize: ".78rem", maxWidth: 220 }} title={f.justificacionObs ?? ""}>
                        {f.justificacionObs ? (f.justificacionObs.length > 50 ? `${f.justificacionObs.slice(0, 50)}…` : f.justificacionObs) : "—"}
                      </td>
                      <td className="no-print">{accionesFila(f)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacion page={page} pageSize={pageSize} total={filas.length} onPage={setPage} onPageSize={setPageSize} tamanos={[50, 100, 200, 500]} />
          </div>
        ) : (
          /* ── Vista agrupada por empleado (acordeón) ── */
          <>
            {gruposPagina.map((g) => {
              const isOpen = expandida === g.empleadoId;
              return (
                <div key={g.empleadoId} className="card" style={{ padding: 0, marginBottom: 10, overflow: "hidden", borderColor: isOpen ? "var(--brand-mid)" : undefined }}>
                  <div
                    onClick={() => setExpandida(isOpen ? null : g.empleadoId)}
                    style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 18px", cursor: "pointer", background: isOpen ? "var(--brand-l)" : "transparent" }}
                  >
                    <div style={{ width: 38, height: 38, borderRadius: "var(--r-md)", background: isOpen ? "var(--brand)" : "var(--surface-2)", color: isOpen ? "#fff" : "var(--brand)", border: "1.5px solid var(--border-2)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: ".85rem", flexShrink: 0 }}>
                      {g.e.nombre[0]}{g.e.apellido[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: "var(--ink)" }}>
                        {nombreCompleto(g.e)}
                        {g.e.activo === false && <span className="badge b-inactive" style={{ fontSize: ".62rem", marginLeft: 8 }}>INACTIVO</span>}
                      </div>
                      <div style={{ fontSize: ".775rem", color: "var(--muted)" }}>
                        {g.e.cargo} · {getGerenciaName(g.e.gerencia)} · <span className="mono">{g.e.cedula}</span>
                      </div>
                    </div>
                    <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                      {g.r.puntuales > 0 && <span className="badge b-tiempo" title="Puntuales">{g.r.puntuales} P</span>}
                      {g.r.tardes > 0 && <span className="badge b-tarde" title="Tardanzas">{g.r.tardes} T</span>}
                      {g.r.faltas > 0 && <span className="badge b-falta" title="Faltas">{g.r.faltas} F</span>}
                      {g.r.tardesJustificadas > 0 && <span className="badge b-just" title="Tardanzas justificadas">{g.r.tardesJustificadas} TJ</span>}
                      {g.r.faltasJustificadas > 0 && <span className="badge b-just" title="Faltas justificadas">{g.r.faltasJustificadas} FJ</span>}
                      {g.r.extrasH > 0 && <span className="badge b-comp" title="Horas extra">{horasHHMM(g.r.extrasH)}</span>}
                      <span style={{ fontWeight: 700, color: colorPct(g.pct), fontSize: ".8125rem", minWidth: 40, textAlign: "right" }}>{pctTxt(g.pct)}</span>
                    </div>
                    <button className={"btn btn-sm no-print" + (ficha === g.empleadoId ? " btn-primary" : "")} onClick={(ev) => { ev.stopPropagation(); setFicha(ficha === g.empleadoId ? null : g.empleadoId); }}>
                      Ficha
                    </button>
                  </div>
                  {isOpen && (
                    <div className="table-wrap" style={{ border: "none", borderTop: "1.5px solid var(--border)", borderRadius: 0 }}>
                      <table className="tabla-reporte">
                        <thead>
                          <tr><th>Fecha</th><th>Entrada</th><th>Salida</th><th>Estado entrada</th><th>Estado salida</th><th className="num">Extras</th><th>Autorizó</th><th className="no-print">Acciones</th></tr>
                        </thead>
                        <tbody>
                          {[...g.filas].sort((a, b) => b.fecha.localeCompare(a.fecha)).map((f) => (
                            <tr key={f.id}>
                              <td className="mono" style={{ fontWeight: 600 }}>{f.fecha}</td>
                              <td className="mono">{f.entrada ?? <span className="muted">—</span>}</td>
                              <td className="mono">{f.salida ?? <span className="muted">—</span>}</td>
                              <td><BadgeEstadoEntrada estadoEntrada={f.estadoEntrada} estadoOriginal={f.estadoOriginal} /></td>
                              <td>{f.estadoSalida ? <span className={badgeClass(f.estadoSalida)}>{f.estadoSalida === "TEMPRANO" ? "ANTICIPADA" : f.estadoSalida}</span> : <span className="muted">—</span>}</td>
                              <td className="num mono" style={{ color: f.extrasH > 0 ? "var(--ok)" : "var(--muted-2)", fontWeight: 600 }}>{f.extrasH > 0 ? horasHHMM(f.extrasH) : "—"}</td>
                              <td style={{ fontSize: ".8rem" }}>{f.autorizador ?? <span className="muted">—</span>}</td>
                              <td className="no-print">{accionesFila(f)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan={5}>{g.filas.length} registro(s)</td>
                            <td className="num mono">{horasHHMM(g.r.extrasH)}</td>
                            <td colSpan={2}><a href={`/admin/empleados/${g.e.cedula}`} className="no-print" style={{ fontSize: ".78rem" }}>Ver histórico completo →</a></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
            <div className="card" style={{ padding: 0 }}>
              <Paginacion page={page} pageSize={pageSize} total={grupos.length} onPage={setPage} onPageSize={setPageSize} />
            </div>
          </>
        )}
      </div>

      {/* ── Ficha lateral ── */}
      {fichaGrupo && (
        <aside className="no-print" style={{ width: 300, flexShrink: 0, position: "sticky", top: 20, background: "var(--surface)", border: "1.5px solid var(--brand-mid)", borderRadius: "var(--r-lg)", boxShadow: "var(--sh-lg)", overflow: "hidden" }}>
          <div style={{ padding: "16px 18px", background: "var(--brand-l)", borderBottom: "1.5px solid var(--brand-mid)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: "var(--r-md)", background: "var(--brand)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: ".9rem", flexShrink: 0 }}>
                {fichaGrupo.e.nombre[0]}{fichaGrupo.e.apellido[0]}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--ink)" }}>{nombreCompleto(fichaGrupo.e)}</div>
                <div style={{ fontSize: ".72rem", color: "var(--muted)" }}>{fichaGrupo.e.cargo} · {getGerenciaName(fichaGrupo.e.gerencia)}</div>
              </div>
            </div>
            <button className="modal-close" onClick={() => setFicha(null)} aria-label="Cerrar ficha">×</button>
          </div>
          <div style={{ padding: "10px 18px", borderBottom: "1px solid var(--border)", fontSize: ".78rem", color: "var(--muted)" }}>
            <span className="mono">{fichaGrupo.e.cedula}</span> · {rango.desde} → {rango.hasta} · <b style={{ color: colorPct(fichaGrupo.pct) }}>{pctTxt(fichaGrupo.pct)} asistencia</b>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid var(--border)" }}>
            {[
              { label: "Puntuales", val: fichaGrupo.r.puntuales, color: "var(--ok)" },
              { label: "Tardanzas", val: fichaGrupo.r.tardes, color: "var(--warn)" },
              { label: "Tard. just.", val: fichaGrupo.r.tardesJustificadas, color: "var(--info)" },
              { label: "Faltas", val: fichaGrupo.r.faltas, color: "var(--bad)" },
              { label: "Faltas just.", val: fichaGrupo.r.faltasJustificadas, color: "var(--info)" },
              { label: "Extras", val: horasHHMM(fichaGrupo.r.extrasH), color: "var(--ok)" },
            ].map((s, i, arr) => (
              <div key={s.label} style={{ padding: "10px 16px", borderRight: i % 2 === 0 ? "1px solid var(--border)" : "none", borderBottom: i < arr.length - 2 ? "1px solid var(--border)" : "none" }}>
                <div style={{ fontSize: "1.2rem", fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.val}</div>
                <div style={{ fontSize: ".66rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: "12px 18px", maxHeight: 260, overflowY: "auto" }}>
            <p style={{ fontSize: ".66rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", marginBottom: 8 }}>Cronología</p>
            {[...fichaGrupo.filas].sort((a, b) => b.fecha.localeCompare(a.fecha)).map((f) => (
              <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: COLOR_CLASE[claseAsistencia(f)] }} />
                <span className="mono" style={{ fontSize: ".72rem", fontWeight: 600, color: "var(--ink-2)", width: 78 }}>{f.fecha}</span>
                <span style={{ fontSize: ".72rem", flex: 1 }}>{LABEL_CLASE[claseAsistencia(f)]}</span>
                <span className="mono" style={{ fontSize: ".72rem", color: "var(--muted)" }}>{f.entrada ?? "—"}</span>
              </div>
            ))}
          </div>
          <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)" }}>
            <a className="btn btn-primary btn-sm" href={`/admin/empleados/${fichaGrupo.e.cedula}`} style={{ width: "100%" }}>Histórico completo →</a>
          </div>
        </aside>
      )}

      {/* ── Modal justificar ── */}
      {just && (
        <div className="modal-bg" onClick={() => setJust(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Justificar</div>
                <div className="muted" style={{ fontSize: ".8125rem", marginTop: 3 }}>
                  {just.cedula} · {just.fecha} · <span className={badgeClass(just.estado as EstadoEntrada | EstadoSalida)} style={{ fontSize: ".68rem" }}>{just.estado}</span>
                </div>
              </div>
              <button className="modal-close" onClick={() => setJust(null)}>×</button>
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Respaldo <span className="muted">(URL o archivo, opcional)</span></label>
              <input value={just.justificacionDoc} onChange={e => setJust({ ...just, justificacionDoc: e.target.value })} placeholder="Ej. constancia.pdf · https://…" />
            </div>
            <div className="form-group">
              <label>Motivo / observaciones <span style={{ color: "var(--bad)" }}>*</span></label>
              <textarea rows={3} value={just.justificacionObs} onChange={e => setJust({ ...just, justificacionObs: e.target.value })} placeholder="Ej. cita médica con comprobante presentado el día siguiente" />
            </div>
            <div className="alert alert-info" style={{ marginTop: 12, fontSize: ".8rem" }}>
              <span></span>
              <span>El día pasa a <strong>{just.estado === "TARDE" ? "tardanza justificada" : "falta justificada"}</strong>. Queda registrado en auditoría con el usuario y la hora.</span>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setJust(null)}>Cancelar</button>
              <button className="btn btn-ok" onClick={handleJustificar} disabled={justificando || !just.justificacionObs}>
                {justificando ? "Guardando…" : "Guardar justificación"}
              </button>
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
                <div className="modal-title">Pase previo</div>
                <div className="muted" style={{ fontSize: ".8125rem", marginTop: 3 }}>{pase.nombre}</div>
              </div>
              <button className="modal-close" onClick={() => setPase(null)}>×</button>
            </div>
            <div className="alert alert-info" style={{ marginBottom: 16, fontSize: ".8rem" }}>
              <span></span>
              <span>Si llega tarde ese día, la entrada queda justificada (el retraso igual se descuenta de las horas extra). Si no marca, la falta queda justificada.</span>
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Fecha del pase <span style={{ color: "var(--bad)" }}>*</span></label>
              <input type="date" value={pase.fecha} onChange={e => setPase({ ...pase, fecha: e.target.value })} min={getHoyVE()} />
            </div>
            <div className="form-group">
              <label>Motivo <span style={{ color: "var(--bad)" }}>*</span></label>
              <input value={pase.motivo} onChange={e => setPase({ ...pase, motivo: e.target.value })} placeholder="Ej. cita médica, llegará 09:30 aproximadamente" />
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setPase(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleCrearPase} disabled={creandoPase || !pase.motivo}>
                {creandoPase ? "Creando…" : "Crear pase previo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
