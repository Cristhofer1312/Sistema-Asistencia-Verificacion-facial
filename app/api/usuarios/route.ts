import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { audit } from "@/lib/auditoria";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).rol !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const usuarios = await prisma.usuario.findMany({
    include: { gerencia: true },
    orderBy: { id: 'asc' }
  });

  const safeUsers = usuarios.map(({ passwordHash, ...user }) => user);
  return NextResponse.json(safeUsers);
}

const createSchema = z.object({
  username: z.string().min(3),
  rol: z.enum(["ADMIN", "RRHH", "GERENTE", "COORDINADOR"]),
  gerenciaId: z.number().optional().nullable(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).rol !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const { username, rol, gerenciaId } = parsed.data;

  const existing = await prisma.usuario.findUnique({ where: { username } });
  if (existing) return NextResponse.json({ error: "El usuario ya existe" }, { status: 400 });

  // Contraseña por defecto: Cambiar1234!
  const passwordHash = await bcrypt.hash("Cambiar1234!", 12);

  const newUser = await prisma.usuario.create({
    data: {
      username,
      rol,
      gerenciaId,
      passwordHash,
      claveInicial: true,
      activo: true
    }
  });

  await audit("CREAR_USUARIO", `Usuario creado: ${username} (${rol})`, { usuarioId: Number((session.user as any).id) });

  const { passwordHash: _, ...safeUser } = newUser;
  return NextResponse.json(safeUser, { status: 201 });
}
