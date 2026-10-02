// Mock central Fase 1 — SRS v3.2 (sin backend)
export const REGLA = { limite: "08:00", referencia: "17:00", margenMin: 60, cooldownMin: 30 };

export type Empleado = { cedula: string; nombre: string; apellido: string; cargo: string; gerencia: string; activo: boolean };
export const EMPLEADOS: Empleado[] = [
  { cedula: "001-0001", nombre: "Ana", apellido: "Pérez", cargo: "Analista RRHH", gerencia: "RRHH", activo: true },
  { cedula: "002-0002", nombre: "Luis", apellido: "Gómez", cargo: "Vendedor", gerencia: "Ventas", activo: true },
  { cedula: "003-0003", nombre: "María", apellido: "Ruiz", cargo: "Vendedora", gerencia: "Ventas", activo: true },
  { cedula: "004-0004", nombre: "José", apellido: "Díaz", cargo: "Soporte", gerencia: "TI", activo: false },
];

export type Fila = {
  cedula: string; fecha: string; entrada: string | null; salida: string | null;
  estadoEntrada: string; estadoSalida: string | null; extras: number; autorizador?: string;
};
export const ASISTENCIAS: Fila[] = [
  { cedula: "001-0001", fecha: "2026-10-01", entrada: "07:55", salida: "17:10", estadoEntrada: "A TIEMPO", estadoSalida: "COMPLETADO", extras: 0.17 },
  { cedula: "002-0002", fecha: "2026-10-01", entrada: "08:40", salida: "16:30", estadoEntrada: "TARDE", estadoSalida: "TEMPRANO", extras: 0 },
  { cedula: "003-0003", fecha: "2026-10-01", entrada: null, salida: null, estadoEntrada: "FALTA", estadoSalida: null, extras: 0 },
  { cedula: "001-0001", fecha: "2026-10-02", entrada: null, salida: null, estadoEntrada: "FERIADO", estadoSalida: null, extras: 0 },
  { cedula: "002-0002", fecha: "2026-10-02", entrada: "08:05", salida: "19:00", estadoEntrada: "TARDE", estadoSalida: "COMPLETADO", extras: 2.0, autorizador: "rrhh" },
  { cedula: "003-0003", fecha: "2026-10-02", entrada: null, salida: null, estadoEntrada: "VACACIONES", estadoSalida: null, extras: 0 },
  { cedula: "002-0002", fecha: "2026-10-03", entrada: null, salida: null, estadoEntrada: "JUSTIFICADO", estadoSalida: null, extras: 0, autorizador: "gerente.ventas" },
];

export function badgeClass(e: string) {
  if (e === "A TIEMPO" || e === "COMPLETADO") return "badge b-tiempo";
  if (e === "TARDE") return "badge b-tarde";
  if (e === "FALTA") return "badge b-falta";
  if (e === "JUSTIFICADO") return "badge b-just";
  if (e === "FERIADO") return "badge b-fer";
  if (e === "VACACIONES") return "badge b-vac";
  if (e === "TEMPRANO") return "badge b-temp";
  return "badge";
}

export function nombreCompleto(c: string) {
  const e = EMPLEADOS.find((x) => x.cedula === c);
  return e ? `${e.nombre} ${e.apellido}` : c;
}
