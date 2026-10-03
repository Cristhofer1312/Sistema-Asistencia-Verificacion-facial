import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRaw`TRUNCATE TABLE "Asistencia" RESTART IDENTITY CASCADE`;
  console.log('✅ Tabla Asistencia truncada');
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });