// prisma/seed-demo.ts — Dataset de demostración para observar el dashboard.
// Ejecutar: npx tsx prisma/seed-demo.ts
// Idempotente: borra primero todo lo marcado como DEMO y lo regenera.
// NO toca datos reales (filtra por cédula DEMO-* y motivo "FERIADO DEMO").
//
// Genera (fechas relativas a hoy):
// - 12 empleados demo (creadoEn hace 10 días, 3 por gerencia aprox.)
// - Vacaciones: 1 vigente + 1 programada + 1 finalizada + 1 anulada con motivo
// - Reposos: 1 vigente + 1 finalizado
// - 1 feriado en día hábil pasado
// - Asistencias variadas últimos 7 días: A_TIEMPO, TARDE, TEMPRANO, extras, JUSTIFICADO
// - 2 empleados sin fila en días pasados (el cierre diario los marca FALTA)

import { PrismaClient } from "@prisma/client";
import { autoMarkRange, autoMarkFeriado } from "../lib/auto-marcado";

const prisma = new PrismaClient();

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgoUtc = (n: number) => {
  const d = new Date();
  const u = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  u.setUTCDate(u.getUTCDate() - n);
  return u;
};
const daysAheadUtc = (n: number) => {
  const d = new Date();
  const u = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  u.setUTCDate(u.getUTCDate() + n);
  return u;
};
// Últimos 7 días hábiles (excluye hoy)
function ultimosHabiles(n: number): Date[] {
  const out: Date[] = [];
  const d = daysAgoUtc(1);
  while (out.length < n) {
    const dow = d.getUTCDay();
    if (dow >= 1 && dow <= 5) out.unshift(new Date(d));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}
// Día hábil pasado específico (para el feriado demo): el 3er día hábil hacia atrás
function feriadoDemoDay(): Date {
  return ultimosHabiles(4)[0];
}

async function main() {
  console.log("🌱 Seed demo iniciando…");

  // ── 0. Limpieza previa (solo demo) ──────────────────────────
  const demoEmps = await prisma.empleado.findMany({ where: { cedula: { startsWith: "DEMO-" } }, select: { id: true } });
  const demoIds = demoEmps.map((e) => e.id);
  if (demoIds.length) {
    await prisma.asistencia.deleteMany({ where: { empleadoId: { in: demoIds } } });
    await prisma.vacacionEmpleado.deleteMany({ where: { empleadoId: { in: demoIds } } });
    await prisma.reposoMedico.deleteMany({ where: { empleadoId: { in: demoIds } } });
    await prisma.pasePrevio.deleteMany({ where: { empleadoId: { in: demoIds } } });
    await prisma.empleado.deleteMany({ where: { id: { in: demoIds } } });
  }
  await prisma.feriado.deleteMany({ where: { motivo: "FERIADO DEMO" } });
  console.log(`🧹 Limpieza: ${demoIds.length} empleados demo previos eliminados`);

  // ── 1. Gerencias + regla ────────────────────────────────────
  const gerencias = await Promise.all(
    ["RRHH", "Ventas", "Operaciones", "TI", "Finanzas"].map((nombre) =>
      prisma.gerencia.upsert({ where: { nombre }, update: {}, create: { nombre } })
    )
  );
  const gerMap = Object.fromEntries(gerencias.map((g) => [g.nombre, g.id]));

  let regla = await prisma.reglaAsistencia.findFirst({ orderBy: { vigenciaDesde: "desc" } });
  if (!regla) {
    regla = await prisma.reglaAsistencia.create({
      data: { horaLimite: "08:00", horaReferencia: "17:00", margenMin: 60, cooldownMin: 30, vigenciaDesde: new Date("2020-01-01T00:00:00Z") },
    });
  }
  console.log(`✅ Regla id=${regla.id}: ${regla.horaLimite}/${regla.horaReferencia}`);

  // ── 2. Empleados demo (creadoEn hace 10 días) ────────────────
  const creadoHace10 = daysAgoUtc(10);
  const demo = [
    { cedula: "DEMO-01", nombre: "Ana", apellido: "Vacaciones", cargo: "Analista", gerencia: "RRHH" },
    { cedula: "DEMO-02", nombre: "Luis", apellido: "Reposo", cargo: "Vendedor", gerencia: "Ventas" },
    { cedula: "DEMO-03", nombre: "María", apellido: "Puntual", cargo: "Vendedora", gerencia: "Ventas" },
    { cedula: "DEMO-04", nombre: "José", apellido: "Tarde", cargo: "Soporte", gerencia: "TI" },
    { cedula: "DEMO-05", nombre: "Carmen", apellido: "Temprano", cargo: "Operaria", gerencia: "Operaciones" },
    { cedula: "DEMO-06", nombre: "Pedro", apellido: "Extra", cargo: "Técnico", gerencia: "TI" },
    { cedula: "DEMO-07", nombre: "Lucía", apellido: "Justif", cargo: "Asistente", gerencia: "Finanzas" },
    { cedula: "DEMO-08", nombre: "Miguel", apellido: "Mixto", cargo: "Operario", gerencia: "Operaciones" },
    { cedula: "DEMO-09", nombre: "Sofía", apellido: "Finanzas", cargo: "Contadora", gerencia: "Finanzas" },
    { cedula: "DEMO-10", nombre: "Diego", apellido: "RRHH", cargo: "Reclutador", gerencia: "RRHH" },
    { cedula: "DEMO-11", nombre: "Elena", apellido: "Ausente", cargo: "Vendedora", gerencia: "Ventas" },
    { cedula: "DEMO-12", nombre: "Pablo", apellido: "Faltante", cargo: "Soporte", gerencia: "TI" },
  ];
  const emps: Record<string, { id: number }> = {};
  for (const e of demo) {
    const created = await prisma.empleado.create({
      data: { cedula: e.cedula, nombre: e.nombre, apellido: e.apellido, cargo: e.cargo, gerenciaId: gerMap[e.gerencia], activo: true, creadoEn: creadoHace10 },
    });
    emps[e.cedula] = { id: created.id };
  }
  console.log(`✅ ${demo.length} empleados demo (creadoEn hace 10 días)`);

  const hora = (d: Date, hm: string) => new Date(`${iso(d)}T${hm}:00-04:00`);

  // ── 3. Vacaciones (emp DEMO-01) ─────────────────────────────
  const vVig = await prisma.vacacionEmpleado.create({
    data: { empleadoId: emps["DEMO-01"].id, inicio: daysAgoUtc(2), fin: daysAheadUtc(3), motivo: "Vacaciones anuales" },
  });
  await autoMarkRange(prisma as never, { empleadoId: emps["DEMO-01"].id, estado: "VACACIONES", inicio: daysAgoUtc(2), fin: daysAheadUtc(3) });
  await prisma.vacacionEmpleado.create({
    data: { empleadoId: emps["DEMO-01"].id, inicio: daysAheadUtc(10), fin: daysAheadUtc(15), motivo: "Programadas diciembre" },
  });
  await prisma.vacacionEmpleado.create({
    data: { empleadoId: emps["DEMO-03"].id, inicio: daysAgoUtc(9), fin: daysAgoUtc(7), motivo: "Vacaciones pasadas" },
  });
  await autoMarkRange(prisma as never, { empleadoId: emps["DEMO-03"].id, estado: "VACACIONES", inicio: daysAgoUtc(9), fin: daysAgoUtc(7) });
  await prisma.vacacionEmpleado.create({
    data: {
      empleadoId: emps["DEMO-04"].id, inicio: daysAgoUtc(8), fin: daysAgoUtc(6), motivo: "Se reprogramará",
      anulada: true, motivoAnulacion: "Error en fechas, se reprograma", anuladoEn: daysAgoUtc(5),
    },
  });
  console.log(`✅ Vacaciones: vigente #${vVig.id} + programada + finalizada + 1 anulada`);

  // ── 4. Reposos (emp DEMO-02) ────────────────────────────────
  await prisma.reposoMedico.create({
    data: { empleadoId: emps["DEMO-02"].id, inicio: daysAgoUtc(1), fin: daysAheadUtc(2), motivo: "Gripe" },
  });
  await autoMarkRange(prisma as never, { empleadoId: emps["DEMO-02"].id, estado: "REPOSO_MEDICO", inicio: daysAgoUtc(1), fin: daysAheadUtc(2) });
  const repFin = await prisma.reposoMedico.create({
    data: { empleadoId: emps["DEMO-05"].id, inicio: daysAgoUtc(9), fin: daysAgoUtc(8), motivo: "Chequeo" },
  });
  await autoMarkRange(prisma as never, { empleadoId: emps["DEMO-05"].id, estado: "REPOSO_MEDICO", inicio: daysAgoUtc(9), fin: daysAgoUtc(8) });
  console.log(`✅ Reposos: 1 vigente + 1 finalizado (#${repFin.id})`);

  // ── 5. Feriado demo (día hábil pasado) ──────────────────────
  const fDia = feriadoDemoDay();
  await prisma.feriado.create({ data: { fecha: fDia, motivo: "FERIADO DEMO" } });
  await autoMarkFeriado(prisma as never, fDia);
  console.log(`✅ Feriado demo: ${iso(fDia)}`);

  // ── 6. Asistencias variadas últimos 7 días hábiles ──────────
  const habiles = ultimosHabiles(7);
  let n = 0;
  for (const fecha of habiles) {
    // DEMO-03: siempre A_TIEMPO
    await prisma.asistencia.upsert({
      where: { empleadoId_fecha: { empleadoId: emps["DEMO-03"].id, fecha } },
      update: {},
      create: { empleadoId: emps["DEMO-03"].id, fecha, entrada: hora(fecha, "08:05"), salida: hora(fecha, "17:05"), estadoEntrada: "A_TIEMPO", estadoSalida: "COMPLETADO", reglaId: regla.id },
    });
    n++;
    // DEMO-04: TARDE algunos días
    if (habiles.indexOf(fecha) % 2 === 0) {
      await prisma.asistencia.upsert({
        where: { empleadoId_fecha: { empleadoId: emps["DEMO-04"].id, fecha } },
        update: {},
        create: { empleadoId: emps["DEMO-04"].id, fecha, entrada: hora(fecha, "08:40"), salida: hora(fecha, "17:05"), estadoEntrada: "TARDE", estadoSalida: "COMPLETADO", reglaId: regla.id },
      });
      n++;
    }
    // DEMO-05: salida TEMPRANO
    if (habiles.indexOf(fecha) % 3 === 0) {
      await prisma.asistencia.upsert({
        where: { empleadoId_fecha: { empleadoId: emps["DEMO-05"].id, fecha } },
        update: {},
        create: { empleadoId: emps["DEMO-05"].id, fecha, entrada: hora(fecha, "07:55"), salida: hora(fecha, "16:00"), estadoEntrada: "A_TIEMPO", estadoSalida: "TEMPRANO", reglaId: regla.id },
      });
      n++;
    }
    // DEMO-06: extras (salida 19:00 → 2h)
    if (habiles.indexOf(fecha) % 3 === 1) {
      await prisma.asistencia.upsert({
        where: { empleadoId_fecha: { empleadoId: emps["DEMO-06"].id, fecha } },
        update: {},
        create: { empleadoId: emps["DEMO-06"].id, fecha, entrada: hora(fecha, "08:00"), salida: hora(fecha, "19:00"), estadoEntrada: "A_TIEMPO", estadoSalida: "COMPLETADO", extrasH: 2, reglaId: regla.id },
      });
      n++;
    }
    // DEMO-08: mezcla A_TIEMPO
    if (habiles.indexOf(fecha) % 2 === 1) {
      await prisma.asistencia.upsert({
        where: { empleadoId_fecha: { empleadoId: emps["DEMO-08"].id, fecha } },
        update: {},
        create: { empleadoId: emps["DEMO-08"].id, fecha, entrada: hora(fecha, "07:50"), salida: hora(fecha, "17:10"), estadoEntrada: "A_TIEMPO", estadoSalida: "COMPLETADO", reglaId: regla.id },
      });
      n++;
    }
    // DEMO-09/10: A_TIEMPO solo algunos días (resto queda sin fila → cierre los marca FALTA)
    if (habiles.indexOf(fecha) < 3) {
      for (const ced of ["DEMO-09", "DEMO-10"]) {
        await prisma.asistencia.upsert({
          where: { empleadoId_fecha: { empleadoId: emps[ced].id, fecha } },
          update: {},
          create: { empleadoId: emps[ced].id, fecha, entrada: hora(fecha, "08:02"), salida: hora(fecha, "17:00"), estadoEntrada: "A_TIEMPO", estadoSalida: "COMPLETADO", reglaId: regla.id },
        });
        n++;
      }
    }
  }
  // DEMO-07: 1 JUSTIFICADO (era TARDE)
  const jDia = habiles[habiles.length - 2];
  await prisma.asistencia.upsert({
    where: { empleadoId_fecha: { empleadoId: emps["DEMO-07"].id, fecha: jDia } },
    update: {},
    create: {
      empleadoId: emps["DEMO-07"].id, fecha: jDia, entrada: hora(jDia, "08:35"), salida: hora(jDia, "17:00"),
      estadoEntrada: "JUSTIFICADO", estadoOriginal: "TARDE", estadoSalida: "COMPLETADO",
      justificacionObs: "Cita médica justificada", reglaId: regla.id,
    },
  });
  n++;
  console.log(`✅ Asistencias variadas: ${n} filas (A_TIEMPO/TARDE/TEMPRANO/extras/JUSTIFICADO)`);
  console.log("ℹ️  DEMO-11 y DEMO-12 quedaron SIN filas en días pasados: el botón 'Cerrar día' los marcará FALTA");

  console.log("🌱 Seed demo completado.");
}

main()
  .catch((e) => { console.error("❌ Seed demo error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
