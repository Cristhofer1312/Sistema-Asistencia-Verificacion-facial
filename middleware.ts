// middleware.ts — Protección de rutas por rol (SRS v3.2)
// ADMIN y RRHH: acceso global · /admin/usuarios: solo ADMIN
// GERENTE / COORDINADOR: solo rutas de su gerencia
// /api/kiosco/*: protegido por API Key del kiosco (validada en cada route)
// claveInicial=true: solo /cambio-clave (también bloquea /api/*)
// La lógica de decisión vive en lib/route-access.ts (testeable).

import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { NextRequestWithAuth } from "next-auth/middleware";
import { decideAccess } from "@/lib/route-access";

export default withAuth(
  function middleware(req: NextRequestWithAuth) {
    const token = req.nextauth.token as any;
    const decision = decideAccess(req.nextUrl.pathname, token);

    if (decision.action === "redirect") {
      return NextResponse.redirect(new URL(decision.to, req.url));
    }
    if (decision.action === "json") {
      return NextResponse.json(decision.body, { status: decision.status });
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
          pathname.startsWith("/models") || // pesos face-api estáticos (el kiosco no tiene sesión)
          pathname.startsWith("/api/kiosco") || // kiosco endpoints (challenge, match) — API Key en cada route
          pathname.startsWith("/api/auth")
        ) return true;
        // Lectura de reglas para el panel del kiosco (el POST sigue exigiendo ADMIN/RRHH en el route)
        if (pathname.startsWith("/api/reglas") && req.method === "GET") return true;
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
