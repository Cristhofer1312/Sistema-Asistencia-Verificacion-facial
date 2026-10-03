// app/api/reposos/route.ts
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

const fechaRe = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z.object({
  empleadoId: z.number().int().positive(),
  inicio: z.string().regex(fechaRe),
  fin: z.string().regex(fechaRe),
  motivo: z.string().max(300).optional(),
  documento: z.string().max(500).optional(),
});

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as SessionUser;
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const empleadoId = searchParams.get("empleadoId");
  const fecha = searchParams.get("fecha"); // reposos vigentes en esa fecha

  const where: Prisma.ReposoMedicoWhereInput = {};
  if (empleadoId) where.empleadoId = Number(empleadoId);
  if (fecha && fechaRe.test(fecha)) {
    where.inicio = { lte: new Date(fecha) };
    where.fin = { gte: new Date(fecha) };
  }

  // Gerente/Coordinador solo su gerencia
  if (["GERENTE", "COORDINADOR"].includes(sessionUser.rol)) {
    where.empleado = { gerenciaId: sessionUser.gerenciaId ?? undefined };
  }

  const reposos = await prisma.reposoMedico.findMany({
    where,
    include: { empleado: { select: { nombre: true, apellido: true, cedula: true, gerenciaId: true } } },
    orderBy: { inicio: "desc" },
    take: 300,
  });

  return NextResponse.json(
    reposos.map((r) => ({ ...r, inicio: iso(r.inicio), fin: iso(r.fin) }))
  );
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as SessionUser;
  if (!sessionUser?.id || !["ADMIN", "RRHH"].includes(sessionUser.rol)) {
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

  const { empleadoId, inicio, fin, motivo, documento } = parsed.data;
  const ini = new Date(inicio);
  const finDate = new Date(fin);

  if (ini > finDate) {
    return NextResponse.json({ error: "Fecha inicio debe ser anterior o igual a fecha fin" }, { status: 400 });
  }

  const empleado = await prisma.empleado.findUnique({
    where: { id: empleadoId },
    include: { reposos: true },
  });
  if (!empleado || !empleado.activo) {
    return NextResponse.json({ error: "Empleado no encontrado o inactivo" }, { status: 404 });
  }

  // Anti-solape con otros reposos del mismo empleado
  for (const r of empleado.reposos) {
    if (ini <= r.fin && finDate >= r.inicio) {
      return NextResponse.json(
        { error: `Se solapa con un reposo existente: ${iso(r.inicio)} → ${iso(r.fin)}` },
        { status: 400 }
      );
    }
  }

  const reposo = await prisma.reposoMedico.create({
    data: {
      empleadoId,
      inicio: ini,
      fin: finDate,
      motivo: motivo || null,
      documento: documento || null,
      registradoPorId: Number(sessionUser.id),
    },
    include: { empleado: { select: { nombre: true, apellido: true, cedula: true } } },
  });

  // Faltas ya proyectadas (sin marcaje) dentro del rango pasan a REPOSO_MEDICO
  const convertidas = await prisma.asistencia.updateMany({
    where: {
      empleadoId,
      fecha: { gte: ini, lte: finDate },
      estadoEntrada: "FALTA",
      entrada: null,
    },
    data: { estadoEntrada: "REPOSO_MEDICO", estadoOriginal: null },
  });

  await audit(
    "CREAR_REPOSO",
    `Reposo médico: ${reposo.empleado.cedula} ${inicio} → ${fin}${motivo ? ` · ${motivo}` : ""}${
      convertidas.count ? ` (${convertidas.count} falta(s) convertida(s))` : ""
    }`,
    { usuarioId: Number(sessionUser.id) }
  );

  return NextResponse.json(
    { ...reposo, inicio, fin, faltasConvertidas: convertidas.count },
    { status: 201 }
  );
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as SessionUser;
  if (!sessionUser?.id || !["ADMIN", "RRHH"].includes(sessionUser.rol)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "ID requerido" }, { status: 400 });
  }

  const reposo = await prisma.reposoMedico.findUnique({
    where: { id: Number(id) },
    include: { empleado: { select: { cedula: true } } },
  });
  if (!reposo) {
    return NextResponse.json({ error: "Reposo no encontrado" }, { status: 404 });
  }

  await prisma.reposoMedico.delete({ where: { id: Number(id) } });

  // Los días proyectados como REPOSO_MEDICO sin marcaje vuelven a FALTA
  await prisma.asistencia.updateMany({
    where: {
      empleadoId: reposo.empleadoId,
      fecha: { gte: reposo.inicio, lte: reposo.fin },
      estadoEntrada: "REPOSO_MEDICO",
      entrada: null,
    },
    data: { estadoEntrada: "FALTA" },
  });

  await audit("ELIMINAR_REPOSO", `Reposo médico eliminado: ${reposo.empleado.cedula}`, {
    usuarioId: Number(sessionUser.id),
  });

  return NextResponse.json({ ok: true });
}
