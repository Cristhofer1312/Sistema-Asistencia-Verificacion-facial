"use client";
import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [gerencias, setGerencias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();
  const { data: session } = useSession();
  const router = useRouter();

  const [nuevo, setNuevo] = useState({ username: "", rol: "RRHH", gerenciaId: "" });
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    if (session && (session.user as any).rol !== "ADMIN") {
      router.push("/admin/dashboard");
      return;
    }
    if (session) {
      cargar();
    }
  }, [session, router]);

  async function cargar() {
    setLoading(true);
    try {
      const [uRes, gRes] = await Promise.all([
        fetch("/api/usuarios").then(r => r.json()),
        fetch("/api/gerencias").then(r => r.json())
      ]);
      if (uRes.error) throw new Error(uRes.error);
      setUsuarios(uRes);
      setGerencias(gRes);
    } catch (e: any) {
      addToast({ type: "error", title: "Error", message: e.message || "Error cargando datos" });
    } finally {
      setLoading(false);
    }
  }

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setCreando(true);
    try {
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: nuevo.username,
          rol: nuevo.rol,
          gerenciaId: nuevo.gerenciaId ? Number(nuevo.gerenciaId) : null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      addToast({ type: "success", title: "Creado", message: "Usuario creado exitosamente. Clave: Cambiar1234!" });
      setNuevo({ username: "", rol: "RRHH", gerenciaId: "" });
      cargar();
    } catch (e: any) {
      addToast({ type: "error", title: "Error", message: e.message });
    } finally {
      setCreando(false);
    }
  }

  async function handleAction(id: number, action: string) {
    if (action === "reset_password" && !confirm("Seguro que deseas resetear la contrasena a Cambiar1234! ?")) return;
    if (action === "eliminar" && !confirm("Seguro que deseas ELIMINAR este usuario? Esta accion no se puede deshacer.")) return;
    try {
      const method = action === "eliminar" ? "DELETE" : "PUT";
      const body = action === "eliminar" ? undefined : JSON.stringify({ action });
      const res = await fetch(`/api/usuarios/${id}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      addToast({ type: "success", title: "Exito", message: action === "reset_password" ? data.msg : action === "eliminar" ? "Usuario eliminado" : "Estado actualizado" });
      cargar();
    } catch (e: any) {
      addToast({ type: "error", title: "Error", message: e.message });
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}>Cargando...</div>;

  return (
    <div>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2>Gestion de Usuarios</h2>
          <p className="muted">Crea cuentas de acceso y resetea contrasenas.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16 }}>Nuevo usuario</h3>
        <form onSubmit={handleCrear} style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="form-group" style={{ flex: "1 1 200px" }}>
            <label>Username</label>
            <input required type="text" value={nuevo.username} onChange={e => setNuevo({ ...nuevo, username: e.target.value })} />
          </div>
          <div className="form-group" style={{ flex: "1 1 150px" }}>
            <label>Rol</label>
            <Select value={nuevo.rol} onChange={e => setNuevo({ ...nuevo, rol: e.target.value })}>
              <option value="ADMIN">Administrador</option>
              <option value="RRHH">Recursos Humanos</option>
              <option value="GERENTE">Gerente</option>
              <option value="COORDINADOR">Coordinador</option>
            </Select>
          </div>
          <div className="form-group" style={{ flex: "1 1 200px" }}>
            <label>Gerencia (Opcional)</label>
            <Select value={nuevo.gerenciaId} onChange={e => setNuevo({ ...nuevo, gerenciaId: e.target.value })}>
              <option value="">Ninguna (Global)</option>
              {gerencias.map(g => (
                <option key={g.id} value={g.id}>{g.nombre}</option>
              ))}
            </Select>
          </div>
          <div className="form-group">
            <button type="submit" className="btn btn-primary" disabled={creando}>
              {creando ? "Creando..." : "Crear usuario"}
            </button>
          </div>
        </form>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="table-wrap" style={{ border: "none" }}>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Username</th>
                <th>Rol</th>
                <th>Gerencia</th>
                <th>Estado</th>
                <th style={{ textAlign: "right" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map(u => (
                <tr key={u.id} style={{ opacity: u.activo ? 1 : 0.5 }}>
                  <td className="muted">{u.id}</td>
                  <td style={{ fontWeight: 600 }}>{u.username}</td>
                  <td><span className="badge b-info">{u.rol}</span></td>
                  <td>{u.gerencia?.nombre || "—"}</td>
                  <td>
                    {u.activo 
                      ? <span className="badge b-tiempo">Activo</span> 
                      : <span className="badge b-inactive">Inactivo</span>}
                    {u.claveInicial && <span className="badge b-warn" style={{ marginLeft: 6 }}>Clave inicial: Cambiar1234!</span>}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => handleAction(u.id, "toggle_activo")} style={{ marginRight: 8 }}>
                      {u.activo ? "Desactivar" : "Activar"}
                    </button>
                    <button type="button" className="btn btn-sm btn-warn-outline" onClick={() => handleAction(u.id, "reset_password")} style={{ marginRight: 8 }}>
                      Resetear clave
                    </button>
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => handleAction(u.id, "eliminar")}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
