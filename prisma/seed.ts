// prisma/seed.ts — Datos iniciales SRS v3.2
// Ejecutar: npx prisma db seed
// (requiere: "prisma": { "seed": "tsx prisma/seed.ts" } en package.json)

import { PrismaClient, Rol } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seed iniciando…");

  const adminHash = await bcrypt.hash("Admin1234!", 12);
  const rrhhHash  = await bcrypt.hash("Rrhh1234!",  12);

  await prisma.usuario.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      passwordHash: adminHash,
      rol: Rol.ADMIN,
      claveInicial: true, // fuerza cambio en primer login
    },
  });

  await prisma.usuario.upsert({
    where: { username: "rrhh" },
    update: {},
    create: {
      username: "rrhh",
      passwordHash: rrhhHash,
      rol: Rol.RRHH,
      claveInicial: true,
    },
  });

  console.log("✅ Usuarios: admin, rrhh");

  console.log("🌱 Seed completado.");
}

main()
  .catch((e) => { console.error("❌ Seed error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
