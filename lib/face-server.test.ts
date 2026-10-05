// lib/face-server.test.ts — Unit tests para matching facial server-side
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { euclideanDistanceServer, findBestMatchServer, MATCH_DISTANCE_THRESHOLD, MATCH_AMBIGUITY_MARGIN } from './face-server';

describe('face-server — Matching 1:N', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper: vector base simple para tests controlados
  const baseDescriptor = new Array(128).fill(0).map((_, i) => i * 0.01); // 0, 0.01, 0.02, ... 1.27
  
  // Helper: crear descriptor a distancia euclidiana exacta del base
  // Para vector base, variar cada componente por delta = distance / sqrt(128)
  const createDescriptorAtDistance = (targetDistance: number) => {
    const delta = targetDistance / Math.sqrt(128);
    return baseDescriptor.map(v => v + delta);
  };

  const createEntry = (id: number, descriptor: number[]) => ({
    empleadoId: id,
    cedula: `V-${10000000 + id}`,
    nombre: `Empleado`,
    apellido: `${id}`,
    descriptor,
  });

  describe('euclideanDistanceServer', () => {
    it('devuelve 0 para vectores idénticos', () => {
      const dist = euclideanDistanceServer(baseDescriptor, baseDescriptor);
      expect(dist).toBe(0);
    });

    it('es simétrica', () => {
      const d1 = createDescriptorAtDistance(0.1);
      const d2 = createDescriptorAtDistance(0.2);
      const dist1 = euclideanDistanceServer(d1, d2);
      const dist2 = euclideanDistanceServer(d2, d1);
      expect(dist1).toBeCloseTo(dist2, 10);
    });

    it('aumenta con mayor diferencia', () => {
      const distClose = euclideanDistanceServer(baseDescriptor, createDescriptorAtDistance(0.1));
      const distFar = euclideanDistanceServer(baseDescriptor, createDescriptorAtDistance(0.5));
      expect(distFar).toBeGreaterThan(distClose);
    });

    it('distancia conocida: delta constante da distancia exacta', () => {
      const d = createDescriptorAtDistance(0.5);
      const dist = euclideanDistanceServer(baseDescriptor, d);
      expect(dist).toBeCloseTo(0.5, 2);
    });
  });

  describe('findBestMatchServer', () => {
    const threshold = MATCH_DISTANCE_THRESHOLD; // 0.5
    const margin = MATCH_AMBIGUITY_MARGIN; // 0.18

    it('retorna match cuando un descriptor está bajo el umbral', () => {
      const entries = [
        createEntry(1, createDescriptorAtDistance(0.2)), // dist ~0.2
        createEntry(2, createDescriptorAtDistance(0.7)), // dist ~0.7
      ];
      const result = findBestMatchServer(baseDescriptor, entries, threshold, margin);
      
      expect(result).not.toBeNull();
      expect(result!.entry.empleadoId).toBe(1);
      expect(result!.distance).toBeLessThan(threshold);
    });

    it('retorna null si todos están sobre el umbral', () => {
      const entries = [
        createEntry(1, createDescriptorAtDistance(0.6)),
        createEntry(2, createDescriptorAtDistance(0.8)),
      ];
      const result = findBestMatchServer(baseDescriptor, entries, threshold, margin);
      
      expect(result).toBeNull();
    });

    it('retorna null si hay ambigüedad (dos empleados muy cerca)', () => {
      const entries = [
        createEntry(1, createDescriptorAtDistance(0.2)), // dist ~0.2
        createEntry(2, createDescriptorAtDistance(0.22)), // dist ~0.22 → diff 0.02 < margin
      ];
      const result = findBestMatchServer(baseDescriptor, entries, threshold, margin);
      
      expect(result).toBeNull();
    });

    it('retorna match si el segundo está suficientemente lejos (margin respetado)', () => {
      const entries = [
        createEntry(1, createDescriptorAtDistance(0.15)), // dist ~0.15
        createEntry(2, createDescriptorAtDistance(0.35)),  // dist ~0.35 → diff 0.20 > margin
      ];
      const result = findBestMatchServer(baseDescriptor, entries, threshold, margin);
      
      expect(result).not.toBeNull();
      expect(result!.entry.empleadoId).toBe(1);
    });

    it('ignora entradas con descriptor inválido (longitud ≠ 128)', () => {
      const entries = [
        createEntry(1, createDescriptorAtDistance(0.2)),
        { ...createEntry(2, baseDescriptor), descriptor: baseDescriptor.slice(0, 10) },
        { ...createEntry(3, baseDescriptor), descriptor: null as any },
      ];
      const result = findBestMatchServer(baseDescriptor, entries, threshold, margin);
      
      expect(result).not.toBeNull();
      expect(result!.entry.empleadoId).toBe(1);
    });

    it('retorna el más cercano cuando hay múltiples candidatos válidos', () => {
      const entries = [
        createEntry(1, createDescriptorAtDistance(0.35)), // dist ~0.35
        createEntry(2, createDescriptorAtDistance(0.1)), // dist ~0.1 → mejor (diff 0.25 > margin)
        createEntry(3, createDescriptorAtDistance(0.4)), // dist ~0.4
      ];
      const result = findBestMatchServer(baseDescriptor, entries, threshold, margin);
      
      expect(result).not.toBeNull();
      expect(result!.entry.empleadoId).toBe(2);
    });

    it('funciona con array vacío', () => {
      const result = findBestMatchServer(baseDescriptor, [], threshold, margin);
      expect(result).toBeNull();
    });

    it('permite override de threshold y margin', () => {
      const entries = [
        createEntry(1, createDescriptorAtDistance(0.55)), // dist ~0.55
      ];
      // Con threshold alto (0.6) debería matchar
      const resultHigh = findBestMatchServer(baseDescriptor, entries, 0.6, margin);
      expect(resultHigh).not.toBeNull();
      
      // Con threshold bajo (0.4) NO debería matchar
      const resultLow = findBestMatchServer(baseDescriptor, entries, 0.4, margin);
      expect(resultLow).toBeNull();
    });
  });
});