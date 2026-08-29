import { francAll } from 'franc-min';
import { OCR_LANGUAGES, type OcrLanguageCode } from './language-options';

const SUPPORTED_ISO3 = new Set(OCR_LANGUAGES.map(language => language.iso3));

export interface LanguageDetection {
  code: OcrLanguageCode;
  label: string;
  confidence: 'high' | 'medium' | 'low';
  detected: boolean;
}

/**
 * Fast trigram language detection for OCR defaults. It is intentionally only
 * a suggestion: the user can always choose a different OCR language.
 */
export function detectOcrLanguage(source: string): LanguageDetection {
  const text = source
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const fallback = OCR_LANGUAGES[0];
  if (text.length < 80) return { code: fallback.code, label: fallback.label, confidence: 'low', detected: false };

  const candidates = francAll(text, { only: [...SUPPORTED_ISO3], minLength: 40 });
  const best = candidates.find(([iso3]) => SUPPORTED_ISO3.has(iso3));
  if (!best) return { code: fallback.code, label: fallback.label, confidence: 'low', detected: false };
  const option = OCR_LANGUAGES.find(language => language.iso3 === best[0]) ?? fallback;
  const next = candidates.find(([iso3]) => iso3 !== best[0] && SUPPORTED_ISO3.has(iso3));
  const separation = next ? (next[1] - best[1]) / Math.max(next[1], 1) : 1;
  const confidence = text.length >= 240 && separation > 0.08 ? 'high' : separation > 0.03 ? 'medium' : 'low';
  return { code: option.code, label: option.label, confidence, detected: true };
}
