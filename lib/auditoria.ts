// lib/auditoria.ts — Helper para escribir en logs_auditoria
import { prisma } from "./prisma";
import type { AccionAuditoria } from "@prisma/client";

export async function audit(
  accion: AccionAuditoria,
  detalle: string,
  opts?: { usuarioId?: number; ip?: string }
) {
  try {
    await prisma.logAuditoria.create({
      data: {
        accion,
        detalle,
        usuarioId: opts?.usuarioId ?? null,
        ip:        opts?.ip ?? null,
      },
    });
  } catch (err) {
    // La auditoría nunca debe romper la operación principal
    console.error("[auditoria] error escribiendo log:", err);
  }
}
