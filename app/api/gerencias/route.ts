// app/api/gerencias/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const gerencias = await prisma.gerencia.findMany({
    orderBy: { nombre: 'asc' },
    select: { id: true, nombre: true },
  });

  return NextResponse.json(gerencias);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const rol = (session?.user as any)?.rol;
  if (!session || (rol !== "ADMIN" && rol !== "RRHH")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const { nombre } = await req.json();
    if (!nombre || typeof nombre !== "string" || nombre.trim().length < 2) {
      return NextResponse.json({ error: "Nombre inválido" }, { status: 400 });
    }

    const exists = await prisma.gerencia.findUnique({ where: { nombre: nombre.trim() } });
    if (exists) {
      return NextResponse.json({ error: "La gerencia ya existe" }, { status: 409 });
    }

    const nueva = await prisma.gerencia.create({
      data: { nombre: nombre.trim() }
    });

    return NextResponse.json(nueva, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}