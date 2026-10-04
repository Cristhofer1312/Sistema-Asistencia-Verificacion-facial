// app/api/feriados/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/auditoria";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { autoMarkFeriado, revertRange } from "@/lib/auto-marcado";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");

  const where: { motivo?: { contains: string; mode: "insensitive" }; fecha?: { gte?: Date; lte?: Date } } = {};
  if (q) where.motivo = { contains: q, mode: "insensitive" };
  if (desde && hasta) {
    where.fecha = { gte: new Date(desde), lte: new Date(hasta) };
  } else if (desde) {
    where.fecha = { gte: new Date(desde) };
  } else if (hasta) {
    where.fecha = { lte: new Date(hasta) };
  }

  const feriados = await prisma.feriado.findMany({
    where,
    orderBy: { fecha: 'desc' },
    take: 500,
  });
  return NextResponse.json(feriados);
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user || !["ADMIN", "RRHH"].includes((session.user as any).rol)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  const feriado = await prisma.feriado.findUnique({ where: { id: Number(id) } });
  if (!feriado) return NextResponse.json({ error: "Feriado no encontrado" }, { status: 404 });

  await prisma.feriado.delete({ where: { id: Number(id) } });

  // Revierte las marcas FERIADO sin marcaje recalculando (vacación/reposo vigente manda)
  const rev = await revertRange(prisma, { estado: "FERIADO", inicio: feriado.fecha, fin: feriado.fecha });

  await audit("ELIMINAR_FERIADO", `Feriado eliminado: ${feriado.fecha.toISOString().split('T')[0]} - ${feriado.motivo} (${rev.revertidas} revertida(s), ${rev.borradas} borrada(s))`, {
    usuarioId: Number((session.user as any).id),
  });

  return NextResponse.json({ ok: true, ...rev });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user || !["ADMIN", "RRHH"].includes((session.user as any).rol)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { fecha, motivo } = await req.json();

  try {
    const feriado = await prisma.feriado.create({
      data: {
        fecha: new Date(fecha),
        motivo
      }
    });

    // Marcado automático del día a los activos sin fila (respeta marcas individuales)
    const marc = await autoMarkFeriado(prisma, new Date(fecha));

    await audit("CREAR_FERIADO", `Creado feriado: ${fecha} - ${motivo} (${marc.creadas} día(s) marcado(s))`, { usuarioId: Number((session.user as any).id) });
    return NextResponse.json({ ...feriado, diasMarcados: marc.creadas }, { status: 201 });
  } catch (err: any) {
    if (err.code === "P2002") {
      return NextResponse.json({ error: "Ya existe un feriado en esa fecha" }, { status: 400 });
    }
    return NextResponse.json({ error: "Error creando feriado" }, { status: 500 });
  }
}
