// app/api/kiosco/match/route.ts — Match facial en servidor (B1)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/auditoria";
import { getDescriptorsCache, refreshDescriptorsCache } from "@/lib/face-cache";
import { euclideanDistanceServer, findBestMatchServer, MATCH_DISTANCE_THRESHOLD, MATCH_AMBIGUITY_MARGIN } from "@/lib/face-server";
import { getVenezuelaDate, toDateOnly, parseTime } from "@/lib/date-utils";
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
  quality: QualityData;
  nonce: string;
  timestamp: number;
  challengeId?: string;
  series?: SeriesPoint[];
}

function parseTimeStr(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function getNowVE(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc - 4 * 3600000);
}

function toDateOnlyUTC(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

async function ensureCacheLoaded(): Promise<void> {
  if (getDescriptorsCache().length === 0) {
    await refreshDescriptorsCache(prisma);
  }
}

function validateQuality(quality: QualityData): string | null {
  // earOk ya no bloquea: el parpadeo fue reemplazado por el challenge de poses
  if (!quality.poseOk) return "movimiento de cabeza no detectado";
  if (quality.brightness < 40 || quality.brightness > 220) return "iluminación inadecuada";
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
    else if (expected === "FRENTE") ok = Math.abs(point.yaw) <= 14 && Math.abs(point.pitch) <= 14; // frente con margen amplio (igual que el cliente)

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

async function performMatch(descriptor: number[]) {
  const cache = getDescriptorsCache();
  if (cache.length === 0) return null;

  const match = findBestMatchServer(descriptor, cache, MATCH_DISTANCE_THRESHOLD, MATCH_AMBIGUITY_MARGIN);
  return match;
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

    const { descriptor, quality, nonce, timestamp, challengeId, series } = body;

    if (!Array.isArray(descriptor) || descriptor.length !== 128 || !descriptor.every((n) => typeof n === "number" && Number.isFinite(n))) {
      return NextResponse.json({ error: "Descriptor inválido (requiere 128 floats finitos)" }, { status: 400 });
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

    // Challenge anti-video: opcional durante la ventana de compatibilidad con kioscos viejos
    if (challengeId) {
      const challengeResult = await verifyChallenge(challengeId, series);
      if (!challengeResult.ok) {
        await audit("MATCH_KIOSCO_BAD_CHALLENGE", `Challenge fallido: ${challengeResult.error}`, { ip: req.headers.get("x-forwarded-for") ?? undefined });
        return NextResponse.json({ error: `Challenge inválido: ${challengeResult.error}`, tipo: "bad_challenge" }, { status: 400 });
      }
    }

    const nonceOk = await checkAndStoreNonce(nonce);
    if (!nonceOk) {
      await audit("MATCH_KIOSCO_REPLAY", `Nonce repetido: ${nonce}`, { ip: req.headers.get("x-forwarded-for") ?? undefined });
      return NextResponse.json({ error: "Nonce ya utilizado" }, { status: 409 });
    }

    await ensureCacheLoaded();

    const match = await performMatch(descriptor);

    if (!match) {
      await audit("MATCH_KIOSCO_UNKNOWN", "Rostro no reconocido", { ip: req.headers.get("x-forwarded-for") ?? undefined });
      return NextResponse.json({ error: "Rostro no reconocido" }, { status: 404 });
    }

    const nowVE = getNowVE();
    const hoy = toDateOnlyUTC(nowVE);

    try {
      const result = await executeFichaje(match.entry.empleadoId, nowVE, hoy);

      await audit("MATCH_KIOSCO", `Match exitoso: ${match.entry.nombre} ${match.entry.apellido} (${match.entry.cedula}) dist=${match.distance.toFixed(4)}`);

      return NextResponse.json({ 
        ok: true, 
        ...result,
        empleadoId: match.entry.empleadoId,
        nombre: match.entry.nombre,
        apellido: match.entry.apellido,
        cedula: match.entry.cedula,
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
      if (msg.startsWith("FUERA_MARGEN:")) {
        return NextResponse.json({ error: msg.split(":")[1], tipo: "fuera_de_margen" }, { status: 403 });
      }
      throw e;
    }
  } catch (error) {
    console.error("[kiosco/match] Error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}