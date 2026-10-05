/**
 * Helpers para carga y uso de face-api.js
 * Centraliza la configuración de modelos
 */

import * as faceapi from '@vladmandic/face-api';

// Umbrales centralizados en lib/face-server.ts (fuente única, sin duplicar).
// Se re-exportan aquí por compatibilidad con importadores existentes.
import { MATCH_DISTANCE_THRESHOLD, MATCH_AMBIGUITY_MARGIN } from './face-server';
export { MATCH_DISTANCE_THRESHOLD, MATCH_AMBIGUITY_MARGIN };

const MODEL_URL = '/models';

export const FACE_API_CONFIG = {
  // Tiny Face Detector - rápido y ligero para kiosco
  tinyFaceDetectorOptions: new faceapi.TinyFaceDetectorOptions({
    inputSize: 416,
    scoreThreshold: 0.2, // Umbral muy bajo para que la cámara "vea" el rostro aunque haya sombras o pelo
  }),
  // Para enrolamiento (máxima precisión, el performance no importa aquí)
  tinyFaceDetectorOptionsEnroll: new faceapi.TinyFaceDetectorOptions({
    inputSize: 864,
    scoreThreshold: 0.5,
  }),
};

let modelsLoaded = false;

/**
 * Carga todos los modelos necesarios
 * Debe llamarse una vez al montar la app/componente
 */
export async function loadFaceApiModels(): Promise<void> {
  if (modelsLoaded) return;
  
  // 1. Forzar el uso de WebGL para aceleración por GPU (maximiza potencia de cálculo)
  try {
    await faceapi.tf.setBackend('webgl');
    await faceapi.tf.ready();
  } catch (e) {
    console.warn("[FaceAPI] WebGL no disponible, usando backend de respaldo", e);
  }

  // 2. Cargar modelos
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
  
  modelsLoaded = true;
}

/**
 * Verifica si los modelos están cargados
 */
export function areModelsLoaded(): boolean {
  return modelsLoaded;
}

/**
 * Convierte descriptor Float32Array a array para JSON/BD
 */
export function descriptorToArray(descriptor: Float32Array): number[] {
  return Array.from(descriptor);
}

/**
 * Convierte array a Float32Array
 */
export function arrayToDescriptor(arr: number[]): Float32Array {
  return new Float32Array(arr);
}

/**
 * Convierte descriptor a Buffer para Prisma (Bytes/Bytea)
 */
export function descriptorToBuffer(descriptor: Float32Array): Buffer {
  return Buffer.from(descriptor.buffer);
}

/**
 * Convierte Buffer de Prisma a Float32Array
 * IMPORTANTE: Buffer.buffer puede apuntar al pool interno de Node.js con byteOffset != 0.
 * Usar .slice() garantiza un ArrayBuffer propio y alineado.
 */
export function bufferToDescriptor(buffer: Buffer): Float32Array {
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return new Float32Array(ab);
}

/**
 * Calcula distancia coseno entre dos descriptores (0 = idéntico, 1 = opuesto)
 * Threshold recomendado: < 0.5 para match
 */
