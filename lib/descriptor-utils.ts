/**
 * Utilidades para conversión de descriptores faciales
 * Sin dependencias de face-api.js para uso en server-side
 */

/**
 * Convierte descriptor Float32Array a array para JSON/BD
 */
export function descriptorToArray(descriptor: Float32Array): number[] {
  return Array.from(descriptor);
}

/**
 * Convierte array a Float32Array
 */
export function arrayToDescriptor(arr: number[]): Float32Array {
  return new Float32Array(arr);
}

/**
 * Convierte descriptor a Buffer para Prisma (Bytes/Bytea)
 */
export function descriptorToBuffer(descriptor: Float32Array): Buffer {
  return Buffer.from(descriptor.buffer);
}

/**
 * Convierte Buffer de Prisma a Float32Array
 * IMPORTANTE: Buffer.buffer puede apuntar al pool interno de Node.js con byteOffset != 0.
 * Usar .slice() garantiza un ArrayBuffer propio y alineado.
 */
export function bufferToDescriptor(buffer: Buffer): Float32Array {
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return new Float32Array(ab);
}

/**
 * Promedia N descriptores frame-a-frame y renormaliza L2.
 * El promediado reduce el ruido de captura (misma técnica en enrolamiento
 * y en el probe del kiosco): la varianza del promedio cae ~1/N.
 * La renormalización L2 es vital para que la distancia euclidiana sea
 * comparable con descriptores individuales del modelo.
 */
export function averageDescriptors(descriptors: Float32Array[]): Float32Array {
  const averaged = new Float32Array(128);
  if (descriptors.length === 0) return averaged;
  let norm = 0;
  for (let i = 0; i < 128; i++) {
    let sum = 0;
    for (const d of descriptors) {
      sum += d[i];
    }
    const val = sum / descriptors.length;
    averaged[i] = val;
    norm += val * val;
  }
  const length = Math.sqrt(norm);
  if (length > 0) {
    for (let i = 0; i < 128; i++) {
      averaged[i] = averaged[i] / length;
    }
  }
  return averaged;
}