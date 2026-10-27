// instrumentation.ts — Se ejecuta una vez al arrancar el servidor Next.js.
// Todo el cálculo de horarios (fichaje, hhmm de /api/asistencias, cierre) usa
// getHours()/getDate() locales y asume que el proceso está en hora de Venezuela.
// Si el servidor corre en otra zona, todas las horas quedan desplazadas.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  process.env.TZ = "America/Caracas";
  const offset = new Date().getTimezoneOffset(); // Venezuela: UTC-4 → 240
  if (offset !== 240) {
    console.error(
      `[tz] El proceso no quedó en America/Caracas (offset ${offset} min, esperado 240). ` +
        "Las horas de entrada/salida se guardarán desplazadas: revise TZ e ICU del servidor."
    );
  }

  // Cierre diario automático (FALTA / falta justificada) al terminar cada día.
  // CIERRE_AUTOMATICO=false lo desactiva (p. ej. en desarrollo).
  if (process.env.CIERRE_AUTOMATICO !== "false") {
    const { iniciarCierreAutomatico } = await import("./lib/cierre-automatico");
    iniciarCierreAutomatico();
  }
}
