"use client";
import { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { type Empleado, nombreCompleto, getGerenciaName, type Gerencia } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";
import { Select } from "@/components/ui/Select";

export default function Empleados() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [gerenciaFilter, setGerenciaFilter] = useState<string>("Todas");
  const [gerencias, setGerencias] = useState<Gerencia[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const { addToast } = useToast();

  useEffect(() => {
    async function cargar() {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      try {
        const [data, gers] = await Promise.all([
          api.empleados.list(),
          fetch('/api/gerencias').then(r => r.json()).catch(() => []),
        ]);
        if (!abortRef.current.signal.aborted) {
          setEmpleados(data);
          setGerencias(gers);
        }
      } catch (e: any) {
        if (e.name !== 'AbortError') setError(e.message || "Error cargando empleados");
      } finally {
        if (!abortRef.current.signal.aborted) setLoading(false);
      }
    }
    cargar();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, []);

  const filteredEmpleados = useMemo(() => {
    return empleados.filter((e) => {
      if (gerenciaFilter !== "Todas" && e.gerenciaId !== Number(gerenciaFilter)) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const nombreCompletoLower = `${e.nombre} ${e.apellido}`.toLowerCase();
        if (!nombreCompletoLower.includes(q) && !e.cedula.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [empleados, search, gerenciaFilter]);

  async function toggleActivo(emp: Empleado) {
    try {
      await api.empleados.update(emp.id, { activo: !emp.activo });
      setEmpleados(prev => prev.map(e => e.id === emp.id ? { ...e, activo: !e.activo } : e));
      addToast({ type: 'success', title: 'Actualizado', message: `${nombreCompleto(emp)} ${emp.activo ? 'dado de baja' : 'reactivado'}` });
    } catch (e: any) {
      addToast({ type: 'error', title: 'Error', message: e.data?.error || e.message || "Error actualizando empleado" });
    }
  }

  async function handleDelete(emp: Empleado) {
    if (!confirm(`¿ELIMINAR a ${nombreCompleto(emp)} (${emp.cedula})?\n\nBorrado FÍSICO: elimina el empleado y todo su historial (asistencias, vacaciones, reposos, pases, permisos). Libera la cédula para registrar de nuevo.`)) return;
    try {
      await api.empleados.delete(emp.id);
      setEmpleados(prev => prev.filter(e => e.id !== emp.id));
      addToast({ type: 'success', title: 'Eliminado', message: 'Empleado eliminado con todo su historial' });
    } catch (e: any) {
      addToast({ type: 'error', title: 'Error', message: e.data?.error || e.message || "Error eliminando empleado" });
    }
  }

  if (loading) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>Cargando empleados…</div>;
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
      <div className="row-between" style={{ marginBottom: 20 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Empleados</h2>
          <p className="muted">Nombre clicable abre el histórico individual</p>
        </div>
        <Link href="/admin/empleados/nuevo" className="btn btn-primary"> Nuevo empleado</Link>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "end" }}>
          <div className="form-group" style={{ flex: 1, minWidth: 220 }}>
            <label htmlFor="search-emp">Buscar por nombre o cédula</label>
            <input
              id="search-emp"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ej. Juan Pérez o 001-0001"
            />
          </div>
          <div className="form-group" style={{ minWidth: 180 }}>
            <label htmlFor="gerencia-filter">Gerencia</label>
            <Select
              id="gerencia-filter"
              value={gerenciaFilter}
              onChange={(e) => setGerenciaFilter(e.target.value)}
            >
              <option value="Todas">Todas las gerencias</option>
              {gerencias.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
            </Select>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <span className="muted" style={{ alignSelf: "flex-end" }}>{filteredEmpleados.length} de {empleados.length} empleados</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Documento</th>
                <th>Gerencia</th>
                <th>Cargo</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmpleados.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "32px" }}>
                    <p className="muted">No se encontraron empleados</p>
                  </td>
                </tr>
              ) : (
                filteredEmpleados.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: "var(--r-md)", background: e.activo ? "var(--brand-l)" : "var(--surface-2)", color: e.activo ? "var(--brand)" : "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: ".8rem", flexShrink: 0 }}>
                          {e.nombre[0]}{e.apellido[0]}
                        </div>
                        <a href={`/admin/empleados/${e.cedula}`} style={{ fontWeight: 600, color: "var(--brand)" }}>
                          {nombreCompleto(e)}
                        </a>
                      </div>
                    </td>
                    <td className="mono" style={{ color: "var(--muted)" }}>{e.cedula}</td>
                    <td>{getGerenciaName(e.gerencia)}</td>
                    <td className="muted">{e.cargo}</td>
                    <td>
                      <div className="status-row">
                        <div className={"dot " + (e.activo ? "dot-ok" : "dot-muted")} />
                        <span style={{ fontWeight: 600, fontSize: ".8375rem", color: e.activo ? "var(--ok)" : "var(--muted)" }}>
                          {e.activo ? "Activo" : "Inactivo"}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <a href={`/admin/empleados/${e.cedula}`} className="btn btn-sm" style={{ background: "var(--surface-2)", color: "var(--ink)", border: "1px solid var(--border)" }}>
                           Histórico
                        </a>
                        {e.activo
                          ? <button
                              className="btn btn-sm btn-danger"
                              style={{ background: "var(--bad-l)", color: "var(--bad)", border: "1.5px solid var(--bad-b)" }}
                              onClick={() => toggleActivo(e)}
                            >
                              Dar de baja
                            </button>
                          : <button
                              className="btn btn-sm btn-ok"
                              onClick={() => toggleActivo(e)}
                            >
                               Reactivar
                            </button>
                        }
                        <button
                          className="btn btn-sm"
                          style={{ background: "transparent", color: "var(--bad)", border: "1px dashed var(--bad-b)" }}
                          title="Borrado físico: elimina empleado + historial (para pruebas)"
                          onClick={() => handleDelete(e)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: 14, fontSize: ".78rem" }}>
          Solo Administrador y RRHH registran / dan de baja empleados. La baja excluye del kiosco y no genera FALTA, conserva el historial completo.
        </p>
      </div>
    </div>
  );
}