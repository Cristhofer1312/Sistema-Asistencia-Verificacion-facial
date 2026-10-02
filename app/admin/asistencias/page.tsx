"use client";
import { useState } from "react";
import { ASISTENCIAS, badgeClass, nombreCompleto } from "@/lib/mock-api";
export default function Asistencias() {
  const [just, setJust] = useState<string | null>(null);
  const [pase, setPase] = useState(false);
  return (
    <div className="card">
      <h3>Asistencias — vista proyecta FALTA / FERIADO / VACACIONES</h3>
      <div className="row">
        <div><label>Desde</label><input type="date" defaultValue="2026-10-01" /></div>
        <div><label>Hasta</label><input type="date" defaultValue="2026-10-02" /></div>
        <div><label>Gerencia</label><select><option>Todas</option><option>Ventas</option><option>RRHH</option></select></div>
        <div><label>Estado</label><select><option>Todos</option><option>A TIEMPO</option><option>TARDE</option><option>FALTA</option><option>JUSTIFICADO</option><option>FERIADO</option><option>VACACIONES</option></select></div>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn btn-primary" onClick={() => setPase(true)}>Crear pase previo (fuera de margen)</button>
      </div>
      <table style={{ marginTop: 12 }}>
        <thead><tr><th>Empleado</th><th>Fecha</th><th>E/S</th><th>Estado</th><th>Extras</th><th>Acción</th></tr></thead>
        <tbody>
          {ASISTENCIAS.map((f, i) => (
            <tr key={i}>
              <td><a href={`/admin/empleados/${f.cedula}`}><b>{nombreCompleto(f.cedula)}</b></a></td>
              <td>{f.fecha}</td><td>{f.entrada ?? "—"} / {f.salida ?? "—"}</td>
              <td><span className={badgeClass(f.estadoEntrada)}>{f.estadoEntrada}</span></td>
              <td>{f.extras}h</td>
              <td>{(f.estadoEntrada === "TARDE") ? <button className="btn" onClick={() => setJust(f.cedula)}>Justificar</button> : <span className="muted">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {just && (
        <div className="card"><h4>Justificar {nombreCompleto(just)} (mock)</h4>
          <label>Respaldo (URL/archivo)</label><input placeholder="reposo.pdf" />
          <label>Observaciones</label><textarea />
          <div className="row" style={{ marginTop: 8 }}><button className="btn btn-ok" onClick={() => setJust(null)}>Guardar JUSTIFICADO</button><button className="btn" onClick={() => setJust(null)}>Cerrar</button></div>
        </div>
      )}
      {pase && (
        <div className="card"><h4>Pase previo para hoy (permite entrar fuera de margen 60 min)</h4>
          <label>Empleado</label><select><option>Luis Gómez</option></select>
          <label>Motivo</label><input placeholder="Cita médica" />
          <div className="row" style={{ marginTop: 8 }}><button className="btn btn-ok" onClick={() => setPase(false)}>Crear pase</button><button className="btn" onClick={() => setPase(false)}>Cerrar</button></div>
        </div>
      )}
    </div>
  );
}
