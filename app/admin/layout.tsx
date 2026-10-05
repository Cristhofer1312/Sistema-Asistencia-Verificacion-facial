"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

const NAV = [
  {
    section: "Principal",
    items: [
      { href: "/admin/dashboard", icon: "", label: "Dashboard" },
      { href: "/admin/consulta",  icon: "", label: "Consulta" },
      { href: "/admin/asistencias",icon:"", label: "Crear pase" },
    ],
  },
  {
    section: "Personal",
    items: [
      { href: "/admin/empleados",       icon: "", label: "Empleados" },
      { href: "/admin/empleados/nuevo", icon: "", label: "Nuevo empleado" },
    ],
  },
  {
    section: "Configuración",
    items: [
      { href: "/admin/gerencias",  icon: "", label: "Gerencias" },
      { href: "/admin/reglas",     icon: "", label: "Horarios" },
      { href: "/admin/feriados",   icon: "", label: "Feriados" },
      { href: "/admin/vacaciones", icon: "", label: "Vacaciones" },
      { href: "/admin/reposos",    icon: "", label: "Reposos médicos" },
      { href: "/admin/permisos-estudio", icon: "", label: "Permisos estudio" },
    ],
  },
  {
    section: "Sistema",
    items: [
      { href: "/admin/usuarios",  icon: "", label: "Usuarios" },
      { href: "/admin/auditoria", icon: "", label: "Auditoria" },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { data: session } = useSession();
  const username = (session?.user as any)?.username as string | undefined;
  const rol = (session?.user as any)?.rol as string | undefined;

  const filteredNav = NAV.map(group => ({
    ...group,
    items: group.items.filter(item => {
      if (item.href === "/admin/usuarios") return rol === "ADMIN";
      const requiresAdminRrhh = ["/admin/auditoria", "/admin/reglas", "/admin/feriados", "/admin/vacaciones", "/admin/reposos", "/admin/empleados/nuevo", "/admin/gerencias"];
      if (requiresAdminRrhh.includes(item.href)) return ["ADMIN", "RRHH"].includes(rol ?? "");
      return true;
    })
  })).filter(g => g.items.length > 0) as typeof NAV;

  function isActive(href: string) {
    if (href === "/admin/dashboard") return path === href;
    return path.startsWith(href);
  }

  return (
    <div className="admin-shell">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-name">AsistenciaFace</span>
          <span className="brand-sub">Panel administrativo</span>
        </div>

        <nav style={{ flex: 1 }}>
          {filteredNav.map((group) => (
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
          {username && (
            <span className="muted" style={{ display: "block", padding: "0 12px 8px", fontSize: ".78rem" }}>
               {username}
            </span>
          )}
          <Link href="/kiosco" className="nav-link" style={{ marginBottom: 4 }}>
            <span className="nav-icon"></span>Kiosco
          </Link>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="nav-link"
            style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer" }}
          >
            <span className="nav-icon"></span>Salir
          </button>
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
