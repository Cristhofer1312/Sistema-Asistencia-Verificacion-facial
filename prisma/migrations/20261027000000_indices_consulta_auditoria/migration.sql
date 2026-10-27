-- Índices para la consulta de auditoría (filtro por acción/usuario + orden por fecha)
CREATE INDEX "LogAuditoria_accion_ts_idx" ON "LogAuditoria"("accion", "ts");
CREATE INDEX "LogAuditoria_usuarioId_ts_idx" ON "LogAuditoria"("usuarioId", "ts");
