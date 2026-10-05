-- Redefinir ventana de entrada: horaEntrada (hora esperada) + horaLimite (fin de ventana a tiempo).
-- El margen en minutos (margenMin) se elimina; la regla vigente (08:00 + 60min) migra a entrada 08:00 / límite 09:00.
-- Nuevo estado de entrada TEMPRANO (llegada antes de la hora de entrada).

-- Nuevo valor del enum (debe correr fuera de transacción en `migrate deploy`; aplicado directo en local)
ALTER TYPE "EstadoEntrada" ADD VALUE 'TEMPRANO';

-- Nueva columna con default temporal para filas existentes
ALTER TABLE "ReglaAsistencia" ADD COLUMN "horaEntrada" VARCHAR(5) NOT NULL DEFAULT '08:00';

-- Backfill: la hora de entrada hereda el límite anterior...
UPDATE "ReglaAsistencia" SET "horaEntrada" = "horaLimite";

-- ...y el nuevo límite es límite anterior + margen en minutos
UPDATE "ReglaAsistencia" SET "horaLimite" = to_char(("horaLimite"::time + ("margenMin" || ' minutes')::interval), 'HH24:MI');

-- Quitar default temporal y eliminar margenMin
ALTER TABLE "ReglaAsistencia" ALTER COLUMN "horaEntrada" DROP DEFAULT;
ALTER TABLE "ReglaAsistencia" DROP COLUMN "margenMin";
