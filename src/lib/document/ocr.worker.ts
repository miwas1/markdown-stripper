/// <reference lib="webworker" />

import { createWorker, type Worker as TesseractWorker } from 'tesseract.js';
import type { OcrLanguageCode } from './language-options';
import {
  TESSERACT_CORE_PATH,
  TESSERACT_LANGUAGE_PATH,
  TESSERACT_WORKER_PATH,
} from './model-assets';

interface OcrRequest {
  type: 'recognize';
  requestId: number;
  language: OcrLanguageCode;
  image: Blob;
}

type OcrMessage =
  | { type: 'loading' | 'recognizing'; requestId: number; progress?: number; message?: string }
  | { type: 'complete'; requestId: number; text: string; confidence: number }
  | { type: 'error'; requestId: number; message: string };

const context = self as unknown as DedicatedWorkerGlobalScope;
let workerPromise: Promise<TesseractWorker> | null = null;
let workerLanguage: OcrLanguageCode | null = null;

function post(message: OcrMessage): void {
  context.postMessage(message);
}

async function getWorker(language: OcrLanguageCode, requestId: number): Promise<TesseractWorker> {
  if (workerPromise && workerLanguage === language) return workerPromise;
  if (workerPromise) {
    const current = await workerPromise.catch(() => null);
    await current?.terminate();
  }
  workerLanguage = language;
  workerPromise = createWorker(language, 1, {
    workerPath: TESSERACT_WORKER_PATH,
    corePath: TESSERACT_CORE_PATH,
    langPath: TESSERACT_LANGUAGE_PATH,
    logger: event => {
      const progress = typeof event.progress === 'number' ? Math.round(event.progress * 100) : undefined;
      post({ type: 'loading', requestId, progress, message: event.status });
    },
  });
  return workerPromise;
}

context.addEventListener('message', async (event: MessageEvent<OcrRequest>) => {
  if (event.data.type !== 'recognize') return;
  const { requestId, language, image } = event.data;
  try {
    const worker = await getWorker(language, requestId);
    post({ type: 'recognizing', requestId, progress: 0, message: 'Reading page' });
    const result = await worker.recognize(image);
    post({
      type: 'complete',
      requestId,
      text: result.data.text.trim(),
      confidence: Number(result.data.confidence ?? 0),
    });
  } catch (error) {
    workerPromise = null;
    post({ type: 'error', requestId, message: error instanceof Error ? error.message : 'OCR failed.' });
  }
});
