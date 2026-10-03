// middleware.ts — Protección de rutas por rol (SRS v3.2)
// ADMIN y RRHH: acceso global
// GERENTE / COORDINADOR: solo rutas de su gerencia
// /api/fichaje: API Key exclusiva del kiosco (sin sesión de usuario)
// /cambio-clave: accesible solo si claveInicial=true

import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { NextRequestWithAuth } from "next-auth/middleware";

export default withAuth(
  function middleware(req: NextRequestWithAuth) {
    const token = req.nextauth.token as any;
    const { pathname } = req.nextUrl;

    // Redirigir a cambio-clave si la clave es inicial
    if (token?.claveInicial && pathname.startsWith("/admin")) {
      return NextResponse.redirect(new URL("/cambio-clave", req.url));
    }

    // Rutas exclusivas ADMIN + RRHH
    const soloAdminRrhh = [
      "/admin/empleados/nuevo",
      "/admin/reglas",
      "/admin/feriados",
      "/admin/vacaciones",
      "/admin/reposos",
      "/admin/auditoria",
    ];
    if (soloAdminRrhh.some((p) => pathname.startsWith(p))) {
      if (!["ADMIN", "RRHH"].includes(token?.rol)) {
        return NextResponse.redirect(new URL("/admin/dashboard", req.url));
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;
        // Rutas públicas
        if (
          pathname === "/" ||
          pathname.startsWith("/kiosco") ||
          pathname.startsWith("/api/fichaje") || // protegida por API Key interna
          pathname.startsWith("/api/kiosco") || // kiosco endpoints (descriptors, match)
          pathname.startsWith("/api/auth")
        ) return true;
        // El resto requiere sesión
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|public).*)",
  ],
};
