/**
 * Tipos TypeScript compartidos para toda la aplicación
 * Elimina duplicación de interfaces en componentes y APIs
 */

export interface Gerencia {
  id: number;
  nombre: string;
}

export interface Usuario {
  id: number;
  username: string;
  rol: Rol;
  gerenciaId: number | null;
  gerenciaNombre?: string | null;
  claveInicial: boolean;
  activo: boolean;
  creadoEn: string;
}

export type GerenciaLike = string | Gerencia | undefined;

export type Rol = 'ADMIN' | 'RRHH' | 'GERENTE' | 'COORDINADOR';

export interface Empleado {
  id: number;
  cedula: string;
  nombre: string;
  apellido: string;
  cargo: string;
  gerencia: GerenciaLike;
  gerenciaId: number;
  activo: boolean;
  descriptor?: number[] | null;
  creadoEn: string;
  dadoDeBajaEn: string | null;
}

export interface ReglaAsistencia {
  id: number;
  horaEntrada: string;
  horaLimite: string;
  horaReferencia: string;
  cooldownMin: number;
  vigenciaDesde: string;
  creadoPorId: number | null;
  creadoEn: string;
}

// Alias for backward compatibility
export type Regla = ReglaAsistencia;

export type EstadoEntrada = 'A_TIEMPO' | 'TEMPRANO' | 'TARDE' | 'FALTA' | 'JUSTIFICADO' | 'FERIADO' | 'VACACIONES' | 'REPOSO_MEDICO';
export type EstadoSalida = 'COMPLETADO' | 'TEMPRANO';

export type Rango = 'hoy' | 'ayer' | 'semana';

export interface Asistencia {
  id: number;
  empleadoId: number;
  fecha: string;
  entrada: string | null;
  salida: string | null;
  estadoEntrada: EstadoEntrada;
  estadoOriginal: 'TARDE' | 'FALTA' | null;
  estadoSalida: EstadoSalida | null;
  extrasH: number;
  reglaId: number | null;
  regla?: { horaEntrada: string; horaLimite: string; horaReferencia: string } | null;
  justificacionDoc: string | null;
  justificacionObs: string | null;
  autorizadorId: number | null;
  creadoEn: string;
  actualizadoEn: string;
  empleado: Pick<Empleado, 'nombre' | 'apellido' | 'cedula' | 'gerencia' | 'cargo' | 'gerenciaId'>;
}

export interface Feriado {
  id: number;
  fecha: string;
  motivo: string;
  creadoEn: string;
}

export interface VacacionEmpleado {
  id: number;
  empleadoId: number;
  inicio: string;
  fin: string;
  motivo: string | null;
  aprobadorId: number | null;
  creadoEn: string;
  empleado: Pick<Empleado, 'nombre' | 'apellido' | 'cedula' | 'gerencia'>;
}

export type TipoPase = 'PASE_NORMAL' | 'JUSTIFICACION_ANTICIPADA';

export interface PermisoEstudiantil {
  id: number;
  empleadoId: number;
  diasSemana: number[]; // 0=Dom..6=Sáb
  horaLimite: string; // "HH:MM" — siempre > regla general
  validoDesde: string;
  validoHasta: string;
  motivo: string | null;
  activo: boolean;
  creadoPorId: number | null;
  creadoEn: string;
  empleado?: Pick<Empleado, 'nombre' | 'apellido' | 'cedula' | 'gerenciaId'>;
}

export const DIAS_SEMANA_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const;

export function diasSemanaLabel(dias: number[]): string {
  return [...dias].sort((a, b) => a - b).map(d => DIAS_SEMANA_CORTO[d] ?? d).join(' · ');
}
export interface PasePrevio {
  id: number;
  empleadoId: number;
  fecha: string;
  tipo: TipoPase;
  motivo: string;
  autorizado: boolean;
  autorizadorId: number | null;
  creadoEn: string;
  empleado: Pick<Empleado, 'nombre' | 'apellido' | 'cedula' | 'gerenciaId'>;
}

