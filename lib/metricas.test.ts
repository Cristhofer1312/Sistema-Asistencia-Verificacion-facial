import { describe, it, expect } from 'vitest';
import { claseAsistencia, resumenAsistencias, porcentajeAsistencia } from './metricas';
import { extrasJornadaH } from './jornada';

describe('porcentajeAsistencia', () => {
  it('cuenta tardes como asistidas y excluye feriados/vacaciones/reposos del total', () => {
    const r = resumenAsistencias([
      { estadoEntrada: 'A_TIEMPO', entrada: '08:00' },
      { estadoEntrada: 'TARDE', entrada: '08:40' },
      { estadoEntrada: 'JUSTIFICADO', estadoOriginal: 'TARDE', entrada: '09:30' },
      { estadoEntrada: 'FALTA' },
      { estadoEntrada: 'VACACIONES' },
      { estadoEntrada: 'FERIADO' },
      { estadoEntrada: 'REPOSO_MEDICO' },
    ]);
    expect(porcentajeAsistencia(r)).toBe(75); // 3 asistidos de 4 exigibles
  });

  it('null sin días exigibles', () => {
    expect(porcentajeAsistencia(resumenAsistencias([{ estadoEntrada: 'VACACIONES' }]))).toBeNull();
  });
});

describe('claseAsistencia', () => {
  it('TEMPRANO cuenta como puntual', () => {
    expect(claseAsistencia({ estadoEntrada: 'TEMPRANO' })).toBe('PUNTUAL');
    expect(claseAsistencia({ estadoEntrada: 'A_TIEMPO' })).toBe('PUNTUAL');
  });

  it('JUSTIFICADO se separa según el estado original', () => {
    expect(claseAsistencia({ estadoEntrada: 'JUSTIFICADO', estadoOriginal: 'TARDE' })).toBe('TARDE_JUSTIFICADA');
    expect(claseAsistencia({ estadoEntrada: 'JUSTIFICADO', estadoOriginal: 'FALTA' })).toBe('FALTA_JUSTIFICADA');
  });

  it('JUSTIFICADO sin estado original: con entrada → tardanza, sin entrada → falta', () => {
    expect(claseAsistencia({ estadoEntrada: 'JUSTIFICADO', entrada: '09:20' })).toBe('TARDE_JUSTIFICADA');
    expect(claseAsistencia({ estadoEntrada: 'JUSTIFICADO', entrada: null })).toBe('FALTA_JUSTIFICADA');
  });
});

describe('resumenAsistencias', () => {
  it('cada fila cuenta en una sola categoría (sin dobles métricas)', () => {
    const r = resumenAsistencias([
      { estadoEntrada: 'TARDE', entrada: '09:30' },
      { estadoEntrada: 'JUSTIFICADO', estadoOriginal: 'TARDE', entrada: '09:40' },
      { estadoEntrada: 'FALTA', entrada: null },
      { estadoEntrada: 'JUSTIFICADO', estadoOriginal: 'FALTA', entrada: null },
      { estadoEntrada: 'TEMPRANO', entrada: '07:50', estadoSalida: 'TEMPRANO', extrasH: 0 },
      { estadoEntrada: 'A_TIEMPO', entrada: '08:10', extrasH: 1.5 },
    ]);
    expect(r).toMatchObject({
      tardes: 1, tardesJustificadas: 1, faltas: 1, faltasJustificadas: 1,
      puntuales: 2, presentes: 4, salidasAnticipadas: 1, extrasH: 1.5,
    });
  });
});

describe('extrasJornadaH (entrada 08:00, referencia 17:00)', () => {
  const base = { horaEntradaMin: 8 * 60, horaReferenciaMin: 17 * 60 };

  it('entrada puntual, salida 18:30 → 1.5h', () => {
    expect(extrasJornadaH({ ...base, entradaMin: 8 * 60, salidaMin: 18 * 60 + 30 })).toBeCloseTo(1.5, 5);
  });

  it('llegar 30 min tarde descuenta 30 min de extras', () => {
    expect(extrasJornadaH({ ...base, entradaMin: 8 * 60 + 30, salidaMin: 18 * 60 + 30 })).toBeCloseTo(1, 5);
  });

  it('el retraso mayor que las extras deja 0, nunca negativo', () => {
    expect(extrasJornadaH({ ...base, entradaMin: 10 * 60, salidaMin: 18 * 60 })).toBe(0);
  });

  it('llegar antes de la hora de entrada no suma extras', () => {
    expect(extrasJornadaH({ ...base, entradaMin: 7 * 60, salidaMin: 17 * 60 })).toBe(0);
  });

  it('salida antes de la referencia → 0', () => {
    expect(extrasJornadaH({ ...base, entradaMin: 8 * 60, salidaMin: 16 * 60 })).toBe(0);
  });
});
