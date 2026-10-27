// lib/auto-marcado.ts — Marcado automático de vacaciones, reposos y feriados.
// Genera filas Asistencia (sin entrada/salida) por cada día hábil del rango,
// y las revierte recalculando el estado correcto al anular/eliminar el permiso.
// Reglas: el escaneo real nunca se toca · lo individual manda sobre feriado ·
// solo lunes-viernes · nunca se sobrescribe una fila existente con marcaje.

export type EstadoAuto = "VACACIONES" | "REPOSO_MEDICO" | "FERIADO";

type Db = {
  asistencia: {
    findFirst(a: unknown): Promise<{ id: number; estadoEntrada: string; entrada: unknown } | null>;
    findMany(a: unknown): Promise<{ id: number; empleadoId: number; estadoEntrada: string; entrada: unknown; fecha: Date }[]>;
    create(a: unknown): Promise<unknown>;
    update(a: unknown): Promise<unknown>;
    delete(a: unknown): Promise<unknown>;
  };
  feriado: { findUnique(a: unknown): Promise<unknown> };
  vacacionEmpleado: {
    findFirst(a: unknown): Promise<unknown>;
    findMany(a: unknown): Promise<{ id: number; inicio: Date; fin: Date }[]>;
  };
  reposoMedico: {
    findFirst(a: unknown): Promise<unknown>;
    findMany(a: unknown): Promise<{ id: number; inicio: Date; fin: Date }[]>;
  };
  empleado: { findMany(a: unknown): Promise<{ id: number; creadoEn: Date; activo: boolean }[]> };
  pasePrevio: {
    findFirst(a: unknown): Promise<{ id: number; tipo: string; motivo: string; autorizadorId: number | null } | null>;
    update(a: unknown): Promise<unknown>;
  };
};

/** Días hábiles (lun-vie, UTC) entre inicio y fin, ambos @db.Date. */
export function diasHabiles(inicio: Date, fin: Date): Date[] {
  const dias: Date[] = [];
  const cur = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), inicio.getUTCDate()));
  const end = new Date(Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth(), fin.getUTCDate()));
  while (cur <= end) {
    const dow = cur.getUTCDay();
    if (dow >= 1 && dow <= 5) dias.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dias;
}

/** ¿La fecha cae en una vacación o reposo vigente (no anulado) del empleado? */
async function estadoIndividual(
  db: Db,
  empleadoId: number,
  fecha: Date
): Promise<"VACACIONES" | "REPOSO_MEDICO" | null> {
  const [vac, rep] = await Promise.all([
    db.vacacionEmpleado.findFirst({
      where: { empleadoId, anulada: false, inicio: { lte: fecha }, fin: { gte: fecha } },
    }) as Promise<unknown>,
    db.reposoMedico.findFirst({
      where: { empleadoId, anulada: false, inicio: { lte: fecha }, fin: { gte: fecha } },
    }) as Promise<unknown>,
  ]);
  if (vac) return "VACACIONES";
  if (rep) return "REPOSO_MEDICO";
  return null;
}

async function esFeriado(db: Db, fecha: Date): Promise<boolean> {
  return !!(await db.feriado.findUnique({ where: { fecha } }));
}

