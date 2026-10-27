"use client";
import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { Select } from "@/components/ui/Select";
import { RangoFechas, AccionesReporte, EncabezadoImpresion, Paginacion } from "@/components/ui/Reporte";
import { descargarCSV, nombreArchivo } from "@/lib/export";
import { calcularRango } from "@/lib/rangos";
import { getHoyVE } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";

type Log = Awaited<ReturnType<typeof api.auditoria.list>>["filas"][number];

// Mismas acciones que enum AccionAuditoria (prisma/schema.prisma), agrupadas para filtrar
const CATEGORIAS: { id: string; label: string; acciones: string[] }[] = [
  { id: "kiosco", label: "Marcajes del kiosco", acciones: ["FICHAJE_ENTRADA", "FICHAJE_SALIDA", "MATCH_KIOSCO"] },
  { id: "incidentes", label: "Incidentes del kiosco", acciones: ["MATCH_KIOSCO_UNKNOWN", "MATCH_KIOSCO_REPLAY", "MATCH_KIOSCO_BAD_QUALITY", "MATCH_KIOSCO_BAD_CHALLENGE", "MATCH_KIOSCO_PANTALLA"] },
  { id: "asistencia", label: "Justificaciones y pases", acciones: ["JUSTIFICAR", "CREAR_PASE", "CREAR_JUSTIFICACION_ANTICIPADA", "FALTA_PROYECTADA"] },
  { id: "permisos", label: "Vacaciones, reposos y permisos", acciones: ["CREAR_VACACION", "ELIMINAR_VACACION", "ANULAR_VACACION", "CREAR_REPOSO", "ELIMINAR_REPOSO", "ANULAR_REPOSO", "REACTIVAR_REPOSO", "CREAR_PERMISO_ESTUDIO", "ACTUALIZAR_PERMISO_ESTUDIO", "SUSPENDER_PERMISO_ESTUDIO", "ELIMINAR_PERMISO_ESTUDIO"] },
  { id: "config", label: "Horarios y feriados", acciones: ["CREAR_REGLA", "CREAR_FERIADO", "ELIMINAR_FERIADO"] },
  { id: "personal", label: "Empleados", acciones: ["CREAR_EMPLEADO", "DESACTIVAR_EMPLEADO", "REACTIVAR_EMPLEADO", "ELIMINAR_EMPLEADO", "ENROLLAR_EMPLEADO"] },
  { id: "seguridad", label: "Usuarios y accesos", acciones: ["CREAR_USUARIO", "UPDATE_USUARIO", "ELIMINAR_USUARIO", "RESET_PASSWORD", "CAMBIO_CLAVE", "LOGIN", "LOGOUT"] },
];
const TODAS_ACCIONES = CATEGORIAS.flatMap(c => c.acciones);

const ACCION_BADGE: Record<string, string> = {
  FICHAJE_ENTRADA: "b-tiempo", FICHAJE_SALIDA: "b-tiempo", MATCH_KIOSCO: "b-tiempo",
  MATCH_KIOSCO_UNKNOWN: "b-tarde", MATCH_KIOSCO_REPLAY: "b-falta", MATCH_KIOSCO_BAD_QUALITY: "b-tarde", MATCH_KIOSCO_BAD_CHALLENGE: "b-falta", MATCH_KIOSCO_PANTALLA: "b-falta",
  JUSTIFICAR: "b-just", CREAR_JUSTIFICACION_ANTICIPADA: "b-just", FALTA_PROYECTADA: "b-falta", CREAR_PASE: "b-fer",
  CREAR_REGLA: "b-just", CREAR_FERIADO: "b-fer", ELIMINAR_FERIADO: "b-falta",
  CREAR_VACACION: "b-vac", ELIMINAR_VACACION: "b-falta", ANULAR_VACACION: "b-falta",
  CREAR_REPOSO: "b-rep", ELIMINAR_REPOSO: "b-falta", ANULAR_REPOSO: "b-falta", REACTIVAR_REPOSO: "b-rep",
  CREAR_PERMISO_ESTUDIO: "b-temp", ACTUALIZAR_PERMISO_ESTUDIO: "b-temp", SUSPENDER_PERMISO_ESTUDIO: "b-tarde", ELIMINAR_PERMISO_ESTUDIO: "b-falta",
  CREAR_EMPLEADO: "b-comp", DESACTIVAR_EMPLEADO: "b-falta", REACTIVAR_EMPLEADO: "b-comp", ELIMINAR_EMPLEADO: "b-falta", ENROLLAR_EMPLEADO: "b-just",
  CREAR_USUARIO: "b-comp", UPDATE_USUARIO: "b-temp", ELIMINAR_USUARIO: "b-falta", RESET_PASSWORD: "b-temp", CAMBIO_CLAVE: "b-temp", LOGIN: "b-temp", LOGOUT: "b-temp",
};

