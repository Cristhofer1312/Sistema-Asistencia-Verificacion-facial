// app/api/empleados/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/auditoria";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";

const updateSchema = z.object({
  nombre: z.string().min(1).max(80).optional(),
  apellido: z.string().min(1).max(80).optional(),
  cargo: z.string().max(100).optional(),
  gerenciaId: z.number().int().positive().optional(),
  activo: z.boolean().optional(),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const user = session.user as any;
  const rol = user.rol;
  const gerenciaId = user.gerenciaId;

  const { id } = await params;
  const isNumeric = /^\d+$/.test(id);

  const empleado = await prisma.empleado.findUnique({
    where: isNumeric ? { id: Number(id) } : { cedula: id },
    include: { gerencia: true },
  });

  if (!empleado) {
    return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
  }

  if (["GERENTE", "COORDINADOR"].includes(rol) && empleado.gerenciaId !== gerenciaId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // Convertir descriptor Bytes -> number[] si existe (para enrolamiento)
  let descriptor: number[] | null = null;
  if (empleado.descriptor) {
    const buffer = Buffer.from(empleado.descriptor);
    const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    descriptor = Array.from(new Float32Array(ab));
  }

  return NextResponse.json({ ...empleado, descriptor });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as any;
  if (!sessionUser?.id || !["ADMIN", "RRHH"].includes(sessionUser.rol)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const empleadoId = Number(id);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Datos inválidos" },
      { status: 400 }
    );
  }

  const empleado = await prisma.empleado.findUnique({ where: { id: empleadoId } });
  if (!empleado) {
    return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
  }

  const data = parsed.data;
  const wasActivo = empleado.activo;

  if (data.gerenciaId) {
    const gerencia = await prisma.gerencia.findUnique({ where: { id: data.gerenciaId } });
    if (!gerencia) {
      return NextResponse.json({ error: "Gerencia no encontrada" }, { status: 400 });
    }
  }

  const updateData: any = { ...data };
  if (data.activo === false && wasActivo) {
    updateData.dadoDeBajaEn = new Date();
  } else if (data.activo === true && !wasActivo) {
    updateData.dadoDeBajaEn = null;
  }

  const updated = await prisma.empleado.update({
    where: { id: empleadoId },
    data: updateData,
    include: { gerencia: true },
  });

  if (data.activo === false && wasActivo) {
    await audit("DESACTIVAR_EMPLEADO", `Empleado dado de baja: ${updated.cedula}`, { usuarioId: Number(sessionUser.id) });
  } else if (data.activo === true && !wasActivo) {
    await audit("REACTIVAR_EMPLEADO", `Empleado reactivado: ${updated.cedula}`, { usuarioId: Number(sessionUser.id) });
  } else {
    await audit("CREAR_EMPLEADO", `Empleado actualizado: ${updated.cedula}`, { usuarioId: Number(sessionUser.id) });
  }

  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as any;
  if (!sessionUser?.id || !["ADMIN", "RRHH"].includes(sessionUser.rol)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const empleadoId = Number(id);

  const empleado = await prisma.empleado.findUnique({ where: { id: empleadoId } });
  if (!empleado) {
    return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
  }

  // Soft delete: marcar inactivo y poner dadoDeBajaEn
  await prisma.empleado.update({
    where: { id: empleadoId },
    data: { activo: false, dadoDeBajaEn: new Date() },
  });

  await audit("DESACTIVAR_EMPLEADO", `Empleado dado de baja (DELETE): ${empleado.cedula}`, { usuarioId: Number(sessionUser.id) });

  return NextResponse.json({ ok: true });
}