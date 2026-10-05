'use client';

import { useEffect, useRef, useState } from 'react';
import * as faceapi from '@vladmandic/face-api';
import {
  loadFaceApiModels,
  FACE_API_CONFIG,
  estimateHeadPose,
  generateFacePreview,
  estimateBrightness
} from '@/lib/face-api';
import { averageDescriptors } from '@/lib/descriptor-utils';
import { FACE_QUALITY } from '@/lib/face-quality';
import { api } from '@/lib/api';

interface FaceQualityData {
  oneFace: boolean; oneFaceHint: string;
  centered: boolean; centeredHint: string;
  distance: boolean; distanceHint: string;
  frontLight: boolean; frontLightHint: string;
  allOk: boolean;
}

interface ChallengeStep {
  step: string; // "IZQUIERDA" | "DERECHA" | "FRENTE"
  completed: boolean;
}

interface LivenessQualityData {
  move: boolean;
  step: string;
  stepIndex: number;
  totalSteps: number;
}

interface SeriesPoint {
  yaw: number;
  pitch: number;
  t: number;
}

interface MatchResult {
  ok: boolean;
  tipo: string;
  msg: string;
  extrasH?: number;
  empleadoId: number | undefined;
  nombre: string | undefined;
  apellido: string | undefined;
  cedula: string | undefined;
  error?: string;
}

export interface RejectedInfo {
  tipo: string;
  msg: string;
  nombre?: string;
  apellido?: string;
  cedula?: string;
  empleadoId?: number;
}

interface FaceIdentifyProps {
  onMatch: (result: MatchResult) => void;
  onMultiFace: () => void;
  onUnknown: () => void;
  onCooldown: (minutos: number) => void;
  onRejected?: (info: RejectedInfo) => void;
  onError?: (msg: string) => void;
  onQualityChange?: (q: any) => void;
  onLivenessChange?: (q: LivenessQualityData) => void;
}

const INFERENCE_INTERVAL_MS = 200; // Reducido de 1000 a 200 para lecturas más rápidas (5 fps)
// Umbrales suaves: giro leve (±10°) para facilidad de escaneo.
// FRENTE usa ±14° (ver abajo). La seguridad la da la secuencia ordenada.
const YAW_THRESHOLD = 10;
const PITCH_THRESHOLD = 12;
// Watchdog: si no hay progreso en el escaneo por más de este tiempo, se reinicia.
const WATCHDOG_MS = 10000;
// Probe del kiosco: dos ventanas independientes de N muestras frontales de
// buena calidad, promediadas L2 cada una (igual que el enrolamiento).
// El servidor solo acepta si AMBAS coinciden en el mismo empleado: los falsos
// positivos por tono de piel/luz son inestables entre capturas separadas por
// segundos; los verdaderos son estables.
// Gates en lib/face-quality.ts (fuente única compartida con el registro).
const PROBE_SAMPLES = FACE_QUALITY.probe.samples;
const PROBE_WINDOWS = FACE_QUALITY.probe.windows;
const PROBE_TOTAL = PROBE_SAMPLES * PROBE_WINDOWS;
const PROBE_MIN_SCORE = FACE_QUALITY.probe.minScore;
const PROBE_MIN_BRIGHTNESS = FACE_QUALITY.probe.minBrightness;
const PROBE_MAX_BRIGHTNESS = FACE_QUALITY.probe.maxBrightness;
const PROBE_MAX_ANGLE = FACE_QUALITY.probe.maxAngle; // yaw/pitch frontal

type IdentifyState =
  | 'loading_models'
  | 'starting_camera'
  | 'scanning'
  | 'challenge_requested'
  | 'challenge_active'
  | 'matching'
  | 'success'
  | 'multi_face'
  | 'unknown'
  | 'rejected'
  | 'cooldown'
  | 'error';

