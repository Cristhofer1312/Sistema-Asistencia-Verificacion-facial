import { EMPLEADOS } from "@/lib/mock-api";

export default function Empleados() {
  return (
    <div>
      <div className="row-between" style={{ marginBottom: 20 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Empleados</h2>
          <p className="muted">Nombre clicable abre el histórico individual</p>
        </div>
        <a href="/admin/empleados/nuevo" className="btn btn-primary">➕ Nuevo empleado</a>
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
              {EMPLEADOS.map((e) => (
                <tr key={e.cedula}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: "var(--r-md)", background: e.activo ? "var(--brand-l)" : "var(--surface-2)", color: e.activo ? "var(--brand)" : "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: ".8rem", flexShrink: 0 }}>
                        {e.nombre[0]}{e.apellido[0]}
                      </div>
                      <a href={`/admin/empleados/${e.cedula}`} style={{ fontWeight: 600, color: "var(--brand)" }}>
                        {e.nombre} {e.apellido}
                      </a>
                    </div>
                  </td>
                  <td className="mono" style={{ color: "var(--muted)" }}>{e.cedula}</td>
                  <td>{e.gerencia}</td>
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
                    {e.activo
                      ? <button className="btn btn-sm btn-danger" style={{ background: "var(--bad-l)", color: "var(--bad)", border: "1.5px solid var(--bad-b)" }}>Dar de baja</button>
                      : <button className="btn btn-sm btn-ok">↩ Reactivar</button>
                    }
                  </td>
                </tr>
              ))}
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
