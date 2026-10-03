-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AccionAuditoria" ADD VALUE 'CREAR_REPOSO';
ALTER TYPE "AccionAuditoria" ADD VALUE 'ELIMINAR_REPOSO';

-- AlterEnum
ALTER TYPE "EstadoEntrada" ADD VALUE 'REPOSO_MEDICO';

-- CreateTable
CREATE TABLE "ReposoMedico" (
    "id" SERIAL NOT NULL,
    "empleadoId" INTEGER NOT NULL,
    "inicio" DATE NOT NULL,
    "fin" DATE NOT NULL,
    "motivo" VARCHAR(300),
    "documento" VARCHAR(500),
    "registradoPorId" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReposoMedico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReposoMedico_empleadoId_inicio_fin_idx" ON "ReposoMedico"("empleadoId", "inicio", "fin");

-- AddForeignKey
ALTER TABLE "ReposoMedico" ADD CONSTRAINT "ReposoMedico_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