/** Día-calendario de Venezuela como Date UTC-midnight (coherente con @db.Date). */
function diaVE(ahora: Date): Date {
  const [y, m, d] = ahora.toLocaleDateString("en-CA", { timeZone: "America/Caracas" }).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Estado de un día hábil ya transcurrido sin marcaje, sin feriado y sin
 * vacación/reposo: con pase o justificación anticipada pendiente → falta
 * justificada (y el pase queda consumido); si no → FALTA.
 */
async function resolverAusencia(
  db: Db,
  empleadoId: number,
  fecha: Date
): Promise<{ estadoEntrada: "FALTA" | "JUSTIFICADO"; estadoOriginal: "FALTA" | null; justificacionObs: string | null; autorizadorId: number | null }> {
  const pase = await db.pasePrevio.findFirst({
    where: { empleadoId, fecha, autorizado: false },
    orderBy: { creadoEn: "asc" },
  });
  if (!pase) return { estadoEntrada: "FALTA", estadoOriginal: null, justificacionObs: null, autorizadorId: null };
  await db.pasePrevio.update({ where: { id: pase.id }, data: { autorizado: true } });
  const etiqueta = pase.tipo === "JUSTIFICACION_ANTICIPADA" ? "Justificación anticipada" : "Pase previo";
  return {
    estadoEntrada: "JUSTIFICADO",
    estadoOriginal: "FALTA",
    justificacionObs: `${etiqueta}: ${pase.motivo}`,
    autorizadorId: pase.autorizadorId ?? null,
  };
}

/**
 * Marca automática de un rango para un empleado.
 * - Sin fila → crea con `estado` (solo días hábiles).
 * - Fila FALTA sin marcaje → convierte a `estado`.
 * - Fila FERIADO sin marcaje → convierte solo si `estado` es individual (VACACIONES/REPOSO manda).
 * - Fila con marcaje o de otro estado → se respeta (no se toca).
 */
/**
 * ¿autoMarkRange cambiaría algo? Misma regla, pero sobre filas ya cargadas:
 * permite que una lectura (GET /api/asistencias) reconcilie solo los permisos
 * que lo necesitan en vez de consultar día por día cada vez.
 */
export function requiereMarcado(
  estado: EstadoAuto,
  inicio: Date,
  fin: Date,
  filasPorFecha: Map<string, { entrada: unknown; estadoEntrada: string }>
): boolean {
  const individual = estado !== "FERIADO";
  for (const fecha of diasHabiles(inicio, fin)) {
    const row = filasPorFecha.get(fecha.toISOString().slice(0, 10));
    if (!row) return true;
    if (row.entrada != null) continue;
    if (row.estadoEntrada === "FALTA" || (individual && row.estadoEntrada === "FERIADO")) return true;
  }
  return false;
}

export async function autoMarkRange(
  db: Db,
  opts: { empleadoId: number; estado: EstadoAuto; inicio: Date; fin: Date }
): Promise<{ creadas: number; convertidas: number; omitidas: number }> {
  let creadas = 0;
  let convertidas = 0;
  let omitidas = 0;
  const individual = opts.estado !== "FERIADO";

  for (const fecha of diasHabiles(opts.inicio, opts.fin)) {
    const row = await db.asistencia.findFirst({
      where: { empleadoId: opts.empleadoId, fecha },
    });

    if (!row) {
      await db.asistencia.create({
        data: { empleadoId: opts.empleadoId, fecha, entrada: null, salida: null, estadoEntrada: opts.estado, reglaId: null },
      });
      creadas++;
      continue;
    }

    if (row.entrada !== null) {
      omitidas++; // escaneo real: intocable
      continue;
    }

    if (row.estadoEntrada === "FALTA" || (individual && row.estadoEntrada === "FERIADO")) {
      await db.asistencia.update({ where: { id: row.id }, data: { estadoEntrada: opts.estado, estadoOriginal: null } });
      convertidas++;
      continue;
    }

    omitidas++;
  }

  return { creadas, convertidas, omitidas };
}

/**
 * Marca automática de un feriado (un día) para todos los activos sin fila.
 * Respeta marcas individuales existentes (VACACIONES/REPOSO mandan).
 */
export async function autoMarkFeriado(db: Db, fecha: Date): Promise<{ creadas: number; omitidas: number }> {
  const d = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
  if (d.getUTCDay() < 1 || d.getUTCDay() > 5) return { creadas: 0, omitidas: 0 };

  const empleados = await db.empleado.findMany({ where: { activo: true }, select: { id: true } });
  let creadas = 0;
  let omitidas = 0;

  for (const e of empleados) {
    const row = await db.asistencia.findFirst({ where: { empleadoId: e.id, fecha: d } });
    if (!row) {
      await db.asistencia.create({
        data: { empleadoId: e.id, fecha: d, entrada: null, salida: null, estadoEntrada: "FERIADO", reglaId: null },
      });
      creadas++;
    } else {
      omitidas++;
    }
  }

  return { creadas, omitidas };
}

/**
 * Revierte marcas automáticas de un rango/permiso eliminado o anulado.
 * Por cada fila (estado, sin marcaje) en el rango recalcula:
 * feriado → FERIADO · otro permiso individual vigente → ese estado ·
 * día ya transcurrido → FALTA (o falta justificada si había pase), igual que
 * el cierre diario · hoy o futuro → borra la fila (el día aún no ocurrió).
 * Las filas con marcaje no se tocan jamás.
 */
export async function revertRange(
  db: Db,
  opts: { empleadoId?: number; estado: EstadoAuto; inicio: Date; fin: Date; ahora?: Date }
): Promise<{ revertidas: number; faltas: number; borradas: number }> {
  let revertidas = 0;
  let faltas = 0;
  let borradas = 0;
  const hoy = diaVE(opts.ahora ?? new Date());

  const rows = await db.asistencia.findMany({
    where: {
      ...(opts.empleadoId ? { empleadoId: opts.empleadoId } : {}),
      fecha: { gte: opts.inicio, lte: opts.fin },
      estadoEntrada: opts.estado,
      entrada: null,
    },
  });

  for (const row of rows) {
    const empId = row.empleadoId ?? opts.empleadoId;
    if (!empId) continue;

    if (await esFeriado(db, row.fecha)) {
      await db.asistencia.update({ where: { id: row.id }, data: { estadoEntrada: "FERIADO", estadoOriginal: null } });
      revertidas++;
      continue;
    }

    const ind = await estadoIndividual(db, empId, row.fecha);
    if (ind && ind !== opts.estado) {
      await db.asistencia.update({ where: { id: row.id }, data: { estadoEntrada: ind, estadoOriginal: null } });
      revertidas++;
      continue;
    }

    if (row.fecha < hoy) {
      // El permiso ya no cubre ese día y el empleado no marcó: faltó.
      await db.asistencia.update({ where: { id: row.id }, data: await resolverAusencia(db, empId, row.fecha) });
      faltas++;
      continue;
    }

    await db.asistencia.delete({ where: { id: row.id } });
    borradas++;
  }

  return { revertidas, faltas, borradas };
}

/**
 * Cierre diario: marca a los activos sin fila de un día ya cerrado.
 * - Solo días pasados (nunca hoy ni futuro) y hábiles (lun-vie).
 * - Cota inferior por empleado: nada previo a su `creadoEn` (anti-infinito).
 * - feriado → FERIADO · vacación/reposo vigente no anulado → ese estado ·
 *   pase/justificación anticipada pendiente → JUSTIFICADO (original FALTA) · si no → FALTA.
 * - Filas existentes (con o sin fichaje) intactas. Empleados inactivos omitidos.
 */
export async function marcarFaltantes(
  db: Db & {
    empleado: {
      findMany(a: unknown): Promise<{ id: number; creadoEn: Date; activo: boolean }[]>;
    };
  },
  opts: { fecha?: Date | string; ahora?: Date } = {}
): Promise<{ fecha: string; faltas: number; faltasJustificadas: number; feriados: number; vacaciones: number; reposos: number; omitidos: number }> {
  // Todo en días-calendario UTC (coherente con @db.Date): strings "YYYY-MM-DD"
  // o Dates UTC-midnight (como las que devuelve Prisma).
  const normDay = (input: Date | string): Date => {
    if (typeof input === "string") {
      const [y, m, d] = input.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d));
    }
    return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  };

  // "Hoy" es el día-calendario de Venezuela, no el de UTC: de 20:00 a 24:00 VE
  // la fecha UTC ya es mañana y "ayer UTC" sería el día en curso.
  const hoyVE = diaVE(opts.ahora ?? new Date());
  const ayerVE = new Date(hoyVE);
  ayerVE.setUTCDate(ayerVE.getUTCDate() - 1);

  const fecha = opts.fecha ? normDay(opts.fecha) : ayerVE;
  if (fecha > ayerVE) {
    throw new Error("Solo se pueden cerrar días pasados (ayer o antes), nunca hoy ni futuro");
  }

  const dow = fecha.getUTCDay();
  const res = { fecha: fecha.toISOString().slice(0, 10), faltas: 0, faltasJustificadas: 0, feriados: 0, vacaciones: 0, reposos: 0, omitidos: 0 };
  if (dow < 1 || dow > 5) return res; // fin de semana: nada que cerrar

  const feriadoEseDia = await esFeriado(db, fecha);
  const empleados = await db.empleado.findMany({ where: { activo: true }, select: { id: true, creadoEn: true, activo: true } });

  for (const e of empleados) {
    // Cota anti-infinito: nada previo a existir el empleado en el sistema
    const creado = new Date(Date.UTC(e.creadoEn.getUTCFullYear(), e.creadoEn.getUTCMonth(), e.creadoEn.getUTCDate()));
    if (fecha < creado) {
      res.omitidos++;
      continue;
    }

    const row = await db.asistencia.findFirst({ where: { empleadoId: e.id, fecha } });
    if (row) {
      res.omitidos++;
      continue;
    }

    // Lo individual manda sobre el feriado: se evalúa primero
    const ind = await estadoIndividual(db, e.id, fecha);
    if (ind === "VACACIONES") {
      await db.asistencia.create({
        data: { empleadoId: e.id, fecha, entrada: null, salida: null, estadoEntrada: "VACACIONES", reglaId: null },
      });
      res.vacaciones++;
      continue;
    }
    if (ind === "REPOSO_MEDICO") {
      await db.asistencia.create({
        data: { empleadoId: e.id, fecha, entrada: null, salida: null, estadoEntrada: "REPOSO_MEDICO", reglaId: null },
      });
      res.reposos++;
      continue;
    }

    if (feriadoEseDia) {
      await db.asistencia.create({
        data: { empleadoId: e.id, fecha, entrada: null, salida: null, estadoEntrada: "FERIADO", reglaId: null },
      });
      res.feriados++;
      continue;
    }

    // Pase o justificación anticipada pendiente → falta justificada; si no → FALTA
    const ausencia = await resolverAusencia(db, e.id, fecha);
    await db.asistencia.create({
      data: { empleadoId: e.id, fecha, entrada: null, salida: null, reglaId: null, ...ausencia },
    });
    if (ausencia.estadoEntrada === "JUSTIFICADO") res.faltasJustificadas++;
    else res.faltas++;
  }

  return res;
}

