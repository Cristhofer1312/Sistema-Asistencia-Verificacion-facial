// lib/rangos.ts — Rangos de fechas predefinidos para las vistas de consulta.
// Puro: trabaja sobre "YYYY-MM-DD" (día de Venezuela que da getHoyVE), sin zona horaria.

export type PresetRango =
  | "hoy"
  | "ayer"
  | "semana"
  | "semana_pasada"
  | "mes"
  | "mes_pasado"
  | "ultimos_30"
  | "anio";

export const PRESETS_RANGO: { id: PresetRango; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "ayer", label: "Ayer" },
  { id: "semana", label: "Esta semana" },
  { id: "semana_pasada", label: "Semana pasada" },
  { id: "mes", label: "Este mes" },
  { id: "mes_pasado", label: "Mes pasado" },
  { id: "ultimos_30", label: "Últimos 30 días" },
  { id: "anio", label: "Este año" },
];

const aFecha = (s: string) => new Date(`${s}T00:00:00Z`);
const aStr = (d: Date) => d.toISOString().slice(0, 10);
const sumarDias = (s: string, n: number) => {
  const d = aFecha(s);
  d.setUTCDate(d.getUTCDate() + n);
  return aStr(d);
};

/** Lunes de la semana de `s` (semana laboral lunes–domingo). */
function lunesDe(s: string) {
  const dow = aFecha(s).getUTCDay(); // 0 = domingo
  return sumarDias(s, dow === 0 ? -6 : 1 - dow);
}

export function calcularRango(preset: PresetRango, hoy: string): { desde: string; hasta: string } {
  const [y, m] = hoy.split("-").map(Number);
  switch (preset) {
    case "hoy":
      return { desde: hoy, hasta: hoy };
    case "ayer": {
      const ayer = sumarDias(hoy, -1);
      return { desde: ayer, hasta: ayer };
    }
    case "semana":
      return { desde: lunesDe(hoy), hasta: hoy };
    case "semana_pasada": {
      const lunes = sumarDias(lunesDe(hoy), -7);
      return { desde: lunes, hasta: sumarDias(lunes, 6) };
    }
    case "mes":
      return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
    case "mes_pasado": {
      const ini = aStr(new Date(Date.UTC(y, m - 2, 1)));
      const fin = aStr(new Date(Date.UTC(y, m - 1, 0)));
      return { desde: ini, hasta: fin };
    }
    case "ultimos_30":
      return { desde: sumarDias(hoy, -29), hasta: hoy };
    case "anio":
      return { desde: `${y}-01-01`, hasta: hoy };
  }
}

/** Preset que coincide exactamente con el rango (para resaltar el botón activo). */
export function presetActivo(desde: string, hasta: string, hoy: string): PresetRango | null {
  for (const p of PRESETS_RANGO) {
    const r = calcularRango(p.id, hoy);
    if (r.desde === desde && r.hasta === hasta) return p.id;
  }
  return null;
}

/** Días calendario entre dos fechas, ambos incluidos (0 si el rango está invertido). */
export function diasDelRango(desde: string, hasta: string): number {
  if (!desde || !hasta || desde > hasta) return 0;
  return Math.round((aFecha(hasta).getTime() - aFecha(desde).getTime()) / 86400000) + 1;
}
