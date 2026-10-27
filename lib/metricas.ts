// lib/metricas.ts — Clasificación ÚNICA de asistencias para todas las vistas de RRHH.
// Cada fila cae en una sola categoría, así no hay dobles conteos: una tardanza
// justificada no suma como tardanza, ni una falta justificada como falta.
// Llegar antes de la hora de entrada (TEMPRANO) cuenta como puntual.

export type Clase =
  | "PUNTUAL"
  | "TARDE"
  | "TARDE_JUSTIFICADA"
  | "FALTA"
  | "FALTA_JUSTIFICADA"
  | "FERIADO"
  | "VACACIONES"
  | "REPOSO_MEDICO";

export const CLASES: { id: Clase; label: string; badge: string }[] = [
  { id: "PUNTUAL", label: "Puntual", badge: "b-tiempo" },
  { id: "TARDE", label: "Tarde", badge: "b-tarde" },
  { id: "TARDE_JUSTIFICADA", label: "Tarde justificada", badge: "b-just" },
  { id: "FALTA", label: "Falta", badge: "b-falta" },
  { id: "FALTA_JUSTIFICADA", label: "Falta justificada", badge: "b-just" },
  { id: "FERIADO", label: "Feriado", badge: "b-fer" },
  { id: "VACACIONES", label: "Vacaciones", badge: "b-vac" },
  { id: "REPOSO_MEDICO", label: "Reposo médico", badge: "b-rep" },
];

/**
 * % de asistencia sobre días exigibles: (puntuales + tardes, justificadas o no)
 * / (todo menos feriados, vacaciones y reposos). null si no hubo días exigibles.
 */
export function porcentajeAsistencia(r: ResumenAsistencias): number | null {
  const exigibles = r.puntuales + r.tardes + r.tardesJustificadas + r.faltas + r.faltasJustificadas;
  if (exigibles === 0) return null;
  return Math.round(((r.puntuales + r.tardes + r.tardesJustificadas) / exigibles) * 100);
}

export interface FilaMetrica {
  estadoEntrada: string;
  estadoOriginal?: string | null;
  entrada?: unknown; // "HH:MM" | Date | null
  estadoSalida?: string | null;
  extrasH?: number | null;
}

export function claseAsistencia(f: FilaMetrica): Clase {
  switch (f.estadoEntrada) {
    case "A_TIEMPO":
    case "TEMPRANO":
      return "PUNTUAL";
    case "TARDE":
      return "TARDE";
    case "FALTA":
      return "FALTA";
    case "JUSTIFICADO":
      if (f.estadoOriginal === "TARDE") return "TARDE_JUSTIFICADA";
      if (f.estadoOriginal === "FALTA") return "FALTA_JUSTIFICADA";
      // Registros antiguos sin estado original: con entrada fue tardanza, sin entrada ausencia.
      return f.entrada ? "TARDE_JUSTIFICADA" : "FALTA_JUSTIFICADA";
    case "FERIADO":
      return "FERIADO";
    case "VACACIONES":
      return "VACACIONES";
    default:
      return "REPOSO_MEDICO";
  }
}

export interface ResumenAsistencias {
  presentes: number; // filas con entrada registrada
  puntuales: number;
  tardes: number;
  tardesJustificadas: number;
  faltas: number;
  faltasJustificadas: number;
  feriados: number;
  vacaciones: number;
  reposos: number;
  salidasAnticipadas: number; // solo se marca, no descuenta
  extrasH: number;
}

const CAMPO: Record<Clase, keyof ResumenAsistencias> = {
  PUNTUAL: "puntuales",
  TARDE: "tardes",
  TARDE_JUSTIFICADA: "tardesJustificadas",
  FALTA: "faltas",
  FALTA_JUSTIFICADA: "faltasJustificadas",
  FERIADO: "feriados",
  VACACIONES: "vacaciones",
  REPOSO_MEDICO: "reposos",
};

export function resumenAsistencias(filas: FilaMetrica[]): ResumenAsistencias {
  const r: ResumenAsistencias = {
    presentes: 0, puntuales: 0, tardes: 0, tardesJustificadas: 0, faltas: 0, faltasJustificadas: 0,
    feriados: 0, vacaciones: 0, reposos: 0, salidasAnticipadas: 0, extrasH: 0,
  };
  for (const f of filas) {
    r[CAMPO[claseAsistencia(f)]]++;
    if (f.entrada) r.presentes++;
    if (f.estadoSalida === "TEMPRANO") r.salidasAnticipadas++;
    r.extrasH += f.extrasH || 0;
  }
  return r;
}
