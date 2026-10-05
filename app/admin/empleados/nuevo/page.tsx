"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, type ApiError } from "@/lib/api";
import dynamic from 'next/dynamic';
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";

const FaceEnroll = dynamic(() => import('@/components/face/FaceEnroll').then(m => m.FaceEnroll), {
  ssr: false,
  loading: () => <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: '#94a3b8' }}>Cargando módulo biométrico…</div>,
});

type Gerencia = { id: number; nombre: string };

export default function NuevoEmpleado() {
  const router = useRouter();
  const { addToast } = useToast();
  const [paso, setPaso] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gerencias, setGerencias] = useState<Gerencia[]>([]);
  const [empleadoId, setEmpleadoId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    cedula: "",
    nombre: "",
    apellido: "",
    cargo: "",
    gerenciaId: "",
  });

  useEffect(() => {
    async function cargarGerencias() {
      try {
        const res = await fetch('/api/gerencias');
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const gers = await res.json();
        setGerencias(gers);
      } catch (e) {
        console.error('[NuevoEmpleado] Error cargando gerencias:', e);
        setError('No se pudieron cargar las gerencias. Verifique su sesión.');
      }
    }
    cargarGerencias();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const gerenciaIdNum = Number(formData.gerenciaId);
      if (!gerenciaIdNum) {
        throw new Error("Debe seleccionar una gerencia");
      }
      const data = {
        cedula: formData.cedula.trim(),
        nombre: formData.nombre.trim(),
        apellido: formData.apellido.trim(),
        cargo: formData.cargo.trim(),
        gerenciaId: gerenciaIdNum,
        activo: true,
      };
      console.log('[NuevoEmpleado] Enviando:', data);
      const created = await api.empleados.create(data);
      console.log('[NuevoEmpleado] Creado:', created);
      setEmpleadoId(created.id);
      setPaso(2);
    } catch (e: any) {
      console.error('[NuevoEmpleado] Error:', e);
      const msg = e.data?.error || e.message || "Error creando empleado";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleCapture(descriptor: Float32Array) {
    if (!empleadoId) return;
    console.log('[NuevoEmpleado] Guardando descriptor:', { empleadoId, length: descriptor.length });
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/empleados/${empleadoId}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descriptor: Array.from(descriptor) }),
      });
      const data = await res.json();
      console.log('[NuevoEmpleado] Respuesta enroll:', { status: res.status, data });
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setError(null);
      if (data.warning) {
        addToast({ type: 'error', title: 'Aviso de confusión', message: data.warning });
      } else {
        addToast({ type: 'success', title: 'Empleado registrado', message: 'Firma facial guardada correctamente' });
      }
      router.push("/admin/empleados");
      router.refresh();
    } catch (e: any) {
      console.error('[NuevoEmpleado] Error enroll:', e);
      const msg = e.message || "Error guardando descriptor";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ marginBottom: 4 }}>Nuevo empleado</h2>
        <p className="muted">Registro en 2 pasos: datos personales → captura biométrica</p>
      </div>

      {/* Step indicator */}
      <div className="steps" style={{ marginBottom: 28 }}>
        <div className="step-item">
          <div className={"step-circle" + (paso > 1 ? " done" : paso === 1 ? " active" : "")}>
            {paso > 1 ? "" : "1"}
          </div>
          <span className={"step-label" + (paso === 1 ? " active" : "")} style={{ color: paso > 1 ? "var(--ok)" : undefined }}>
            Datos personales
          </span>
        </div>
        <div className={"step-connector" + (paso > 1 ? " done" : "")} />
        <div className="step-item">
          <div className={"step-circle" + (paso === 2 ? " active" : "")}>2</div>
          <span className={"step-label" + (paso === 2 ? " active" : "")}>Captura biométrica</span>
        </div>
      </div>

      {/* Step 1 */}
      {paso === 1 && (
        <div className="card">
          <h3 style={{ marginBottom: 18 }}> Paso 1 — Datos personales</h3>
          {error && <div className="alert alert-warn" style={{ marginBottom: 16 }}><span></span><span>{error}</span></div>}
          <form onSubmit={handleSubmit}>
            <div className="grid2" style={{ gap: 18 }}>
              <div className="form-group">
                <label htmlFor="n-doc">Documento (cédula/DNI) <span style={{ color: "var(--bad)" }}>*</span></label>
                <input
                  id="n-doc"
                  value={formData.cedula}
                  onChange={e => setFormData({ ...formData, cedula: e.target.value })}
                  placeholder="Ej. V-12345678"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="n-cargo">Cargo <span style={{ color: "var(--bad)" }}>*</span></label>
                <input
                  id="n-cargo"
                  value={formData.cargo}
                  onChange={e => setFormData({ ...formData, cargo: e.target.value })}
                  placeholder="Ej. Vendedor senior"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="n-nombre">Nombres <span style={{ color: "var(--bad)" }}>*</span></label>
                <input
                  id="n-nombre"
                  value={formData.nombre}
                  onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Ej. Ana María"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="n-apell">Apellidos <span style={{ color: "var(--bad)" }}>*</span></label>
                <input
                  id="n-apell"
                  value={formData.apellido}
                  onChange={e => setFormData({ ...formData, apellido: e.target.value })}
                  placeholder="Ej. Pérez García"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="n-ger">Gerencia <span style={{ color: "var(--bad)" }}>*</span></label>
                <Select
                  id="n-ger"
                  value={formData.gerenciaId}
                  onChange={e => setFormData({ ...formData, gerenciaId: e.target.value })}
                  required
                >
                  <option value="">Seleccione gerencia</option>
                  {gerencias.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
                </Select>
              </div>
            </div>

            <hr className="divider" />
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-ghost" onClick={() => router.push("/admin/empleados")}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? "Guardando…" : "Continuar a biometría →"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Step 2 - Biometric capture */}
      {paso === 2 && empleadoId && (
        <div className="card">
          <h3 style={{ marginBottom: 6 }}> Paso 2 — Captura biométrica</h3>
          
          {error && (
            <div className="alert alert-warn" style={{ marginBottom: 16 }}>
              <span>ℹ️</span><span>{error}</span>
            </div>
          )}

          <p className="muted" style={{ marginBottom: 20 }}>
            La cámara permanece activa con vista previa. El recuadro verde indica que el rostro es apto para captura (iluminación, ángulo, nitidez). Se capturan 128 valores como descriptor facial.
          </p>

          <FaceEnroll
            onCapture={handleCapture}
            onError={setError}
          />

          <div className="alert alert-info" style={{ marginTop: 16 }}>
            <span></span>
            <span>Asegúrese de buena iluminación frontal y que el empleado mire directamente a la cámara sin lentes oscuros.</span>
          </div>

          <hr className="divider" />
          <div className="row" style={{ justifyContent: "space-between" }}>
            <button className="btn" onClick={() => { setPaso(1); setEmpleadoId(null); setError(null); }}>← Atrás</button>
            <span className="muted" style={{ display: 'flex', alignItems: 'center', padding: '0 12px' }}>
              {loading ? 'Guardando vector…' : 'Use el botón "Capturar firma facial" arriba para guardar'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}