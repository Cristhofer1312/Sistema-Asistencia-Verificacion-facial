// vitest.setup.ts — Configuración global de tests
import { beforeEach, vi } from 'vitest';
import { __resetCacheForTesting } from '@/lib/face-cache';

// Mock de Prisma Client
const mockPrisma = {
  kioscoNonce: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  empleado: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  reglaAsistencia: {
    findFirst: vi.fn(),
  },
  feriado: {
    findUnique: vi.fn(),
  },
  vacacionEmpleado: {
    findFirst: vi.fn(),
  },
  reposoMedico: {
    findFirst: vi.fn(),
  },
  asistencia: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  pasePrevio: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  permisoEstudiantil: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  logAuditoria: {
    create: vi.fn(),
  },
  $transaction: vi.fn((fn) => fn(mockPrisma)),
};

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

// Mock de auditoría
vi.mock('@/lib/auditoria', () => ({
  audit: vi.fn().mockResolvedValue(undefined),
}));

// Mock de face-cache - usar el módulo real pero con reset
vi.mock('@/lib/face-cache', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    refreshDescriptorsCache: vi.fn().mockImplementation(async (prisma: any) => {
      return actual.refreshDescriptorsCache(prisma);
    }),
    invalidateDescriptorsCache: vi.fn().mockImplementation(() => {
      return actual.invalidateDescriptorsCache();
    }),
  };
});

// Mock de date-utils
vi.mock('@/lib/date-utils', () => ({
  getVenezuelaDate: () => new Date('2026-01-15T10:00:00-04:00'),
  toDateOnly: (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())),
  parseTime: (timeStr: string) => {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  },
}));

// Mock de process.env
vi.stubEnv('API_KIOSCO_KEY', 'test-kiosco-key');
vi.stubEnv('NEXTAUTH_SECRET', 'test-secret');
vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/test');

beforeEach(() => {
  vi.clearAllMocks();
  __resetCacheForTesting();
});

export { mockPrisma };