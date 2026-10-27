// scripts/copiar-modelos.mjs — Copia los modelos de face-api a public/models.
// lib/face-api.ts los carga desde /models; no se versionan (.gitignore) porque
// ya vienen en el paquete @vladmandic/face-api. Corre antes de `dev` y `build`
// (también dentro del Dockerfile, vía `npm run build`).
//
// También descarga COCO-SSD (detector de celulares/pantallas, lib/anti-pantalla.ts),
// que no viene en ningún paquete npm: se baja una sola vez del bucket oficial de
// TensorFlow y cada archivo se verifica por SHA-256 antes de usarlo.
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
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

// ── COCO-SSD (SSDLite MobileNet v2, ~18 MB) ────────────────────────────────
const COCO_URL = "https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2";
const COCO_DESTINO = join(DESTINO, "coco-ssd");
const COCO_ARCHIVOS = {
  "model.json": "3770b2528339b1e3340cb74360e1e40401816b009779aeb8d0cce3a4353ea3a9",
  "group1-shard1of5": "0e7af0f713e98521252321f7f84892c31cefccccec3ac64c84e5065b75ed5646",
  "group1-shard2of5": "74cc6cfc2c4510c9cd81b8ad4cebf6f6a8f305119bb365ce0eb96276da38519a",
  "group1-shard3of5": "50383033f893eae136392a403e8f70ade5efd90867df5695c4ca5ac640e14f38",
  "group1-shard4of5": "d856dc534c780068bbf6c666ce1516df2c8433d87578aa31fcdf197de7058cc2",
  "group1-shard5of5": "3d356f1fb6dfca6af78c56db34d9326706d0196e303f9de6b04f236ca79ed309",
};
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

mkdirSync(COCO_DESTINO, { recursive: true });
let descargados = 0;
for (const [archivo, hash] of Object.entries(COCO_ARCHIVOS)) {
  const a = join(COCO_DESTINO, archivo);
  if (existsSync(a) && sha256(readFileSync(a)) === hash) continue;
  let res;
  try {
    res = await fetch(`${COCO_URL}/${archivo}`);
  } catch (e) {
    console.error(`[modelos] No se pudo descargar ${archivo} (${e.cause?.code ?? e.message}). Se requiere internet la primera vez.`);
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`[modelos] Descarga de ${archivo} falló: HTTP ${res.status}`);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha256(buf) !== hash) {
    console.error(`[modelos] ${archivo}: el SHA-256 no coincide; descarga descartada.`);
    process.exit(1);
  }
  writeFileSync(`${a}.tmp`, buf);
  renameSync(`${a}.tmp`, a);
  descargados++;
}
console.log(descargados ? `[modelos] COCO-SSD: ${descargados} archivo(s) descargados y verificados` : "[modelos] COCO-SSD al día");
