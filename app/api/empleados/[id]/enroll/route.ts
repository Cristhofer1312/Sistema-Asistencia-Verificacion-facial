// app/api/empleados/[id]/enroll/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/auditoria';
import { bufferToDescriptor } from '@/lib/descriptor-utils';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';

const enrollSchema = z.object({
  descriptor: z.array(z.number()).length(128),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as any;
  if (!sessionUser?.id || !['ADMIN', 'RRHH'].includes(sessionUser.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { id } = await params;
  const empleadoId = Number(id);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = enrollSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Descriptor inválido (requiere 128 floats)' },
      { status: 400 }
    );
  }

  const { descriptor } = parsed.data;

  const empleado = await prisma.empleado.findUnique({ where: { id: empleadoId } });
  if (!empleado) {
    return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });
  }

  // Rechazar si este rostro ya está enrolado en OTRO empleado (distancia euclidiana)
  const otros = await prisma.empleado.findMany({
    where: { id: { not: empleadoId }, descriptor: { not: null } },
    select: { cedula: true, nombre: true, apellido: true, descriptor: true },
  });
  for (const o of otros) {
    const d = bufferToDescriptor(Buffer.from(o.descriptor!));
    if (d.length !== 128) continue;
    let sum = 0;
    for (let i = 0; i < 128; i++) sum += (descriptor[i] - d[i]) ** 2;
    if (Math.sqrt(sum) < 0.5) {
      return NextResponse.json(
        { error: `Este rostro ya está registrado para ${o.nombre} ${o.apellido} (${o.cedula})` },
        { status: 409 }
      );
    }
  }

  // Convertir Float32Array[128] -> Buffer -> Bytes (Prisma Bytea)
  const float32 = new Float32Array(descriptor);
  const buffer = Buffer.from(float32.buffer);

  await prisma.empleado.update({
    where: { id: empleadoId },
    data: { descriptor: buffer },
  });

  await audit('ENROLLAR_EMPLEADO', `Enrolamiento biométrico: ${empleado.cedula}`, {
    usuarioId: Number(sessionUser.id),
  });

  return NextResponse.json({ ok: true, message: 'Descriptor guardado correctamente' });
}