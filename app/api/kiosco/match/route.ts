// app/api/kiosco/match/route.ts — Match facial en servidor (B1)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/auditoria";
import { getDescriptorsCache, refreshDescriptorsCache } from "@/lib/face-cache";
import { euclideanDistanceServer, findBestMatchServer, agreeMatches, MATCH_DISTANCE_THRESHOLD, MATCH_AMBIGUITY_MARGIN } from "@/lib/face-server";
import { getVenezuelaDate, toDateOnly } from "@/lib/date-utils";
import { executeFichaje } from "@/lib/fichaje";

const KIOSCO_KEY = process.env.API_KIOSCO_KEY ?? "";
const NONCE_TTL_MS = 2 * 60 * 1000; // 2 min
const TIMESTAMP_WINDOW_MS = 60 * 1000; // ±60s
const CHALLENGE_MAX_DURATION_MS = 15 * 1000; // 15s máx para completar el challenge
const YAW_THRESHOLD = 10; // giro leve: mismos ±10° que el cliente (facilidad de escaneo)

interface QualityData {
  earOk: boolean; // compatibilidad: ya no bloquea (parpadeo eliminado)
  poseOk: boolean;
  brightness: number;
  centered: boolean;
  distance: boolean;
}

interface SeriesPoint {
  yaw: number;
  pitch: number;
  t: number; // ms relativos al primer frame
}

interface MatchRequest {
  descriptor: number[];
  descriptor2?: number[]; // segundo probe independiente (doble verificación)
  quality: QualityData;
  nonce: string;
  timestamp: number;
  challengeId?: string;
  series?: SeriesPoint[];
}

async function ensureCacheLoaded(): Promise<void> {
  if (getDescriptorsCache().length === 0) {
    await refreshDescriptorsCache(prisma);
  }
}

function validateQuality(quality: QualityData): string | null {
  // earOk ya no bloquea: el parpadeo fue reemplazado por el challenge de poses
  // poseOk tampoco bloquea aquí, porque el simple hecho de completar el challenge (verificado después) ya garantiza que es un ser vivo (liveness)
  // Brillo mínimo 40: por debajo los descriptores pierden detalle (crítico en
  // piel oscura) y las distancias entre personas distintas se comprimen,
  // causando confusiones. El kiosco ya filtra frames < 40 antes de enviar.
  if (quality.brightness < 55 || quality.brightness > 240) return "iluminación inadecuada (muy baja o quemada)";
  if (!quality.centered) return "rostro no centrado";
  if (!quality.distance) return "distancia inadecuada";
  return null;
}

async function checkAndStoreNonce(nonce: string): Promise<boolean> {
  const existing = await prisma.kioscoNonce.findUnique({ where: { nonce } });
  if (existing) return false;

  const expiraEn = new Date(Date.now() + NONCE_TTL_MS);
  await prisma.kioscoNonce.create({
    data: { nonce, expiraEn },
  });
  return true;
}

async function verifyChallenge(challengeId: string, series: SeriesPoint[] | undefined): Promise<{ ok: boolean; error?: string }> {
  if (!challengeId || !series || series.length === 0) {
    return { ok: false, error: "Challenge requerido: falta challengeId o serie de poses" };
  }

  const challenge = await prisma.kioscoChallenge.findUnique({ where: { id: challengeId } });
  if (!challenge) return { ok: false, error: "Challenge no encontrado" };
  if (challenge.usado) return { ok: false, error: "Challenge ya utilizado" };
  if (new Date() > challenge.expiraEn) return { ok: false, error: "Challenge expirado" };

  const steps = JSON.parse(challenge.steps) as string[]; // ej: ["IZQUIERDA", "DERECHA", "FRENTE"]
  if (steps.length === 0) return { ok: false, error: "Challenge inválido: sin pasos" };

  const firstT = series[0].t;
  const lastT = series[series.length - 1].t;
  if (lastT - firstT > CHALLENGE_MAX_DURATION_MS) {
    return { ok: false, error: "Challenge excede tiempo máximo (15s)" };
  }

  let stepIdx = 0;
  for (const point of series) {
    const expected = steps[stepIdx];
    if (!expected) break; // todos los pasos completados

    let ok = false;
    if (expected === "IZQUIERDA") ok = point.yaw <= -YAW_THRESHOLD;
    else if (expected === "DERECHA") ok = point.yaw >= YAW_THRESHOLD;
    else if (expected === "FRENTE") ok = Math.abs(point.yaw) <= 30 && Math.abs(point.pitch) <= 30; // frente con margen amplio (igual que el cliente)

    if (ok) {
      stepIdx++;
      if (stepIdx >= steps.length) break;
    }
  }

  if (stepIdx < steps.length) {
    return { ok: false, error: "Challenge incompleto: no se cumplieron todos los pasos en orden" };
  }

  await prisma.kioscoChallenge.update({
    where: { id: challengeId },
    data: { usado: true },
  });

  return { ok: true };
}

