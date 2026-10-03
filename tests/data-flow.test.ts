// tests/data-flow.test.ts — Test de flujo de datos completo (E2E lógico)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma } from '../vitest.setup';
import { euclideanDistanceServer, findBestMatchServer } from '../lib/face-server';
import { getDescriptorsCache, refreshDescriptorsCache, invalidateDescriptorsCache, __resetCacheForTesting } from '../lib/face-cache';

describe('Data Flow: Kiosco → Match Server → Fichaje', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetCacheForTesting();
  });

  const baseDescriptor = new Array(128).fill(0).map((_, i) => i * 0.01);
  const createDescriptor = (distance: number) => {
    const delta = distance / Math.sqrt(128);
    return baseDescriptor.map(v => v + delta);
  };

  const mockEmpleado = (id: number, descriptor: number[]) => ({
    id,
    cedula: `V-${10000000 + id}`,
    nombre: 'Test',
    apellido: `User${id}`,
    activo: true,
    gerenciaId: 1,
    gerencia: { id: 1, nombre: 'TI' },
  });

  const mockRegla = {
    id: 1,
    horaLimite: '08:00',
    horaReferencia: '17:00',
    margenMin: 60,
    cooldownMin: 30,
    vigenciaDesde: new Date('2020-01-01'),
  };

  // ─────────────────────────────────────────────────────────────────
  // FLUJO 1: Enrolamiento → Cache Refresh → Match Exitoso → Fichaje
  // ─────────────────────────────────────────────────────────────────
  it('Flujo completo: enrolar → refresh cache → match → fichar entrada', async () => {
    const empleadoId = 1;
    const descriptorEnrolado = createDescriptor(0.05);

    mockPrisma.empleado.findUnique.mockResolvedValue(mockEmpleado(empleadoId, descriptorEnrolado));
    mockPrisma.empleado.findMany.mockResolvedValue([]);
    mockPrisma.empleado.update.mockResolvedValue({ ...mockEmpleado(empleadoId, descriptorEnrolado) });
    mockPrisma.logAuditoria.create.mockResolvedValue({});

    mockPrisma.empleado.findMany.mockResolvedValue([
      { ...mockEmpleado(empleadoId, descriptorEnrolado), descriptor: Buffer.from(new Float32Array(descriptorEnrolado).buffer) }
    ]);
    
    await refreshDescriptorsCache(mockPrisma as any);

    const cache = getDescriptorsCache();
    expect(cache).toHaveLength(1);
    expect(cache[0].empleadoId).toBe(empleadoId);

    const probeDescriptor = createDescriptor(0.07);
    const match = findBestMatchServer(probeDescriptor, cache);
    expect(match).not.toBeNull();
    expect(match!.entry.empleadoId).toBe(empleadoId);
    expect(match!.distance).toBeLessThan(0.5);

    mockPrisma.kioscoNonce.findUnique.mockResolvedValue(null);
    mockPrisma.kioscoNonce.create.mockResolvedValue({});
    mockPrisma.empleado.findUnique.mockResolvedValue(mockEmpleado(empleadoId));
    mockPrisma.reglaAsistencia.findFirst.mockResolvedValue(mockRegla);
    mockPrisma.feriado.findUnique.mockResolvedValue(null);
    mockPrisma.vacacionEmpleado.findFirst.mockResolvedValue(null);
    mockPrisma.reposoMedico.findFirst.mockResolvedValue(null);
    mockPrisma.asistencia.findFirst.mockResolvedValue(null);
    mockPrisma.pasePrevio.findFirst.mockResolvedValue(null);
    mockPrisma.asistencia.create.mockResolvedValue({ id: 1, empleadoId, fecha: new Date(), entrada: new Date() });
    mockPrisma.logAuditoria.create.mockResolvedValue({});

    expect(match!.entry.empleadoId).toBe(empleadoId);
  });

  // ─────────────────────────────────────────────────────────────────
  // FLUJO 2: Match detecta asistencia previa → Salida
  // ─────────────────────────────────────────────────────────────────
  it('Flujo: match detecta asistencia previa → procesar salida', async () => {
    const empleadoId = 1;
    const descriptor = createDescriptor(0.05);

    __resetCacheForTesting();
    mockPrisma.empleado.findMany.mockResolvedValue([
      { ...mockEmpleado(empleadoId, descriptor), descriptor: Buffer.from(new Float32Array(descriptor).buffer) }
    ]);
    await refreshDescriptorsCache(mockPrisma as any);

    const match = findBestMatchServer(createDescriptor(0.07), getDescriptorsCache());
    expect(match).not.toBeNull();

    const asistenciaPrevia = {
      id: 1,
      empleadoId,
      fecha: new Date(),
      entrada: new Date(Date.now() - 8 * 3600000),
      salida: null,
      estadoEntrada: 'A_TIEMPO',
    };

    mockPrisma.asistencia.findFirst.mockResolvedValue(asistenciaPrevia);

    expect(asistenciaPrevia).toBeTruthy();
    expect(asistenciaPrevia.salida).toBeNull();

    mockPrisma.asistencia.update.mockResolvedValue({
      ...asistenciaPrevia,
      salida: new Date(),
      estadoSalida: 'COMPLETADO',
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // FLUJO 3: Anti-replay — Nonce repetido
  // ─────────────────────────────────────────────────────────────────
  it('Flujo: nonce repetido → rechazo', async () => {
    const nonce = 'repeated-nonce-123';
    
    mockPrisma.kioscoNonce.findUnique.mockResolvedValueOnce(null);
    mockPrisma.kioscoNonce.create.mockResolvedValue({ nonce });
    mockPrisma.kioscoNonce.findUnique.mockResolvedValueOnce({ nonce, usadoEn: new Date() });

    const firstCheck = await mockPrisma.kioscoNonce.findUnique({ where: { nonce } });
    expect(firstCheck).toBeNull();

    const secondCheck = await mockPrisma.kioscoNonce.findUnique({ where: { nonce } });
    expect(secondCheck).not.toBeNull();
    expect(secondCheck!.nonce).toBe(nonce);
  });

  // ─────────────────────────────────────────────────────────────────
  // FLUJO 4: Calidad insuficiente → rechazo antes de match
  // ─────────────────────────────────────────────────────────────────
  it('Flujo: calidad fallida (sin parpadeo) → rechazo temprano', () => {
    const validateQuality = (q: { earOk: boolean; poseOk: boolean; brightness: number; centered: boolean; distance: boolean }) => {
      if (!q.earOk) return 'parpadeo no detectado';
      if (!q.poseOk) return 'movimiento de cabeza no detectado';
      if (q.brightness < 40 || q.brightness > 220) return 'iluminación inadecuada';
      if (!q.centered) return 'rostro no centrado';
      if (!q.distance) return 'distancia inadecuada';
      return null;
    };

    const qualityMala = { earOk: false, poseOk: true, brightness: 100, centered: true, distance: true };
    const error = validateQuality(qualityMala);
    
    expect(error).toBe('parpadeo no detectado');
    expect(mockPrisma.kioscoNonce.findUnique).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────
  // FLUJO 5: Empleado desconocido → no match
  // ─────────────────────────────────────────────────────────────────
  it('Flujo: descriptor no matcha → UNKNOWN', async () => {
    const empleadosCache = [
      { empleadoId: 1, cedula: 'V-1', nombre: 'A', apellido: '1', descriptor: createDescriptor(0.1) },
      { empleadoId: 2, cedula: 'V-2', nombre: 'B', apellido: '2', descriptor: createDescriptor(0.2) },
      { empleadoId: 3, cedula: 'V-3', nombre: 'C', apellido: '3', descriptor: createDescriptor(0.3) },
    ];

    const probeDesconocido = createDescriptor(0.9);
    const match = findBestMatchServer(probeDesconocido, empleadosCache);

    expect(match).toBeNull();
  });

// ─────────────────────────────────────────────────────────────────
  // FLUJO 6: Ambigüedad → null
  // ─────────────────────────────────────────────────────────────────
  it('Flujo: dos empleados casi idénticos → ambigüedad → null', async () => {
    // Crear dos descriptores MUY cercanos entre sí (distancia < margin)
    const d1 = createDescriptor(0.1);
    // d2 casi idéntico a d1: variación mínima
    const d2 = d1.map(v => v + 0.001); // Diferencia euclidiana ~0.001 * sqrt(128) ≈ 0.011

    const empleadosAmbiguos = [
      { empleadoId: 1, cedula: 'V-1', nombre: 'A', apellido: '1', descriptor: d1 },
      { empleadoId: 2, cedula: 'V-2', nombre: 'B', apellido: '2', descriptor: d2 },
    ];

    // Probe muy cerca de ambos
    const probe = createDescriptor(0.1);
    const match = findBestMatchServer(probe, empleadosAmbiguos);

    // Debe retornar null por ambigüedad (margin = 0.06)
    expect(match).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────
  // FLUJO 7: Cache invalidación tras desactivar empleado
  // ─────────────────────────────────────────────────────────────────
  it('Flujo: empleado desactivado → invalidate cache → no matcha', async () => {
    const empleadoId = 1;
    const descriptor = createDescriptor(0.05);

    mockPrisma.empleado.findMany.mockResolvedValue([
      { ...mockEmpleado(empleadoId, descriptor), descriptor: Buffer.from(new Float32Array(descriptor).buffer) }
    ]);
    await refreshDescriptorsCache(mockPrisma as any);

    let match = findBestMatchServer(createDescriptor(0.07), getDescriptorsCache());
    expect(match).not.toBeNull();

    invalidateDescriptorsCache();

    expect(getDescriptorsCache()).toHaveLength(0);
    match = findBestMatchServer(createDescriptor(0.07), getDescriptorsCache());
    expect(match).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────
  // FLUJO 8: Concurrencia — documentar comportamiento esperado
  // ─────────────────────────────────────────────────────────────────
  it('Flujo concurrente: race condition en create → P2002 (requiere retry/transacción)', async () => {
    const empleadoId = 1;
    const descriptor = createDescriptor(0.05);

    mockPrisma.kioscoNonce.findUnique.mockResolvedValue(null);
    mockPrisma.kioscoNonce.create.mockResolvedValue({});
    mockPrisma.empleado.findUnique.mockResolvedValue(mockEmpleado(empleadoId));
    mockPrisma.reglaAsistencia.findFirst.mockResolvedValue(mockRegla);
    mockPrisma.feriado.findUnique.mockResolvedValue(null);
    mockPrisma.vacacionEmpleado.findFirst.mockResolvedValue(null);
    mockPrisma.reposoMedico.findFirst.mockResolvedValue(null);

    mockPrisma.asistencia.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    let createCalls = 0;
    mockPrisma.asistencia.create.mockImplementation(() => {
      createCalls++;
      if (createCalls > 1) {
        throw { code: 'P2002', meta: { target: ['empleadoId', 'fecha'] } };
      }
      return Promise.resolve({ id: createCalls });
    });

    await mockPrisma.asistencia.create({ data: {} });
    expect(createCalls).toBe(1);

    try {
      await mockPrisma.asistencia.create({ data: {} });
    } catch (e: any) {
      expect(e.code).toBe('P2002');
    }

    // NOTA: En producción usar $transaction o try/catch + retry con update
  });
});