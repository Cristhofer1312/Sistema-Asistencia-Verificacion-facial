import { describe, it, expect } from "vitest";
import { generarCSV, nombreArchivo, horasHHMM } from "./export";

describe("generarCSV", () => {
  const cols = [
    { titulo: "Nombre", valor: (f: { n: string; h: number | null }) => f.n },
    { titulo: "Horas", valor: (f: { n: string; h: number | null }) => f.h },
  ];

  it("lleva BOM, separador ; y coma decimal", () => {
    const csv = generarCSV(cols, [{ n: "Ana", h: 1.5 }]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).split("\r\n")).toEqual(["Nombre;Horas", "Ana;1,5"]);
  });

  it("escapa comillas, separadores y saltos de línea; null queda vacío", () => {
    const csv = generarCSV(cols, [{ n: 'Pérez; "El Toro"\nII', h: null }]);
    expect(csv.split("\r\n")[1]).toBe('"Pérez; ""El Toro""\nII";');
  });
});

describe("nombreArchivo / horasHHMM", () => {
  it("normaliza el nombre y agrega el rango", () => {
    expect(nombreArchivo("Consulta resumen", "2026-10-01", "2026-10-26")).toBe("consulta_resumen_2026-10-01_a_2026-10-26.csv");
    expect(nombreArchivo("Auditoría", "2026-10-26", "2026-10-26")).toBe("auditoria_2026-10-26.csv");
    expect(nombreArchivo("Empleados")).toBe("empleados.csv");
  });

  it("formatea horas decimales", () => {
    expect(horasHHMM(1.75)).toBe("01:45");
    expect(horasHHMM(0)).toBe("00:00");
    expect(horasHHMM(null)).toBe("00:00");
  });
});
