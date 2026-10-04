// app/api/admin/cierre-dia/route.ts — Cierre diario (debug): marca faltantes del día
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { audit } from "@/lib/auditoria";
import { marcarFaltantes } from "@/lib/auto-marcado";
import { z } from "zod";

const cierreSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)").optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string; rol?: string } | undefined;
  if (!sessionUser?.id || !["ADMIN", "RRHH"].includes(sessionUser.rol ?? "")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  let body: unknown = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = cierreSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Datos inválidos" },
      { status: 400 }
    );
  }

  try {
    const res = await marcarFaltantes(prisma, { fecha: parsed.data.fecha });
    await audit(
      "FALTA_PROYECTADA",
      `Cierre diario ${res.fecha}: ${res.faltas} falta(s), ${res.feriados} feriado(s), ${res.vacaciones} vacación(es), ${res.reposos} reposo(s), ${res.omitidos} omitido(s)`,
      { usuarioId: Number(sessionUser.id) }
    );
    return NextResponse.json({ ok: true, ...res });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error en cierre diario";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
