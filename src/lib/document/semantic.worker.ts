/// <reference lib="webworker" />

import { env, pipeline } from '@huggingface/transformers';
import {
  extractSemanticSegments,
  SEMANTIC_MODEL_ID,
  SEMANTIC_MODEL_REVISION,
  type SemanticRequest,
  type SemanticRuntime,
  type SemanticWorkerMessage,
  type SemanticSegment,
  type SemanticMatch,
} from './semantic';
import { TRANSFORMERS_REMOTE_HOST } from './model-assets';

env.remoteHost = TRANSFORMERS_REMOTE_HOST;

const context = self as unknown as DedicatedWorkerGlobalScope;
type Extractor = (text: string | string[], options?: Record<string, unknown>) => Promise<unknown>;
interface ExtractorSession { extractor: Extractor; runtime: SemanticRuntime }
let extractorPromise: Promise<ExtractorSession> | null = null;

function post(message: SemanticWorkerMessage): void {
  context.postMessage(message);
}

async function chooseRuntime(): Promise<SemanticRuntime> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown | null> } }).gpu;
  if (!gpu) return 'wasm';
  try { return await gpu.requestAdapter() ? 'webgpu' : 'wasm'; } catch { return 'wasm'; }
}

async function loadExtractor(requestId: number, runtime: SemanticRuntime): Promise<ExtractorSession> {
  const extractor = await pipeline('feature-extraction', SEMANTIC_MODEL_ID, {
    revision: SEMANTIC_MODEL_REVISION,
    device: runtime,
    dtype: runtime === 'webgpu' ? 'q4f16' : 'q8',
    progress_callback: (event: unknown) => {
      const progress = event as { status?: string; progress?: number };
      if (progress.status !== 'progress' && progress.status !== 'download') return;
      post({ type: 'loading', requestId, runtime, progress: typeof progress.progress === 'number' ? Math.round(progress.progress) : undefined });
    },
  }) as unknown as Extractor;
  return { extractor, runtime };
}

async function getExtractor(requestId: number, preferredRuntime: SemanticRuntime): Promise<ExtractorSession> {
  if (!extractorPromise) {
    extractorPromise = loadExtractor(requestId, preferredRuntime).catch(error => {
      if (preferredRuntime !== 'webgpu') throw error;
      post({ type: 'loading', requestId, runtime: 'wasm' });
      return loadExtractor(requestId, 'wasm');
    });
  }
  return extractorPromise;
}

function vectorsFromOutput(output: unknown, expected: number): number[][] {
  const tensor = output as { data?: ArrayLike<number>; dims?: number[] };
  if (tensor?.data && tensor.dims?.length) {
    const width = tensor.dims[tensor.dims.length - 1];
    const values = Array.from(tensor.data);
    return Array.from({ length: expected }, (_, index) => values.slice(index * width, (index + 1) * width));
  }
  if (Array.isArray(output)) {
    return output.map(value => Array.isArray(value) ? value.flat(Infinity).map(Number) : []);
  }
  return [];
}

function dot(a: number[], b: number[]): number {
  let score = 0;
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) score += a[index] * b[index];
  return score;
}

async function embedSegments(extractor: Extractor, segments: SemanticSegment[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let start = 0; start < segments.length; start += 12) {
    const batch = segments.slice(start, start + 12);
    const output = await extractor(batch.map(segment => segment.text), { pooling: 'mean', normalize: true });
    vectors.push(...vectorsFromOutput(output, batch.length));
  }
  return vectors;
}

function findMatches(segments: SemanticSegment[], vectors: number[][]): SemanticMatch[] {
  const candidates: SemanticMatch[] = [];
  for (let left = 0; left < segments.length; left += 1) {
    for (let right = left + 1; right < segments.length; right += 1) {
      const score = dot(vectors[left] ?? [], vectors[right] ?? []);
      if (score >= 0.84) candidates.push({ first: segments[left], second: segments[right], score });
    }
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, 5);
}

context.addEventListener('message', async (event: MessageEvent<SemanticRequest>) => {
  if (event.data.type !== 'semantic') return;
  const { requestId, text } = event.data;
  try {
    const preferredRuntime = await chooseRuntime();
    post({ type: 'loading', requestId, runtime: preferredRuntime });
    const session = await getExtractor(requestId, preferredRuntime);
    const segments = extractSemanticSegments(text);
    if (segments.length < 2) {
      post({ type: 'complete', requestId, matches: [], segmentCount: segments.length, runtime: session.runtime });
      return;
    }
    post({ type: 'analyzing', requestId, progress: 10, runtime: session.runtime });
    const vectors = await embedSegments(session.extractor, segments);
    post({ type: 'analyzing', requestId, progress: 80, runtime: session.runtime });
    post({ type: 'complete', requestId, matches: findMatches(segments, vectors), segmentCount: segments.length, runtime: session.runtime });
  } catch (error) {
    extractorPromise = null;
    post({ type: 'error', requestId, message: error instanceof Error ? error.message : 'Semantic analysis failed.' });
  }
});
