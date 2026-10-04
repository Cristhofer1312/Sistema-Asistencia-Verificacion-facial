// app/api/vacaciones/anular/route.ts — Anula (no elimina) unas vacaciones con motivo obligatorio
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { audit } from "@/lib/auditoria";
import { revertRange } from "@/lib/auto-marcado";
import { z } from "zod";

const anularSchema = z.object({
  id: z.number().int().positive(),
  motivoAnulacion: z.string().trim().min(5, "El motivo de anulación es obligatorio (mínimo 5 caracteres)").max(300),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string; rol?: string } | undefined;
  if (!sessionUser?.id || !["ADMIN", "RRHH"].includes(sessionUser.rol ?? "")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = anularSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Datos inválidos" },
      { status: 400 }
    );
  }

  const { id, motivoAnulacion } = parsed.data;

  const vacacion = await prisma.vacacionEmpleado.findUnique({
    where: { id },
    include: { empleado: { select: { cedula: true, nombre: true, apellido: true } } },
  });
  if (!vacacion) {
    return NextResponse.json({ error: "Vacaciones no encontradas" }, { status: 404 });
  }
  if (vacacion.anulada) {
    return NextResponse.json({ error: "Estas vacaciones ya están anuladas" }, { status: 400 });
  }

  const anulada = await prisma.vacacionEmpleado.update({
    where: { id },
    data: {
      anulada: true,
      motivoAnulacion,
      anuladoPorId: Number(sessionUser.id),
      anuladoEn: new Date(),
    },
  });

  // Revierte las marcas automáticas recalculando lo que corresponda por día
  const rev = await revertRange(prisma, {
    empleadoId: vacacion.empleadoId,
    estado: "VACACIONES",
    inicio: vacacion.inicio,
    fin: vacacion.fin,
  });

  await audit(
    "ANULAR_VACACION",
    `Vacaciones anuladas: ${vacacion.empleado.cedula} ${vacacion.inicio.toISOString().slice(0, 10)} → ${vacacion.fin.toISOString().slice(0, 10)} · Motivo: ${motivoAnulacion} (${rev.revertidas} revertida(s), ${rev.borradas} borrada(s))`,
    { usuarioId: Number(sessionUser.id) }
  );

  return NextResponse.json({ ok: true, anulada: { id: anulada.id, anulada: true }, ...rev });
}