/**
 * ¿Existe solape con OTRO permiso vigente (vacación o reposo, no anulado)?
 * Se usa para rechazar reposos que solapen vacaciones y viceversa.
 */
export async function solapeConOtroPermiso(
  db: Db,
  opts: { empleadoId: number; inicio: Date; fin: Date; excluir?: { tipo: "vacacion" | "reposo"; id: number } }
): Promise<{ tipo: string; inicio: Date; fin: Date } | null> {
  const [vacs, reps] = await Promise.all([
    db.vacacionEmpleado.findMany({ where: { empleadoId: opts.empleadoId, anulada: false } }),
    db.reposoMedico.findMany({ where: { empleadoId: opts.empleadoId, anulada: false } }),
  ]);

  const solapa = (aIni: Date, aFin: Date, bIni: Date, bFin: Date) => aIni <= bFin && aFin >= bIni;

  for (const v of vacs) {
    if (opts.excluir?.tipo === "vacacion" && opts.excluir.id === v.id) continue;
    if (solapa(opts.inicio, opts.fin, v.inicio, v.fin)) return { tipo: "vacaciones", inicio: v.inicio, fin: v.fin };
  }
  for (const r of reps) {
    if (opts.excluir?.tipo === "reposo" && opts.excluir.id === r.id) continue;
    if (solapa(opts.inicio, opts.fin, r.inicio, r.fin)) return { tipo: "reposo médico", inicio: r.inicio, fin: r.fin };
  }
  return null;
}
