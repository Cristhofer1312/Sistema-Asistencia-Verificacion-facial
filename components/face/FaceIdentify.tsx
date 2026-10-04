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

interface FaceIdentifyProps {
  onMatch: (result: MatchResult) => void;
  onMultiFace: () => void;
  onUnknown: () => void;
  onCooldown: (minutos: number) => void;
  onError?: (msg: string) => void;
  onQualityChange?: (q: any) => void;
  onLivenessChange?: (q: LivenessQualityData) => void;
}

const INFERENCE_INTERVAL_MS = 1000;
const YAW_THRESHOLD = 12;
const PITCH_THRESHOLD = 12;

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
  | 'cooldown' 
  | 'error';

export function FaceIdentify({ 
  onMatch, onMultiFace, onUnknown, onCooldown, onError,
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
  const stateRef = useRef<IdentifyState>('loading_models');
  const matchingRef = useRef(false);
  const challengeIdRef = useRef<string | null>(null);
  const seriesRef = useRef<{ yaw: number; pitch: number; t: number }[]>([]);
  const challengeStartTimeRef = useRef<number>(0);
  const challengeStepsRef = useRef<{ step: string; completed: boolean }[]>([]);
  const currentStepIdxRef = useRef<number>(0);

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
      startInferenceLoop();
    } catch {
      onError?.('No se pudo acceder a la cámara');
      setState('error');
    }
  };

  const requestChallenge = async () => {
    try {
      console.log('[Kiosco] solicitando challenge al servidor…');
      const result = await api.kiosco.challenge();
      console.log('[Kiosco] challenge recibido:', result.steps.join(' → '));
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
          .detectAllFaces(videoEl, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
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
          }, 5000);
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
        const frontLight = Math.abs(pose.yaw) <= 20 && Math.abs(pose.pitch) <= 20 && brightness >= 40 && brightness <= 220;
        let frontLightHint = '';
        if (Math.abs(pose.yaw) > 20) frontLightHint = 'Mire de frente';
        else if (Math.abs(pose.pitch) > 20) frontLightHint = 'Enderece la cabeza';
        else if (brightness < 40) frontLightHint = 'Más luz frontal';
        else if (brightness > 220) frontLightHint = 'Menos luz directa';
        
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
        
        // Liveness: solo pose (movimiento de cabeza)
        const move = Math.abs(pose.yaw) > 5 || Math.abs(pose.pitch) > 5;
        
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
          if (expected === 'IZQUIERDA') stepOk = pose.yaw <= -12;
          else if (expected === 'DERECHA') stepOk = pose.yaw >= 12;
          else if (expected === 'FRENTE') stepOk = Math.abs(pose.yaw) < 8 && Math.abs(pose.pitch) < 8;

          if (stepOk) {
            console.log(`[Kiosco] paso ${idx + 1}/${steps.length} completado: ${expected}`);
            steps[idx] = { ...step, completed: true };
            currentStepIdxRef.current = idx + 1;
            if (idx + 1 >= steps.length) {
              setState('matching');
              setMessage('Comparando…');
              console.log('[Kiosco] challenge completo, enviando probe al servidor en el próximo ciclo…');
            } else {
              updateChallengeUI();
            }
          }
          return;
        }
        
        if ((stateRef.current as IdentifyState) === 'matching' && !matchingRef.current) {
          matchingRef.current = true;
          try {
            const descriptor = Array.from(det.descriptor as Float32Array);
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
              quality, 
              nonce, 
              timestamp,
              challengeId: challengeIdRef.current ?? undefined,
              series: seriesRef.current.length > 0 ? seriesRef.current : undefined,
            });
            console.log('[Kiosco] respuesta match:', result.ok ? `${result.tipo} — ${result.msg}` : result);

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
              }, 3000);
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
              }, 3000);
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
              }, 5000);
            } else if (result.tipo === 'fuera_de_margen') {
              setState('unknown');
              setMessage(result.error ?? 'Fuera de horario — requiere autorización');
              onUnknown();
              setTimeout(() => {
                if (stateRef.current === 'unknown') {
                  setState('scanning');
                  setMessage('Escaneando… presente su rostro');
                }
                matchingRef.current = false;
                resetChallenge();
              }, 10000);
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
              }, 10000);
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
              }, 10000);
            }
          } catch (e: any) {
            console.log('[Kiosco] error match:', e?.status, e?.data?.error ?? e?.message);
            if (e.status === 401) {
              onError?.('Error de autenticación del kiosco');
              setState('error');
            } else if (e.status === 400) {
              setState('unknown');
              setMessage(e.data?.error ?? 'Datos inválidos');
              onUnknown();
              matchingRef.current = false;
              resetChallenge();
            } else if (e.status === 404) {
              setState('unknown');
              setMessage('Rostro no reconocido');
              onUnknown();
              matchingRef.current = false;
              resetChallenge();
            } else if (e.status === 409) {
              setState('unknown');
              setMessage('Intento repetido');
              onUnknown();
              matchingRef.current = false;
              resetChallenge();
            } else if (e.status === 429) {
              const min = e.data?.error?.match(/(\d+)/)?.[1] ?? '30';
              setState('cooldown');
              setMessage(`Ya marcó. Espere ${min} min`);
              onCooldown(parseInt(min));
              matchingRef.current = false;
              resetChallenge();
            } else {
              console.error('[FaceIdentify] Error match:', e);
              onError?.('Error en el servidor: ' + (e.data?.error ?? e.message));
              matchingRef.current = false;
              resetChallenge();
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
        background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(148,163,184,0.2)',
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
        {state === 'unknown' && ' No registrado'}
        {state === 'cooldown' && ' Espere para volver a marcar'}
        {state === 'error' && ' Error'}
      </div>
    </div>
  );
}