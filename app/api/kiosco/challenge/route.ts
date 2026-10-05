// app/api/kiosco/challenge/route.ts — Genera challenge anti-video para kiosco
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const KIOSCO_KEY = process.env.API_KIOSCO_KEY ?? "";
const CHALLENGE_TTL_MS = 90 * 1000; // 90s

const DIRECTIONS = ["IZQUIERDA", "DERECHA"] as const;
const FRONT = "FRENTE";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || authHeader !== `Bearer ${KIOSCO_KEY}`) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Generar secuencia: solo FRENTE (se eliminan IZQUIERDA/DERECHA para mayor rapidez y fluidez, manteniendo la exigencia de movimiento)
    const steps = [FRONT];

    const expiraEn = new Date(Date.now() + CHALLENGE_TTL_MS);

    const challenge = await prisma.kioscoChallenge.create({
      data: {
        steps: JSON.stringify(steps),
        expiraEn,
      },
    });

    return NextResponse.json({
      challengeId: challenge.id,
      steps,
      expiresAt: challenge.expiraEn.toISOString(),
    });
  } catch (error) {
    console.error("[kiosco/challenge] Error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}