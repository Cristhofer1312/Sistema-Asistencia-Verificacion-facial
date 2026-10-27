// lib/auto-marcado.test.ts — Unit tests de marcado automático y reversión
import { describe, it, expect, beforeEach } from 'vitest';
import { diasHabiles, autoMarkRange, autoMarkFeriado, revertRange, solapeConOtroPermiso, marcarFaltantes, requiereMarcado } from './auto-marcado';

const D = (s: string) => new Date(s + "T00:00:00Z");

describe("requiereMarcado", () => {
  // 2026-06-15 lunes → 2026-06-19 viernes (el fin de semana no cuenta)
  const filas = (pares: [string, { entrada: unknown; estadoEntrada: string }][]) => new Map(pares);
  const completa = (estado: string) =>
    filas(["15", "16", "17", "18", "19"].map(d => [`2026-06-${d}`, { entrada: null, estadoEntrada: estado }]));

  it("no hace falta si todos los días hábiles ya están marcados", () => {
    expect(requiereMarcado("VACACIONES", D("2026-06-15"), D("2026-06-21"), completa("VACACIONES"))).toBe(false);
  });

  it("hace falta si falta un día o hay una FALTA que convertir", () => {
    const m = completa("VACACIONES");
    m.delete("2026-06-17");
    expect(requiereMarcado("VACACIONES", D("2026-06-15"), D("2026-06-19"), m)).toBe(true);
    const f = completa("VACACIONES");
    f.set("2026-06-18", { entrada: null, estadoEntrada: "FALTA" });
    expect(requiereMarcado("REPOSO_MEDICO", D("2026-06-15"), D("2026-06-19"), f)).toBe(true);
  });

  it("un día con marcaje real no se toca; un FERIADO solo lo pisa un permiso individual", () => {
    const m = completa("FERIADO");
    expect(requiereMarcado("VACACIONES", D("2026-06-15"), D("2026-06-19"), m)).toBe(true);
    expect(requiereMarcado("FERIADO", D("2026-06-15"), D("2026-06-19"), m)).toBe(false);
    const r = completa("VACACIONES");
    r.set("2026-06-16", { entrada: new Date(), estadoEntrada: "FALTA" });
    expect(requiereMarcado("VACACIONES", D("2026-06-15"), D("2026-06-19"), r)).toBe(false);
  });
});

type Row = { id: number; empleadoId: number; fecha: Date; estadoEntrada: string; entrada: Date | null };

type Pase = { id: number; empleadoId: number; fecha: Date; tipo: string; motivo: string; autorizadorId: number | null; autorizado: boolean };

