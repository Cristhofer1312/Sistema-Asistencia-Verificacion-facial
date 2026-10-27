"use client";
// components/ui/Reporte.tsx — Piezas comunes de las vistas de consulta:
// rango de fechas con períodos predefinidos, exportar/imprimir, orden de columnas,
// paginación y encabezado que solo aparece al imprimir.
import { useMemo, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { PRESETS_RANGO, calcularRango, presetActivo, type PresetRango } from "@/lib/rangos";
import { getHoyVE } from "@/lib/types";
import { Select } from "@/components/ui/Select";

// ── Rango de fechas ─────────────────────────────────────────
export function RangoFechas({
  desde,
  hasta,
  onChange,
  presets,
  idPrefix = "rango",
  permitirTodo = false,
}: {
  desde: string;
  hasta: string;
  onChange: (r: { desde: string; hasta: string }) => void;
  presets?: PresetRango[];
  idPrefix?: string;
  /** Agrega "Todo el historial" (desde/hasta vacíos) */
  permitirTodo?: boolean;
}) {
  const hoy = getHoyVE();
  const opciones = presets ? PRESETS_RANGO.filter((p) => presets.includes(p.id)) : PRESETS_RANGO;
  const activo = desde && hasta ? presetActivo(desde, hasta, hoy) : null;

  return (
    <>
      <div className="form-group" style={{ flex: "1 1 150px" }}>
        <label htmlFor={`${idPrefix}-periodo`}>Período</label>
        <Select
          id={`${idPrefix}-periodo`}
          value={activo ?? (desde || hasta ? "personalizado" : "todo")}
          onChange={(e) => {
            const v = String(e.target.value);
            if (v === "todo") onChange({ desde: "", hasta: "" });
            else if (v !== "personalizado") onChange(calcularRango(v as PresetRango, hoy));
          }}
        >
          {permitirTodo ? <option value="todo">Todo el historial</option> : null}
          {opciones.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          <option value="personalizado">Personalizado</option>
        </Select>
      </div>
      <div className="form-group" style={{ flex: "1 1 135px" }}>
        <label htmlFor={`${idPrefix}-desde`}>Desde</label>
        <input id={`${idPrefix}-desde`} type="date" value={desde} max={hasta || undefined} onChange={(e) => onChange({ desde: e.target.value, hasta })} />
      </div>
      <div className="form-group" style={{ flex: "1 1 135px" }}>
        <label htmlFor={`${idPrefix}-hasta`}>Hasta</label>
        <input id={`${idPrefix}-hasta`} type="date" value={hasta} min={desde || undefined} onChange={(e) => onChange({ desde, hasta: e.target.value })} />
      </div>
    </>
  );
}

// ── Exportar / imprimir ─────────────────────────────────────
export function AccionesReporte({ onExportar, exportando, deshabilitado, children }: {
  onExportar?: () => void;
  exportando?: boolean;
  deshabilitado?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="page-actions no-print">
      {children}
      {onExportar && (
        <button type="button" className="btn btn-sm" onClick={onExportar} disabled={deshabilitado || exportando} title="Descarga un archivo CSV que abre en Excel">
          {exportando ? "Exportando…" : "Exportar Excel"}
        </button>
      )}
      <button type="button" className="btn btn-sm" onClick={() => window.print()} title="Imprimir o guardar como PDF">
        Imprimir / PDF
      </button>
    </div>
  );
}

// ── Encabezado de impresión ─────────────────────────────────
export function EncabezadoImpresion({ titulo, detalle }: { titulo: string; detalle?: string }) {
  const { data: session } = useSession();
  const usuario = (session?.user as { username?: string } | undefined)?.username;
  const generado = new Date().toLocaleString("es-VE", { timeZone: "America/Caracas", dateStyle: "long", timeStyle: "short" });
  return (
    <div className="print-only" style={{ borderBottom: "2px solid #0f172a", paddingBottom: 8, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "#64748b" }}>AsistenciaFace · Recursos Humanos</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{titulo}</div>
          {detalle && <div style={{ fontSize: 11, color: "#334155" }}>{detalle}</div>}
        </div>
        <div style={{ fontSize: 10, color: "#64748b", textAlign: "right" }}>
          Generado: {generado}
          {usuario && <><br />Por: {usuario}</>}
        </div>
      </div>
    </div>
  );
}

// ── Orden de columnas ───────────────────────────────────────
export type Dir = "asc" | "desc";
type Valor = string | number | null | undefined;

export function useOrden<T, A extends Record<string, (f: T) => Valor>>(
  filas: T[],
  accesores: A,
  inicial: { clave: keyof A & string; dir: Dir }
) {
  type K = keyof A & string;
  const [orden, setOrden] = useState<{ clave: K; dir: Dir }>(inicial);
  const ordenadas = useMemo(() => {
    const get = accesores[orden.clave];
    const mult = orden.dir === "asc" ? 1 : -1;
    return [...filas].sort((a, b) => {
      const va = get(a), vb = get(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1; // vacíos siempre al final
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * mult;
      return String(va).localeCompare(String(vb), "es", { numeric: true }) * mult;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, orden]);

  // Memorizado por orden: una identidad nueva en cada render haría que React
  // desmonte y vuelva a montar todos los encabezados.
  const Th = useMemo(() => function Th({ k, children, num, title }: { k: K; children: ReactNode; num?: boolean; title?: string }) {
    const activo = orden.clave === k;
    return (
      <th
        className={`th-orden${num ? " num" : ""}`}
        title={title}
        aria-sort={activo ? (orden.dir === "asc" ? "ascending" : "descending") : "none"}
        // Primer clic: texto A→Z, números de mayor a menor; los siguientes alternan
        onClick={() => setOrden(o => ({ clave: k, dir: o.clave === k ? (o.dir === "desc" ? "asc" : "desc") : num ? "desc" : "asc" }))}
      >
        {children}<span className="flecha">{activo ? (orden.dir === "asc" ? "▲" : "▼") : ""}</span>
      </th>
    );
  }, [orden]);

  return { ordenadas, Th, orden };
}

// ── Paginación ──────────────────────────────────────────────
export function Paginacion({ page, pageSize, total, onPage, onPageSize, tamanos = [25, 50, 100, 200] }: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize?: (s: number) => void;
  tamanos?: number[];
}) {
  const paginas = Math.max(1, Math.ceil(total / pageSize));
  const ini = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const fin = Math.min(total, page * pageSize);
  return (
    <div className="paginacion">
      <span>{total === 0 ? "Sin registros" : `Mostrando ${ini.toLocaleString("es-VE")}–${fin.toLocaleString("es-VE")} de ${total.toLocaleString("es-VE")}`}</span>
      <div className="pag-ctrl">
        {onPageSize && (
          <select aria-label="Filas por página" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
            {tamanos.map((t) => <option key={t} value={t}>{t} por página</option>)}
          </select>
        )}
        <button type="button" className="btn btn-sm btn-ghost" disabled={page <= 1} onClick={() => onPage(1)} aria-label="Primera página">«</button>
        <button type="button" className="btn btn-sm btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</button>
        <span style={{ fontWeight: 600, color: "var(--ink-2)" }}>{page} / {paginas}</span>
        <button type="button" className="btn btn-sm btn-ghost" disabled={page >= paginas} onClick={() => onPage(page + 1)}>Siguiente</button>
        <button type="button" className="btn btn-sm btn-ghost" disabled={page >= paginas} onClick={() => onPage(paginas)} aria-label="Última página">»</button>
      </div>
    </div>
  );
}

/** Corta una lista ya filtrada/ordenada para la página actual. */
export function paginar<T>(filas: T[], page: number, pageSize: number): T[] {
  return filas.slice((page - 1) * pageSize, page * pageSize);
}

// ── Tarjetas KPI compactas ──────────────────────────────────
export function KpiStrip({ items }: { items: { label: string; val: ReactNode; color?: string; title?: string }[] }) {
  return (
    <div className="kpi-strip">
      {items.map((k) => (
        <div key={k.label} className="kpi" title={k.title}>
          <div className="kpi-val" style={k.color ? { color: k.color } : undefined}>{k.val}</div>
          <div className="kpi-label">{k.label}</div>
        </div>
      ))}
    </div>
  );
}
