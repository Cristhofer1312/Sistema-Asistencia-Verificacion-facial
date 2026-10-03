// scripts/download-models.mjs
import fs from 'fs';
import https from 'https';
import path from 'path';

const MODELS_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/';
const MODELS = [
  // Tiny Face Detector (recomendado para kiosco - más rápido/liviano)
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model-shard1',
  // Face Landmark 68 (puntos faciales para liveness)
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  // Face Recognition (descriptor 128D)
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1',
  // Face Expression (opcional, no usado actualmente)
  'face_expression_model-weights_manifest.json',
  'face_expression_model-shard1'
];

const DIR = path.join(process.cwd(), 'public', 'models');

if (!fs.existsSync(DIR)) {
  fs.mkdirSync(DIR, { recursive: true });
}

function download(filename) {
  return new Promise((resolve, reject) => {
    const dest = path.join(DIR, filename);
    if (fs.existsSync(dest)) {
      console.log(`✅ ${filename} ya existe`);
      return resolve();
    }
    
    console.log(`⬇️ Descargando ${filename}...`);
    const file = fs.createWriteStream(dest);
    
    https.get(MODELS_URL + filename, (response) => {
      if (response.statusCode !== 200) {
        return reject(new Error(`Failed to download ${filename}: ${response.statusCode}`));
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function main() {
  console.log("Iniciando descarga de modelos de face-api...");
  try {
    for (const model of MODELS) {
      await download(model);
    }
    console.log("🎉 Todos los modelos descargados exitosamente.");
  } catch (err) {
    console.error("❌ Error descargando modelos:", err);
    process.exit(1);
  }
}

main();
