export const SEMANTIC_MODEL_ID = 'mixedbread-ai/mxbai-embed-xsmall-v1';
export const SEMANTIC_MODEL_DOWNLOAD_MB = 25;

export interface SemanticSegment {
  id: number;
  text: string;
  start: number;
  end: number;
}

export interface SemanticMatch {
  first: SemanticSegment;
  second: SemanticSegment;
  score: number;
}

export type SemanticStatus = 'idle' | 'loading' | 'analyzing' | 'complete' | 'error';
export type SemanticRuntime = 'webgpu' | 'wasm';

export interface SemanticRequest {
  type: 'semantic';
  requestId: number;
  text: string;
}

export type SemanticWorkerMessage =
  | { type: 'loading'; requestId: number; progress?: number; runtime: SemanticRuntime }
  | { type: 'analyzing'; requestId: number; progress: number; runtime: SemanticRuntime }
  | { type: 'complete'; requestId: number; matches: SemanticMatch[]; segmentCount: number; runtime: SemanticRuntime }
  | { type: 'error'; requestId: number; message: string };

/**
 * Split on paragraph boundaries so semantic results can be shown as useful
 * excerpts. Code blocks and tiny fragments are ignored to reduce false hits.
 */
export function extractSemanticSegments(source: string): SemanticSegment[] {
  const segments: SemanticSegment[] = [];
  const pattern = /\S[\s\S]*?(?=\n\s*\n|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const raw = match[0];
    const start = match.index;
    const text = raw.trim();
    const leading = raw.indexOf(text);
    const absoluteStart = start + Math.max(0, leading);
    if (text.length < 45 || /^```/.test(text) || /^\s*[-*+]\s/.test(text) && text.length < 90) continue;
    segments.push({ id: segments.length, text, start: absoluteStart, end: absoluteStart + text.length });
    if (segments.length >= 80) break;
  }
  return segments;
}

export function formatSemanticScore(score: number): string {
  return `${Math.round(score * 100)}% similar`;
}
