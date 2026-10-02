"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  {
    section: "Principal",
    items: [
      { href: "/admin/dashboard", icon: "📊", label: "Dashboard" },
      { href: "/admin/consulta",  icon: "🔍", label: "Consulta flexible ★" },
      { href: "/admin/asistencias",icon:"📋", label: "Asistencias" },
    ],
  },
  {
    section: "Personal",
    items: [
      { href: "/admin/empleados",       icon: "👥", label: "Empleados" },
      { href: "/admin/empleados/nuevo", icon: "➕", label: "Nuevo empleado" },
    ],
  },
  {
    section: "Configuración",
    items: [
      { href: "/admin/reglas",     icon: "⏰", label: "Horarios" },
      { href: "/admin/feriados",   icon: "📅", label: "Feriados" },
      { href: "/admin/vacaciones", icon: "🏖️", label: "Vacaciones" },
    ],
  },
  {
    section: "Sistema",
    items: [
      { href: "/admin/auditoria", icon: "🔒", label: "Auditoría" },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();

  function isActive(href: string) {
    if (href === "/admin/dashboard") return path === href;
    return path.startsWith(href);
  }

  return (
    <div className="admin-shell">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">🎯</div>
          <span className="brand-name">AsistenciaFace</span>
          <span className="brand-sub">Panel administrativo</span>
        </div>

        <nav style={{ flex: 1 }}>
          {NAV.map((group) => (
            <div className="sidebar-section" key={group.section}>
              <span className="sidebar-section-label">{group.section}</span>
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={"nav-link" + (isActive(item.href) ? " active" : "")}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <Link href="/kiosco" className="nav-link" style={{ marginBottom: 4 }}>
            <span className="nav-icon">📷</span>Kiosco
          </Link>
          <Link href="/" className="nav-link">
            <span className="nav-icon">🚪</span>Salir
          </Link>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="admin-content">
        <div className="admin-main">
          {children}
        </div>
      </div>
    </div>
  );
}
