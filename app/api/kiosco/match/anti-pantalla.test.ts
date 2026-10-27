// anti-pantalla.test.ts — El match exige la revisión de celulares/pantallas y nunca ficha si hubo detección
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma } from '../../../../vitest.setup';
import { audit } from '@/lib/auditoria';
import { executeFichaje } from '@/lib/fichaje';
import { descriptorToBuffer } from '@/lib/descriptor-utils';

vi.hoisted(() => {
  process.env.API_KIOSCO_KEY = 'clave-test'; // la ruta la lee al importarse
});
vi.mock('@/lib/fichaje', () => ({ executeFichaje: vi.fn() }));

import { POST } from './route';

const descriptor = Array.from({ length: 128 }, () => 1 / Math.sqrt(128));

function peticion(extra: Record<string, unknown>) {
  return new Request('http://localhost/api/kiosco/match', {
    method: 'POST',
    headers: { authorization: 'Bearer clave-test', 'content-type': 'application/json' },
    body: JSON.stringify({
      descriptor,
      quality: { earOk: true, poseOk: true, brightness: 120, clipHigh: 0, clipLow: 0, centered: true, distance: true },
      nonce: crypto.randomUUID(),
      timestamp: Date.now(),
      ...extra,
    }),
  });
}

describe('POST /api/kiosco/match — anti-pantalla', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.kioscoNonce.findUnique.mockResolvedValue(null);
    mockPrisma.kioscoNonce.create.mockResolvedValue({});
    mockPrisma.empleado.findMany.mockResolvedValue([
      { id: 5, cedula: 'V-12345678', nombre: 'Ana', apellido: 'Perez', descriptor: descriptorToBuffer(Float32Array.from(descriptor)) },
    ]);
  });

  it('sin revisión de pantalla → 400 pantalla_requerida, auditado y sin fichaje', async () => {
    const res = await POST(peticion({}));
    expect(res.status).toBe(400);
    expect((await res.json()).tipo).toBe('pantalla_requerida');
    expect(audit).toHaveBeenCalledWith('MATCH_KIOSCO_PANTALLA', expect.stringContaining('falta la verificación'), expect.anything());
    expect(executeFichaje).not.toHaveBeenCalled();
  });

  it('revisión que no se ejecutó → 400', async () => {
    const res = await POST(peticion({ pantalla: { revisado: false, detectado: false, revisiones: 0 } }));
    expect(res.status).toBe(400);
    expect(executeFichaje).not.toHaveBeenCalled();
  });

  it('celular detectado → 403 sin fichaje; la auditoría registra a quién se mostró, la respuesta no', async () => {
    const res = await POST(peticion({ pantalla: { revisado: true, detectado: true, revisiones: 2, clase: 'cell phone', score: 0.81 } }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.tipo).toBe('pantalla_detectada');
    expect(body.error).toContain('un celular');
    expect(JSON.stringify(body)).not.toContain('Ana');
    expect(executeFichaje).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(
      'MATCH_KIOSCO_PANTALLA',
      expect.stringMatching(/un celular.*0\.81.*Ana Perez \(V-12345678\)/),
      expect.anything(),
    );
  });

  it('detección con nonce repetido → 409 (no se puede inundar la auditoría)', async () => {
    mockPrisma.kioscoNonce.findUnique.mockResolvedValue({ nonce: 'x' });
    const res = await POST(peticion({ pantalla: { revisado: true, detectado: true, revisiones: 1 } }));
    expect(res.status).toBe(409);
  });

  it('revisión limpia → pasa la puerta y sigue a las demás validaciones (challenge)', async () => {
    const res = await POST(peticion({ pantalla: { revisado: true, detectado: false, revisiones: 3 } }));
    expect(res.status).toBe(400);
    expect((await res.json()).tipo).toBe('bad_challenge');
    expect(audit).not.toHaveBeenCalledWith('MATCH_KIOSCO_PANTALLA', expect.anything(), expect.anything());
  });
});
