-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AccionAuditoria" ADD VALUE 'CREAR_PERMISO_ESTUDIO';
ALTER TYPE "AccionAuditoria" ADD VALUE 'ACTUALIZAR_PERMISO_ESTUDIO';

-- AlterTable
ALTER TABLE "Asistencia" ADD COLUMN     "permisoEstudiantilId" INTEGER;

-- CreateTable
CREATE TABLE "PermisoEstudiantil" (
    "id" SERIAL NOT NULL,
    "empleadoId" INTEGER NOT NULL,
    "diasSemana" INTEGER[],
    "horaLimite" VARCHAR(5) NOT NULL,
    "validoDesde" DATE NOT NULL,
    "validoHasta" DATE NOT NULL,
    "motivo" VARCHAR(300),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoPorId" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PermisoEstudiantil_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PermisoEstudiantil_empleadoId_activo_idx" ON "PermisoEstudiantil"("empleadoId", "activo");

-- AddForeignKey
ALTER TABLE "Asistencia" ADD CONSTRAINT "Asistencia_permisoEstudiantilId_fkey" FOREIGN KEY ("permisoEstudiantilId") REFERENCES "PermisoEstudiantil"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermisoEstudiantil" ADD CONSTRAINT "PermisoEstudiantil_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
