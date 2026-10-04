// app/api/vacaciones/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/auditoria";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { autoMarkRange, solapeConOtroPermiso } from "@/lib/auto-marcado";

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
  const q = searchParams.get("q")?.trim();
  const gerenciaId = searchParams.get("gerenciaId");
  const desde = searchParams.get("desde"); // YYYY-MM-DD: solapa con el rango
  const hasta = searchParams.get("hasta");
  const estado = searchParams.get("estado") ?? "todas"; // todas | vigentes | anuladas
  const situacion = searchParams.get("situacion") ?? "todas"; // todas | vigente | programada | finalizada

  const where: Prisma.VacacionEmpleadoWhereInput = {};
  if (empleadoId) where.empleadoId = Number(empleadoId);
  if (estado === "vigentes") where.anulada = false;
  else if (estado === "anuladas") where.anulada = true;

  if (q) {
    where.OR = [
      { empleado: { nombre: { contains: q, mode: "insensitive" } } },
      { empleado: { apellido: { contains: q, mode: "insensitive" } } },
      { empleado: { cedula: { contains: q, mode: "insensitive" } } },
      { motivo: { contains: q, mode: "insensitive" } },
    ];
  }

  const esGerente = ["GERENTE", "COORDINADOR"].includes(sessionUser.rol);
  if (gerenciaId && !esGerente) where.empleado = { gerenciaId: Number(gerenciaId) };

  const AND: Prisma.VacacionEmpleadoWhereInput[] = [];
  if (desde && hasta) {
    AND.push({ inicio: { lte: new Date(hasta) }, fin: { gte: new Date(desde) } });
  } else if (desde) {
    AND.push({ fin: { gte: new Date(desde) } });
  } else if (hasta) {
    AND.push({ inicio: { lte: new Date(hasta) } });
  }

  if (situacion !== "todas") {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    if (situacion === "vigente") {
      AND.push({ inicio: { lte: hoy }, fin: { gte: hoy } });
    } else if (situacion === "programada") {
      AND.push({ inicio: { gt: hoy } });
    } else if (situacion === "finalizada") {
      AND.push({ fin: { lt: hoy } });
    }
  }
  if (AND.length) where.AND = AND;

  // Gerente/Coordinador solo su gerencia (prevalece sobre los parámetros)
  if (esGerente) {
    const empleadosGerencia = await prisma.empleado.findMany({
      where: { gerenciaId: sessionUser.gerenciaId ?? undefined },
      select: { id: true },
    });
    where.empleadoId = { in: empleadosGerencia.map(e => e.id) };
  }

  const vacaciones = await prisma.vacacionEmpleado.findMany({
    where,
    include: { empleado: { select: { nombre: true, apellido: true, cedula: true, gerenciaId: true, gerencia: { select: { nombre: true } } } } },
    orderBy: { inicio: 'desc' },
    take: 500,
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

  // Validar solapamiento (las anuladas no bloquean: se pueden re-otorgar)
  for (const v of empleado.vacaciones) {
    if (!v.anulada && datesOverlap(ini, finDate, v.inicio, v.fin)) {
      return NextResponse.json(
        { error: `Se solapa con vacaciones existentes: ${v.inicio.toISOString().split('T')[0]} → ${v.fin.toISOString().split('T')[0]}` },
        { status: 400 }
      );
    }
  }

  // Solape cruzado con reposos vigentes (un día, un solo estado)
  const cruce = await solapeConOtroPermiso(prisma, { empleadoId, inicio: ini, fin: finDate });
  if (cruce) {
    return NextResponse.json(
      { error: `Se solapa con ${cruce.tipo} existente: ${cruce.inicio.toISOString().split('T')[0]} → ${cruce.fin.toISOString().split('T')[0]}` },
      { status: 400 }
    );
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

  // Marcado automático de los días hábiles del rango (lo individual manda sobre feriado)
  const marc = await autoMarkRange(prisma, { empleadoId, estado: "VACACIONES", inicio: ini, fin: finDate });

  await audit("CREAR_VACACION", `Vacaciones asignadas: ${vacacion.empleado.cedula} ${inicio} → ${fin} ${motivo ? `· ${motivo}` : ''} (${marc.creadas} día(s) marcado(s), ${marc.convertidas} convertido(s))`, {
    usuarioId: Number(sessionUser.id),
  });

  return NextResponse.json({ ...vacacion, diasMarcados: marc }, { status: 201 });
}
