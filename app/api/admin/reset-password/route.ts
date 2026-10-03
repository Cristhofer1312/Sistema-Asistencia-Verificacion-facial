// app/api/admin/reset-password/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/auditoria';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const resetSchema = z.object({
  userId: z.number().int().positive(),
  newPassword: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as any;
  if (!sessionUser?.id || sessionUser.rol !== 'ADMIN') {
    return NextResponse.json({ error: 'Solo Administrador puede restablecer contraseñas' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = resetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { userId, newPassword } = parsed.data;

  const usuario = await prisma.usuario.findUnique({ where: { id: userId } });
  if (!usuario) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });

  const passwordHash = await bcrypt.hash(newPassword, 12);
  
  await prisma.usuario.update({
    where: { id: userId },
    data: { passwordHash, claveInicial: true }, // Fuerza cambio en próximo login
  });

  await audit('CAMBIO_CLAVE', `Contraseña restablecida por Admin: ${usuario.username}`, {
    usuarioId: Number(sessionUser.id),
    ip: req.headers.get('x-forwarded-for') || 'unknown',
  });

  return NextResponse.json({ ok: true, message: 'Contraseña restablecida. Usuario debe cambiarla al entrar.' });
}