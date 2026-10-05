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
  return await prisma.$transaction(async (tx) => {
    const empleado = await tx.empleado.findUnique({
      where: { id: empleadoId },
      include: { gerencia: true },
    });

    if (!empleado || !empleado.activo) {
      throw new Error("Empleado no encontrado o inactivo");
    }

    const regla = await tx.reglaAsistencia.findFirst({
      where: { vigenciaDesde: { lte: nowVE } },
      orderBy: { vigenciaDesde: "desc" },
    });

    if (!regla) throw new Error("No hay reglas de asistencia configuradas");

    const feriado = await tx.feriado.findUnique({ where: { fecha: hoy } });
    const vacacion = await tx.vacacionEmpleado.findFirst({
      where: { empleadoId, anulada: false, inicio: { lte: hoy }, fin: { gte: hoy } },
    });
    const reposo = await tx.reposoMedico.findFirst({
      where: { empleadoId, anulada: false, inicio: { lte: hoy }, fin: { gte: hoy } },
    });

    // Feriado, vacaciones o reposo: el marcaje se clasifica directo según la clase del día
    const esClaseEspecial = (e: string) => e === "FERIADO" || e === "VACACIONES" || e === "REPOSO_MEDICO";

    const ultimaAsistencia = await tx.asistencia.findFirst({
      where: { empleadoId, fecha: hoy },
      orderBy: { creadoEn: "desc" },
    });

    if (ultimaAsistencia && ultimaAsistencia.entrada) {
      const diffMin = Math.floor((nowVE.getTime() - ultimaAsistencia.entrada.getTime()) / 60000);
      if (diffMin < regla.cooldownMin) {
        throw new Error(`COOLDOWN:${regla.cooldownMin - diffMin}`);
      }
    }

    // Fila automática sin marcaje (vacación/reposo/feriado generado): el escaneo
    // la completa con la entrada conservando el estado. Evita violar el
    // @@unique([empleadoId, fecha]) que un create provocaría.
    if (ultimaAsistencia && !ultimaAsistencia.entrada && esClaseEspecial(ultimaAsistencia.estadoEntrada)) {
      await tx.asistencia.update({
        where: { id: ultimaAsistencia.id },
        data: { entrada: nowVE, reglaId: regla.id, actualizadoEn: nowVE },
      });
      await audit("FICHAJE_ENTRADA", `Entrada sobre marca automática (${ultimaAsistencia.estadoEntrada}): ${empleado.cedula}`);
      const tipoAuto: Record<string, string> = { FERIADO: "feriado", VACACIONES: "vacaciones", REPOSO_MEDICO: "reposo_medico" };
      const tipo = tipoAuto[ultimaAsistencia.estadoEntrada] ?? "a_tiempo";
      return { tipo, msg: `Entrada registrada — ${ultimaAsistencia.estadoEntrada}` };
    }

    if (ultimaAsistencia) {
      // (El cooldown contra la hora de salida ha sido removido a petición del usuario. 
      //  Se mantiene el cooldown contra la entrada original para evitar marcar salida por accidente a los 3 segundos de entrar)

      const horaActualMin = nowVE.getHours() * 60 + nowVE.getMinutes();
      const horaRefMin = parseTimeStr(regla.horaReferencia);

      let estadoSalida: "COMPLETADO" | "TEMPRANO" = "COMPLETADO";
      let extrasH = 0;

      if (esClaseEspecial(ultimaAsistencia.estadoEntrada)) {
        estadoSalida = "COMPLETADO";
        const entradaTime = ultimaAsistencia.entrada ? ultimaAsistencia.entrada.getTime() : nowVE.getTime();
        const diffMin = Math.floor((nowVE.getTime() - entradaTime) / 60000);
        extrasH = diffMin > 0 ? diffMin / 60 : 0;
      } else {
        estadoSalida = horaActualMin < horaRefMin ? "TEMPRANO" : "COMPLETADO";
        if (horaActualMin > horaRefMin) extrasH = (horaActualMin - horaRefMin) / 60;
      }

      await tx.asistencia.update({
        where: { id: ultimaAsistencia.id },
        data: { salida: nowVE, estadoSalida, extrasH, actualizadoEn: nowVE },
      });

      await audit("FICHAJE_SALIDA", `Salida registrada para ${empleado.cedula} (${estadoSalida})`);

      return {
        tipo: esClaseEspecial(ultimaAsistencia.estadoEntrada) ? "completado" : (estadoSalida === "TEMPRANO" ? "temprano" : "completado"),
        msg: `Salida registrada — ${estadoSalida === "COMPLETADO" && esClaseEspecial(ultimaAsistencia.estadoEntrada) ? ultimaAsistencia.estadoEntrada : estadoSalida}`,
        extrasH,
      };
    }

    // Es Entrada
    if (feriado) {
      await tx.asistencia.create({
        data: { empleadoId, fecha: hoy, entrada: nowVE, estadoEntrada: "FERIADO", reglaId: regla.id },
      });
      await audit("FICHAJE_ENTRADA", `Entrada registrada para ${empleado.cedula} (FERIADO)`);
      return { tipo: "feriado", msg: `Entrada registrada — FERIADO (${feriado.motivo})` };
    }

    if (vacacion) {
      await tx.asistencia.create({
        data: { empleadoId, fecha: hoy, entrada: nowVE, estadoEntrada: "VACACIONES", reglaId: regla.id },
      });
      await audit("FICHAJE_ENTRADA", `Entrada registrada para ${empleado.cedula} (VACACIONES)`);
      return { tipo: "vacaciones", msg: "Entrada registrada — VACACIONES" };
    }

    if (reposo) {
      await tx.asistencia.create({
        data: { empleadoId, fecha: hoy, entrada: nowVE, estadoEntrada: "REPOSO_MEDICO", reglaId: regla.id },
      });
      await audit("FICHAJE_ENTRADA", `Entrada registrada para ${empleado.cedula} (REPOSO_MEDICO)`);
      return { tipo: "reposo_medico", msg: "Entrada registrada — REPOSO MÉDICO" };
    }

    const horaActualMin = nowVE.getHours() * 60 + nowVE.getMinutes();
    const minEntrada = parseTimeStr(regla.horaEntrada);
    let minLimite = parseTimeStr(regla.horaLimite);

    // Permiso estudiantil: solo extiende la hora límite general, nunca la recorta.
    // Se evalúa en vivo (no pre-crea filas, no toca cierre/auto-marcado).
    // Feriado/vacación/reposo ya hicieron return arriba: siempre mandan.
    // Si hay varios vigentes hoy, gana el más amplio (orderBy horaLimite desc).
    let permisoEstudiantilId: number | null = null;
    let permisoAplicado: { horaLimite: string; creadoPorId: number | null } | null = null;
    {
      const dow = nowVE.getDay(); // 0=Dom..6=Sáb
      const permiso = await tx.permisoEstudiantil.findFirst({
        where: {
          empleadoId,
          activo: true,
          validoDesde: { lte: hoy },
          validoHasta: { gte: hoy },
          diasSemana: { has: dow },
        },
        orderBy: { horaLimite: "desc" },
      });
      if (permiso && parseTimeStr(permiso.horaLimite) > minLimite) {
        minLimite = parseTimeStr(permiso.horaLimite);
        permisoEstudiantilId = permiso.id;
        permisoAplicado = { horaLimite: permiso.horaLimite, creadoPorId: permiso.creadoPorId ?? null };
      }
    }

    // Ventana de entrada: antes de horaEntrada → TEMPRANO; entre entrada y
    // límite → A_TIEMPO; después del límite → TARDE. FALTA queda reservada
    // para ausencia total (cierre diario / auto-marcado). Sin bloqueos.
    let estadoEntrada: "A_TIEMPO" | "TEMPRANO" | "TARDE" | "FALTA" | "JUSTIFICADO" = "A_TIEMPO";

    if (horaActualMin < minEntrada) {
      estadoEntrada = "TEMPRANO";
    } else if (horaActualMin > minLimite) {
      estadoEntrada = "TARDE";
    }

    const pase = await tx.pasePrevio.findFirst({
      where: { empleadoId, fecha: hoy, autorizado: false },
    });

    let estadoOriginal: "TARDE" | "FALTA" | null = null;
    let paseUsado: { motivo: string; autorizadorId: number | null } | null = null;

    if (pase && estadoEntrada === "TARDE") {
      estadoOriginal = estadoEntrada;
      paseUsado = { motivo: pase.motivo, autorizadorId: pase.autorizadorId ?? null };
      estadoEntrada = "JUSTIFICADO";
      await tx.pasePrevio.update({ where: { id: pase.id }, data: { autorizado: true } });
    }
    // Sin throw FUERA_MARGEN: el fichaje tardío siempre se registra como TARDE.

    const DIA_CORTO = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;
    const permisoObs = permisoAplicado
      ? `Permiso estudiantil (${DIA_CORTO[nowVE.getDay()]} hasta ${permisoAplicado.horaLimite})`
      : null;

    await tx.asistencia.create({
      data: {
        empleadoId,
        fecha: hoy,
        entrada: nowVE,
        estadoEntrada,
        estadoOriginal,
        permisoEstudiantilId,
        ...(paseUsado && {
          justificacionObs: permisoObs
            ? `Pase previo: ${paseUsado.motivo} · ${permisoObs}`
            : `Pase previo: ${paseUsado.motivo}`,
          autorizadorId: paseUsado.autorizadorId,
        }),
        ...(!paseUsado && permisoObs && {
          justificacionObs: permisoObs,
        }),
        reglaId: regla.id,
      },
    });

    await audit("FICHAJE_ENTRADA", `Entrada registrada para ${empleado.cedula} (${estadoEntrada}${permisoObs ? `, ${permisoObs}` : ""})`);

    return { tipo: estadoEntrada.toLowerCase(), msg: `Entrada registrada — ${estadoEntrada}` };
  });
}