function memoriaDb(seed: { asistencias?: Row[]; feriados?: string[]; vacaciones?: { id: number; empleadoId: number; inicio: Date; fin: Date }[]; reposos?: { id: number; empleadoId: number; inicio: Date; fin: Date }[]; pases?: Pase[] } = {}) {
  let seq = 100;
  const pases = seed.pases ?? [];
  const asistencias: Row[] = (seed.asistencias ?? []).map((r, i) => ({ ...r, id: i + 1 }));
  const feriados = new Set(seed.feriados ?? []);
  const vacaciones = seed.vacaciones ?? [];
  const reposos = seed.reposos ?? [];

  const dayEq = (a: Date, b: Date) => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
  const inRange = (f: Date, ini: Date, fin: Date) => f >= ini && f <= fin;

  return {
    _rows: asistencias,
    asistencia: {
      findFirst: async (a: { where: { empleadoId: number; fecha: Date } }) => {
        const w = a.where as { empleadoId: number; fecha: Date };
        return asistencias.find(r => r.empleadoId === w.empleadoId && dayEq(r.fecha, w.fecha)) ?? null;
      },
      findMany: async (a: { where: { empleadoId?: number; fecha?: { gte: Date; lte: Date }; estadoEntrada?: string; entrada?: null } }) => {
        const w = a.where as { empleadoId?: number; fecha?: { gte: Date; lte: Date }; estadoEntrada?: string; entrada?: null };
        return asistencias.filter(r =>
          (w.empleadoId === undefined || r.empleadoId === w.empleadoId) &&
          (!w.fecha || inRange(r.fecha, w.fecha.gte, w.fecha.lte)) &&
          (!w.estadoEntrada || r.estadoEntrada === w.estadoEntrada) &&
          (w.entrada !== null || r.entrada === null)
        );
      },
      create: async (a: { data: Omit<Row, "id"> }) => {
        const row = { ...a.data, id: seq++ };
        asistencias.push(row);
        return row;
      },
      update: async (a: { where: { id: number }; data: Partial<Row> }) => {
        const row = asistencias.find(r => r.id === a.where.id)!;
        Object.assign(row, a.data);
        return row;
      },
      delete: async (a: { where: { id: number } }) => {
        const i = asistencias.findIndex(r => r.id === a.where.id);
        asistencias.splice(i, 1);
        return {};
      },
    },
    feriado: {
      findUnique: async (a: { where: { fecha: Date } }) =>
        feriados.has((a.where as { fecha: Date }).fecha.toISOString().slice(0, 10)) ? {} : null,
    },
    vacacionEmpleado: {
      findFirst: async (a: { where: { empleadoId: number; anulada?: boolean; inicio: { lte: Date }; fin: { gte: Date } } }) => {
        const w = a.where as { empleadoId: number; inicio: { lte: Date }; fin: { gte: Date } };
        // memoriaDb no modela anulada: las listas seed se consideran vigentes
        return vacaciones.find(v => v.empleadoId === w.empleadoId && v.inicio <= w.fin.gte && v.fin >= w.inicio.lte) ?? null;
      },
      findMany: async (a: { where: { empleadoId: number } }) =>
        vacaciones.filter(v => v.empleadoId === (a.where as { empleadoId: number }).empleadoId),
    },
    reposoMedico: {
      findFirst: async (a: { where: { empleadoId: number; anulada?: boolean; inicio: { lte: Date }; fin: { gte: Date } } }) => {
        const w = a.where as { empleadoId: number; inicio: { lte: Date }; fin: { gte: Date } };
        return reposos.find(r => r.empleadoId === w.empleadoId && r.inicio <= w.fin.gte && r.fin >= w.inicio.lte) ?? null;
      },
      findMany: async (a: { where: { empleadoId: number } }) =>
        reposos.filter(r => r.empleadoId === (a.where as { empleadoId: number }).empleadoId),
    },
    empleado: {
      // Por defecto: 2 activos creados hace tiempo (cota anti-infinito superada)
      findMany: async () => [
        { id: 1, creadoEn: D("2020-01-01"), activo: true },
        { id: 2, creadoEn: D("2020-01-01"), activo: true },
      ],
    },
    _pases: pases,
    pasePrevio: {
      findFirst: async (a: { where: { empleadoId: number; fecha: Date; autorizado: boolean } }) => {
        const w = a.where;
        return pases.find(p => p.empleadoId === w.empleadoId && dayEq(p.fecha, w.fecha) && p.autorizado === w.autorizado) ?? null;
      },
      update: async (a: { where: { id: number }; data: Partial<Pase> }) => {
        const p = pases.find(x => x.id === a.where.id)!;
        Object.assign(p, a.data);
        return p;
      },
    },
  };
}

