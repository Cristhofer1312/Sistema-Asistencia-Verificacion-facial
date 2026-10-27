/**
 * lib/face-quality.ts — Puertas de calidad facial, FUENTE ÚNICA.
 * Las usan el registro (FaceEnroll), el kiosco (FaceIdentify) y el servidor
 * (match) en la misma escala. Regla de oro: la referencia enrolada exige IGUAL O MÁS calidad
 * que el probe del kiosco, nunca menos (una referencia oscura/descentrada
 * es la que luego se confunde con otras personas).
 *
 * Iluminación: NO se usa el brillo promedio del rostro (piel oscura da
 * promedios bajos aunque la luz sea buena). Se mide la fracción de píxeles
 * quemados (luma > 240) y oscuros (luma < 20) dentro de la caja del rostro.
 * Umbrales iniciales: pendientes de calibrar con mediciones reales.
 */

export const FACE_QUALITY = {
  enroll: {
    minScore: 0.6, // confianza del detector
    maxAngle: 20, // yaw/pitch grados
    minFaceSize: 120, // px ancho mínimo
    maxFaceSize: 300, // px ancho máximo (muy cerca deforma)
    centerTolerance: 0.15, // |centro - mitad| < 15% del ancho
    samples: 5, // muestras buenas CONSECUTIVAS (estricto: 1 mala resetea)
  },
  probe: {
    minScore: 0.4,
    maxAngle: 20,
    minFaceSize: 120,
    maxFaceSize: 300,
    centerTolerance: 0.15,
    samples: 3, // por ventana
    windows: 2, // ventanas independientes (doble verificación)
  },
  light: {
    minMean: 35, // brillo medio mínimo: solo para escenas casi a oscuras
    maxClipLow: 0.15, // fracción máxima de píxeles casi negros (<20)
    maxClipHigh: 0.15, // fracción máxima de píxeles quemados (>240)
  },
} as const;

export interface EstadoLuz {
  mean: number; // brillo medio 0-255 (telemetría)
  clipLow: number; // 0-1, fracción de píxeles < 20
  clipHigh: number; // 0-1, fracción de píxeles > 240
}

export type FallaLuz = "POCA_LUZ" | "SOBREEXPUESTO" | null;

/** Decide si la iluminación del rostro es usable. null = OK. */
export function evaluarIluminacion(luz: EstadoLuz): FallaLuz {
  const L = FACE_QUALITY.light;
  if (luz.mean < L.minMean || luz.clipLow > L.maxClipLow) return "POCA_LUZ";
  if (luz.clipHigh > L.maxClipHigh) return "SOBREEXPUESTO";
  return null;
}
