// app/api/empleados/[id]/enroll/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/auditoria';
import { bufferToDescriptor } from '@/lib/descriptor-utils';
import { MATCH_DISTANCE_THRESHOLD } from '@/lib/face-server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';
import { invalidateDescriptorsCache } from '@/lib/face-cache';

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

  // Rechazar si este rostro ya está enrolado en OTRO empleado.
  // Mismo umbral que el match del kiosco (fuente única en lib/face-server).
  // Además se advierte la "zona gris" [umbral, umbral+0.15): el enrolamiento
  // queda guardado pero nace con riesgo de confusión (re-capturar con
  // mejor luz si aparece este aviso).
  const GRAY_ZONE = 0.15;
  const otros = await prisma.empleado.findMany({
    where: { id: { not: empleadoId }, descriptor: { not: null } },
    select: { cedula: true, nombre: true, apellido: true, descriptor: true },
  });
  let minDist = Infinity;
  let minOtro: { nombre: string; apellido: string; cedula: string } | null = null;
  for (const o of otros) {
    const d = bufferToDescriptor(Buffer.from(o.descriptor!));
    if (d.length !== 128) continue;
    let sum = 0;
    for (let i = 0; i < 128; i++) sum += (descriptor[i] - d[i]) ** 2;
    const dist = Math.sqrt(sum);
    if (dist < minDist) {
      minDist = dist;
      minOtro = { nombre: o.nombre, apellido: o.apellido, cedula: o.cedula };
    }
    if (dist < MATCH_DISTANCE_THRESHOLD) {
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

  // Invalidar caché de descriptores para que el kiosco vea el nuevo enrolamiento
  invalidateDescriptorsCache();

  await audit('ENROLLAR_EMPLEADO', `Enrolamiento biométrico: ${empleado.cedula}`, {
    usuarioId: Number(sessionUser.id),
  });

  const warning =
    minOtro && minDist < MATCH_DISTANCE_THRESHOLD + GRAY_ZONE
      ? `Riesgo de confusión: se parece a ${minOtro.nombre} ${minOtro.apellido} (${minOtro.cedula}) a distancia ${minDist.toFixed(3)}. Re-capture con mejor luz frontal si hay confusiones en el kiosco.`
      : null;

  return NextResponse.json({ ok: true, message: 'Descriptor guardado correctamente', warning });
}