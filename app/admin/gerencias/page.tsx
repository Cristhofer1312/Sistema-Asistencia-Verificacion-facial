"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";

type Gerencia = { id: number; nombre: string };

export default function GerenciasPage() {
  const [gerencias, setGerencias] = useState<Gerencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [nombreForm, setNombreForm] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadGerencias();
  }, []);

  const loadGerencias = async () => {
    setLoading(true);
    try {
      const res = await api.gerencias.list();
      setGerencias(res || []);
      setError("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const openNew = () => {
    setEditingId(null);
    setNombreForm("");
    setFormError("");
    setIsModalOpen(true);
  };

  const openEdit = (g: Gerencia) => {
    setEditingId(g.id);
    setNombreForm(g.nombre);
    setFormError("");
    setIsModalOpen(true);
  };

  const closeForm = () => {
    setIsModalOpen(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nombreForm.trim().length < 2) {
      setFormError("El nombre debe tener al menos 2 caracteres");
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      let res;
      if (editingId) {
        res = await api.gerencias.update(editingId, { nombre: nombreForm });
      } else {
        res = await api.gerencias.create({ nombre: nombreForm });
      }

      if (res.error) throw new Error(res.error);
      
      await loadGerencias();
      closeForm();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number, nombre: string) => {
    if (!confirm(`¿Eliminar gerencia "${nombre}"?\nEsto fallará si hay empleados o usuarios asignados a ella.`)) return;
    
    try {
      await api.gerencias.delete(id);
      await loadGerencias();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div>
      <div className="admin-header">
        <h1>Gestión de Gerencias</h1>
        <button className="btn btn-primary" onClick={openNew}>+ Nueva Gerencia</button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {loading ? (
        <p>Cargando gerencias...</p>
      ) : (
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th style={{ width: 150 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {gerencias.map(g => (
                <tr key={g.id}>
                  <td>{g.id}</td>
                  <td>{g.nombre}</td>
                  <td className="actions-cell">
                    <button className="btn btn-sm btn-outline" onClick={() => openEdit(g)}>Editar</button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(g.id, g.nombre)}>Borrar</button>
                  </td>
                </tr>
              ))}
              {gerencias.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center text-muted">No hay gerencias registradas</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h2>{editingId ? "Editar Gerencia" : "Nueva Gerencia"}</h2>
              <button className="modal-close" onClick={closeForm}>&times;</button>
            </div>
            <form onSubmit={handleSave} className="modal-body">
              {formError && <div className="alert alert-danger" style={{ padding: '8px', marginBottom: '16px' }}>{formError}</div>}
              
              <div className="form-group">
                <label>Nombre de la gerencia</label>
                <input
                  type="text"
                  className="form-control"
                  value={nombreForm}
                  onChange={e => setNombreForm(e.target.value)}
                  placeholder="Ej: Operaciones"
                  autoFocus
                  required
                />
              </div>

              <div className="modal-footer" style={{ marginTop: '24px' }}>
                <button type="button" className="btn btn-outline" onClick={closeForm} disabled={saving}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
