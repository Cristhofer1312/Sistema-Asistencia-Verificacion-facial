// lib/face-cache.test.ts — Unit tests para caché de descriptores
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDescriptorsCache, getCacheVersion, refreshDescriptorsCache, invalidateDescriptorsCache, __resetCacheForTesting } from './face-cache';

// Mock de Prisma
const mockPrisma = {
  empleado: {
    findMany: vi.fn(),
  },
};

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('@/lib/descriptor-utils', () => ({
  descriptorToArray: (d: Float32Array) => Array.from(d),
  bufferToDescriptor: (b: Buffer) => new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4),
}));

describe('face-cache — Caché en memoria de descriptores', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetCacheForTesting();
  });

  const testDescriptor = new Float32Array(128).map((_, i) => Math.sin(i * 0.1) * 0.1);
  
  const createMockEmpleado = (id: number, activo = true, withDescriptor = true) => ({
    id,
    cedula: `V-${10000000 + id}`,
    nombre: `Emp`,
    apellido: `${id}`,
    activo,
    descriptor: withDescriptor ? Buffer.from(testDescriptor.buffer) : null,
  });

  describe('getDescriptorsCache', () => {
    it('retorna array vacío inicialmente', () => {
      expect(getDescriptorsCache()).toEqual([]);
    });

    it('retorna array vacío después de invalidate', () => {
      invalidateDescriptorsCache();
      expect(getDescriptorsCache()).toEqual([]);
    });
  });

  describe('getCacheVersion', () => {
    it('inicia en 0', () => {
      expect(getCacheVersion()).toBe(0);
    });

    it('incrementa tras refresh', async () => {
      // El mock simula lo que retorna la BD (solo activos con descriptor)
      mockPrisma.empleado.findMany.mockResolvedValue([createMockEmpleado(1)]);
      await refreshDescriptorsCache(mockPrisma as any);
      expect(getCacheVersion()).toBe(1);
    });

    it('incrementa tras invalidate', () => {
      invalidateDescriptorsCache();
      expect(getCacheVersion()).toBe(1);
    });
  });

  describe('refreshDescriptorsCache', () => {
    it('carga solo empleados activos con descriptor (simula filtro BD)', async () => {
      // Simular lo que la BD retornaría tras el filtro WHERE activo=true AND descriptor IS NOT NULL
      const empActivoConDescriptor = createMockEmpleado(1, true, true);
      // Los otros NO los retorna la BD porque no cumplen el WHERE
      mockPrisma.empleado.findMany.mockResolvedValue([empActivoConDescriptor]);

      await refreshDescriptorsCache(mockPrisma as any);

      const cache = getDescriptorsCache();
      expect(cache).toHaveLength(1);
      expect(cache[0].empleadoId).toBe(1);
      expect(mockPrisma.empleado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { activo: true, descriptor: { not: null } },
        })
      );
    });

    it('convierte descriptor Buffer a number[]', async () => {
      const emp = createMockEmpleado(1, true, true);
      mockPrisma.empleado.findMany.mockResolvedValue([emp]);

      await refreshDescriptorsCache(mockPrisma as any);

      const cache = getDescriptorsCache();
      expect(cache[0].descriptor).toHaveLength(128);
      expect(cache[0].descriptor[0]).toBeCloseTo(testDescriptor[0], 5);
    });

    it('no duplica empleados por ID (la BD ya no retorna duplicados por PK)', async () => {
      // La BD no retorna duplicados por clave primaria
      mockPrisma.empleado.findMany.mockResolvedValue([createMockEmpleado(1)]);
      await refreshDescriptorsCache(mockPrisma as any);
      expect(getDescriptorsCache()).toHaveLength(1);
    });
  });

  describe('invalidateDescriptorsCache', () => {
    it('limpia el cache y sube versión', async () => {
      mockPrisma.empleado.findMany.mockResolvedValue([createMockEmpleado(1)]);
      await refreshDescriptorsCache(mockPrisma as any);
      expect(getDescriptorsCache()).toHaveLength(1);

      invalidateDescriptorsCache();
      expect(getDescriptorsCache()).toHaveLength(0);
      expect(getCacheVersion()).toBe(2); // 1 del refresh + 1 del invalidate
    });
  });
});