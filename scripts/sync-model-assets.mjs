import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const BUCKET = process.env.R2_MODEL_BUCKET || 'markdown-stripper-models';
const CACHE_CONTROL = 'public, max-age=31536000, immutable';
const WRANGLER = ['--yes', 'wrangler@4.127.1'];
const models = [
  {
    id: 'onnx-community/bert-small-pii-detection-ONNX',
    revision: '6cb4e77c2b2c7f81e731b88cffa9b7a6fc675a4c',
    onnxFiles: ['onnx/model_quantized.onnx'],
  },
  {
    id: 'mixedbread-ai/mxbai-embed-xsmall-v1',
    revision: 'e6ac24e5d6efb8782b59de1647b3ececb4ece94e',
  },
];
const languages = ['eng', 'fra', 'deu', 'spa', 'ita', 'nld', 'por'];

function contentType(filename) {
  if (filename.endsWith('.json')) return 'application/json';
  if (filename.endsWith('.wasm')) return 'application/wasm';
  if (filename.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filename.endsWith('.txt')) return 'text/plain; charset=utf-8';
  if (filename.endsWith('.gz')) return 'application/gzip';
  return 'application/octet-stream';
}

function upload(file, key) {
  console.log(`Uploading ${key}`);
  const result = spawnSync('npx', [
    ...WRANGLER,
    'r2', 'object', 'put', `${BUCKET}/${key}`,
    '--remote', '--file', file,
    '--content-type', contentType(file),
    '--cache-control', CACHE_CONTROL,
    '--force',
  ], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Upload failed: ${key}`);
}

async function download(url, destination) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`${response.status} downloading ${url}`);
  await writeFile(destination, new Uint8Array(await response.arrayBuffer()));
}

function isBrowserModelFile(filename) {
  if (!filename.includes('/') && filename.endsWith('.json')) return true;
  if (/^(?:1_Pooling|2_Normalize)\/config\.json$/.test(filename)) return true;
  if (/^(?:tokenizer\.model|vocab\.txt|merges\.txt)$/.test(filename)) return true;
  return /^onnx\/.*(?:_quantized|_q4f16)\.onnx(?:_data)?$/.test(filename);
}

function isRequiredModelFile(filename, model) {
  if (!isBrowserModelFile(filename)) return false;
  return !filename.startsWith('onnx/') || !model.onnxFiles || model.onnxFiles.includes(filename);
}

async function mirrorModel(temp, model) {
  const api = `https://huggingface.co/api/models/${model.id}/revision/${model.revision}`;
  const response = await fetch(api);
  if (!response.ok) throw new Error(`${response.status} reading ${api}`);
  const metadata = await response.json();
  const files = metadata.siblings.map(item => item.rfilename).filter(filename => isRequiredModelFile(filename, model));
  if (!files.some(file => file.startsWith('onnx/'))) {
    throw new Error(`No quantized ONNX files found for ${model.id}`);
  }
  for (const filename of files) {
    const local = path.join(temp, filename.replaceAll('/', '__'));
    const source = `https://huggingface.co/${model.id}/resolve/${model.revision}/${filename}`;
    await download(source, local);
    upload(local, `huggingface/${model.id}/resolve/${model.revision}/${filename}`);
  }
}

async function mirrorTesseract(temp) {
  const worker = path.resolve('node_modules/tesseract.js/dist/worker.min.js');
  upload(worker, 'tesseract/6.0.1/worker.min.js');

  const coreDir = path.resolve('node_modules/tesseract.js-core');
  for (const filename of await readdir(coreDir)) {
    if (!/^tesseract-core(?:-simd)?(?:-lstm)?\.wasm(?:\.js)?$/.test(filename)) continue;
    upload(path.join(coreDir, filename), `tesseract-core/6.1.2/${filename}`);
  }

  for (const language of languages) {
    const local = path.join(temp, `${language}.traineddata.gz`);
    await download(
      `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${language}/4.0.0_best_int/${language}.traineddata.gz`,
      local,
    );
    upload(local, `tessdata/4.0.0_best_int/${language}.traineddata.gz`);
  }
}

const temp = await mkdtemp(path.join(tmpdir(), 'markdown-stripper-models-'));
try {
  for (const model of models) await mirrorModel(temp, model);
  await mirrorTesseract(temp);
  console.log(`Model assets synced to R2 bucket ${BUCKET}.`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
