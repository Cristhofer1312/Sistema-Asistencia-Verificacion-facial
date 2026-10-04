// app/api/reposos/route.ts
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
  const q = searchParams.get("q")?.trim();
  const gerenciaId = searchParams.get("gerenciaId");
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");
  const estado = searchParams.get("estado") ?? "todas"; // todas | vigentes | anuladas
  const situacion = searchParams.get("situacion") ?? "todas"; // todas | vigente | programada | finalizada

  const where: Prisma.ReposoMedicoWhereInput = {};
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

  const AND: Prisma.ReposoMedicoWhereInput[] = [];
  if (fecha && fechaRe.test(fecha)) {
    AND.push({ inicio: { lte: new Date(fecha) }, fin: { gte: new Date(fecha) } });
  }
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

  // Gerente/Coordinador solo su gerencia (prevalece sobre el parámetro)
  if (esGerente) {
    where.empleado = { gerenciaId: sessionUser.gerenciaId ?? undefined };
  }

  const reposos = await prisma.reposoMedico.findMany({
    where,
    include: { empleado: { select: { nombre: true, apellido: true, cedula: true, gerenciaId: true, gerencia: { select: { nombre: true } } } } },
    orderBy: { inicio: "desc" },
    take: 500,
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

  // Anti-solape con otros reposos del mismo empleado (las anuladas no bloquean)
  for (const r of empleado.reposos) {
    if (!r.anulada && ini <= r.fin && finDate >= r.inicio) {
      return NextResponse.json(
        { error: `Se solapa con un reposo existente: ${iso(r.inicio)} → ${iso(r.fin)}` },
        { status: 400 }
      );
    }
  }

  // Solape cruzado con vacaciones vigentes (un día, un solo estado)
  const cruce = await solapeConOtroPermiso(prisma, { empleadoId, inicio: ini, fin: finDate });
  if (cruce) {
    return NextResponse.json(
      { error: `Se solapa con ${cruce.tipo} existente: ${iso(cruce.inicio)} → ${iso(cruce.fin)}` },
      { status: 400 }
    );
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

  // Marcado automático: convierte FALTAS/FERIADO sin marcaje y crea los días
  // hábiles faltantes como REPOSO_MEDICO (lo individual manda sobre feriado)
  const marc = await autoMarkRange(prisma, { empleadoId, estado: "REPOSO_MEDICO", inicio: ini, fin: finDate });

  await audit(
    "CREAR_REPOSO",
    `Reposo médico: ${reposo.empleado.cedula} ${inicio} → ${fin}${motivo ? ` · ${motivo}` : ""}${
      marc.convertidas ? ` (${marc.convertidas} falta(s) convertida(s))` : ""
    }${marc.creadas ? ` (${marc.creadas} día(s) marcado(s))` : ""}`,
    { usuarioId: Number(sessionUser.id) }
  );

  return NextResponse.json(
    { ...reposo, inicio, fin, faltasConvertidas: marc.convertidas, diasMarcados: marc.creadas },
    { status: 201 }
  );
}
