-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'RRHH', 'GERENTE', 'COORDINADOR');

-- CreateEnum
CREATE TYPE "EstadoEntrada" AS ENUM ('A_TIEMPO', 'TARDE', 'FALTA', 'JUSTIFICADO', 'FERIADO', 'VACACIONES');

-- CreateEnum
CREATE TYPE "EstadoSalida" AS ENUM ('COMPLETADO', 'TEMPRANO');

-- CreateEnum
CREATE TYPE "TipoPase" AS ENUM ('PASE_NORMAL', 'JUSTIFICACION_ANTICIPADA');

-- CreateEnum
CREATE TYPE "AccionAuditoria" AS ENUM ('LOGIN', 'LOGOUT', 'CREAR_EMPLEADO', 'DESACTIVAR_EMPLEADO', 'REACTIVAR_EMPLEADO', 'ENROLLAR_EMPLEADO', 'FICHAJE_ENTRADA', 'FICHAJE_SALIDA', 'JUSTIFICAR', 'CREAR_PASE', 'CREAR_REGLA', 'CREAR_FERIADO', 'ELIMINAR_FERIADO', 'CREAR_VACACION', 'ELIMINAR_VACACION', 'CAMBIO_CLAVE', 'CREAR_JUSTIFICACION_ANTICIPADA', 'FALTA_PROYECTADA');

-- CreateTable
CREATE TABLE "Gerencia" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,

    CONSTRAINT "Gerencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(60) NOT NULL,
    "passwordHash" VARCHAR(72) NOT NULL,
    "rol" "Rol" NOT NULL,
    "gerenciaId" INTEGER,
    "claveInicial" BOOLEAN NOT NULL DEFAULT true,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Empleado" (
    "id" SERIAL NOT NULL,
    "cedula" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "apellido" VARCHAR(80) NOT NULL,
    "cargo" VARCHAR(100) NOT NULL,
    "gerenciaId" INTEGER NOT NULL,
    "descriptor" BYTEA,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dadoDeBajaEn" TIMESTAMP(3),

    CONSTRAINT "Empleado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReglaAsistencia" (
    "id" SERIAL NOT NULL,
    "horaLimite" VARCHAR(5) NOT NULL,
    "horaReferencia" VARCHAR(5) NOT NULL,
    "margenMin" INTEGER NOT NULL,
    "cooldownMin" INTEGER NOT NULL DEFAULT 30,
    "vigenciaDesde" TIMESTAMP(3) NOT NULL,
    "creadoPorId" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReglaAsistencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asistencia" (
    "id" SERIAL NOT NULL,
    "empleadoId" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "entrada" TIMESTAMPTZ,
    "salida" TIMESTAMPTZ,
    "estadoEntrada" "EstadoEntrada" NOT NULL,
    "estadoOriginal" "EstadoEntrada",
    "estadoSalida" "EstadoSalida",
    "extrasH" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "reglaId" INTEGER,
    "justificacionDoc" VARCHAR(500),
    "justificacionObs" TEXT,
    "autorizadorId" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asistencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feriado" (
    "id" SERIAL NOT NULL,
    "fecha" DATE NOT NULL,
    "motivo" VARCHAR(200) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feriado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VacacionEmpleado" (
    "id" SERIAL NOT NULL,
    "empleadoId" INTEGER NOT NULL,
    "inicio" DATE NOT NULL,
    "fin" DATE NOT NULL,
    "motivo" VARCHAR(200),
    "aprobadorId" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VacacionEmpleado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasePrevio" (
    "id" SERIAL NOT NULL,
    "empleadoId" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "tipo" "TipoPase" NOT NULL DEFAULT 'PASE_NORMAL',
    "motivo" VARCHAR(500) NOT NULL,
    "autorizado" BOOLEAN NOT NULL DEFAULT false,
    "autorizadorId" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasePrevio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogAuditoria" (
    "id" SERIAL NOT NULL,
    "accion" "AccionAuditoria" NOT NULL,
    "usuarioId" INTEGER,
    "detalle" TEXT NOT NULL,
    "ip" VARCHAR(45),
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogAuditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Gerencia_nombre_key" ON "Gerencia"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_username_key" ON "Usuario"("username");

-- CreateIndex
CREATE INDEX "Usuario_username_idx" ON "Usuario"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Empleado_cedula_key" ON "Empleado"("cedula");

-- CreateIndex
CREATE INDEX "Empleado_cedula_idx" ON "Empleado"("cedula");

-- CreateIndex
CREATE INDEX "Empleado_gerenciaId_activo_idx" ON "Empleado"("gerenciaId", "activo");

-- CreateIndex
CREATE INDEX "Asistencia_fecha_idx" ON "Asistencia"("fecha");

-- CreateIndex
CREATE INDEX "Asistencia_empleadoId_fecha_idx" ON "Asistencia"("empleadoId", "fecha");

-- CreateIndex
CREATE INDEX "Asistencia_estadoEntrada_idx" ON "Asistencia"("estadoEntrada");

-- CreateIndex
CREATE UNIQUE INDEX "Asistencia_empleadoId_fecha_key" ON "Asistencia"("empleadoId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "Feriado_fecha_key" ON "Feriado"("fecha");

-- CreateIndex
CREATE INDEX "Feriado_fecha_idx" ON "Feriado"("fecha");

-- CreateIndex
CREATE INDEX "VacacionEmpleado_empleadoId_inicio_fin_idx" ON "VacacionEmpleado"("empleadoId", "inicio", "fin");

-- CreateIndex
CREATE INDEX "PasePrevio_empleadoId_fecha_idx" ON "PasePrevio"("empleadoId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "PasePrevio_empleadoId_fecha_tipo_key" ON "PasePrevio"("empleadoId", "fecha", "tipo");

-- CreateIndex
CREATE INDEX "LogAuditoria_ts_idx" ON "LogAuditoria"("ts");

-- CreateIndex
CREATE INDEX "LogAuditoria_usuarioId_idx" ON "LogAuditoria"("usuarioId");

-- CreateIndex
CREATE INDEX "LogAuditoria_accion_idx" ON "LogAuditoria"("accion");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_gerenciaId_fkey" FOREIGN KEY ("gerenciaId") REFERENCES "Gerencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empleado" ADD CONSTRAINT "Empleado_gerenciaId_fkey" FOREIGN KEY ("gerenciaId") REFERENCES "Gerencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asistencia" ADD CONSTRAINT "Asistencia_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asistencia" ADD CONSTRAINT "Asistencia_reglaId_fkey" FOREIGN KEY ("reglaId") REFERENCES "ReglaAsistencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VacacionEmpleado" ADD CONSTRAINT "VacacionEmpleado_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasePrevio" ADD CONSTRAINT "PasePrevio_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogAuditoria" ADD CONSTRAINT "LogAuditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
