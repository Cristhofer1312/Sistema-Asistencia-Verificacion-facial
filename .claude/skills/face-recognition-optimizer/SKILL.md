---
name: face-recognition-optimizer
description: Diagnostica y optimiza pipelines de reconocimiento facial (detección, alineación por landmarks, normalización de iluminación, extracción de embeddings con ArcFace/ONNX y búsqueda vectorial) cuando al sistema le cuesta reconocer rostros o tiene altos falsos negativos. Úsala para mejorar la precisión, velocidad de inferencia y robustez del reconocimiento.
---

# Optimización de Precisión en Reconocimiento Facial

## Propósito
Reducir la Tasa de Falsos Rechazos (FRR) sin comprometer la seguridad (Tasa de Falsos Positivos - FAR), asegurando que el rostro llegue al modelo de extracción de características en condiciones geométricas y lumínicas óptimas.

## Diagnóstico y Pipeline de Mejora

Cuando el usuario reporte que al sistema le cuesta reconocer rostros válidos, audita e implementa mejoras siguiendo estrictamente este orden del pipeline:

### 1. Filtro de Calidad Pre-Inferencia (Quality Gate)
Antes de pasar el recorte del rostro al modelo generador de embeddings, valida la calidad del frame para no comparar basura vectorial:
- **Resolución mínima:** El bounding box del rostro debe ser de al menos `112x112` píxeles (o `80x80` mínimo absoluto antes de reescalar). Si es menor, solicita al usuario acercarse.
- **Detección de desenfoque (Motion Blur):** Calcula la varianza del Laplaciano (`cv2.Laplacian(gray, cv2.CV_64F).var()`). Si está por debajo del umbral (ej. `< 80`), descarta el frame y toma el siguiente del buffer de video.
- **Control de Pose (Ángulo de la cabeza):** Usa los 5 puntos faciales (landmarks: ambos ojos, nariz y comisuras de la boca) para estimar *Yaw* (giro lateral) y *Pitch* (inclinación). Si el giro supera ~25°-30°, pide centrar el rostro antes de inferir.

### 2. Alineación Afín Obligatoria (Face Alignment)
El error número uno que degrada modelos como ArcFace R50/R100 es pasar un simple recorte (`crop`) del bounding box sin alinear:
- **Regla crítica:** Siempre aplica una transformación de similitud (`SimilarityTransform` o `cv2.estimateAffinePartial2D`) usando los 5 landmarks detectados (por RetinaFace o SCRFD) hacia las coordenadas canónicas estándar de `112x112`.
- Verifica el orden de canales de color (`RGB` vs `BGR`) y la normalización exacta que espera el modelo ONNX: generalmente `(pixel - 127.5) / 128.0` en formato `NCHW` (`1x3x112x112`, `float32`). Un error entre dividir por `255.0` vs `128.0` destruye la similitud coseno.

### 3. Compensación de Iluminación (Contraluz y Sombras)
Si el reconocimiento falla en entradas con luz cambiante o pantallas brillantes:
- Convierte el rostro alineado al espacio de color `LAB` o `YCrCb`.
- Aplica **CLAHE** (*Contrast Limited Adaptive Histogram Equalization*) **únicamente sobre el canal de luminancia (`L` o `Y`)** con `clipLimit=2.0` y `tileGridSize=(8,8)`, y luego reconvierte a `RGB`. Nunca apliques ecualización de histograma directo sobre los canales RGB porque distorsiona los tonos de piel y altera el vector resultante.

### 4. Estrategia Multi-Plantilla (Multi-Embedding Enrollment) y Centroide
Un solo vector por usuario falla cuando la persona usa lentes, cambia de expresión o varía la iluminación:
- **Enrolamiento Multi-Ángulo:** Al registrar a un usuario, captura entre 3 y 5 muestras (frente neutro, ligera sonrisa, ligera rotación o con/sin accesorios habituales).
- **Normalización L2:** Asegúrate de que cada vector de 512 dimensiones esté normalizado con norma L2 (`v = v / np.linalg.norm(v)`) antes de guardarlo o promediarlo.
- **Cálculo de Match Híbrido:** Almacena los `N` vectores individuales y también su **centroide normalizado** (el promedio de los vectores vuelto a normalizar con L2). En la verificación, compara contra el centroide para velocidad y, si cae en la "zona gris" (ej. similitud coseno entre `0.38` y `0.48`), compara contra las muestras individuales tomando el puntaje máximo (`max-pooling`).
- **Actualización Adaptativa (Template Aging):** Si un usuario es reconocido con una confianza muy alta (ej. `> 0.72`) y pasa la prueba de vida, permite actualizar gradualmente un vector secundario (media móvil ponderada) para adaptarse a cambios graduales de barba, peinado o envejecimiento.

### 5. Agregación Temporal en Video (Multi-Frame Consensus)
No decidas el rechazo con un único frame fallido:
- Captura una ráfaga corta de 3 a 5 frames válidos.
- Extrae los embeddings, normalízalos, calcula el vector promedio de la ráfaga (o evalúa el top-2 de similitud) y recién ahí emite el veredicto. Esto reduce drásticamente los falsos negativos por micro-expresiones o parpadeos.

## Checklist de Depuración Rápida para Claude
Cuando analices el código del usuario por fallos de reconocimiento, verifica en este orden:
1. ¿Se están aplicando exactamente la misma alineación de 5 puntos y normalización de píxeles en el **enrolamiento** y en la **verificación**? (Cualquier asimetría entre ambos flujos arruina el match).
2. ¿Están los vectores normalizados con L2 antes de hacer el producto punto (`dot product`) para la similitud coseno?
3. ¿Qué umbral se está usando? (Para ArcFace con similitud coseno, un umbral típico equilibrado ronda entre `0.40` y `0.50`; si tienen puesto `0.70+`, el sistema rechazará a casi todos los usuarios legítimos en condiciones reales).
