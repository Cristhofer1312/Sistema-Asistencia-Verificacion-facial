// app/api/auditoria/route.ts — Consulta del log de auditoría con filtros y paginación en servidor.
// GET ?desde&hasta (YYYY-MM-DD, día de Venezuela) &accion=A,B &usuario=<username|sistema>
//     &q=<texto en detalle> &page=1 &pageSize=50 (máx. 5000, para exportar)
// → { filas, total, page, pageSize, usuarios }
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AccionAuditoria, Prisma } from "@prisma/client";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PAGE_SIZE = 5000;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user || !["ADMIN", "RRHH"].includes((session.user as any).rol)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  const where: Prisma.LogAuditoriaWhereInput = {};

  // Límites del día en hora de Venezuela (UTC-4, sin horario de verano)
  const desde = sp.get("desde");
  const hasta = sp.get("hasta");
  if ((desde && !FECHA.test(desde)) || (hasta && !FECHA.test(hasta))) {
    return NextResponse.json({ error: "Fecha inválida (YYYY-MM-DD)" }, { status: 400 });
  }
  if (desde || hasta) {
    where.ts = {
      ...(desde ? { gte: new Date(`${desde}T00:00:00-04:00`) } : {}),
      ...(hasta ? { lte: new Date(`${hasta}T23:59:59.999-04:00`) } : {}),
    };
  }

  const validas = new Set(Object.values(AccionAuditoria) as string[]);
  const acciones = (sp.get("accion") ?? "").split(",").map((a) => a.trim()).filter((a) => validas.has(a)) as AccionAuditoria[];
  if (acciones.length) where.accion = { in: acciones };

  const usuario = sp.get("usuario")?.trim();
  if (usuario === "sistema") where.usuarioId = null;
  else if (usuario) where.usuario = { username: usuario };

  const q = sp.get("q")?.trim();
  if (q) where.detalle = { contains: q, mode: "insensitive" };

  const page = Math.max(1, Math.floor(Number(sp.get("page")) || 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(sp.get("pageSize")) || 50)));

  const [filas, total, usuarios] = await Promise.all([
    prisma.logAuditoria.findMany({
      where,
      orderBy: [{ ts: "desc" }, { id: "desc" }],
      include: { usuario: { select: { username: true } } },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.logAuditoria.count({ where }),
    prisma.usuario.findMany({ select: { username: true }, orderBy: { username: "asc" } }),
  ]);

  return NextResponse.json({ filas, total, page, pageSize, usuarios: usuarios.map((u) => u.username) });
}
