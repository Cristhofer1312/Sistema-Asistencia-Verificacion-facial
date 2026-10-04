import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.asistencia.groupBy({ by: ['estadoEntrada'], _count: { _all: true } });
  console.log('=== Asistencias por estado ===');
  for (const r of rows) console.log(`  ${r.estadoEntrada}: ${r._count._all}`);
  const emps = await prisma.empleado.count({ where: { cedula: { startsWith: 'DEMO-' } } });
  const vacs = await prisma.vacacionEmpleado.count({ where: { empleado: { cedula: { startsWith: 'DEMO-' } } } });
  const vacsAnul = await prisma.vacacionEmpleado.count({ where: { empleado: { cedula: { startsWith: 'DEMO-' } }, anulada: true } });
  const reps = await prisma.reposoMedico.count({ where: { empleado: { cedula: { startsWith: 'DEMO-' } } } });
  const fers = await prisma.feriado.count({ where: { motivo: 'FERIADO DEMO' } });
  console.log(`Empleados demo: ${emps} | Vacaciones demo: ${vacs} (${vacsAnul} anulada) | Reposos demo: ${reps} | Feriados demo: ${fers}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
