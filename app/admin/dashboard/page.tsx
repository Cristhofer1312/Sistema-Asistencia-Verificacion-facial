"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import { api } from "@/lib/api";
import { BadgeEstadoEntrada } from "@/components/ui/BadgeEstadoEntrada";
import { useSession } from "next-auth/react";
import { 
  type Asistencia, 
  type Empleado, 
  type Regla,
  type Rango,
  type Gerencia,
  nombreCompleto, 
  getFechasRango, 
  getRangoLabel, 
  getChipLabel,
  formatExtras
} from "@/lib/types";

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

  const [rango, setRango] = useState<Rango>("hoy");
  const [asistencias, setAsistencias] = useState<Asistencia[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [regla, setRegla] = useState<Regla | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [fechas, setFechas] = useState<{ desde: string; hasta: string } | null>(null);
  const [gerencias, setGerencias] = useState<Gerencia[]>([]);
  const [selectedGerenciaId, setSelectedGerenciaId] = useState<number | null>(userGerenciaId ?? null);
  const [openGerencia, setOpenGerencia] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

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
      setFechas(getFechasRango(rango));
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
      const res = await fetch(`/api/asistencias?desde=${fechas.desde}&hasta=${fechas.hasta}${gerenciaId ? `&gerenciaId=${gerenciaId}` : ''}`, { 
        signal: abortRef.current.signal 
      });
      const asistenciasData = await res.json();
      setAsistencias(asistenciasData);
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

  const kpis = useMemo(() => {
    if (!fechas) return { presentes: 0, tardes: 0, faltas: 0, feriados: 0, vacaciones: 0, reposos: 0, anticipadas: 0, justif: 0, extras: 0 };
    const presentes = filasPeriodo.filter(f => f.entrada !== null).length;
    const tardes = filasPeriodo.filter(f => f.estadoEntrada === "TARDE" || (f.estadoEntrada === "JUSTIFICADO" && f.estadoOriginal === "TARDE")).length;
    const faltas = filasPeriodo.filter(f => f.estadoEntrada === "FALTA" || (f.estadoEntrada === "JUSTIFICADO" && f.estadoOriginal === "FALTA")).length;
    const feriados = filasPeriodo.filter(f => f.estadoEntrada === "FERIADO").length;
    const vacaciones = filasPeriodo.filter(f => f.estadoEntrada === "VACACIONES").length;
    const reposos = filasPeriodo.filter(f => f.estadoEntrada === "REPOSO_MEDICO").length;
    const anticipadas = filasPeriodo.filter(f => f.estadoSalida === "TEMPRANO").length;
    const justif = filasPeriodo.filter(f => f.estadoEntrada === "JUSTIFICADO").length;
    const extras = filasPeriodo.reduce((a, f) => a + (f.extrasH || 0), 0);
    return { presentes, tardes, faltas, feriados, vacaciones, reposos, anticipadas, justif, extras };
  }, [filasPeriodo, fechas]);



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

  const rangoLabel = fechas ? getRangoLabel(rango, fechas) : "Cargando…";
  const chipLabel = fechas ? getChipLabel(rango) : "cargando";

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
          <div style={{ display: "flex", background: "var(--surface-2)", border: "1.5px solid var(--border-2)", borderRadius: "var(--r-md)", padding: 3, gap: 2 }}>
            {(["hoy", "ayer", "semana"] as Rango[]).map(r => (
              <button
                key={r}
                onClick={() => setRango(r)}
                style={{
                  padding: "6px 14px", borderRadius: "var(--r-sm)",
                  border: "none",
                  background: rango === r ? "var(--surface)" : "transparent",
                  color: rango === r ? "var(--brand)" : "var(--muted)",
                  fontWeight: rango === r ? 700 : 500,
                  fontSize: ".8125rem",
                  cursor: "pointer",
                  boxShadow: rango === r ? "var(--sh-xs)" : "none",
                  transition: "all .15s",
                }}
              >
                {r === "hoy" ? "Hoy" : r === "ayer" ? "Ayer–Hoy" : "Semana"}
              </button>
            ))}
          </div>
          <a href="/admin/consulta" className="btn btn-sm" style={{ gap: 6 }}> Consulta</a>
          <a href="/kiosco" className="btn btn-primary btn-sm"> Kiosco</a>
        </div>
      </div>

      {/* ── KPI grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
        <KpiCard icon="" label="Presentes" val={rango === "hoy" ? <>{kpis.presentes} <span style={{ color: "var(--muted-2)", fontSize: "1.3rem", fontWeight: 600 }}>/ {empleados.length}</span></> : kpis.presentes} color="#059669" bg="#ecfdf5" note={rango === "hoy" ? "asistencias hoy" : "entradas registradas"} />
        <KpiCard icon="" label="Tardanzas" val={kpis.tardes} color="#d97706" bg="#fffbeb" />
        <KpiCard icon="" label="Faltas" val={kpis.faltas} color="#dc2626" bg="#fef2f2" />
        <KpiCard icon="" label="Justificadas" val={kpis.justif} color="#2563eb" bg="#eff6ff" note="TARDE o FALTA justif." />
        <KpiCard icon="" label="Feriados" val={kpis.feriados} color="#7c3aed" bg="#f5f3ff" />
        <KpiCard icon="" label="Vacaciones" val={kpis.vacaciones} color="#be185d" bg="#fdf2f8" />
        <KpiCard icon="" label="Reposos Méd." val={kpis.reposos} color="#0d9488" bg="#f0fdfa" />
        <KpiCard icon="" label="Sal. anticipada" val={kpis.anticipadas} color="#c2410c" bg="#fff7ed" note="salida TEMPRANO" />
        <KpiCard icon="" label="Horas extra" val={formatExtras(kpis.extras) || "00:00"} color="#0891b2" bg="#ecfeff" note="total período" />
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
            ["Entrada límite", regla.horaLimite],
            ["Salida ref.", regla.horaReferencia],
            ["Margen tardanza", `${regla.margenMin} min`],
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