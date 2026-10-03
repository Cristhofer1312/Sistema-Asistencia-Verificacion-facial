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

let descriptorsCache: DescriptorEntry[] | null = null;
let cacheVersion = 0;

export function getDescriptorsCache(): DescriptorEntry[] {
  return descriptorsCache ?? [];
}

export function getCacheVersion(): number {
  return cacheVersion;
}

export async function refreshDescriptorsCache(prisma: PrismaClient): Promise<void> {
  const empleados = await prisma.empleado.findMany({
    where: { activo: true, descriptor: { not: null } },
    select: { id: true, cedula: true, nombre: true, apellido: true, descriptor: true },
  });

  descriptorsCache = empleados
    .filter((e) => e.descriptor)
    .map((e) => ({
      empleadoId: e.id,
      cedula: e.cedula,
      nombre: e.nombre,
      apellido: e.apellido,
      descriptor: descriptorToArray(bufferToDescriptor(Buffer.from(e.descriptor!))),
    }));
  cacheVersion++;
}

export function invalidateDescriptorsCache(): void {
  descriptorsCache = null;
  cacheVersion++;
}

// Solo para testing: reset completo del estado
export function __resetCacheForTesting(): void {
  descriptorsCache = null;
  cacheVersion = 0;
}