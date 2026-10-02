export default function Vacaciones() {
  return (
    <div className="card">
      <h3>Vacaciones por empleado</h3>
      <div className="grid2">
        <div><label>Empleado</label><select><option>Ana Pérez</option><option>Luis Gómez</option></select></div>
        <div><label>Motivo</label><input placeholder="Vacaciones anuales" /></div>
        <div><label>Inicio</label><input type="date" /></div>
        <div><label>Fin</label><input type="date" /></div>
      </div>
      <div className="row" style={{ marginTop: 8 }}><button className="btn btn-primary">Asignar (mock, valida solape)</button></div>
      <p className="muted">Sin marca = VACACIONES. Con marca = asistencia + extras totales.</p>
    </div>
  );
}
