export default function Auditoria() {
  return (
    <div className="card">
      <h3>Auditoría — solo Administrador y RRHH</h3>
      <div className="row"><div><label>Desde</label><input type="date" /></div><div><label>Acción</label><select><option>Todas</option><option>JUSTIFICAR</option><option>CREAR_REGLA</option><option>CREAR_PASE</option></select></div></div>
      <table style={{ marginTop: 8 }}><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead>
      <tbody><tr><td>2026-10-02 08:41</td><td className="mono">rrhh</td><td>JUSTIFICAR</td><td>002-0002 TARDE → JUSTIFICADO</td></tr></tbody></table>
    </div>
  );
}
