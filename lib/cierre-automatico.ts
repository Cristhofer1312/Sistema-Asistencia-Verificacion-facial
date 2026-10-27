// lib/cierre-automatico.ts — Cierre diario automático al terminar el día (hora VE).
// Lo arranca instrumentation.ts. Cada INTERVALO_MS revisa los últimos
// DIAS_RECUPERAR días ya terminados y los cierra con marcarFaltantes, que es
// idempotente (nunca toca filas existentes): repetirlo no duplica nada y
// recupera los días perdidos si el servidor estuvo apagado. Los días ya
// cerrados en este proceso no se vuelven a consultar.
import { prisma } from "./prisma";
import { audit } from "./auditoria";
import { marcarFaltantes } from "./auto-marcado";

const INTERVALO_MS = 15 * 60 * 1000;
const DIAS_RECUPERAR = 7;

type ResultadoCierre = Awaited<ReturnType<typeof marcarFaltantes>>;

export function describirCierre(res: ResultadoCierre): string {
  return `${res.faltas} falta(s), ${res.faltasJustificadas} falta(s) justificada(s), ${res.feriados} feriado(s), ${res.vacaciones} vacación(es), ${res.reposos} reposo(s), ${res.omitidos} omitido(s)`;
}

const g = globalThis as unknown as { __cierreAutomatico?: { timer: NodeJS.Timeout; cerrados: Set<string>; corriendo: boolean } };

export async function cerrarDiasPendientes(ahora = new Date()): Promise<void> {
  const estado = g.__cierreAutomatico;
  if (!estado || estado.corriendo) return;
  estado.corriendo = true;
  try {
    const hoyVE = ahora.toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
    for (let i = DIAS_RECUPERAR; i >= 1; i--) {
      const dia = new Date(`${hoyVE}T00:00:00Z`);
      dia.setUTCDate(dia.getUTCDate() - i);
      const clave = dia.toISOString().slice(0, 10);
      if (estado.cerrados.has(clave)) continue;

      const res = await marcarFaltantes(prisma, { fecha: dia, ahora });
      const marcados = res.faltas + res.faltasJustificadas + res.feriados + res.vacaciones + res.reposos;
      if (marcados > 0) {
        await audit("FALTA_PROYECTADA", `Cierre automático ${res.fecha}: ${describirCierre(res)}`);
      }
      estado.cerrados.add(clave);
    }
  } finally {
    estado.corriendo = false;
  }
}

export function iniciarCierreAutomatico(): void {
  if (g.__cierreAutomatico) return; // evita doble registro (hot-reload en desarrollo)
  const tick = () => cerrarDiasPendientes().catch((e) => console.error("[cierre-automatico] falló:", e));
  g.__cierreAutomatico = { timer: setInterval(tick, INTERVALO_MS), cerrados: new Set(), corriendo: false };
  void tick();
}
