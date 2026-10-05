-- CreateEnum
CREATE TYPE "TipoPermisoHorario" AS ENUM ('ESTUDIANTIL', 'VACACIONAL');

-- AlterTable
ALTER TABLE "PermisoEstudiantil" ADD COLUMN     "tipo" "TipoPermisoHorario" NOT NULL DEFAULT 'ESTUDIANTIL';
