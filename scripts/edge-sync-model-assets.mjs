const workerUrl = process.env.SYNC_WORKER_URL?.replace(/\/$/, '');
const token = process.env.SYNC_TOKEN;

if (!workerUrl || !token) {
  console.error('Set SYNC_WORKER_URL and SYNC_TOKEN before running this script.');
  process.exit(1);
}

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
const coreFiles = [
  'tesseract-core.wasm.js',
  'tesseract-core.wasm',
  'tesseract-core-simd.wasm.js',
  'tesseract-core-simd.wasm',
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-lstm.wasm',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm',
];

function contentType(filename) {
  if (filename.endsWith('.json')) return 'application/json';
  if (filename.endsWith('.wasm')) return 'application/wasm';
  if (filename.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filename.endsWith('.txt')) return 'text/plain; charset=utf-8';
  if (filename.endsWith('.gz')) return 'application/gzip';
  return 'application/octet-stream';
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

async function modelJobs(model) {
  const api = `https://huggingface.co/api/models/${model.id}/revision/${model.revision}`;
  const response = await fetch(api, { headers: { 'User-Agent': 'markdown-stripper-model-sync/1.0' } });
  if (!response.ok) throw new Error(`${response.status} discovering ${model.id}`);
  const metadata = await response.json();
  const filenames = metadata.siblings.map(item => item.rfilename).filter(filename => isRequiredModelFile(filename, model));
  if (!filenames.some(filename => filename.startsWith('onnx/'))) {
    throw new Error(`No quantized browser ONNX files found for ${model.id}`);
  }
  return filenames.map(filename => ({
    source: `https://huggingface.co/${model.id}/resolve/${model.revision}/${filename}`,
    key: `huggingface/${model.id}/resolve/${model.revision}/${filename}`,
    contentType: contentType(filename),
  }));
}

function tesseractJobs() {
  return [
    {
      source: 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',
      key: 'tesseract/6.0.1/worker.min.js',
      contentType: 'text/javascript; charset=utf-8',
    },
    ...coreFiles.map(filename => ({
      source: `https://cdn.jsdelivr.net/npm/tesseract.js-core@6.1.2/${filename}`,
      key: `tesseract-core/6.1.2/${filename}`,
      contentType: contentType(filename),
    })),
    ...languages.map(language => ({
      source: `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${language}/4.0.0_best_int/${language}.traineddata.gz`,
      key: `tessdata/4.0.0_best_int/${language}.traineddata.gz`,
      contentType: 'application/gzip',
    })),
  ];
}

async function submit(job, attempt = 1) {
  console.log(`[${attempt}/3] ${job.key}`);
  try {
    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(job),
      signal: AbortSignal.timeout(15 * 60 * 1000),
    });
    const text = await response.text();
    let result;
    try { result = JSON.parse(text); } catch { result = { error: text }; }
    if (!response.ok || !result.uploaded) {
      throw new Error(`${response.status}: ${JSON.stringify(result)}`);
    }
    console.log(`  uploaded ${result.size?.toLocaleString() ?? '?'} bytes`);
    return result;
  } catch (error) {
    if (attempt >= 3) throw error;
    await new Promise(resolve => setTimeout(resolve, attempt * 2_000));
    return submit(job, attempt + 1);
  }
}

const jobs = [];
for (const model of models) jobs.push(...await modelJobs(model));
jobs.push(...tesseractJobs());

console.log(`Submitting ${jobs.length} edge-to-R2 transfers sequentially…`);
const completed = [];
const failed = [];
for (const job of jobs) {
  try {
    completed.push({ job, result: await submit(job) });
  } catch (error) {
    failed.push({ key: job.key, error: error instanceof Error ? error.message : String(error) });
    console.error(`  FAILED: ${failed.at(-1).error}`);
  }
}

const totalBytes = completed.reduce((sum, item) => sum + Number(item.result.size || 0), 0);
console.log(`\nCompleted: ${completed.length}/${jobs.length} objects (${totalBytes.toLocaleString()} bytes)`);
if (failed.length) {
  console.error('Failed objects:');
  for (const item of failed) console.error(`- ${item.key}: ${item.error}`);
  process.exitCode = 1;
} else {
  console.log('All required model and OCR artifacts were uploaded.');
}
