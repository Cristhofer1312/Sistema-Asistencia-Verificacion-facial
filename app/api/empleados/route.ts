// app/api/empleados/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/auditoria";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { getScope, SCOPE_DENIED_BODY } from "@/lib/scope";
import { EMPLEADO_PUBLIC_SELECT } from "@/lib/empleado-select";

// Whitelist: nunca id / descriptor / creadoEn / dadoDeBajaEn desde el cliente
const createSchema = z
  .object({
    cedula: z.string().trim().min(1).max(20),
    nombre: z.string().trim().min(1).max(80),
    apellido: z.string().trim().min(1).max(80),
    cargo: z.string().trim().max(100).default(""),
    gerenciaId: z.number().int().positive(),
    activo: z.boolean().optional(),
  })
  .strip();

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const scope = getScope(session.user as any);
  if (scope.tipo === "denegado") return NextResponse.json(SCOPE_DENIED_BODY, { status: 403 });

  const url = new URL(req.url);
  const qGerenciaId = url.searchParams.get("gerenciaId");

  const where: { gerenciaId?: number } = {};
  if (scope.tipo === "gerencia") {
    where.gerenciaId = scope.gerenciaId;
  } else if (qGerenciaId) {
    const n = Number(qGerenciaId);
    if (!Number.isInteger(n)) return NextResponse.json({ error: "gerenciaId inválido" }, { status: 400 });
    where.gerenciaId = n;
  }

  const empleados = await prisma.empleado.findMany({
    where,
    select: EMPLEADO_PUBLIC_SELECT,
    orderBy: { apellido: 'asc' }
  });

  return NextResponse.json(empleados);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user || !["ADMIN", "RRHH"].includes((session.user as any).rol)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Datos inválidos" }, { status: 400 });
  }

  try {
    const emp = await prisma.empleado.create({
      data: parsed.data,
      select: EMPLEADO_PUBLIC_SELECT,
    });
    await audit("CREAR_EMPLEADO", `Creado empleado: ${emp.cedula}`, { usuarioId: Number((session.user as any).id) });
    return NextResponse.json(emp, { status: 201 });
  } catch (error: any) {
    console.error("Error al crear empleado:", error);
    if (error.code === 'P2002') {
      return NextResponse.json({ error: "Ya existe un empleado registrado con esa cédula" }, { status: 409 });
    }
    return NextResponse.json({ error: `Error creando empleado: ${error.message}` }, { status: 400 });
  }
}
