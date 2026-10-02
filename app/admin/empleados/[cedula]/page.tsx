import { ASISTENCIAS, badgeClass, nombreCompleto, EMPLEADOS } from "@/lib/mock-api";

export default async function Historial({ params }: { params: Promise<{ cedula: string }> }) {
  const { cedula: rawCedula } = await params;
  const cedula = decodeURIComponent(rawCedula);
  const filas = ASISTENCIAS.filter((f) => f.cedula === cedula);
  const emp = EMPLEADOS.find((e) => e.cedula === cedula);

  const tardes = filas.filter(f => f.estadoEntrada === "TARDE").length;
  const faltas = filas.filter(f => f.estadoEntrada === "FALTA").length;
  const justs  = filas.filter(f => f.estadoEntrada === "JUSTIFICADO").length;
  const extras = Math.round(filas.reduce((a, f) => a + f.extras, 0) * 100) / 100;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div className="breadcrumb" style={{ marginBottom: 10 }}>
          <a href="/admin/empleados">Empleados</a>
          <span>/</span>
          <span style={{ color: "var(--ink-2)" }}>{nombreCompleto(cedula)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 50, height: 50, borderRadius: 14, background: "var(--brand-l)", color: "var(--brand)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "1.1rem", flexShrink: 0 }}>
            {emp ? `${emp.nombre[0]}${emp.apellido[0]}` : "??"}
          </div>
          <div>
            <h2 style={{ marginBottom: 3 }}>{nombreCompleto(cedula)}</h2>
            <p className="muted">
              <span className="mono">{cedula}</span>
              {emp && <> · {emp.cargo} · {emp.gerencia}</>}
              {emp && (
                <span className={"badge " + (emp.activo ? "b-tiempo" : "b-inactive")} style={{ marginLeft: 8, fontSize: ".68rem" }}>
                  {emp.activo ? "Activo" : "Inactivo"}
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Totals + filter row */}
      <div className="row" style={{ marginBottom: 20, gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="form-group" style={{ flex: "1 1 140px" }}>
          <label>Desde</label>
          <input type="date" defaultValue="2026-10-01" />
        </div>
        <div className="form-group" style={{ flex: "1 1 140px" }}>
          <label>Hasta</label>
          <input type="date" defaultValue="2026-10-02" />
        </div>

        <div style={{ flex: "2 1 auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            { label: "Tardanzas", val: tardes, cls: "b-tarde" },
            { label: "Faltas",    val: faltas, cls: "b-falta" },
            { label: "Justific.", val: justs,  cls: "b-just" },
            { label: "Extras",    val: `${extras}h`, cls: "b-comp" },
          ].map(s => (
            <div key={s.label} style={{ textAlign: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "8px 16px", minWidth: 80 }}>
              <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--ink)" }}>{s.val}</div>
              <div style={{ fontSize: ".72rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="table-wrap" style={{ border: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Entrada</th>
                <th>Salida</th>
                <th>Estado entrada</th>
                <th>Estado salida</th>
                <th>Extras</th>
                <th>Autorizador</th>
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state" style={{ padding: "32px 0" }}>
                      <div className="empty-icon">📋</div>
                      <h4>Sin registros en el rango</h4>
                      <p>Ajuste las fechas para ver el histórico completo.</p>
                    </div>
                  </td>
                </tr>
              )}
              {filas.map((f, i) => (
                <tr key={i}>
                  <td className="mono" style={{ fontWeight: 600 }}>{f.fecha}</td>
                  <td className="mono">{f.entrada ?? <span className="muted">—</span>}</td>
                  <td className="mono">{f.salida  ?? <span className="muted">—</span>}</td>
                  <td><span className={badgeClass(f.estadoEntrada)}>{f.estadoEntrada}</span></td>
                  <td>{f.estadoSalida ? <span className={badgeClass(f.estadoSalida)}>{f.estadoSalida}</span> : <span className="muted">—</span>}</td>
                  <td>{f.extras > 0 ? <span style={{ color: "var(--ok)", fontWeight: 600 }}>+{f.extras}h</span> : <span className="muted">—</span>}</td>
                  <td className="muted">{f.autorizador ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <a href="/admin/empleados" className="btn btn-ghost btn-sm">← Volver a empleados</a>
      </div>
    </div>
  );
}
