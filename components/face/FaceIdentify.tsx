'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { 
  loadFaceApiModels, 
  FACE_API_CONFIG, 
  calculateEAR, 
  estimateHeadPose, 
  findBestMatch as matchDescriptor,
  generateFacePreview,
  estimateBrightness
} from '@/lib/face-api';

interface DescriptorEntry {
  empleadoId: number;
  cedula: string;
  nombre: string;
  apellido: string;
  descriptor: number[];
}

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

interface FaceIdentifyProps {
  onMatch: (empleado: { empleadoId: number; nombre: string; apellido: string; cedula: string }) => void;
  onMultiFace: () => void;
  onUnknown: () => void;
  onCooldown: (minutos: number) => void;
  onError?: (msg: string) => void;
  onQualityChange?: (q: FaceQualityData) => void;
  onLivenessChange?: (q: LivenessQualityData) => void;
}


const LIVENESS_EAR_THRESHOLD = 0.25;
const LIVENESS_POSE_THRESHOLD = 20;
const MIN_BLINK_FRAMES = 2;
const INFERENCE_INTERVAL_MS = 1000; // 1 FPS throttle (RF-1.4)

type IdentifyState = 
  | 'loading_models' 
  | 'starting_camera' 
  | 'loading_descriptors'
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
  
  const descriptorsRef = useRef<DescriptorEntry[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const blinkStateRef = useRef({ framesBelow: 0, blinked: false });
  const lastMatchRef = useRef<DescriptorEntry | null>(null);
  const cooldownUntilRef = useRef<Map<number, number>>(new Map()); // por empleado
  const stateRef = useRef<IdentifyState>('loading_models');

  // Sincronizar stateRef con state
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // 1. Cargar modelos
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

  // 2. Iniciar cámara y precargar descriptors
  const startCamera = async () => {
    try {
      // Precargar descriptors desde API
      const res = await fetch('/api/kiosco/descriptors', {
        headers: { 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_API_KIOSCO_KEY}` },
      });
      if (!res.ok) throw new Error('No se pudieron cargar descriptores');
      const data = await res.json();
      descriptorsRef.current = data;
      console.log(`[Kiosco] ${data.length} descriptores cargados para match 1:N`);
    } catch (e) {
      onError?.('Error cargando base de datos facial: ' + (e as Error).message);
      return;
    }

    // Cámara
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

  // 3. Loop inferencia (throttled 1 FPS)
  const startInferenceLoop = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    
    intervalRef.current = setInterval(async () => {
      if (stateRef.current !== 'scanning' && stateRef.current !== 'liveness_check') return;


      const videoEl = videoRef.current;
      if (!videoEl || videoEl.readyState !== videoEl.HAVE_ENOUGH_DATA) return;

      try {
        // Detectar rostros
        const detections = await faceapi
          .detectAllFaces(videoEl, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
          .withFaceLandmarks()
          .withFaceDescriptors();

        if (detections.length === 0) return;

        // Multi-rostro
        if (detections.length > 1) {
          setState('multi_face');
          setMessage('Múltiples rostros detectados. Preséntese solo.');
          onMultiFace();
          // Bloquear 5 segundos
          setTimeout(() => {
            if (stateRef.current === 'multi_face') {
              setState('scanning');
              setMessage('Escaneando… presente su rostro');
            }
          }, 5000);
          return;
        }

        const det = detections[0] as any;
        
        // Calcular calidad para panel guía
        const detection = det.detection;
        const landmarks = det.landmarks;
        const video = videoEl;
        const box = detection.box;
        
        // 1. Un solo rostro
        const oneFace = detections.length === 1;
        const oneFaceHint = oneFace ? '' : detections.length === 0 ? 'No se detecta rostro' : 'Solo una persona';
        
        // 2. Centrado
        const videoW = video.videoWidth;
        const boxCenterX = box.x + box.width / 2;
        const centered = Math.abs(boxCenterX - videoW / 2) < videoW * 0.15;
        const centeredHint = centered ? '' : boxCenterX < videoW / 2 ? 'Muévase a la derecha' : 'Muévase a la izquierda';
        
        // 3. Distancia (ancho del rostro en pixels)
        const faceW = box.width;
        const distance = faceW >= 120 && faceW <= 300;
        const distanceHint = faceW < 120 ? 'Acérquese' : faceW > 300 ? 'Aléjese' : '';
        
        // 4. Frente + luz
        const pose = estimateHeadPose(landmarks);
        const brightness = estimateBrightness(video, box);
        const frontLight = Math.abs(pose.yaw) <= 20 && Math.abs(pose.pitch) <= 20 && brightness >= 40 && brightness <= 220;
        let frontLightHint = '';
        if (Math.abs(pose.yaw) > 20) frontLightHint = 'Mire de frente';
        else if (Math.abs(pose.pitch) > 20) frontLightHint = 'Enderece la cabeza';
        else if (brightness < 40) frontLightHint = 'Más luz frontal';
        else if (brightness > 220) frontLightHint = 'Menos luz directa';
        
        // Emitir calidad
        onQualityChange?.({
          oneFace, oneFaceHint,
          centered, centeredHint,
          distance, distanceHint,
          frontLight, frontLightHint,
          allOk: oneFace && centered && distance && frontLight,
        });
        
        // Dibujar box de detección en canvas (color según calidad)
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const displaySize = { width: video.videoWidth, height: video.videoHeight };
            faceapi.matchDimensions(canvas, displaySize);
            const resized = faceapi.resizeResults(det, displaySize) as any;
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Color del box según calidad global
            const allOk = oneFace && centered && distance && frontLight;
            const boxColor = allOk ? '#10b981' : '#ef4444';
            
            // drawDetections solo acepta 2 args: canvas, detections
            // Para cambiar color, necesitamos dibujar manualmente
            const resizedDet = resized.detection;
            ctx.strokeStyle = boxColor;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.rect(resizedDet.box.x, resizedDet.box.y, resizedDet.box.width, resizedDet.box.height);
            ctx.stroke();
          }
        }
        
        // Liveness check (parpadeo + pose)
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

        // Match 1:N local
        const match = findBestMatch(det.descriptor);
        if (match) {
          const until = cooldownUntilRef.current.get(match.entry.empleadoId) ?? 0;
          if (Date.now() < until) {
            const minutos = Math.ceil((until - Date.now()) / 60000);
            setState('cooldown');
            setMessage(`Ya marcó. Espere ${minutos} min`);
            onCooldown(minutos);
            blinkStateRef.current = { framesBelow: 0, blinked: false };
            setTimeout(() => {
              if (stateRef.current === 'cooldown') {
                setState('scanning');
                setMessage('Escaneando… presente su rostro');
              }
            }, 3000);
            return;
          }
          lastMatchRef.current = match.entry;
          setState('success');
          
          // Generar preview rostro recortado
          const preview = generateFacePreview(video, det.detection.box);
          setPreviewCanvas(preview);
          
          onMatch({
            empleadoId: match.entry.empleadoId,
            nombre: match.entry.nombre,
            apellido: match.entry.apellido,
            cedula: match.entry.cedula,
          });
          
          // Cooldown 30 min solo para este empleado
          cooldownUntilRef.current.set(match.entry.empleadoId, Date.now() + 30 * 60 * 1000);
          blinkStateRef.current = { framesBelow: 0, blinked: false };
          setTimeout(() => {
            if (stateRef.current === 'success') {
              setState('scanning');
              setMessage('Escaneando… presente su rostro');
            }
          }, 3000); // Mostrar éxito 3s (RF-3.5)
        } else {
          // Desconocido
          setState('unknown');
          setMessage('Rostro no registrado');
          onUnknown();
          setTimeout(() => {
            if (stateRef.current === 'unknown') {
              setState('scanning');
              setMessage('Escaneando… presente su rostro');
            }
          }, 10000); // 10s (RF-3.6)
        }
      } catch (e) {
        console.error('[FaceIdentify] Error inferencia:', e);
      }
    }, INFERENCE_INTERVAL_MS);
  };

  // Liveness: EAR (parpadeo) + Pose (movimiento cabeza)
  const checkLiveness = (det: any): boolean => {
    const landmarks = det.landmarks;
    
    // Eye Aspect Ratio (promedio ojo izquierdo + derecho)
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();
    const ear = (calculateEAR(leftEye) + calculateEAR(rightEye)) / 2;
    
    // Detectar parpadeo (EAR bajo por frames consecutivos)
    if (ear < LIVENESS_EAR_THRESHOLD) {
      blinkStateRef.current.framesBelow++;
      if (blinkStateRef.current.framesBelow >= MIN_BLINK_FRAMES) {
        blinkStateRef.current.blinked = true;
      }
    } else {
      blinkStateRef.current.framesBelow = 0;
    }

    // Pose (yaw/pitch)
    const pose = estimateHeadPose(landmarks);
    const poseOk = Math.abs(pose.yaw) > 5 || Math.abs(pose.pitch) > 5; // Movimiento mínimo
    
    return blinkStateRef.current.blinked && poseOk;
  };

  // Match 1:N por distancia euclidiana + margen de ambigüedad (ver lib/face-api.ts)
  const findBestMatch = (descriptor: Float32Array): { entry: DescriptorEntry; distance: number } | null =>
    matchDescriptor(descriptor, descriptorsRef.current);

  // Cleanup
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Render
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
      
      {/* Preview rostro en éxito (RF-3.5) */}
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
      
      {/* Estado minimal en esquina */}
      <div style={{
        position: 'absolute', top: 12, left: 12,
        padding: '8px 12px', borderRadius: 8,
        background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(148,163,184,0.2)',
        color: '#fff', fontSize: '.85rem', fontWeight: 500,
      }}>
        {state === 'loading_models' && ' Cargando modelos…'}
        {state === 'starting_camera' && ' Iniciando cámara…'}
        {state === 'loading_descriptors' && ' Cargando base facial…'}
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