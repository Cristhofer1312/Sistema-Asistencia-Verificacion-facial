/**
 * lib/anti-pantalla-reglas.ts — Reglas del detector de celulares y pantallas
 * (anti-suplantación del kiosco). Módulo puro: sin TensorFlow ni DOM, lo usan
 * el kiosco (lib/anti-pantalla.ts), el servidor (match) y los tests.
 *
 * El kiosco corre COCO-SSD (SSDLite MobileNet v2) sobre el cuadro de la cámara.
 * Si el rostro detectado queda DENTRO de un celular, televisor o laptop, la
 * cara se está mostrando en un dispositivo y el marcaje se rechaza. Un
 * celular en la mano o en el bolsillo (fuera del rostro) no bloquea.
 *
 * Limitación importante (medida con composiciones el 2026-10-27): el modelo
 * reconoce el celular cuando el rostro ocupa una parte de su pantalla, pero NO
 * cuando el rostro la llena (el celular acercado a la cámara para que la cara
 * alcance el tamaño mínimo del kiosco), ni bajando minScore a 0.15. Este
 * detector frena intentos casuales, no a un atacante que acerque el celular.
 * Tampoco debe haber televisores o monitores detrás del área de marcaje: un
 * rostro delante de uno se rechaza.
 */

export const ANTI_PANTALLA = {
  /** Pesos servidos por scripts/copiar-modelos.mjs (no se versionan). */
  modeloUrl: '/models/coco-ssd/model.json',
  /**
   * Canal de salida del modelo -> clase. El canal es el id COCO - 1
   * (classes.js de @tensorflow-models/coco-ssd: tv=72, laptop=73, cell phone=77).
   */
  clases: { 71: 'tv', 72: 'laptop', 76: 'cell phone' } as Readonly<Record<number, string>>,
  /** Confianza mínima del detector para considerar un dispositivo. */
  minScore: 0.4,
  /** Fracción del área del rostro que debe caer dentro del dispositivo. */
  minSolape: 0.5,
};

/** Canales de salida de los dispositivos, en el orden en que se filtran en la GPU. */
export const CANALES_DISPOSITIVO: readonly number[] = Object.keys(ANTI_PANTALLA.clases).map(Number);

/** Nombre con artículo para los mensajes: "Se detectó un celular…". */
export const ETIQUETA_DISPOSITIVO: Readonly<Record<string, string>> = {
  'cell phone': 'un celular',
  tv: 'una pantalla',
  laptop: 'una laptop',
};

export function etiquetaDispositivo(clase: string | undefined): string {
  return ETIQUETA_DISPOSITIVO[clase ?? ''] ?? 'un celular o pantalla';
}

export interface Caja {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DispositivoDetectado {
  clase: string;
  score: number;
  caja: Caja;
}

/** Resultado de la revisión que el kiosco envía al servidor junto al probe. */
export interface RevisionPantalla {
  revisado: boolean;
  detectado: boolean;
  revisiones: number;
  clase?: string;
  score?: number;
}

/**
 * Decodifica la salida de COCO-SSD (igual que buildDetectedObjects del
 * paquete oficial) quedándose solo con las clases de dispositivos.
 * - scores: [numCajas × canales.length]; la columna j es el canal canales[j].
 *   El kiosco filtra en la GPU y pasa CANALES_DISPOSITIVO (3 columnas en vez de 90).
 * - cajas:  [numCajas × 4] normalizadas como [minY, minX, maxY, maxX]
 * No aplica NMS: alcanza con saber si alguna caja cubre el rostro.
 */
export function extraerDispositivos(
  scores: ArrayLike<number>,
  cajas: ArrayLike<number>,
  numCajas: number,
  canales: readonly number[],
  ancho: number,
  alto: number,
  minScore: number = ANTI_PANTALLA.minScore,
): DispositivoDetectado[] {
  const encontrados: DispositivoDetectado[] = [];
  const columnas = canales.length;
  for (let i = 0; i < numCajas; i++) {
    let mejorCanal = -1;
    let mejorScore = minScore;
    for (let j = 0; j < columnas; j++) {
      const canal = canales[j];
      if (!(canal in ANTI_PANTALLA.clases)) continue;
      const s = scores[i * columnas + j];
      if (s >= mejorScore) {
        mejorScore = s;
        mejorCanal = canal;
      }
    }
    if (mejorCanal < 0) continue;
    const minY = cajas[i * 4] * alto;
    const minX = cajas[i * 4 + 1] * ancho;
    const maxY = cajas[i * 4 + 2] * alto;
    const maxX = cajas[i * 4 + 3] * ancho;
    encontrados.push({
      clase: ANTI_PANTALLA.clases[mejorCanal],
      score: mejorScore,
      caja: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    });
  }
  return encontrados.sort((a, b) => b.score - a.score);
}

/** Fracción del área del rostro que queda dentro de la caja del dispositivo (0-1). */
export function fraccionDentro(rostro: Caja, dispositivo: Caja): number {
  const areaRostro = rostro.width * rostro.height;
  if (areaRostro <= 0) return 0;
  const ancho = Math.min(rostro.x + rostro.width, dispositivo.x + dispositivo.width) - Math.max(rostro.x, dispositivo.x);
  const alto = Math.min(rostro.y + rostro.height, dispositivo.y + dispositivo.height) - Math.max(rostro.y, dispositivo.y);
  if (ancho <= 0 || alto <= 0) return 0;
  return (ancho * alto) / areaRostro;
}

/** Dispositivo (el de mayor confianza) que contiene el rostro, o null. */
export function dispositivoSobreRostro(
  rostro: Caja,
  dispositivos: DispositivoDetectado[],
  minSolape: number = ANTI_PANTALLA.minSolape,
): DispositivoDetectado | null {
  let mejor: DispositivoDetectado | null = null;
  for (const d of dispositivos) {
    if (fraccionDentro(rostro, d.caja) < minSolape) continue;
    if (!mejor || d.score > mejor.score) mejor = d;
  }
  return mejor;
}

/**
 * Valida el campo `pantalla` del payload de /api/kiosco/match. Falla cerrado:
 * un kiosco que no revisó (o no envía la revisión) no puede fichar.
 */
export function validarRevisionPantalla(
  valor: unknown,
): { ok: true; revision: RevisionPantalla } | { ok: false; error: string } {
  if (!valor || typeof valor !== 'object') {
    return { ok: false, error: 'falta la verificación de celulares/pantallas' };
  }
  const v = valor as Record<string, unknown>;
  if (v.revisado !== true || typeof v.revisiones !== 'number' || !Number.isInteger(v.revisiones) || v.revisiones < 1) {
    return { ok: false, error: 'la verificación de celulares/pantallas no se ejecutó' };
  }
  if (typeof v.detectado !== 'boolean') {
    return { ok: false, error: 'verificación de celulares/pantallas inválida' };
  }
  return {
    ok: true,
    revision: {
      revisado: true,
      detectado: v.detectado,
      revisiones: v.revisiones,
      clase: typeof v.clase === 'string' ? v.clase.slice(0, 20) : undefined,
      score: typeof v.score === 'number' && Number.isFinite(v.score) ? v.score : undefined,
    },
  };
}
