// app/api/permisos-estudio/route.ts — CRUD de permisos estudiantiles (extensión de hora límite)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/auditoria";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getScope, SCOPE_DENIED_BODY } from "@/lib/scope";
import { EMPLEADO_PUBLIC_SELECT } from "@/lib/empleado-select";

interface SessionUser {
  id: string;
  username: string;
  rol: string;
  gerenciaId: number | null;
  gerenciaNombre: string | null;
  claveInicial: boolean;
}

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z.object({
  empleadoId: z.number().int().positive(),
  diasSemana: z.array(z.number().int().min(0).max(6)).min(1).max(7)
    .refine((a) => new Set(a).size === a.length, "Días duplicados"),
  horaLimite: z.string().regex(HORA_RE, "Hora límite inválida (HH:MM)"),
  validoDesde: z.string().regex(FECHA_RE, "Fecha inválida (YYYY-MM-DD)"),
  validoHasta: z.string().regex(FECHA_RE, "Fecha inválida (YYYY-MM-DD)"),
  motivo: z.string().max(300).optional(),
}).refine((d) => d.validoDesde <= d.validoHasta, "validoDesde debe ser anterior o igual a validoHasta");

function parseTime(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as SessionUser;
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const scope = getScope(sessionUser);
  if (scope.tipo === "denegado") return NextResponse.json(SCOPE_DENIED_BODY, { status: 403 });

  const { searchParams } = new URL(req.url);
  const empleadoId = searchParams.get("empleadoId");
  const activo = searchParams.get("activo");

  const where: Prisma.PermisoEstudiantilWhereInput = {};
  if (empleadoId) where.empleadoId = Number(empleadoId);
  if (activo !== null && activo !== "") where.activo = activo === "true";

  if (scope.tipo === "gerencia") {
    where.empleado = { gerenciaId: scope.gerenciaId };
  }

  try {
    const permisos = await prisma.permisoEstudiantil.findMany({
      where,
      include: { empleado: { select: EMPLEADO_PUBLIC_SELECT } },
      orderBy: { validoDesde: "desc" },
      take: 100,
    });
    return NextResponse.json(permisos);
  } catch (error: any) {
    console.error("Error en GET permisos-estudio:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
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

  const { empleadoId, diasSemana, horaLimite, validoDesde, validoHasta, motivo } = parsed.data;

  const empleado = await prisma.empleado.findUnique({ where: { id: empleadoId } });
  if (!empleado || !empleado.activo) {
    return NextResponse.json({ error: "Empleado no encontrado o inactivo" }, { status: 404 });
  }

  if (["GERENTE", "COORDINADOR"].includes(sessionUser.rol)) {
    if (empleado.gerenciaId !== sessionUser.gerenciaId) {
      return NextResponse.json({ error: "Solo puede crear permisos para su gerencia" }, { status: 403 });
    }
  }

  // El permiso solo puede alargar: debe superar la hora límite de la regla vigente.
  const ahora = new Date();
  const regla = await prisma.reglaAsistencia.findFirst({
    where: { vigenciaDesde: { lte: ahora } },
    orderBy: { vigenciaDesde: "desc" },
  });
  if (!regla) {
    return NextResponse.json({ error: "No hay regla de asistencia vigente para validar" }, { status: 400 });
  }
  if (parseTime(horaLimite) <= parseTime(regla.horaLimite)) {
    return NextResponse.json(
      { error: `La hora del permiso (${horaLimite}) debe ser posterior al límite general (${regla.horaLimite}): solo puede alargar` },
      { status: 400 }
    );
  }

  const permiso = await prisma.permisoEstudiantil.create({
    data: {
      empleadoId,
      diasSemana,
      horaLimite,
      validoDesde: new Date(validoDesde),
      validoHasta: new Date(validoHasta),
      motivo: motivo || null,
      creadoPorId: Number(sessionUser.id),
    },
    include: { empleado: { select: EMPLEADO_PUBLIC_SELECT } },
  });

  await audit("CREAR_PERMISO_ESTUDIO", `Permiso estudiantil: ${permiso.empleado?.cedula} hasta ${horaLimite} días [${diasSemana.join(",")}] ${validoDesde}→${validoHasta}`, {
    usuarioId: Number(sessionUser.id),
  });

  return NextResponse.json(permiso, { status: 201 });
}
