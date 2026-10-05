-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AccionAuditoria" ADD VALUE 'CREAR_USUARIO';
ALTER TYPE "AccionAuditoria" ADD VALUE 'UPDATE_USUARIO';
ALTER TYPE "AccionAuditoria" ADD VALUE 'RESET_PASSWORD';
ALTER TYPE "AccionAuditoria" ADD VALUE 'ELIMINAR_USUARIO';
ALTER TYPE "AccionAuditoria" ADD VALUE 'MATCH_KIOSCO';
ALTER TYPE "AccionAuditoria" ADD VALUE 'MATCH_KIOSCO_UNKNOWN';
ALTER TYPE "AccionAuditoria" ADD VALUE 'MATCH_KIOSCO_REPLAY';
ALTER TYPE "AccionAuditoria" ADD VALUE 'MATCH_KIOSCO_BAD_QUALITY';
ALTER TYPE "AccionAuditoria" ADD VALUE 'MATCH_KIOSCO_BAD_CHALLENGE';
ALTER TYPE "AccionAuditoria" ADD VALUE 'ANULAR_VACACION';
ALTER TYPE "AccionAuditoria" ADD VALUE 'ANULAR_REPOSO';

-- AlterTable
ALTER TABLE "ReposoMedico" ADD COLUMN     "anulada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "anuladoEn" TIMESTAMP(3),
ADD COLUMN     "anuladoPorId" INTEGER,
ADD COLUMN     "motivoAnulacion" VARCHAR(300);

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "bloqueadoHasta" TIMESTAMP(3),
ADD COLUMN     "intentosFallidos" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "VacacionEmpleado" ADD COLUMN     "anulada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "anuladoEn" TIMESTAMP(3),
ADD COLUMN     "anuladoPorId" INTEGER,
ADD COLUMN     "motivoAnulacion" VARCHAR(300);

-- CreateTable
CREATE TABLE "KioscoNonce" (
    "id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "usadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KioscoNonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KioscoChallenge" (
    "id" TEXT NOT NULL,
    "steps" TEXT NOT NULL,
    "usado" BOOLEAN NOT NULL DEFAULT false,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KioscoChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KioscoNonce_nonce_key" ON "KioscoNonce"("nonce");

-- CreateIndex
CREATE INDEX "KioscoNonce_expiraEn_idx" ON "KioscoNonce"("expiraEn");

-- CreateIndex
CREATE INDEX "KioscoChallenge_expiraEn_idx" ON "KioscoChallenge"("expiraEn");

-- CreateIndex
CREATE INDEX "KioscoChallenge_usado_idx" ON "KioscoChallenge"("usado");

-- CreateIndex
CREATE INDEX "ReposoMedico_empleadoId_anulada_idx" ON "ReposoMedico"("empleadoId", "anulada");

-- CreateIndex
CREATE INDEX "VacacionEmpleado_empleadoId_anulada_idx" ON "VacacionEmpleado"("empleadoId", "anulada");