async function performMatch(descriptor: number[], descriptor2?: number[]) {
  const cache = getDescriptorsCache();
  if (cache.length === 0) return { match: null, cacheSize: 0, bestDistance: null as number | null, secondDistance: null as number | null, dual: false, agreed: true as boolean, discrepancia: null as string | null };

  const m1 = findBestMatchServer(descriptor, cache, MATCH_DISTANCE_THRESHOLD, MATCH_AMBIGUITY_MARGIN);

  // Doble verificación: si el cliente envía un segundo probe independiente,
  // ambos deben coincidir en el mismo empleado (los falsos positivos por
  // tono de piel/luz son inestables entre capturas; los verdaderos no).
  if (descriptor2) {
    const m2 = findBestMatchServer(descriptor2, cache, MATCH_DISTANCE_THRESHOLD, MATCH_AMBIGUITY_MARGIN);
    const agreed = agreeMatches(m1, m2);
    if (!agreed) {
      const d1 = m1 ? `${m1.entry.cedula} ${m1.distance.toFixed(4)}` : "sin-match";
      const d2 = m2 ? `${m2.entry.cedula} ${m2.distance.toFixed(4)}` : "sin-match";
      return {
        match: null, cacheSize: cache.length,
        bestDistance: m1?.distance ?? null, secondDistance: m1?.secondDistance ?? null,
        dual: true, agreed: false,
        discrepancia: `muestras inconsistentes (probe1: ${d1} vs probe2: ${d2})`,
      };
    }
    return {
      match: agreed, cacheSize: cache.length,
      bestDistance: agreed.distance, secondDistance: agreed.secondDistance ?? null,
      dual: true, agreed: true as boolean, discrepancia: null as string | null,
    };
  }

  if (m1) return { match: m1, cacheSize: cache.length, bestDistance: m1.distance, secondDistance: m1.secondDistance, dual: false, agreed: true as boolean, discrepancia: null as string | null };

  // Sin match: calcular mejor distancia para diagnóstico (sin cambiar umbrales).
  // Distingue caché vacía vs sobre-umbral vs ambigüedad vs discrepancia dual.
  let best = Infinity;
  let second = Infinity;
  let bestId: number | null = null;
  for (const entry of cache) {
    if (!entry.descriptor || entry.descriptor.length !== 128) continue;
    const dist = euclideanDistanceServer(descriptor, entry.descriptor);
    if (dist < best) {
      second = best;
      best = dist;
      bestId = entry.empleadoId;
    } else if (dist < second) {
      second = dist;
    }
  }
  return {
    match: null,
    cacheSize: cache.length,
    bestDistance: best === Infinity ? null : best,
    secondDistance: second === Infinity ? null : second,
    bestId,
    dual: false,
    agreed: true as boolean,
    discrepancia: null as string | null,
  } as { match: null; cacheSize: number; bestDistance: number | null; secondDistance: number | null; bestId?: number | null; dual: boolean; agreed: boolean; discrepancia: string | null };
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || authHeader !== `Bearer ${KIOSCO_KEY}`) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    let body: MatchRequest;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const { descriptor, descriptor2, quality, nonce, timestamp, challengeId, series } = body;

    if (!Array.isArray(descriptor) || descriptor.length !== 128 || !descriptor.every((n) => typeof n === "number" && Number.isFinite(n))) {
      return NextResponse.json({ error: "Descriptor inválido (requiere 128 floats finitos)" }, { status: 400 });
    }

    if (descriptor2 !== undefined && (!Array.isArray(descriptor2) || descriptor2.length !== 128 || !descriptor2.every((n) => typeof n === "number" && Number.isFinite(n)))) {
      return NextResponse.json({ error: "Descriptor2 inválido (requiere 128 floats finitos)" }, { status: 400 });
    }

    if (!quality || typeof quality !== "object") {
      return NextResponse.json({ error: "Quality inválido" }, { status: 400 });
    }

    if (typeof nonce !== "string" || nonce.length < 16) {
      return NextResponse.json({ error: "Nonce inválido" }, { status: 400 });
    }

    if (typeof timestamp !== "number" || Math.abs(Date.now() - timestamp) > TIMESTAMP_WINDOW_MS) {
      return NextResponse.json({ error: "Timestamp fuera de ventana (±60s)" }, { status: 400 });
    }

    const qualityError = validateQuality(quality);
    if (qualityError) {
      await audit("MATCH_KIOSCO_BAD_QUALITY", `Match rechazado por calidad: ${qualityError}`, { ip: req.headers.get("x-forwarded-for") ?? undefined });
      return NextResponse.json({ error: `Calidad insuficiente: ${qualityError}` }, { status: 400 });
    }

    if (!challengeId) {
      await audit("MATCH_KIOSCO_BAD_CHALLENGE", `Challenge requerido`, { ip: req.headers.get("x-forwarded-for") ?? undefined });
      return NextResponse.json({ error: "Challenge requerido", tipo: "bad_challenge" }, { status: 400 });
    }

    const challengeResult = await verifyChallenge(challengeId, series);
    if (!challengeResult.ok) {
      await audit("MATCH_KIOSCO_BAD_CHALLENGE", `Challenge fallido: ${challengeResult.error}`, { ip: req.headers.get("x-forwarded-for") ?? undefined });
      return NextResponse.json({ error: `Challenge inválido: ${challengeResult.error}`, tipo: "bad_challenge" }, { status: 400 });
    }

    const nonceOk = await checkAndStoreNonce(nonce);
    if (!nonceOk) {
      await audit("MATCH_KIOSCO_REPLAY", `Nonce repetido: ${nonce}`, { ip: req.headers.get("x-forwarded-for") ?? undefined });
      return NextResponse.json({ error: "Nonce ya utilizado" }, { status: 409 });
    }

    await ensureCacheLoaded();

    const { match, cacheSize, bestDistance, secondDistance, dual, agreed, discrepancia } = await performMatch(descriptor, descriptor2);

    if (!match) {
      const bestStr = bestDistance == null ? "sin-candidatos" : bestDistance.toFixed(4);
      const secondStr = secondDistance == null ? "—" : secondDistance.toFixed(4);
      const ambiguous = bestDistance != null && secondDistance != null
        && bestDistance < MATCH_DISTANCE_THRESHOLD
        && (secondDistance - bestDistance) < MATCH_AMBIGUITY_MARGIN;
      const causa = cacheSize === 0
        ? "cache-vacia (sin empleados activos con descriptor)"
        : (dual && !agreed && discrepancia)
          ? discrepancia
          : ambiguous
            ? `ambiguo (mejor ${bestStr} vs segundo ${secondStr}, margen < ${MATCH_AMBIGUITY_MARGIN})`
            : `distancia ${bestStr} >= umbral ${MATCH_DISTANCE_THRESHOLD} (cache=${cacheSize})`;
      console.error(`[kiosco/match] 404 sin match: ${causa}`);
      await audit("MATCH_KIOSCO_UNKNOWN", `Rostro no reconocido — ${causa}`, { ip: req.headers.get("x-forwarded-for") ?? undefined });
      return NextResponse.json({ error: "Rostro no reconocido", tipo: "unknown", causa, cacheSize, bestDistance }, { status: 404 });
    }

    // Hora de Venezuela con zona horaria explícita (America/Caracas).
    // NO usar cálculo manual con getTimezoneOffset: con el servidor en TZ
    // America/Caracas eso desplazaba la hora -4h y la validación de la
    // ventana entrada/límite nunca marcaba TARDE.
    const nowVE = getVenezuelaDate();
    const hoy = toDateOnly(nowVE);
    console.log(`[kiosco/match] hora servidor VE: ${nowVE.toLocaleString("es-VE", { timeZone: "America/Caracas" })} (min=${nowVE.getHours() * 60 + nowVE.getMinutes()})`);

    try {
      const result = await executeFichaje(match.entry.empleadoId, nowVE, hoy);

      // Trazabilidad del margen: el 2do candidato mide cuán holgado fue el match.
      const segundoStr = secondDistance == null ? "—" : secondDistance.toFixed(4);
      await audit("MATCH_KIOSCO", `Match exitoso: ${match.entry.nombre} ${match.entry.apellido} (${match.entry.cedula}) dist=${match.distance.toFixed(4)} (2do: ${segundoStr})${dual ? " [doble-check]" : ""}`);

      return NextResponse.json({
        ok: true,
        ...result,
        empleadoId: match.entry.empleadoId,
        nombre: match.entry.nombre,
        apellido: match.entry.apellido,
        cedula: match.entry.cedula,
        dobleCheck: dual,
      });
    } catch (e: any) {
      const msg = e.message ?? String(e);
      if (msg.startsWith("COOLDOWN:")) {
        const min = msg.split(":")[1];
        return NextResponse.json({ error: `Cooldown activo: espere ${min} min para volver a marcar`, tipo: "cooldown" }, { status: 429 });
      }
      if (msg.startsWith("DUPLICADO:")) {
        return NextResponse.json({ error: msg.split(":")[1], tipo: "duplicado" }, { status: 400 });
      }
      // Legado: executeFichaje ya no lanza FUERA_MARGEN (tardanza siempre registra TARDE).
      // Se conserva el handler por compatibilidad si alguna versión anterior lo emite.
      if (msg.startsWith("FUERA_MARGEN:")) {        await audit("MATCH_KIOSCO", `Rostro reconocido pero fuera de horario (requiere pase): ${match.entry.nombre} ${match.entry.apellido} (${match.entry.cedula}) dist=${match.distance.toFixed(4)}`);
        return NextResponse.json({
          error: msg.split(":")[1],
          tipo: "fuera_de_margen",
          empleadoId: match.entry.empleadoId,
          nombre: match.entry.nombre,
          apellido: match.entry.apellido,
          cedula: match.entry.cedula,
        }, { status: 403 });
      }
      // Caché obsoleta: el rostro coincide con un descriptor en memoria pero el
      // empleado ya no existe o fue desactivado (p. ej. tras limpiar la BD sin
      // reiniciar el servidor). Se refresca la caché (auto-reparación) y se
      // responde 404 para que el kiosco lo trate como "no reconocido".
      if (msg === "Empleado no encontrado o inactivo") {
        await refreshDescriptorsCache(prisma);
        await audit("MATCH_KIOSCO_UNKNOWN", `Match obsoleto: empleado ${match.entry.empleadoId} (${match.entry.cedula}) ya no existe o está inactivo — caché refrescada`, { ip: req.headers.get("x-forwarded-for") ?? undefined });
        return NextResponse.json({ error: "Rostro no reconocido", tipo: "unknown", causa: "empleado-eliminado-o-inactivo" }, { status: 404 });
      }
      // Sin regla vigente: error de configuración, no del rostro.
      if (msg === "No hay reglas de asistencia configuradas") {
        return NextResponse.json({ error: "Sin horario configurado: contacte a administración", tipo: "sin_regla" }, { status: 503 });
      }
      throw e;
    }
  } catch (error) {
    console.error("[kiosco/match] Error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}