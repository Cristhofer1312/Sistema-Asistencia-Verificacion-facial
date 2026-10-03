// prisma/seed.ts — Datos iniciales SRS v3.2
// Ejecutar: npx prisma db seed
// (requiere: "prisma": { "seed": "tsx prisma/seed.ts" } en package.json)

import { PrismaClient, Rol } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seed iniciando…");

  // ── 1. Gerencias ──────────────────────────────────────────
  const gerencias = await Promise.all(
    ["RRHH", "Ventas", "Operaciones", "TI", "Finanzas"].map((nombre) =>
      prisma.gerencia.upsert({
        where: { nombre },
        update: {},
        create: { nombre },
      })
    )
  );
  const gerMap = Object.fromEntries(gerencias.map((g) => [g.nombre, g.id]));
  console.log("✅ Gerencias:", Object.keys(gerMap).join(", "));

  // ── 2. Usuarios globales (ADMIN + RRHH) ──────────────────
  const adminHash = await bcrypt.hash("Admin1234!", 12);
  const rrhhHash  = await bcrypt.hash("Rrhh1234!",  12);

  const admin = await prisma.usuario.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      passwordHash: adminHash,
      rol: Rol.ADMIN,
      claveInicial: true, // fuerza cambio en primer login
    },
  });

  const rrhh = await prisma.usuario.upsert({
    where: { username: "rrhh" },
    update: {},
    create: {
      username: "rrhh",
      passwordHash: rrhhHash,
      rol: Rol.RRHH,
      claveInicial: true,
    },
  });

  // ── 3. Gerentes por gerencia ──────────────────────────────
  for (const [gerNombre, gerId] of Object.entries(gerMap)) {
    const username = `gerente.${gerNombre.toLowerCase()}`;
    const hash = await bcrypt.hash("Gerente1234!", 12);
    await prisma.usuario.upsert({
      where: { username },
      update: {},
      create: {
        username,
        passwordHash: hash,
        rol: Rol.GERENTE,
        gerenciaId: gerId,
        claveInicial: true,
      },
    });
  }

  console.log("✅ Usuarios: admin, rrhh, gerente.{ventas,rrhh,operaciones,ti,finanzas}");

  // ── 4. Regla de asistencia inicial ───────────────────────
  const regla = await prisma.reglaAsistencia.upsert({
    where: { id: 1 },
    update: {},
    create: {
      horaLimite:     "08:00",
      horaReferencia: "17:00",
      margenMin:      60,
      cooldownMin:    30,
      vigenciaDesde:  new Date("2026-01-01T00:00:00Z"),
      creadoPorId:    admin.id,
    },
  });
  console.log("✅ Regla:", `${regla.horaLimite} / ${regla.horaReferencia} / ${regla.margenMin}min`);

  // ── 5. Empleados demo ─────────────────────────────────────
  const empleadosDemo = [
    { cedula: "001-0001", nombre: "Ana",   apellido: "Pérez", cargo: "Analista RRHH", gerencia: "RRHH"   },
    { cedula: "002-0002", nombre: "Luis",  apellido: "Gómez", cargo: "Vendedor",      gerencia: "Ventas"  },
    { cedula: "003-0003", nombre: "María", apellido: "Ruiz",  cargo: "Vendedora",     gerencia: "Ventas"  },
    { cedula: "004-0004", nombre: "José",  apellido: "Díaz",  cargo: "Soporte TI",    gerencia: "TI"      },
  ];

  for (const emp of empleadosDemo) {
    await prisma.empleado.upsert({
      where: { cedula: emp.cedula },
      update: {},
      create: {
        cedula:     emp.cedula,
        nombre:     emp.nombre,
        apellido:   emp.apellido,
        cargo:      emp.cargo,
        gerenciaId: gerMap[emp.gerencia],
        activo:     emp.cedula !== "004-0004", // José inactivo en demo
      },
    });
  }
  console.log("✅ Empleados demo: 4 (1 inactivo)");

  // ── 6. Feriado demo ───────────────────────────────────────
  await prisma.feriado.upsert({
    where: { fecha: new Date("2026-10-12T04:00:00Z") },
    update: {},
    create: {
      fecha:  new Date("2026-10-12T04:00:00Z"),
      motivo: "Día de la Resistencia Indígena",
    },
  });
  console.log("✅ Feriado demo: 2026-10-12");

  console.log("🌱 Seed completado.");
}

main()
  .catch((e) => { console.error("❌ Seed error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
