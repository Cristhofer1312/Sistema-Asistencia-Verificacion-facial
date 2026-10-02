"use client";
import { useMemo, useState } from "react";
import { ASISTENCIAS, EMPLEADOS, badgeClass, nombreCompleto } from "@/lib/mock-api";

const ESTADOS = ["A TIEMPO", "TARDE", "FALTA", "JUSTIFICADO", "FERIADO", "VACACIONES", "TEMPRANO", "COMPLETADO"];

function estadoDe(f: (typeof ASISTENCIAS)[number]) {
  // Para filtrar: considera entrada y salida como estados independientes
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
      .filter((g) => g.filas.length > 0 || ql !== "" || estados.length === 0)
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
      <div className="card">
        <h3>Consulta flexible — una sola vista agrupada por empleado</h3>
        <div className="row">
          <div style={{ flex: 2, minWidth: 220 }}>
            <label>Buscador (nombre, cédula, cargo)</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ej. luis, 002, vendedor" />
          </div>
          <div><label>Desde</label><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
          <div><label>Hasta</label><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
          <div><label>Gerencia</label>
            <select value={gerencia} onChange={(e) => setGerencia(e.target.value)}>
              {gerencias.map((g) => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div><label>Ordenar por</label>
            <select value={orden} onChange={(e) => setOrden(e.target.value as typeof orden)}>
              <option value="nombre">Nombre</option><option value="tardes">Tardes</option>
              <option value="faltas">Faltas</option><option value="extras">Extras</option>
            </select>
          </div>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn" onClick={() => preset(1)}>Hoy</button>
          <button className="btn" onClick={() => preset(2)}>Ayer-Hoy</button>
          <button className="btn" onClick={() => preset(7)}>Semana</button>
          <button className="btn" onClick={() => { setQ(""); setEstados([]); setSoloExtras(false); setSoloAnticipadas(false); setSoloSinSalida(false); setGerencia("Todas"); }}>Limpiar</button>
          <span className="muted">{grupos.length} empleados · {totalReg} registros</span>
        </div>
        <div style={{ marginTop: 8 }}>
          <label>Estados (multi-select, se combinan con lo demás)</label>
          <div className="row">
            {ESTADOS.map((s) => (
              <label key={s} style={{ display: "inline-flex", gap: 6, alignItems: "center", border: "1px solid var(--line)", borderRadius: 999, padding: "4px 10px", margin: 0 }}>
                <input type="checkbox" style={{ width: "auto" }} checked={estados.includes(s)} onChange={() => toggleEstado(s)} /> {s}
              </label>
            ))}
          </div>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center", margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={soloExtras} onChange={(e) => setSoloExtras(e.target.checked)} /> Solo con extras</label>
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center", margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={soloAnticipadas} onChange={(e) => setSoloAnticipadas(e.target.checked)} /> Solo salida anticipada</label>
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center", margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={soloSinSalida} onChange={(e) => setSoloSinSalida(e.target.checked)} /> Solo sin salida</label>
        </div>
      </div>

      {grupos.length === 0 && (
        <div className="card"><b>Sin resultados para esos filtros.</b><p className="muted">Amplía el rango o limpia estados. Los inactivos no generan FALTA.</p></div>
      )}

      {grupos.map(({ e, filas, tardes, faltas, justs, extras }) => (
        <div className="card" key={e.cedula}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <button className="btn" style={{ border: "none", padding: 0, fontSize: 16 }} onClick={() => setExpandida(expandida === e.cedula ? null : e.cedula)}>
                {expandida === e.cedula ? "▾" : "▸"} <b>{e.nombre} {e.apellido}</b>
              </button>
              <span className="muted"> · {e.cargo} · {e.gerencia} · <span className="mono">{e.cedula}</span> · {e.activo ? "Activo" : "Inactivo"}</span>
            </div>
            <div className="row">
              <span className="badge b-tarde">{tardes} tardes</span>
              <span className="badge b-falta">{faltas} faltas</span>
              <span className="badge b-just">{justs} justif.</span>
              <span className="badge b-tiempo">{extras}h extra</span>
              <button className="btn" onClick={() => setFicha(e.cedula)}>Ver ficha</button>
            </div>
          </div>
          {expandida === e.cedula && (
            <table style={{ marginTop: 8 }}>
              <thead><tr><th>Fecha</th><th>E / S</th><th>Estado</th><th>Extras</th><th>Autorizador</th><th>Acción</th></tr></thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={i}>
                    <td>{f.fecha}</td><td>{f.entrada ?? "—"} / {f.salida ?? "—"}</td>
                    <td><span className={badgeClass(f.estadoEntrada)}>{f.estadoEntrada}</span>{" "}
                      {f.estadoSalida && <span className={badgeClass(f.estadoSalida)}>{f.estadoSalida}</span>}</td>
                    <td>{f.extras}h</td><td>{f.autorizador ?? "—"}</td>
                    <td>
                      {(f.estadoEntrada === "TARDE" || f.estadoEntrada === "FALTA") && (
                        <span className="row">
                          <button className="btn" onClick={() => setJust({ cedula: f.cedula, fecha: f.fecha })}>Justificar</button>
                          <button className="btn" onClick={() => setPase(f.cedula)}>Previo aviso</button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}

      {fichaEmp && (
        <div className="card">
          <h4>Ficha — {fichaEmp.nombre} {fichaEmp.apellido} <span className="muted mono">{fichaEmp.cedula}</span></h4>
          <p className="muted">{fichaEmp.cargo} · {fichaEmp.gerencia} · {fichaEmp.activo ? "Activo" : "Inactivo"} · Cronología del rango {desde} → {hasta} con totales arriba. (Mock: conserva filtros al cerrar.)</p>
          <div className="row">
            <a className="btn" href={`/admin/empleados/${fichaEmp.cedula}`}>Abrir histórico completo</a>
            <button className="btn" onClick={() => setFicha(null)}>Cerrar (vuelve al listado)</button>
          </div>
        </div>
      )}

      {just && (
        <div className="card">
          <h4>Justificar — {nombreCompleto(just.cedula)} · {just.fecha} (documento opcional)</h4>
          <label>Respaldo (opcional: URL o archivo)</label><input placeholder="Opcional — reposo.pdf" />
          <label>Motivo / observaciones (obligatorio)</label><textarea placeholder="Ej. cita médica comprobable luego" />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn btn-ok" onClick={() => setJust(null)}>Guardar JUSTIFICADO</button>
            <button className="btn" onClick={() => setJust(null)}>Cerrar</button>
          </div>
        </div>
      )}

      {pase && (
        <div className="card">
          <h4>Previo aviso — {nombreCompleto(pase)} (sin documento, solo motivo)</h4>
          <label>Motivo del aviso (obligatorio)</label><input placeholder="Ej. aviso previo: llegará 09:30" />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn btn-ok" onClick={() => setPase(null)}>Crear pase (permite entrar fuera de margen 60 min)</button>
            <button className="btn" onClick={() => setPase(null)}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
