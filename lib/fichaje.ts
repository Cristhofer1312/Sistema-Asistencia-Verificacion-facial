// lib/fichaje.ts — Lógica de fichaje (validaciones de horario) compartida.
// Vive fuera de route.ts porque Next.js no permite exports adicionales en rutas.
// La usa POST /api/kiosco/match y los unit tests de horarios.
import { prisma } from "./prisma";
import { audit } from "./auditoria";

function parseTimeStr(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

export async function executeFichaje(empleadoId: number, nowVE: Date, hoy: Date): Promise<{ tipo: string; msg: string; extrasH?: number }> {
  const empleado = await prisma.empleado.findUnique({
    where: { id: empleadoId },
    include: { gerencia: true },
  });

  if (!empleado || !empleado.activo) {
    throw new Error("Empleado no encontrado o inactivo");
  }

  const regla = await prisma.reglaAsistencia.findFirst({
    where: { vigenciaDesde: { lte: nowVE } },
    orderBy: { vigenciaDesde: "desc" },
  });

  if (!regla) throw new Error("No hay reglas de asistencia configuradas");

  const feriado = await prisma.feriado.findUnique({ where: { fecha: hoy } });
  const vacacion = await prisma.vacacionEmpleado.findFirst({
    where: { empleadoId, inicio: { lte: hoy }, fin: { gte: hoy } },
  });
  const reposo = await prisma.reposoMedico.findFirst({
    where: { empleadoId, inicio: { lte: hoy }, fin: { gte: hoy } },
  });

  if (reposo) {
    return {
      tipo: "reposo_medico",
      msg: `${empleado.nombre} ${empleado.apellido} está de REPOSO MÉDICO hasta el ${reposo.fin.toISOString().slice(0, 10)}. No debe marcar.`,
    };
  }

  const ultimaAsistencia = await prisma.asistencia.findFirst({
    where: { empleadoId, fecha: hoy },
    orderBy: { creadoEn: "desc" },
  });

  if (ultimaAsistencia && ultimaAsistencia.entrada) {
    const diffMin = Math.floor((nowVE.getTime() - ultimaAsistencia.entrada.getTime()) / 60000);
    if (diffMin < regla.cooldownMin) {
      throw new Error(`COOLDOWN:${regla.cooldownMin - diffMin}`);
    }
  }

  if (ultimaAsistencia) {
    if (ultimaAsistencia.salida) {
      throw new Error("DUPLICADO:Ya ha registrado su entrada y salida por hoy");
    }

    const horaActualMin = nowVE.getHours() * 60 + nowVE.getMinutes();
    const horaRefMin = parseTimeStr(regla.horaReferencia);

    let estadoSalida: "COMPLETADO" | "TEMPRANO" = "COMPLETADO";
    let extrasH = 0;

    if (ultimaAsistencia.estadoEntrada === "FERIADO" || ultimaAsistencia.estadoEntrada === "VACACIONES") {
      estadoSalida = "COMPLETADO";
      const entradaTime = ultimaAsistencia.entrada ? ultimaAsistencia.entrada.getTime() : nowVE.getTime();
      const diffMin = Math.floor((nowVE.getTime() - entradaTime) / 60000);
      extrasH = diffMin > 0 ? diffMin / 60 : 0;
    } else {
      estadoSalida = horaActualMin < horaRefMin ? "TEMPRANO" : "COMPLETADO";
      if (horaActualMin > horaRefMin) extrasH = (horaActualMin - horaRefMin) / 60;
    }

    await prisma.asistencia.update({
      where: { id: ultimaAsistencia.id },
      data: { salida: nowVE, estadoSalida, extrasH, actualizadoEn: nowVE },
    });

    await audit("FICHAJE_SALIDA", `Salida registrada para ${empleado.cedula} (${estadoSalida})`);

    return {
      tipo: (ultimaAsistencia.estadoEntrada === "FERIADO" || ultimaAsistencia.estadoEntrada === "VACACIONES") ? "completado" : (estadoSalida === "TEMPRANO" ? "temprano" : "completado"),
      msg: `Salida registrada — ${estadoSalida === "COMPLETADO" && (ultimaAsistencia.estadoEntrada === "FERIADO" || ultimaAsistencia.estadoEntrada === "VACACIONES") ? ultimaAsistencia.estadoEntrada : estadoSalida}`,
      extrasH,
    };
  }

  // Es Entrada
  if (feriado) {
    await prisma.asistencia.create({
      data: { empleadoId, fecha: hoy, entrada: nowVE, estadoEntrada: "FERIADO", reglaId: regla.id },
    });
    await audit("FICHAJE_ENTRADA", `Entrada registrada para ${empleado.cedula} (FERIADO)`);
    return { tipo: "feriado", msg: `Entrada registrada — FERIADO (${feriado.motivo})` };
  }

  if (vacacion) {
    await prisma.asistencia.create({
      data: { empleadoId, fecha: hoy, entrada: nowVE, estadoEntrada: "VACACIONES", reglaId: regla.id },
    });
    await audit("FICHAJE_ENTRADA", `Entrada registrada para ${empleado.cedula} (VACACIONES)`);
    return { tipo: "vacaciones", msg: "Entrada registrada — VACACIONES" };
  }

  const horaActualMin = nowVE.getHours() * 60 + nowVE.getMinutes();
  const minLimite = parseTimeStr(regla.horaLimite);

  let estadoEntrada: "A_TIEMPO" | "TARDE" | "FALTA" | "JUSTIFICADO" = "A_TIEMPO";

  if (horaActualMin > minLimite + regla.margenMin) {
    estadoEntrada = "FALTA";
  } else if (horaActualMin > minLimite) {
    estadoEntrada = "TARDE";
  }

  const pase = await prisma.pasePrevio.findFirst({
    where: { empleadoId, fecha: hoy, autorizado: false },
  });

  let estadoOriginal: "TARDE" | "FALTA" | null = null;
  let paseUsado: { motivo: string; autorizadorId: number | null } | null = null;

  if (pase && (estadoEntrada === "FALTA" || estadoEntrada === "TARDE")) {
    estadoOriginal = estadoEntrada;
    paseUsado = { motivo: pase.motivo, autorizadorId: pase.autorizadorId ?? null };
    estadoEntrada = "JUSTIFICADO";
    await prisma.pasePrevio.update({ where: { id: pase.id }, data: { autorizado: true } });
  } else if (!pase && estadoEntrada === "FALTA") {
    throw new Error("FUERA_MARGEN:Fuera de horario — requiere autorización");
  }

  await prisma.asistencia.create({
    data: {
      empleadoId,
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

  return { tipo: estadoEntrada.toLowerCase(), msg: `Entrada registrada — ${estadoEntrada}` };
}
