"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

type Gerencia = { id: number; nombre: string; empleados: number; empleadosActivos: number; usuarios: number };

export default function GerenciasPage() {
  const { addToast } = useToast();
  const [gerencias, setGerencias] = useState<Gerencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const [nuevoNombre, setNuevoNombre] = useState("");
  const [creando, setCreando] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editando, setEditando] = useState<{ id: number; nombre: string; error: string | null; guardando: boolean } | null>(null);
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);

  async function cargar() {
    try {
      const res = await api.gerencias.list();
      setGerencias(res || []);
      setError(null);
    } catch (e: any) {
      setError(e.message || "Error cargando gerencias");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return q ? gerencias.filter(g => g.nombre.toLowerCase().includes(q)) : gerencias;
  }, [gerencias, busqueda]);

  const totales = useMemo(() => gerencias.reduce(
    (t, g) => ({ empleados: t.empleados + g.empleadosActivos, usuarios: t.usuarios + g.usuarios, vacias: t.vacias + (g.empleados === 0 ? 1 : 0) }),
    { empleados: 0, usuarios: 0, vacias: 0 }
  ), [gerencias]);

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    const nombre = nuevoNombre.trim();
    if (nombre.length < 2) {
      setFormError("El nombre debe tener al menos 2 caracteres");
      return;
    }
    setCreando(true);
    setFormError(null);
    try {
      await api.gerencias.create({ nombre });
      setNuevoNombre("");
      addToast({ type: "success", title: "Gerencia creada", message: nombre });
      await cargar();
    } catch (e: any) {
      setFormError(e.data?.error || e.message || "Error creando gerencia");
    } finally {
      setCreando(false);
    }
  }

  async function handleGuardarEdicion() {
    if (!editando) return;
    const nombre = editando.nombre.trim();
    if (nombre.length < 2) {
      setEditando({ ...editando, error: "El nombre debe tener al menos 2 caracteres" });
      return;
    }
    setEditando({ ...editando, guardando: true, error: null });
    try {
      await api.gerencias.update(editando.id, { nombre });
      setEditando(null);
      addToast({ type: "success", title: "Gerencia actualizada", message: nombre });
      await cargar();
    } catch (e: any) {
      setEditando(ed => ed && { ...ed, guardando: false, error: e.data?.error || e.message || "Error guardando" });
    }
  }

  async function handleEliminar(g: Gerencia) {
    if (!confirm(`¿Eliminar la gerencia "${g.nombre}"?`)) return;
    setEliminandoId(g.id);
    try {
      await api.gerencias.delete(g.id);
      addToast({ type: "success", title: "Gerencia eliminada", message: g.nombre });
      await cargar();
    } catch (e: any) {
      addToast({ type: "error", title: "No se pudo eliminar", message: e.data?.error || e.message });
    } finally {
      setEliminandoId(null);
    }
  }

  if (loading) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>Cargando gerencias…</div>;
  }

  if (error) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 40 }}>
        <p style={{ color: "var(--bad)" }}>{error}</p>
        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => { setLoading(true); cargar(); }}>Reintentar</button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ marginBottom: 4 }}>Gerencias</h2>
        <p className="muted">Unidades organizativas · definen el alcance de gerentes y coordinadores</p>
      </div>

      <div className="grid3" style={{ marginBottom: 20 }}>
        {[
          { label: "Gerencias", val: gerencias.length, color: "var(--brand)" },
          { label: "Empleados activos", val: totales.empleados, color: "var(--ok)" },
          { label: "Usuarios asignados", val: totales.usuarios, color: "var(--info)" },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-val" style={{ color: s.color }}>{s.val}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 14 }}>Nueva gerencia</h3>
        {formError && <div className="alert alert-warn" style={{ marginBottom: 14 }}><span></span><span>{formError}</span></div>}
        <form onSubmit={handleCrear} style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="form-group" style={{ flex: "1 1 260px" }}>
            <label htmlFor="ger-nombre">Nombre <span style={{ color: "var(--bad)" }}>*</span></label>
            <input
              id="ger-nombre"
              value={nuevoNombre}
              onChange={e => setNuevoNombre(e.target.value)}
              placeholder="Ej. Operaciones"
              maxLength={100}
            />
          </div>
          <div className="form-group">
            <button type="submit" className="btn btn-primary" disabled={creando || nuevoNombre.trim().length < 2}>
              {creando ? "Creando…" : "Crear gerencia"}
            </button>
          </div>
        </form>
      </div>

      <div className="card" style={{ marginTop: 20, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>Gerencias registradas</h3>
          <span className="chip">{filtradas.length} de {gerencias.length}</span>
          <input
            aria-label="Buscar gerencia"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre…"
            style={{ marginLeft: "auto", maxWidth: 240 }}
          />
        </div>
        <div className="table-wrap" style={{ border: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Gerencia</th>
                <th>Empleados</th>
                <th>Usuarios</th>
                <th style={{ textAlign: "right" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state" style={{ padding: "32px 0" }}>
                      <h4>{gerencias.length === 0 ? "No hay gerencias registradas" : "Sin resultados"}</h4>
                      <p>{gerencias.length === 0 ? "Cree la primera con el formulario de arriba." : "Pruebe con otro nombre."}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtradas.map(g => {
                  const enUso = g.empleados > 0 || g.usuarios > 0;
                  const inactivos = g.empleados - g.empleadosActivos;
                  return (
                    <tr key={g.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 34, height: 34, borderRadius: "var(--r-md)", background: "var(--brand-l)", color: "var(--brand)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: ".8rem", flexShrink: 0 }}>
                            {g.nombre.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600 }}>{g.nombre}</div>
                            <div className="muted mono" style={{ fontSize: ".72rem" }}>ID {g.id}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700 }}>{g.empleadosActivos}</span>
                        <span className="muted" style={{ fontSize: ".78rem" }}> activo(s)</span>
                        {inactivos > 0 && <div className="muted" style={{ fontSize: ".72rem" }}>+ {inactivos} de baja</div>}
                      </td>
                      <td>
                        {g.usuarios > 0
                          ? <span className="badge b-just">{g.usuarios} usuario(s)</span>
                          : <span className="muted">—</span>}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <Link href={`/admin/empleados?gerenciaId=${g.id}`} className="btn btn-sm btn-ghost">Ver empleados</Link>
                          <button className="btn btn-sm btn-ghost" onClick={() => setEditando({ id: g.id, nombre: g.nombre, error: null, guardando: false })}>
                            Renombrar
                          </button>
                          <button
                            className="btn btn-sm"
                            style={{ background: "var(--bad-l)", color: "var(--bad)", border: "1.5px solid var(--bad-b)" }}
                            disabled={enUso || eliminandoId === g.id}
                            title={enUso ? "Solo se puede eliminar sin empleados (incluidos los de baja) ni usuarios asignados" : undefined}
                            onClick={() => handleEliminar(g)}
                          >
                            {eliminandoId === g.id ? "Eliminando…" : "Eliminar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: ".78rem", padding: "12px 20px", margin: 0, borderTop: "1px solid var(--border)" }}>
          Una gerencia solo puede eliminarse si no tiene empleados (incluidos los dados de baja) ni usuarios asignados.
          {totales.vacias > 0 && ` Hay ${totales.vacias} gerencia(s) sin empleados.`}
        </p>
      </div>

      {editando && (
        <div className="modal-bg" onClick={() => { if (!editando.guardando) setEditando(null); }}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Renombrar gerencia</div>
              <button className="modal-close" onClick={() => setEditando(null)} disabled={editando.guardando}>×</button>
            </div>
            <form onSubmit={e => { e.preventDefault(); handleGuardarEdicion(); }}>
              <div className="form-group">
                <label htmlFor="ger-edit">Nombre <span style={{ color: "var(--bad)" }}>*</span></label>
                <input
                  id="ger-edit"
                  value={editando.nombre}
                  onChange={e => setEditando({ ...editando, nombre: e.target.value })}
                  maxLength={100}
                  autoFocus
                />
              </div>
              {editando.error && <div className="alert alert-warn" style={{ marginTop: 12 }}><span></span><span>{editando.error}</span></div>}
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setEditando(null)} disabled={editando.guardando}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={editando.guardando}>
                  {editando.guardando ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
