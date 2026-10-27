/**
 * lib/anti-pantalla.ts — Detector de celulares y pantallas para el kiosco.
 * Corre COCO-SSD con el TensorFlow.js que ya trae @vladmandic/face-api (no se
 * carga una segunda copia de tf). Reglas y umbrales en lib/anti-pantalla-reglas.ts.
 */

import * as faceapi from '@vladmandic/face-api';
import { ANTI_PANTALLA, CANALES_DISPOSITIVO, extraerDispositivos, type DispositivoDetectado } from './anti-pantalla-reglas';

type FuenteImagen = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;

// Subconjunto de tf que se usa aquí; los tipos del bundle de face-api no lo declaran.
interface Tensor {
  shape: number[];
  data(): Promise<ArrayLike<number>>;
  dispose(): void;
}
interface GraphModel {
  executeAsync(entrada: Tensor): Promise<Tensor[]>;
}
interface Tf {
  loadGraphModel(url: string): Promise<GraphModel>;
  browser: { fromPixels(fuente: FuenteImagen): Tensor };
  expandDims(t: Tensor): Tensor;
  gather(t: Tensor, indices: number[], eje: number): Tensor;
  zeros(forma: number[], dtype: string): Tensor;
  tidy<T>(fn: () => T): T;
  dispose(t: Tensor[]): void;
}

const tf = faceapi.tf as unknown as Tf;

let modelo: GraphModel | null = null;
let cargando: Promise<void> | null = null;

/** Carga el modelo una sola vez y lo "calienta" (la primera inferencia compila shaders WebGL). */
export function cargarDetectorPantallas(): Promise<void> {
  if (modelo) return Promise.resolve();
  if (!cargando) {
    cargando = (async () => {
      const m = await tf.loadGraphModel(ANTI_PANTALLA.modeloUrl);
      const prueba = tf.zeros([1, 300, 300, 3], 'int32');
      try {
        tf.dispose(await m.executeAsync(prueba));
      } finally {
        prueba.dispose();
      }
      modelo = m;
    })().catch((e) => {
      cargando = null; // permitir reintento
      throw e;
    });
  }
  return cargando;
}

/** Celulares, televisores y laptops visibles en el cuadro (del video o una imagen). */
export async function detectarDispositivos(fuente: FuenteImagen): Promise<DispositivoDetectado[]> {
  if (!modelo) throw new Error('Detector de pantallas no cargado');
  const entrada = tf.tidy(() => tf.expandDims(tf.browser.fromPixels(fuente)));
  const [, alto, ancho] = entrada.shape;
  try {
    const salida = await modelo.executeAsync(entrada);
    // Se filtran en la GPU las 3 clases de dispositivos: se copian a la CPU
    // ~1.900 × 3 puntajes en vez de ~1.900 × 90 (unos 700 KB por revisión).
    const scoresDisp = tf.gather(salida[0], [...CANALES_DISPOSITIVO], 2);
    try {
      const [scores, cajas] = await Promise.all([scoresDisp.data(), salida[1].data()]);
      return extraerDispositivos(scores, cajas, salida[0].shape[1], CANALES_DISPOSITIVO, ancho, alto);
    } finally {
      scoresDisp.dispose();
      tf.dispose(salida);
    }
  } finally {
    entrada.dispose();
  }
}
