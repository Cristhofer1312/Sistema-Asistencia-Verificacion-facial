'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as faceapi from '@vladmandic/face-api';
import {
  loadFaceApiModels,
  FACE_API_CONFIG,
  calculateEAR,
  estimateHeadPose,
  estimateBrightness
} from '@/lib/face-api';
import { FACE_QUALITY } from '@/lib/face-quality';
import { averageDescriptors } from '@/lib/descriptor-utils';

interface FaceEnrollProps {
  onCapture: (descriptor: Float32Array) => void;
  onError?: (msg: string) => void;
}

const Q = FACE_QUALITY.enroll;

const QUALITY_THRESHOLDS = {
  minDetectionScore: Q.minScore,
  maxPoseAngle: Q.maxAngle,           // grados yaw/pitch
  minFaceSize: Q.minFaceSize,         // px mínimo ancho rostro
  maxFaceSize: Q.maxFaceSize,         // px máximo (muy cerca deforma)
  minBrightness: Q.minBrightness,     // 0-255 (igual que el kiosco)
  maxBrightness: Q.maxBrightness,
  centerTolerance: Q.centerTolerance, // fracción del ancho
  requiredSamples: Q.samples,        // buenas CONSECUTIVAS (estricto)
};

export function FaceEnroll({ onCapture, onError }: FaceEnrollProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recentGoodDescriptorsRef = useRef<Float32Array[]>([]);
  const autoFiredRef = useRef(false); // auto-captura ya disparada para el buffer actual
  const isCapturingRef = useRef(false); // espejo sincrónico de isCapturing
  const handleCaptureRef = useRef<() => void>(() => {});
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [detection, setDetection] = useState<faceapi.FaceDetection | null>(null);
  const [quality, setQuality] = useState<{ ok: boolean; issues: string[] }>({ ok: false, issues: [] });
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [sampleCount, setSampleCount] = useState(0); // progreso del buffer estricto

  // Cargar modelos al montar
  useEffect(() => {
    let mounted = true;
    async function loadModels() {
      try {
        await loadFaceApiModels();
        if (mounted) setModelsLoaded(true);
      } catch (e) {
        onError?.('Error cargando modelos de IA: ' + (e as Error).message);
      }
    }
    loadModels();
    return () => { mounted = false; };
  }, [onError]);

  // Iniciar cámara
  useEffect(() => {
    if (!modelsLoaded) return;
    navigator.mediaDevices.getUserMedia({ 
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } 
    })
      .then(s => { 
        if (videoRef.current) videoRef.current.srcObject = s;
        setStream(s); 
      })
      .catch(() => onError?.('No se pudo acceder a la cámara'));
    return () => stream?.getTracks().forEach(t => t.stop());
  }, [modelsLoaded, onError]);

  // Loop detección + calidad (~8 fps: a 864px cada frame es costoso y con
  // 5 muestras bastan ~2 s; rAF a 60fps era desperdicio de CPU/batería).
  useEffect(() => {
    if (!modelsLoaded || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    let running = false;
    let autoTimer: ReturnType<typeof setTimeout> | null = null;

    const pushSample = (descriptor: Float32Array, ok: boolean) => {
      if (ok) {
        recentGoodDescriptorsRef.current.push(descriptor);
        if (recentGoodDescriptorsRef.current.length > QUALITY_THRESHOLDS.requiredSamples) {
          recentGoodDescriptorsRef.current.shift();
        }
      } else {
        // Estricto: 1 frame malo vacía el buffer (5 consecutivas o nada).
        recentGoodDescriptorsRef.current = [];
        autoFiredRef.current = false;
      }
      const n = recentGoodDescriptorsRef.current.length;
      setSampleCount((prev) => (prev === n ? prev : n));
      // Automático: al completar las muestras se captura solo tras una
      // pausa breve (deja 1-2 frames extra de estabilidad). Si el buffer se
      // resetea antes, autoFired se apaga y no se dispara nada.
      if (n >= QUALITY_THRESHOLDS.requiredSamples && !autoFiredRef.current) {
        autoFiredRef.current = true;
        autoTimer = setTimeout(() => {
          if (autoFiredRef.current && recentGoodDescriptorsRef.current.length >= QUALITY_THRESHOLDS.requiredSamples) {
            handleCaptureRef.current();
          }
        }, 600);
      }
    };

    const tick = async () => {
      if (running) return;
      if (video.readyState !== video.HAVE_ENOUGH_DATA) return;
      running = true;
      try {
        const displaySize = { width: video.videoWidth, height: video.videoHeight };
        faceapi.matchDimensions(canvas, displaySize);

        const detections = await faceapi
          .detectAllFaces(video, FACE_API_CONFIG.tinyFaceDetectorOptionsEnroll)
          .withFaceLandmarks()
          .withFaceDescriptors();

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (detections.length === 1) {
          const det = detections[0] as any;
          const resized = faceapi.resizeResults(det, displaySize);

          // Dibujar bounding box + landmarks
          faceapi.draw.drawDetections(canvas, [resized]);
          faceapi.draw.drawFaceLandmarks(canvas, [resized]);

          // Evaluar calidad (misma escala que el kiosco)
          const issues: string[] = [];
          const { detection, landmarks, descriptor } = det;

          // 1. Score detección
          if (detection.score < QUALITY_THRESHOLDS.minDetectionScore) {
            issues.push(`Confianza baja (${(detection.score * 100).toFixed(0)}%)`);
          }

          // 2. Pose (yaw/pitch) via landmarks
          const pose = estimateHeadPose(landmarks);
          if (Math.abs(pose.yaw) > QUALITY_THRESHOLDS.maxPoseAngle || Math.abs(pose.pitch) > QUALITY_THRESHOLDS.maxPoseAngle) {
            issues.push(`Ángulo cabeza: yaw ${pose.yaw.toFixed(0)}° pitch ${pose.pitch.toFixed(0)}°`);
          }

          // 3. Tamaño rostro (mínimo y máximo, como el kiosco)
          const faceWidth = detection.box.width;
          if (faceWidth < QUALITY_THRESHOLDS.minFaceSize) {
            issues.push(`Rostro muy pequeño (${faceWidth.toFixed(0)}px, acérquese)`);
          } else if (faceWidth > QUALITY_THRESHOLDS.maxFaceSize) {
            issues.push(`Rostro muy grande (${faceWidth.toFixed(0)}px, aléjese)`);
          }

          // 4. Centrado horizontal (como el kiosco)
          const boxCenterX = detection.box.x + faceWidth / 2;
          const offCenter = Math.abs(boxCenterX - video.videoWidth / 2) > video.videoWidth * QUALITY_THRESHOLDS.centerTolerance;
          if (offCenter) {
            issues.push(boxCenterX < video.videoWidth / 2 ? 'Muévase a la derecha' : 'Muévase a la izquierda');
          }

          // 5. Iluminación (brillo promedio en región del rostro)
          const brightness = estimateBrightness(video, detection.box);
          if (brightness < QUALITY_THRESHOLDS.minBrightness) issues.push('Poca iluminación (igual que exige el kiosco)');
          if (brightness > QUALITY_THRESHOLDS.maxBrightness) issues.push('Sobreexpuesto');

          const ok = issues.length === 0;
          setQuality({ ok, issues });
          setDetection(resized);

          // Buffer estricto de promediado (5 consecutivas)
          pushSample(descriptor, ok);

          // Debug info visible
          setDebugInfo(`Score: ${(detection.score*100).toFixed(0)}% | W: ${faceWidth.toFixed(0)}px | Brillo: ${brightness.toFixed(0)} | Yaw: ${pose.yaw.toFixed(0)}° Pitch: ${pose.pitch.toFixed(0)}° | Muestras: ${recentGoodDescriptorsRef.current.length}/${QUALITY_THRESHOLDS.requiredSamples}`);
        } else if (detections.length > 1) {
          setQuality({ ok: false, issues: ['Múltiples rostros detectados - solo uno'] });
          setDetection(null);
          setDebugInfo(`Múltiples rostros: ${detections.length}`);
          pushSample(new Float32Array(0), false);
        } else {
          setQuality({ ok: false, issues: ['No se detecta rostro'] });
          setDetection(null);
          setDebugInfo('No se detecta rostro');
          pushSample(new Float32Array(0), false);
        }
      } finally {
        running = false;
      }
    };

    const id = setInterval(() => { void tick(); }, 125);
    return () => {
      clearInterval(id);
      if (autoTimer) clearTimeout(autoTimer);
    };
  }, [modelsLoaded]);

  const handleCapture = useCallback(() => {
    if (isCapturingRef.current) return; // evita doble disparo (auto + clic)
    const descriptors = recentGoodDescriptorsRef.current;
    if (descriptors.length < QUALITY_THRESHOLDS.requiredSamples) {
      onError?.(`Faltan muestras estables (${descriptors.length}/${QUALITY_THRESHOLDS.requiredSamples}): mantenga el rostro quieto con buena luz.`);
      return;
    }

    // Promedio de las últimas 5 muestras + renormalización L2
    // (misma técnica que el probe del kiosco — ver averageDescriptors).
    const averaged = averageDescriptors(descriptors);

    isCapturingRef.current = true;
    setIsCapturing(true);
    onCapture(averaged);
    // autoFired se mantiene en true: solo un reseteo del buffer (frame malo)
    // + nuevo llenado puede disparar otra auto-captura. El botón manual
    // sigue disponible para reintentos explícitos.
    isCapturingRef.current = false;
    setIsCapturing(false);
  }, [onCapture, onError]);

  useEffect(() => {
    handleCaptureRef.current = handleCapture;
  }, [handleCapture]);

  if (!modelsLoaded) {
    return (
      <div className="face-enroll-loading" style={{ 
        display: 'flex', alignItems: 'center', justifyContent: 'center', 
        minHeight: 300, color: '#94a3b8', fontSize: '1.1rem' 
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div className="spinner" style={{ 
            width: 32, height: 32, border: '3px solid var(--border)', 
            borderTopColor: 'var(--brand)', borderRadius: '50%', 
            animation: 'spin 1s linear infinite' 
          }} />
          <span>Cargando modelos IA…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="face-enroll" style={{ position: 'relative', width: '100%', maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#000' }}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{ width: '100%', height: 'auto', display: 'block' }}
        />
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        />
        
        {/* Overlay calidad */}
        <div style={{ 
          position: 'absolute', bottom: 12, left: 12, right: 12, 
          padding: 12, borderRadius: 8, 
          background: quality.ok ? 'rgba(5,150,105,0.9)' : 'rgba(220,38,38,0.9)',
          color: '#fff', fontSize: '.85rem', fontWeight: 500
        }}>
          {quality.ok ? (
            sampleCount >= QUALITY_THRESHOLDS.requiredSamples
              ? ` Datos listos — capturando automáticamente…`
              : ` Rostro apto — muestras ${sampleCount}/${QUALITY_THRESHOLDS.requiredSamples}`
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span> Ajuste posición:</span>
              {quality.issues.map((i, idx) => <span key={idx}>• {i}</span>)}
            </div>
          )}
        </div>

        {/* Debug info */}
        {debugInfo && (
          <div style={{ 
            position: 'absolute', top: 12, left: 12, right: 12, 
            padding: 8, borderRadius: 8, 
            background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: '.7rem', fontFamily: 'monospace'
          }}>
            {debugInfo}
          </div>
        )}
      </div>

      {/* Botón capturar - fuera del contenedor con overflow:hidden */}
      <div style={{ textAlign: 'center' }}>
        <button
          type="button"
          onClick={handleCapture}
          disabled={sampleCount < QUALITY_THRESHOLDS.requiredSamples || isCapturing}
          className="btn btn-primary"
          style={{ padding: '12px 24px', fontSize: '1rem', minWidth: 280 }}
        >
          {isCapturing ? 'Capturando…' : sampleCount >= QUALITY_THRESHOLDS.requiredSamples ? 'Finalizar captura' : `Estabilizando rostro… ${sampleCount}/${QUALITY_THRESHOLDS.requiredSamples}`}
        </button>
      </div>

      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spinner { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}