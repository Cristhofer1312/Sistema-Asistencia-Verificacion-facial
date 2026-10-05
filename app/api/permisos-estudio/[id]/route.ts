// app/api/permisos-estudio/[id]/route.ts — Actualizar / suspender permiso estudiantil
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/auditoria";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
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

const patchSchema = z.object({
  diasSemana: z.array(z.number().int().min(0).max(6)).min(1).max(7)
    .refine((a) => new Set(a).size === a.length, "Días duplicados").optional(),
  horaLimite: z.string().regex(HORA_RE, "Hora límite inválida (HH:MM)").optional(),
  validoDesde: z.string().regex(FECHA_RE, "Fecha inválida (YYYY-MM-DD)").optional(),
  validoHasta: z.string().regex(FECHA_RE, "Fecha inválida (YYYY-MM-DD)").optional(),
  motivo: z.string().max(300).nullable().optional(),
  activo: z.boolean().optional(),
}).refine(
  (d) => !(d.validoDesde && d.validoHasta) || d.validoDesde <= d.validoHasta,
  "validoDesde debe ser anterior o igual a validoHasta"
);

function parseTime(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as SessionUser;
  if (!sessionUser?.id || !["ADMIN", "RRHH", "GERENTE", "COORDINADOR"].includes(sessionUser.rol)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const scope = getScope(sessionUser);
  if (scope.tipo === "denegado") return NextResponse.json(SCOPE_DENIED_BODY, { status: 403 });

  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Datos inválidos" },
      { status: 400 }
    );
  }

  const permiso = await prisma.permisoEstudiantil.findUnique({
    where: { id },
    include: { empleado: { select: EMPLEADO_PUBLIC_SELECT } },
  });
  if (!permiso) return NextResponse.json({ error: "Permiso no encontrado" }, { status: 404 });

  if (scope.tipo === "gerencia" && permiso.empleado?.gerenciaId !== scope.gerenciaId) {
    return NextResponse.json({ error: "Solo puede editar permisos de su gerencia" }, { status: 403 });
  }

  // Si cambia la hora, debe seguir alargando respecto a la regla vigente.
  if (parsed.data.horaLimite) {
    const regla = await prisma.reglaAsistencia.findFirst({
      where: { vigenciaDesde: { lte: new Date() } },
      orderBy: { vigenciaDesde: "desc" },
    });
    if (regla && parseTime(parsed.data.horaLimite) <= parseTime(regla.horaLimite)) {
      return NextResponse.json(
        { error: `La hora del permiso debe ser posterior al límite general (${regla.horaLimite}): solo puede alargar` },
        { status: 400 }
      );
    }
  }

  // Si solo cambia un extremo del rango, validar contra el otro almacenado.
  const desde = parsed.data.validoDesde ?? permiso.validoDesde.toISOString().slice(0, 10);
  const hasta = parsed.data.validoHasta ?? permiso.validoHasta.toISOString().slice(0, 10);
  if (desde > hasta) {
    return NextResponse.json({ error: "validoDesde debe ser anterior o igual a validoHasta" }, { status: 400 });
  }

  const updated = await prisma.permisoEstudiantil.update({
    where: { id },
    data: {
      ...(parsed.data.diasSemana !== undefined && { diasSemana: parsed.data.diasSemana }),
      ...(parsed.data.horaLimite !== undefined && { horaLimite: parsed.data.horaLimite }),
      ...(parsed.data.validoDesde !== undefined && { validoDesde: new Date(parsed.data.validoDesde) }),
      ...(parsed.data.validoHasta !== undefined && { validoHasta: new Date(parsed.data.validoHasta) }),
      ...(parsed.data.motivo !== undefined && { motivo: parsed.data.motivo }),
      ...(parsed.data.activo !== undefined && { activo: parsed.data.activo }),
    },
    include: { empleado: { select: EMPLEADO_PUBLIC_SELECT } },
  });

  await audit("ACTUALIZAR_PERMISO_ESTUDIO", `Permiso estudiantil #${id} actualizado (${permiso.empleado?.cedula})`, {
    usuarioId: Number(sessionUser.id),
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as SessionUser;
  if (!sessionUser?.id || !["ADMIN", "RRHH", "GERENTE", "COORDINADOR"].includes(sessionUser.rol)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const scope = getScope(sessionUser);
  if (scope.tipo === "denegado") return NextResponse.json(SCOPE_DENIED_BODY, { status: 403 });

  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const permiso = await prisma.permisoEstudiantil.findUnique({
    where: { id },
    include: { empleado: { select: EMPLEADO_PUBLIC_SELECT } },
  });
  if (!permiso) return NextResponse.json({ error: "Permiso no encontrado" }, { status: 404 });

  if (scope.tipo === "gerencia" && permiso.empleado?.gerenciaId !== scope.gerenciaId) {
    return NextResponse.json({ error: "Solo puede eliminar permisos de su gerencia" }, { status: 403 });
  }

  try {
    await prisma.permisoEstudiantil.delete({ where: { id } });
    await audit("ELIMINAR_PERMISO_ESTUDIO", `Permiso estudiantil #${id} eliminado (${permiso.empleado?.cedula})`, {
      usuarioId: Number(sessionUser.id),
    });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error.code === 'P2003') {
      return NextResponse.json({ error: "No se puede eliminar porque ya tiene asistencias registradas con este permiso. Solo puedes suspenderlo." }, { status: 400 });
    }
    return NextResponse.json({ error: "Error al eliminar el permiso" }, { status: 500 });
  }
}
