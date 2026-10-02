export default function Reglas() {
  return (
    <div className="card">
      <h3>Horario global — rige hacia adelante, no altera pasado</h3>
      <div className="grid2">
        <div><label>Hora límite entrada</label><input type="time" defaultValue="08:00" /></div>
        <div><label>Hora referencia salida</label><input type="time" defaultValue="17:00" /></div>
        <div><label>Margen tardanza (min, default 60, editable)</label><input type="number" defaultValue={60} /></div>
        <div><label>Vigencia desde</label><input type="date" /></div>
      </div>
      <div className="row" style={{ marginTop: 12 }}><button className="btn btn-primary">Crear nuevo horario (mock)</button></div>
      <table style={{ marginTop: 12 }}><thead><tr><th>Vigencia</th><th>Entrada</th><th>Salida ref</th><th>Margen</th><th>Creador</th></tr></thead>
      <tbody><tr><td>2026-10-01</td><td>08:00</td><td>17:00</td><td>60 min</td><td>admin</td></tr></tbody></table>
      <p className="muted">Solo Administrador y RRHH crean. Cada fichaje guarda snapshot del horario aplicado.</p>
    </div>
  );
}