export function FaceIdentify({
  onMatch, onMultiFace, onUnknown, onCooldown, onRejected, onError,
  onQualityChange, onLivenessChange
}: FaceIdentifyProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<IdentifyState>('loading_models');
  const [message, setMessage] = useState('');
  const [previewCanvas, setPreviewCanvas] = useState<HTMLCanvasElement | null>(null);
  const [challengeSteps, setChallengeSteps] = useState<{ step: string; completed: boolean }[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const watchdogRef = useRef<NodeJS.Timeout | null>(null);
  const stateRef = useRef<IdentifyState>('loading_models');
  const matchingRef = useRef(false);
  const lastProgressRef = useRef<number>(Date.now());
  const attemptIdRef = useRef<number>(0);
  const challengeIdRef = useRef<string | null>(null);
  const seriesRef = useRef<{ yaw: number; pitch: number; t: number }[]>([]);
  const challengeStartTimeRef = useRef<number>(0);
  const challengeStepsRef = useRef<{ step: string; completed: boolean }[]>([]);
  const currentStepIdxRef = useRef<number>(0);
  const lastPoseRef = useRef<{ yaw: number; pitch: number } | null>(null);
  const probeBufferRef = useRef<Float32Array[]>([]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let mounted = true;
    async function loadModels() {
      try {
        await loadFaceApiModels();
        if (mounted) {
          setState('starting_camera');
          startCamera();
        }
      } catch (e) {
        if (mounted) {
          setState('error');
          onError?.('Error cargando modelos IA: ' + (e as Error).message);
        }
      }
    }
    loadModels();
    return () => { mounted = false; };
  }, [onError]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } 
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
      streamRef.current = stream;
      setState('scanning');
      setMessage('Escaneando… presente su rostro');
      markProgress();
      startInferenceLoop();
      startWatchdog();
    } catch {
      onError?.('No se pudo acceder a la cámara');
      setState('error');
    }
  };

  const requestChallenge = async () => {
    markProgress();
    const myAttempt = attemptIdRef.current;
    try {
      console.log('[Kiosco] solicitando challenge al servidor…');
      const result = await api.kiosco.challenge();
      if (attemptIdRef.current !== myAttempt) {
        console.log('[Kiosco] challenge descartado (reinicio por watchdog)');
        return;
      }
      console.log('[Kiosco] challenge recibido:', result.steps.join(' → '));
      markProgress();
      challengeIdRef.current = result.challengeId;
      challengeStepsRef.current = result.steps.map(s => ({ step: s, completed: false }));
      currentStepIdxRef.current = 0;
      setChallengeSteps(challengeStepsRef.current.map(s => ({ ...s })));
      setCurrentStepIndex(0);
      seriesRef.current = [];
      challengeStartTimeRef.current = Date.now();
      setState('challenge_active');
      updateChallengeUI();
    } catch (e: any) {
      console.log('[Kiosco] error solicitando challenge:', e?.data?.error ?? e?.message);
      onError?.('Error solicitando challenge: ' + (e.data?.error ?? e.message));
      setState('error');
    }
  };

  const resetChallenge = () => {
    challengeIdRef.current = null;
    challengeStepsRef.current = [];
    currentStepIdxRef.current = 0;
    setChallengeSteps([]);
    setCurrentStepIndex(0);
    seriesRef.current = [];
    challengeStartTimeRef.current = 0;
    lastPoseRef.current = null; // Reiniciar referencia de pose para que no sume deltas falsos
    probeBufferRef.current = []; // Descartar muestras del intento anterior
  };

  // 403 fuera_de_margen: el rostro SÍ coincidió, el fichaje fue bloqueado por
  // horario. Se notifica por onRejected (overlay ámbar) y NO por onUnknown
  // (rojo "no reconocido") para no confundir al usuario.
  const notifyRejected = (info: RejectedInfo) => {
    if (onRejected) onRejected(info);
    else onUnknown();
  };

  // Marca progreso: cualquier avance real (challenge recibido, paso cumplido,
  // probe enviado/respondido) reinicia la ventana del watchdog.
  const markProgress = () => {
    lastProgressRef.current = Date.now();
  };

  // Reinicio por watchdog: invalida respuestas en vuelo con attemptId para que
  // un match tardío no fiche después del reinicio.
  const watchdogReset = () => {
    attemptIdRef.current += 1;
    matchingRef.current = false;
    resetChallenge();
    setState('scanning');
    setMessage('Escaneando… presente su rostro');
    markProgress();
    console.log('[Kiosco] watchdog: 10s sin progreso, escaneo reiniciado');
  };

  const startWatchdog = () => {
    if (watchdogRef.current) clearInterval(watchdogRef.current);
    watchdogRef.current = setInterval(() => {
      const s = stateRef.current;
      if (s !== 'challenge_requested' && s !== 'challenge_active' && s !== 'matching') return;
      if (Date.now() - lastProgressRef.current > WATCHDOG_MS) watchdogReset();
    }, 1000);
  };

  const stepLabel = (step: string): string => {
    const labels: Record<string, string> = {
      'IZQUIERDA': 'Gire a la IZQUIERDA ←',
      'DERECHA': 'Gire a la DERECHA →',
      'FRENTE': 'Mire al FRENTE ●',
    };
    return labels[step] ?? 'Gire la cabeza';
  };

  const updateChallengeUI = () => {
    const steps = challengeStepsRef.current;
    const idx = currentStepIdxRef.current;
    const step = steps[idx];
    if (!step) return;
    setMessage(stepLabel(step.step));
    setChallengeSteps(steps.map(s => ({ ...s })));
    setCurrentStepIndex(idx);
    onLivenessChange?.({
      move: true,
      step: step.step,
      stepIndex: idx,
      totalSteps: steps.length,
    });
  };

  const startInferenceLoop = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    
    intervalRef.current = setInterval(async () => {
      // 'matching' sigue corriendo: el envío al servidor ocurre en el tick
      // siguiente a completar el challenge (el state de React se sincroniza
      // al ref vía efecto después del re-render).
      if (stateRef.current !== 'scanning' && stateRef.current !== 'challenge_active' && stateRef.current !== 'matching') return;

      const videoEl = videoRef.current;
      if (!videoEl || videoEl.readyState !== videoEl.HAVE_ENOUGH_DATA) return;

      try {
        const detections = await faceapi
          .detectAllFaces(videoEl, FACE_API_CONFIG.tinyFaceDetectorOptions)
          .withFaceLandmarks()
          .withFaceDescriptors();

        if (detections.length === 0) return;

        if (detections.length > 1) {
          setState('multi_face');
          setMessage('Múltiples rostros detectados. Preséntese solo.');
          onMultiFace();
          setTimeout(() => {
            if (stateRef.current === 'multi_face') {
              setState('scanning');
              setMessage('Escaneando… presente su rostro');
            }
          }, 2000);
          return;
        }

        const det = detections[0] as any;
        const detection = det.detection;
        const landmarks = det.landmarks;
        const video = videoEl;
        const box = detection.box;
        
        const oneFace = detections.length === 1;
        const oneFaceHint = oneFace ? '' : detections.length === 0 ? 'No se detecta rostro' : 'Solo una persona';
        
        const videoW = video.videoWidth;
        const boxCenterX = box.x + box.width / 2;
        const centered = Math.abs(boxCenterX - videoW / 2) < videoW * 0.15;
        const centeredHint = centered ? '' : boxCenterX < videoW / 2 ? 'Muévase a la derecha' : 'Muévase a la izquierda';
        
        const faceW = box.width;
        const distance = faceW >= 120 && faceW <= 300;
        const distanceHint = faceW < 120 ? 'Acérquese' : faceW > 300 ? 'Aléjese' : '';
        
        const pose = estimateHeadPose(landmarks);
        const brightness = estimateBrightness(video, box);
        const frontLight = Math.abs(pose.yaw) <= 35 && Math.abs(pose.pitch) <= 35 && brightness >= FACE_QUALITY.probe.minBrightness && brightness <= FACE_QUALITY.probe.maxBrightness;
        let frontLightHint = '';
        if (Math.abs(pose.yaw) > 35) frontLightHint = 'Mire de frente';
        else if (Math.abs(pose.pitch) > 35) frontLightHint = 'Enderece la cabeza';
        else if (brightness < FACE_QUALITY.probe.minBrightness) frontLightHint = 'Más luz frontal';
        else if (brightness > FACE_QUALITY.probe.maxBrightness) frontLightHint = 'Menos luz directa';
        
        onQualityChange?.({
          oneFace, oneFaceHint,
          centered, centeredHint,
          distance, distanceHint,
          frontLight, frontLightHint,
          allOk: oneFace && centered && distance && frontLight,
        });
        
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const displaySize = { width: video.videoWidth, height: video.videoHeight };
            faceapi.matchDimensions(canvas, displaySize);
            const resized = faceapi.resizeResults(det, displaySize) as any;
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            const allOk = oneFace && centered && distance && frontLight;
            const boxColor = allOk ? '#10b981' : '#ef4444';
            
            const resizedDet = resized.detection;
            ctx.strokeStyle = boxColor;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.rect(resizedDet.box.x, resizedDet.box.y, resizedDet.box.width, resizedDet.box.height);
            ctx.stroke();
          }
        }
        
        // Liveness: frame-to-frame movement (delta > 3 grados)
        let move = false;
        if (lastPoseRef.current) {
          const dy = pose.yaw - lastPoseRef.current.yaw;
          const dp = pose.pitch - lastPoseRef.current.pitch;
          if (Math.abs(dy) > 3 || Math.abs(dp) > 3) {
            move = true;
          }
        }
        lastPoseRef.current = { yaw: pose.yaw, pitch: pose.pitch };
        
        // Registrar serie para challenge
        if (stateRef.current === 'challenge_active') {
          const now = Date.now();
          seriesRef.current.push({ yaw: pose.yaw, pitch: pose.pitch, t: now - challengeStartTimeRef.current });
        }

        // Máquina de estados.
        // NOTA: usa refs (no el state de React): el intervalo se crea una vez
        // y el state llega obsoleto al closure. El match se dispara con llamada
        // directa (doMatch) en el mismo tick, nunca esperando al próximo.
        if (stateRef.current === 'scanning') {
          if (move) {
            console.log('[Kiosco] movimiento detectado, solicitando challenge…');
            setState('challenge_requested');
            setMessage('Solicitando desafío…');
            await requestChallenge();
          }
          return;
        }

        if (stateRef.current === 'challenge_active') {
          const steps = challengeStepsRef.current;
          if (steps.length === 0) return; // challenge aún no cargado, seguir acumulando serie
          const idx = currentStepIdxRef.current;
          const step = steps[idx];
          if (!step) return;
          const expected = step.step;
          let stepOk = false;
          console.log(`[Kiosco] yaw=${pose.yaw.toFixed(1)}° pitch=${pose.pitch.toFixed(1)}° esperando ${expected} (${idx + 1}/${steps.length})`);
          if (expected === 'IZQUIERDA') stepOk = pose.yaw <= -YAW_THRESHOLD;
          else if (expected === 'DERECHA') stepOk = pose.yaw >= YAW_THRESHOLD;
          // FRENTE con margen muy amplio (30°) para evitar fricción si la cámara
          // está muy arriba o abajo, o si la estimación tiene sesgo.
          else if (expected === 'FRENTE') stepOk = Math.abs(pose.yaw) <= 30 && Math.abs(pose.pitch) <= 30;

          if (stepOk) {
            console.log(`[Kiosco] paso ${idx + 1}/${steps.length} completado: ${expected}`);
            markProgress();
            steps[idx] = { ...step, completed: true };
            currentStepIdxRef.current = idx + 1;
            if (idx + 1 >= steps.length) {
              setState('matching');
              setMessage('Comparando…');
              probeBufferRef.current = []; // intento nuevo: acumular muestras frescas
              console.log('[Kiosco] challenge completo, enviando probe al servidor en el próximo ciclo…');
            } else {
              updateChallengeUI();
            }
          }
          return;
        }

        if ((stateRef.current as IdentifyState) === 'matching' && !matchingRef.current) {
          // Acumular 2 ventanas de PROBE_SAMPLES muestras frontales de buena
          // calidad; cada ventana se promedia L2 y ambas se envían como probes
          // independientes para la doble verificación del servidor.
          const score = (detection?.score as number | undefined) ?? 0;
          const frontal = Math.abs(pose.yaw) <= PROBE_MAX_ANGLE && Math.abs(pose.pitch) <= PROBE_MAX_ANGLE;
          const probeOk = oneFace && centered && distance && frontal
            && score >= PROBE_MIN_SCORE
            && brightness >= PROBE_MIN_BRIGHTNESS && brightness <= PROBE_MAX_BRIGHTNESS;
          if (!probeOk) {
            probeBufferRef.current = [];
            setMessage('Acerque el rostro con buena luz…');
            markProgress();
            return;
          }
          probeBufferRef.current.push(Float32Array.from(det.descriptor as Float32Array));
          if (probeBufferRef.current.length > PROBE_TOTAL) probeBufferRef.current.shift();
          if (probeBufferRef.current.length < PROBE_TOTAL) {
            setMessage(`Comparando… muestra ${probeBufferRef.current.length}/${PROBE_TOTAL}`);
            markProgress();
            return;
          }
          matchingRef.current = true;
          const myAttempt = attemptIdRef.current;
          markProgress();
          console.log('[Kiosco] enviando doble probe al servidor…');
          try {
            const win1 = probeBufferRef.current.slice(0, PROBE_SAMPLES);
            const win2 = probeBufferRef.current.slice(PROBE_SAMPLES, PROBE_TOTAL);
            const descriptor = Array.from(averageDescriptors(win1));
            const descriptor2 = Array.from(averageDescriptors(win2));
            probeBufferRef.current = [];
            const quality = {
              earOk: true, // parpadeo ya no es requisito
              poseOk: move,
              brightness: Math.round(brightness),
              centered,
              distance,
            };
            const nonce = crypto.randomUUID();
            const timestamp = Date.now();

            const result = await api.kiosco.match({
              descriptor,
              descriptor2,
              quality,
              nonce,
              timestamp,
              challengeId: challengeIdRef.current ?? undefined,
              series: seriesRef.current.length > 0 ? seriesRef.current : undefined,
            });
            console.log('[Kiosco] respuesta match:', result.ok ? `${result.tipo} — ${result.msg}` : result);
            if (attemptIdRef.current !== myAttempt) {
              console.log('[Kiosco] respuesta descartada (reinicio por watchdog)');
              matchingRef.current = false;
              return;
            }
            markProgress();

            if (result.ok) {
              setState('success');
              const preview = generateFacePreview(video, det.detection.box);
              setPreviewCanvas(preview);
              
              onMatch(result as MatchResult);
              
              setTimeout(() => {
                if (stateRef.current === 'success') {
                  setState('scanning');
                  setMessage('Escaneando… presente su rostro');
                }
                matchingRef.current = false;
                resetChallenge();
              }, 2000);
            } else if (result.tipo === 'cooldown') {
              const min = result.error?.match(/(\d+)/)?.[1] ?? '30';
              setState('cooldown');
              setMessage(`Ya marcó. Espere ${min} min`);
              onCooldown(parseInt(min));
              setTimeout(() => {
                if (stateRef.current === 'cooldown') {
                  setState('scanning');
                  setMessage('Escaneando… presente su rostro');
                }
                matchingRef.current = false;
                resetChallenge();
              }, 2000);
            } else if (result.tipo === 'duplicado') {
              setState('unknown');
              setMessage(result.error ?? 'Ya ha registrado su entrada y salida por hoy');
              onUnknown();
              setTimeout(() => {
                if (stateRef.current === 'unknown') {
                  setState('scanning');
                  setMessage('Escaneando… presente su rostro');
                }
                matchingRef.current = false;
                resetChallenge();
              }, 2000);
            } else if (result.tipo === 'fuera_de_margen') {
              const msg = result.error ?? 'Fuera de horario — requiere autorización (rostro reconocido, solicite pase previo)';
              setState('rejected');
              setMessage(msg);
              notifyRejected({ tipo: 'fuera_de_margen', msg });
              setTimeout(() => {
                if (stateRef.current === 'rejected') {
                  setState('scanning');
                  setMessage('Escaneando… presente su rostro');
                }
                matchingRef.current = false;
                resetChallenge();
              }, 3500);
            } else if (result.tipo === 'bad_challenge') {
              setState('unknown');
              setMessage(result.error ?? 'Desafío inválido');
              onUnknown();
              setTimeout(() => {
                if (stateRef.current === 'unknown') {
                  setState('scanning');
                  setMessage('Escaneando… presente su rostro');
                }
                matchingRef.current = false;
                resetChallenge();
              }, 2000);
            } else {
              setState('unknown');
              setMessage('Rostro no reconocido');
              onUnknown();
              setTimeout(() => {
                if (stateRef.current === 'unknown') {
                  setState('scanning');
                  setMessage('Escaneando… presente su rostro');
                }
                matchingRef.current = false;
                resetChallenge();
              }, 2000);
            }
          } catch (e: any) {
            console.log('[Kiosco] error match:', e?.status, e?.data?.error ?? e?.message);
            if (attemptIdRef.current !== myAttempt) {
              console.log('[Kiosco] error descartado (reinicio por watchdog)');
              matchingRef.current = false;
              return;
            }
            markProgress();
            if (e.status === 401) {
              onError?.('Error de autenticación del kiosco');
              setState('error');
            } else if (e.status === 400) {
              if (e.data?.tipo === 'duplicado') {
                setState('rejected');
                setMessage(e.data.error);
                notifyRejected({ tipo: 'duplicado', msg: e.data.error });
              } else {
                setState('unknown');
                setMessage(e.data?.error ?? 'Datos inválidos');
                onUnknown();
              }
              matchingRef.current = false;
              resetChallenge();
              setTimeout(() => {
                if (stateRef.current === 'unknown' || stateRef.current === 'rejected') {
                  setState('scanning');
                  setMessage('Escaneando… presente su rostro');
                }
              }, 3500);
            } else if (e.status === 404) {
              const causa = e.data?.causa ? ` — ${e.data.causa}` : '';
              const msg = `Rostro no reconocido — verifique registro / re-enrole en condiciones del kiosko${causa}`;
              setState('unknown');
              setMessage(msg);
              console.log('[Kiosco] sin match (404):', e?.data ?? e?.message);
              onUnknown();
              matchingRef.current = false;
              resetChallenge();
              setTimeout(() => {
                if (stateRef.current === 'unknown') {
                  setState('scanning');
                  setMessage('Escaneando… presente su rostro');
                }
              }, 2000);
            } else if (e.status === 409) {
              setState('unknown');
              setMessage('Intento repetido');
              onUnknown();
              matchingRef.current = false;
              resetChallenge();
              setTimeout(() => {
                if (stateRef.current === 'unknown') {
                  setState('scanning');
                  setMessage('Escaneando… presente su rostro');
                }
              }, 2000);
            } else if (e.status === 429) {
              const min = e.data?.error?.match(/(\d+)/)?.[1] ?? '30';
              setState('cooldown');
              setMessage(`Ya marcó. Espere ${min} min`);
              onCooldown(parseInt(min));
              matchingRef.current = false;
              resetChallenge();
              setTimeout(() => {
                if (stateRef.current === 'cooldown') {
                  setState('scanning');
                  setMessage('Escaneando… presente su rostro');
                }
              }, 2000);
            } else if (e.status === 403) {
              const msg = e.data?.error
                ? `${e.data.error} (rostro reconocido, solicite pase previo)`
                : 'Fuera de horario — rostro reconocido, solicite pase previo';
              setState('rejected');
              setMessage(msg);
              console.log('[Kiosco] fichaje rechazado por horario (rostro sí coincidió):', e?.data?.error ?? e?.message);
              notifyRejected({
                tipo: e.data?.tipo ?? 'fuera_de_margen',
                msg,
                nombre: e.data?.nombre,
                apellido: e.data?.apellido,
                cedula: e.data?.cedula,
                empleadoId: e.data?.empleadoId,
              });
              matchingRef.current = false;
              resetChallenge();
              setTimeout(() => {
                if (stateRef.current === 'rejected') {
                  setState('scanning');
                  setMessage('Escaneando… presente su rostro');
                }
              }, 3500);
            } else {
              console.error('[FaceIdentify] Error match:', e);
              onError?.('Error en el servidor: ' + (e.data?.error ?? e.message));
              setState('error');
              matchingRef.current = false;
              resetChallenge();
              setTimeout(() => {
                if (stateRef.current === 'error') {
                  setState('scanning');
                  setMessage('Escaneando… presente su rostro');
                }
              }, 2000);
            }
          }
        }
      } catch (e) {
        console.error('[FaceIdentify] Error inferencia:', e);
      }
    }, INFERENCE_INTERVAL_MS);
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (watchdogRef.current) clearInterval(watchdogRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <div className="face-identify" style={{ position: 'relative', width: '100%', maxWidth: '100%' }}>
      <video
        ref={videoRef}
        autoPlay muted playsInline
        style={{ width: '100%', height: 'auto', borderRadius: 12, background: '#050a14' }}
      />
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      />
      
      {state === 'success' && previewCanvas && (
        <div style={{
          position: 'absolute', top: 16, right: 16,
          width: 128, height: 128, borderRadius: 8,
          border: `2px solid #10b981`, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          background: '#000',
        }}>
          <canvas 
            width={128} height={128} 
            style={{ width: '100%', height: '100%' }}
            ref={(c) => { if (c) c.getContext('2d')?.drawImage(previewCanvas, 0, 0); }}
          />
        </div>
      )}
      
      <div style={{
        position: 'absolute', top: 12, left: 12,
        padding: '8px 12px', borderRadius: 8,
        background: state === 'rejected' ? 'rgba(120,53,15,0.92)' : 'rgba(15,23,42,0.85)',
        border: state === 'rejected' ? '1px solid #f59e0b' : '1px solid rgba(148,163,184,0.2)',
        color: '#fff', fontSize: '.85rem', fontWeight: 500,
      }}>
        {state === 'loading_models' && ' Cargando modelos…'}
        {state === 'starting_camera' && ' Iniciando cámara…'}
        {state === 'scanning' && ' Escaneando…'}
        {state === 'challenge_requested' && ' Solicitando desafío…'}
        {state === 'challenge_active' && message}
        {state === 'matching' && ' Comparando…'}
        {state === 'success' && ' Registrado'}
        {state === 'multi_face' && ' Solo una persona'}
        {state === 'unknown' && ' Rostro no reconocido'}
        {state === 'rejected' && ` Rostro reconocido — ${message}`}
        {state === 'cooldown' && ' Espere para volver a marcar'}
        {state === 'error' && ' Error'}
      </div>
    </div>
  );
}