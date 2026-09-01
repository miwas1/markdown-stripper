import { documentFingerprint } from './privacy-utils';
import type { SafetyFinding, SafetyFindingType, SafetySeverity } from './types';

interface ScannerRule {
  id: string;
  type: SafetyFindingType;
  severity: SafetySeverity;
  title: string;
  detail: string;
  pattern: RegExp;
  placeholder: string;
  captureGroup?: number;
  validate?: (value: string) => boolean;
  /** Invisible-character detection must inspect the original, not normalized, text. */
  rawOnly?: boolean;
}

const INVISIBLE_CHARACTERS = /[\u00AD\u034F\u061C\u115F-\u1160\u17B4-\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\u{E0100}-\u{E01EF}]/gu;

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

function passesLuhn(value: string): boolean {
  const digits = digitsOnly(value);
  if (digits.length < 13 || digits.length > 19 || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function passesIbanChecksum(value: string): boolean {
  const compact = value.replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact)) return false;
  const rearranged = compact.slice(4) + compact.slice(0, 4);
  let remainder = 0;
  for (const character of rearranged) {
    const expanded = /[A-Z]/.test(character) ? String(character.charCodeAt(0) - 55) : character;
    for (const digit of expanded) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

function isIpv6(value: string): boolean {
  const compact = value.toLowerCase();
  if (!compact.includes(':') || compact.includes(':::')) return false;
  const halves = compact.split('::');
  if (halves.length > 2) return false;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  if (![...left, ...right].every(part => /^[0-9a-f]{1,4}$/.test(part))) return false;
  return halves.length === 2 ? left.length + right.length < 8 : left.length === 8;
}

const RULES: ScannerRule[] = [
  {
    id: 'private-key', type: 'secret', severity: 'high', title: 'Possible private key',
    detail: 'Private-key material should not be shared with an AI service.',
    pattern: /-----BEGIN (?:(?:RSA|EC|OPENSSH|DSA|ENCRYPTED) )?PRIVATE KEY-----[^]*?-----END (?:(?:RSA|EC|OPENSSH|DSA|ENCRYPTED) )?PRIVATE KEY-----/g,
    placeholder: 'PRIVATE_KEY',
  },
  {
    id: 'pgp-private-key', type: 'secret', severity: 'high', title: 'Possible PGP private key',
    detail: 'Private-key material should not be shared with an AI service.',
    pattern: /-----BEGIN PGP PRIVATE KEY BLOCK-----[^]*?-----END PGP PRIVATE KEY BLOCK-----/g,
    placeholder: 'PRIVATE_KEY',
  },
  {
    id: 'provider-token', type: 'secret', severity: 'high', title: 'Possible API key or access token',
    detail: 'This value resembles a provider credential or access token.',
    pattern: /(?<![\w-])(?:AIza[\w-]{30,}|AKIA[A-Z0-9]{16}|ASIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{40,}|glpat-[A-Za-z0-9_-]{20,}|(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}|SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,})(?![\w-])/g,
    placeholder: 'SECRET',
  },
  {
    id: 'jwt', type: 'secret', severity: 'high', title: 'Possible JSON Web Token',
    detail: 'JWTs can grant access to an account or service.',
    pattern: /(?<![\w-])eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}(?![\w-])/g,
    placeholder: 'JWT',
  },
  {
    id: 'bearer-token', type: 'secret', severity: 'high', title: 'Possible bearer token',
    detail: 'Bearer credentials can grant direct access to an account or service.',
    pattern: /\bBearer\s+([A-Za-z0-9._~+/=-]{12,})/gi,
    captureGroup: 1,
    placeholder: 'SECRET',
  },
  {
    id: 'assigned-secret', type: 'secret', severity: 'high', title: 'Possible assigned secret',
    detail: 'A credential-like field appears to contain a secret value.',
    pattern: /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|pwd)\b\s*(?:=|:)\s*["']?([A-Za-z0-9_./+=:@-]{8,})/gi,
    captureGroup: 1,
    placeholder: 'SECRET',
  },
  {
    id: 'connection-string', type: 'secret', severity: 'high', title: 'Possible credential-bearing connection string',
    detail: 'This connection URL appears to embed a username and password.',
    pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqps?):\/\/[^\s:/?#]+:[^\s@/]+@[^\s<>'"]+/gi,
    placeholder: 'CONNECTION_STRING',
  },
  {
    id: 'email', type: 'personal-data', severity: 'medium', title: 'Email address',
    detail: 'Review personal contact information before sharing this document.',
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    placeholder: 'EMAIL',
  },
  {
    id: 'phone-e164', type: 'personal-data', severity: 'medium', title: 'Possible phone number',
    detail: 'This number resembles an international phone number.',
    pattern: /(?<!\w)\+[1-9]\d{9,14}(?!\w)/g,
    placeholder: 'PHONE',
  },
  {
    id: 'phone-formatted', type: 'personal-data', severity: 'low', title: 'Possible phone number',
    detail: 'This number resembles an international or formatted phone number.',
    pattern: /(?<!\w)(?:\+?\d{1,3}[\s.-])?(?:\(?\d{2,4}\)?[\s.-])\d{3,4}[\s.-]\d{3,4}(?!\w)/g,
    placeholder: 'PHONE',
  },
  {
    id: 'us-ssn', type: 'personal-data', severity: 'high', title: 'Possible US Social Security number',
    detail: 'This value matches the structure of a US Social Security number.',
    pattern: /\b(?!000|666|9\d\d)\d{3}[- ]?(?!00)\d{2}[- ]?(?!0000)\d{4}\b/g,
    placeholder: 'IDENTITY_DATA',
  },
  {
    id: 'payment-card', type: 'financial-data', severity: 'high', title: 'Possible payment card number',
    detail: 'This value passes a payment-card checksum and should be reviewed.',
    pattern: /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g,
    placeholder: 'PAYMENT_CARD',
    validate: passesLuhn,
  },
  {
    id: 'iban', type: 'financial-data', severity: 'high', title: 'Possible IBAN',
    detail: 'This value passes the IBAN checksum and may identify a bank account.',
    pattern: /\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]){11,30}\b/gi,
    placeholder: 'IBAN',
    validate: passesIbanChecksum,
  },
  {
    id: 'ipv4', type: 'personal-data', severity: 'low', title: 'IP address',
    detail: 'An IP address can reveal network or location information.',
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
    placeholder: 'IP_ADDRESS',
  },
  {
    id: 'ipv6', type: 'personal-data', severity: 'low', title: 'IPv6 address',
    detail: 'An IP address can reveal network or location information.',
    pattern: /(?<![\w:])(?:[A-F0-9]{0,4}:){2,7}[A-F0-9]{0,4}(?![\w:])/gi,
    placeholder: 'IP_ADDRESS',
    validate: isIpv6,
  },
  {
    id: 'mac-address', type: 'personal-data', severity: 'low', title: 'MAC address',
    detail: 'A hardware address can identify a device on a network.',
    pattern: /\b(?:[A-F0-9]{2}[:-]){5}[A-F0-9]{2}\b/gi,
    placeholder: 'MAC_ADDRESS',
  },
  {
    id: 'invisible-unicode', type: 'invisible-text', severity: 'medium', title: 'Invisible Unicode characters',
    detail: 'Invisible characters can conceal instructions or corrupt copied text.',
    pattern: INVISIBLE_CHARACTERS,
    placeholder: 'INVISIBLE_TEXT',
    rawOnly: true,
  },
  {
    id: 'html-comment', type: 'hidden-content', severity: 'medium', title: 'Hidden HTML comment',
    detail: 'Comments are invisible when rendered but may still be read by an AI.',
    pattern: /<!--[\s\S]*?-->/g,
    placeholder: 'HIDDEN_CONTENT',
  },
  {
    id: 'prompt-override', type: 'prompt-injection', severity: 'high', title: 'Possible prompt-injection instruction',
    detail: 'Document content appears to instruct an AI to ignore or override its task.',
    pattern: /\b(?:ignore|disregard|forget|override|bypass)\s+(?:all\s+)?(?:previous|prior|above|system|developer|safety)\s+(?:instructions?|prompts?|messages?|rules?)\b[^\n]*/gi,
    placeholder: 'POSSIBLE_INJECTION',
  },
  {
    id: 'model-control', type: 'prompt-injection', severity: 'medium', title: 'Possible model-control instruction',
    detail: 'Review instructions that request secrets, system prompts, tools, or role changes.',
    pattern: /\b(?:reveal|print|repeat|expose|send|leak|extract)\s+(?:the\s+)?(?:system prompt|developer message|api key|secret|conversation history|hidden instructions?|credentials?)\b[^\n]*/gi,
    placeholder: 'POSSIBLE_INJECTION',
  },
  {
    id: 'encoded-base64', type: 'encoded-content', severity: 'low', title: 'Long encoded-looking value',
    detail: 'Long encoded payloads are difficult to inspect and may conceal content.',
    pattern: /(?<![\w+/=])(?:[A-Za-z0-9+/]{80,}={0,2})(?![\w+/=])/g,
    placeholder: 'ENCODED_CONTENT',
  },
  {
    id: 'encoded-hex', type: 'encoded-content', severity: 'low', title: 'Long hexadecimal value',
    detail: 'Long hexadecimal payloads are difficult to inspect and may conceal content.',
    pattern: /(?<![A-F0-9])(?:[A-F0-9]{2}){40,}(?![A-F0-9])/gi,
    placeholder: 'ENCODED_CONTENT',
  },
];

