import type { SafetyFinding, SafetyFindingType, SafetySeverity } from './types';

export const PII_MODEL_ID = 'ai4privacy/llama-ai4privacy-english-anonymiser-openpii';
export const PII_MODEL_REVISION = '44feca39409cabb97cec13a92ec7a8b09416d57a';
export const PII_MODEL_DOWNLOAD_MB = 151;

export interface PiiModelEntity {
  entity?: string;
  entity_group?: string;
  word?: string;
  start?: number | null;
  end?: number | null;
  score?: number;
}

export type DeepScanStatus = 'idle' | 'loading' | 'scanning' | 'complete' | 'error';
export type DeepScanRuntime = 'webgpu' | 'wasm';

export interface DeepScanRequest {
  type: 'scan';
  requestId: number;
  text: string;
}

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

/** Convert model spans into the scanner's review/redaction format. */
export function modelEntitiesToFindings(source: string, entities: PiiModelEntity[]): SafetyFinding[] {
  const lineStarts = buildLineStarts(source);
  const candidates: SafetyFinding[] = [];

  for (const entity of entities) {
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
export function mergeSafetyFindings(ruleFindings: SafetyFinding[], modelFindings: SafetyFinding[]): SafetyFinding[] {
  const additional = modelFindings.filter(modelFinding => !ruleFindings.some(ruleFinding => {
    const overlap = overlapLength(modelFinding, ruleFinding);
    const shorter = Math.min(modelFinding.end - modelFinding.start, ruleFinding.end - ruleFinding.start);
    return overlap > 0 && overlap / shorter >= 0.6;
  }));
  return [...ruleFindings, ...additional].sort((a, b) => a.start - b.start || b.end - a.end);
}
