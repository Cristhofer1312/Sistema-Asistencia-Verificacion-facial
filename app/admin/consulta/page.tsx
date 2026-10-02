"use client";
import { useMemo, useState } from "react";
import { ASISTENCIAS, EMPLEADOS, badgeClass, nombreCompleto } from "@/lib/mock-api";

const ESTADOS = ["A TIEMPO", "TARDE", "FALTA", "JUSTIFICADO", "FERIADO", "VACACIONES", "TEMPRANO", "COMPLETADO"];

function estadoDe(f: (typeof ASISTENCIAS)[number]) {
  return [f.estadoEntrada, f.estadoSalida].filter(Boolean) as string[];
}

export default function Consulta() {
  const [q, setQ] = useState("");
  const [desde, setDesde] = useState("2026-10-01");
  const [hasta, setHasta] = useState("2026-10-03");
  const [gerencia, setGerencia] = useState("Todas");
  const [estados, setEstados] = useState<string[]>([]);
  const [soloExtras, setSoloExtras] = useState(false);
  const [soloAnticipadas, setSoloAnticipadas] = useState(false);
  const [soloSinSalida, setSoloSinSalida] = useState(false);
  const [orden, setOrden] = useState<"nombre" | "tardes" | "extras" | "faltas">("nombre");
  const [expandida, setExpandida] = useState<string | null>(null);
  const [ficha, setFicha] = useState<string | null>(null);
  const [just, setJust] = useState<{ cedula: string; fecha: string } | null>(null);
  const [pase, setPase] = useState<string | null>(null);

  function preset(dias: number) {
    const fin = "2026-10-03";
    const ini = dias === 1 ? "2026-10-03" : dias === 2 ? "2026-10-02" : "2026-10-01";
    setDesde(ini); setHasta(fin);
  }

  function toggleEstado(e: string) {
    setEstados((s) => (s.includes(e) ? s.filter((x) => x !== e) : [...s, e]));
  }

  function limpiar() {
    setQ(""); setEstados([]); setSoloExtras(false); setSoloAnticipadas(false);
    setSoloSinSalida(false); setGerencia("Todas");
  }

  const grupos = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const emps = EMPLEADOS.filter((e) => {
      if (gerencia !== "Todas" && e.gerencia !== gerencia) return false;
      if (ql && !`${e.nombre} ${e.apellido} ${e.cedula} ${e.cargo}`.toLowerCase().includes(ql)) return false;
      return true;
    });
    return emps
      .map((e) => {
        let filas = ASISTENCIAS.filter((f) => f.cedula === e.cedula && f.fecha >= desde && f.fecha <= hasta);
        if (estados.length) filas = filas.filter((f) => estadoDe(f).some((x) => estados.includes(x)));
        if (soloExtras) filas = filas.filter((f) => f.extras > 0);
        if (soloAnticipadas) filas = filas.filter((f) => f.estadoSalida === "TEMPRANO");
        if (soloSinSalida) filas = filas.filter((f) => f.entrada && !f.salida);
        const tardes = filas.filter((f) => f.estadoEntrada === "TARDE").length;
        const faltas = filas.filter((f) => f.estadoEntrada === "FALTA").length;
        const justs = filas.filter((f) => f.estadoEntrada === "JUSTIFICADO").length;
        const extras = Math.round(filas.reduce((a, f) => a + f.extras, 0) * 100) / 100;
        return { e, filas, tardes, faltas, justs, extras };
      })
      .filter((g) => g.filas.length > 0)
      .sort((a, b) => {
        if (orden === "tardes") return b.tardes - a.tardes;
        if (orden === "extras") return b.extras - a.extras;
        if (orden === "faltas") return b.faltas - a.faltas;
        return `${a.e.nombre}`.localeCompare(b.e.nombre);
      });
  }, [q, desde, hasta, gerencia, estados, soloExtras, soloAnticipadas, soloSinSalida, orden]);

  const totalReg = grupos.reduce((a, g) => a + g.filas.length, 0);
  const gerencias = ["Todas", ...Array.from(new Set(EMPLEADOS.map((e) => e.gerencia)))];
  const fichaEmp = ficha ? EMPLEADOS.find((x) => x.cedula === ficha) : null;

  return (
    <div>
      {/* Page header */}
      <div className="row-between" style={{ marginBottom: 20 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Consulta flexible ★</h2>
          <p className="muted">Vista única agrupada por empleado · filtros en tiempo real</p>
        </div>
        <span style={{ background: "var(--brand-l)", color: "var(--brand)", border: "1.5px solid var(--brand-mid)", borderRadius: "var(--r-full)", padding: "4px 14px", fontSize: ".8rem", fontWeight: 700 }}>
          {grupos.length} empleados · {totalReg} registros
        </span>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        {/* Row 1: search + dates + gerencia + orden */}
        <div className="filter-row">
          <div className="form-group" style={{ flex: "2 1 200px" }}>
            <label htmlFor="q-buscar">🔍 Buscador</label>
            <input id="q-buscar" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, cédula, cargo…" />
          </div>
          <div className="form-group" style={{ flex: "1 1 140px" }}>
            <label>Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: "1 1 140px" }}>
            <label>Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: "1 1 130px" }}>
            <label>Gerencia</label>
            <select value={gerencia} onChange={(e) => setGerencia(e.target.value)}>
              {gerencias.map((g) => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: "1 1 130px" }}>
            <label>Ordenar por</label>
            <select value={orden} onChange={(e) => setOrden(e.target.value as typeof orden)}>
              <option value="nombre">Nombre</option>
              <option value="tardes">Tardes</option>
              <option value="faltas">Faltas</option>
              <option value="extras">Extras</option>
            </select>
          </div>
        </div>

        {/* Row 2: presets + estados + switches */}
        <div className="filter-row">
          <div className="row" style={{ flex: "0 0 auto", gap: 6 }}>
            <button className="preset-btn" onClick={() => preset(1)}>Hoy</button>
            <button className="preset-btn" onClick={() => preset(2)}>Ayer–Hoy</button>
            <button className="preset-btn" onClick={() => preset(7)}>Semana</button>
            <button className="btn btn-sm btn-ghost" onClick={limpiar}>✕ Limpiar</button>
          </div>

          <div className="row" style={{ flex: "1 1 auto", gap: 6, flexWrap: "wrap" }}>
            {ESTADOS.map((s) => (
              <label key={s} className={"pill-check" + (estados.includes(s) ? " checked" : "")}>
                <input type="checkbox" style={{ width: "auto" }} checked={estados.includes(s)} onChange={() => toggleEstado(s)} />
                {s}
              </label>
            ))}
          </div>

          <div className="row" style={{ gap: 16, flex: "0 0 auto" }}>
            <label className="switch-wrap" htmlFor="sw-extras">
              <input id="sw-extras" type="checkbox" checked={soloExtras} onChange={e => setSoloExtras(e.target.checked)} />
              <div className="switch-track" />
              <span className="switch-label">Solo extras</span>
            </label>
            <label className="switch-wrap" htmlFor="sw-antic">
              <input id="sw-antic" type="checkbox" checked={soloAnticipadas} onChange={e => setSoloAnticipadas(e.target.checked)} />
              <div className="switch-track" />
              <span className="switch-label">S. anticipada</span>
            </label>
            <label className="switch-wrap" htmlFor="sw-sin">
              <input id="sw-sin" type="checkbox" checked={soloSinSalida} onChange={e => setSoloSinSalida(e.target.checked)} />
              <div className="switch-track" />
              <span className="switch-label">Sin salida</span>
            </label>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {grupos.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <h4>Sin resultados</h4>
            <p>Amplía el rango de fechas o limpia los filtros de estado.<br />Los empleados inactivos no generan FALTA.</p>
          </div>
        </div>
      )}

      {/* Employee accordion cards */}
      {grupos.map(({ e, filas, tardes, faltas, justs, extras }) => (
        <div className="card card-hover" key={e.cedula} style={{ marginBottom: 10 }}>
          <div className="accordion-header" onClick={() => setExpandida(expandida === e.cedula ? null : e.cedula)}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: "var(--r-md)", background: "var(--brand-l)", color: "var(--brand)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: ".9rem", flexShrink: 0 }}>
                {e.nombre[0]}{e.apellido[0]}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: ".9375rem", color: "var(--ink)" }}>{e.nombre} {e.apellido}</div>
                <div className="muted" style={{ fontSize: ".78rem" }}>{e.cargo} · {e.gerencia} · <span className="mono">{e.cedula}</span></div>
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <span className="badge b-tarde">{tardes} tarde{tardes !== 1 ? "s" : ""}</span>
              <span className="badge b-falta">{faltas} falta{faltas !== 1 ? "s" : ""}</span>
              <span className="badge b-just">{justs} justif.</span>
              <span className="badge b-comp">{extras}h extra</span>
              <button className="btn btn-sm" style={{ marginLeft: 4 }}
                onClick={(ev) => { ev.stopPropagation(); setFicha(ficha === e.cedula ? null : e.cedula); }}>
                {ficha === e.cedula ? "Cerrar ficha" : "Ver ficha"}
              </button>
              <span className={"accordion-arrow" + (expandida === e.cedula ? " open" : "")}>▶</span>
            </div>
          </div>

          {expandida === e.cedula && (
            <div className="accordion-body">
              <hr className="divider" style={{ marginTop: 0 }} />
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Entrada / Salida</th>
                      <th>Estado</th>
                      <th>Extras</th>
                      <th>Autorizador</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f, i) => (
                      <tr key={i}>
                        <td className="mono" style={{ fontWeight: 600 }}>{f.fecha}</td>
                        <td className="mono">{f.entrada ?? "—"} / {f.salida ?? "—"}</td>
                        <td>
                          <span className={badgeClass(f.estadoEntrada)}>{f.estadoEntrada}</span>{" "}
                          {f.estadoSalida && <span className={badgeClass(f.estadoSalida)}>{f.estadoSalida}</span>}
                        </td>
                        <td>{f.extras > 0 ? <span style={{ color: "var(--ok)", fontWeight: 600 }}>+{f.extras}h</span> : <span className="muted">—</span>}</td>
                        <td className="muted">{f.autorizador ?? "—"}</td>
                        <td>
                          {(f.estadoEntrada === "TARDE" || f.estadoEntrada === "FALTA") && (
                            <div className="row" style={{ gap: 6 }}>
                              <button className="btn btn-sm btn-warn-outline" onClick={() => setJust({ cedula: f.cedula, fecha: f.fecha })}>
                                📎 Justificar
                              </button>
                              <button className="btn btn-sm" onClick={() => setPase(f.cedula)}>
                                🔑 Pase previo
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Ficha lateral */}
      {fichaEmp && (
        <div className="panel-lateral">
          <div className="modal-header">
            <div>
              <div className="modal-title">📋 Ficha — {fichaEmp.nombre} {fichaEmp.apellido}</div>
              <div className="muted" style={{ marginTop: 4 }}>
                {fichaEmp.cargo} · {fichaEmp.gerencia} · <span className="mono">{fichaEmp.cedula}</span>
                {" · "}
                <span className={fichaEmp.activo ? "badge b-tiempo" : "badge b-inactive"} style={{ fontSize: ".68rem" }}>
                  {fichaEmp.activo ? "Activo" : "Inactivo"}
                </span>
              </div>
            </div>
            <button className="modal-close" onClick={() => setFicha(null)}>×</button>
          </div>
          <p className="muted">Cronología del rango {desde} → {hasta}. Los filtros se conservan al cerrar.</p>
          <div className="row" style={{ marginTop: 14 }}>
            <a className="btn btn-primary btn-sm" href={`/admin/empleados/${fichaEmp.cedula}`}>Histórico completo →</a>
            <button className="btn btn-sm btn-ghost" onClick={() => setFicha(null)}>Cerrar</button>
          </div>
        </div>
      )}

      {/* Modal justificar */}
      {just && (
        <div className="modal-bg" onClick={() => setJust(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">📎 Justificar — {nombreCompleto(just.cedula)} · {just.fecha}</div>
              <button className="modal-close" onClick={() => setJust(null)}>×</button>
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Respaldo (URL o archivo, opcional)</label>
              <input placeholder="Ej. reposo.pdf, https://…" />
            </div>
            <div className="form-group">
              <label>Motivo / observaciones <span style={{ color: "var(--bad)" }}>*</span></label>
              <textarea placeholder="Ej. cita médica comprobable el día siguiente" />
            </div>
            <div className="modal-footer">
              <button className="btn btn-ok" onClick={() => setJust(null)}>✓ Guardar JUSTIFICADO</button>
              <button className="btn btn-ghost" onClick={() => setJust(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal pase previo */}
      {pase && (
        <div className="modal-bg" onClick={() => setPase(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">🔑 Pase previo — {nombreCompleto(pase)}</div>
              <button className="modal-close" onClick={() => setPase(null)}>×</button>
            </div>
            <p className="muted" style={{ marginBottom: 16 }}>
              Permite entrar fuera del margen de 60 min. Solo se requiere motivo (sin documento).
            </p>
            <div className="form-group">
              <label>Motivo del aviso <span style={{ color: "var(--bad)" }}>*</span></label>
              <input placeholder="Ej. cita médica, llegará 09:30" />
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setPase(null)}>✓ Crear pase</button>
              <button className="btn btn-ghost" onClick={() => setPase(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
