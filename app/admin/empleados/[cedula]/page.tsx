import { ASISTENCIAS, badgeClass, nombreCompleto } from "@/lib/mock-api";
export default function Historial({ params }: { params: { cedula: string } }) {
  const filas = ASISTENCIAS.filter((f) => f.cedula === decodeURIComponent(params.cedula));
  return (
    <div className="card">
      <h3>Histórico — {nombreCompleto(decodeURIComponent(params.cedula))} <span className="muted mono">{decodeURIComponent(params.cedula)}</span></h3>
      <div className="row">
        <div><label>Desde</label><input type="date" defaultValue="2026-10-01" /></div>
        <div><label>Hasta</label><input type="date" defaultValue="2026-10-02" /></div>
        <div className="card" style={{ margin: 0 }}>Tardes: 1 · Faltas: 0 · Justificadas: 0 · Extras: 0.2h</div>
      </div>
      <table style={{ marginTop: 12 }}>
        <thead><tr><th>Fecha</th><th>Entrada</th><th>Salida</th><th>Estado</th><th>Extras</th><th>Autorizador</th></tr></thead>
        <tbody>
          {filas.length === 0 && <tr><td colSpan={6} className="muted">Sin registros en el rango (mock).</td></tr>}
          {filas.map((f, i) => (
            <tr key={i}><td>{f.fecha}</td><td>{f.entrada ?? "—"}</td><td>{f.salida ?? "—"}</td>
              <td><span className={badgeClass(f.estadoEntrada)}>{f.estadoEntrada}</span> {f.estadoSalida && <span className={badgeClass(f.estadoSalida)}>{f.estadoSalida}</span>}</td>
              <td>{f.extras}h</td><td>{f.autorizador ?? "—"}</td></tr>
          ))}
        </tbody>
      </table>
      <p><a href="/admin/asistencias">← Volver al listado (conserva filtros)</a></p>
    </div>
  );
}
