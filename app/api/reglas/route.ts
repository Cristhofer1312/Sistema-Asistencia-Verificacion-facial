// app/api/reglas/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/auditoria";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function parseTime(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

export async function GET() {
  const reglas = await prisma.reglaAsistencia.findMany({
    orderBy: { vigenciaDesde: 'desc' }
  });
  return NextResponse.json(reglas);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user || !["ADMIN", "RRHH"].includes((session.user as any).rol)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { horaEntrada, horaLimite, horaReferencia, cooldownMin, vigenciaDesde } = await req.json();

  if (!horaEntrada || !horaLimite || !horaReferencia) {
    return NextResponse.json({ error: "Hora de entrada, hora límite y referencia son obligatorias (HH:MM)" }, { status: 400 });
  }
  if (cooldownMin < 0) {
    return NextResponse.json({ error: "El cooldown debe ser mayor o igual a 0" }, { status: 400 });
  }
  if (parseTime(horaEntrada) > parseTime(horaLimite)) {
    return NextResponse.json({ error: "La hora de entrada debe ser anterior o igual a la hora límite" }, { status: 400 });
  }
  if (parseTime(horaLimite) >= parseTime(horaReferencia)) {
    return NextResponse.json({ error: "La hora límite debe ser anterior a la hora de referencia" }, { status: 400 });
  }

  try {
    const regla = await prisma.reglaAsistencia.create({
      data: {
        horaEntrada,
        horaLimite,
        horaReferencia,
        cooldownMin,
        vigenciaDesde: new Date(vigenciaDesde),
        creadoPorId: Number((session.user as any).id)
      }
    });

    await audit("CREAR_REGLA", `Nueva regla: entrada ${horaEntrada} · límite ${horaLimite} · ref ${horaReferencia}`, { usuarioId: Number((session.user as any).id) });
    return NextResponse.json(regla, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "Error creando regla" }, { status: 500 });
  }
}
