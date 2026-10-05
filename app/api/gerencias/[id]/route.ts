// app/api/gerencias/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const rol = (session?.user as any)?.rol;
  if (!session || (rol !== "ADMIN" && rol !== "RRHH")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  try {
    const { nombre } = await req.json();
    if (!nombre || typeof nombre !== "string" || nombre.trim().length < 2) {
      return NextResponse.json({ error: "Nombre inválido" }, { status: 400 });
    }

    const exists = await prisma.gerencia.findFirst({
      where: { 
        nombre: nombre.trim(),
        NOT: { id }
      }
    });

    if (exists) {
      return NextResponse.json({ error: "Ya existe otra gerencia con este nombre" }, { status: 409 });
    }

    const updated = await prisma.gerencia.update({
      where: { id },
      data: { nombre: nombre.trim() }
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    if (error.code === 'P2025') {
      return NextResponse.json({ error: "Gerencia no encontrada" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const rol = (session?.user as any)?.rol;
  if (!session || (rol !== "ADMIN" && rol !== "RRHH")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  try {
    // Check dependencies (usuarios, empleados)
    const gerencia = await prisma.gerencia.findUnique({
      where: { id },
      include: {
        _count: {
          select: { usuarios: true, empleados: true }
        }
      }
    });

    if (!gerencia) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

    if (gerencia._count.usuarios > 0 || gerencia._count.empleados > 0) {
      return NextResponse.json({ 
        error: `No se puede eliminar porque tiene ${gerencia._count.empleados} empleados y ${gerencia._count.usuarios} usuarios asignados.` 
      }, { status: 409 });
    }

    await prisma.gerencia.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