export function cosineDistance(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < 128; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return 1 - dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Distancia euclidiana entre descriptores (métrica nativa de face-api/dlib).
 * Misma persona: ~0.3-0.5 · personas distintas: normalmente > 0.6
 */
export function euclideanDistance(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < 128; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * Encuentra el mejor match 1:N en array de descriptores.
 * Retorna null si ninguno está bajo el umbral o si el resultado es ambiguo
 * (otro empleado queda casi igual de cerca).
 */
export function findBestMatch(
  descriptor: Float32Array, 
  entries: Array<{ empleadoId: number; descriptor: number[]; [key: string]: any }>,
  threshold = MATCH_DISTANCE_THRESHOLD,
  margin = MATCH_AMBIGUITY_MARGIN
): { entry: any; distance: number } | null {
  let best: { entry: any; distance: number } | null = null;
  let secondOther = Infinity; // mejor distancia de un empleado distinto al mejor

  for (const entry of entries) {
    if (!entry.descriptor || entry.descriptor.length !== 128) continue;
    const dist = euclideanDistance(descriptor, new Float32Array(entry.descriptor));
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

/**
 * Versión server-side: encuentra el mejor match 1:N usando arrays planos.
 * No depende de face-api.js, solo de euclideanDistance.
 */
export function findBestMatchServer(
  descriptor: number[], 
  entries: Array<{ empleadoId: number; descriptor: number[]; [key: string]: any }>,
  threshold = MATCH_DISTANCE_THRESHOLD,
  margin = MATCH_AMBIGUITY_MARGIN
): { entry: any; distance: number } | null {
  let best: { entry: any; distance: number } | null = null;
  let secondOther = Infinity;

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
 * Calcula Eye Aspect Ratio (EAR) para detectar parpadeo
 * EAR < 0.25 ≈ ojo cerrado
 */
export function calculateEAR(eye: faceapi.Point[]): number {
  // EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
  const v1 = distance(eye[1], eye[5]);
  const v2 = distance(eye[2], eye[4]);
  const h = distance(eye[0], eye[3]);
  return (v1 + v2) / (2 * h);
}

/**
 * Distancia euclidiana entre dos puntos
 */
function distance(p1: faceapi.Point, p2: faceapi.Point): number {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

/**
 * Estima pose de cabeza (yaw, pitch) usando landmarks
 * Retorna grados — 0° = frontal, ± = giro/inclinación
 * Usa distancia inter-ocular como escala invariante
 */
export function estimateHeadPose(landmarks: faceapi.FaceLandmarks68): { yaw: number; pitch: number } {
  const nose = landmarks.getNose()[3]; // punta nariz
  const leftEye = landmarks.getLeftEye()[0];
  const rightEye = landmarks.getRightEye()[0];
  const chin = landmarks.getJawOutline()[8]; // barbilla
  
  const eyeCenterX = (leftEye.x + rightEye.x) / 2;
  const eyeCenterY = (leftEye.y + rightEye.y) / 2;
  
  // Distancia inter-ocular como escala (invariante a distancia/zoom)
  const eyeDist = Math.hypot(leftEye.x - rightEye.x, leftEye.y - rightEye.y);
  const scale = eyeDist || 1;
  
  // Yaw: desplazamiento horizontal nariz vs centro ojos, normalizado por escala
  // De frente nose.x ≈ eyeCenterX → yaw ≈ 0°
  const yaw = Math.atan2(nose.x - eyeCenterX, scale) * 180 / Math.PI;
  
  // Pitch: desplazamiento vertical nariz vs centro ojos, normalizado
  // Offset empírico: de frente nose.y está ~0.6*eyeDist debajo del centro ojos
  const pitch = Math.atan2(nose.y - eyeCenterY - 0.6 * scale, scale) * 180 / Math.PI;
  
  return { yaw, pitch };
}

/**
 * Estima brillo promedio en región del rostro (0-255)
 */
export function estimateBrightness(video: HTMLVideoElement, box: faceapi.Box): number {
  const tempCanvas = document.createElement('canvas');
  const ctx = tempCanvas.getContext('2d')!;
  const scale = 0.25;
  tempCanvas.width = box.width * scale;
  tempCanvas.height = box.height * scale;
  ctx.drawImage(video, box.x, box.y, box.width, box.height, 0, 0, tempCanvas.width, tempCanvas.height);
  const data = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height).data;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return sum / (data.length / 4);
}

/**
 * Genera preview del rostro recortado 128x128 para UI
 */
export function generateFacePreview(
  video: HTMLVideoElement, 
  box: faceapi.Box
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  
  // Expandir box 20% y centrar
  const size = Math.max(box.width, box.height) * 1.2;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const sx = cx - size / 2;
  const sy = cy - size / 2;
  
  ctx.drawImage(video, sx, sy, size, size, 0, 0, 128, 128);
  return canvas;
}