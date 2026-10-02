// Fase 1 UX: mock local sin backend. Imita latencia y reglas SRS v3.2.
export const MOCK_REGLA = {
  horaLimiteEntrada: "08:00",
  horaSalidaReferencia: "17:00",
  margenTardanzaMin: 60,
};

export const MOCK_EMPLEADOS = [
  { cedula: "001", nombre: "Ana", apellido: "Pérez", gerencia: "RRHH", activo: true },
  { cedula: "002", nombre: "Luis", apellido: "Gómez", gerencia: "Ventas", activo: true },
];

export async function mockFichaje() {
  await new Promise((r) => setTimeout(r, 400));
  return { ok: true, estado: "A TIEMPO", extras: 0 };
}