const etiqueta = (a: string) => a.replace(/_/g, " ").toLowerCase().replace(/^\w/, c => c.toUpperCase());

function formatFecha(ts: string) {
  return new Date(ts).toLocaleString("es-VE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false, timeZone: "America/Caracas",
  });
}

type Filtros = { desde: string; hasta: string; categoria: string; accion: string; usuario: string; q: string };

export default function Auditoria() {
  const { addToast } = useToast();
  const [filtros, setFiltros] = useState<Filtros>({ desde: "", hasta: "", categoria: "", accion: "", usuario: "", q: "" });
  const [qInput, setQInput] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [logs, setLogs] = useState<Log[]>([]);
  const [total, setTotal] = useState(0);
  const [usuarios, setUsuarios] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setFiltros(f => ({ ...f, ...calcularRango("semana", getHoyVE()) }));
  }, []);

  // El texto libre se aplica al dejar de escribir
  useEffect(() => {
    const t = setTimeout(() => setFiltros(f => (f.q === qInput.trim() ? f : { ...f, q: qInput.trim() })), 400);
    return () => clearTimeout(t);
  }, [qInput]);

  useEffect(() => { setPage(1); }, [filtros, pageSize]);

  const params = (f: Filtros) => ({
    desde: f.desde || undefined,
    hasta: f.hasta || undefined,
    accion: f.accion ? [f.accion] : f.categoria ? CATEGORIAS.find(c => c.id === f.categoria)?.acciones : undefined,
    usuario: f.usuario || undefined,
    q: f.q || undefined,
  });

  useEffect(() => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    api.auditoria.list({ ...params(filtros), page, pageSize }, ctrl.signal)
      .then((r) => {
        if (ctrl.signal.aborted) return;
        setLogs(r.filas);
        setTotal(r.total);
        setUsuarios(r.usuarios);
        setError(null);
      })
      .catch((e: any) => { if (e.name !== "AbortError") setError(e.data?.error || e.message || "Error cargando auditoría"); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [filtros, page, pageSize]);

  async function exportar() {
    setExportando(true);
    try {
      const r = await api.auditoria.list({ ...params(filtros), page: 1, pageSize: 5000 });
      descargarCSV(nombreArchivo("auditoria", filtros.desde, filtros.hasta), [
        { titulo: "Fecha y hora (VE)", valor: (l: Log) => formatFecha(l.ts) },
        { titulo: "Usuario", valor: (l: Log) => l.usuario?.username ?? "sistema" },
        { titulo: "Acción", valor: (l: Log) => l.accion },
        { titulo: "Detalle", valor: (l: Log) => l.detalle },
        { titulo: "IP", valor: (l: Log) => l.ip },
      ], r.filas);
      if (r.total > r.filas.length) {
        addToast({ type: "warning", title: "Exportación parcial", message: `Se exportaron ${r.filas.length} de ${r.total} eventos. Acote el período para exportar el resto.` });
      }
    } catch (e: any) {
      addToast({ type: "error", title: "Error", message: e.data?.error || e.message || "No se pudo exportar" });
    } finally {
      setExportando(false);
    }
  }

  const accionesDisponibles = filtros.categoria ? CATEGORIAS.find(c => c.id === filtros.categoria)?.acciones ?? [] : TODAS_ACCIONES;
  const hayFiltros = filtros.categoria || filtros.accion || filtros.usuario || filtros.q;
  const detalleImpresion = [
    filtros.desde || filtros.hasta ? `Período ${filtros.desde || "inicio"} a ${filtros.hasta || "hoy"}` : "Todo el historial",
    filtros.categoria && CATEGORIAS.find(c => c.id === filtros.categoria)?.label,
    filtros.accion && etiqueta(filtros.accion),
    filtros.usuario && `Usuario: ${filtros.usuario}`,
    filtros.q && `Texto: "${filtros.q}"`,
  ].filter(Boolean).join(" · ");

  return (
    <div>
      <EncabezadoImpresion titulo="Registro de auditoría" detalle={detalleImpresion} />

      <div className="page-head">
        <div>
          <h2>Auditoría</h2>
          <p className="page-sub">Registro inmutable de las acciones del sistema · {total.toLocaleString("es-VE")} evento(s) con los filtros actuales</p>
        </div>
        <AccionesReporte onExportar={exportar} exportando={exportando} deshabilitado={total === 0} />
      </div>

      <div className="filter-bar" style={{ marginBottom: 16 }}>
        <div className="filter-row">
          <RangoFechas idPrefix="aud" permitirTodo desde={filtros.desde} hasta={filtros.hasta} onChange={(r) => setFiltros(f => ({ ...f, ...r }))} />
          <div className="form-group" style={{ flex: "1 1 200px" }}>
            <label>Categoría</label>
            <Select value={filtros.categoria} onChange={e => setFiltros(f => ({ ...f, categoria: String(e.target.value), accion: "" }))}>
              <option value="">Todas las categorías</option>
              {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
          </div>
        </div>
        <div className="filter-row">
          <div className="form-group" style={{ flex: "1 1 200px" }}>
            <label>Acción</label>
            <Select value={filtros.accion} onChange={e => setFiltros(f => ({ ...f, accion: String(e.target.value) }))}>
              <option value="">Todas</option>
              {accionesDisponibles.map(a => <option key={a} value={a}>{etiqueta(a)}</option>)}
            </Select>
          </div>
          <div className="form-group" style={{ flex: "1 1 160px" }}>
            <label>Usuario</label>
            <Select value={filtros.usuario} onChange={e => setFiltros(f => ({ ...f, usuario: String(e.target.value) }))}>
              <option value="">Todos</option>
              <option value="sistema">Sistema (automático)</option>
              {usuarios.map(u => <option key={u} value={u}>{u}</option>)}
            </Select>
          </div>
          <div className="form-group" style={{ flex: "2 1 240px" }}>
            <label htmlFor="aud-q">Buscar en el detalle</label>
            <input id="aud-q" value={qInput} onChange={e => setQInput(e.target.value)} placeholder="Cédula, nombre, motivo…" />
          </div>
          {hayFiltros && (
            <div className="form-group">
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setQInput(""); setFiltros(f => ({ ...f, categoria: "", accion: "", usuario: "", q: "" })); }}>
                Limpiar
              </button>
            </div>
          )}
        </div>
      </div>

      {error && <div className="alert alert-warn" style={{ marginBottom: 16 }}><span></span><span>{error}</span></div>}

      <div className="card" style={{ padding: 0, overflow: "hidden", opacity: loading ? 0.6 : 1, transition: "opacity .15s" }}>
        <div className="table-wrap tabla-sticky" style={{ border: "none", maxHeight: "70vh" }}>
          <table className="tabla-reporte">
            <thead>
              <tr>
                <th style={{ width: 170 }}>Fecha / hora</th>
                <th style={{ width: 120 }}>Usuario</th>
                <th style={{ width: 210 }}>Acción</th>
                <th>Detalle</th>
                <th style={{ width: 120 }}>IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state" style={{ padding: "32px 0" }}>
                      <h4>{loading ? "Cargando…" : "Sin eventos con estos filtros"}</h4>
                      {!loading && <p>Amplíe el período o limpie los filtros.</p>}
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.id}>
                    <td className="mono muted" style={{ whiteSpace: "nowrap", fontSize: ".8rem" }}>{formatFecha(l.ts)}</td>
                    <td className="mono" style={{ fontWeight: 600, fontSize: ".8rem" }}>
                      {l.usuario?.username ?? <span className="muted">sistema</span>}
                    </td>
                    <td>
                      <span className={"badge " + (ACCION_BADGE[l.accion] ?? "b-inactive")} style={{ fontSize: ".66rem" }} title={l.accion}>
                        {etiqueta(l.accion)}
                      </span>
                    </td>
                    <td style={{ color: "var(--ink-2)", fontSize: ".8125rem", wordBreak: "break-word" }}>{l.detalle}</td>
                    <td className="mono muted" style={{ fontSize: ".75rem" }}>{l.ip ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Paginacion page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={setPageSize} tamanos={[50, 100, 200, 500]} />
      </div>
    </div>
  );
}
