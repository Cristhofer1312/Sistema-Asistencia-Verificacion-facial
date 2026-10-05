// app/api/empleados/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/auditoria";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { invalidateDescriptorsCache } from "@/lib/face-cache";
import { getScope, SCOPE_DENIED_BODY } from "@/lib/scope";
import { EMPLEADO_PUBLIC_SELECT } from "@/lib/empleado-select";

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

  const scope = getScope(session.user as any);
  if (scope.tipo === "denegado") return NextResponse.json(SCOPE_DENIED_BODY, { status: 403 });

  const { id } = await params;
  const isNumeric = /^\d+$/.test(id);

  // Sin `descriptor`: la plantilla biométrica nunca sale del servidor
  // Una cédula puramente numérica ("30098588") también pasa isNumeric:
  // se busca primero por id y, si no existe, por cédula.
  let empleado = null;
  if (isNumeric) {
    empleado = await prisma.empleado.findUnique({
      where: { id: Number(id) },
      select: EMPLEADO_PUBLIC_SELECT,
    });
  }
  if (!empleado) {
    empleado = await prisma.empleado.findUnique({
      where: { cedula: id },
      select: EMPLEADO_PUBLIC_SELECT,
    });
  }

  if (!empleado) {
    return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
  }

  if (scope.tipo === "gerencia" && empleado.gerenciaId !== scope.gerenciaId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  return NextResponse.json(empleado);
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
    select: EMPLEADO_PUBLIC_SELECT,
  });

  // Invalidar caché si cambia el estado activo (afecta al match del kiosco)
  if (data.activo !== undefined && data.activo !== wasActivo) {
    invalidateDescriptorsCache();
  }

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

  // Borrado físico (para pruebas y depuración): elimina el empleado junto con
  // sus dependientes (asistencias, vacaciones, reposos, pases, permisos).
  // Para baja conservando historial usar PATCH { activo: false }.
  const borrados = await prisma.$transaction(async (tx) => {
    const delPermisos = await tx.permisoEstudiantil.deleteMany({ where: { empleadoId } });
    const delPases = await tx.pasePrevio.deleteMany({ where: { empleadoId } });
    const delVacs = await tx.vacacionEmpleado.deleteMany({ where: { empleadoId } });
    const delRepos = await tx.reposoMedico.deleteMany({ where: { empleadoId } });
    const delAsis = await tx.asistencia.deleteMany({ where: { empleadoId } });
    await tx.empleado.delete({ where: { id: empleadoId } });
    return {
      permisos: delPermisos.count,
      pases: delPases.count,
      vacaciones: delVacs.count,
      reposos: delRepos.count,
      asistencias: delAsis.count,
    };
  });

  // Invalidar caché ya que el descriptor eliminado no debe seguir matcheando
  invalidateDescriptorsCache();

  await audit("ELIMINAR_EMPLEADO", `Empleado eliminado (físico): ${empleado.cedula} (asis:${borrados.asistencias} vac:${borrados.vacaciones} rep:${borrados.reposos} pases:${borrados.pases} permisos:${borrados.permisos})`, { usuarioId: Number(sessionUser.id) });

  return NextResponse.json({ ok: true, borrados });
}