// lib/api.ts — Cliente API tipado para el frontend
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
    create: (data: { horaLimite: string; horaReferencia: string; margenMin: number; cooldownMin: number; vigenciaDesde: string }) =>
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

  // Auditoría
  auditoria: {
    list: () => fetchJson<any[]>("/api/auditoria"),
  },

  // Cambio clave
  cambioClave: (data: { actual?: string; nueva: string; confirmar: string }) =>
    fetchJson<any>("/api/cambio-clave", { method: "POST", body: JSON.stringify(data) }),

  // Gerencias
  gerencias: {
    list: () => fetchJson<any[]>("/api/gerencias"),
  },

  // Kiosco (endpoints protegidos por API_KIOSCO_KEY compartida con el servidor)
  kiosco: {
    challenge: () =>
      fetchJson<{ challengeId: string; steps: string[]; expiresAt: string }>("/api/kiosco/challenge", {
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_API_KIOSCO_KEY ?? ""}` },
      }),
    match: (data: { descriptor: number[]; quality: any; nonce: string; timestamp: number; challengeId?: string; series?: { yaw: number; pitch: number; t: number }[] }) =>
      fetchJson<{ ok: boolean; tipo: string; msg: string; extrasH?: number; empleadoId?: number; nombre?: string; apellido?: string; cedula?: string; error?: string }>("/api/kiosco/match", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_API_KIOSCO_KEY ?? ""}` },
      }),
  },
};

export type ApiError = { status: number; data: any; message: string };