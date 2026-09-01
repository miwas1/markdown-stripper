import type { SafetyFinding, SafetyFindingType, SafetySeverity } from './types';
import { documentFingerprint } from './privacy-utils';

export const PII_MODEL_ID = 'onnx-community/bert-small-pii-detection-ONNX';
export const PII_MODEL_REVISION = '6cb4e77c2b2c7f81e731b88cffa9b7a6fc675a4c';
// The reliable INT8/WASM artifact is ~29 MB, plus small tokenizer metadata.
export const PII_MODEL_DOWNLOAD_MB = 30;

export interface PiiModelEntity {
  entity?: string;
  entity_group?: string;
  index?: number;
  word?: string;
  start?: number | null;
  end?: number | null;
  score?: number;
}

export type DeepScanStatus = 'idle' | 'loading' | 'scanning' | 'complete' | 'error';
export type DeepScanRuntime = 'webgpu' | 'wasm';

export type DeepScanRequest =
  | { type: 'preload'; requestId: 0 }
  | { type: 'scan'; requestId: number; text: string };

export type DeepScanWorkerMessage =
  | { type: 'loading'; requestId: number; progress?: number; file?: string; runtime: DeepScanRuntime }
  | { type: 'ready'; requestId: number; runtime: DeepScanRuntime }
  | { type: 'scanning'; requestId: number; progress: number; runtime: DeepScanRuntime }
  | { type: 'complete'; requestId: number; entities: PiiModelEntity[]; runtime: DeepScanRuntime }
  | { type: 'error'; requestId: number; message: string };

interface LabelPresentation {
  type: SafetyFindingType;
  severity: SafetySeverity;
  title: string;
  detail: string;
  placeholder: string;
}

const FINANCIAL_LABELS = /(?:CREDIT|CARD|CVV|CVC|BANK|ACCOUNT|IBAN|SWIFT|BIC|CRYPTO|BITCOIN|ETHEREUM|SALARY)/;
const IDENTITY_LABELS = /(?:PASSPORT|LICENSE|LICENCE|SOCIAL|SSN|TAX|IDCARD|ID_CARD|IDENTITY|NATIONAL|PIN|PASSWORD|USERNAME)/;
const ADDRESS_LABELS = /(?:ADDRESS|STREET|CITY|ZIP|POSTAL|BUILDING|LOCATION|COUNTY|STATE)/;
const CONTACT_LABELS = /(?:EMAIL|PHONE|TELEPHONE|MOBILE|FAX|IP_ADDRESS|IPV4|IPV6|MAC)/;
const HEALTH_LABELS = /(?:HEALTH|MEDICAL|MEDICATION|CONDITION|BLOOD|INSURANCE)/;
const PERSON_LABELS = /(?:PERSON|NAME|SURNAME|GIVENNAME|FIRSTNAME|LASTNAME|AGE|DOB|DATE_OF_BIRTH|GENDER|SEX)/;
const NON_PII_LABELS = /^(?:O|ORG|ORGANIZATION|MISC|PRODUCT|EVENT|WORK_OF_ART|LAW|LANGUAGE)$/;

function normalizeLabel(label: string): string {
  return label
    .replace(/^(?:B|I|E|S)-/i, '')
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
}

function presentationFor(rawLabel: string): LabelPresentation | null {
  const label = normalizeLabel(rawLabel);
  if (NON_PII_LABELS.test(label)) return null;
  if (FINANCIAL_LABELS.test(label)) {
    return {
      type: 'financial-data', severity: 'high', title: 'Possible financial information',
      detail: 'The local AI scanner found context that may contain financial or payment data.',
      placeholder: 'FINANCIAL_DATA',
    };
  }
  if (IDENTITY_LABELS.test(label)) {
    return {
      type: 'personal-data', severity: 'high', title: 'Possible identity information',
      detail: 'The local AI scanner found context that may identify or authenticate a person.',
      placeholder: 'IDENTITY_DATA',
    };
  }
  if (HEALTH_LABELS.test(label)) {
    return {
      type: 'personal-data', severity: 'high', title: 'Possible health information',
      detail: 'The local AI scanner found context that may contain sensitive health information.',
      placeholder: 'HEALTH_DATA',
    };
  }
  if (ADDRESS_LABELS.test(label)) {
    return {
      type: 'personal-data', severity: 'medium', title: 'Possible address or location',
      detail: 'The local AI scanner found a location that may reveal personal information.',
      placeholder: 'LOCATION',
    };
  }
  if (CONTACT_LABELS.test(label)) {
    return {
      type: 'personal-data', severity: 'medium', title: 'Possible contact information',
      detail: 'The local AI scanner found context that may contain personal contact information.',
      placeholder: 'CONTACT',
    };
  }
  if (PERSON_LABELS.test(label)) {
    return {
      type: 'personal-data', severity: 'medium', title: 'Possible personal identity',
      detail: 'The local AI scanner found a name or personal attribute worth reviewing.',
      placeholder: 'PERSON',
    };
  }
  return {
    type: 'personal-data', severity: 'medium', title: 'Possible personal information',
    detail: 'The local AI scanner found context that may contain personal information.',
    placeholder: 'PERSONAL_DATA',
  };
}

