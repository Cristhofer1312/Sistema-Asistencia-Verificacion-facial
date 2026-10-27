"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import { api, fetchAsistencias } from "@/lib/api";
import { BadgeEstadoEntrada } from "@/components/ui/BadgeEstadoEntrada";
import { AvisoTruncado } from "@/components/ui/AvisoTruncado";
import { resumenAsistencias, porcentajeAsistencia, type ResumenAsistencias } from "@/lib/metricas";
import { useSession } from "next-auth/react";
import { calcularRango, PRESETS_RANGO, type PresetRango } from "@/lib/rangos";
import { AccionesReporte, EncabezadoImpresion, useOrden } from "@/components/ui/Reporte";
import { descargarCSV, horasHHMM, nombreArchivo } from "@/lib/export";
import {
  type Asistencia,
  type Empleado,
  type Regla,
  type Gerencia,
  nombreCompleto,
  getHoyVE,
  formatExtras
} from "@/lib/types";

const RANGOS_DASHBOARD: PresetRango[] = ["hoy", "ayer", "semana", "semana_pasada", "mes", "mes_pasado"];
type FilaGerencia = { nombre: string; activos: number; r: ResumenAsistencias; pct: number | null };

const GER_COLOR: Record<string, string> = {
  "RRHH": "#6366f1",
  "Ventas": "#0ea5e9",
  "TI": "#14b8a6",
  "Operaciones": "#f59e0b",
  "Finanzas": "#ec4899",
};
function gerColor(g: string | { nombre: string }) { return GER_COLOR[(typeof g === 'string' ? g : g.nombre)] ?? "#94a3b8"; }

function getGerenciaName(g: string | { nombre: string } | undefined): string {
  return g ? (typeof g === 'string' ? g : g.nombre) : '';
}


