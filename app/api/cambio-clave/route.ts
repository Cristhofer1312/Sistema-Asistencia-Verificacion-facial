// app/api/cambio-clave/route.ts — Cambio de contraseña del usuario en sesión
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/auditoria";
import bcrypt from "bcryptjs";
import { z } from "zod";

const schema = z.object({
  actual: z.string().min(1).max(128).optional(),
  nueva: z
    .string()
    .min(8, "Mínimo 8 caracteres")
    .max(128)
    .regex(/[A-Z]/, "Debe incluir una mayúscula")
    .regex(/[a-z]/, "Debe incluir una minúscula")
    .regex(/[0-9]/, "Debe incluir un número"),
  confirmar: z.string().min(1).max(128),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as any;
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Datos inválidos" },
      { status: 400 }
    );
  }

  const { actual, nueva, confirmar } = parsed.data;
  if (nueva !== confirmar) {
    return NextResponse.json({ error: "La confirmación no coincide" }, { status: 400 });
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: Number(sessionUser.id) } });
  if (!usuario || !usuario.activo) {
    return NextResponse.json({ error: "Usuario no válido" }, { status: 403 });
  }

  // Si se envía la clave actual, validarla (endurece el flujo no-inicial)
  if (actual) {
    const ok = await bcrypt.compare(actual, usuario.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "La contraseña actual es incorrecta" }, { status: 400 });
    }
  }

  // Evitar reutilizar la misma clave
  if (await bcrypt.compare(nueva, usuario.passwordHash)) {
    return NextResponse.json({ error: "La nueva clave debe ser diferente a la actual" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(nueva, 12);
  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { passwordHash, claveInicial: false },
  });

  await audit("CAMBIO_CLAVE", `Cambio de clave: ${usuario.username}`, { usuarioId: usuario.id });

  return NextResponse.json({ ok: true });
}
