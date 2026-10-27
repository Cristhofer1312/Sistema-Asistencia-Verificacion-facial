# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Attendance system with facial recognition ("asistencia facial"). Next.js 14 App Router + Prisma/PostgreSQL. Domain terms, identifiers, and comments are in Spanish (`fichaje` = clock-in/out, `cedula`, `gerencia`, `pase previo`, `permiso estudiantil`, `reposo medico`); keep that convention. Design docs `PLAN-B1-MATCH-SERVIDOR.md` and `auditoria_bugs.md` are historical: the plan is largely implemented, and the audit is a point-in-time snapshot whose findings may already be fixed (e.g., `/api/fichaje` no longer exists). Verify before acting on either.

## Commands

Requires Node 20 and a PostgreSQL database reachable at `DATABASE_URL` (copy `.env.example` to `.env`). The quickest DB is `docker compose up -d db` (exposed on host port 5433).

```bash
npm ci --legacy-peer-deps            # plain npm install fails: vitest peer wants @types/node >=22
npx prisma generate                 # regenerate client after schema changes
npx prisma migrate dev --name <x>   # create + apply a migration (dev only)
npx prisma migrate deploy           # apply existing migrations (prod; not run by the Dockerfile)
npx prisma db seed                  # admin/RRHH seed users (prisma/seed.ts)
npm run dev                         # http://localhost:3000
npm run build && npm start
npx tsc --noEmit                    # typecheck (the closest thing to lint right now)

npx vitest run                      # all tests (vitest.config.ts includes *.test.ts(x))
npx vitest run lib/auto-marcado.test.ts
npx vitest run -t "nombre del test" # filter by test name
npx vitest                          # watch mode

npx tsx scripts/reset-db.ts         # DESTRUCTIVE: drops and recreates the public schema
```

Notes:
- The face-api models served at `/models` are not in git (`.gitignore`). `scripts/copiar-modelos.mjs` copies them from `node_modules/@vladmandic/face-api/model` to `public/models`; it runs automatically via `predev`/`prebuild`, or manually with `npm run models`. A 404 on `/models/*.json` means this step did not run. The same script downloads the COCO-SSD weights (~18 MB) used by the anti-screen detector into `public/models/coco-ssd/` from the official TensorFlow bucket, verifying pinned SHA-256 hashes; the first run needs internet.
- `npm run lint` is wired to `next lint`, but there is no ESLint config in the repo, so it will prompt for setup.
- `npm run db:seed-demo` points to `prisma/seed-demo.ts`, which does not exist.
- There is no `npm test` script; use `npx vitest`.
- Full stack via Docker: `docker compose up --build` serves the app behind nginx on 80/443. nginx expects TLS certs in `./certs` (not in the repo). Backups: `scripts/backup.ps1` and `scripts/restore.ps1` (Windows PowerShell, run against the `asistencia-db-1` container).
- `NEXT_PUBLIC_API_KIOSCO_KEY` is a build-time arg (Dockerfile `ARG`) and is inlined into the client bundle. It is not in `.env.example`; the server-side `API_KIOSCO_KEY` must match it.

## Test setup

`vitest.setup.ts` globally mocks `@/lib/prisma`, `@/lib/auditoria`, and `@/lib/date-utils` (fixed date 2026-01-15 10:00 VE), and resets the face cache before each test. Unit tests do not touch a database. New tests that need DB-like behavior should follow the `mockPrisma` pattern exported from that file.

## Architecture (big picture)

**Access control** spans three layers that must stay consistent:
- `middleware.ts` runs `withAuth` (NextAuth) and delegates the decision to `lib/route-access.ts` (`decideAccess`, pure and side-effect free). It handles the forced password change (`claveInicial` redirects `/admin/*` and blocks `/api/*` except auth, cambio-clave, and kiosco) and role gating for `/admin/usuarios` (ADMIN only) and the RRHH-or-ADMIN pages.
- Public paths are whitelisted in the `authorized` callback in `middleware.ts`: `/`, `/kiosco`, `/models`, `/api/kiosco/*`, `/api/auth`, and `GET /api/reglas`. Kiosk endpoints authenticate with `Authorization: Bearer API_KIOSCO_KEY` inside each route, not via session.
- Data scope lives in `lib/scope.ts` (`getScope`): ADMIN and RRHH are global; GERENTE and COORDINADOR are limited to their `gerenciaId`; anything else is denied. Each API route applies the scope itself, since the middleware only checks paths and roles. Never pass an `undefined` gerenciaId into Prisma; it means "no filter".
- Auth (`lib/auth.ts`): credentials provider, JWT sessions (8 h), lockout after 5 failed logins for 15 minutes (`intentosFallidos`, `bloqueadoHasta`), and login/logout written to the audit log.

