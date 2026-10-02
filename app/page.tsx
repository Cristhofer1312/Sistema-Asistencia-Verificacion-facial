export default function Home() {
  return (
    <main className="wrap">
      <h1>Control de Asistencias con Reconocimiento Facial — Fase 1 UX</h1>
      <p className="muted">Maqueta navegable sin backend. Todo es mock local según SRS v3.2. Los controladores se cablean en Fase 2.</p>
      <div className="nav">
        <a href="/kiosco">Kiosco</a>
        <a href="/login">Login</a>
        <a href="/admin/dashboard">Dashboard</a>
        <a href="/admin/empleados">Empleados</a>
        <a href="/admin/asistencias">Asistencias</a>
        <a href="/admin/reglas">Horarios</a>
        <a href="/admin/feriados">Feriados</a>
        <a href="/admin/vacaciones">Vacaciones</a>
        <a href="/admin/auditoria">Auditoría</a>
      </div>
      <div className="card">
        <h3>Regla vigente (mock)</h3>
        <p>Entrada límite <b>08:00</b> · Salida referencia <b>17:00</b> · Margen tardanza <b>60 min</b> · Cooldown <b>30 min</b> por empleado.</p>
        <p className="muted">Fuera de margen sin pase previo no entra y queda FALTA. Con pase de Gerente/RRHH entra como JUSTIFICADO.</p>
      </div>
    </main>
  );
}
