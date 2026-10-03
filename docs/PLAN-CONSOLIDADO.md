# Plan Consolidado — Sistema de Control de Asistencias con Reconocimiento Facial
**Versión SRS v3.2 · Fase 1 UX refinada · Fecha: 2026-10-02**

---

## 1. Resumen ejecutivo
Sistema para automatizar entrada/salida por reconocimiento facial en kiosco, con horario global único, margen de tardanza 60 min editable, cooldown 30 min por empleado, feriados por día o rango, vacaciones por empleado, horas extras, pases previos (previo aviso sin documento), justificativos con documento opcional, histórico clicable, auditoría y vista única de consulta agrupada por empleado.

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

## 3. Estado actual — Fase 1 UX (completa y refinada)
Rama `feat/kiosco-ui`. Build OK (16 rutas). Mocks locales en `lib/mock-api.ts`.

### 3.1 Sistema de diseño (`app/globals.css`) — ✅ Renovado completamente
- Tipografía Inter (Google Fonts), tokens CSS completos (colores, sombras, radios, transiciones)
- Sidebar dark (#0f172a), paleta brand blue + verde esmeralda, badges con 8 estados
- Componentes: card, stat-card, filter-bar, pill-check, switch-wrap, modal, steps, accordion, empty-state, alert, breadcrumb

### 3.2 Páginas completadas
- ✅ `/` — Hero dark gradient, cards acceso, regla vigente
- ✅ `/login` — Tarjeta flotante, toggle password, separador
- ✅ `/cambio-clave` — Estilo login, alert obligatorio
- ✅ `/kiosco` — Fullscreen dark, reloj tiempo real, scan ring animado, toasts colorizados
- ✅ `/admin/layout` — Sidebar fija con secciones, íconos, indicador ruta activa
- ✅ `/admin/dashboard` — 6 KPI stat-cards, tabla últimos fichajes, strip regla vigente
- ✅ `/admin/consulta` ★ — **REFINADA:** chips resumen en vivo, pills de estado con ícono, barra filtros activos, panel lateral sticky con cronología + 4 KPIs, tfoot con totales por empleado, modales con alerts inline
- ✅ `/admin/empleados` — Avatar initials, dot status, acciones contextuales
- ✅ `/admin/empleados/nuevo` — Step indicator, form paso 1, biometría mock paso 2
- ✅ `/admin/empleados/[cedula]` — Breadcrumb, mini-KPIs, tabla completa
- ✅ `/admin/asistencias` — Filtros estado en pills, modales justificar/pase
- ✅ `/admin/reglas` — Card regla vigente destacada, alert inmutabilidad, historial
- ✅ `/admin/feriados` — Toggle día/rango, alert informativo, lista con delete
- ✅ `/admin/vacaciones` — Form + alert anti-solape, tabla períodos
- ✅ `/admin/auditoria` — Badges por tipo acción, filtros, alert read-only

## 4. Modificaciones pendientes

### 4.1 Pulido UX restante (antes de backend)
- [ ] **Dashboard mejorado**: barras de progreso por gerencia en CSS/SVG puro, últimos 10 fichajes con nombre clicable, esqueletos de carga, presets Hoy/Ayer/Semana funcionales en el resumen
- [x] **Accesibilidad kiosco** ✅: textos overlay ≥20px (título) y ≥16px (detalle), foco visible heredado del design system, ARIA roles/live/atomic en todos los overlays, aria-label en todos los botones, role=timer en cooldown con cuenta regresiva real (hook useCooldown), barra de progreso por mensaje, semántica header/main/footer · **COMPLETADO 2026-10-02**
- [x] **Textos exactos de avisos** ✅: 8 escenarios con textos SRS v3.2 (RF-3.1 A TIEMPO, RF-3.2 COMPLETADO, TEMPRANO, RF-3.3 duplicado/jornada cerrada, RF-3.6 no registrado 10s, RF-3.6 multi-rostro 5s, RF-3.8 cooldown, RF-3.10 fuera de margen) + feriado trabajado · **COMPLETADO 2026-10-02**
- [x] **Página 404** ✅: diseño dark gradient consistente, número 404 en gradiente azul/púrpura, CTA Inicio + Dashboard · **COMPLETADO 2026-10-02**

### 4.2 Backend Fase 2 (orden estricto)
- [x] Prisma completo: 10 tablas (`gerencias, roles, usuarios, empleados, reglas_asistencia, asistencias, feriados, vacaciones_empleado, pases_previos, logs_auditoria`) + checks + vista `v_asistencias_diarias`. `prisma migrate` + seed (ADMIN/RRHH, regla 08:00/17:00/60, gerencias demo).
- [x] `AuthController`: login, cambio inicial, JWT 8h con rol, middleware por ruta, API Key kiosco solo `/api/fichaje`.
- [x] `EmpleadosController`: alta/baja/reactivar, re-enrolamiento, `GET descriptores` para kiosco.
- [x] `ReglasController`: crear con vigencia futura, validación margen > 0, snapshot en fichaje.
- [x] `FeriadosController`: día/rango con expansión a filas, anti-duplicado fecha.
- [x] `VacacionesController`: asignación con anti-solape mismo empleado.
- [x] `KioscoController` (`/api/fichaje`): entrada/salida, `d<0.5`, cooldown 30 min por empleado, margen 60 + pase, `salida>llegada`, cálculo extras, modal 3s.
- [x] `AsistenciasController`: filtros sobre vista, justificar (doc opcional) + previo aviso (solo motivo), UPSERT ausencia → JUSTIFICADO, recorte por gerencia.
- [x] `HistorialController`: ficha por cédula + totales.
- [x] `AuditoriaController`: escritura en cada acción + lectura ADMIN/RRHH.
- [x] `scripts/download-models.mjs` real + `public/models` en volumen Docker (no en Git).

### 4.3 Docker / Git / Calidad
- [x] Certificados locales mkcert/openssl para `proxy` (HTTPS obligatorio en LAN) + configuración Docker compose · **COMPLETADO 2026-10-02**
- [x] Backup diario `db` a `./backups` + prueba de restore. Scripts `scripts/backup.ps1` y `scripts/restore.ps1`.
- [x] CI GitHub Actions: `tsc + build + prisma validate` por PR. Protección `main`, merge de `feat/kiosco-ui` vía PR.
- [x] Actualizar Next.js 14.2.14 (aviso de vulnerabilidad) en ventana de mantenimiento.

### 4.4 Preguntas abiertas para Dirección
1. ¿Previo aviso solo Gerente (su gente) + RRHH (todos), nunca con documento? (asumido sí)
2. ¿Referencia salida default 17:00 definitiva?
3. ¿Guardar miniatura `GUARDAR_FOTO_FICHAJE` habilitada o no? (asumido no por defecto)
4. ¿Exportar consulta a Excel/PDF en Fase 2 o después?

## 5. Cómo continuar (orden recomendado)
1. ✅ ~~Rediseño visual completo Fase 1 UX~~ — **COMPLETADO 2026-10-02**
2. ✅ ~~Dashboard mejorado con barras, KPIs y últimos fichajes~~ — **COMPLETADO 2026-10-02**
3. ✅ ~~Accesibilidad kiosco + textos exactos + página 404~~ — **COMPLETADO 2026-10-02**
4. **Ahora → Fase 2 Backend**: ejecutar §4.2 en orden (Prisma, Auth, Controllers) + §4.3 (Docker, CI)
5. Cerrar §4.4 con Dirección antes del pase a producción local

*Fuente funcional: `gemini-code-1790955531055.md` (SRS v3.2). Este archivo es el plan operativo y la lista de faltantes.*
