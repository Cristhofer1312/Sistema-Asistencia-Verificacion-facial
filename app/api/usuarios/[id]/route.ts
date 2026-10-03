import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { audit } from "@/lib/auditoria";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).rol !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  if (body.action === "reset_password") {
    const passwordHash = await bcrypt.hash("Cambiar1234!", 12);
    await prisma.usuario.update({
      where: { id: Number(id) },
      data: { passwordHash, claveInicial: true }
    });
    
    await audit("RESET_PASSWORD", `Contraseña reseteada para usuario ID ${id}`, { usuarioId: Number((session.user as any).id) });
    return NextResponse.json({ ok: true, msg: "Contraseña reseteada a: Cambiar1234!" });
  }

  if (body.action === "toggle_activo") {
    const user = await prisma.usuario.findUnique({ where: { id: Number(id) } });
    if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    if (user.id === Number((session.user as any).id)) {
      return NextResponse.json({ error: "No puedes desactivar tu propio usuario" }, { status: 400 });
    }
    await prisma.usuario.update({
      where: { id: Number(id) },
      data: { activo: !user.activo }
    });
    await audit("UPDATE_USUARIO", `Usuario ID ${id} ${!user.activo ? 'activado' : 'desactivado'}`, { usuarioId: Number((session.user as any).id) });
    return NextResponse.json({ ok: true, activo: !user.activo });
  }

  return NextResponse.json({ error: "Acción no soportada" }, { status: 400 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).rol !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const targetId = Number(id);
  const currentUserId = Number((session.user as any).id);

  if (targetId === currentUserId) {
    return NextResponse.json({ error: "No puedes eliminar tu propio usuario" }, { status: 400 });
  }

  const user = await prisma.usuario.findUnique({ where: { id: targetId } });
  if (!user) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  await prisma.usuario.delete({ where: { id: targetId } });

  await audit("ELIMINAR_USUARIO", `Usuario eliminado: ${user.username} (${user.rol})`, { usuarioId: currentUserId });

  return NextResponse.json({ ok: true });
}
