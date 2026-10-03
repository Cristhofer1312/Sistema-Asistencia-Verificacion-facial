// app/api/fichaje/route.ts
// Endpoint para registrar asistencias desde el Kiosco
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/auditoria";

function parseTime(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function getVenezuelaDate(): Date {
  // Venezuela is UTC-4 (no DST)
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc - 4 * 3600000);
}

function toDateOnly(date: Date): Date {
  // Use UTC to match Prisma @db.Date which stores at 00:00:00 UTC
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || authHeader !== `Bearer ${process.env.API_KIOSCO_KEY}`) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { empleadoId } = body;

    if (!empleadoId) {
      return NextResponse.json({ error: "empleadoId requerido" }, { status: 400 });
    }

    const empleado = await prisma.empleado.findUnique({
      where: { id: Number(empleadoId) },
      include: { gerencia: true },
    });

    if (!empleado || !empleado.activo) {
      return NextResponse.json({ error: "Empleado no encontrado o inactivo" }, { status: 404 });
    }

    // Obtener regla vigente (la que tiene vigenciaDesde <= hoy, la más reciente)
    const nowVE = getVenezuelaDate();
    const hoy = toDateOnly(nowVE);

    const regla = await prisma.reglaAsistencia.findFirst({
      where: { vigenciaDesde: { lte: nowVE } },
      orderBy: { vigenciaDesde: 'desc' },
    });

    if (!regla) {
      return NextResponse.json({ error: "No hay reglas de asistencia configuradas" }, { status: 500 });
    }

    // Verificar si hoy es feriado
    const feriado = await prisma.feriado.findUnique({
      where: { fecha: hoy },
    });

    // Verificar si empleado está de vacaciones hoy
    const vacacion = await prisma.vacacionEmpleado.findFirst({
      where: {
        empleadoId: empleado.id,
        inicio: { lte: hoy },
        fin: { gte: hoy },
      },
    });

    // Reposo médico vigente: no se registra fichaje
    const reposo = await prisma.reposoMedico.findFirst({
      where: {
        empleadoId: empleado.id,
        inicio: { lte: hoy },
        fin: { gte: hoy },
      },
    });
    if (reposo) {
      return NextResponse.json({
        msg: `${empleado.nombre} ${empleado.apellido} está de REPOSO MÉDICO hasta el ${reposo.fin.toISOString().slice(0, 10)}. No debe marcar.`,
        tipo: "reposo_medico"
      }, { status: 403 });
    }

    // Verificar cooldown por empleado
    const ultimaAsistencia = await prisma.asistencia.findFirst({
      where: { empleadoId: empleado.id, fecha: hoy },
      orderBy: { creadoEn: 'desc' },
    });

    if (ultimaAsistencia && ultimaAsistencia.entrada) {
      const diffMin = Math.floor((nowVE.getTime() - ultimaAsistencia.entrada.getTime()) / 60000);
      if (diffMin < regla.cooldownMin) {
        return NextResponse.json({
          msg: `Cooldown activo: espere ${regla.cooldownMin - diffMin} min para volver a marcar`,
          tipo: "cooldown"
        }, { status: 429 });
      }
    }

    if (ultimaAsistencia) {
      // Tiene registro hoy
      if (ultimaAsistencia.salida) {
        return NextResponse.json({
          msg: "Ya ha registrado su entrada y salida por hoy",
          tipo: "duplicado"
        }, { status: 400 });
      }

      // Procesar salida
      const horaActualMin = nowVE.getHours() * 60 + nowVE.getMinutes();
      const horaRefMin = parseTime(regla.horaReferencia);
      
      let estadoSalida: "COMPLETADO" | "TEMPRANO" = "COMPLETADO";
      let extrasH = 0;

      if (ultimaAsistencia.estadoEntrada === "FERIADO" || ultimaAsistencia.estadoEntrada === "VACACIONES") {
        // No aplica regla de salida; todo el tiempo trabajado es extra
        estadoSalida = "COMPLETADO";
        const entradaTime = ultimaAsistencia.entrada ? ultimaAsistencia.entrada.getTime() : nowVE.getTime();
        const diffMin = Math.floor((nowVE.getTime() - entradaTime) / 60000);
        extrasH = diffMin > 0 ? diffMin / 60 : 0;
      } else {
        estadoSalida = horaActualMin < horaRefMin ? "TEMPRANO" : "COMPLETADO";
        if (horaActualMin > horaRefMin) {
          extrasH = (horaActualMin - horaRefMin) / 60;
        }
      }
      
      const updated = await prisma.asistencia.update({
        where: { id: ultimaAsistencia.id },
        data: {
          salida: nowVE,
          estadoSalida,
          extrasH,
          actualizadoEn: nowVE,
        },
      });

      await audit("FICHAJE_SALIDA", `Salida registrada para ${empleado.cedula} (${estadoSalida})`);

      return NextResponse.json({
        msg: `Salida registrada — ${estadoSalida === "COMPLETADO" && (ultimaAsistencia.estadoEntrada === "FERIADO" || ultimaAsistencia.estadoEntrada === "VACACIONES") ? ultimaAsistencia.estadoEntrada : estadoSalida}`,
        tipo: (ultimaAsistencia.estadoEntrada === "FERIADO" || ultimaAsistencia.estadoEntrada === "VACACIONES") ? "completado" : (estadoSalida === "TEMPRANO" ? "temprano" : "completado"),
        extras: extrasH
      });
    }

    // Es Entrada
    // Feriado: entrada directa como FERIADO (todas las horas extra)
    if (feriado) {
      await prisma.asistencia.create({
        data: {
          empleadoId: empleado.id,
          fecha: hoy,
          entrada: nowVE,
          estadoEntrada: "FERIADO",
          reglaId: regla.id,
        },
      });

      await audit("FICHAJE_ENTRADA", `Entrada registrada para ${empleado.cedula} (FERIADO)`);

      return NextResponse.json({
        msg: `Entrada registrada — FERIADO (${feriado.motivo})`,
        tipo: "feriado"
      });
    }

    // Vacaciones: entrada directa como VACACIONES
    if (vacacion) {
      await prisma.asistencia.create({
        data: {
          empleadoId: empleado.id,
          fecha: hoy,
          entrada: nowVE,
          estadoEntrada: "VACACIONES",
          reglaId: regla.id,
        },
      });

      await audit("FICHAJE_ENTRADA", `Entrada registrada para ${empleado.cedula} (VACACIONES)`);

      return NextResponse.json({
        msg: `Entrada registrada — VACACIONES`,
        tipo: "vacaciones"
      });
    }

    // Lógica normal de entrada
    const horaActualMin = nowVE.getHours() * 60 + nowVE.getMinutes();
    const minLimite = parseTime(regla.horaLimite);

    let estadoEntrada: "A_TIEMPO" | "TARDE" | "FALTA" | "JUSTIFICADO" = "A_TIEMPO";

    if (horaActualMin > minLimite + regla.margenMin) {
      estadoEntrada = "FALTA";
    } else if (horaActualMin > minLimite) {
      estadoEntrada = "TARDE";
    }

    // Verificar pases previos
    const pase = await prisma.pasePrevio.findFirst({
      where: { empleadoId: empleado.id, fecha: hoy, autorizado: false },
    });

    let estadoOriginal: "TARDE" | "FALTA" | null = null;
    let paseUsado: { motivo: string; autorizadorId: number | null } | null = null;

    if (pase && (estadoEntrada === "FALTA" || estadoEntrada === "TARDE")) {
      // Si tiene pase, lo convertimos en JUSTIFICADO conservando el estado original
      estadoOriginal = estadoEntrada;
      paseUsado = { motivo: pase.motivo, autorizadorId: pase.autorizadorId ?? null };
      estadoEntrada = "JUSTIFICADO";
      await prisma.pasePrevio.update({
        where: { id: pase.id },
        data: { autorizado: true },
      });
    } else if (!pase && estadoEntrada === "FALTA") {
      return NextResponse.json({
        msg: "Fuera de horario — requiere autorización",
        tipo: "fuera_de_margen"
      }, { status: 403 });
    }

    await prisma.asistencia.create({
      data: {
        empleadoId: empleado.id,
        fecha: hoy,
        entrada: nowVE,
        estadoEntrada,
        estadoOriginal,
        ...(paseUsado && {
          justificacionObs: `Pase previo: ${paseUsado.motivo}`,
          autorizadorId: paseUsado.autorizadorId,
        }),
        reglaId: regla.id,
      },
    });

    await audit("FICHAJE_ENTRADA", `Entrada registrada para ${empleado.cedula} (${estadoEntrada})`);

    return NextResponse.json({
      msg: `Entrada registrada — ${estadoEntrada}`,
      tipo: estadoEntrada.toLowerCase()
    });

  } catch (error) {
    console.error("Error en fichaje:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}