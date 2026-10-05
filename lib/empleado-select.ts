// lib/empleado-select.ts — Campos públicos de Empleado.
// NUNCA incluye `descriptor` (plantilla biométrica): solo lo leen
// lib/face-cache.ts, el match del kiosco y el enrolamiento (duplicados).
export const EMPLEADO_PUBLIC_SELECT = {
  id: true,
  cedula: true,
  nombre: true,
  apellido: true,
  cargo: true,
  gerenciaId: true,
  activo: true,
  creadoEn: true,
  dadoDeBajaEn: true,
  gerencia: true,
} as const;
