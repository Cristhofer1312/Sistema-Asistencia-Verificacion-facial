// app/api/reposos/anular/route.ts — Anula (no elimina) un reposo con motivo obligatorio
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

  const reposo = await prisma.reposoMedico.findUnique({
    where: { id },
    include: { empleado: { select: { cedula: true, nombre: true, apellido: true } } },
  });
  if (!reposo) {
    return NextResponse.json({ error: "Reposo no encontrado" }, { status: 404 });
  }
  if (reposo.anulada) {
    return NextResponse.json({ error: "Este reposo ya está anulado" }, { status: 400 });
  }

  const anulado = await prisma.reposoMedico.update({
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
    empleadoId: reposo.empleadoId,
    estado: "REPOSO_MEDICO",
    inicio: reposo.inicio,
    fin: reposo.fin,
  });

  await audit(
    "ANULAR_REPOSO",
    `Reposo anulado: ${reposo.empleado.cedula} ${reposo.inicio.toISOString().slice(0, 10)} → ${reposo.fin.toISOString().slice(0, 10)} · Motivo: ${motivoAnulacion} (${rev.revertidas} revertida(s), ${rev.borradas} borrada(s))`,
    { usuarioId: Number(sessionUser.id) }
  );

  return NextResponse.json({ ok: true, anulado: { id: anulado.id, anulada: true }, ...rev });
}
