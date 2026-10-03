"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import { api } from "@/lib/api";
import { Select } from "@/components/ui/Select";

type LogAuditoria = {
  id: number;
  accion: string;
  usuarioId: number | null;
  detalle: string;
  ip: string | null;
  ts: string;
  usuario: { username: string } | null;
};

const ACCIONES = ["Todas", "FICHAJE_ENTRADA", "FICHAJE_SALIDA", "JUSTIFICAR", "CREAR_REGLA", "CREAR_PASE", "CREAR_EMPLEADO", "DESACTIVAR_EMPLEADO", "REACTIVAR_EMPLEADO", "ENROLLAR_EMPLEADO", "CREAR_FERIADO", "ELIMINAR_FERIADO", "CREAR_VACACION", "ELIMINAR_VACACION", "CAMBIO_CLAVE", "LOGIN", "LOGOUT"];

const ACCION_BADGE: Record<string, string> = {
  FICHAJE_ENTRADA: "b-tiempo",
  FICHAJE_SALIDA: "b-tiempo",
  JUSTIFICAR: "b-just",
  CREAR_REGLA: "b-info",
  CREAR_PASE: "b-fer",
  CREAR_EMPLEADO: "b-comp",
  DESACTIVAR_EMPLEADO: "b-falta",
  REACTIVAR_EMPLEADO: "b-comp",
  ENROLLAR_EMPLEADO: "b-info",
  CREAR_FERIADO: "b-fer",
  ELIMINAR_FERIADO: "b-falta",
  CREAR_VACACION: "b-vac",
  ELIMINAR_VACACION: "b-falta",
  CAMBIO_CLAVE: "b-temp",
  LOGIN: "b-temp",
  LOGOUT: "b-temp",
};

function formatFecha(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString("es-VE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false, timeZone: "America/Caracas",
  });
}

export default function Auditoria() {
  const [logs, setLogs] = useState<LogAuditoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroAccion, setFiltroAccion] = useState("Todas");
  const [filtroUsuario, setFiltroUsuario] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  useEffect(() => {
    async function cargar() {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      try {
        const data = await api.auditoria.list();
        if (!abortRef.current.signal.aborted) setLogs(data);
      } catch (e: any) {
        if (e.name !== 'AbortError') setError(e.message || "Error cargando auditoría");
      } finally {
        if (!abortRef.current.signal.aborted) setLoading(false);
      }
    }
    cargar();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, []);

  const logsFiltrados = useMemo(() => {
    return logs.filter(l => {
      if (filtroAccion !== "Todas" && l.accion !== filtroAccion) return false;
      if (filtroUsuario && l.usuario?.username !== filtroUsuario) return false;
      if (desde && new Date(l.ts) < new Date(desde)) return false;
      if (hasta && new Date(l.ts) > new Date(hasta + "T23:59:59")) return false;
      return true;
    });
  }, [logs, filtroAccion, filtroUsuario, desde, hasta]);

  const usuarios = useMemo(() =>
    Array.from(new Set(logs.map(l => l.usuario?.username).filter(Boolean))).sort(),
    [logs]);

  if (loading) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>Cargando…</div>;
  }

  if (error) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 40 }}>
        <div style={{ fontSize: "2rem", marginBottom: 12 }}></div>
        <p style={{ color: "var(--bad)" }}>{error}</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ marginBottom: 4 }}>Auditoría</h2>
        <p className="muted">Registro inmutable de todas las acciones del sistema · Solo Administrador y RRHH</p>
      </div>

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
          <div className="form-group" style={{ flex: "1 1 180px" }}>
            <label>Acción</label>
            <Select value={filtroAccion} onChange={e => setFiltroAccion(e.target.value)}>
              {ACCIONES.map(a => <option key={a}>{a}</option>)}
            </Select>
          </div>
          <div className="form-group" style={{ flex: "1 1 160px" }}>
            <label>Usuario</label>
            <Select value={filtroUsuario} onChange={e => setFiltroUsuario(e.target.value)}>
              <option value="">Todos</option>
              {usuarios.map(u => <option key={u} value={u}>{u}</option>)}
            </Select>
          </div>
        </div>
      </div>

      <div className="alert alert-warn" style={{ marginBottom: 20 }}>
        <span></span>
        <span>Los registros de auditoría son de solo lectura. Cualquier modificación al sistema queda registrada automáticamente.</span>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3>Eventos recientes</h3>
          <span className="chip">{logsFiltrados.length} eventos</span>
        </div>
        <div className="table-wrap" style={{ border: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Fecha / Hora</th>
                <th>Usuario</th>
                <th>Acción</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {logsFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", padding: "32px" }}>
                    <p className="muted">Sin resultados con los filtros actuales</p>
                  </td>
                </tr>
              ) : (
                logsFiltrados.slice(0, 200).map((l, i) => (
                  <tr key={l.id ?? i}>
                    <td className="mono muted" style={{ whiteSpace: "nowrap", fontSize: ".8125rem" }}>{formatFecha(l.ts)}</td>
                    <td className="mono" style={{ fontWeight: 600, fontSize: ".8125rem" }}>
                      {l.usuario?.username === "kiosco"
                        ? <span style={{ color: "var(--muted)" }}>kiosco</span>
                        : l.usuario?.username ?? "sistema"
                      }
                    </td>
                    <td>
                      <span className={"badge " + (ACCION_BADGE[l.accion] ?? "b-inactive")} style={{ fontSize: ".68rem" }}>
                        {l.accion}
                      </span>
                    </td>
                    <td style={{ color: "var(--ink-2)", fontSize: ".8375rem" }}>{l.detalle}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}