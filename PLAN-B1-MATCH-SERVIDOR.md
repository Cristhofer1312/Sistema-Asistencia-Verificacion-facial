# Plan B1: Match Facial en Servidor

## Resumen
Mover la comparación 1:N del kiosco al servidor. El kiosco envía probe (descriptor + calidad + liveness + nonce), el servidor valida, compara contra BD y ejecuta fichaje atómicamente.

---

## 1. Cambios de Base de Datos (Migración Prisma)

### 1.1 Tabla `KioscoNonce` (anti-replay)
```prisma
model KioscoNonce {
  id        String   @id @default(cuid())
  nonce     String   @unique
  usadoEn   DateTime @default(now())
  expiraEn  DateTime
  @@index([expiraEn])
}
```

### 1.2 Enum `AccionAuditoria` - agregar:
```
MATCH_KIOSCO
MATCH_KIOSCO_UNKNOWN
MATCH_KIOSCO_REPLAY
MATCH_KIOSCO_BAD_QUALITY
```

### 1.3 Comando
```bash
npx prisma migrate dev --name add_kiosco_nonce
npx prisma generate
```

---

## 2. Endpoint Nuevo: `POST /api/kiosco/match`

### Contrato de entrada
```json
{
  "descriptor": [128 floats],
  "quality": {
    "earOk": true,
    "poseOk": true,
    "brightness": 120,
    "centered": true,
    "distance": true
  },
  "nonce": "uuid-v4",
  "timestamp": 1700000000000
}
```

### Validaciones servidor
1. **Auth**: `API_KIOSCO_KEY` (header `Authorization: Bearer <key>`)
2. **Forma**: descriptor = 128 floats finitos, quality flags boolean, nonce string, timestamp number
3. **Frescura**: `|now - timestamp| <= 60s`
4. **Nonce único**: buscar en `KioscoNonce`; si existe → 409 REPLAY; si no, insertar con `expiraEn = now + 2 min`
5. **Calidad mínima**: `earOk && poseOk && brightness 40-220 && centered && distance` → si falla → 400 BAD_QUALITY + audit
6. **Caché descriptores**: cargar una vez al inicio + invalidar al enrolar/desactivar empleado
7. **Match**: `euclideanDistance < 0.5` + margen ambigüedad `0.06` (reutiliza `lib/face-api.ts:97-141`)
8. **Si match OK**: ejecutar lógica de fichaje (misma que `/api/fichaje`) en **transacción** → devuelve `{ ok: true, tipo, msg, extrasH? }`
9. **Si no match**: audit `MATCH_KIOSCO_UNKNOWN` → 404 UNKNOWN
10. **Errores**: 500 solo en fallo BD inesperado; nunca expone vectores

### Respuesta éxito
```json
{ "ok": true, "tipo": "entrada|salida|feriado|vacaciones|...", "msg": "...", "extrasH?: number }
```

---

## 3. Modificaciones Frontend

### 3.1 `lib/api.ts` - agregar
```typescript
kiosco: {
  match: (data: { descriptor: number[]; quality: QualityData; nonce: string; timestamp: number }) =>
    fetchJson("/api/kiosco/match", { method: "POST", body: JSON.stringify(data) })
}
```

### 3.2 `components/face/FaceIdentify.tsx`
- Eliminar: `descriptorsRef`, `startCamera` precarga `/api/kiosco/descriptors`, `findBestMatch` local
- En `liveness_check` OK: generar `nonce = crypto.randomUUID()`, `timestamp = Date.now()`, enviar probe a `api.kiosco.match()`
- Manejar respuestas: success → `onMatch`, unknown → `onUnknown`, cooldown/replay/bad_quality → mensajes apropiados
- Eliminar estado `loading_descriptors`

### 3.3 `app/kiosco/page.tsx` - sin cambios (usa FaceIdentify)

---

## 4. Middleware (`middleware.ts`)

Agregar `/api/kiosco/match` a rutas públicas (callback `authorized`):
```typescript
pathname.startsWith("/api/kiosco") // ya incluye descriptors, agregar match
```

---

## 5. Endpoint `/api/fichaje` - Proteger

Opción A (recomendada): Cambiar a clave interna no pública
- Renombrar `API_KIOSCO_KEY` → `API_KIOSCO_KEY_PUBLIC` (para match)
- Crear `API_FICHAJE_INTERNAL_KEY` (solo servidor)
- `/api/fichaje` valida `API_FICHAJE_INTERNAL_KEY` → solo llamable desde `/api/kiosco/match`

Opción B (más simple): Mantener `API_KIOSCO_KEY` pero `/api/fichaje` exige header `X-Internal-Call: true` que solo pone el match endpoint.

---

## 6. Eliminar `/api/kiosco/descriptors`

- Borrar `app/api/kiosco/descriptors/route.ts`
- Confirmar que no hay otros consumidores (grepeado: solo `FaceIdentify.tsx`)

---

## 7. Cache de Descriptores en Memoria