interface NormalizedSource {
  text: string;
  starts: number[];
  ends: number[];
}

function normalizedSource(source: string): NormalizedSource {
  let text = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let rawOffset = 0;
  for (const character of source) {
    const rawEnd = rawOffset + character.length;
    INVISIBLE_CHARACTERS.lastIndex = 0;
    if (!INVISIBLE_CHARACTERS.test(character)) {
      const normalized = character.normalize('NFKC');
      text += normalized;
      for (let index = 0; index < normalized.length; index += 1) {
        starts.push(rawOffset);
        ends.push(rawEnd);
      }
    }
    rawOffset = rawEnd;
  }
  return { text, starts, ends };
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

function capturedRange(match: RegExpExecArray, captureGroup?: number): { start: number; end: number; value: string } {
  const value = captureGroup === undefined ? match[0] : match[captureGroup];
  const relativeStart = captureGroup === undefined ? 0 : match[0].lastIndexOf(value);
  const start = match.index + relativeStart;
  return { start, end: start + value.length, value };
}

export function scanDocument(source: string): SafetyFinding[] {
  if (!source) return [];
  const fingerprint = documentFingerprint(source);
  const lineStarts = buildLineStarts(source);
  const normalized = normalizedSource(source);
  const findings: SafetyFinding[] = [];
  const seen = new Set<string>();

  for (const rule of RULES) {
    const scanText = rule.rawOnly ? source : normalized.text;
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rule.pattern.exec(scanText)) !== null) {
      const captured = capturedRange(match, rule.captureGroup);
      if (!captured.value || (rule.validate && !rule.validate(captured.value))) continue;
      const start = rule.rawOnly ? captured.start : normalized.starts[captured.start];
      const end = rule.rawOnly ? captured.end : normalized.ends[captured.end - 1];
      if (start === undefined || end === undefined || end <= start) continue;
      const key = `${start}:${end}:${rule.type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        id: `rule-${rule.id}-${start}-${end}`,
        documentFingerprint: fingerprint,
        type: rule.type,
        severity: rule.severity,
        title: rule.title,
        detail: rule.detail,
        value: source.slice(start, end),
        start,
        end,
        line: lineAt(lineStarts, start),
        placeholder: rule.placeholder,
        source: 'rule',
      });
      if (match[0].length === 0) rule.pattern.lastIndex += 1;
    }
  }

  const consolidated = [...findings]
    .sort((a, b) => findingPriority(b) - findingPriority(a)
      || (b.end - b.start) - (a.end - a.start)
      || a.start - b.start)
    .filter((candidate, index, ranked) => !ranked.slice(0, index).some(existing => {
      if (candidate.type !== existing.type && findingPriority(existing) <= findingPriority(candidate)) return false;
      const overlap = Math.max(0, Math.min(candidate.end, existing.end) - Math.max(candidate.start, existing.start));
      const candidateLength = candidate.end - candidate.start;
      return overlap > 0 && overlap / candidateLength >= 0.8;
    }));
  return consolidated.sort((a, b) => a.start - b.start || b.end - a.end);
}

export interface RedactionResult {
  text: string;
  redactedIds: string[];
  overlapMergedIds: string[];
  staleIds: string[];
}

function findingPriority(finding: SafetyFinding): number {
  const typeRank: Record<SafetyFindingType, number> = {
    secret: 700,
    'financial-data': 600,
    'personal-data': 500,
    'prompt-injection': 400,
    'hidden-content': 300,
    'encoded-content': 200,
    'invisible-text': 100,
  };
  const severityRank: Record<SafetySeverity, number> = { high: 30, medium: 20, low: 10 };
  return typeRank[finding.type] + severityRank[finding.severity] + (finding.source === 'rule' ? 1 : 0);
}

function rangesOverlap(a: Pick<SafetyFinding, 'start' | 'end'>, b: Pick<SafetyFinding, 'start' | 'end'>): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Redact atomically: stale findings never mutate a newer document revision. */
export function redactFindingsSafely(
  source: string,
  findings: SafetyFinding[],
  selectedIds: ReadonlySet<string>,
): RedactionResult {
  const selected = findings.filter(finding => selectedIds.has(finding.id));
  const fingerprint = documentFingerprint(source);
  const selectedFindingIds = new Set(selected.map(finding => finding.id));
  const staleIds = [
    ...[...selectedIds].filter(id => !selectedFindingIds.has(id)),
    ...selected
      .filter(finding => finding.documentFingerprint !== fingerprint
        || finding.start < 0
        || finding.end > source.length
        || source.slice(finding.start, finding.end) !== finding.value)
      .map(finding => finding.id),
  ];
  if (staleIds.length) return { text: source, redactedIds: [], overlapMergedIds: [], staleIds };

  interface RedactionGroup {
    start: number;
    end: number;
    findings: SafetyFinding[];
  }
  const groups: RedactionGroup[] = [];
  for (const finding of [...selected].sort((a, b) => a.start - b.start || b.end - a.end)) {
    const active = groups.at(-1);
    if (active && rangesOverlap(finding, active)) {
      active.start = Math.min(active.start, finding.start);
      active.end = Math.max(active.end, finding.end);
      active.findings.push(finding);
    } else {
      groups.push({ start: finding.start, end: finding.end, findings: [finding] });
    }
  }
  const overlapMergedIds = groups.flatMap(group => group.findings.length > 1
    ? group.findings.slice(1).map(finding => finding.id)
    : []);

  const counters = new Map<string, number>();
  const aliases = new Map<string, number>();
  const replacements = groups.map(group => {
    const finding = [...group.findings].sort((a, b) => findingPriority(b) - findingPriority(a)
      || (b.end - b.start) - (a.end - a.start)
      || a.start - b.start)[0];
    if (finding.type === 'invisible-text') return { ...group, replacement: '' };
    const groupedValue = source.slice(group.start, group.end);
    const aliasKey = `${finding.placeholder}\0${groupedValue.normalize('NFKC').toLocaleLowerCase()}`;
    let count = aliases.get(aliasKey);
    if (count === undefined) {
      count = (counters.get(finding.placeholder) ?? 0) + 1;
      counters.set(finding.placeholder, count);
      aliases.set(aliasKey, count);
    }
    return { ...group, replacement: `[${finding.placeholder}_${count}]` };
  });

  let text = source;
  for (const replacement of [...replacements].reverse()) {
    text = text.slice(0, replacement.start) + replacement.replacement + text.slice(replacement.end);
  }
  return {
    text,
    redactedIds: groups.flatMap(group => group.findings.map(finding => finding.id)),
    overlapMergedIds,
    staleIds: [],
  };
}

export function redactFindings(
  source: string,
  findings: SafetyFinding[],
  selectedIds: ReadonlySet<string>,
): string {
  return redactFindingsSafely(source, findings, selectedIds).text;
}
