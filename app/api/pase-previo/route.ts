// app/api/pase-previo/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/auditoria";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getHoyVE } from "@/lib/date-utils";

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
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  motivo: z.string().min(1, "Motivo requerido").max(500),
  tipo: z.enum(["PASE_NORMAL", "JUSTIFICACION_ANTICIPADA"]).default("PASE_NORMAL"),
});



export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as SessionUser;
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const empleadoId = searchParams.get("empleadoId");
  const fecha = searchParams.get("fecha");
  const soloPendientes = searchParams.get("pendientes") === "true";
  const tipo = searchParams.get("tipo");

  const where: Prisma.PasePrevioWhereInput = {};
  if (empleadoId) where.empleadoId = Number(empleadoId);
  if (fecha) where.fecha = new Date(fecha);
  if (soloPendientes) where.autorizado = false;
  if (tipo) where.tipo = tipo as Prisma.EnumTipoPaseFilter<"PasePrevio">;

  // Gerente/Coordinador solo su gerencia
  if (["GERENTE", "COORDINADOR"].includes(sessionUser.rol)) {
    const empleadosGerencia = await prisma.empleado.findMany({
      where: { gerenciaId: sessionUser.gerenciaId ?? undefined },
      select: { id: true },
    });
    where.empleadoId = { in: empleadosGerencia.map(e => e.id) };
  }

  const pases = await prisma.pasePrevio.findMany({
    where,
    include: { empleado: { select: { nombre: true, apellido: true, cedula: true, gerenciaId: true } } },
    orderBy: { fecha: 'desc' },
    take: 100,
  });

  return NextResponse.json(pases);
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

  const { empleadoId, fecha, motivo, tipo } = parsed.data;

  // Verificar empleado existe y está activo
  const empleado = await prisma.empleado.findUnique({
    where: { id: empleadoId },
    include: { gerencia: true },
  });

  if (!empleado || !empleado.activo) {
    return NextResponse.json({ error: "Empleado no encontrado o inactivo" }, { status: 404 });
  }

  // Gerente/Coordinador solo su gerencia
  if (["GERENTE", "COORDINADOR"].includes(sessionUser.rol)) {
    if (empleado.gerenciaId !== sessionUser.gerenciaId) {
      return NextResponse.json({ error: "Solo puede crear pases para su gerencia" }, { status: 403 });
    }
  }

  // Verificar que no exista ya un pase pendiente para ese empleado/fecha/tipo
  const existing = await prisma.pasePrevio.findFirst({
    where: { empleadoId, fecha: new Date(fecha), tipo, autorizado: false },
  });

  if (existing) {
    const msg = tipo === "JUSTIFICACION_ANTICIPADA" 
      ? "Ya existe una justificación anticipada para ese empleado y fecha" 
      : "Ya existe un pase pendiente para ese empleado y fecha";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Validación de fecha: para JUSTIFICACION_ANTICIPADA permitir hoy, para PASE_NORMAL solo futuro
  // Comparar como strings YYYY-MM-DD (hora Venezuela) para evitar desfases de zona horaria
  const hoyStr = getHoyVE();

  if (tipo === "PASE_NORMAL" && fecha < hoyStr) {
    return NextResponse.json({ error: "No se pueden crear pases para fechas pasadas" }, { status: 400 });
  }
  // Para JUSTIFICACION_ANTICIPADA se permite hoy (fechaPase >= hoy)

  const pase = await prisma.pasePrevio.create({
    data: {
      empleadoId,
      fecha: new Date(fecha),
      tipo,
      motivo,
      autorizadorId: Number(sessionUser.id),
    },
    include: { empleado: { select: { nombre: true, apellido: true, cedula: true, gerenciaId: true } } },
  });

  const accionAuditoria = tipo === "JUSTIFICACION_ANTICIPADA" ? "CREAR_JUSTIFICACION_ANTICIPADA" : "CREAR_PASE";
  const msgAuditoria = tipo === "JUSTIFICACION_ANTICIPADA" 
    ? `Justificación anticipada creada: ${pase.empleado?.cedula} ${fecha} · ${motivo}`
    : `Pase previo creado: ${pase.empleado?.cedula} ${fecha} · ${motivo}`;
  
  await audit(accionAuditoria as any, msgAuditoria, {
    usuarioId: Number(sessionUser.id),
  });

  return NextResponse.json(pase, { status: 201 });
}