**Facial kiosk pipeline** (the core flow; read these together):
1. Browser (`components/face/FaceIdentify.tsx`, face-api models from `/models`, helpers in `lib/face-api.ts`) detects the face, runs a liveness challenge (a sequence of head poses such as IZQUIERDA/DERECHA/FRENTE), and computes a 128-float descriptor.
2. `POST /api/kiosco/challenge` issues a single-use challenge. `POST /api/kiosco/match` (`app/api/kiosco/match/route.ts`) then verifies, in order: API key, payload shape, timestamp within ±60 s, the anti-screen check (`pantalla`, see below), quality gates (brightness, centering, distance), the challenge (single use, expires, completed within 15 s), nonce anti-replay (`KioscoNonce`, 2 min TTL), and finally the match.
3. Matching is 1:N against an in-memory cache of active employees' descriptors (`lib/face-cache.ts`, stored on `globalThis`, refreshed on demand). Thresholds and the match/agreement logic live only in `lib/face-server.ts`. An optional second probe (`descriptor2`) must resolve to the same employee.
4. Anti-screen (`lib/anti-pantalla.ts` in the browser, rules in `lib/anti-pantalla-reglas.ts`): while taking probe samples the kiosk runs COCO-SSD (via face-api's bundled tf) and blocks when the face box lies inside a detected cell phone, tv or laptop. The match payload must carry `pantalla` (`revisado`, `revisiones` ≥ 1, `detectado`); missing → 400 `pantalla_requerida` (fails closed). On `detectado` the server identifies the face only for the `MATCH_KIOSCO_PANTALLA` audit entry, never clocks in, and returns 403 `pantalla_detectada` without the identity. The liveness challenge is currently a single FRENTE step by design.
5. On match, `executeFichaje` runs inside a Prisma transaction. Every outcome, including failures, is written to `LogAuditoria` via `audit()`, which never throws.

**Clock-in logic** (`lib/fichaje.ts`): the same route decides entrada or salida from the day's existing `Asistencia` row (`@@unique([empleadoId, fecha])`). Order of precedence: cooldown from `ReglaAsistencia`, then a placeholder row auto-created by vacation, reposo, or feriado (the scan fills it in), then feriado, vacation, or reposo classes, then the entry window. `PermisoEstudiantil` can only extend the general `horaLimite`, never shorten it. A `PasePrevio` converts a TARDE into JUSTIFICADO. Late arrivals are always recorded as TARDE; there is no hard rejection. An active reposo médico does reject the scan (`REPOSO:` error → 403 `reposo_medico`), except to close an entry made before the reposo was loaded. Overtime on normal days comes from `lib/jornada.ts`: time after `horaReferencia` minus the minutes arrived after `horaEntrada` (never negative). An applied student permit exempts lateness up to its `horaLimite` (it replaces `horaEntrada` in the deduction); a `PasePrevio` does not. On feriado/vacaciones all time worked is overtime. A third scan overwrites the previous `salida`.

**Automatic attendance marks** (`lib/auto-marcado.ts`): creates rows without `entrada` for business days (Mon–Fri) covered by vacation, reposo, or feriado. `revertRange` undoes those marks on cancellation (another leave or feriado covering the day wins; a past day becomes FALTA, or a justified FALTA if a pase is pending; today and future days are deleted). `POST /api/reposos/reactivar` reverses an annulment by running `autoMarkRange` again, which turns those FALTAs back into REPOSO_MEDICO. `marcarFaltantes` is the daily close (past days only, never before an employee's `creadoEn`, and it never overwrites rows that have a scan). Individual leave outranks a feriado; a pending `PasePrevio` (either type) for that day turns the FALTA into JUSTIFICADO with `estadoOriginal: FALTA` and consumes the pase. `lib/cierre-automatico.ts`, started from `instrumentation.ts`, runs the close every 15 minutes over the last 7 finished days (idempotent; `CIERRE_AUTOMATICO=false` disables it).

**Time zone**: business logic runs on Venezuela time (`America/Caracas`). Use `getVenezuelaDate` and `toDateOnly` from `lib/date-utils.ts`. Do not compute the offset manually with `getTimezoneOffset`; the match route documents why that broke. Stored timestamps and `hhmm()` in `/api/asistencias` rely on the process running in `America/Caracas`; `instrumentation.ts` forces `TZ` at server start and logs an error if it does not take effect.

**Data**: `prisma/schema.prisma` is the single schema (`Asistencia` is the central table). Face descriptors are `Bytes` (128 × Float32), converted with `lib/descriptor-utils.ts`. `LogAuditoria` is append-only by convention; never delete from it.

**Frontend**: `app/admin/*` pages sit under `app/admin/layout.tsx`, which filters the nav by role. `app/kiosco/page.tsx` is the public kiosk screen. `lib/api.ts` is the client fetch wrapper for `/api/*`. Pages use the shared classes in `app/globals.css` (`card`, `table-wrap`, `modal-bg`/`modal`, `alert-*`, `badge b-*`, `btn-*`); there is no Bootstrap, so classes like `form-control` or `table` do nothing. Dropdowns use the custom `components/ui/Select.tsx` (its `onChange` receives `{target:{value}}`); employee pickers pass `searchable`, which filters by label text ignoring accents, dots and dashes. Admin pages restricted to ADMIN/RRHH must be listed both in `SOLO_ADMIN_RRHH` (`lib/route-access.ts`) and in the nav filter in `app/admin/layout.tsx`. `/admin/diagnostico` is the UI for `GET /api/diagnostico/colisiones` (look-alike face signatures). Every RRHH count (dashboard, consulta, ficha) must come from `lib/metricas.ts`, which puts each row in exactly one class: TEMPRANO counts as puntual, and justified lateness/absence are separate from TARDE/FALTA so nothing is counted twice. Use `CLASES` and `porcentajeAsistencia` from there too.

**Reports** (every listing view follows this pattern): `components/ui/Reporte.tsx` provides:
- `RangoFechas`: period presets plus desde/hasta. Preset math is in `lib/rangos.ts`, a pure module, because date-utils is mocked in tests.
- `AccionesReporte`: Excel export and print/PDF.
- `EncabezadoImpresion`: the print-only header.
- `useOrden`: sortable `<Th>` headers.
- `Paginacion` + `paginar`.
- `KpiStrip`.

CSV export goes through `lib/export.ts` (BOM, `;` separator, decimal comma, so Excel in Spanish opens it directly). Print styles are in the "Reportes / consultas" block of `app/globals.css`: anything that should not be printed gets `no-print`. Query APIs:
- `GET /api/asistencias` also takes `estados=A,B` and `q` (nombre/apellido/cédula), and returns `autorizador` (username). Its vacation/reposo reconciliation only writes when `requiereMarcado` (`lib/auto-marcado.ts`) detects missing marks.
- `GET /api/auditoria` is filtered and paginated on the server: `desde`, `hasta`, `accion=A,B`, `usuario=<username|sistema>`, `q`, `page`, `pageSize` ≤ 5000. It returns `{filas, total, page, pageSize, usuarios}`, backed by the `LogAuditoria` (accion, ts) and (usuarioId, ts) indexes.
- The other listing GETs cap at `take: 5000`.

## Gotchas

- **Thresholds**: edit `lib/face-server.ts` only. `lib/face-api.ts` re-exports the constants but also keeps its own `findBestMatch` and `findBestMatchServer` copies. The server route does not use those copies, so changing them has no effect on matching.
- **Cache freshness**: changes to employee descriptors or active status must invalidate or refresh the cache. The match route already self-heals when a matched employee is gone (`refreshDescriptorsCache`).
- **Schema changes**: after editing `schema.prisma`, run `npx prisma generate` and then `npx prisma migrate dev --name <x>`; `npx tsc --noEmit` catches type drift.
- **Report row limits**: `GET /api/asistencias` returns a whole `desde`+`hasta` range up to 10 000 rows and sets `X-Total-Count`/`X-Truncado`. Views must load it through `fetchAsistencias` in `lib/api.ts` and show `components/ui/AvisoTruncado.tsx` when truncated, never compute totals from a silently cut list.
- **Kiosk key**: `API_KIOSCO_KEY` (server) and `NEXT_PUBLIC_API_KIOSCO_KEY` (client) are the same shared secret. Anything in the client bundle is public.
