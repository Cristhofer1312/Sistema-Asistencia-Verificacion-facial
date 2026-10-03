// app/api/empleados/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/auditoria";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const user = session.user as any;
  const rol = user.rol;
  const gerenciaId = user.gerenciaId;

  const url = new URL(req.url);
  const qGerenciaId = url.searchParams.get("gerenciaId");

  const where: any = {};
  if (["GERENTE", "COORDINADOR"].includes(rol)) {
    where.gerenciaId = gerenciaId;
  } else if (qGerenciaId) {
    where.gerenciaId = Number(qGerenciaId);
  }

  const empleados = await prisma.empleado.findMany({
    where,
    include: { gerencia: true },
    orderBy: { apellido: 'asc' }
  });

  return NextResponse.json(empleados);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user || !["ADMIN", "RRHH"].includes((session.user as any).rol)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const data = await req.json();
  try {
    const emp = await prisma.empleado.create({ data });
    await audit("CREAR_EMPLEADO", `Creado empleado: ${emp.cedula}`, { usuarioId: Number((session.user as any).id) });
    return NextResponse.json(emp, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Error creando empleado" }, { status: 400 });
  }
}
