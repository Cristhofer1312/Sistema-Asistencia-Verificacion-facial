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