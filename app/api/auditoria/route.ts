// app/api/auditoria/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user || !["ADMIN", "RRHH"].includes((session.user as any).rol)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const logs = await prisma.logAuditoria.findMany({
    orderBy: { ts: 'desc' },
    include: { usuario: { select: { username: true } } },
    take: 200 // Limitar resultados por defecto
  });
  
  return NextResponse.json(logs);
}
