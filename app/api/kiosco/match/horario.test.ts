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
    horaEntrada: '08:00',
    horaLimite: '09:00',
    horaReferencia: '17:00',
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

  describe('clasificación de entrada (entrada 08:00, límite 09:00; FALTA solo por ausencia)', () => {
    it('07:30 → TEMPRANO (antes de la hora de entrada)', async () => {
      setupBase();
      const { now, hoy } = atHour(7, 30);
      const r = await executeFichaje(1, now, hoy);
      expect(r.tipo).toBe('temprano');
      expect(mockPrisma.asistencia.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ estadoEntrada: 'TEMPRANO', reglaId: 7 }) })
      );
    });

    it('08:00 → A_TIEMPO (borde inferior incluido)', async () => {
      setupBase();
      const { now, hoy } = atHour(8, 0);
      const r = await executeFichaje(1, now, hoy);
      expect(r.tipo).toBe('a_tiempo');
    });

    it('08:30 → A_TIEMPO (dentro de la ventana)', async () => {
      setupBase();
      const { now, hoy } = atHour(8, 30);
      const r = await executeFichaje(1, now, hoy);
      expect(r.tipo).toBe('a_tiempo');
      expect(mockPrisma.asistencia.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ estadoEntrada: 'A_TIEMPO', reglaId: 7 }) })
      );
    });

    it('09:00 → A_TIEMPO (borde superior incluido)', async () => {
      setupBase();
      const { now, hoy } = atHour(9, 0);
      const r = await executeFichaje(1, now, hoy);
      expect(r.tipo).toBe('a_tiempo');
    });

    it('09:01 → TARDE (después del límite, sin bloqueo)', async () => {
      setupBase();
      const { now, hoy } = atHour(9, 1);
      const r = await executeFichaje(1, now, hoy);
      expect(r.tipo).toBe('tarde');
    });

    it('10:30 sin pase → TARDE (FALTA solo por ausencia)', async () => {
      setupBase();
      const { now, hoy } = atHour(10, 30);
      const r = await executeFichaje(1, now, hoy);
      expect(r.tipo).toBe('tarde');
      expect(mockPrisma.asistencia.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ estadoEntrada: 'TARDE', reglaId: 7 }) })
      );
    });

    it('10:30 con pase → JUSTIFICADO + conserva estadoOriginal TARDE + consume pase', async () => {
      setupBase({ pase: { id: 9, motivo: 'cita médica', autorizadorId: 2 } });
      const { now, hoy } = atHour(10, 30);
      const r = await executeFichaje(1, now, hoy);
      expect(r.tipo).toBe('justificado');
      expect(mockPrisma.asistencia.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ estadoEntrada: 'JUSTIFICADO', estadoOriginal: 'TARDE' }),
        })
      );
      expect(mockPrisma.pasePrevio.update).toHaveBeenCalledWith({ where: { id: 9 }, data: { autorizado: true } });
    });

    it('09:30 con pase → JUSTIFICADO + estadoOriginal TARDE', async () => {
      setupBase({ pase: { id: 10, motivo: 'tráfico', autorizadorId: null } });
      const { now, hoy } = atHour(9, 30);
      const r = await executeFichaje(1, now, hoy);
      expect(r.tipo).toBe('justificado');
      expect(mockPrisma.asistencia.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ estadoEntrada: 'JUSTIFICADO', estadoOriginal: 'TARDE' }),
        })
      );
    });

    it('08:30 con pase → A_TIEMPO sin consumir pase (el pase solo aplica a TARDE)', async () => {
      setupBase({ pase: { id: 11, motivo: 'tráfico', autorizadorId: null } });
      const { now, hoy } = atHour(8, 30);
      const r = await executeFichaje(1, now, hoy);
      expect(r.tipo).toBe('a_tiempo');
      expect(mockPrisma.pasePrevio.update).not.toHaveBeenCalled();
    });

    it('07:30 con pase → TEMPRANO sin consumir pase', async () => {
      setupBase({ pase: { id: 12, motivo: 'tráfico', autorizadorId: null } });
      const { now, hoy } = atHour(7, 30);
      const r = await executeFichaje(1, now, hoy);
      expect(r.tipo).toBe('temprano');
      expect(mockPrisma.pasePrevio.update).not.toHaveBeenCalled();
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

    it('reposo vigente → marca directo REPOSO_MEDICO', async () => {
      setupBase({ reposo: { fin: new Date('2026-06-20'), motivo: 'gripe' } });
      const { now, hoy } = atHour(10, 30);
      const r = await executeFichaje(1, now, hoy);
      expect(r.tipo).toBe('reposo_medico');
      expect(mockPrisma.asistencia.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ estadoEntrada: 'REPOSO_MEDICO' }),
        })
      );
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

  describe('auto-marcas y anuladas', () => {
    it('escaneo sobre fila VACACIONES sin marcaje → completa entrada sin crear (sin P2002)', async () => {
      setupBase({
        vacacion: { inicio: new Date(), fin: new Date() },
        asistencia: { id: 9, entrada: null, salida: null, estadoEntrada: 'VACACIONES' },
      });
      const { now, hoy } = atHour(7, 30);
      const r = await executeFichaje(1, now, hoy);
      expect(r.tipo).toBe('vacaciones');
      expect(mockPrisma.asistencia.create).not.toHaveBeenCalled();
      expect(mockPrisma.asistencia.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 9 },
          data: expect.objectContaining({ entrada: now, reglaId: 7 }),
        })
      );
    });

    it('escaneo sobre fila FERIADO sin marcaje → completa entrada conservando FERIADO', async () => {
      setupBase({
        feriado: { fecha: new Date(), motivo: 'Fiesta' },
        asistencia: { id: 10, entrada: null, salida: null, estadoEntrada: 'FERIADO' },
      });
      const { now, hoy } = atHour(7, 30);
      const r = await executeFichaje(1, now, hoy);
      expect(r.tipo).toBe('feriado');
      expect(mockPrisma.asistencia.create).not.toHaveBeenCalled();
    });
  });

  describe('anuladas ignoradas por el kiosco', () => {
    it('consulta vacaciones y reposos solo no anuladas', async () => {
      setupBase();
      const { now, hoy } = atHour(7, 30);
      await executeFichaje(1, now, hoy);
      expect(mockPrisma.vacacionEmpleado.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ anulada: false }) })
      );
      expect(mockPrisma.reposoMedico.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ anulada: false }) })
      );
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