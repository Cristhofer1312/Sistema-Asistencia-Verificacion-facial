// app/api/justificar/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/auditoria";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  empleadoId: z.number().int().positive(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  justificacionDoc: z.string().max(500).optional(),
  justificacionObs: z.string().min(1, "Motivo requerido").max(2000),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as any;
  if (!sessionUser?.id || !["ADMIN", "RRHH", "GERENTE", "COORDINADOR"].includes(sessionUser.rol)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Datos inválidos" },
      { status: 400 }
    );
  }

  const { empleadoId, fecha, justificacionDoc, justificacionObs } = parsed.data;

  const asistencia = await prisma.asistencia.findUnique({
    where: { empleadoId_fecha: { empleadoId, fecha: new Date(fecha) } },
    include: { empleado: true },
  });

  if (!asistencia) {
    return NextResponse.json({ error: "Asistencia no encontrada" }, { status: 404 });
  }

  if (asistencia.estadoEntrada === "JUSTIFICADO") {
    return NextResponse.json({ error: "Ya está justificada" }, { status: 400 });
  }

  if (!["TARDE", "FALTA"].includes(asistencia.estadoEntrada)) {
    return NextResponse.json(
      { error: "Solo se pueden justificar TARDE o FALTA" },
      { status: 400 }
    );
  }

  // Gerente/Coordinador solo su gerencia
  if (["GERENTE", "COORDINADOR"].includes(sessionUser.rol)) {
    if (asistencia.empleado.gerenciaId !== sessionUser.gerenciaId) {
      return NextResponse.json({ error: "Solo puede justificar su gerencia" }, { status: 403 });
    }
  }

  const estadoOriginal = asistencia.estadoEntrada;

  const updated = await prisma.asistencia.update({
    where: { id: asistencia.id },
    data: {
      estadoEntrada: "JUSTIFICADO",
      estadoOriginal,
      justificacionDoc: justificacionDoc ?? null,
      justificacionObs,
      autorizadorId: Number(sessionUser.id),
      actualizadoEn: new Date(),
    },
  });

  await audit("JUSTIFICAR", `${asistencia.empleado.cedula} ${estadoOriginal} → JUSTIFICADO · ${justificacionObs}`, {
    usuarioId: Number(sessionUser.id),
  });

  return NextResponse.json(updated);
}