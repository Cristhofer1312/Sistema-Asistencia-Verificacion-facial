// lib/face-server.ts — Funciones de matching facial para server-side (sin dependencias de face-api)

/** Umbral máximo de distancia euclidiana para aceptar un match */
export const MATCH_DISTANCE_THRESHOLD = 0.5;
/** Diferencia mínima entre el mejor candidato y el mejor de OTRO empleado */
export const MATCH_AMBIGUITY_MARGIN = 0.06;

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
 */
export function findBestMatchServer(
  descriptor: number[],
  entries: Array<{ empleadoId: number; descriptor: number[]; [key: string]: any }>,
  threshold = MATCH_DISTANCE_THRESHOLD,
  margin = MATCH_AMBIGUITY_MARGIN
): { entry: any; distance: number } | null {
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
  return best;
}