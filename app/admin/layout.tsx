export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="wrap">
      <h2>Panel administrativo (mock por rol)</h2>
      <div className="nav">
        <a href="/admin/consulta">Consulta flexible ★</a>
        <a href="/admin/dashboard">Dashboard</a>
        <a href="/admin/empleados">Empleados</a>
        <a href="/admin/empleados/nuevo">Nuevo empleado</a>
        <a href="/admin/asistencias">Asistencias</a>
        <a href="/admin/reglas">Horarios</a>
        <a href="/admin/feriados">Feriados</a>
        <a href="/admin/vacaciones">Vacaciones</a>
        <a href="/admin/auditoria">Auditoría</a>
        <a href="/">Salir</a>
      </div>
      {children}
    </main>
  );
}
