// lib/route-access.ts — Decisión de acceso por ruta (pura, testeable).
// La usa middleware.ts. Sin dependencias de Next para poder testearla.

export type AccessDecision =
  | { action: "next" }
  | { action: "redirect"; to: string }
  | { action: "json"; status: number; body: { error: string; code?: string } };

export interface AccessToken {
  rol?: string;
  claveInicial?: boolean;
}

const SOLO_ADMIN_RRHH = [
  "/admin/empleados/nuevo",
  "/admin/reglas",
  "/admin/feriados",
  "/admin/vacaciones",
  "/admin/reposos",
  "/admin/auditoria",
];
const SOLO_ADMIN = ["/admin/usuarios"];

// APIs accesibles aunque la clave sea inicial (o sin sesión de usuario)
const API_EXENTAS_CLAVE_INICIAL = ["/api/auth", "/api/cambio-clave", "/api/kiosco"];

export function decideAccess(pathname: string, token: AccessToken | null | undefined): AccessDecision {
  const starts = (list: string[]) => list.some((p) => pathname === p || pathname.startsWith(p + "/"));

  // Clave inicial: bloquea el panel y también las APIs (excepto cambio de clave / auth / kiosco)
  if (token?.claveInicial) {
    if (pathname.startsWith("/admin")) return { action: "redirect", to: "/cambio-clave" };
    if (pathname.startsWith("/api/") && !starts(API_EXENTAS_CLAVE_INICIAL)) {
      return { action: "json", status: 401, body: { error: "Debe cambiar su clave inicial", code: "cambio_requerido" } };
    }
  }

  if (starts(SOLO_ADMIN) && token?.rol !== "ADMIN") {
    return { action: "redirect", to: "/admin/dashboard" };
  }

  if (starts(SOLO_ADMIN_RRHH) && !["ADMIN", "RRHH"].includes(token?.rol ?? "")) {
    return { action: "redirect", to: "/admin/dashboard" };
  }

  return { action: "next" };
}
