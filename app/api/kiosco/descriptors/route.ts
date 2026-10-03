// app/api/kiosco/descriptors/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { descriptorToArray, bufferToDescriptor } from '@/lib/descriptor-utils';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // Validar API Key kiosco
  const authHeader = req.headers.get('authorization');
  if (!authHeader || authHeader !== `Bearer ${process.env.API_KIOSCO_KEY}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  // Solo empleados activos con descriptor
  const empleados = await prisma.empleado.findMany({
    where: { 
      activo: true,
      descriptor: { not: null },
    },
    select: { 
      id: true, 
      descriptor: true,
      cedula: true,
      nombre: true,
      apellido: true,
    },
  });

  // Convertir Bytes -> number[] para JSON
  const descriptors = empleados
    .filter(e => e.descriptor)
    .map(e => ({
      empleadoId: e.id,
      cedula: e.cedula,
      nombre: e.nombre,
      apellido: e.apellido,
      descriptor: descriptorToArray(bufferToDescriptor(Buffer.from(e.descriptor!))),
    }));

  return NextResponse.json(descriptors);
}