function buildLineStarts(source: string): number[] {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) starts.push(index + 1);
  }
  return starts;
}

function lineAt(starts: number[], offset: number): number {
  let low = 0;
  let high = starts.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (starts[middle] <= offset) low = middle + 1;
    else high = middle;
  }
  return low;
}

function overlapLength(a: Pick<SafetyFinding, 'start' | 'end'>, b: Pick<SafetyFinding, 'start' | 'end'>): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

interface TokenGroup {
  label: string;
  tokens: PiiModelEntity[];
}

export interface PiiTextChunk {
  text: string;
  offset: number;
  tokenCount: number;
}

/**
 * Split by the tokenizer's real token count so the pipeline cannot silently
 * truncate the middle of a large character-based chunk.
 */
export function makeTokenAwareChunks(
  text: string,
  tokenBudget: number,
  overlapTokens: number,
  countTokens: (value: string) => number,
): PiiTextChunk[] {
  if (!text) return [];
  const budget = Math.max(8, Math.floor(tokenBudget));
  const overlap = Math.max(0, Math.min(Math.floor(overlapTokens), budget - 1));
  const chunks: PiiTextChunk[] = [];
  let start = 0;

  while (start < text.length) {
    let low = start + 1;
    let high = text.length;
    let end = start + 1;
    while (low <= high) {
      const middle = low + ((high - low) >>> 1);
      if (countTokens(text.slice(start, middle)) <= budget) {
        end = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    if (end < text.length) {
      const minimumBoundary = start + Math.floor((end - start) * 0.7);
      const newline = text.lastIndexOf('\n', end - 1);
      const space = text.lastIndexOf(' ', end - 1);
      const boundary = Math.max(newline, space);
      if (boundary >= minimumBoundary) end = boundary + 1;
    }

    const chunkText = text.slice(start, end);
    chunks.push({ text: chunkText, offset: start, tokenCount: countTokens(chunkText) });
    if (end >= text.length) break;

    let nextStart = end;
    if (overlap > 0) {
      low = start + 1;
      high = end - 1;
      while (low <= high) {
        const middle = low + ((high - low) >>> 1);
        if (countTokens(text.slice(middle, end)) <= overlap) {
          nextStart = middle;
          high = middle - 1;
        } else {
          low = middle + 1;
        }
      }
    }
    start = Math.max(start + 1, nextStart);
  }

  return chunks;
}

function splitBioLabel(rawLabel: string): { prefix: string; label: string } {
  const match = /^([BIES])-([\s\S]+)$/i.exec(rawLabel);
  return match ? { prefix: match[1].toUpperCase(), label: match[2] } : { prefix: 'S', label: rawLabel };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tokenPattern(tokens: PiiModelEntity[]): string {
  let pattern = '';
  let previousWasPunctuation = false;

  for (const token of tokens) {
    const rawWord = token.word ?? '';
    const continuation = rawWord.startsWith('##');
    const word = continuation ? rawWord.slice(2) : rawWord;
    if (!word) continue;
    const punctuation = /^[^\p{L}\p{N}]+$/u.test(word);
    if (pattern && !continuation) pattern += punctuation || previousWasPunctuation ? '\\s*' : '\\s+';
    pattern += escapeRegExp(word);
    previousWasPunctuation = punctuation;
  }

  return pattern;
}

/**
 * Some Transformers.js token-classification pipelines return raw WordPiece
 * tokens without character offsets, even when aggregation is requested.
 * Rebuild those spans against the original chunk so valid detections are not
 * silently discarded.
 */
export function resolveModelEntitySpans(source: string, entities: PiiModelEntity[]): PiiModelEntity[] {
  if (entities.every(entity => typeof entity.start === 'number' && typeof entity.end === 'number')) return entities;

  const resolved: PiiModelEntity[] = [];
  const groups: TokenGroup[] = [];
  let active: TokenGroup | null = null;

  const flush = (): void => {
    if (active) groups.push(active);
    active = null;
  };

  for (const entity of entities) {
    if (typeof entity.start === 'number' && typeof entity.end === 'number') {
      flush();
      resolved.push(entity);
      continue;
    }

    const rawLabel = entity.entity_group ?? entity.entity ?? 'PII';
    const { prefix, label } = splitBioLabel(rawLabel);
    if (normalizeLabel(label) === 'O') {
      flush();
      continue;
    }
    const previous = active?.tokens.at(-1);
    const contiguous = previous?.index == null || entity.index == null || entity.index === previous.index + 1;
    const continues = active && prefix !== 'B' && prefix !== 'S'
      && normalizeLabel(active.label) === normalizeLabel(label) && contiguous;
    if (!continues) {
      flush();
      active = { label, tokens: [entity] };
    } else {
      active.tokens.push(entity);
    }
    if (prefix === 'E' || prefix === 'S') flush();
  }
  flush();

  let searchFrom = 0;
  for (const group of groups) {
    const pattern = tokenPattern(group.tokens);
    if (!pattern) continue;
    const matcher = new RegExp(pattern, 'iu');
    let match = matcher.exec(source.slice(searchFrom));
    let start = match ? searchFrom + match.index : -1;
    if (!match) {
      match = matcher.exec(source);
      start = match?.index ?? -1;
    }
    if (!match || start < 0) continue;
    const end = start + match[0].length;
    const scores = group.tokens.map(token => Number(token.score ?? 0));
    resolved.push({
      entity_group: group.label,
      word: source.slice(start, end),
      start,
      end,
      score: scores.reduce((sum, score) => sum + score, 0) / scores.length,
    });
    searchFrom = Math.max(searchFrom, end);
  }

  return resolved.sort((a, b) => Number(a.start ?? 0) - Number(b.start ?? 0));
}

/** Convert model spans into the scanner's review/redaction format. */
export function modelEntitiesToFindings(source: string, entities: PiiModelEntity[]): SafetyFinding[] {
  const lineStarts = buildLineStarts(source);
  const fingerprint = documentFingerprint(source);
  const candidates: SafetyFinding[] = [];

  for (const entity of resolveModelEntitySpans(source, entities)) {
    const start = entity.start;
    const end = entity.end;
    const confidence = Number(entity.score ?? 0);
    const rawLabel = entity.entity_group ?? entity.entity ?? 'PII';
    if (start == null || end == null || start < 0 || end <= start || end > source.length || confidence < 0.65) continue;
    const value = source.slice(start, end);
    if (!value.trim() || value.trim().length < 2) continue;
    const presentation = presentationFor(rawLabel);
    if (!presentation) continue;
    candidates.push({
      id: `local-ai-${start}-${end}-${normalizeLabel(rawLabel)}`,
      documentFingerprint: fingerprint,
      ...presentation,
      value,
      start,
      end,
      line: lineAt(lineStarts, start),
      source: 'local-ai',
      confidence,
      modelLabel: normalizeLabel(rawLabel),
    });
  }

  // Overlapping chunks can return the same span more than once. Keep the
  // highest-confidence version so the review list stays calm and readable.
  return candidates
    .sort((a, b) => b.confidence! - a.confidence! || a.start - b.start)
    .filter((candidate, index, all) => !all.slice(0, index).some(existing => {
      const overlap = overlapLength(candidate, existing);
      const shorter = Math.min(candidate.end - candidate.start, existing.end - existing.start);
      return overlap > 0 && overlap / shorter >= 0.6;
    }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
}

/** Deterministic matches win when both scanners identify the same text. */
export function mergeSafetyFindings(
  ruleFindings: SafetyFinding[],
  modelFindings: SafetyFinding[],
  expectedFingerprint?: string,
): SafetyFinding[] {
  const currentModelFindings = expectedFingerprint
    ? modelFindings.filter(finding => finding.documentFingerprint === expectedFingerprint)
    : modelFindings;
  const additional = currentModelFindings.filter(modelFinding => !ruleFindings.some(ruleFinding => {
    const overlap = overlapLength(modelFinding, ruleFinding);
    const shorter = Math.min(modelFinding.end - modelFinding.start, ruleFinding.end - ruleFinding.start);
    return overlap > 0 && overlap / shorter >= 0.6;
  }));
  return [...ruleFindings, ...additional].sort((a, b) => a.start - b.start || b.end - a.end);
}
