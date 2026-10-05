// lib/scope.ts — Alcance de datos por rol/gerencia.
// ADMIN/RRHH: global. GERENTE/COORDINADOR: solo su gerencia.
// Un rol con alcance de gerencia SIN gerenciaId se deniega: nunca se debe
// pasar `undefined` a Prisma (equivale a "sin filtro" y filtraría todo).

export type Scope =
  | { tipo: "global" }
  | { tipo: "gerencia"; gerenciaId: number }
  | { tipo: "denegado" };

export function getScope(user: { rol?: string | null; gerenciaId?: number | null } | null | undefined): Scope {
  const rol = user?.rol;
  if (rol === "ADMIN" || rol === "RRHH") return { tipo: "global" };
  if (rol === "GERENTE" || rol === "COORDINADOR") {
    const g = user?.gerenciaId;
    if (typeof g === "number" && Number.isInteger(g)) return { tipo: "gerencia", gerenciaId: g };
  }
  return { tipo: "denegado" };
}

export const SCOPE_DENIED_BODY = { error: "Usuario sin gerencia asignada: acceso denegado" };
