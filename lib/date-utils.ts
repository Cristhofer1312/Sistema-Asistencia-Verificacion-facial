/**
 * Utilidades de fecha centralizadas para zona horaria Venezuela (UTC-4 sin DST)
 * Elimina duplicación en componentes y APIs
 */

export const VENEZUELA_OFFSET_HOURS = -4;

/** Obtiene Date en hora de Venezuela (UTC-4) */
export function getVenezuelaDate(): Date {
  // Retorna un Date object local ajustado para representar la misma fecha/hora que es en VE
  const nowStr = new Date().toLocaleString("en-US", { timeZone: "America/Caracas" });
  return new Date(nowStr);
}

/** Date solo fecha (00:00:00 local VE) */
export function toDateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** "HH:MM" -> minutos desde medianoche */
export function parseTime(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/** Date -> "YYYY-MM-DD" (local VE) */
export function formatDateVE(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Date VE hoy "YYYY-MM-DD" */
export function getHoyVE(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
}

/** Date VE hace N días "YYYY-MM-DD" */
export function getDaysAgoVE(days: number): string {
  const d = getVenezuelaDate();
  d.setDate(d.getDate() - days);
  return formatDateVE(d);
}

/** Semana VE (hoy - 6 días) */
export function getSemanaVE(): string {
  return getDaysAgoVE(6);
}

/** Ayer VE */
export function getAyerVE(): string {
  return getDaysAgoVE(1);
}

/** Suma días a fecha "YYYY-MM-DD" */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return formatDateVE(d);
}

/** Verifica si fecha es laborable (L-V) */
export function isLaborable(date: Date): boolean {
  const day = date.getDay(); // 0=Dom, 6=Sáb
  return day >= 1 && day <= 5;
}

/** Verifica si fecha (Date only) está en rango [desde, hasta] */
export function isInRange(date: Date, desde: Date, hasta: Date): boolean {
  return date >= desde && date <= hasta;
}

/** Obtiene rango de fechas para filtros predefinidos */
export function getFechasRango(rango: 'hoy' | 'ayer' | 'semana'): { desde: string; hasta: string } {
  const hoy = getHoyVE();
  let desde = hoy;
  
  if (rango === 'ayer') {
    desde = getAyerVE();
  } else if (rango === 'semana') {
    desde = getSemanaVE();
  }
  
  return { desde, hasta: hoy };
}

/** Label legible para rango */
export function getRangoLabel(rango: 'hoy' | 'ayer' | 'semana', fechas: { desde: string; hasta: string }): string {
  if (rango === 'hoy') return `Hoy · ${fechas.hasta}`;
  if (rango === 'ayer') return `Ayer–Hoy · ${fechas.desde} → ${fechas.hasta}`;
  return `Esta semana · ${fechas.desde} → ${fechas.hasta}`;
}

/** Chip label para rango */
export function getChipLabel(rango: 'hoy' | 'ayer' | 'semana'): string {
  return rango === 'hoy' ? 'hoy' : rango === 'ayer' ? 'ayer–hoy' : 'semana';
}

/** Convierte horas decimales (ej. 1.5) a formato +HH:MM (ej. +01:30) */
export function formatExtras(extrasH: number | null | undefined): string {
  if (!extrasH || extrasH <= 0) return "";
  const totalMinutes = Math.round(extrasH * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `+${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Formatea ISO string "YYYY-MM-DDTHH..." a "DD/MM/YYYY" amigable */
export function formatFriendlyDate(isoStr: string | Date): string {
  if (!isoStr) return "—";
  const str = typeof isoStr === 'string' ? isoStr : isoStr.toISOString();
  const datePart = str.split('T')[0];
  if (!datePart) return str;
  const parts = datePart.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return datePart;
}