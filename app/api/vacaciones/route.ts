// app/api/vacaciones/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/auditoria";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { Prisma } from "@prisma/client";

interface SessionUser {
  id: string;
  username: string;
  rol: string;
  gerenciaId: number | null;
  gerenciaNombre: string | null;
  claveInicial: boolean;
}

const createSchema = z.object({
  empleadoId: z.number().int().positive(),
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  motivo: z.string().max(200).optional(),
});

function datesOverlap(aIni: Date, aFin: Date, bIni: Date, bFin: Date): boolean {
  return aIni <= bFin && aFin >= bIni;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as SessionUser;
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const empleadoId = searchParams.get("empleadoId");

  const where: Prisma.VacacionEmpleadoWhereInput = {};
  if (empleadoId) where.empleadoId = Number(empleadoId);

  // Gerente/Coordinador solo su gerencia
  if (["GERENTE", "COORDINADOR"].includes(sessionUser.rol)) {
    const empleadosGerencia = await prisma.empleado.findMany({
      where: { gerenciaId: sessionUser.gerenciaId ?? undefined },
      select: { id: true },
    });
    where.empleadoId = { in: empleadosGerencia.map(e => e.id) };
  }

  const vacaciones = await prisma.vacacionEmpleado.findMany({
    where,
    include: { empleado: { select: { nombre: true, apellido: true, cedula: true, gerenciaId: true } } },
    orderBy: { inicio: 'desc' },
    take: 200,
  });

  return NextResponse.json(vacaciones);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as SessionUser;
  if (!sessionUser?.id || !["ADMIN", "RRHH", "GERENTE", "COORDINADOR"].includes(sessionUser.rol)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Datos inválidos" },
      { status: 400 }
    );
  }

  const { empleadoId, inicio, fin, motivo } = parsed.data;

  const ini = new Date(inicio);
  const finDate = new Date(fin);

  if (ini > finDate) {
    return NextResponse.json({ error: "Fecha inicio debe ser anterior o igual a fecha fin" }, { status: 400 });
  }

  const empleado = await prisma.empleado.findUnique({
    where: { id: empleadoId },
    include: { gerencia: true, vacaciones: true },
  });

  if (!empleado || !empleado.activo) {
    return NextResponse.json({ error: "Empleado no encontrado o inactivo" }, { status: 404 });
  }

  // Gerente/Coordinador solo su gerencia
  if (["GERENTE", "COORDINADOR"].includes(sessionUser.rol)) {
    if (empleado.gerenciaId !== sessionUser.gerenciaId) {
      return NextResponse.json({ error: "Solo puede asignar vacaciones a su gerencia" }, { status: 403 });
    }
  }

  // Validar solapamiento
  for (const v of empleado.vacaciones) {
    if (datesOverlap(ini, finDate, v.inicio, v.fin)) {
      return NextResponse.json(
        { error: `Se solapa con vacaciones existentes: ${v.inicio.toISOString().split('T')[0]} → ${v.fin.toISOString().split('T')[0]}` },
        { status: 400 }
      );
    }
  }

  const vacacion = await prisma.vacacionEmpleado.create({
    data: {
      empleadoId,
      inicio: ini,
      fin: finDate,
      motivo: motivo ?? null,
      aprobadorId: Number(sessionUser.id),
    },
    include: { empleado: { select: { nombre: true, apellido: true, cedula: true } } },
  });

  await audit("CREAR_VACACION", `Vacaciones asignadas: ${vacacion.empleado.cedula} ${inicio} → ${fin} ${motivo ? `· ${motivo}` : ''}`, {
    usuarioId: Number(sessionUser.id),
  });

  return NextResponse.json(vacacion, { status: 201 });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as SessionUser;
  if (!sessionUser?.id || !["ADMIN", "RRHH"].includes(sessionUser.rol)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "ID requerido" }, { status: 400 });
  }

  const vacacion = await prisma.vacacionEmpleado.findUnique({
    where: { id: Number(id) },
    include: { empleado: { select: { cedula: true } } },
  });

  if (!vacacion) {
    return NextResponse.json({ error: "Vacaciones no encontradas" }, { status: 404 });
  }

  await prisma.vacacionEmpleado.delete({ where: { id: Number(id) } });

  await audit("ELIMINAR_VACACION", `Vacaciones eliminadas: ${vacacion.empleado.cedula}`, {
    usuarioId: Number(sessionUser.id),
  });

  return NextResponse.json({ ok: true });
}