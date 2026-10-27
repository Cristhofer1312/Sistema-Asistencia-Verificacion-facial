import { describe, it, expect } from 'vitest';
import { evaluarIluminacion } from './face-quality';

describe('evaluarIluminacion', () => {
  it('piel oscura con luz buena (promedio bajo, sin recorte) → OK', () => {
    expect(evaluarIluminacion({ mean: 62, clipLow: 0.03, clipHigh: 0.01 })).toBeNull();
  });

  it('escena casi a oscuras (promedio muy bajo) → POCA_LUZ', () => {
    expect(evaluarIluminacion({ mean: 20, clipLow: 0.5, clipHigh: 0 })).toBe('POCA_LUZ');
  });

  it('muchos píxeles casi negros aun con promedio aceptable → POCA_LUZ', () => {
    expect(evaluarIluminacion({ mean: 50, clipLow: 0.4, clipHigh: 0 })).toBe('POCA_LUZ');
  });

  it('rostro sobreexpuesto (muchos píxeles quemados) → SOBREEXPUESTO', () => {
    expect(evaluarIluminacion({ mean: 200, clipLow: 0, clipHigh: 0.4 })).toBe('SOBREEXPUESTO');
  });

  it('en el límite exacto del recorte sigue aceptado', () => {
    expect(evaluarIluminacion({ mean: 80, clipLow: 0.15, clipHigh: 0.15 })).toBeNull();
  });
});
