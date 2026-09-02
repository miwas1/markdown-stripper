import { BUTTON_NAMES, type ButtonName } from './analytics-config';

export type UsageEvent =
  | 'page_view'
  | 'button_click'
  | 'convert_markdown'
  | 'copy_text'
  | 'export_file'
  | 'document_import'
  | 'ocr_complete'
  | 'privacy_scan_complete'
  | 'redact_findings';

export interface UsageDimensions {
  button?: ButtonName;
  feature?: 'live_editor' | 'clipboard' | 'download' | 'import' | 'ocr' | 'privacy_scan' | 'redaction';
  variant?: 'plain' | 'readable' | 'ai' | 'txt' | 'docx' | 'markdown' | 'text' | 'html' | 'pdf' | 'image';
  sizeBucket?: 'tiny' | 'small' | 'medium' | 'large';
  outcome?: 'success' | 'error';
}

function isButtonName(value: string): value is ButtonName {
  return (BUTTON_NAMES as readonly string[]).includes(value);
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

/**
 * Track explicitly-labelled button interactions without sending visible labels
 * or other user-controlled text to the measurement endpoint.
 */
export function installButtonTracking(): () => void {
  const handleClick = (event: MouseEvent) => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-track-button]')
      : null;
    const button = target?.dataset.trackButton;
    if (button && isButtonName(button)) trackEvent('button_click', { button });
  };

  document.addEventListener('click', handleClick, true);
  return () => document.removeEventListener('click', handleClick, true);
}
