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