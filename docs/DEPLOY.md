# Guía de Despliegue y Scheduling

## Proyección Automática de Faltas (FASE D)

El script `scripts/project-faltas.ts` debe ejecutarse **diariamente a las 00:30 hora local (VE)** para procesar el día anterior.

### Qué hace el script
- Procesa el **día anterior** (idempotente por unique constraint `empleadoId_fecha`)
- Solo días laborables (Lunes a Viernes)
- Omite feriados y vacaciones
- Crea registro `FALTA` para empleados activos sin asistencia
- Registra en auditoría con acción `FALTA_PROYECTADA`

### Windows (Task Scheduler)

1. Abrir "Programador de tareas" (Task Scheduler)
2. Crear tarea básica:
   - **Nombre**: "Proyección Faltas Asistencia"
   - **Disparador**: Diariamente a las 00:30
   - **Acción**: Iniciar programa
     - **Programa**: `cmd.exe`
     - **Argumentos**: `/c "cd /d C:\ruta\al\proyecto && npx tsx scripts/project-faltas.ts"`
     - **Iniciar en**: `C:\ruta\al\proyecto`
   - **Configuración**: Ejecutar aunque el usuario no haya iniciado sesión (opcional)

### Linux/macOS (cron)

```bash
# Editar crontab
crontab -e

# Agregar línea:
30 0 * * * cd /ruta/al/proyecto && npx tsx scripts/project-faltas.ts >> /var/log/project-faltas.log 2>&1
```

### Docker (si aplica)

Añadir servicio cron en `compose.yml` o usar sidecar:

```yaml
services:
  cron:
    image: alpine:latest
    volumes:
      - .:/app
    working_dir: /app
    command: |
      sh -c "
        apk add --no-cache nodejs npm
        npm install -g tsx
        echo '30 0 * * * cd /app && npx tsx scripts/project-faltas.ts >> /var/log/project-faltas.log 2>&1' | crontab -
        crond -f -l 8
      "
```

### Verificación manual

```bash
# Ejecutar manualmente para probar
npx tsx scripts/project-faltas.ts

# Ver logs de auditoría
# En BD: SELECT * FROM LogAuditoria WHERE accion = 'FALTA_PROYECTADA' ORDER BY ts DESC LIMIT 10;
```

### Health Check

Endpoint para monitoreo: `GET /api/health/faltas-projection` (pendiente implementar)

Debe devolver:
- `lastRun`: timestamp de última ejecución
- `created`: faltas creadas en última ejecución
- `skipped`: omitidas en última ejecución

---

## Variables de Entorno Requeridas

```env
# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/asistencia?schema=public"

# NextAuth
NEXTAUTH_SECRET="clave-secreta-larga-y-aleatoria-min-32-chars"
NEXTAUTH_URL="http://localhost:3000"

# Kiosco API Key (compartida entre kioscos)
API_KIOSCO_KEY="kiosco-api-key-segura-larga-aleatoria"
NEXT_PUBLIC_API_KIOSCO_KEY="kiosco-api-key-segura-larga-aleatoria"

# Face-api.js models path
NEXT_PUBLIC_MODELS_URL="/models"
```

---

## Checklist Pre-Deploy

- [ ] `npm run build` exitoso
- [ ] `npm run lint` sin errores
- [ ] Modelos face-api.js en `public/models/` (3 carpetas completas)
- [ ] Variables `.env` configuradas
- [ ] Migraciones Prisma aplicadas (`npx prisma migrate deploy`)
- [ ] Seed ejecutado (usuarios Admin/RRHH + gerencias + Gerentes/Coordinadores)
- [ ] Script proyección faltas programado en SO
- [ ] Nginx configurado: proxy pass, WebSocket support, static files `/models`, HTTPS certs
- [ ] Prueba E2E: Enrolar empleado → Fichar entrada/salida en kiosco → Ver en dashboard/consulta
- [ ] Prueba permisos: Gerente ve solo su gerencia, Admin ve todo
- [ ] Auditoría registra todas las acciones sensibles