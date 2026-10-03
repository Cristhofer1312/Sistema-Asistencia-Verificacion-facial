// app/api/asistencias/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { getVenezuelaDate, toDateOnly, parseTime } from "@/lib/date-utils";

interface SessionUser {
  id: string;
  username: string;
  rol: string;
  gerenciaId: number | null;
  gerenciaNombre: string | null;
  claveInicial: boolean;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");
  const empleadoId = searchParams.get("empleadoId");
  const empleadoCedula = searchParams.get("empleadoCedula");
  const gerenciaId = searchParams.get("gerenciaId");
  const gerencia = searchParams.get("gerencia"); // backward compat: nombre de gerencia
  const estado = searchParams.get("estado");

  const where: Prisma.AsistenciaWhereInput = {};

  if (desde && hasta) {
    where.fecha = { gte: new Date(desde), lte: new Date(hasta) };
  } else if (desde) {
    where.fecha = { gte: new Date(desde) };
  } else if (hasta) {
    where.fecha = { lte: new Date(hasta) };
  }

  if (empleadoCedula) {
    const emp = await prisma.empleado.findUnique({ where: { cedula: empleadoCedula }, select: { id: true } });
    if (emp) where.empleadoId = emp.id;
  } else if (empleadoId) {
    where.empleadoId = Number(empleadoId);
  }
  if (estado) where.estadoEntrada = estado as Prisma.EnumEstadoEntradaFilter<"Asistencia">;

  const sessionUser = session.user as SessionUser;
  
  // Resolver gerenciaId desde gerencia (nombre) si se proporciona
  let resolvedGerenciaId: number | null = null;
  if (gerenciaId) {
    resolvedGerenciaId = Number(gerenciaId);
  } else if (gerencia) {
    const g = await prisma.gerencia.findUnique({ where: { nombre: gerencia }, select: { id: true } });
    if (g) resolvedGerenciaId = g.id;
  }

  if (["GERENTE", "COORDINADOR"].includes(sessionUser.rol)) {
    const empleadosGerencia = await prisma.empleado.findMany({
      where: { gerenciaId: sessionUser.gerenciaId ?? undefined },
      select: { id: true },
    });
    where.empleadoId = { in: empleadosGerencia.map(e => e.id) };
  } else if (resolvedGerenciaId) {
    const empleadosGerencia = await prisma.empleado.findMany({
      where: { gerenciaId: resolvedGerenciaId },
      select: { id: true },
    });
    where.empleadoId = { in: empleadosGerencia.map(e => e.id) };
  }

  const asistencias = await prisma.asistencia.findMany({
    where,
    include: {
      empleado: { select: { nombre: true, apellido: true, cedula: true, cargo: true, gerenciaId: true, gerencia: { select: { id: true, nombre: true } } } },
      regla: { select: { horaLimite: true, horaReferencia: true, margenMin: true } },
    },
    orderBy: [{ fecha: 'desc' }, { entrada: 'desc' }],
    take: 500,
  });

  // Normalizar al formato que espera la UI (lib/types.ts#Asistencia):
  // fecha "YYYY-MM-DD", entrada/salida "HH:MM" (hora VE, igual que se calcula en /api/fichaje), extrasH number
  const hhmm = (d: Date | null) =>
    d ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : null;

  const nowVE = getVenezuelaDate();
  const hoyStr = toDateOnly(nowVE).toISOString().slice(0, 10);
  const horaActualMin = nowVE.getHours() * 60 + nowVE.getMinutes();

  return NextResponse.json(
    asistencias.map((a) => {
      const fechaStr = a.fecha.toISOString().slice(0, 10);
      let calculatedExtras = Number(a.extrasH);

      // Calcular horas extras en tiempo real si aún no hay salida y es hoy
      if (!a.salida && a.entrada && fechaStr === hoyStr && a.regla) {
        if (a.estadoEntrada === "FERIADO" || a.estadoEntrada === "VACACIONES") {
          const diffMin = Math.floor((nowVE.getTime() - a.entrada.getTime()) / 60000);
          calculatedExtras = diffMin > 0 ? diffMin / 60 : 0;
        } else {
          const horaRefMin = parseTime(a.regla.horaReferencia);
          if (horaActualMin > horaRefMin) {
            calculatedExtras = (horaActualMin - horaRefMin) / 60;
          }
        }
      }

      return {
        ...a,
        fecha: fechaStr,
        entrada: hhmm(a.entrada),
        salida: hhmm(a.salida),
        extrasH: calculatedExtras,
      };
    })
  );
}