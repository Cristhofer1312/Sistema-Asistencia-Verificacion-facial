// tests/face-precision.test.ts — Precisión anti-confusión (umbral 0.46 / margen 0.18 / promediado)
import { describe, it, expect } from 'vitest';
import { findBestMatchServer, agreeMatches, MATCH_DISTANCE_THRESHOLD, MATCH_AMBIGUITY_MARGIN } from '../lib/face-server';
import { averageDescriptors } from '../lib/descriptor-utils';
import { FACE_QUALITY } from '../lib/face-quality';
// NOTA: lib/face-api.ts re-exporta ambas constantes desde lib/face-server
// (fuente única); no se importa aquí porque face-api.js exige tfjs-node
// y no carga en el entorno Node de vitest.

const baseDescriptor = new Array(128).fill(0).map((_, i) => i * 0.01);

const atDistance = (targetDistance: number) => {
  const delta = targetDistance / Math.sqrt(128);
  return baseDescriptor.map((v) => v + delta);
};

const entry = (id: number, descriptor: number[]) => ({
  empleadoId: id,
  cedula: `V-${10000000 + id}`,
  nombre: 'Empleado',
  apellido: `${id}`,
  descriptor,
});

describe('umbrales centralizados', () => {
  it('umbral 0.46 y margen 0.18', () => {
    expect(MATCH_DISTANCE_THRESHOLD).toBe(0.46);
    expect(MATCH_AMBIGUITY_MARGIN).toBe(0.18);
  });

  it('la referencia enrolada exige >= calidad que el probe del kiosco', () => {
    expect(FACE_QUALITY.enroll.minBrightness).toBeGreaterThanOrEqual(FACE_QUALITY.probe.minBrightness);
    expect(FACE_QUALITY.enroll.minBrightness).toBeGreaterThanOrEqual(40);
    expect(FACE_QUALITY.enroll.minScore).toBeGreaterThanOrEqual(FACE_QUALITY.probe.minScore);
    expect(FACE_QUALITY.enroll.maxFaceSize).toBeLessThanOrEqual(300);
    expect(FACE_QUALITY.enroll.samples).toBeGreaterThanOrEqual(5);
  });
});

describe('findBestMatchServer — zona gris bajo el umbral rechaza', () => {
  it('distancia 0.52 (zona gris) → null', () => {
    const result = findBestMatchServer(baseDescriptor, [entry(1, atDistance(0.52))]);
    expect(result).toBeNull();
  });

  it('distancia 0.45 → match', () => {    const result = findBestMatchServer(baseDescriptor, [entry(1, atDistance(0.45))]);
    expect(result).not.toBeNull();
    expect(result!.entry.empleadoId).toBe(1);
  });

  it('segundo a +0.09 (zona gris de confusión por tono de piel) → ambiguo → null', () => {
    const result = findBestMatchServer(baseDescriptor, [
      entry(1, atDistance(0.3)),
      entry(2, atDistance(0.39)),
    ]);
    expect(result).toBeNull();
  });

  it('segundo a +0.12 (zona gris) → ambiguo → null', () => {
    const result = findBestMatchServer(baseDescriptor, [
      entry(1, atDistance(0.3)),
      entry(2, atDistance(0.42)),
    ]);
    expect(result).toBeNull();
  });

  it('segundo a +0.20 → match (margen 0.18 respetado)', () => {
    const result = findBestMatchServer(baseDescriptor, [
      entry(1, atDistance(0.3)),
      entry(2, atDistance(0.5)),
    ]);
    expect(result).not.toBeNull();
    expect(result!.entry.empleadoId).toBe(1);
  });

  it('retorna secondDistance del mejor candidato de otro empleado', () => {
    const result = findBestMatchServer(baseDescriptor, [
      entry(1, atDistance(0.3)),
      entry(2, atDistance(0.5)),
    ]);
    expect(result!.secondDistance).toBeCloseTo(0.5, 2);
  });

  it('secondDistance null si no hay otro empleado', () => {
    const result = findBestMatchServer(baseDescriptor, [entry(1, atDistance(0.3))]);
    expect(result!.secondDistance).toBeNull();
  });
});

describe('agreeMatches — doble verificación', () => {
  const m = (id: number, distance: number) => ({ entry: entry(id, atDistance(distance)), distance });

  it('ambos coinciden en el mismo empleado → acuerdo', () => {
    const agreed = agreeMatches(m(1, 0.35), m(1, 0.4));
    expect(agreed).not.toBeNull();
    expect(agreed!.entry.empleadoId).toBe(1);
  });

  it('discrepan de empleado → sin acuerdo (falso positivo inestable)', () => {
    expect(agreeMatches(m(1, 0.35), m(2, 0.38))).toBeNull();
  });

  it('alguno null → sin acuerdo', () => {
    expect(agreeMatches(m(1, 0.35), null)).toBeNull();
    expect(agreeMatches(null, m(1, 0.35))).toBeNull();
    expect(agreeMatches(null, null)).toBeNull();
  });

  it('retorna el de menor distancia', () => {
    const agreed = agreeMatches(m(1, 0.4), m(1, 0.35));
    expect(agreed!.distance).toBeCloseTo(0.35, 5);
  });
});

describe('averageDescriptors — promediado L2 del probe', () => {
  it('vacío → vector de ceros', () => {
    expect(Array.from(averageDescriptors([]))).toEqual(new Array(128).fill(0));
  });

  it('una muestra → copia renormalizada L2 (norma 1)', () => {
    const d = new Float32Array(atDistance(0.2));
    const avg = averageDescriptors([d]);
    let norm = 0;
    for (const v of avg) norm += v * v;
    expect(Math.sqrt(norm)).toBeCloseTo(1, 5);
  });

  it('promedio de dos opuestos simétricos ≈ base renormalizada', () => {
    const plus = new Float32Array(baseDescriptor.map((v) => v + 0.01));
    const minus = new Float32Array(baseDescriptor.map((v) => v - 0.01));
    const avg = averageDescriptors([plus, minus]);
    const base = new Float32Array(baseDescriptor);
    let norm = 0;
    for (const v of base) norm += v * v;
    const expected = base.map((v) => v / Math.sqrt(norm));
    for (let i = 0; i < 128; i++) {
      expect(avg[i]).toBeCloseTo(expected[i], 5);
    }
  });

  it('el promedio está más cerca del centro que una muestra ruidosa', () => {
    const truth = averageDescriptors([new Float32Array(baseDescriptor)]);
    const noisy = (shift: number) =>
      averageDescriptors([new Float32Array(baseDescriptor.map((v) => v + shift))]);
    const samples = [noisy(0.05), noisy(-0.05), noisy(0.05)];
    const avg = averageDescriptors(samples.map((s) => new Float32Array(s)));
    const dist = (a: Float32Array, b: Float32Array) => {
      let s = 0;
      for (let i = 0; i < 128; i++) s += (a[i] - b[i]) ** 2;
      return Math.sqrt(s);
    };
    expect(dist(avg, truth)).toBeLessThan(dist(samples[0], truth));
  });
});
