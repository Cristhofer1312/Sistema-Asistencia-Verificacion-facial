// app/api/reposos/reactivar/route.ts — Reactiva un reposo anulado.
// Los días hábiles del rango vuelven a REPOSO_MEDICO: las FALTAS que dejó la
// anulación se convierten y los días que faltan se crean (autoMarkRange).
// Los días con marcaje real y las faltas ya justificadas no se tocan.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { audit } from "@/lib/auditoria";
import { autoMarkRange, solapeConOtroPermiso } from "@/lib/auto-marcado";
import { z } from "zod";

const reactivarSchema = z.object({
  id: z.number().int().positive(),
});

const iso = (d: Date) => d.toISOString().slice(0, 10);

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

  const parsed = reactivarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Datos inválidos" },
      { status: 400 }
    );
  }

  const reposo = await prisma.reposoMedico.findUnique({
    where: { id: parsed.data.id },
    include: { empleado: { select: { cedula: true } } },
  });
  if (!reposo) {
    return NextResponse.json({ error: "Reposo no encontrado" }, { status: 404 });
  }
  if (!reposo.anulada) {
    return NextResponse.json({ error: "Este reposo no está anulado" }, { status: 400 });
  }

  // Mientras estuvo anulado pudo cargarse otro reposo o vacación en esas fechas
  const otroReposo = await prisma.reposoMedico.findFirst({
    where: { empleadoId: reposo.empleadoId, anulada: false, id: { not: reposo.id }, inicio: { lte: reposo.fin }, fin: { gte: reposo.inicio } },
  });
  const cruce = otroReposo
    ? { tipo: "reposo médico", inicio: otroReposo.inicio, fin: otroReposo.fin }
    : await solapeConOtroPermiso(prisma, {
        empleadoId: reposo.empleadoId,
        inicio: reposo.inicio,
        fin: reposo.fin,
        excluir: { tipo: "reposo", id: reposo.id },
      });
  if (cruce) {
    return NextResponse.json(
      { error: `No se puede reactivar: se solapa con ${cruce.tipo} vigente ${iso(cruce.inicio)} → ${iso(cruce.fin)}` },
      { status: 400 }
    );
  }

  const motivoAnterior = reposo.motivoAnulacion;
  await prisma.reposoMedico.update({
    where: { id: reposo.id },
    data: { anulada: false, motivoAnulacion: null, anuladoPorId: null, anuladoEn: null },
  });

  const marc = await autoMarkRange(prisma, {
    empleadoId: reposo.empleadoId,
    estado: "REPOSO_MEDICO",
    inicio: reposo.inicio,
    fin: reposo.fin,
  });

  await audit(
    "REACTIVAR_REPOSO",
    `Reposo reactivado: ${reposo.empleado.cedula} ${iso(reposo.inicio)} → ${iso(reposo.fin)}${motivoAnterior ? ` · anulado antes por: ${motivoAnterior}` : ""} (${marc.convertidas} falta(s) → reposo, ${marc.creadas} día(s) marcado(s))`,
    { usuarioId: Number(sessionUser.id) }
  );

  return NextResponse.json({ ok: true, id: reposo.id, ...marc });
}
