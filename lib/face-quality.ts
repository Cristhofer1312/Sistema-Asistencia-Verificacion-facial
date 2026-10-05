/**
 * lib/face-quality.ts — Puertas de calidad facial, FUENTE ÚNICA.
 * Las usan el registro (FaceEnroll) y el kiosco (FaceIdentify) en la misma
 * escala. Regla de oro: la referencia enrolada exige IGUAL O MÁS calidad
 * que el probe del kiosco, nunca menos (una referencia oscura/descentrada
 * es la que luego se confunde con otras personas).
 */

export const FACE_QUALITY = {
  enroll: {
    minScore: 0.6, // confianza del detector
    maxAngle: 20, // yaw/pitch grados
    minFaceSize: 120, // px ancho mínimo
    maxFaceSize: 300, // px ancho máximo (muy cerca deforma)
    minBrightness: 55, // Aumentado (antes 40) para forzar mejor luz y evitar confusiones en piel oscura
    maxBrightness: 240,
    centerTolerance: 0.15, // |centro - mitad| < 15% del ancho
    samples: 5, // muestras buenas CONSECUTIVAS (estricto: 1 mala resetea)
  },
  probe: {
    minScore: 0.4,
    maxAngle: 20,
    minFaceSize: 120,
    maxFaceSize: 300,
    minBrightness: 55, // Aumentado para evitar descriptores borrosos que causan confusiones
    maxBrightness: 240,
    centerTolerance: 0.15,
    samples: 3, // por ventana
    windows: 2, // ventanas independientes (doble verificación)
  },
} as const;
