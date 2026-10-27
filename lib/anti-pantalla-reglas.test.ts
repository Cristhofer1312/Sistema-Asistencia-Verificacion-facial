// anti-pantalla-reglas.test.ts — Decodificación de COCO-SSD, rostro dentro de dispositivo y validación del payload
import { describe, it, expect } from 'vitest';
import {
  ANTI_PANTALLA,
  extraerDispositivos,
  fraccionDentro,
  dispositivoSobreRostro,
  validarRevisionPantalla,
  etiquetaDispositivo,
  type DispositivoDetectado,
} from './anti-pantalla-reglas';

const NUM_CLASES = 90; // salida de SSDLite MobileNet v2 (COCO)
const CANAL_CELULAR = 76;
const CANAL_TV = 71;
const CANAL_PERSONA = 0;

/** Arma la salida cruda del modelo: una fila de scores y una caja [minY,minX,maxY,maxX] por detección. */
function salidaModelo(filas: { canal: number; score: number; caja: [number, number, number, number] }[]) {
  const scores = new Float32Array(filas.length * NUM_CLASES);
  const cajas = new Float32Array(filas.length * 4);
  filas.forEach((f, i) => {
    scores[i * NUM_CLASES + f.canal] = f.score;
    cajas.set(f.caja, i * 4);
  });
  return { scores, cajas, numCajas: filas.length };
}

describe('extraerDispositivos', () => {
  it('decodifica un celular con la caja en píxeles (formato de coco-ssd)', () => {
    const { scores, cajas, numCajas } = salidaModelo([{ canal: CANAL_CELULAR, score: 0.8, caja: [0.25, 0.5, 0.75, 0.75] }]);
    const r = extraerDispositivos(scores, cajas, numCajas, NUM_CLASES, 640, 480);
    expect(r).toHaveLength(1);
    expect(r[0].clase).toBe('cell phone');
    expect(r[0].score).toBeCloseTo(0.8);
    expect(r[0].caja).toEqual({ x: 320, y: 120, width: 160, height: 240 });
  });

  it('ignora clases que no son dispositivos (persona)', () => {
    const { scores, cajas, numCajas } = salidaModelo([{ canal: CANAL_PERSONA, score: 0.99, caja: [0, 0, 1, 1] }]);
    expect(extraerDispositivos(scores, cajas, numCajas, NUM_CLASES, 640, 480)).toEqual([]);
  });

  it('descarta dispositivos bajo la confianza mínima', () => {
    const { scores, cajas, numCajas } = salidaModelo([{ canal: CANAL_TV, score: ANTI_PANTALLA.minScore - 0.01, caja: [0, 0, 1, 1] }]);
    expect(extraerDispositivos(scores, cajas, numCajas, NUM_CLASES, 640, 480)).toEqual([]);
  });

  it('ordena por confianza descendente', () => {
    const { scores, cajas, numCajas } = salidaModelo([
      { canal: CANAL_TV, score: 0.5, caja: [0, 0, 0.5, 0.5] },
      { canal: CANAL_CELULAR, score: 0.9, caja: [0.5, 0.5, 1, 1] },
    ]);
    const r = extraerDispositivos(scores, cajas, numCajas, NUM_CLASES, 100, 100);
    expect(r.map((d) => d.clase)).toEqual(['cell phone', 'tv']);
  });
});

describe('dispositivoSobreRostro', () => {
  const rostro = { x: 260, y: 140, width: 120, height: 140 };
  const disp = (clase: string, score: number, caja: DispositivoDetectado['caja']): DispositivoDetectado => ({ clase, score, caja });

  it('rostro mostrado en un celular → detectado', () => {
    const celular = disp('cell phone', 0.7, { x: 230, y: 90, width: 180, height: 300 });
    expect(fraccionDentro(rostro, celular.caja)).toBe(1);
    expect(dispositivoSobreRostro(rostro, [celular])).toBe(celular);
  });

  it('celular en la mano, lejos del rostro → no bloquea', () => {
    const celular = disp('cell phone', 0.9, { x: 40, y: 330, width: 70, height: 120 });
    expect(dispositivoSobreRostro(rostro, [celular])).toBeNull();
  });

  it('solape parcial menor al mínimo → no bloquea', () => {
    // Cubre el 25% del ancho del rostro
    const celular = disp('cell phone', 0.9, { x: 350, y: 100, width: 100, height: 250 });
    expect(fraccionDentro(rostro, celular.caja)).toBeCloseTo(0.25);
    expect(dispositivoSobreRostro(rostro, [celular])).toBeNull();
  });

  it('con varios dispositivos sobre el rostro devuelve el de mayor confianza', () => {
    const tv = disp('tv', 0.5, { x: 0, y: 0, width: 640, height: 480 });
    const celular = disp('cell phone', 0.8, { x: 230, y: 90, width: 180, height: 300 });
    expect(dispositivoSobreRostro(rostro, [tv, celular])).toBe(celular);
  });

  it('rostro de área cero → nunca detectado', () => {
    expect(fraccionDentro({ x: 0, y: 0, width: 0, height: 10 }, { x: 0, y: 0, width: 100, height: 100 })).toBe(0);
  });
});

describe('validarRevisionPantalla', () => {
  it('falla cerrado si falta la revisión', () => {
    expect(validarRevisionPantalla(undefined).ok).toBe(false);
    expect(validarRevisionPantalla(null).ok).toBe(false);
  });

  it('rechaza una revisión que no se ejecutó', () => {
    expect(validarRevisionPantalla({ revisado: false, detectado: false, revisiones: 0 }).ok).toBe(false);
    expect(validarRevisionPantalla({ revisado: true, detectado: false, revisiones: 0 }).ok).toBe(false);
    expect(validarRevisionPantalla({ revisado: true, detectado: false, revisiones: 1.5 }).ok).toBe(false);
  });

  it('rechaza detectado no booleano', () => {
    expect(validarRevisionPantalla({ revisado: true, detectado: 'no', revisiones: 2 }).ok).toBe(false);
  });

  it('acepta una revisión limpia y una con detección', () => {
    const limpia = validarRevisionPantalla({ revisado: true, detectado: false, revisiones: 3 });
    expect(limpia).toEqual({ ok: true, revision: { revisado: true, detectado: false, revisiones: 3, clase: undefined, score: undefined } });

    const conDetec = validarRevisionPantalla({ revisado: true, detectado: true, revisiones: 1, clase: 'cell phone', score: 0.83 });
    expect(conDetec.ok && conDetec.revision).toMatchObject({ detectado: true, clase: 'cell phone', score: 0.83 });
  });
});

describe('etiquetaDispositivo', () => {
  it('usa el artículo correcto y un genérico si la clase es desconocida', () => {
    expect(etiquetaDispositivo('cell phone')).toBe('un celular');
    expect(etiquetaDispositivo('tv')).toBe('una pantalla');
    expect(etiquetaDispositivo(undefined)).toBe('un celular o pantalla');
  });
});
