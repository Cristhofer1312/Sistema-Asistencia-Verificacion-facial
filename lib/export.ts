// lib/export.ts — Exportación de reportes a CSV compatible con Excel en español.
// Excel con configuración regional de Venezuela usa ";" como separador de lista
// y necesita el BOM UTF-8 para mostrar bien tildes y eñes.

export type ColumnaCSV<T> = { titulo: string; valor: (fila: T) => string | number | null | undefined };

const SEP = ";";

function celda(v: string | number | null | undefined): string {
  if (v == null) return "";
  // Números con coma decimal, como los espera Excel en es-VE
  const s = typeof v === "number" ? String(Math.round(v * 100) / 100).replace(".", ",") : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function generarCSV<T>(columnas: ColumnaCSV<T>[], filas: T[]): string {
  const lineas = [columnas.map((c) => celda(c.titulo)).join(SEP)];
  for (const f of filas) lineas.push(columnas.map((c) => celda(c.valor(f))).join(SEP));
  return "﻿" + lineas.join("\r\n");
}

/** Nombre de archivo seguro: "asistencias_2026-10-01_a_2026-10-26.csv". */
export function nombreArchivo(base: string, desde?: string, hasta?: string): string {
  const limpio = base.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "_").toLowerCase();
  const rango = desde && hasta ? (desde === hasta ? `_${desde}` : `_${desde}_a_${hasta}`) : "";
  return `${limpio}${rango}.csv`;
}

export function descargarCSV<T>(archivo: string, columnas: ColumnaCSV<T>[], filas: T[]): void {
  const blob = new Blob([generarCSV(columnas, filas)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = archivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Horas decimales → "HH:MM" para columnas de horas extra. */
export function horasHHMM(h: number | null | undefined): string {
  if (!h || h <= 0) return "00:00";
  const min = Math.round(h * 60);
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
