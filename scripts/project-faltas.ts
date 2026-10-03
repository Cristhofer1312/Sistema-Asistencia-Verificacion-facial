// scripts/project-faltas.ts
// Proyección automática de faltas para empleados activos sin marcaje en día laborable anterior
// Ejecutar: npx tsx scripts/project-faltas.ts
// Programar: cron 0 30 * * * (diario a las 00:30) o Windows Task Scheduler

import { PrismaClient } from '@prisma/client';
import { getVenezuelaDate, toDateOnly, formatDateVE, isLaborable, getDaysAgoVE } from '../lib/date-utils';

const prisma = new PrismaClient();

async function projectFaltas() {
  console.log('[project-faltas] Iniciando proyección de faltas...');
  
  try {
    // Procesar día anterior (idempotente por unique constraint empleadoId+fecha)
    const ayerStr = getDaysAgoVE(1);
    const ayer = new Date(ayerStr + 'T00:00:00');
    
    // Verificar si ayer era laborable (L-V)
    if (!isLaborable(ayer)) {
      console.log('[project-faltas] Día no laborable, omitiendo');
      return;
    }

    // Obtener regla vigente para ayer (para reglaId y horaReferencia)
    const regla = await prisma.reglaAsistencia.findFirst({
      where: { vigenciaDesde: { lte: ayer } },
      orderBy: { vigenciaDesde: 'desc' },
    });
    
    if (!regla) {
      console.log('[project-faltas] No hay regla vigente, omitiendo');
      return;
    }

    // Verificar feriado
    const feriado = await prisma.feriado.findUnique({ where: { fecha: ayer } });
    if (feriado) {
      console.log('[project-faltas] Día feriado, omitiendo');
      return;
    }

    // Empleados activos
    const empleados = await prisma.empleado.findMany({
      where: { activo: true },
      select: { id: true, cedula: true, nombre: true, apellido: true, gerenciaId: true },
    });

    let creadas = 0;
    let omitidas = 0;

    for (const emp of empleados) {
      // Verificar vacaciones
      const vacacion = await prisma.vacacionEmpleado.findFirst({
        where: {
          empleadoId: emp.id,
          inicio: { lte: ayer },
          fin: { gte: ayer },
        },
      });
      if (vacacion) {
        omitidas++;
        continue;
      }

      // Verificar si ya tiene asistencia ese día
      const asistenciaExistente = await prisma.asistencia.findUnique({
        where: { empleadoId_fecha: { empleadoId: emp.id, fecha: ayer } },
      });
      if (asistenciaExistente) {
        omitidas++;
        continue;
      }

      // Reposo médico vigente: se proyecta REPOSO_MEDICO (no cuenta como falta)
      const reposo = await prisma.reposoMedico.findFirst({
        where: { empleadoId: emp.id, inicio: { lte: ayer }, fin: { gte: ayer } },
      });

      // Crear FALTA (o REPOSO_MEDICO) — idempotente por unique constraint empleadoId_fecha
      try {
        await prisma.asistencia.create({
          data: {
            empleadoId: emp.id,
            fecha: ayer,
            entrada: null,
            salida: null,
            estadoEntrada: reposo ? 'REPOSO_MEDICO' : 'FALTA',
            reglaId: regla.id,
          },
        });
        if (reposo) { omitidas++; continue; }
        creadas++;
        
        // Auditoría
        await prisma.logAuditoria.create({
          data: {
            accion: 'FALTA_PROYECTADA',
            usuarioId: null, // Sistema automático
            detalle: `Falta proyectada automáticamente: ${emp.cedula} (${emp.nombre} ${emp.apellido}) para ${ayerStr}`,
            ip: 'system',
          },
        });
      } catch (e: any) {
        if (e.code === 'P2002') {
          // Ya existía (race condition), contar como omitida
          omitidas++;
        } else {
          console.error(`[project-faltas] Error con ${emp.cedula}:`, e);
        }
      }
    }

    console.log(`[project-faltas] Completado: ${creadas} faltas creadas, ${omitidas} omitidas`);
  } catch (error) {
    console.error('[project-faltas] Error fatal:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

projectFaltas();