describe('auto-marcado', () => {
  describe('diasHabiles', () => {
    it('omite sábado y domingo', () => {
      // Lun 2026-06-15 → Dom 2026-06-21
      const dias = diasHabiles(D("2026-06-15"), D("2026-06-21"));
      expect(dias.map(d => d.toISOString().slice(0, 10))).toEqual([
        "2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19",
      ]);
    });

    it('un solo sábado retorna vacío', () => {
      expect(diasHabiles(D("2026-06-20"), D("2026-06-20"))).toEqual([]);
    });
  });

  describe('autoMarkRange', () => {
    it('crea filas VACACIONES en días hábiles sin fila', async () => {
      const db = memoriaDb();
      const r = await autoMarkRange(db as never, { empleadoId: 1, estado: "VACACIONES", inicio: D("2026-06-15"), fin: D("2026-06-19") });
      expect(r.creadas).toBe(5);
      expect(r.convertidas).toBe(0);
      expect(r.omitidas).toBe(0);
      expect(db._rows.every(x => x.estadoEntrada === "VACACIONES" && x.entrada === null)).toBe(true);
    });

    it('convierte FALTA sin marcaje y respeta filas con marcaje', async () => {
      const db = memoriaDb({
        asistencias: [
          { id: 0, empleadoId: 1, fecha: D("2026-06-15"), estadoEntrada: "FALTA", entrada: null },
          { id: 0, empleadoId: 1, fecha: D("2026-06-16"), estadoEntrada: "A_TIEMPO", entrada: D("2026-06-16") },
        ],
      });
      const r = await autoMarkRange(db as never, { empleadoId: 1, estado: "REPOSO_MEDICO", inicio: D("2026-06-15"), fin: D("2026-06-17") });
      expect(r.convertidas).toBe(1);
      expect(r.creadas).toBe(1); // 17-jun
      expect(r.omitidas).toBe(1); // 16-jun con marcaje
      expect(db._rows.find(x => x.fecha.toISOString().startsWith("2026-06-15"))!.estadoEntrada).toBe("REPOSO_MEDICO");
    });

    it('lo individual convierte FERIADO sin marcaje; FERIADO respeta individual', async () => {
      const db = memoriaDb({
        asistencias: [
          { id: 0, empleadoId: 1, fecha: D("2026-06-15"), estadoEntrada: "FERIADO", entrada: null },
          { id: 0, empleadoId: 1, fecha: D("2026-06-16"), estadoEntrada: "VACACIONES", entrada: null },
        ],
      });
      // Vacación manda: convierte el FERIADO
      const r1 = await autoMarkRange(db as never, { empleadoId: 1, estado: "VACACIONES", inicio: D("2026-06-15"), fin: D("2026-06-15") });
      expect(r1.convertidas).toBe(1);
      // Feriado respeta: no toca el VACACIONES
      const r2 = await autoMarkFeriado(db as never, D("2026-06-16"));
      expect(r2.creadas).toBe(1); // solo empleado 2
      expect(r2.omitidas).toBe(1); // empleado 1 tiene VACACIONES
    });

    it('autoMarkFeriado omite fin de semana', async () => {
      const db = memoriaDb();
      const r = await autoMarkFeriado(db as never, D("2026-06-20")); // sábado
      expect(r.creadas).toBe(0);
    });
  });

  describe('revertRange', () => {
    it('revierte a FERIADO si el día es feriado, si no borra la fila', async () => {
      const db = memoriaDb({
        feriados: ["2026-06-15"],
        asistencias: [
          { id: 0, empleadoId: 1, fecha: D("2026-06-15"), estadoEntrada: "VACACIONES", entrada: null },
          { id: 0, empleadoId: 1, fecha: D("2026-06-16"), estadoEntrada: "VACACIONES", entrada: null },
        ],
      });
      // "hoy" = 16-jun: el 15 es feriado; el 16 aún no termina → se borra
      const r = await revertRange(db as never, { empleadoId: 1, estado: "VACACIONES", inicio: D("2026-06-15"), fin: D("2026-06-16"), ahora: new Date("2026-06-16T15:00:00Z") });
      expect(r.revertidas).toBe(1);
      expect(r.borradas).toBe(1);
      expect(db._rows.find(x => x.fecha.toISOString().startsWith("2026-06-15"))!.estadoEntrada).toBe("FERIADO");
      expect(db._rows.some(x => x.fecha.toISOString().startsWith("2026-06-16"))).toBe(false);
    });

    it('anular sobre días ya transcurridos → FALTA (o falta justificada con pase); futuro → se borra', async () => {
      const db = memoriaDb({
        asistencias: [
          { id: 0, empleadoId: 1, fecha: D("2026-06-15"), estadoEntrada: "REPOSO_MEDICO", entrada: null },
          { id: 0, empleadoId: 1, fecha: D("2026-06-16"), estadoEntrada: "REPOSO_MEDICO", entrada: null },
          { id: 0, empleadoId: 1, fecha: D("2026-06-18"), estadoEntrada: "REPOSO_MEDICO", entrada: null },
        ],
        pases: [{ id: 1, empleadoId: 1, fecha: D("2026-06-16"), tipo: "PASE_NORMAL", motivo: "Trámite", autorizadorId: 3, autorizado: false }],
      });
      // "hoy" = miércoles 17-jun (VE)
      const r = await revertRange(db as never, { empleadoId: 1, estado: "REPOSO_MEDICO", inicio: D("2026-06-15"), fin: D("2026-06-18"), ahora: new Date("2026-06-17T15:00:00Z") });
      expect(r).toEqual({ revertidas: 0, faltas: 2, borradas: 1 });
      const dia = (s: string) => db._rows.find(x => x.fecha.toISOString().startsWith(s)) as (Row & { estadoOriginal?: string | null }) | undefined;
      expect(dia("2026-06-15")!.estadoEntrada).toBe("FALTA");
      expect(dia("2026-06-16")).toMatchObject({ estadoEntrada: "JUSTIFICADO", estadoOriginal: "FALTA" });
      expect(dia("2026-06-18")).toBeUndefined();
      expect(db._pases[0].autorizado).toBe(true);
    });

    it('reactivar (autoMarkRange) vuelve a convertir esas FALTAS en REPOSO_MEDICO', async () => {
      const db = memoriaDb({
        asistencias: [
          { id: 0, empleadoId: 1, fecha: D("2026-06-15"), estadoEntrada: "REPOSO_MEDICO", entrada: null },
        ],
      });
      await revertRange(db as never, { empleadoId: 1, estado: "REPOSO_MEDICO", inicio: D("2026-06-15"), fin: D("2026-06-15"), ahora: new Date("2026-06-17T15:00:00Z") });
      expect(db._rows[0].estadoEntrada).toBe("FALTA");
      const m = await autoMarkRange(db as never, { empleadoId: 1, estado: "REPOSO_MEDICO", inicio: D("2026-06-15"), fin: D("2026-06-15") });
      expect(m.convertidas).toBe(1);
      expect(db._rows[0].estadoEntrada).toBe("REPOSO_MEDICO");
    });

    it('no toca filas con marcaje', async () => {
      const db = memoriaDb({
        asistencias: [
          { id: 0, empleadoId: 1, fecha: D("2026-06-15"), estadoEntrada: "VACACIONES", entrada: D("2026-06-15") },
        ],
      });
      const r = await revertRange(db as never, { empleadoId: 1, estado: "VACACIONES", inicio: D("2026-06-15"), fin: D("2026-06-15") });
      expect(r.revertidas).toBe(0);
      expect(r.borradas).toBe(0);
      expect(db._rows).toHaveLength(1);
    });

    it('revierte a otro permiso individual vigente', async () => {
      const db = memoriaDb({
        reposos: [{ id: 5, empleadoId: 1, inicio: D("2026-06-15"), fin: D("2026-06-20") }],
        asistencias: [
          { id: 0, empleadoId: 1, fecha: D("2026-06-16"), estadoEntrada: "VACACIONES", entrada: null },
        ],
      });
      const r = await revertRange(db as never, { empleadoId: 1, estado: "VACACIONES", inicio: D("2026-06-16"), fin: D("2026-06-16") });
      expect(r.revertidas).toBe(1);
      expect(db._rows[0].estadoEntrada).toBe("REPOSO_MEDICO");
    });
  });

  describe('marcarFaltantes (cierre diario)', () => {
    // Ayer relativo: se calcula dinámicamente para no depender de "hoy"
    const ayerHabil = (() => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      do { d.setDate(d.getDate() - 1); } while (d.getDay() < 1 || d.getDay() > 5);
      return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    })();
    const isoAyer = ayerHabil.toISOString().slice(0, 10);

    it('marca FALTA a activos sin fila', async () => {
      const db = memoriaDb();
      const r = await marcarFaltantes(db as never, { fecha: ayerHabil });
      expect(r.fecha).toBe(isoAyer);
      expect(r.faltas).toBe(2);
      expect(db._rows.every(x => x.estadoEntrada === "FALTA" && x.entrada === null)).toBe(true);
    });

    it('feriado → FERIADO; vacación/reposo → su estado; con fila → intacto', async () => {
      const db = memoriaDb({
        feriados: [isoAyer],
        vacaciones: [{ id: 1, empleadoId: 1, inicio: ayerHabil, fin: ayerHabil }],
        asistencias: [
          { id: 0, empleadoId: 2, fecha: ayerHabil, estadoEntrada: "A_TIEMPO", entrada: ayerHabil },
        ],
      });
      // empleado 1 tiene vacación (aunque sea feriado, lo individual manda en revert... aquí marca directo)
      const r = await marcarFaltantes(db as never, { fecha: ayerHabil });
      // emp1: feriado=true pero tiene vacación → VACACIONES; emp2: tiene fila → omitido
      expect(r.vacaciones).toBe(1);
      expect(r.feriados).toBe(0);
      expect(r.omitidos).toBe(1);
    });

    it('día feriado sin permisos → FERIADO a todos sin fila', async () => {
      const db = memoriaDb({ feriados: [isoAyer] });
      const r = await marcarFaltantes(db as never, { fecha: ayerHabil });
      expect(r.feriados).toBe(2);
      expect(r.faltas).toBe(0);
    });

    it('rechaza hoy y futuro', async () => {
      const db = memoriaDb();
      const hoyStr = new Date().toISOString().slice(0, 10);
      await expect(marcarFaltantes(db as never, { fecha: hoyStr })).rejects.toThrow(/pasados/);
      const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      await expect(marcarFaltantes(db as never, { fecha: manana })).rejects.toThrow(/pasados/);
    });

    it('pase o justificación anticipada pendiente → falta justificada y pase consumido', async () => {
      const db = memoriaDb({
        pases: [{ id: 1, empleadoId: 1, fecha: ayerHabil, tipo: "JUSTIFICACION_ANTICIPADA", motivo: "Cita médica", autorizadorId: 7, autorizado: false }],
      });
      const r = await marcarFaltantes(db as never, { fecha: ayerHabil });
      expect(r.faltasJustificadas).toBe(1);
      expect(r.faltas).toBe(1); // el empleado 2 no tenía pase
      const fila = db._rows.find(x => x.empleadoId === 1) as Row & { estadoOriginal?: string; justificacionObs?: string };
      expect(fila).toMatchObject({ estadoEntrada: "JUSTIFICADO", estadoOriginal: "FALTA", justificacionObs: "Justificación anticipada: Cita médica" });
      expect(db._pases[0].autorizado).toBe(true);
    });

    it('vacación manda sobre un pase pendiente (no se consume)', async () => {
      const db = memoriaDb({
        vacaciones: [{ id: 1, empleadoId: 1, inicio: ayerHabil, fin: ayerHabil }],
        pases: [{ id: 1, empleadoId: 1, fecha: ayerHabil, tipo: "PASE_NORMAL", motivo: "x", autorizadorId: null, autorizado: false }],
      });
      const r = await marcarFaltantes(db as never, { fecha: ayerHabil });
      expect(r.vacaciones).toBe(1);
      expect(db._pases[0].autorizado).toBe(false);
    });

    it('por defecto cierra "ayer" de Venezuela, también de noche (UTC ya es mañana)', async () => {
      const db = memoriaDb();
      // martes 2026-10-27 21:00 VE = miércoles 2026-10-28 01:00 UTC
      const ahora = new Date("2026-10-28T01:00:00Z");
      const r = await marcarFaltantes(db as never, { ahora });
      expect(r.fecha).toBe("2026-10-26");
      await expect(marcarFaltantes(db as never, { fecha: "2026-10-27", ahora })).rejects.toThrow(/pasados/);
    });

    it('fin de semana → nada (sin error)', async () => {
      const db = memoriaDb();
      // sábado más reciente
      const sab = new Date(); sab.setHours(0, 0, 0, 0);
      while (sab.getDay() !== 6) sab.setDate(sab.getDate() - 1);
      const r = await marcarFaltantes(db as never, { fecha: sab });
      expect(r.faltas + r.feriados + r.vacaciones + r.reposos).toBe(0);
    });

    it('cota anti-infinito: nada previo al creadoEn del empleado', async () => {
      const db = memoriaDb();
      // Sobrescribir empleados: uno creado después de la fecha a cerrar
      (db.empleado.findMany as () => Promise<{ id: number; creadoEn: Date; activo: boolean }[]>) = async () => [
        { id: 1, creadoEn: D("2020-01-01"), activo: true },
        { id: 9, creadoEn: new Date(), activo: true }, // creado hoy → ayer es previo a su existencia
      ];
      const r = await marcarFaltantes(db as never, { fecha: ayerHabil });
      expect(r.faltas).toBe(1); // solo el empleado 1
      expect(r.omitidos).toBe(1); // el 9 omitido por cota
      expect(db._rows.every(x => x.empleadoId === 1)).toBe(true);
    });
  });

  describe('solapeConOtroPermiso', () => {
    it('detecta solape con vacación y con reposo', async () => {
      const db = memoriaDb({
        vacaciones: [{ id: 1, empleadoId: 1, inicio: D("2026-07-01"), fin: D("2026-07-10") }],
        reposos: [{ id: 2, empleadoId: 1, inicio: D("2026-08-01"), fin: D("2026-08-05") }],
      });
      const s1 = await solapeConOtroPermiso(db as never, { empleadoId: 1, inicio: D("2026-07-05"), fin: D("2026-07-06") });
      expect(s1?.tipo).toBe("vacaciones");
      const s2 = await solapeConOtroPermiso(db as never, { empleadoId: 1, inicio: D("2026-08-03"), fin: D("2026-08-04") });
      expect(s2?.tipo).toBe("reposo médico");
      const s3 = await solapeConOtroPermiso(db as never, { empleadoId: 1, inicio: D("2026-09-01"), fin: D("2026-09-02") });
      expect(s3).toBeNull();
    });
  });
});
