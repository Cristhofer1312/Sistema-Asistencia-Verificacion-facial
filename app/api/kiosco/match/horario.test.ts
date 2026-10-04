// horario.test.ts — Matriz de validaciones de horario del fichaje (vía executeFichaje del match)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma } from '../../../../vitest.setup';

import { executeFichaje } from '@/lib/fichaje';

describe('executeFichaje — validaciones de horario', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const regla = {
    id: 7,
    horaLimite: '08:00',
    horaReferencia: '17:00',
    margenMin: 60,
    cooldownMin: 30,
    vigenciaDesde: new Date('2020-01-01'),
  };

  const empleado = (id = 1) => ({
    id,
    cedula: `V-${10000000 + id}`,
    nombre: 'Ana',
    apellido: `Perez${id}`,
    activo: true,
    gerencia: { id: 1, nombre: 'TI' },
  });

  // hoy fijo + hora VE construida en local (executeFichaje usa getHours/getMinutes del Date)
  const hoyOf = (h: Date) => new Date(Date.UTC(h.getFullYear(), h.getMonth(), h.getDate()));
  const atHour = (hh: number, mm = 0) => {
    const d = new Date(2026, 5, 15, hh, mm, 0); // 15-jun-2026 hora local
    return { now: d, hoy: hoyOf(d) };
  };

  const setupBase = (overrides: Partial<{
    asistencia: unknown; feriado: unknown; vacacion: unknown; reposo: unknown; pase: unknown;
  }> = {}) => {
    mockPrisma.empleado.findUnique.mockResolvedValue(empleado());
    mockPrisma.reglaAsistencia.findFirst.mockResolvedValue(regla);
    mockPrisma.feriado.findUnique.mockResolvedValue(overrides.feriado ?? null);
    mockPrisma.vacacionEmpleado.findFirst.mockResolvedValue(overrides.vacacion ?? null);
    mockPrisma.reposoMedico.findFirst.mockResolvedValue(overrides.reposo ?? null);
    mockPrisma.asistencia.findFirst.mockResolvedValue(overrides.asistencia ?? null);
    mockPrisma.pasePrevio.findFirst.mockResolvedValue(overrides.pase ?? null);
    mockPrisma.asistencia.create.mockResolvedValue({ id: 1 });
    mockPrisma.asistencia.update.mockResolvedValue({ id: 1 });
    mockPrisma.pasePrevio.update.mockResolvedValue({});
    mockPrisma.logAuditoria.create.mockResolvedValue({});
  };

  describe('clasificación de entrada (horaLimite 08:00 + margen 60)', () => {
    it('07:59 → A_TIEMPO', async () => {
      setupBase();
      const { now, hoy } = atHour(7, 59);
      const r = await executeFichaje(1, now, hoy);
      expect(r.tipo).toBe('a_tiempo');
      expect(mockPrisma.asistencia.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ estadoEntrada: 'A_TIEMPO', reglaId: 7 }) })
      );
    });

    it('08:30 → TARDE', async () => {
      setupBase();
      const { now, hoy } = atHour(8, 30);
      // TARDE requiere pase para no fallar: con pase pasa a JUSTIFICADO; sin pase TARDE ficha igual
      const r = await executeFichaje(1, now, hoy);
      expect(r.tipo).toBe('tarde');
    });

    it('10:30 sin pase → FUERA_MARGEN (403)', async () => {
      setupBase();
      const { now, hoy } = atHour(10, 30); // > 08:00+60 = FALTA sin pase
      await expect(executeFichaje(1, now, hoy)).rejects.toThrow(/^FUERA_MARGEN/);
      expect(mockPrisma.asistencia.create).not.toHaveBeenCalled();
    });

    it('10:30 con pase → JUSTIFICADO + conserva estadoOriginal FALTA + consume pase', async () => {
      setupBase({ pase: { id: 9, motivo: 'cita médica', autorizadorId: 2 } });
      const { now, hoy } = atHour(10, 30);
      const r = await executeFichaje(1, now, hoy);
      expect(r.tipo).toBe('justificado');
      expect(mockPrisma.asistencia.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ estadoEntrada: 'JUSTIFICADO', estadoOriginal: 'FALTA' }),
        })
      );
      expect(mockPrisma.pasePrevio.update).toHaveBeenCalledWith({ where: { id: 9 }, data: { autorizado: true } });
    });

    it('08:30 con pase → JUSTIFICADO + estadoOriginal TARDE', async () => {
      setupBase({ pase: { id: 10, motivo: 'tráfico', autorizadorId: null } });
      const { now, hoy } = atHour(8, 30);
      const r = await executeFichaje(1, now, hoy);
      expect(r.tipo).toBe('justificado');
      expect(mockPrisma.asistencia.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ estadoEntrada: 'JUSTIFICADO', estadoOriginal: 'TARDE' }),
        })
      );
    });
  });

  describe('feriado / vacaciones / reposo', () => {
    it('feriado → FERIADO aunque sea fuera de horario', async () => {
      setupBase({ feriado: { fecha: new Date(), motivo: 'Fiesta Nacional' } });
      const { now, hoy } = atHour(10, 30);
      const r = await executeFichaje(1, now, hoy);
      expect(r.tipo).toBe('feriado');
    });

    it('vacaciones → VACACIONES', async () => {
      setupBase({ vacacion: { inicio: new Date(), fin: new Date() } });
      const { now, hoy } = atHour(7, 30);
      const r = await executeFichaje(1, now, hoy);
      expect(r.tipo).toBe('vacaciones');
    });

    it('reposo vigente → bloquea sin crear asistencia', async () => {
      setupBase({ reposo: { fin: new Date('2026-06-20'), motivo: 'gripe' } });
      const { now, hoy } = atHour(7, 30);
      const r = await executeFichaje(1, now, hoy);
      expect(r.tipo).toBe('reposo_medico');
      expect(mockPrisma.asistencia.create).not.toHaveBeenCalled();
    });
  });

  describe('cooldown y duplicado', () => {
    it('entrada hace 5 min (cooldown 30) → COOLDOWN', async () => {
      const { now, hoy } = atHour(8, 0);
      setupBase({
        asistencia: { id: 3, entrada: new Date(now.getTime() - 5 * 60000), salida: null },
      });
      await expect(executeFichaje(1, now, hoy)).rejects.toThrow(/^COOLDOWN:/);
    });

    it('entrada + salida hoy → DUPLICADO', async () => {
      const { now, hoy } = atHour(17, 30);
      const entrada = new Date(now.getTime() - 9 * 3600000);
      setupBase({ asistencia: { id: 4, entrada, salida: new Date(now.getTime() - 3600000) } });
      await expect(executeFichaje(1, now, hoy)).rejects.toThrow(/^DUPLICADO/);
    });
  });

  describe('salida (horaReferencia 17:00)', () => {
    const entradaHoy = (now: Date) => ({
      id: 5,
      entrada: new Date(now.getTime() - 9 * 3600000), // hace 9h → fuera de cooldown
      salida: null,
      estadoEntrada: 'A_TIEMPO',
    });

    it('salida 16:30 → TEMPRANO sin extras', async () => {
      const { now, hoy } = atHour(16, 30);
      setupBase({ asistencia: entradaHoy(now) });
      const r = await executeFichaje(1, now, hoy);
      expect(r.tipo).toBe('temprano');
      expect(r.extrasH).toBe(0);
      expect(mockPrisma.asistencia.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ estadoSalida: 'TEMPRANO' }) })
      );
    });

    it('salida 18:30 → COMPLETADO + 1.5h extras', async () => {
      const { now, hoy } = atHour(18, 30);
      setupBase({ asistencia: entradaHoy(now) });
      const r = await executeFichaje(1, now, hoy);
      expect(r.tipo).toBe('completado');
      expect(r.extrasH).toBeCloseTo(1.5, 5);
    });

    it('salida en día FERIADO → todo el tiempo es extra', async () => {
      const { now, hoy } = atHour(12, 0);
      const entrada = new Date(now.getTime() - 4 * 3600000);
      setupBase({ asistencia: { id: 6, entrada, salida: null, estadoEntrada: 'FERIADO' } });
      const r = await executeFichaje(1, now, hoy);
      expect(r.tipo).toBe('completado');
      expect(r.extrasH).toBeCloseTo(4, 5);
    });
  });

  describe('regla vigente', () => {
    it('sin regla → error (no ficha a ciegas)', async () => {
      setupBase();
      mockPrisma.reglaAsistencia.findFirst.mockResolvedValue(null);
      const { now, hoy } = atHour(7, 30);
      await expect(executeFichaje(1, now, hoy)).rejects.toThrow(/reglas/);
      expect(mockPrisma.asistencia.create).not.toHaveBeenCalled();
    });

    it('empleado inactivo → error sin crear', async () => {
      setupBase();
      mockPrisma.empleado.findUnique.mockResolvedValue({ ...empleado(), activo: false });
      const { now, hoy } = atHour(7, 30);
      await expect(executeFichaje(1, now, hoy)).rejects.toThrow();
      expect(mockPrisma.asistencia.create).not.toHaveBeenCalled();
    });
  });
});