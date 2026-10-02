export default function Dashboard() {
  const stats = [
    { icon: "🟢", label: "Presentes",  val: "12", color: "#ecfdf5", iconBg: "#d1fae5", textColor: "#059669" },
    { icon: "🟡", label: "Tardanzas",  val: "2",  color: "#fffbeb", iconBg: "#fde68a", textColor: "#d97706" },
    { icon: "🔴", label: "Faltas",     val: "1",  color: "#fef2f2", iconBg: "#fecaca", textColor: "#dc2626" },
    { icon: "🟣", label: "Vacaciones", val: "1",  color: "#f5f3ff", iconBg: "#ddd6fe", textColor: "#7c3aed" },
    { icon: "📅", label: "Feriados",   val: "0",  color: "#f8fafc", iconBg: "#e2e8f4", textColor: "#64748b" },
    { icon: "⏱️", label: "Horas extra",val: "3.5h",color:"#eff6ff", iconBg: "#bfdbfe", textColor: "#2563eb" },
  ];

  const ultimos = [
    { hora: "08:40", nombre: "Luis Gómez",  estado: "TARDE",   badge: "b-tarde" },
    { hora: "07:55", nombre: "Ana Pérez",   estado: "A TIEMPO", badge: "b-tiempo" },
    { hora: "07:48", nombre: "Carlos Ruiz", estado: "A TIEMPO", badge: "b-tiempo" },
    { hora: "17:12", nombre: "Ana Pérez",   estado: "COMPLETADO+0.2h", badge: "b-comp" },
  ];

  return (
    <div>
      {/* Header */}
      <div className="row-between" style={{ marginBottom: 24 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Dashboard</h2>
          <p className="muted">Resumen de hoy · 2 Oct 2026 (mock)</p>
        </div>
        <div className="row">
          <a href="/kiosco" className="btn btn-primary btn-sm">📷 Ir al kiosco</a>
          <a href="/admin/consulta" className="btn btn-sm">🔍 Consulta flexible</a>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid3" style={{ marginBottom: 24 }}>
        {stats.map((s) => (
          <div key={s.label} className="stat-card" style={{ background: s.color }}>
            <div className="stat-icon" style={{ background: s.iconBg }}>
              {s.icon}
            </div>
            <div className="stat-val" style={{ color: s.textColor }}>{s.val}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Últimos fichajes */}
      <div className="card">
        <div className="section-header">
          <h3>Últimos fichajes</h3>
          <a href="/admin/asistencias" className="btn btn-sm btn-ghost">Ver todos →</a>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Hora</th>
                <th>Empleado</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {ultimos.map((u, i) => (
                <tr key={i}>
                  <td className="mono" style={{ color: "var(--muted)", fontWeight: 600, width: 80 }}>{u.hora}</td>
                  <td style={{ fontWeight: 600 }}>{u.nombre}</td>
                  <td><span className={`badge ${u.badge}`}>{u.estado}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info footer */}
      <div className="card-flat" style={{ marginTop: 16, display: "flex", gap: 18, flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: ".78rem" }}>⏰ Entrada límite <b style={{ color: "var(--ink-2)" }}>08:00</b></span>
        <span className="muted" style={{ fontSize: ".78rem" }}>🏁 Salida ref. <b style={{ color: "var(--ink-2)" }}>17:00</b></span>
        <span className="muted" style={{ fontSize: ".78rem" }}>⌛ Margen tardanza <b style={{ color: "var(--ink-2)" }}>60 min</b></span>
        <span className="muted" style={{ fontSize: ".78rem" }}>🔒 Cooldown kiosco <b style={{ color: "var(--ink-2)" }}>30 min/empleado</b></span>
      </div>
    </div>
  );
}