export interface LogAuditoria {
  id: number;
  accion: AccionAuditoria;
  usuarioId: number | null;
  usuario: { username: string } | null;
  detalle: string;
  ip: string | null;
  ts: string;
}

export type AccionAuditoria =
  | 'LOGIN'
  | 'LOGOUT'
  | 'CREAR_EMPLEADO'
  | 'DESACTIVAR_EMPLEADO'
  | 'REACTIVAR_EMPLEADO'
  | 'ENROLLAR_EMPLEADO'
  | 'FICHAJE_ENTRADA'
  | 'FICHAJE_SALIDA'
  | 'JUSTIFICAR'
  | 'CREAR_PASE'
  | 'CREAR_REGLA'
  | 'CREAR_FERIADO'
  | 'ELIMINAR_FERIADO'
  | 'CREAR_VACACION'
  | 'ELIMINAR_VACACION'
  | 'CREAR_REPOSO'
  | 'ELIMINAR_REPOSO'
  | 'CAMBIO_CLAVE'
  | 'FALTA_PROYECTADA'
  | 'CREAR_JUSTIFICACION_ANTICIPADA';

// Re-export date-utils functions
export { 
  getHoyVE, 
  getSemanaVE, 
  getAyerVE, 
  getFechasRango, 
  getRangoLabel, 
  getChipLabel,
  isLaborable,
  formatDateVE,
  parseTime,
  toDateOnly,
  getVenezuelaDate,
  formatExtras
} from './date-utils';

// Helpers UI
export const ESTADOS_ENTRADA: EstadoEntrada[] = ['A_TIEMPO', 'TEMPRANO', 'TARDE', 'FALTA', 'JUSTIFICADO', 'FERIADO', 'VACACIONES', 'REPOSO_MEDICO'];
export const ESTADOS_SALIDA: EstadoSalida[] = ['COMPLETADO', 'TEMPRANO'];
export const TODOS_ESTADOS = [...ESTADOS_ENTRADA, ...ESTADOS_SALIDA];

// Aliases for backward compatibility
export const ESTADOS = ESTADOS_ENTRADA;
export const ESTADOS_FILTRO = ['Todos', ...ESTADOS_ENTRADA];

export const ESTADO_META: Record<string, { cls: string; icon: string }> = {
  "A_TIEMPO":   { cls: "b-tiempo", icon: "" },
  "TARDE":      { cls: "b-tarde",  icon: "" },
  "FALTA":      { cls: "b-falta",  icon: "" },
  "JUSTIFICADO":{ cls: "b-just",   icon: "" },
  "FERIADO":    { cls: "b-fer",    icon: "" },
  "VACACIONES": { cls: "b-vac",    icon: "" },
  "REPOSO_MEDICO": { cls: "b-rep", icon: "" },
  "TEMPRANO":   { cls: "b-temp",   icon: "" },
  "COMPLETADO": { cls: "b-comp",   icon: "" },
};

export function badgeClass(estado: EstadoEntrada | EstadoSalida | null | undefined): string {
  if (!estado) return 'badge';
  switch (estado) {
    case 'A_TIEMPO':
    case 'COMPLETADO':
      return 'badge b-tiempo';
    case 'TARDE':
      return 'badge b-tarde';
    case 'FALTA':
      return 'badge b-falta';
    case 'JUSTIFICADO':
      return 'badge b-just';
    case 'FERIADO':
      return 'badge b-fer';
    case 'VACACIONES':
      return 'badge b-vac';
    case 'REPOSO_MEDICO':
      return 'badge b-rep';
    case 'TEMPRANO':
      return 'badge b-temp';
    default:
      return 'badge';
  }
}

export function nombreCompleto(e: { nombre: string; apellido: string }): string {
  return `${e.nombre} ${e.apellido}`;
}

export function estadoDe(f: Asistencia): string[] {
  return [f.estadoEntrada, f.estadoSalida].filter(Boolean) as string[];
}

export function getGerenciaName(g: string | { nombre: string } | undefined): string {
  return g ? (typeof g === 'string' ? g : g.nombre) : '';
}