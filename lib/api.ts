// lib/api.ts — Cliente API tipado para el frontend
import type { RevisionPantalla } from "./anti-pantalla-reglas";

const API_BASE = "";

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`) as any;
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

/**
 * GET /api/asistencias conservando el total real: si el servidor recortó el
 * rango (X-Truncado), la vista debe avisar en vez de mostrar totales incompletos.
 */
export async function fetchAsistencias<T = any>(
  qs: string,
  signal?: AbortSignal
): Promise<{ filas: T[]; total: number; truncado: boolean }> {
  const res = await fetch(`${API_BASE}/api/asistencias?${qs}`, { signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  const filas: T[] = Array.isArray(data) ? data : [];
  return {
    filas,
    total: Number(res.headers.get("X-Total-Count") ?? filas.length),
    truncado: res.headers.get("X-Truncado") === "true",
  };
}

export const api = {
  // Asistencias
  asistencias: {
    list: (params?: { desde: string; hasta: string; gerenciaId?: number }) => {
      const sp = new URLSearchParams();
      if (params?.desde) sp.set("desde", params.desde);
      if (params?.hasta) sp.set("hasta", params.hasta);
      if (params?.gerenciaId) sp.set("gerenciaId", String(params.gerenciaId));
      return fetchJson<any[]>(`/api/asistencias?${sp}`);
    },
  },

  justificar: (data: { empleadoId: number; fecha: string; justificacionDoc?: string; justificacionObs: string }) =>
    fetchJson("/api/justificar", { method: "POST", body: JSON.stringify(data) }),

  // Pases previos
  pases: {
    list: (params?: { empleadoId?: number; fecha?: string; pendientes?: boolean; tipo?: string }) => {
      const sp = new URLSearchParams();
      if (params?.empleadoId) sp.set("empleadoId", String(params.empleadoId));
      if (params?.fecha) sp.set("fecha", params.fecha);
      if (params?.pendientes) sp.set("pendientes", "true");
      if (params?.tipo) sp.set("tipo", params.tipo);
      return fetchJson(`/api/pase-previo?${sp}`);
    },
    create: (data: { empleadoId: number; fecha: string; motivo: string; tipo?: "PASE_NORMAL" | "JUSTIFICACION_ANTICIPADA" }) =>
      fetchJson("/api/pase-previo", { method: "POST", body: JSON.stringify(data) }),
  },

  // Permisos estudiantiles (extensión de hora límite por día de semana)
  permisosEstudio: {
    list: (params?: { empleadoId?: number; activo?: boolean }) => {
      const sp = new URLSearchParams();
      if (params?.empleadoId) sp.set("empleadoId", String(params.empleadoId));
      if (params?.activo !== undefined) sp.set("activo", String(params.activo));
      return fetchJson<any[]>(`/api/permisos-estudio?${sp}`);
    },
    create: (data: { empleadoId: number; diasSemana: number[]; horaLimite: string; validoDesde: string; validoHasta: string; motivo?: string }) =>
      fetchJson<any>("/api/permisos-estudio", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: { diasSemana?: number[]; horaLimite?: string; validoDesde?: string; validoHasta?: string; motivo?: string | null; activo?: boolean }) =>
      fetchJson<any>(`/api/permisos-estudio/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: number) =>
      fetchJson<any>(`/api/permisos-estudio/${id}`, { method: "DELETE" }),
  },
  // Vacaciones
  vacaciones: {
    list: (params?: { empleadoId?: number; q?: string; gerenciaId?: number; desde?: string; hasta?: string; estado?: string; situacion?: string }) => {
      const sp = new URLSearchParams();
      if (params?.empleadoId) sp.set("empleadoId", String(params.empleadoId));
      if (params?.q) sp.set("q", params.q);
      if (params?.gerenciaId) sp.set("gerenciaId", String(params.gerenciaId));
      if (params?.desde) sp.set("desde", params.desde);
      if (params?.hasta) sp.set("hasta", params.hasta);
      if (params?.estado) sp.set("estado", params.estado);
      if (params?.situacion) sp.set("situacion", params.situacion);
      return fetchJson<any[]>(`/api/vacaciones?${sp}`);
    },
    create: (data: { empleadoId: number; inicio: string; fin: string; motivo?: string }) =>
      fetchJson<any>("/api/vacaciones", { method: "POST", body: JSON.stringify(data) }),
    delete: (id: number) =>
      fetchJson<any>(`/api/vacaciones?id=${id}`, { method: "DELETE" }),
    anular: (id: number, motivoAnulacion: string) =>
      fetchJson<any>("/api/vacaciones/anular", { method: "POST", body: JSON.stringify({ id, motivoAnulacion }) }),
  },

  // Reposos médicos
  reposos: {
    list: (params?: { empleadoId?: number; fecha?: string; q?: string; gerenciaId?: number; desde?: string; hasta?: string; estado?: string; situacion?: string }) => {
      const sp = new URLSearchParams();
      if (params?.empleadoId) sp.set("empleadoId", String(params.empleadoId));
      if (params?.fecha) sp.set("fecha", params.fecha);
      if (params?.q) sp.set("q", params.q);
      if (params?.gerenciaId) sp.set("gerenciaId", String(params.gerenciaId));
      if (params?.desde) sp.set("desde", params.desde);
      if (params?.hasta) sp.set("hasta", params.hasta);
      if (params?.estado) sp.set("estado", params.estado);
      if (params?.situacion) sp.set("situacion", params.situacion);
      return fetchJson<any[]>(`/api/reposos?${sp}`);
    },
    create: (data: { empleadoId: number; inicio: string; fin: string; motivo?: string; documento?: string }) =>
      fetchJson<any>("/api/reposos", { method: "POST", body: JSON.stringify(data) }),
    delete: (id: number) =>
      fetchJson<any>(`/api/reposos?id=${id}`, { method: "DELETE" }),
    anular: (id: number, motivoAnulacion: string) =>
      fetchJson<any>("/api/reposos/anular", { method: "POST", body: JSON.stringify({ id, motivoAnulacion }) }),
    reactivar: (id: number) =>
      fetchJson<any>("/api/reposos/reactivar", { method: "POST", body: JSON.stringify({ id }) }),
  },

  // Empleados
  empleados: {
    list: (gerenciaId?: number) => {
      const sp = new URLSearchParams();
      if (gerenciaId) sp.set("gerenciaId", String(gerenciaId));
      return fetchJson<any[]>(`/api/empleados?${sp}`);
    },
    create: (data: any) => fetchJson<any>("/api/empleados", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: any) =>
      fetchJson<any>(`/api/empleados/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: number) =>
      fetchJson<any>(`/api/empleados/${id}`, { method: "DELETE" }),
  },

  // Reglas
  reglas: {
    list: () => fetchJson<any[]>("/api/reglas"),
    create: (data: { horaEntrada: string; horaLimite: string; horaReferencia: string; cooldownMin: number; vigenciaDesde: string }) =>
      fetchJson<any>("/api/reglas", { method: "POST", body: JSON.stringify(data) }),
  },

  // Feriados
  feriados: {
    list: (params?: { q?: string; desde?: string; hasta?: string }) => {
      const sp = new URLSearchParams();
      if (params?.q) sp.set("q", params.q);
      if (params?.desde) sp.set("desde", params.desde);
      if (params?.hasta) sp.set("hasta", params.hasta);
      return fetchJson<any[]>(`/api/feriados?${sp}`);
    },
    delete: (id: number) =>
      fetchJson<any>(`/api/feriados?id=${id}`, { method: "DELETE" }),
    create: (data: { fecha: string; motivo: string }) =>
      fetchJson<any>("/api/feriados", { method: "POST", body: JSON.stringify(data) }),
  },

  // Diagnóstico: pares de enrolados con firmas faciales demasiado parecidas
  diagnostico: {
    colisiones: (umbral?: number) =>
      fetchJson<{
        umbral: number;
        umbralMatch: number;
        enrolados: number;
        paresRevisados: number;
        colisiones: {
          a: { id: number; cedula: string; nombre: string; apellido: string };
          b: { id: number; cedula: string; nombre: string; apellido: string };
          distancia: number;
          bajoUmbralMatch: boolean;
        }[];
      }>(`/api/diagnostico/colisiones${umbral != null ? `?umbral=${umbral}` : ""}`),
  },

  // Auditoría
  auditoria: {
    list: (params: { desde?: string; hasta?: string; accion?: string[]; usuario?: string; q?: string; page?: number; pageSize?: number } = {}, signal?: AbortSignal) => {
      const sp = new URLSearchParams();
      if (params.desde) sp.set("desde", params.desde);
      if (params.hasta) sp.set("hasta", params.hasta);
      if (params.accion?.length) sp.set("accion", params.accion.join(","));
      if (params.usuario) sp.set("usuario", params.usuario);
      if (params.q) sp.set("q", params.q);
      if (params.page) sp.set("page", String(params.page));
      if (params.pageSize) sp.set("pageSize", String(params.pageSize));
      return fetchJson<{
        filas: { id: number; accion: string; usuarioId: number | null; detalle: string; ip: string | null; ts: string; usuario: { username: string } | null }[];
        total: number;
        page: number;
        pageSize: number;
        usuarios: string[];
      }>(`/api/auditoria?${sp}`, { signal });
    },
  },

  // Admin: cierre diario (debug) — marca faltantes del día
  cierreDia: (fecha?: string) =>
    fetchJson<{ ok: boolean; fecha: string; faltas: number; faltasJustificadas: number; feriados: number; vacaciones: number; reposos: number; omitidos: number }>("/api/admin/cierre-dia", {
      method: "POST",
      body: JSON.stringify(fecha ? { fecha } : {}),
    }),

  // Cambio clave
  cambioClave: (data: { actual?: string; nueva: string; confirmar: string }) =>
    fetchJson<any>("/api/cambio-clave", { method: "POST", body: JSON.stringify(data) }),

  // Gerencias
  gerencias: {
    list: () => fetchJson<any[]>("/api/gerencias"),
    create: (data: { nombre: string }) => fetchJson<any>("/api/gerencias", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: { nombre: string }) => fetchJson<any>(`/api/gerencias/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: number) => fetchJson<any>(`/api/gerencias/${id}`, { method: "DELETE" }),
  },

  // Kiosco (endpoints protegidos por API_KIOSCO_KEY compartida con el servidor)
  kiosco: {
    challenge: () =>
      fetchJson<{ challengeId: string; steps: string[]; expiresAt: string }>("/api/kiosco/challenge", {
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_API_KIOSCO_KEY ?? ""}` },
      }),
    match: (data: { descriptor: number[]; descriptor2?: number[]; quality: any; nonce: string; timestamp: number; challengeId?: string; series?: { yaw: number; pitch: number; t: number }[]; pantalla: RevisionPantalla }) =>
      fetchJson<{ ok: boolean; tipo: string; msg: string; extrasH?: number; empleadoId?: number; nombre?: string; apellido?: string; cedula?: string; error?: string; dobleCheck?: boolean }>("/api/kiosco/match", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_API_KIOSCO_KEY ?? ""}` },
      }),
  },
};

export type ApiError = { status: number; data: any; message: string };