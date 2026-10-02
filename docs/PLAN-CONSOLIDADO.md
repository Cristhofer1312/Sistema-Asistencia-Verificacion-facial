# Plan Consolidado — Sistema de Control de Asistencias con Reconocimiento Facial
**Versión SRS v3.2 · Fase 1 UX validada · Fecha: 2026-10-02**

---

## 1. Resumen ejecutivo
Sistema para automatizar entrada/salida por reconocimiento facial en kiosco, con horario global único, margen de tardanza 60 min editable, cooldown 30 min por empleado, feriados por día o rango, vacaciones por empleado, horas extras, pases previos (previo aviso sin documento), justificativos con documento opcional, histórico clicable, auditoría y vista única flexible de consulta agrupada por empleado.

## 2. Decisiones cerradas
- Horario global único (no por gerencia). Entrada límite + salida referencia (default 17:00) + margen 60 min editable al crear nuevo horario, vigencia futura, inmutabilidad por snapshot.
- FALTA = ausencia proyectada (no fila). FERIADO y VACACIONES separados. Día libre trabajado = todo extra.
- `COMPLETADO` = salida >= referencia; `TEMPRANO` = salida < referencia. Extras día normal = salida − referencia; feriado/vacación = salida − llegada.
- Sin entrada no hay salida; salida > llegada. Cooldown 30 min por empleado (kiosco sigue atendiendo a otros).
- Rostro no registrado = aviso 10s con reintento; multi-rostro = bloqueo 5s, una sola persona. Liveness rebajado: parpadeo + movimiento + umbral d<0.5 + rate-limit 1/s.
- Cámara siempre activa en enrolamiento y kiosco. Comparación local en front (uso local, riesgo aceptado).
- Cuentas: por gerencia Gerente + Coordinador; globales Administrador + RRHH. Registran empleados: Administrador y RRHH. Horarios definen: Administrador y RRHH. Gerente justifica/pase solo su gerencia.
- Clave inicial con cambio obligatorio. Kiosco público con API Key solo-fichaje.
- Justificar: documento opcional, motivo obligatorio. Previo aviso: sin documento, solo motivo, crea pase que habilita entrada fuera de margen.
- Vista única `/admin/consulta`: agrupada por empleado (default), todo combinable, sin vistas guardadas por ahora.
- RNF: tiempo corto (100 emp. max), Bcrypt ≥12, HTTPS obligatorio, hora servidor UTC-4 local, SQL ACID.
- Stack: Next.js 14 + TS + face-api + Prisma + PostgreSQL + NextAuth credentials, Docker (app/db/proxy nginx), Git con ramas y commits convencionales.

## 3. Estado actual — Fase 1 UX (validada, usable, Dashboard por pulir)
Rama `feat/kiosco-ui`. Build OK (16 rutas). Mocks locales en `lib/mock-api.ts`.
- `/` home con accesos · `/kiosco` con 6 simulaciones · `/login` · `/cambio-clave`
- `/admin/consulta ★` vista única flexible (buscador, fechas+presets, gerencia, 8 estados multi, switches extras/anticipada/sin salida, orden, acordeón, ficha lateral, justificar opcional, previo aviso)
- `/admin/empleados` (baja/reactivar, nombre clicable) · `/admin/empleados/nuevo` (2 pasos) · `/admin/empleados/[cedula]` (histórico)
- `/admin/asistencias` (filtros clásicos) · `/admin/reglas` · `/admin/feriados` (día/rango+motivo) · `/admin/vacaciones` · `/admin/auditoria` · `/admin/dashboard` (básico, pendiente pulido)
- Base: `Dockerfile`, `compose.yml`, `nginx.conf`, `.env.example`, `prisma/schema.prisma` (stub), `scripts/download-models.mjs` (stub).

## 4. Modificaciones faltantes (pendientes)
### 4.1 Pulido UX (antes de backend)
- [ ] Pulir `/admin/dashboard`: KPIs hoy (presentes/tardes/faltas/feriado/vacaciones/anticipadas/extras), barras por gerencia en CSS/SVG, últimos 10 fichajes con nombre clicable, presets Hoy/Ayer/Semana, esqueletos y vacíos.
- [ ] Unificar navegación: promover `/admin/consulta` como principal; `dashboard/asistencias/historial` como tabs o accesos secundarios (no duplicar lógica).
- [ ] Accesibilidad kiosco: textos grandes, alto contraste, modo daltónico en badges, foco visible.
- [ ] Confirmar textos exactos de avisos (fuera de margen, cooldown con cuenta regresiva, jornada cerrada).

### 4.2 Backend Fase 2 (orden)
- [ ] Prisma completo: 10 tablas (`gerencias, roles, usuarios, empleados, reglas_asistencia, asistencias, feriados, vacaciones_empleado, pases_previos, logs_auditoria`) + checks + vista `v_asistencias_diarias`. `prisma migrate` + seed (ADMIN/RRHH, regla 08:00/17:00/60, gerencias demo).
- [ ] `AuthController`: login, cambio inicial, JWT 8h con rol, middleware por ruta, API Key kiosco solo `/api/fichaje`.
- [ ] `EmpleadosController`: alta/baja/reactivar, re-enrolamiento, `GET descriptores` para kiosco.
- [ ] `ReglasController`: crear con vigencia futura, validación margen > 0, snapshot en fichaje.
- [ ] `FeriadosController`: día/rango con expansión a filas, anti-duplicado fecha.
- [ ] `VacacionesController`: asignación con anti-solape mismo empleado.
- [ ] `KioscoController` (`/api/fichaje`): entrada/salida, `d<0.5`, cooldown 30 min por empleado, margen 60 + pase, `salida>llegada`, cálculo extras, modal 3s.
- [ ] `AsistenciasController`: filtros sobre vista, justificar (doc opcional) + previo aviso (solo motivo), UPSERT ausencia → JUSTIFICADO, recorte por gerencia.
- [ ] `HistorialController`: ficha por cédula + totales.
- [ ] `AuditoriaController`: escritura en cada acción + lectura ADMIN/RRHH.
- [ ] `scripts/download-models.mjs` real + `public/models` en volumen Docker (no en Git).

### 4.3 Docker / Git / Calidad
- [ ] Certificados locales mkcert para `proxy` (getUserMedia exige HTTPS en LAN) + documentar `docker compose up --build`.
- [ ] Backup diario `db` a `./backups` + prueba de restore.
- [ ] CI GitHub Actions: `tsc + build + prisma validate` por PR. Protección `main`, merge de `feat/kiosco-ui` vía PR.
- [ ] Actualizar Next.js 14.2.5 (aviso de vulnerabilidad) en ventana de mantenimiento.

### 4.4 Preguntas abiertas para Dirección
1. ¿Previo aviso solo Gerente (su gente) + RRHH (todos), nunca con documento? (asumido sí)
2. ¿Referencia salida default 17:00 definitiva?
3. ¿Guardar miniatura `GUARDAR_FOTO_FICHAJE` habilitada o no? (asumido no por defecto)
4. ¿Exportar consulta a Excel/PDF en Fase 2 o después?

## 5. Cómo continuar
1. Pulir dashboard + unificar nav en `feat/kiosco-ui` (UX, sin backend).
2. Validar con usuarios la `/admin/consulta`.
3. Ejecutar 4.2 en orden + 4.3, con seed y prueba punta a punta en Docker.
4. Cerrar 4.4 con Dirección antes del pase a producción local.

*Fuente funcional: `gemini-code-1790955531055.md` (SRS v3.2). Este archivo es el plan operativo y la lista de faltantes.*
