// lib/jornada.ts — Horas extra de un día laborable normal (pura, testeable).
// Regla de RRHH: las extras cuentan desde la hora de referencia (fin de la
// jornada), y los minutos de llegada posteriores a la hora de entrada se
// descuentan de ellas. Nunca da negativo. Con permiso estudiantil aplicado,
// el llamador pasa la hora límite del permiso como horaEntradaMin (lo exime).
// Feriado y vacaciones no pasan por aquí: en esos días todo el tiempo
// trabajado es extra (lib/fichaje.ts).
export function extrasJornadaH(p: {
  entradaMin: number | null; // minutos desde medianoche (hora VE)
  salidaMin: number;
  horaEntradaMin: number;
  horaReferenciaMin: number;
}): number {
  const despuesDeReferencia = Math.max(0, p.salidaMin - p.horaReferenciaMin);
  const retraso = p.entradaMin == null ? 0 : Math.max(0, p.entradaMin - p.horaEntradaMin);
  return Math.max(0, despuesDeReferencia - retraso) / 60;
}
