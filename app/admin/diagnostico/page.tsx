"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { nombreCompleto } from "@/lib/types";

type Reporte = Awaited<ReturnType<typeof api.diagnostico.colisiones>>;

// Umbral de revisión: más amplio que el de match para ver también los pares "en riesgo"
const UMBRAL_DEFECTO = 0.6;

export default function DiagnosticoPage() {
  const [umbral, setUmbral] = useState(String(UMBRAL_DEFECTO));
  const [reporte, setReporte] = useState<Reporte | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analizar(u = umbral) {
    setCargando(true);
    setError(null);
    try {
      setReporte(await api.diagnostico.colisiones(Number(u)));
    } catch (e: any) {
      setError(e.data?.error || e.message || "Error analizando firmas");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { analizar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const criticas = reporte?.colisiones.filter(c => c.bajoUmbralMatch).length ?? 0;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ marginBottom: 4 }}>Diagnóstico facial</h2>
        <p className="muted">Pares de empleados enrolados con firmas faciales demasiado parecidas (riesgo de confusión en el kiosco)</p>
      </div>

      <div className="card">
        <form
          onSubmit={e => { e.preventDefault(); analizar(); }}
          style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}
        >
          <div className="form-group" style={{ flex: "0 1 200px" }}>
            <label htmlFor="diag-umbral">Distancia máxima a revisar</label>
            <input id="diag-umbral" type="number" step="0.01" min="0.05" max="1.5" value={umbral} onChange={e => setUmbral(e.target.value)} />
          </div>
          <div className="form-group">
            <button type="submit" className="btn btn-primary" disabled={cargando}>
              {cargando ? "Analizando…" : "Analizar"}
            </button>
          </div>
          {reporte && (
            <span className="muted" style={{ marginLeft: "auto", fontSize: ".8rem" }}>
              {reporte.enrolados} enrolados · {reporte.paresRevisados} pares revisados · umbral del kiosco {reporte.umbralMatch}
            </span>
          )}
        </form>
        {error && <div className="alert alert-warn" style={{ marginTop: 14 }}><span></span><span>{error}</span></div>}
      </div>

      {reporte && (
        <>
          <div className="grid3" style={{ marginTop: 20 }}>
            <div className="stat-card">
              <div className="stat-val" style={{ color: "var(--brand)" }}>{reporte.enrolados}</div>
              <div className="stat-label">Empleados enrolados</div>
            </div>
            <div className="stat-card">
              <div className="stat-val" style={{ color: criticas > 0 ? "var(--bad)" : "var(--ok)" }}>{criticas}</div>
              <div className="stat-label">Colisiones críticas</div>
            </div>
            <div className="stat-card">
              <div className="stat-val" style={{ color: "var(--warn)" }}>{reporte.colisiones.length - criticas}</div>
              <div className="stat-label">Pares en riesgo</div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 20, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ margin: 0 }}>Pares bajo {reporte.umbral}</h3>
              <span className="chip">{reporte.colisiones.length} par(es)</span>
            </div>
            <div className="table-wrap" style={{ border: "none" }}>
              <table>
                <thead>
                  <tr>
                    <th>Empleado A</th>
                    <th>Empleado B</th>
                    <th>Distancia</th>
                    <th>Riesgo</th>
                  </tr>
                </thead>
                <tbody>
                  {reporte.colisiones.length === 0 ? (
                    <tr>
                      <td colSpan={4}>
                        <div className="empty-state" style={{ padding: "32px 0" }}>
                          <h4>Sin pares parecidos</h4>
                          <p>Ninguna pareja de firmas está por debajo de {reporte.umbral}.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    reporte.colisiones.map(c => (
                      <tr key={`${c.a.id}-${c.b.id}`}>
                        {[c.a, c.b].map(e => (
                          <td key={e.id}>
                            <a href={`/admin/empleados/${e.cedula}`} style={{ fontWeight: 600 }}>{nombreCompleto(e)}</a>
                            <div className="muted mono" style={{ fontSize: ".75rem" }}>{e.cedula}</div>
                          </td>
                        ))}
                        <td className="mono" style={{ fontWeight: 700 }}>{c.distancia.toFixed(4)}</td>
                        <td>
                          {c.bajoUmbralMatch
                            ? <span className="badge b-falta">Crítico · se pueden confundir</span>
                            : <span className="badge b-tarde">En riesgo</span>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="alert alert-info" style={{ marginTop: 16 }}>
            <span></span>
            <span>
              Para corregir un par crítico, abra el perfil de cada empleado y use <b>Re-capturar biometría</b> con
              luz frontal abundante. Mientras más baja la distancia, más parecidas son las firmas.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
