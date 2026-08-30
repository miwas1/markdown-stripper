/// <reference lib="webworker" />

import { env, pipeline } from '@huggingface/transformers';
import {
  PII_MODEL_ID,
  PII_MODEL_REVISION,
  type DeepScanRequest,
  type DeepScanRuntime,
  type DeepScanWorkerMessage,
  type PiiModelEntity,
} from './pii';
import { TRANSFORMERS_REMOTE_HOST } from './model-assets';

env.remoteHost = TRANSFORMERS_REMOTE_HOST;

const context = self as unknown as DedicatedWorkerGlobalScope;
const CHUNK_SIZE = 8_000;
const CHUNK_OVERLAP = 240;

type Detector = (text: string, options?: Record<string, unknown>) => Promise<unknown>;
interface DetectorSession {
  detector: Detector;
  runtime: DeepScanRuntime;
}
let detectorPromise: Promise<DetectorSession> | null = null;

function post(message: DeepScanWorkerMessage): void {
  context.postMessage(message);
}

async function loadDetector(requestId: number, runtime: DeepScanRuntime): Promise<DetectorSession> {
  const detector = await pipeline('token-classification', PII_MODEL_ID, {
    revision: PII_MODEL_REVISION,
    device: runtime,
    dtype: 'q8',
    progress_callback: (event: unknown) => {
      const progress = event as { status?: string; progress?: number; file?: string };
      if (progress.status !== 'progress' && progress.status !== 'download') return;
      post({
        type: 'loading',
        requestId,
        progress: typeof progress.progress === 'number' ? Math.round(progress.progress) : undefined,
        file: progress.file,
        runtime,
      });
    },
  }) as unknown as Detector;
  return { detector, runtime };
}

async function getDetector(requestId: number): Promise<DetectorSession> {
  if (!detectorPromise) {
    detectorPromise = loadDetector(requestId, 'wasm');
  }
  return detectorPromise;
}

function makeChunks(text: string): Array<{ text: string; offset: number }> {
  if (text.length <= CHUNK_SIZE) return [{ text, offset: 0 }];
  const chunks: Array<{ text: string; offset: number }> = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + CHUNK_SIZE);
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf('\n', end), text.lastIndexOf(' ', end));
      if (boundary > start + CHUNK_SIZE / 2) end = boundary;
    }
    chunks.push({ text: text.slice(start, end), offset: start });
    if (end >= text.length) break;
    start = Math.max(start + 1, end - CHUNK_OVERLAP);
  }
  return chunks;
}

function normalizeOutput(output: unknown, offset: number): PiiModelEntity[] {
  if (!Array.isArray(output)) return [];
  return output.flatMap(item => Array.isArray(item) ? normalizeOutput(item, offset) : [{
    ...(item as PiiModelEntity),
    start: typeof (item as PiiModelEntity).start === 'number' ? (item as PiiModelEntity).start! + offset : null,
    end: typeof (item as PiiModelEntity).end === 'number' ? (item as PiiModelEntity).end! + offset : null,
  }]);
}

context.addEventListener('message', async (event: MessageEvent<DeepScanRequest>) => {
  const { requestId } = event.data;
  try {
    post({ type: 'loading', requestId, runtime: 'wasm' });
    const session = await getDetector(requestId);
    const { detector, runtime } = session;
    post({ type: 'ready', requestId, runtime });
    if (event.data.type === 'preload') return;

    const { text } = event.data;
    const chunks = makeChunks(text);
    const entities: PiiModelEntity[] = [];
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      post({ type: 'scanning', requestId, progress: Math.round((index / chunks.length) * 100), runtime });
      const output = await detector(chunk.text, {
        aggregation_strategy: 'simple',
        ignore_labels: ['O'],
      });
      entities.push(...normalizeOutput(output, chunk.offset));
    }
    post({ type: 'scanning', requestId, progress: 100, runtime });
    post({ type: 'complete', requestId, entities, runtime });
  } catch (error) {
    detectorPromise = null;
    post({
      type: 'error',
      requestId,
      message: error instanceof Error ? error.message : 'The local privacy model could not run.',
    });
  }
});
