import { EMPLEADOS } from "@/lib/mock-api";
export default function Empleados() {
  return (
    <div className="card">
      <h3>Empleados — nombre clicable abre histórico</h3>
      <table>
        <thead><tr><th>Empleado</th><th>Documento</th><th>Gerencia</th><th>Estado</th><th>Acción</th></tr></thead>
        <tbody>
          {EMPLEADOS.map((e) => (
            <tr key={e.cedula}>
              <td><a href={`/admin/empleados/${e.cedula}`}><b>{e.nombre} {e.apellido}</b></a></td>
              <td className="mono">{e.cedula}</td><td>{e.gerencia}</td>
              <td>{e.activo ? "Activo" : "Inactivo"}</td>
              <td>{e.activo ? <button className="btn">Dar de baja (mock)</button> : <button className="btn">Reactivar (mock)</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Solo Administrador y RRHH registran / dan de baja. La baja excluye de kiosco y de faltas, conserva historial.</p>
    </div>
  );
}
