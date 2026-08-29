export type UsageEvent =
  | 'page_view'
  | 'convert_markdown'
  | 'copy_text'
  | 'export_file'
  | 'document_import'
  | 'ocr_complete'
  | 'privacy_scan_complete'
  | 'semantic_scan_complete'
  | 'redact_findings';

export interface UsageDimensions {
  feature?: 'live_editor' | 'clipboard' | 'download' | 'import' | 'ocr' | 'privacy_scan' | 'semantic_scan' | 'redaction';
  variant?: 'plain' | 'readable' | 'ai' | 'txt' | 'docx' | 'markdown' | 'text' | 'html' | 'pdf' | 'image';
  sizeBucket?: 'tiny' | 'small' | 'medium' | 'large';
  outcome?: 'success' | 'error';
}

const oncePerPage = new Set<UsageEvent>();

export function sizeBucket(length: number): UsageDimensions['sizeBucket'] {
  if (length < 1_000) return 'tiny';
  if (length < 10_000) return 'small';
  if (length < 100_000) return 'medium';
  return 'large';
}

/**
 * Invisible background tracking function
 * Fails silently to ensure zero impact on user experience or performance
 */
export function trackEvent(event: UsageEvent, dimensions: UsageDimensions = {}, once = false): void {
  if (once && oncePerPage.has(event)) return;
  if (once) oncePerPage.add(event);

  const body = JSON.stringify({ event, ...dimensions });
  try {
    if (navigator.sendBeacon?.('/api/usage', new Blob([body], { type: 'application/json' }))) return;
    void fetch('/api/usage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'omit',
    }).catch(() => undefined);
  } catch {
    // Usage recording must never interrupt document processing.
  }
}
