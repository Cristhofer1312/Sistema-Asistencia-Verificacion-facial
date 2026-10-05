// permiso-estudiantil.test.ts — Permiso estudiantil: solo extiende hora límite (vía executeFichaje)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma } from '../../../../vitest.setup';

import { executeFichaje } from '@/lib/fichaje';

describe('executeFichaje — permiso estudiantil', () => {
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
    nombre: 'Jose',
    apellido: `Perez${id}`,
    activo: true,
    gerencia: { id: 1, nombre: 'TI' },
  });

  const hoyOf = (h: Date) => new Date(Date.UTC(h.getFullYear(), h.getMonth(), h.getDate()));
  // 15-jun-2026 = lunes (dow 1) · 16-jun-2026 = martes (dow 2)
  const atDate = (day: number, hh: number, mm = 0) => {
    const d = new Date(2026, 5, day, hh, mm, 0);
    return { now: d, hoy: hoyOf(d) };
  };

  const permiso = (over: Record<string, unknown> = {}) => ({
    id: 21,
    empleadoId: 1,
    diasSemana: [2], // martes
    horaLimite: '10:30',
    validoDesde: new Date(Date.UTC(2026, 5, 1)),
    validoHasta: new Date(Date.UTC(2026, 11, 15)),
    motivo: 'semestre',
    activo: true,
    creadoPorId: 5,
    ...over,
  });

  const setupBase = (overrides: Partial<{
    asistencia: unknown; feriado: unknown; vacacion: unknown; reposo: unknown; pase: unknown; permiso: unknown;
  }> = {}) => {
    mockPrisma.empleado.findUnique.mockResolvedValue(empleado());
    mockPrisma.reglaAsistencia.findFirst.mockResolvedValue(regla);
    mockPrisma.feriado.findUnique.mockResolvedValue(overrides.feriado ?? null);
    mockPrisma.vacacionEmpleado.findFirst.mockResolvedValue(overrides.vacacion ?? null);
    mockPrisma.reposoMedico.findFirst.mockResolvedValue(overrides.reposo ?? null);
    mockPrisma.asistencia.findFirst.mockResolvedValue(overrides.asistencia ?? null);
    mockPrisma.pasePrevio.findFirst.mockResolvedValue(overrides.pase ?? null);
    mockPrisma.permisoEstudiantil.findFirst.mockResolvedValue(overrides.permiso ?? null);
    mockPrisma.asistencia.create.mockResolvedValue({ id: 1 });
    mockPrisma.asistencia.update.mockResolvedValue({ id: 1 });
    mockPrisma.pasePrevio.update.mockResolvedValue({});
    mockPrisma.logAuditoria.create.mockResolvedValue({});
  };

  it('mar 10:15 con permiso mar hasta 10:30 → A_TIEMPO + permisoEstudiantilId + obs', async () => {
    setupBase({ permiso: permiso() });
    const { now, hoy } = atDate(16, 10, 15);
    const r = await executeFichaje(1, now, hoy);
    expect(r.tipo).toBe('a_tiempo');
    expect(mockPrisma.asistencia.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estadoEntrada: 'A_TIEMPO', permisoEstudiantilId: 21 }),
      })
    );
    const data = mockPrisma.asistencia.create.mock.calls[0][0].data;
    expect(data.justificacionObs).toMatch(/Permiso estudiantil/);
    expect(data.justificacionObs).toMatch(/10:30/);
  });

  it('consulta el permiso del día con orderBy más amplio primero', async () => {
    setupBase({ permiso: permiso() });
    const { now, hoy } = atDate(16, 10, 15);
    await executeFichaje(1, now, hoy);
    expect(mockPrisma.permisoEstudiantil.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          empleadoId: 1,
          activo: true,
          diasSemana: { has: 2 },
        }),
        orderBy: { horaLimite: 'desc' },
      })
    );
  });

  it('lun 10:15 con permiso solo martes → TARDE sin permiso', async () => {
    setupBase({ permiso: null });
    const { now, hoy } = atDate(15, 10, 15);
    const r = await executeFichaje(1, now, hoy);
    expect(r.tipo).toBe('tarde');
    expect(mockPrisma.asistencia.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estadoEntrada: 'TARDE', permisoEstudiantilId: null }),
      })
    );
  });

  it('mar 10:45 con permiso hasta 10:30 → TARDE', async () => {
    setupBase({ permiso: permiso() });
    const { now, hoy } = atDate(16, 10, 45);
    const r = await executeFichaje(1, now, hoy);
    expect(r.tipo).toBe('tarde');
  });

  it('mar 08:30 con permiso → A_TIEMPO (ventana general intacta)', async () => {
    setupBase({ permiso: permiso() });
    const { now, hoy } = atDate(16, 8, 30);
    const r = await executeFichaje(1, now, hoy);
    expect(r.tipo).toBe('a_tiempo');
  });

  it('permiso con hora menor que la general se ignora (no recorta)', async () => {
    setupBase({ permiso: permiso({ horaLimite: '08:30' }) });
    const { now, hoy } = atDate(16, 8, 45); // dentro de la general
    const r = await executeFichaje(1, now, hoy);
    expect(r.tipo).toBe('a_tiempo');
    expect(mockPrisma.asistencia.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ permisoEstudiantilId: null }),
      })
    );
    const { now: now2, hoy: hoy2 } = atDate(16, 10, 15);
    const r2 = await executeFichaje(1, now2, hoy2);
    expect(r2.tipo).toBe('tarde');
  });

  it('feriado manda sobre el permiso', async () => {
    setupBase({ permiso: permiso(), feriado: { fecha: new Date(), motivo: 'Fiesta' } });
    const { now, hoy } = atDate(16, 10, 15);
    const r = await executeFichaje(1, now, hoy);
    expect(r.tipo).toBe('feriado');
    expect(mockPrisma.asistencia.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estadoEntrada: 'FERIADO' }),
      })
    );
  });

  it('vacación manda sobre el permiso', async () => {
    setupBase({ permiso: permiso(), vacacion: { inicio: new Date(), fin: new Date() } });
    const { now, hoy } = atDate(16, 10, 15);
    const r = await executeFichaje(1, now, hoy);
    expect(r.tipo).toBe('vacaciones');
  });

  it('10:45 con permiso hasta 10:30 + pase → JUSTIFICADO y consume pase', async () => {
    setupBase({ permiso: permiso(), pase: { id: 9, motivo: 'cita', autorizadorId: 2 } });
    const { now, hoy } = atDate(16, 10, 45);
    const r = await executeFichaje(1, now, hoy);
    expect(r.tipo).toBe('justificado');
    expect(mockPrisma.pasePrevio.update).toHaveBeenCalledWith({ where: { id: 9 }, data: { autorizado: true } });
    const data = mockPrisma.asistencia.create.mock.calls[0][0].data;
    expect(data.permisoEstudiantilId).toBe(21);
    expect(data.justificacionObs).toMatch(/Pase previo/);
  });

  it('la salida no cambia por el permiso (extras por horaReferencia)', async () => {
    const { now, hoy } = atDate(16, 18, 0);
    setupBase({
      permiso: permiso(),
      asistencia: {
        id: 5,
        entrada: new Date(now.getTime() - 8 * 3600000),
        salida: null,
        estadoEntrada: 'A_TIEMPO',
      },
    });
    const r = await executeFichaje(1, now, hoy);
    expect(r.tipo).toBe('completado');
    expect(r.extrasH).toBeCloseTo(1, 5);
  });
});