// ── Stat KPI card ──────────────────────────────────────────
function KpiCard({
  icon, label, val, color, bg, note,
}: { icon: string; label: string; val: React.ReactNode; color: string; bg: string; note?: string }) {
  return (
    <div style={{
      background: bg,
      border: `1.5px solid ${color}30`,
      borderRadius: "var(--r-lg)",
      padding: "18px 20px",
      display: "flex", flexDirection: "column", gap: 8,
      boxShadow: "var(--sh-xs)",
      transition: "transform .15s, box-shadow .15s",
      cursor: "default",
      position: "relative", overflow: "hidden",
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "var(--sh-md)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "var(--sh-xs)"; }}
    >
      <div style={{ position: "absolute", right: -12, top: -12, width: 72, height: 72, borderRadius: "50%", background: `${color}18` }} />
      <div style={{ fontSize: "1.4rem", lineHeight: 1 }}>{icon}</div>
      <div style={{ fontSize: "1.85rem", fontWeight: 800, color, lineHeight: 1, letterSpacing: "-.03em" }}>{val}</div>
      <div style={{ fontSize: ".72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)" }}>{label}</div>
      {note && <div style={{ fontSize: ".72rem", color: "var(--muted-2)", marginTop: -4 }}>{note}</div>}
    </div>
  );
}

export default function Dashboard() {
  const { data: session } = useSession();
  const userRol = (session?.user as any)?.rol as string | undefined;
  const userGerenciaId = (session?.user as any)?.gerenciaId as number | undefined;
  const isAdminRrhh = ["ADMIN", "RRHH"].includes(userRol ?? "");

  const [rango, setRango] = useState<PresetRango>("hoy");
  const [asistencias, setAsistencias] = useState<Asistencia[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [regla, setRegla] = useState<Regla | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [truncado, setTruncado] = useState<{ mostradas: number; total: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [fechas, setFechas] = useState<{ desde: string; hasta: string } | null>(null);
  const [gerencias, setGerencias] = useState<Gerencia[]>([]);
  const [selectedGerenciaId, setSelectedGerenciaId] = useState<number | null>(userGerenciaId ?? null);
  const [openGerencia, setOpenGerencia] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [cerrando, setCerrando] = useState(false);
  const [cierreMsg, setCierreMsg] = useState<string | null>(null);

  async function handleCerrarDia() {
    if (!confirm("¿Cerrar el día de ayer? Se marcará como faltante a quienes no ficharon (respetando feriados, vacaciones y reposos).")) return;
    setCerrando(true);
    setCierreMsg(null);
    try {
      const r = await api.cierreDia();
      setCierreMsg(`Cierre ${r.fecha}: ${r.faltas} falta(s), ${r.faltasJustificadas ?? 0} falta(s) justificada(s), ${r.feriados} feriado(s), ${r.vacaciones} vacación(es), ${r.reposos} reposo(s), ${r.omitidos} omitido(s).`);
      await cargarDatos();
    } catch (e: any) {
      setCierreMsg(e.data?.error || e.message || "Error en cierre diario");
    } finally {
      setCerrando(false);
    }
  }

  useEffect(() => { setMounted(true); }, []);

  // Cerrar dropdown click afuera
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenGerencia(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Cargar gerencias al montar
  useEffect(() => {
    api.gerencias.list().then(setGerencias).catch(() => {});
  }, []);

  useEffect(() => {
    if (mounted) {
      setFechas(calcularRango(rango, getHoyVE()));
    }
  }, [mounted, rango]);

  // Para GERENTE/COORDINADOR, forzar su gerencia
  useEffect(() => {
    if (!isAdminRrhh && userGerenciaId) {
      setSelectedGerenciaId(userGerenciaId);
    }
  }, [isAdminRrhh, userGerenciaId]);

  async function cargarDatos() {
    if (!fechas) return;
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    
    setLoading(true);
    setError(null);
    try {
      // Para ADMIN/RRHH: gerenciaId = selectedGerenciaId (null = todas)
      // Para GERENTE/COORDINADOR: gerenciaId = userGerenciaId
      const gerenciaId = isAdminRrhh ? selectedGerenciaId : userGerenciaId;
      
      const [empleadosRes, reglasRes] = await Promise.all([
        api.empleados.list(gerenciaId ?? undefined) as Promise<Empleado[]>,
        api.reglas.list() as Promise<Regla[]>,
      ]);
      const asis = await fetchAsistencias<Asistencia>(
        `desde=${fechas.desde}&hasta=${fechas.hasta}${gerenciaId ? `&gerenciaId=${gerenciaId}` : ''}`,
        abortRef.current.signal
      );
      setAsistencias(asis.filas);
      setTruncado(asis.truncado ? { mostradas: asis.filas.length, total: asis.total } : null);
      setEmpleados(empleadosRes.filter(e => e.activo));
      setRegla(reglasRes[0] || null);
    } catch (e: any) {
      if (e.name !== 'AbortError') setError(e.message || "Error cargando datos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargarDatos();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [fechas, selectedGerenciaId]);

  const filasPeriodo = useMemo(() => {
    if (!fechas) return [];
    return asistencias.filter(f => f.fecha >= fechas.desde && f.fecha <= fechas.hasta);
  }, [asistencias, fechas]);

  // Clasificación única (lib/metricas.ts): cada fila en una sola categoría, sin dobles conteos.
  const kpis = useMemo(() => resumenAsistencias(fechas ? filasPeriodo : []), [filasPeriodo, fechas]);



  const ultimos10 = useMemo(() => {
    if (!fechas) return [];
    return [...filasPeriodo]
      .filter(f => f.entrada !== null)
      .sort((a, b) => {
        if (b.fecha !== a.fecha) return b.fecha.localeCompare(a.fecha);
        return (b.entrada ?? "").localeCompare(a.entrada ?? "");
      })
      .slice(0, 10);
  }, [filasPeriodo, fechas]);

  // Resumen por gerencia (misma clasificación única de lib/metricas)
  const porGerencia = useMemo<FilaGerencia[]>(() => {
    const filas = new Map<string, Asistencia[]>();
    for (const f of filasPeriodo) {
      const g = getGerenciaName(f.empleado.gerencia) || "Sin gerencia";
      if (!filas.has(g)) filas.set(g, []);
      filas.get(g)!.push(f);
    }
    const activos = new Map<string, number>();
    for (const e of empleados) {
      const g = getGerenciaName(e.gerencia) || "Sin gerencia";
      activos.set(g, (activos.get(g) ?? 0) + 1);
    }
    return Array.from(new Set([...Array.from(filas.keys()), ...Array.from(activos.keys())])).map((nombre) => {
      const r = resumenAsistencias(filas.get(nombre) ?? []);
      return { nombre, activos: activos.get(nombre) ?? 0, r, pct: porcentajeAsistencia(r) };
    });
  }, [filasPeriodo, empleados]);

  const ordenGer = useOrden(porGerencia, {
    nombre: g => g.nombre,
    activos: g => g.activos,
    puntuales: g => g.r.puntuales,
    tardes: g => g.r.tardes,
    tardesJ: g => g.r.tardesJustificadas,
    faltas: g => g.r.faltas,
    faltasJ: g => g.r.faltasJustificadas,
    ausencias: g => g.r.vacaciones + g.r.reposos,
    extras: g => g.r.extrasH,
    pct: g => g.pct,
  }, { clave: "nombre", dir: "asc" });
  const pctGlobal = porcentajeAsistencia(kpis);

  function exportarGerencias() {
    if (!fechas) return;
    descargarCSV(nombreArchivo("resumen_por_gerencia", fechas.desde, fechas.hasta), [
      { titulo: "Gerencia", valor: (g: FilaGerencia) => g.nombre },
      { titulo: "Empleados activos", valor: (g: FilaGerencia) => g.activos },
      { titulo: "Puntuales", valor: (g: FilaGerencia) => g.r.puntuales },
      { titulo: "Tardanzas", valor: (g: FilaGerencia) => g.r.tardes },
      { titulo: "Tardanzas justificadas", valor: (g: FilaGerencia) => g.r.tardesJustificadas },
      { titulo: "Faltas", valor: (g: FilaGerencia) => g.r.faltas },
      { titulo: "Faltas justificadas", valor: (g: FilaGerencia) => g.r.faltasJustificadas },
      { titulo: "Vacaciones", valor: (g: FilaGerencia) => g.r.vacaciones },
      { titulo: "Reposos", valor: (g: FilaGerencia) => g.r.reposos },
      { titulo: "Feriados", valor: (g: FilaGerencia) => g.r.feriados },
      { titulo: "Salidas anticipadas", valor: (g: FilaGerencia) => g.r.salidasAnticipadas },
      { titulo: "Horas extra (HH:MM)", valor: (g: FilaGerencia) => horasHHMM(g.r.extrasH) },
      { titulo: "% asistencia", valor: (g: FilaGerencia) => g.pct },
    ], ordenGer.ordenadas);
  }

  const etiquetaRango = PRESETS_RANGO.find(p => p.id === rango)?.label ?? "";
  const rangoLabel = fechas ? `${etiquetaRango} · ${fechas.desde === fechas.hasta ? fechas.desde : `${fechas.desde} → ${fechas.hasta}`}` : "Cargando…";

  if (!mounted) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>
        <div style={{ fontSize: "1.2rem", color: "var(--muted)" }}>Cargando dashboard…</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>
        <div style={{ fontSize: "1.2rem", color: "var(--muted)" }}>Cargando datos…</div>
      </div>
    );
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
      <EncabezadoImpresion
        titulo="Dashboard de asistencia"
        detalle={`${rangoLabel}${selectedGerenciaId ? ` · Gerencia: ${gerencias.find(g => g.id === selectedGerenciaId)?.nombre ?? ""}` : ""}`}
      />
      {truncado && <AvisoTruncado {...truncado} />}
      {/* ── Header ── */}
      <div className="row-between" style={{ marginBottom: 24 }}>
        <div>
          <h2 style={{ marginBottom: 3 }}>Dashboard</h2>
          <p className="muted" style={{ fontSize: ".8125rem" }}>{rangoLabel}</p>
        </div>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          {isAdminRrhh && gerencias.length > 0 && (
            <div style={{ position: "relative" }} ref={dropdownRef}>
              <div 
                onClick={() => setOpenGerencia(!openGerencia)}
                style={{
                  padding: "8px 36px 8px 12px",
                  borderRadius: "var(--r-md)",
                  border: openGerencia ? "1.5px solid var(--brand)" : "1.5px solid var(--border-2)",
                  background: "var(--surface)",
                  color: "var(--ink)",
                  fontSize: ".8125rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  minWidth: 180,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}
              >
                {selectedGerenciaId ? gerencias.find(g => g.id === selectedGerenciaId)?.nombre : "Todas las gerencias"}
                <span style={{ fontSize: ".7rem", color: "var(--muted)", position: "absolute", right: 12 }}>
                  ▼
                </span>
              </div>

              {openGerencia && (
                <div style={{
                  position: "absolute",
                  top: "100%", left: 0, right: 0,
                  marginTop: 6,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-md)",
                  boxShadow: "var(--sh-lg)",
                  zIndex: 50,
                  overflow: "hidden",
                  display: "flex", flexDirection: "column"
                }}>
                  <div 
                    onClick={() => { setSelectedGerenciaId(null); setOpenGerencia(false); }}
                    style={{
                      padding: "10px 14px",
                      fontSize: ".8125rem",
                      fontWeight: 500,
                      cursor: "pointer",
                      background: selectedGerenciaId === null ? "var(--brand-l)" : "transparent",
                      color: selectedGerenciaId === null ? "var(--brand)" : "var(--ink-2)",
                      transition: "background .15s"
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = selectedGerenciaId === null ? "var(--brand-l)" : "var(--surface-2)"}
                    onMouseLeave={e => e.currentTarget.style.background = selectedGerenciaId === null ? "var(--brand-l)" : "transparent"}
                  >
                    Todas las gerencias
                  </div>
                  {gerencias.map(g => (
                    <div 
                      key={g.id}
                      onClick={() => { setSelectedGerenciaId(g.id); setOpenGerencia(false); }}
                      style={{
                        padding: "10px 14px",
                        fontSize: ".8125rem",
                        fontWeight: 500,
                        cursor: "pointer",
                        background: selectedGerenciaId === g.id ? "var(--brand-l)" : "transparent",
                        color: selectedGerenciaId === g.id ? "var(--brand)" : "var(--ink-2)",
                        transition: "background .15s"
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = selectedGerenciaId === g.id ? "var(--brand-l)" : "var(--surface-2)"}
                      onMouseLeave={e => e.currentTarget.style.background = selectedGerenciaId === g.id ? "var(--brand-l)" : "transparent"}
                    >
                      {g.nombre}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="seg no-print" role="tablist" aria-label="Período">
            {RANGOS_DASHBOARD.map(r => (
              <button key={r} type="button" role="tab" aria-selected={rango === r} className={rango === r ? "active" : ""} onClick={() => setRango(r)}>
                {PRESETS_RANGO.find(p => p.id === r)?.label}
              </button>
            ))}
          </div>
          <a href="/admin/consulta" className="btn btn-sm" style={{ gap: 6 }}> Consulta</a>
          {isAdminRrhh && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={handleCerrarDia}
              disabled={cerrando}
              title="Debug: marca como faltantes a quienes no ficharon ayer"
            >
              {cerrando ? "Cerrando…" : "Cerrar día"}
            </button>
          )}
          <a href="/kiosco" className="btn btn-primary btn-sm"> Kiosco</a>
        </div>
      </div>
      {cierreMsg && (
        <div className="card" style={{ marginBottom: 16, padding: "12px 16px" }}>
          <span style={{ fontSize: ".8125rem" }}>{cierreMsg}</span>
        </div>
      )}

      {/* ── KPI grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 14, marginBottom: 24 }}>
        <KpiCard icon="" label="Presentes" val={rango === "hoy" ? <>{kpis.presentes} <span style={{ color: "var(--muted-2)", fontSize: "1.3rem", fontWeight: 600 }}>/ {empleados.length}</span></> : kpis.presentes} color="#059669" bg="#ecfdf5" note={rango === "hoy" ? "asistencias hoy" : "entradas registradas"} />
        <KpiCard icon="" label="Puntuales" val={kpis.puntuales} color="#16a34a" bg="#f0fdf4" note="a tiempo o antes" />
        <KpiCard icon="" label="Tardanzas" val={kpis.tardes} color="#d97706" bg="#fffbeb" note="sin justificar" />
        <KpiCard icon="" label="Tard. justificadas" val={kpis.tardesJustificadas} color="#2563eb" bg="#eff6ff" />
        <KpiCard icon="" label="Faltas" val={kpis.faltas} color="#dc2626" bg="#fef2f2" note="sin justificar" />
        <KpiCard icon="" label="Faltas justificadas" val={kpis.faltasJustificadas} color="#2563eb" bg="#eff6ff" />
        <KpiCard icon="" label="Feriados" val={kpis.feriados} color="#7c3aed" bg="#f5f3ff" />
        <KpiCard icon="" label="Vacaciones" val={kpis.vacaciones} color="#be185d" bg="#fdf2f8" />
        <KpiCard icon="" label="Reposos Méd." val={kpis.reposos} color="#0d9488" bg="#f0fdfa" />
        <KpiCard icon="" label="Sal. anticipada" val={kpis.salidasAnticipadas} color="#c2410c" bg="#fff7ed" note="solo se marca" />
        <KpiCard icon="" label="Horas extra" val={formatExtras(kpis.extrasH) || "00:00"} color="#0891b2" bg="#ecfeff" note="total período" />
      </div>

      {/* ── Resumen por gerencia ── */}
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 24 }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h3 style={{ margin: 0 }}>Resumen por gerencia</h3>
            <span className="muted" style={{ fontSize: ".78rem" }}>% de asistencia global: <b>{pctGlobal == null ? "—" : `${pctGlobal}%`}</b></span>
          </div>
          <AccionesReporte onExportar={exportarGerencias} deshabilitado={porGerencia.length === 0}>
            <a href="/admin/consulta" className="btn btn-sm btn-ghost">Consulta detallada →</a>
          </AccionesReporte>
        </div>
        <div className="table-wrap" style={{ border: "none" }}>
          <table className="tabla-reporte">
            <thead>
              <tr>
                <ordenGer.Th k="nombre">Gerencia</ordenGer.Th>
                <ordenGer.Th k="activos" num>Activos</ordenGer.Th>
                <ordenGer.Th k="puntuales" num>Puntuales</ordenGer.Th>
                <ordenGer.Th k="tardes" num>Tardanzas</ordenGer.Th>
                <ordenGer.Th k="tardesJ" num>T. just.</ordenGer.Th>
                <ordenGer.Th k="faltas" num>Faltas</ordenGer.Th>
                <ordenGer.Th k="faltasJ" num>F. just.</ordenGer.Th>
                <ordenGer.Th k="ausencias" num title="Vacaciones + reposos">Vac./Rep.</ordenGer.Th>
                <ordenGer.Th k="extras" num>Extras</ordenGer.Th>
                <ordenGer.Th k="pct" num>% Asist.</ordenGer.Th>
              </tr>
            </thead>
            <tbody>
              {ordenGer.ordenadas.length === 0 ? (
                <tr><td colSpan={10} className="muted" style={{ textAlign: "center", padding: 24 }}>Sin datos en el período</td></tr>
              ) : ordenGer.ordenadas.map(g => (
                <tr key={g.nombre}>
                  <td style={{ fontWeight: 600, color: "var(--ink)" }}>
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: gerColor(g.nombre), marginRight: 8 }} />
                    {g.nombre}
                  </td>
                  <td className="num">{g.activos}</td>
                  <td className="num" style={{ color: "var(--ok)", fontWeight: 600 }}>{g.r.puntuales}</td>
                  <td className="num" style={{ color: g.r.tardes ? "var(--warn)" : undefined, fontWeight: 600 }}>{g.r.tardes}</td>
                  <td className="num">{g.r.tardesJustificadas}</td>
                  <td className="num" style={{ color: g.r.faltas ? "var(--bad)" : undefined, fontWeight: 600 }}>{g.r.faltas}</td>
                  <td className="num">{g.r.faltasJustificadas}</td>
                  <td className="num">{g.r.vacaciones + g.r.reposos}</td>
                  <td className="num mono">{horasHHMM(g.r.extrasH)}</td>
                  <td className="num" style={{ fontWeight: 700, color: g.pct == null ? "var(--muted)" : g.pct >= 95 ? "var(--ok)" : g.pct >= 85 ? "var(--warn)" : "var(--bad)" }}>
                    {g.pct == null ? "—" : `${g.pct}%`}
                  </td>
                </tr>
              ))}
            </tbody>
            {porGerencia.length > 1 && (
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num">{empleados.length}</td>
                  <td className="num">{kpis.puntuales}</td>
                  <td className="num">{kpis.tardes}</td>
                  <td className="num">{kpis.tardesJustificadas}</td>
                  <td className="num">{kpis.faltas}</td>
                  <td className="num">{kpis.faltasJustificadas}</td>
                  <td className="num">{kpis.vacaciones + kpis.reposos}</td>
                  <td className="num mono">{horasHHMM(kpis.extrasH)}</td>
                  <td className="num">{pctGlobal == null ? "—" : `${pctGlobal}%`}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ── Últimos fichajes ── */}
      <div>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3>Últimos fichajes</h3>
            <a href="/admin/asistencias" className="btn btn-ghost btn-sm" style={{ fontSize: ".78rem" }}>
              Ver todos →
            </a>
          </div>

          {ultimos10.length === 0 ? (
            <div className="empty-state" style={{ padding: "36px 0" }}>
              <div className="empty-icon" style={{ fontSize: "2rem" }}></div>
              <h4>Sin fichajes en el período</h4>
              <p>Seleccione un rango con actividad.</p>
            </div>
          ) : (
            <div className="table-wrap" style={{ border: "none", overflowY: "auto", maxHeight: 420 }}>
              <table>
                <thead style={{ position: "sticky", top: 0, zIndex: 1, background: "var(--surface-2)" }}>
                  <tr>
                    <th>Empleado</th>
                    <th>Fecha / Hora</th>
                    <th>Estado</th>
                    <th style={{ textAlign: "right" }}>Extras</th>
                  </tr>
                </thead>
                <tbody>
                  {ultimos10.map((f, i) => {
                    const gerName = getGerenciaName(f.empleado.gerencia);
                    return (
                    <tr key={i}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                          <div style={{
                            width: 30, height: 30, borderRadius: "var(--r-sm)",
                            background: gerColor(gerName) + "22",
                            color: gerColor(gerName),
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontWeight: 800, fontSize: ".72rem", flexShrink: 0,
                          }}>
                            {f.empleado.nombre[0]}{f.empleado.apellido[0]}
                          </div>
                          <div>
                            <a href={`/admin/empleados/${f.empleado.cedula}`} style={{ fontWeight: 600, color: "var(--brand)", fontSize: ".875rem", display: "block", lineHeight: 1.2 }}>
                              {nombreCompleto(f.empleado)}
                            </a>
                            <span style={{ fontSize: ".68rem", color: "var(--muted)" }}>{getGerenciaName(f.empleado.gerencia)}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="mono" style={{ fontWeight: 600, fontSize: ".8125rem", color: "var(--ink-2)" }}>{f.entrada}</div>
                        <div style={{ fontSize: ".68rem", color: "var(--muted)" }}>{f.fecha}</div>
                      </td>
                      <td>
                        <BadgeEstadoEntrada estadoEntrada={f.estadoEntrada} estadoOriginal={f.estadoOriginal} />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {f.extrasH > 0
                          ? <span style={{ color: "var(--ok)", fontWeight: 700, fontSize: ".8125rem" }}>{formatExtras(f.extrasH)}</span>
                          : <span style={{ color: "var(--muted-2)", fontSize: ".8125rem" }}>—</span>
                        }
                      </td>
                    </tr>
                    );})}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Regla vigente footer ── */}
      {regla && (
        <div style={{
          marginTop: 20,
          background: "var(--surface)",
          border: "1.5px solid var(--border)",
          borderRadius: "var(--r-lg)",
          padding: "14px 20px",
          display: "flex", flexWrap: "wrap", gap: "6px 28px", alignItems: "center",
        }}>
          <span style={{ fontSize: ".72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)", marginRight: 4 }}>
             Regla vigente
          </span>
          {[
            ["Hora de entrada", regla.horaEntrada],
            ["Hora límite", regla.horaLimite],
            ["Salida ref.", regla.horaReferencia],
            ["Cooldown kiosco", `${regla.cooldownMin} min/emp.`],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
              <span style={{ fontSize: ".78rem", color: "var(--muted)" }}>{k}</span>
              <span style={{ fontSize: ".875rem", fontWeight: 700, color: "var(--ink-2)" }}>{v}</span>
            </div>
          ))}
          <a href="/admin/reglas" className="btn btn-ghost btn-sm" style={{ marginLeft: "auto", fontSize: ".78rem" }}>
            Editar horario →
          </a>
        </div>
      )}
    </div>
  );
}