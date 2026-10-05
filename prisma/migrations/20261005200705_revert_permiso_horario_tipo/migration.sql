/*
  Warnings:

  - You are about to drop the column `tipo` on the `PermisoEstudiantil` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "PermisoEstudiantil" DROP COLUMN "tipo";

-- DropEnum
DROP TYPE "TipoPermisoHorario";
