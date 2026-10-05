// lib/face-cache.ts — Caché en memoria de descriptores faciales
import { PrismaClient } from "@prisma/client";
import { bufferToDescriptor, descriptorToArray } from "./descriptor-utils";

export interface DescriptorEntry {
  empleadoId: number;
  cedula: string;
  nombre: string;
  apellido: string;
  descriptor: number[];
}

const globalForFaceCache = globalThis as unknown as { 
  descriptorsCache?: DescriptorEntry[] | null;
  cacheVersion?: number;
};

export function getDescriptorsCache(): DescriptorEntry[] {
  return globalForFaceCache.descriptorsCache ?? [];
}

export function getCacheVersion(): number {
  return globalForFaceCache.cacheVersion ?? 0;
}

export async function refreshDescriptorsCache(prisma: PrismaClient): Promise<void> {
  const empleados = await prisma.empleado.findMany({
    where: { activo: true, descriptor: { not: null } },
    select: { id: true, cedula: true, nombre: true, apellido: true, descriptor: true },
  });

  globalForFaceCache.descriptorsCache = empleados
    .filter((e) => e.descriptor)
    .map((e) => ({
      empleadoId: e.id,
      cedula: e.cedula,
      nombre: e.nombre,
      apellido: e.apellido,
      descriptor: descriptorToArray(bufferToDescriptor(Buffer.from(e.descriptor!))),
    }));
  globalForFaceCache.cacheVersion = (globalForFaceCache.cacheVersion ?? 0) + 1;
}

export function invalidateDescriptorsCache(): void {
  globalForFaceCache.descriptorsCache = null;
  globalForFaceCache.cacheVersion = (globalForFaceCache.cacheVersion ?? 0) + 1;
}

// Solo para testing: reset completo del estado
export function __resetCacheForTesting(): void {
  globalForFaceCache.descriptorsCache = null;
  globalForFaceCache.cacheVersion = 0;
}