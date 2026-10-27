---
name: biometric-audit-rbac
description: Mejora la generación de reportes de asistencia/acceso, el payload de telemetría recibida y la arquitectura de permisos (RBAC, revocación de consentimiento biométrico y permisos de dispositivos/cámara) en sistemas de reconocimiento facial. Úsala cuando pidan optimizar reportes, auditar logs de acceso, estructurar respuestas de la API o corregir el manejo de permisos.
---

# Arquitectura de Reportes y Permisos Biométricos

## Propósito
Estandarizar la forma en que el sistema captura eventos de reconocimiento facial, presenta reportes operativos/ejecutivos y gestiona los permisos tanto a nivel de hardware (cámara/cliente) como de control de acceso basado en roles (RBAC) y privacidad de datos biométricos.

## Instrucciones de Implementación

### 1. Enriquecimiento de la Información Recibida (Payload de Eventos)
Nunca registres únicamente `success: true/false`. Todo evento de intento de reconocimiento enviado al backend debe estructurarse con metadatos de diagnóstico:
- **Identificadores y Tiempo:** `event_id` (UUID v4), `timestamp_utc`, `terminal_id` o `device_fingerprint`.
- **Métricas Biométricas:** `cosine_similarity` (puntaje crudo), `threshold_applied` (umbral vigente en ese instante), `liveness_score` y `challenge_passed` (booleano).
- **Diagnóstico de Imagen (Telemetría de fallo):** `face_bbox_area` (tamaño relativo del rostro), `brightness_level`, `blur_variance` (Laplacian) y `pose_angles` (yaw, pitch, roll).
- **Código de Razón Estandarizado (`reason_code`):**
  - `MATCH_CONFIRMED`: Reconocimiento exitoso.
  - `LOW_CONFIDENCE`: Rostro detectado pero similitud por debajo del umbral.
  - `LIVENESS_FAILED`: Intento de suplantación o fallo en el reto de vida.
  - `POOR_IMAGE_QUALITY`: Descarte previo a la inferencia por contraluz, desenfoque o rostro muy lejano.
  - `PERMISSION_DENIED`: Usuario sin privilegios en esa zona/horario o cámara bloqueada.

### 2. Diseño de Reportes Accionables
Al crear o refactorizar consultas, endpoints o vistas de reportes, separa la información en tres capas:
1. **Reporte Operativo (RRHH / Control de Asistencia):** Puntualidad, primera entrada, última salida, horas efectivas y alertas de marcajes huérfanos (entrada sin salida).
2. **Reporte de Auditoría Técnica (Calidad del Sistema):** Tasa de Falsos Rechazos (FRR) agrupada por dispositivo o franja horaria (útil para detectar si una cámara tiene problemas de luz a cierta hora del día) y usuarios con mayor tasa de reintentos.
3. **Reporte de Seguridad:** Intentos fallidos consecutivos, fallos de prueba de vida (`LIVENESS_FAILED`) y accesos fuera de horario permitido.

### 3. Manejo de Permisos en Tres Niveles
Cuando modifiques la lógica de autorización o acceso, aplica separación estricta:

- **Nivel A: Permisos de Dispositivo/Cliente (Frontend / WebRTC):**
  - Implementa una máquina de estados explícita para `navigator.mediaDevices.getUserMedia`: `prompt`, `granted`, `denied`, `hardware_error`.
  - Si el estado es `denied` o `NotAllowedError`, bloquea el flujo de captura inmediatamente y muestra instrucciones específicas según el navegador para desbloquear la cámara sin enviar peticiones vacías al backend.
- **Nivel B: Control de Acceso Basado en Roles yAtributos (RBAC + ABAC):**
  - Separa los roles del sistema:
    - `Operador / Kiosco`: Solo puede enviar frames/vectores para verificación y recibir confirmación mínima (nombre/estado). No puede leer historiales.
    - `Supervisor / RRHH`: Puede ver reportes de asistencia y exportar métricas operativas, pero NO puede acceder a los vectores biométricos (`embeddings`) ni modificar umbrales.
    - `Admin Biométrico`: Puede enrollar nuevos rostros, revocar plantillas y ajustar umbrales de similitud.
  - Aplica restricciones contextuales (ABAC): valida horario permitido, geocerca o IP autorizada del punto de marcaje.
- **Nivel C: Consentimiento y Ciclo de Vida del Dato Biométrico:**
  - Nunca almacenes fotografías crudas tras el enrolamiento a menos que esté explícitamente requerido por auditoría; almacena únicamente el vector numérico (`embedding`) cifrado en reposo (AES-256).
  - Vincula cada plantilla biométrica a un registro de `consent_status` (`ACTIVE`, `REVOKED`, `EXPIRED`). Si pasa a `REVOKED`, el middleware debe impedir la comparación vectorial de inmediato y purgar el vector de la caché en memoria.

## Reglas de Revisión de Código
- Verifica que ningún endpoint de reportes devuelva el array del `embedding` facial en el JSON de respuesta.
- Asegúrate de que toda modificación manual de un registro de asistencia en los reportes exija un campo `justification` y guarde un log inmutable en `audit_logs` con `actor_id`, `previous_value` y `new_value`.
