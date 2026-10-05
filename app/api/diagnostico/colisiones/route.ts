// app/api/diagnostico/colisiones/route.ts — Reporte de pares de enrolados
// con descriptores peligrosamente cercanos (riesgo de confusión en kiosco).
// Solo ADMIN/RRHH. Uso: GET /api/diagnostico/colisiones?umbral=0.6
// Responde los pares bajo el umbral ordenados por distancia; los marcados
// bajoUmbralMatch indican colisión directa con el umbral del kiosco
// (re-enrolar con buena luz frontal a esas personas).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { bufferToDescriptor } from "@/lib/descriptor-utils";
import { euclideanDistanceServer, MATCH_DISTANCE_THRESHOLD } from "@/lib/face-server";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const rol = (session?.user as any)?.rol as string | undefined;
  if (!session?.user || !["ADMIN", "RRHH"].includes(rol ?? "")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const umbral = Number(searchParams.get("umbral") ?? 0.6);
  if (!Number.isFinite(umbral) || umbral <= 0 || umbral > 1.5) {
    return NextResponse.json({ error: "Umbral inválido (0 < umbral <= 1.5)" }, { status: 400 });
  }

  const rows = await prisma.empleado.findMany({
    where: { activo: true, descriptor: { not: null } },
    select: { id: true, cedula: true, nombre: true, apellido: true, descriptor: true },
  });

  const entries = rows
    .map((e) => {
      try {
        const d = Array.from(bufferToDescriptor(Buffer.from(e.descriptor!)));
        return d.length === 128
          ? { id: e.id, cedula: e.cedula, nombre: e.nombre, apellido: e.apellido, descriptor: d }
          : null;
      } catch {
        return null;
      }
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  const colisiones: Array<{
    a: { id: number; cedula: string; nombre: string; apellido: string };
    b: { id: number; cedula: string; nombre: string; apellido: string };
    distancia: number;
    bajoUmbralMatch: boolean;
  }> = [];

  const pick = (e: (typeof entries)[number]) => ({ id: e.id, cedula: e.cedula, nombre: e.nombre, apellido: e.apellido });

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const dist = euclideanDistanceServer(entries[i].descriptor, entries[j].descriptor);
      if (dist < umbral) {
        colisiones.push({
          a: pick(entries[i]),
          b: pick(entries[j]),
          distancia: Math.round(dist * 10000) / 10000,
          bajoUmbralMatch: dist < MATCH_DISTANCE_THRESHOLD,
        });
      }
    }
  }

  colisiones.sort((x, y) => x.distancia - y.distancia);

  return NextResponse.json({
    umbral,
    umbralMatch: MATCH_DISTANCE_THRESHOLD,
    enrolados: entries.length,
    paresRevisados: (entries.length * (entries.length - 1)) / 2,
    colisiones,
  });
}
