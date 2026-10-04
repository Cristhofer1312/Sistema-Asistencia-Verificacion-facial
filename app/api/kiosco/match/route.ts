// app/api/kiosco/match/route.ts — Match facial en servidor (B1)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/auditoria";
import { getDescriptorsCache, refreshDescriptorsCache } from "@/lib/face-cache";
import { euclideanDistanceServer, findBestMatchServer, MATCH_DISTANCE_THRESHOLD, MATCH_AMBIGUITY_MARGIN } from "@/lib/face-server";
import { getVenezuelaDate, toDateOnly, parseTime } from "@/lib/date-utils";

const KIOSCO_KEY = process.env.API_KIOSCO_KEY ?? "";
const NONCE_TTL_MS = 2 * 60 * 1000; // 2 min
const TIMESTAMP_WINDOW_MS = 60 * 1000; // ±60s
const CHALLENGE_MAX_DURATION_MS = 15 * 1000; // 15s máx para completar el challenge
const YAW_THRESHOLD = 12; // grados mínimos por dirección

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

async function executeFichaje(empleadoId: number, nowVE: Date, hoy: Date): Promise<{ tipo: string; msg: string; extrasH?: number }> {
  const empleado = await prisma.empleado.findUnique({
    where: { id: empleadoId },
    include: { gerencia: true },
  });

  if (!empleado || !empleado.activo) {
    throw new Error("Empleado no encontrado o inactivo");
  }

  const regla = await prisma.reglaAsistencia.findFirst({
    where: { vigenciaDesde: { lte: nowVE } },
    orderBy: { vigenciaDesde: "desc" },
  });

  if (!regla) throw new Error("No hay reglas de asistencia configuradas");

  const feriado = await prisma.feriado.findUnique({ where: { fecha: hoy } });
  const vacacion = await prisma.vacacionEmpleado.findFirst({
    where: { empleadoId, inicio: { lte: hoy }, fin: { gte: hoy } },
  });
  const reposo = await prisma.reposoMedico.findFirst({
    where: { empleadoId, inicio: { lte: hoy }, fin: { gte: hoy } },
  });

  if (reposo) {
    return {
      tipo: "reposo_medico",
      msg: `${empleado.nombre} ${empleado.apellido} está de REPOSO MÉDICO hasta el ${reposo.fin.toISOString().slice(0, 10)}. No debe marcar.`,
    };
  }

  const ultimaAsistencia = await prisma.asistencia.findFirst({
    where: { empleadoId, fecha: hoy },
    orderBy: { creadoEn: "desc" },
  });

  if (ultimaAsistencia && ultimaAsistencia.entrada) {
    const diffMin = Math.floor((nowVE.getTime() - ultimaAsistencia.entrada.getTime()) / 60000);
    if (diffMin < regla.cooldownMin) {
      throw new Error(`COOLDOWN:${regla.cooldownMin - diffMin}`);
    }
  }

  if (ultimaAsistencia) {
    if (ultimaAsistencia.salida) {
      throw new Error("DUPLICADO:Ya ha registrado su entrada y salida por hoy");
    }

    const horaActualMin = nowVE.getHours() * 60 + nowVE.getMinutes();
    const horaRefMin = parseTimeStr(regla.horaReferencia);

    let estadoSalida: "COMPLETADO" | "TEMPRANO" = "COMPLETADO";
    let extrasH = 0;

    if (ultimaAsistencia.estadoEntrada === "FERIADO" || ultimaAsistencia.estadoEntrada === "VACACIONES") {
      estadoSalida = "COMPLETADO";
      const entradaTime = ultimaAsistencia.entrada ? ultimaAsistencia.entrada.getTime() : nowVE.getTime();
      const diffMin = Math.floor((nowVE.getTime() - entradaTime) / 60000);
      extrasH = diffMin > 0 ? diffMin / 60 : 0;
    } else {
      estadoSalida = horaActualMin < horaRefMin ? "TEMPRANO" : "COMPLETADO";
      if (horaActualMin > horaRefMin) extrasH = (horaActualMin - horaRefMin) / 60;
    }

    const updated = await prisma.asistencia.update({
      where: { id: ultimaAsistencia.id },
      data: { salida: nowVE, estadoSalida, extrasH, actualizadoEn: nowVE },
    });

    await audit("FICHAJE_SALIDA", `Salida registrada para ${empleado.cedula} (${estadoSalida})`);

    return {
      tipo: (ultimaAsistencia.estadoEntrada === "FERIADO" || ultimaAsistencia.estadoEntrada === "VACACIONES") ? "completado" : (estadoSalida === "TEMPRANO" ? "temprano" : "completado"),
      msg: `Salida registrada — ${estadoSalida === "COMPLETADO" && (ultimaAsistencia.estadoEntrada === "FERIADO" || ultimaAsistencia.estadoEntrada === "VACACIONES") ? ultimaAsistencia.estadoEntrada : estadoSalida}`,
      extrasH,
    };
  }

  // Es Entrada
  if (feriado) {
    await prisma.asistencia.create({
      data: { empleadoId, fecha: hoy, entrada: nowVE, estadoEntrada: "FERIADO", reglaId: regla.id },
    });
    await audit("FICHAJE_ENTRADA", `Entrada registrada para ${empleado.cedula} (FERIADO)`);
    return { tipo: "feriado", msg: `Entrada registrada — FERIADO (${feriado.motivo})` };
  }

  if (vacacion) {
    await prisma.asistencia.create({
      data: { empleadoId, fecha: hoy, entrada: nowVE, estadoEntrada: "VACACIONES", reglaId: regla.id },
    });
    await audit("FICHAJE_ENTRADA", `Entrada registrada para ${empleado.cedula} (VACACIONES)`);
    return { tipo: "vacaciones", msg: "Entrada registrada — VACACIONES" };
  }

  const horaActualMin = nowVE.getHours() * 60 + nowVE.getMinutes();
  const minLimite = parseTimeStr(regla.horaLimite);

  let estadoEntrada: "A_TIEMPO" | "TARDE" | "FALTA" | "JUSTIFICADO" = "A_TIEMPO";

  if (horaActualMin > minLimite + regla.margenMin) {
    estadoEntrada = "FALTA";
  } else if (horaActualMin > minLimite) {
    estadoEntrada = "TARDE";
  }

  const pase = await prisma.pasePrevio.findFirst({
    where: { empleadoId, fecha: hoy, autorizado: false },
  });

  let estadoOriginal: "TARDE" | "FALTA" | null = null;
  let paseUsado: { motivo: string; autorizadorId: number | null } | null = null;

  if (pase && (estadoEntrada === "FALTA" || estadoEntrada === "TARDE")) {
    estadoOriginal = estadoEntrada;
    paseUsado = { motivo: pase.motivo, autorizadorId: pase.autorizadorId ?? null };
    estadoEntrada = "JUSTIFICADO";
    await prisma.pasePrevio.update({ where: { id: pase.id }, data: { autorizado: true } });
  } else if (!pase && estadoEntrada === "FALTA") {
    throw new Error("FUERA_MARGEN:Fuera de horario — requiere autorización");
  }

  await prisma.asistencia.create({
    data: {
      empleadoId,
      fecha: hoy,
      entrada: nowVE,
      estadoEntrada,
      estadoOriginal,
      ...(paseUsado && {
        justificacionObs: `Pase previo: ${paseUsado.motivo}`,
        autorizadorId: paseUsado.autorizadorId,
      }),
      reglaId: regla.id,
    },
  });

  await audit("FICHAJE_ENTRADA", `Entrada registrada para ${empleado.cedula} (${estadoEntrada})`);

  return { tipo: estadoEntrada.toLowerCase(), msg: `Entrada registrada — ${estadoEntrada}` };
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