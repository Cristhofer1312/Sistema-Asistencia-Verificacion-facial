// scripts/copiar-modelos.mjs — Copia los modelos de face-api a public/models.
// lib/face-api.ts los carga desde /models; no se versionan (.gitignore) porque
// ya vienen en el paquete @vladmandic/face-api. Corre antes de `dev` y `build`
// (también dentro del Dockerfile, vía `npm run build`).
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ORIGEN = join("node_modules", "@vladmandic", "face-api", "model");
const DESTINO = join("public", "models");
const MODELOS = ["tiny_face_detector_model", "face_landmark_68_model", "face_recognition_model"];

if (!existsSync(ORIGEN)) {
  console.error(`[modelos] No existe ${ORIGEN}. Ejecute npm install primero.`);
  process.exit(1);
}
mkdirSync(DESTINO, { recursive: true });

let copiados = 0;
for (const m of MODELOS) {
  for (const archivo of [`${m}-weights_manifest.json`, `${m}.bin`]) {
    const de = join(ORIGEN, archivo);
    const a = join(DESTINO, archivo);
    if (existsSync(a) && statSync(a).size === statSync(de).size) continue;
    copyFileSync(de, a);
    copiados++;
  }
}
console.log(copiados ? `[modelos] ${copiados} archivo(s) copiados a ${DESTINO}` : "[modelos] public/models al día");
