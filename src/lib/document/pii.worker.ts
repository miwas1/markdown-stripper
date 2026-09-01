/// <reference lib="webworker" />

import { env, pipeline } from '@huggingface/transformers';
import {
  PII_MODEL_ID,
  PII_MODEL_REVISION,
  makeTokenAwareChunks,
  resolveModelEntitySpans,
  type DeepScanRequest,
  type DeepScanRuntime,
  type DeepScanWorkerMessage,
  type PiiModelEntity,
} from './pii';
import { TRANSFORMERS_REMOTE_HOST } from './model-assets';

env.remoteHost = TRANSFORMERS_REMOTE_HOST;

const context = self as unknown as DedicatedWorkerGlobalScope;
const FALLBACK_MODEL_TOKENS = 512;
const TOKEN_SAFETY_MARGIN = 8;
const CHUNK_OVERLAP_TOKENS = 64;

interface TokenizerOutput {
  input_ids: number[] | number[][] | { dims?: number[] };
}
interface Detector {
  (text: string, options?: Record<string, unknown>): Promise<unknown>;
  tokenizer: {
    model_max_length?: number;
    (text: string, options?: Record<string, unknown>): TokenizerOutput;
  };
  model?: { config?: { max_position_embeddings?: number } };
}
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

function usableModelTokens(detector: Detector): number {
  const candidates = [
    detector.tokenizer.model_max_length,
    detector.model?.config?.max_position_embeddings,
  ].filter((value): value is number => typeof value === 'number'
    && Number.isFinite(value) && value >= 32 && value < 1_000_000);
  return Math.max(8, Math.min(...(candidates.length ? candidates : [FALLBACK_MODEL_TOKENS])) - TOKEN_SAFETY_MARGIN);
}

function countTokens(detector: Detector, text: string): number {
  const output = detector.tokenizer(text, {
    add_special_tokens: true,
    truncation: false,
    return_tensor: false,
  });
  if (Array.isArray(output.input_ids)) {
    if (Array.isArray(output.input_ids[0])) return output.input_ids[0].length;
    return output.input_ids.length;
  }
  const dims = output.input_ids.dims;
  return dims?.at(-1) ?? 0;
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
    const chunks = makeTokenAwareChunks(
      text,
      usableModelTokens(detector),
      CHUNK_OVERLAP_TOKENS,
      value => countTokens(detector, value),
    );
    const entities: PiiModelEntity[] = [];
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      post({ type: 'scanning', requestId, progress: Math.round((index / chunks.length) * 100), runtime });
      const output = await detector(chunk.text, {
        aggregation_strategy: 'simple',
        ignore_labels: ['O'],
      });
      const resolved = resolveModelEntitySpans(chunk.text, normalizeOutput(output, 0));
      entities.push(...resolved.map(entity => ({
        ...entity,
        start: typeof entity.start === 'number' ? entity.start + chunk.offset : null,
        end: typeof entity.end === 'number' ? entity.end + chunk.offset : null,
      })));
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
