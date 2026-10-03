'use client';

import { useEffect, useRef, useState } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { 
  loadFaceApiModels, 
  FACE_API_CONFIG, 
  calculateEAR, 
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

interface LivenessQualityData {
  blink: boolean;
  move: boolean;
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
  onQualityChange?: (q: FaceQualityData) => void;
  onLivenessChange?: (q: LivenessQualityData) => void;
}

const LIVENESS_EAR_THRESHOLD = 0.25;
const LIVENESS_POSE_THRESHOLD = 20;
const MIN_BLINK_FRAMES = 1;
const INFERENCE_INTERVAL_MS = 1000;

type IdentifyState = 
  | 'loading_models' 
  | 'starting_camera' 
  | 'scanning' 
  | 'liveness_check' 
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
  
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const blinkStateRef = useRef({ framesBelow: 0, blinked: false });
  const stateRef = useRef<IdentifyState>('loading_models');
  const matchingRef = useRef(false);

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

  const startInferenceLoop = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    
    intervalRef.current = setInterval(async () => {
      if (stateRef.current !== 'scanning' && stateRef.current !== 'liveness_check') return;

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
        
        if (stateRef.current === 'scanning') {
          const livenessOk = checkLiveness(det);
          const blink = blinkStateRef.current.blinked;
          const move = Math.abs(pose.yaw) > 5 || Math.abs(pose.pitch) > 5;
          onLivenessChange?.({ blink, move });
          if (!livenessOk) {
            setState('liveness_check');
            setMessage('Parpadee y mueva la cabeza ligeramente');
            return;
          }
          setState('matching');
        }

        if ((stateRef.current as IdentifyState) === 'matching' && !matchingRef.current) {
          matchingRef.current = true;
          try {
            const descriptor = Array.from(det.descriptor as Float32Array);
            const quality = {
              earOk: blinkStateRef.current.blinked,
              poseOk: Math.abs(pose.yaw) > 5 || Math.abs(pose.pitch) > 5,
              brightness: Math.round(brightness),
              centered,
              distance,
            };
            const nonce = crypto.randomUUID();
            const timestamp = Date.now();

            const result = await api.kiosco.match({ descriptor, quality, nonce, timestamp });

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
              }, 10000);
            }
          } catch (e: any) {
            if (e.status === 401) {
              onError?.('Error de autenticación del kiosco');
              setState('error');
            } else if (e.status === 400) {
              setState('unknown');
              setMessage(e.data?.error ?? 'Datos inválidos');
              onUnknown();
              matchingRef.current = false;
            } else if (e.status === 404) {
              setState('unknown');
              setMessage('Rostro no reconocido');
              onUnknown();
              matchingRef.current = false;
            } else if (e.status === 409) {
              setState('unknown');
              setMessage('Intento repetido');
              onUnknown();
              matchingRef.current = false;
            } else if (e.status === 429) {
              const min = e.data?.error?.match(/(\d+)/)?.[1] ?? '30';
              setState('cooldown');
              setMessage(`Ya marcó. Espere ${min} min`);
              onCooldown(parseInt(min));
              matchingRef.current = false;
            } else {
              console.error('[FaceIdentify] Error match:', e);
              onError?.('Error en el servidor: ' + (e.data?.error ?? e.message));
              matchingRef.current = false;
            }
          }
        }
      } catch (e) {
        console.error('[FaceIdentify] Error inferencia:', e);
      }
    }, INFERENCE_INTERVAL_MS);
  };

  const checkLiveness = (det: any): boolean => {
    const landmarks = det.landmarks;
    
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();
    const ear = (calculateEAR(leftEye) + calculateEAR(rightEye)) / 2;
    
    if (ear < LIVENESS_EAR_THRESHOLD) {
      blinkStateRef.current.framesBelow++;
      if (blinkStateRef.current.framesBelow >= MIN_BLINK_FRAMES) {
        blinkStateRef.current.blinked = true;
      }
    } else {
      blinkStateRef.current.framesBelow = 0;
    }

    const pose = estimateHeadPose(landmarks);
    const poseOk = Math.abs(pose.yaw) > 5 || Math.abs(pose.pitch) > 5;
    
    return blinkStateRef.current.blinked && poseOk;
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
        {state === 'liveness_check' && ' Parpadee y mueva la cabeza'}
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