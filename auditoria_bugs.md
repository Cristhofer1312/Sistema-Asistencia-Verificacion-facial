# Auditoría de bugs — rama `feat/kiosco-ui`

Método: lectura estática del código, más `tsc` (limpio) y `vitest` (63/63). **No ejecuté la app, ni la base de datos, ni `next build`.** Cada hallazgo cita archivo y línea. Los marcados "(inferido)" dependen de cómo se despliegue o de cómo se use.

## 🔴 Críticos

### C1. Se puede fichar a cualquier empleado sin rostro
- [`app/api/fichaje/route.ts`](file:///c:/Users/crisc/Desktop/Asistencia/app/api/fichaje/route.ts#L22-L40) sigue activa. El middleware exime `/api/fichaje`. Solo exige `x-internal-call: true` (spoofable) y `Bearer API_KIOSCO_KEY`.
- Esa clave es `NEXT_PUBLIC_API_KIOSCO_KEY`: va dentro del JS que se envía al navegador. Cualquiera la lee.
- `POST /api/fichaje {empleadoId}` ficha a quien sea, sin biometría.
- Además esta ruta **ignora `anulada: false`** ([L70-85](file:///c:/Users/crisc/Desktop/Asistencia/app/api/fichaje/route.ts#L70-L85)). Una vacación o reposo anulado sigue tratándose como vigente.
- El resumen dice que quedó "inalcanzable". No es cierto. **Fix:** borrar la ruta.

### C2. El anti-video se puede saltar de tres formas
1. [`match/route.ts:173`](file:///c:/Users/crisc/Desktop/Asistencia/app/api/kiosco/match/route.ts#L173): si no llega `challengeId`, no se verifica nada.
2. El propio cliente lo omite tras un error del servidor. En [FaceIdentify.tsx:555-560](file:///c:/Users/crisc/Desktop/Asistencia/components/face/FaceIdentify.tsx#L555-L560) (y con status 403, que no está contemplado):
   - se llama a `resetChallenge()` y el estado se queda en `'matching'`;
   - el siguiente tick (1 s) reenvía el match **sin challenge**, con un nonce nuevo, y el servidor lo acepta.
3. `series` y `quality.poseOk` los envía el cliente. Con la clave pública, un atacante puede mandar el descriptor sacado de una foto, una `series` inventada y `poseOk:true`. El liveness es solo declarativo.

**Fix:** challenge obligatorio, y que el cliente no pase por defecto a reenviar sin challenge. Para un liveness real hay que verificarlo en servidor, o aceptar que es solo disuasorio.

### C3. Fuga de plantillas biométricas
- [`empleados/route.ts:26-32`](file:///c:/Users/crisc/Desktop/Asistencia/app/api/empleados/route.ts#L26-L32) usa `include` sin `select`, así que devuelve `descriptor` de **todos** los empleados a cualquier sesión (incluidos GERENTE y COORDINADOR).
- Pasa igual en `GET /api/empleados/[id]` ([L53](file:///c:/Users/crisc/Desktop/Asistencia/app/api/empleados/%5Bid%5D/route.ts#L53)), en el POST (devuelve `emp`) y en el PATCH.
- Contradice "plantillas nunca salen del servidor".

### C4. GERENTE o COORDINADOR sin gerencia ve todo
- [`usuarios/route.ts:24-28`](file:///c:/Users/crisc/Desktop/Asistencia/app/api/usuarios/route.ts#L24-L28) permite crear GERENTE/COORDINADOR con `gerenciaId` nulo (o inexistente, que da un 500 por la FK).
- Con `gerenciaId` nulo, el filtro pasa a `undefined` y Prisma **no filtra**:
  - `empleados` GET ([L21](file:///c:/Users/crisc/Desktop/Asistencia/app/api/empleados/route.ts#L21));
  - `vacaciones`, `asistencias` y `pase-previo`, con `?? undefined`.
- El usuario ve todos los empleados, asistencias y permisos. **Fix:** exigir `gerenciaId` para esos roles y, en los filtros, denegar si falta.

### C5. Despliegue Docker: el kiosco recibe 401
- [`.dockerignore`](file:///c:/Users/crisc/Desktop/Asistencia/.dockerignore) excluye `.env` y el [Dockerfile](file:///c:/Users/crisc/Desktop/Asistencia/Dockerfile) no tiene `ARG`/`ENV` para `NEXT_PUBLIC_API_KIOSCO_KEY`.
- Next incrusta esa variable en el build, así que el cliente enviará `Bearer ` vacío y el servidor tendrá otra clave. (Inferido: no construí la imagen.)
- Otros problemas del despliegue:
  - Con `API_KIOSCO_KEY` vacía en el servidor, `Bearer ` pasa la autenticación.
  - Nada ejecuta `prisma migrate deploy`.
  - `nginx.conf` necesita `./certs`, que se borraron del repo.
  - Los modelos de `public/models/*.bin|json` están en `.gitignore`, así que un clon limpio no los tiene.
  - Credenciales y secretos por defecto en `compose.yml`, y el puerto 5433 de la BD expuesto al host.

## 🟠 Altos

| # | Bug | Dónde |
|---|-----|-------|
| A1 | **Fallo funcional del kiosco:** `poseOk: move` se calcula en el último frame. El paso FRENTE se cumple con \|yaw\| ≤ 14, pero `move` exige \|yaw\| > 5. Con la cabeza recta, el servidor rechaza con "movimiento de cabeza no detectado" (400). | [FaceIdentify.tsx:331,394](file:///c:/Users/crisc/Desktop/Asistencia/components/face/FaceIdentify.tsx#L331) · [match:62](file:///c:/Users/crisc/Desktop/Asistencia/app/api/kiosco/match/route.ts#L62) |
| A2 | Estado `'error'` terminal: tras un fallo de challenge o un 401, el kiosco queda muerto hasta recargar. El watchdog solo vigila 3 estados. El mensaje de error de la página (`error`) nunca se muestra en el JSX. | FaceIdentify:171-175,503-505 · [kiosco/page.tsx:47](file:///c:/Users/crisc/Desktop/Asistencia/app/kiosco/page.tsx#L47) |
| A3 | Un 403 `fuera_de_margen` no está manejado en el catch. Entra en bucle: reintenta cada segundo con un nonce nuevo, genera ruido en la tabla de nonces y en la auditoría, y salta el challenge (ver C2). | FaceIdentify:555 |
| A4 | El "match atómico" no existe. `executeFichaje` hace leer y luego escribir sin transacción. Dos escaneos simultáneos pueden dar P2002 → 500 genérico. También se consume el pase antes del `create`: si este falla, el pase se pierde. La salida se actualiza sin condición (doble salida pisa datos). | [fichaje.ts:40-166](file:///c:/Users/crisc/Desktop/Asistencia/lib/fichaje.ts#L40-L166) |
| A5 | `cambio-clave` acepta `actual` como opcional **siempre**. Con una sesión robada se cambia la clave sin conocer la anterior. | [cambio-clave:55](file:///c:/Users/crisc/Desktop/Asistencia/app/api/cambio-clave/route.ts#L55) |
| A6 | El JWT nunca se revalida: no hay `trigger==='update'` ni consulta a BD. Un usuario desactivado, eliminado o con rol cambiado mantiene acceso hasta 8 h. `claveInicial` queda `true` en el token tras cambiar la clave (el middleware seguiría redirigiendo a `/cambio-clave`, a verificar en la UI). | [auth.ts:58-80](file:///c:/Users/crisc/Desktop/Asistencia/lib/auth.ts#L58-L80) |
| A7 | Sin rate limit ni bloqueo en login. Clave de reseteo fija y conocida `Cambiar1234!`. Con `claveInicial=true`, el middleware solo bloquea `/admin/*`, no las APIs. | auth.ts · [usuarios/[id]:18](file:///c:/Users/crisc/Desktop/Asistencia/app/api/usuarios/%5Bid%5D/route.ts#L18) |
| A8 | `POST /api/empleados` hace `prisma.empleado.create({ data })` con el body crudo, sin validar. Permite fijar `descriptor`, `activo` e `id`, y un JSON inválido da 500. | [empleados/route.ts:41-43](file:///c:/Users/crisc/Desktop/Asistencia/app/api/empleados/route.ts#L41-L43) |
| A9 | `/admin/usuarios` no está protegido por middleware ni por layout. Solo se oculta el enlace (el layout es cliente). La API sí devuelve 403. | [admin/layout.tsx:49](file:///c:/Users/crisc/Desktop/Asistencia/app/admin/layout.tsx#L49) · [middleware.ts:22](file:///c:/Users/crisc/Desktop/Asistencia/middleware.ts#L22) |

## 🟡 Medios (lógica de negocio y datos)

- **M1 — Feriado vs. individual inconsistente.** `executeFichaje` evalúa el feriado **antes** que la vacación ([L102-116](file:///c:/Users/crisc/Desktop/Asistencia/lib/fichaje.ts#L102-L116)). El auto-marcado y el cierre dicen que "lo individual manda". Un empleado de vacaciones que ficha en feriado queda FERIADO.
- **M2 — Cierre diario en UTC, no en hora de Venezuela.** [`marcarFaltantes`](file:///c:/Users/crisc/Desktop/Asistencia/lib/auto-marcado.ts#L209-L214) calcula "ayer" con `getUTC*`. Entre las 20:00 y las 23:59 VE, "ayer" es el día VE de **hoy**, y se puede cerrar el día en curso (viola "nunca hoy").
- **M3 — `autoMarkFeriado` no convierte filas FALTA** ya creadas por un cierre previo (`autoMarkRange` sí). Un feriado cargado a posteriori deja FALTA.
- **M4 — `revertRange` borra las filas** que antes eran FALTA y se convirtieron (se pierde `estadoOriginal`). Sin cierre repetido no se restauran. Una fila con escaneo sigue como VACACIONES aunque la vacación se anule.
- **M5 — Fila hoy sin entrada** con un estado que no es especial (por ejemplo FALTA o JUSTIFICADO) se trata como **salida** en `executeFichaje` ([L66-99](file:///c:/Users/crisc/Desktop/Asistencia/lib/fichaje.ts#L66-L99)). Se registra una salida sin entrada.
- **M6 — Rango de permisos sin límite.** Vacaciones/reposos/`diasHabiles` aceptan un rango enorme (año 2000 a 9999). El bucle `autoMarkRange` hace 2 consultas por día. Es una denegación de servicio. Fechas inválidas como `2026-13-45` dan 500.
- **M7 — `feriados` POST, `reglas` POST** sin validación (zod). Con `motivo`, `fecha` o `horaLimite` nulos dan 500 o `NaN`.
- **M8 — Kiosco muestra la regla equivocada:** `data[0]` ordenado por `vigenciaDesde desc` puede ser una **regla futura**, no la vigente ([kiosco/page.tsx:71](file:///c:/Users/crisc/Desktop/Asistencia/app/kiosco/page.tsx#L71)).
- **M9 — Nonces y challenges nunca se purgan** (sin `deleteMany`). Las tablas crecen sin límite.
- **M10 — `audit` guarda `x-forwarded-for` crudo** en un `VarChar(45)`. Con una lista de IPs el insert falla, y `audit` lo traga en silencio, así que se pierde el log de seguridad. El valor además es spoofable.
- **M11 — Reconciliación en un GET.** `GET /api/asistencias` crea filas (`autoMarkRange`) en cada lectura: es lento y tiene efectos laterales en una lectura. (Esto es una decisión de diseño, no un error.)
- **M12 — Cache de descriptores** solo en memoria del proceso. Con varias instancias, el enrolamiento o la baja no se propaga. El match tras desactivar a un empleado da 500 (ver nota).

> Nota M12: si el empleado se desactiva en otra instancia, el match lo encuentra en caché y `executeFichaje` lanza "Empleado no encontrado o inactivo". El catch de match lo convierte en 500.

## 🟢 Bajos
- La hora guardada depende de `TZ`. En contenedor UTC, `entrada` queda 4 h antes del instante real. Con `TZ=America/Caracas` (el compose lo fija) es correcto. Datos mezclados entre entornos se leerían mal.
- `situacion` en vacaciones usa `setHours` local, no UTC ni VE.
- Los commits dejan `tsconfig.tsbuildinfo` versionado, y `vitest.config.ts` emite warnings de ESM.
- `asistencias` GET tiene tope silencioso `take: 500`: oculta resultados sin avisar.
- `justificar` no marca ni revierte la auto-marca, y las anulaciones no son transaccionales (update + revert separados).
- `audit` queda con `usuarioId` nulo (SetNull) al borrar un usuario: se pierde la atribución de las acciones previas.

## Orden de arreglo sugerido
1. **C1** (eliminar `/api/fichaje`), **C2** (challenge obligatorio y sin fallback en el cliente), **C3** (quitar `descriptor` de las respuestas), **C4**.
2. **A1 + A2 + A3** (el kiosco hoy falla y se bloquea en casos reales).
3. **C5** (build de Docker) antes de cualquier despliegue.
4. **A4–A9**, luego los medios.
