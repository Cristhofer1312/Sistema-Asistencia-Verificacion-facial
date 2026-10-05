// lib/face-server.ts — Funciones de matching facial para server-side (sin dependencias de face-api)
// FUENTE ÚNICA de umbrales: lib/face-api.ts los re-exporta desde aquí.
// NO duplicar estos valores en otros archivos (enroll, match, diagnósticos
// deben importar desde aquí).

/**
 * Distancia euclidiana máxima para aceptar un match 1:N en kiosco.
 * Misma persona: ~0.3-0.5 · distintas: normalmente > 0.6.
 * 0.46 prioriza precisión (menos confusiones entre personas parecidas a
 * cambio de algún "intente de nuevo" legítimo).
 */
export const MATCH_DISTANCE_THRESHOLD = 0.46; // Antes 0.50. Ajustado a 0.46 para ser más estricto con los falsos positivos.
/**
 * Diferencia mínima entre el mejor candidato y el mejor de OTRO empleado.
 * 0.18: los falsos positivos por tono de piel suelen caer en la zona gris.
 * Aumentar a 0.18 forzará a rechazar matches que se parezcan a dos empleados al mismo tiempo.
 */
export const MATCH_AMBIGUITY_MARGIN = 0.18; // Antes 0.15.

/**
 * Distancia euclidiana entre dos arrays de números (server-side).
 */
export function euclideanDistanceServer(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < 128; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * Encuentra el mejor match 1:N en array de descriptores (server-side).
 * Retorna null si ninguno está bajo el umbral o si el resultado es ambiguo
 * (otro empleado queda casi igual de cerca).
 * secondDistance = distancia del mejor candidato de OTRO empleado (o null
 * si no hay otro): sirve para auditar el margen real del match.
 */
export function findBestMatchServer(
  descriptor: number[],
  entries: Array<{ empleadoId: number; descriptor: number[]; [key: string]: any }>,
  threshold = MATCH_DISTANCE_THRESHOLD,
  margin = MATCH_AMBIGUITY_MARGIN
): { entry: any; distance: number; secondDistance: number | null } | null {
  let best: { entry: any; distance: number } | null = null;
  let secondOther = Infinity; // mejor distancia de un empleado distinto al mejor

  for (const entry of entries) {
    if (!entry.descriptor || entry.descriptor.length !== 128) continue;
    const dist = euclideanDistanceServer(descriptor, entry.descriptor);
    if (!best || dist < best.distance) {
      if (best && best.entry.empleadoId !== entry.empleadoId) {
        secondOther = Math.min(secondOther, best.distance);
      }
      best = { entry, distance: dist };
    } else if (entry.empleadoId !== best.entry.empleadoId) {
      secondOther = Math.min(secondOther, dist);
    }
  }

  if (!best || best.distance >= threshold) return null;
  if (secondOther - best.distance < margin) return null; // ambiguo
  return { ...best, secondDistance: secondOther === Infinity ? null : secondOther };
}

/**
 * Acuerdo de doble verificación: dos probes independientes (capturados con
 * segundos de diferencia) deben coincidir en el MISMO empleado.
 * Los falsos positivos por tono de piel/iluminación son ruidosos e
 * inestables entre capturas; los verdaderos son estables. Si discrepan
 * (o alguno es null), no hay acuerdo → se rechaza como no reconocido.
 */
export function agreeMatches(
  m1: { entry: any; distance: number; secondDistance?: number | null } | null,
  m2: { entry: any; distance: number; secondDistance?: number | null } | null
): { entry: any; distance: number; secondDistance?: number | null } | null {
  if (!m1 || !m2) return null;
  if (m1.entry.empleadoId !== m2.entry.empleadoId) return null;
  return m1.distance <= m2.distance ? m1 : m2;
}