"use client";
import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { RangoFechas, AccionesReporte, EncabezadoImpresion, useOrden } from "@/components/ui/Reporte";
import { descargarCSV, nombreArchivo } from "@/lib/export";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const diaSemana = (iso: string) => DIAS[new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCDay()];

type Feriado = {
  id: number;
  fecha: string;
  motivo: string;
  creadoEn: string;
};

type FiltrosFer = { q: string; desde: string; hasta: string };
const FILTROS_FER_INICIALES: FiltrosFer = { q: "", desde: "", hasta: "" };

export default function Feriados() {
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modo, setModo] = useState<"dia" | "rango">("dia");
  const [filtros, setFiltros] = useState<FiltrosFer>(FILTROS_FER_INICIALES);
  const [formData, setFormData] = useState({
    fecha: "",
    fechaIni: "",
    fechaFin: "",
    motivo: "",
  });
  const [creating, setCreating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const primerRef = useRef(true);

  async function cargar(f: FiltrosFer, inicial = false) {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    if (inicial) setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (f.q.trim()) params.q = f.q.trim();
      if (f.desde) params.desde = f.desde;
      if (f.hasta) params.hasta = f.hasta;
      const data = await api.feriados.list(params);
      if (!abortRef.current.signal.aborted) setFeriados(data);
    } catch (e: any) {
      if (e.name !== 'AbortError') setError(e.message || "Error cargando feriados");
    } finally {
      if (!abortRef.current.signal.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    cargar(FILTROS_FER_INICIALES, true);
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
    setCreating(true);
    try {
      if (modo === "dia") {
        if (!formData.fecha || !formData.motivo) {
          setError("Complete fecha y motivo");
          return;
        }
        await api.feriados.create({ fecha: formData.fecha, motivo: formData.motivo });
        setFormData({ ...formData, fecha: "", motivo: "" });
      } else {
        if (!formData.fechaIni || !formData.fechaFin || !formData.motivo) {
          setError("Complete fechas y motivo");
          return;
        }
        // Create multiple feriados for range
        const ini = new Date(formData.fechaIni);
        const fin = new Date(formData.fechaFin);
        const promesas = [];
        for (let d = new Date(ini); d <= fin; d.setDate(d.getDate() + 1)) {
          const fechaStr = d.toISOString().split("T")[0];
          promesas.push(api.feriados.create({ fecha: fechaStr, motivo: formData.motivo }));
        }
        await Promise.all(promesas);
        setFormData({ ...formData, fechaIni: "", fechaFin: "", motivo: "" });
      }
      await cargar(filtros);
    } catch (e: any) {
      setError(e.data?.error || e.message || "Error guardando feriado");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("¿Eliminar este feriado? Se revertirán sus marcas automáticas.")) return;
    try {
      await api.feriados.delete(id);
      await cargar(filtros);
    } catch (e: any) {
      alert(e.data?.error || e.message || "Error eliminando");
    }
  }

  const orden = useOrden(feriados, {
    fecha: f => f.fecha.slice(0, 10),
    motivo: f => f.motivo,
  }, { clave: "fecha", dir: "desc" });
  const laborables = feriados.filter(f => { const d = diaSemana(f.fecha); return d !== "Sábado" && d !== "Domingo"; }).length;

  function exportar() {
    descargarCSV(nombreArchivo("feriados", filtros.desde, filtros.hasta), [
      { titulo: "Fecha", valor: (f: Feriado) => f.fecha.slice(0, 10) },
      { titulo: "Día", valor: (f: Feriado) => diaSemana(f.fecha) },
      { titulo: "Motivo", valor: (f: Feriado) => f.motivo },
    ], orden.ordenadas);
  }

  if (loading) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>Cargando…</div>;
  }

  return (
    <div>
      <EncabezadoImpresion
        titulo="Calendario de feriados"
        detalle={filtros.desde || filtros.hasta ? `Período ${filtros.desde || "inicio"} a ${filtros.hasta || "—"}` : "Todos los feriados"}
      />
      <div className="page-head">
        <div>
          <h2>Feriados</h2>
          <p className="page-sub">Un día o rango con motivo · El rango se expande a filas diarias</p>
        </div>
        <AccionesReporte onExportar={exportar} deshabilitado={feriados.length === 0} />
      </div>

      {/* New feriado form */}
      <div className="card no-print">
        <h3 style={{ marginBottom: 16 }}> Registrar feriado</h3>
        {error && <div className="alert alert-warn" style={{ marginBottom: 16 }}><span></span><span>{error}</span></div>}

        {/* Mode toggle */}
        <div style={{ display: "flex", gap: 8, marginBottom: 18, background: "var(--surface-2)", borderRadius: "var(--r-md)", padding: 4, width: "fit-content" }}>
          <button
            className={"btn btn-sm" + (modo === "dia" ? " btn-primary" : " btn-ghost")}
            style={{ boxShadow: modo === "dia" ? undefined : "none" }}
            onClick={() => setModo("dia")}
          >
             Un día
          </button>
          <button
            className={"btn btn-sm" + (modo === "rango" ? " btn-primary" : " btn-ghost")}
            style={{ boxShadow: modo === "rango" ? undefined : "none" }}
            onClick={() => setModo("rango")}
          >
             Rango de días
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid2" style={{ gap: 16, marginBottom: 16 }}>
            {modo === "dia" ? (
              <div className="form-group">
                <label htmlFor="fer-fecha">Fecha <span style={{ color: "var(--bad)" }}>*</span></label>
                <input
                  id="fer-fecha"
                  type="date"
                  value={formData.fecha}
                  onChange={e => setFormData({ ...formData, fecha: e.target.value })}
                  required
                />
              </div>
            ) : (
              <>
                <div className="form-group">
                  <label htmlFor="fer-ini">Fecha inicio <span style={{ color: "var(--bad)" }}>*</span></label>
                  <input
                    id="fer-ini"
                    type="date"
                    value={formData.fechaIni}
                    onChange={e => setFormData({ ...formData, fechaIni: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="fer-fin">Fecha fin <span style={{ color: "var(--bad)" }}>*</span></label>
                  <input
                    id="fer-fin"
                    type="date"
                    value={formData.fechaFin}
                    onChange={e => setFormData({ ...formData, fechaFin: e.target.value })}
                    required
                  />
                </div>
              </>
            )}
            <div className="form-group" style={modo === "rango" ? { gridColumn: "1 / -1" } : {}}>
              <label htmlFor="fer-motivo">Motivo <span style={{ color: "var(--bad)" }}>*</span></label>
              <input
                id="fer-motivo"
                value={formData.motivo}
                onChange={e => setFormData({ ...formData, motivo: e.target.value })}
                placeholder="Ej. Fiesta nacional, asueto especial…"
                required
              />
            </div>
          </div>

          <div className="alert alert-info" style={{ marginBottom: 16 }}>
            <span></span>
            <span>
              <b>Sin marca de asistencia</b> → el día queda como FERIADO (no cuenta como falta, no justificable).<br />
              <b>Con asistencia</b> → se registran horas extras por jornada completa.
            </span>
          </div>

          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? "Guardando…" : "Guardar feriado"}
            </button>
          </div>
        </form>
      </div>

      {/* Filtros */}
      <div className="card no-print" style={{ marginTop: 20 }}>
        <h3 style={{ marginBottom: 14 }}>Buscar feriados</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="form-group" style={{ flex: "2 1 220px" }}>
            <label htmlFor="fer-f-q">Motivo</label>
            <input
              id="fer-f-q"
              type="text"
              value={filtros.q}
              onChange={e => setFiltros({ ...filtros, q: e.target.value })}
              placeholder="Motivo del feriado…"
            />
          </div>
          <RangoFechas idPrefix="fer-f" permitirTodo presets={["mes", "mes_pasado", "anio"]} desde={filtros.desde} hasta={filtros.hasta} onChange={r => setFiltros({ ...filtros, ...r })} />
          <div className="form-group">
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setFiltros(FILTROS_FER_INICIALES)}>
              Limpiar
            </button>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="card" style={{ marginTop: 20, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3>Feriados registrados</h3>
          <span className="chip">{feriados.length} feriado(s) · {laborables} en día laborable</span>
        </div>
        <div className="table-wrap tabla-sticky" style={{ border: "none", maxHeight: "70vh" }}>
          <table className="tabla-reporte">
            <thead>
              <tr>
                <orden.Th k="fecha">Fecha</orden.Th>
                <th>Día</th>
                <orden.Th k="motivo">Motivo</orden.Th>
                <th className="no-print">Acción</th>
              </tr>
            </thead>
            <tbody>
              {feriados.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", padding: "32px" }}>
                    <p className="muted">No hay feriados con estos filtros</p>
                  </td>
                </tr>
              ) : (
                orden.ordenadas.map((f) => (
                  <tr key={f.id}>
                    <td className="mono" style={{ fontWeight: 600 }}>{f.fecha.slice(0, 10)}</td>
                    <td className="muted" style={{ fontSize: ".8125rem" }}>{diaSemana(f.fecha)}</td>
                    <td>
                      <span className="badge b-fer" style={{ marginRight: 8 }}>FERIADO</span>
                      {f.motivo}
                    </td>
                    <td className="no-print">
                      <button
                        className="btn btn-sm btn-danger"
                        style={{ background: "var(--bad-l)", color: "var(--bad)", border: "1.5px solid var(--bad-b)" }}
                        onClick={() => handleDelete(f.id)}
                      >
                        Eliminar
                      </button>
                    </td>
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