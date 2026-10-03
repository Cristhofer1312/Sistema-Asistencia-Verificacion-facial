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

interface FaceEnrollProps {
  onCapture: (descriptor: Float32Array) => void;
  onError?: (msg: string) => void;
}

const QUALITY_THRESHOLDS = {
  minDetectionScore: 0.6,
  maxPoseAngle: 20,           // grados yaw/pitch
  minFaceSize: 120,           // px mínimo ancho rostro
  minBrightness: 40,          // 0-255 promedio
  maxBrightness: 220,
};

export function FaceEnroll({ onCapture, onError }: FaceEnrollProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastGoodDescriptorRef = useRef<Float32Array | null>(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [detection, setDetection] = useState<faceapi.FaceDetection | null>(null);
  const [quality, setQuality] = useState<{ ok: boolean; issues: string[] }>({ ok: false, issues: [] });
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');

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

  // Loop detección + calidad (30 FPS)
  useEffect(() => {
    if (!modelsLoaded || !videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    let rafId: number;

    const detectLoop = async () => {
      if (video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafId = requestAnimationFrame(detectLoop);
        return;
      }

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

        // Evaluar calidad
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

        // 3. Tamaño rostro
        const faceWidth = detection.box.width;
        if (faceWidth < QUALITY_THRESHOLDS.minFaceSize) {
          issues.push(`Rostro muy pequeño (${faceWidth.toFixed(0)}px)`);
        }

        // 4. Iluminación (brillo promedio en región del rostro)
        const brightness = estimateBrightness(video, detection.box);
        if (brightness < QUALITY_THRESHOLDS.minBrightness) issues.push('Poca iluminación');
        if (brightness > QUALITY_THRESHOLDS.maxBrightness) issues.push('Sobreexpuesto');

        const ok = issues.length === 0;
        setQuality({ ok, issues });
        setDetection(resized);

        // Debug info visible
        setDebugInfo(`Score: ${(detection.score*100).toFixed(0)}% | W: ${faceWidth.toFixed(0)}px | Brillo: ${brightness.toFixed(0)} | Yaw: ${pose.yaw.toFixed(0)}° Pitch: ${pose.pitch.toFixed(0)}° | OK: ${ok}`);

        // Guardar descriptor válido en ref privada al componente
        lastGoodDescriptorRef.current = ok ? descriptor : null;
      } else if (detections.length > 1) {
        setQuality({ ok: false, issues: ['Múltiples rostros detectados - solo uno'] });
        setDetection(null);
        setDebugInfo(`Múltiples rostros: ${detections.length}`);
      } else {
        setQuality({ ok: false, issues: ['No se detecta rostro'] });
        setDetection(null);
        setDebugInfo('No se detecta rostro');
      }

      rafId = requestAnimationFrame(detectLoop);
    };

    detectLoop();
    return () => cancelAnimationFrame(rafId);
  }, [modelsLoaded]);

  const handleCapture = useCallback(() => {
    const descriptor = lastGoodDescriptorRef.current;
    if (!descriptor) {
      onError?.('Calidad insuficiente para capturar');
      return;
    }
    setIsCapturing(true);
    onCapture(descriptor);
    setIsCapturing(false);
  }, [onCapture, onError]);

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
            ' Rostro apto para captura'
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
          disabled={!quality.ok || isCapturing}
          className="btn btn-primary"
          style={{ padding: '12px 24px', fontSize: '1rem', minWidth: 280 }}
        >
          {isCapturing ? 'Capturando…' : quality.ok ? ' Capturar firma facial' : 'Ajuste rostro para habilitar captura'}
        </button>
      </div>

      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spinner { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}