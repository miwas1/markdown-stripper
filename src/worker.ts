import { BUTTON_NAMES } from './lib/analytics-config';

const EVENT_NAMES = ['page_view', 'button_click', 'convert_markdown', 'copy_text', 'export_file', 'document_import', 'ocr_complete', 'privacy_scan_complete', 'semantic_scan_complete', 'redact_findings'] as const;
const FEATURES = ['live_editor', 'clipboard', 'download', 'import', 'ocr', 'privacy_scan', 'semantic_scan', 'redaction'] as const;
const VARIANTS = ['plain', 'readable', 'ai', 'txt', 'docx', 'markdown', 'text', 'html', 'pdf', 'image'] as const;
const SIZE_BUCKETS = ['tiny', 'small', 'medium', 'large'] as const;
const OUTCOMES = ['success', 'error'] as const;
const MAX_BODY_BYTES = 1_024;

function isAllowed<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && allowed.includes(value as T);
}

async function readSmallBody(request: Request): Promise<string> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let body = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) throw new Error('Request body too large');
      body += decoder.decode(value, { stream: true });
    }
    return body + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export async function handleUsageRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(null, {
      status: 405,
      headers: { allow: 'POST' },
    });
  }

  const requestUrl = new URL(request.url);
  const origin = request.headers.get('origin');
  if (origin !== requestUrl.origin) return new Response(null, { status: 403 });

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.startsWith('application/json')) return new Response(null, { status: 415 });

  let value: unknown;
  try {
    value = JSON.parse(await readSmallBody(request));
  } catch {
    return new Response(null, { status: 400 });
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return new Response(null, { status: 400 });
  }

  const event = Reflect.get(value, 'event');
  const button = Reflect.get(value, 'button');
  const feature = Reflect.get(value, 'feature');
  const variant = Reflect.get(value, 'variant');
  const sizeBucket = Reflect.get(value, 'sizeBucket');
  const outcome = Reflect.get(value, 'outcome');

  if (!isAllowed(event, EVENT_NAMES)
    || (event === 'button_click' && !isAllowed(button, BUTTON_NAMES))
    || (event !== 'button_click' && button !== undefined && !isAllowed(button, BUTTON_NAMES))
    || (feature !== undefined && !isAllowed(feature, FEATURES))
    || (variant !== undefined && !isAllowed(variant, VARIANTS))
    || (sizeBucket !== undefined && !isAllowed(sizeBucket, SIZE_BUCKETS))
    || (outcome !== undefined && !isAllowed(outcome, OUTCOMES))) {
    return new Response(null, { status: 400 });
  }

  env.USAGE_ANALYTICS.writeDataPoint({
    indexes: [event],
    blobs: [event, feature ?? 'none', variant ?? 'none', sizeBucket ?? 'none', outcome ?? 'none', button ?? 'none'],
    doubles: [1],
  });

  return new Response(null, {
    status: 204,
    headers: { 'cache-control': 'no-store' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/usage') return handleUsageRequest(request, env);
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
