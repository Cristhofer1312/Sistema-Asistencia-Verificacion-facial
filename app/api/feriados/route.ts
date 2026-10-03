// app/api/feriados/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/auditoria";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const feriados = await prisma.feriado.findMany({
    orderBy: { fecha: 'desc' }
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

  await audit("ELIMINAR_FERIADO", `Feriado eliminado: ${feriado.fecha.toISOString().split('T')[0]} - ${feriado.motivo}`, {
    usuarioId: Number((session.user as any).id),
  });

  return NextResponse.json({ ok: true });
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

    await audit("CREAR_FERIADO", `Creado feriado: ${fecha} - ${motivo}`, { usuarioId: Number((session.user as any).id) });
    return NextResponse.json(feriado, { status: 201 });
  } catch (err: any) {
    if (err.code === "P2002") {
      return NextResponse.json({ error: "Ya existe un feriado en esa fecha" }, { status: 400 });
    }
    return NextResponse.json({ error: "Error creando feriado" }, { status: 500 });
  }
}