```typescript
// lib/face-cache.ts
let descriptorsCache: DescriptorEntry[] | null = null;
let cacheVersion = 0;

export function getDescriptorsCache(): DescriptorEntry[] {
  return descriptorsCache ?? [];
}

export async function refreshDescriptorsCache(prisma: PrismaClient) {
  const empleados = await prisma.empleado.findMany({
    where: { activo: true, descriptor: { not: null } },
    select: { id: true, cedula: true, nombre: true, apellido: true, descriptor: true }
  });
  descriptorsCache = empleados
    .filter(e => e.descriptor)
    .map(e => ({
      empleadoId: e.id,
      cedula: e.cedula,
      nombre: e.nombre,
      apellido: e.apellido,
      descriptor: descriptorToArray(bufferToDescriptor(Buffer.from(e.descriptor!)))
    }));
  cacheVersion++;
}

export function invalidateDescriptorsCache() {
  descriptorsCache = null;
}
```

- Llamar `refreshDescriptorsCache` al arrancar servidor
- Llamar `invalidateDescriptorsCache` en `POST /api/empleados/[id]/enroll` y `PATCH /api/empleados/[id]` (desactiva)

---

## 8. Orden de Despliegue (Ventana de Compatibilidad)

| Paso | Acción | Por qué |
|---|---|---|
| 1 | Desplegar **match** nuevo + cache + migración BD | Kioscos viejos siguen usando `descriptors` |
| 2 | Rebuild kioscos con nuevo `FaceIdentify` + rotar `NEXT_PUBLIC_API_KIOSCO_KEY` | Kioscos nuevos usan `match` |
| 3 | Verificar 100% kioscos actualizados | Sin mezcla viejo/nuevo |
| 4 | Eliminar `descriptors` endpoint + cerrar `fichaje` directo | Limpieza, reduce superficie |
| 5 | (Opcional) Re-enrolamiento progresivo | Si key antigua se filtró ampliamente |

**Rollback**: Revertir commit del paso 1 → kioscos viejos vuelven a funcionar (sin rebuild).

---

## 9. Criterios de Aceptación (Definition of Done)

| Test | Esperado |
|---|---|
| Kiosco ficha entrada empleado válido | 200 + `tipo: "entrada"` + audit `MATCH_KIOSCO` |
| Kiosco ficha salida mismo empleado | 200 + `tipo: "salida|completado|temprano"` |
| Empleado desconocido (probe aleatorio) | 404 + audit `MATCH_KIOSCO_UNKNOWN` |
| Replay (mismo nonce 2x) | 409 + audit `MATCH_KIOSCO_REPLAY` |
| Timestamp > 60s | 400 |
| Descriptor malformado (≠128 floats) | 400 |
| Calidad falla (sin parpadeo) | 400 + audit `MATCH_KIOSCO_BAD_QUALITY` |
| Cooldown 30 min activo | 429 desde match (sin llegar a fichaje) |
| 2 kioscos mismo empleado mismo segundo | **Sin P2002** (transacción) |
| Build `next build` | ✅ Sin errores TypeScript |
| `prisma migrate deploy` | ✅ Migración aplicada |

---

## 10. Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| `P2002` en concurrencia | Media | Alto (500 en hora pico) | Transacción en match + reintento 1x |
| Cache stale tras enrolar | Baja | Medio (match falla) | `invalidateDescriptorsCache` en enrol/desactiva |
| Key rotada pero kiosco viejo | Media | Alto (kiosco muerto) | Ventana compatibilidad + comunicación |
| Memoria cache crece | Muy baja | Bajo | 300 × 128 floats ≈ 150 KB |

---

## 11. Archivos a Crear/Modificar

| Archivo | Acción |
|---|---|
| `prisma/schema.prisma` | + `KioscoNonce`, + enum `AccionAuditoria` |
| `prisma/migrations/.../migration.sql` | Auto-generada |
| `app/api/kiosco/match/route.ts` | **NUEVO** - endpoint principal |
| `app/api/kiosco/descriptors/route.ts` | **ELIMINAR** (paso 4) |
| `app/api/fichaje/route.ts` | Proteger con clave interna |
| `components/face/FaceIdentify.tsx` | Reemplazar match local por `api.kiosco.match` |
| `lib/api.ts` | + `api.kiosco.match()` |
| `lib/face-cache.ts` | **NUEVO** - cache en memoria |
| `lib/face-api.ts` | Exportar `euclideanDistance`, `findBestMatch` para servidor (ya no usa face-api) |
| `middleware.ts` | + exención `/api/kiosco/match` |
| `lib/auditoria.ts` | Sin cambios (ya usa try/catch) |

---

## 12. Próximo paso

Ejecutar el plan en modo build:
1. Migración Prisma (`KioscoNonce` + enum)
2. `lib/face-cache.ts` + exportar helpers de match en `lib/face-api.ts`
3. `app/api/kiosco/match/route.ts`
4. `lib/api.ts` + `FaceIdentify.tsx` + `middleware.ts`
5. Proteger `/api/fichaje`
6. Build + test manual