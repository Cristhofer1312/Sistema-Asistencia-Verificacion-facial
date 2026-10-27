import { describe, it, expect } from "vitest";
import { calcularRango, presetActivo, diasDelRango } from "./rangos";

// 2026-10-28 es miércoles
const HOY = "2026-10-28";

describe("calcularRango", () => {
  it("hoy y ayer", () => {
    expect(calcularRango("hoy", HOY)).toEqual({ desde: HOY, hasta: HOY });
    expect(calcularRango("ayer", HOY)).toEqual({ desde: "2026-10-27", hasta: "2026-10-27" });
  });

  it("semana empieza el lunes; la pasada es lunes a domingo", () => {
    expect(calcularRango("semana", HOY)).toEqual({ desde: "2026-10-26", hasta: HOY });
    expect(calcularRango("semana_pasada", HOY)).toEqual({ desde: "2026-10-19", hasta: "2026-10-25" });
  });

  it("domingo pertenece a la semana que empezó el lunes anterior", () => {
    expect(calcularRango("semana", "2026-11-01")).toEqual({ desde: "2026-10-26", hasta: "2026-11-01" });
  });

  it("mes actual, mes pasado (incluye cambio de año) y año", () => {
    expect(calcularRango("mes", HOY)).toEqual({ desde: "2026-10-01", hasta: HOY });
    expect(calcularRango("mes_pasado", HOY)).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(calcularRango("mes_pasado", "2026-01-15")).toEqual({ desde: "2025-12-01", hasta: "2025-12-31" });
    expect(calcularRango("mes_pasado", "2028-03-10")).toEqual({ desde: "2028-02-01", hasta: "2028-02-29" });
    expect(calcularRango("anio", HOY)).toEqual({ desde: "2026-01-01", hasta: HOY });
  });

  it("últimos 30 días incluye hoy", () => {
    const r = calcularRango("ultimos_30", HOY);
    expect(diasDelRango(r.desde, r.hasta)).toBe(30);
  });
});

describe("presetActivo / diasDelRango", () => {
  it("reconoce el preset del rango", () => {
    expect(presetActivo("2026-10-01", HOY, HOY)).toBe("mes");
    expect(presetActivo("2026-10-02", HOY, HOY)).toBeNull();
  });

  it("cuenta días incluidos y 0 para rangos inválidos", () => {
    expect(diasDelRango("2026-10-01", "2026-10-01")).toBe(1);
    expect(diasDelRango("2026-10-02", "2026-10-01")).toBe(0);
    expect(diasDelRango("", "2026-10-01")).toBe(0);
  });
});
