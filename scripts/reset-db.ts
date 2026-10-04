import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Borra TODO el schema (todas las tablas y tipos) y lo recrea vacío
  await prisma.$executeRawUnsafe('DROP SCHEMA public CASCADE;');
  await prisma.$executeRawUnsafe('CREATE SCHEMA public;');
  console.log('✅ Schema public eliminado y recreado (BD vacía)');
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
