// app/api/asistencias/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Prisma, EstadoEntrada } from "@prisma/client";
import { getVenezuelaDate, toDateOnly, parseTime } from "@/lib/date-utils";
import { autoMarkRange, requiereMarcado } from "@/lib/auto-marcado";
import { extrasJornadaH } from "@/lib/jornada";
import { getScope, SCOPE_DENIED_BODY } from "@/lib/scope";
import { EMPLEADO_PUBLIC_SELECT } from "@/lib/empleado-select";

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

  const sessionUser = session.user as SessionUser;
  const scope = getScope(sessionUser);
  if (scope.tipo === "denegado") return NextResponse.json(SCOPE_DENIED_BODY, { status: 403 });

  const { searchParams } = new URL(req.url);
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");
  const empleadoId = searchParams.get("empleadoId");
  const empleadoCedula = searchParams.get("empleadoCedula");
  const gerenciaId = searchParams.get("gerenciaId");
  const gerencia = searchParams.get("gerencia"); // backward compat: nombre de gerencia
  const estado = searchParams.get("estado");
  // Tope de filas: un rango cerrado (desde+hasta) es un reporte y trae todo el
  // rango hasta el tope duro; sin rango, 500. Si se recorta, se avisa con
  // X-Truncado / X-Total-Count para que la UI no muestre totales incompletos.
  const MAX_FILAS = 10000;
  const takeDefault = desde && hasta ? MAX_FILAS : 500;
  const take = Math.min(Math.max(Number(searchParams.get("take")) || takeDefault, 1), MAX_FILAS);

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
    // Cédula inexistente: sin filtro devolvería las asistencias de todos.
    if (!emp) return NextResponse.json([], { headers: { "X-Total-Count": "0", "X-Truncado": "false" } });
    where.empleadoId = emp.id;
  } else if (empleadoId) {
    where.empleadoId = Number(empleadoId);
  }
  // estado=TARDE (uno) o estados=TARDE,FALTA (varios)
  const ESTADOS_VALIDOS = new Set(Object.values(EstadoEntrada) as string[]);
  const estados = (searchParams.get("estados") ?? estado ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => ESTADOS_VALIDOS.has(s)) as EstadoEntrada[];
  if (estados.length === 1) where.estadoEntrada = estados[0];
  else if (estados.length > 1) where.estadoEntrada = { in: estados };

  // Buscador: nombre, apellido o cédula del empleado
  const q = searchParams.get("q")?.trim();

  // Resolver gerenciaId desde gerencia (nombre) si se proporciona
  let resolvedGerenciaId: number | null = null;
  if (gerenciaId) {
    resolvedGerenciaId = Number(gerenciaId);
  } else if (gerencia) {
    const g = await prisma.gerencia.findUnique({ where: { nombre: gerencia }, select: { id: true } });
    if (g) resolvedGerenciaId = g.id;
  }

  const gerenciaFiltro = scope.tipo === "gerencia" ? scope.gerenciaId : resolvedGerenciaId;
  const empleadoWhere: Prisma.EmpleadoWhereInput = {};
  if (gerenciaFiltro) empleadoWhere.gerenciaId = gerenciaFiltro;
  if (q) {
    empleadoWhere.OR = [
      { nombre: { contains: q, mode: "insensitive" } },
      { apellido: { contains: q, mode: "insensitive" } },
      { cedula: { contains: q } },
    ];
  }
  if (Object.keys(empleadoWhere).length) where.empleado = empleadoWhere;

  // Reconciliar: vacaciones/reposos vigentes en el rango (hasta hoy como máximo) deben tener su fila,
  // aunque el empleado nunca haya fichado y el permiso se haya creado antes del auto-marcado.
  try {
    const hoyD = toDateOnly(getVenezuelaDate());
    const rIni = desde ? new Date(desde) : hoyD;
    const rFinReq = hasta ? new Date(hasta) : hoyD;
    const rFin = rFinReq > hoyD ? hoyD : rFinReq;
    if (rIni <= rFin) {
      const empIds = typeof where.empleadoId === "number"
        ? [where.empleadoId]
        : Array.isArray((where.empleadoId as { in?: number[] } | undefined)?.in)
          ? (where.empleadoId as { in: number[] }).in
          : undefined;
      // Mismo alcance que la consulta: un gerente no debe disparar escrituras en otras gerencias.
      const solape = {
        anulada: false,
        inicio: { lte: rFin },
        fin: { gte: rIni },
        ...(empIds ? { empleadoId: { in: empIds } } : {}),
        ...(gerenciaFiltro ? { empleado: { gerenciaId: gerenciaFiltro } } : {}),
      };
      const sel = { empleadoId: true, inicio: true, fin: true } as const;
      const [vacs, reps] = await Promise.all([
        prisma.vacacionEmpleado.findMany({ where: solape, select: sel }),
        prisma.reposoMedico.findMany({ where: solape, select: sel }),
      ]);
      const pendientes = [
        ...vacs.map((p) => ({ ...p, estado: "VACACIONES" as const })),
        ...reps.map((p) => ({ ...p, estado: "REPOSO_MEDICO" as const })),
      ].map((p) => ({ ...p, inicio: p.inicio > rIni ? p.inicio : rIni, fin: p.fin < rFin ? p.fin : rFin }));

      if (pendientes.length) {
        // Una sola lectura de lo ya marcado; solo se escribe para los permisos con huecos
        // (antes eran varias consultas por día y por permiso en cada carga del reporte).
        const existentes = await prisma.asistencia.findMany({
          where: { empleadoId: { in: Array.from(new Set(pendientes.map((p) => p.empleadoId))) }, fecha: { gte: rIni, lte: rFin } },
          select: { empleadoId: true, fecha: true, entrada: true, estadoEntrada: true },
        });
        const porEmpleado = new Map<number, Map<string, { entrada: Date | null; estadoEntrada: string }>>();
        for (const a of existentes) {
          if (!porEmpleado.has(a.empleadoId)) porEmpleado.set(a.empleadoId, new Map());
          porEmpleado.get(a.empleadoId)!.set(a.fecha.toISOString().slice(0, 10), a);
        }
        for (const p of pendientes) {
          if (requiereMarcado(p.estado, p.inicio, p.fin, porEmpleado.get(p.empleadoId) ?? new Map())) {
            await autoMarkRange(prisma as never, p);
          }
        }
      }
    }
  } catch (e) {
    console.error("[asistencias] reconciliación de permisos falló:", e);
  }

  const asistencias = await prisma.asistencia.findMany({
    where,
    include: {
      empleado: { select: EMPLEADO_PUBLIC_SELECT },
      regla: { select: { horaEntrada: true, horaLimite: true, horaReferencia: true } },
      permisoEstudiantil: { select: { horaLimite: true } },
    },
    orderBy: [{ fecha: 'desc' }, { entrada: 'desc' }],
    take,
  });
  const total = asistencias.length === take ? await prisma.asistencia.count({ where }) : asistencias.length;
  const headers = { "X-Total-Count": String(total), "X-Truncado": String(total > asistencias.length) };

  // Quién justificó / autorizó (autorizadorId no tiene relación en el esquema)
  const autorizadorIds = Array.from(new Set(asistencias.map((a) => a.autorizadorId).filter((x): x is number => x != null)));
  const autorizadores = autorizadorIds.length
    ? new Map((await prisma.usuario.findMany({ where: { id: { in: autorizadorIds } }, select: { id: true, username: true } })).map((u) => [u.id, u.username]))
    : new Map<number, string>();

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
        if (a.estadoEntrada === "FERIADO" || a.estadoEntrada === "VACACIONES" || a.estadoEntrada === "REPOSO_MEDICO") {
          const diffMin = Math.floor((nowVE.getTime() - a.entrada.getTime()) / 60000);
          calculatedExtras = diffMin > 0 ? diffMin / 60 : 0;
        } else {
          // Misma regla que la salida real (lib/fichaje.ts): se descuenta el retraso,
          // salvo el que cubre un permiso estudiantil aplicado.
          calculatedExtras = extrasJornadaH({
            entradaMin: a.entrada.getHours() * 60 + a.entrada.getMinutes(),
            salidaMin: horaActualMin,
            horaEntradaMin: parseTime(a.permisoEstudiantil?.horaLimite ?? a.regla.horaEntrada),
            horaReferenciaMin: parseTime(a.regla.horaReferencia),
          });
        }
      }

      return {
        ...a,
        fecha: fechaStr,
        entrada: hhmm(a.entrada),
        salida: hhmm(a.salida),
        extrasH: calculatedExtras,
        autorizador: a.autorizadorId != null ? autorizadores.get(a.autorizadorId) ?? null : null,
      };
    }),
    { headers }
  );
}