import type { SafetyFinding, SafetyFindingType, SafetySeverity } from './types';

interface ScannerRule {
  type: SafetyFindingType;
  severity: SafetySeverity;
  title: string;
  detail: string;
  pattern: RegExp;
  placeholder: string;
}

const RULES: ScannerRule[] = [
  {
    type: 'secret', severity: 'high', title: 'Possible private key',
    detail: 'Private-key material should not be shared with an AI service.',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[^]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
    placeholder: 'PRIVATE_KEY',
  },
  {
    type: 'secret', severity: 'high', title: 'Possible API key or access token',
    detail: 'This value resembles a provider credential or access token.',
    pattern: /\b(?:AIza[\w-]{30,}|AKIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9_]{30,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,})\b/g,
    placeholder: 'SECRET',
  },
  {
    type: 'secret', severity: 'high', title: 'Possible JSON Web Token',
    detail: 'JWTs can grant access to an account or service.',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    placeholder: 'JWT',
  },
  {
    type: 'personal-data', severity: 'medium', title: 'Email address',
    detail: 'Review personal contact information before sharing this document.',
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    placeholder: 'EMAIL',
  },
  {
    type: 'personal-data', severity: 'low', title: 'Possible phone number',
    detail: 'This number resembles an international or formatted phone number.',
    pattern: /(?<!\w)(?:\+?\d{1,3}[\s.-])?(?:\(?\d{2,4}\)?[\s.-])\d{3,4}[\s.-]\d{3,4}(?!\w)/g,
    placeholder: 'PHONE',
  },
  {
    type: 'personal-data', severity: 'low', title: 'IP address',
    detail: 'An IP address can reveal network or location information.',
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
    placeholder: 'IP_ADDRESS',
  },
  {
    type: 'invisible-text', severity: 'medium', title: 'Invisible Unicode characters',
    detail: 'Invisible characters can conceal instructions or corrupt copied text.',
    pattern: /[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]+/g,
    placeholder: 'INVISIBLE_TEXT',
  },
  {
    type: 'hidden-content', severity: 'medium', title: 'Hidden HTML comment',
    detail: 'Comments are invisible when rendered but may still be read by an AI.',
    pattern: /<!--[\s\S]*?-->/g,
    placeholder: 'HIDDEN_CONTENT',
  },
  {
    type: 'prompt-injection', severity: 'high', title: 'Possible prompt-injection instruction',
    detail: 'Document content appears to instruct an AI to ignore or override its task.',
    pattern: /\b(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above|system|developer)\s+(?:instructions?|prompts?|messages?)\b[^\n]*/gi,
    placeholder: 'POSSIBLE_INJECTION',
  },
  {
    type: 'prompt-injection', severity: 'medium', title: 'Possible model-control instruction',
    detail: 'Review instructions that request secrets, system prompts, tools, or role changes.',
    pattern: /\b(?:reveal|print|repeat|expose|send)\s+(?:the\s+)?(?:system prompt|developer message|api key|secret|conversation history)\b[^\n]*/gi,
    placeholder: 'POSSIBLE_INJECTION',
  },
  {
    type: 'encoded-content', severity: 'low', title: 'Long encoded-looking value',
    detail: 'Long encoded payloads are difficult to inspect and may conceal content.',
    pattern: /(?<![\w+/=])(?:[A-Za-z0-9+/]{80,}={0,2})(?![\w+/=])/g,
    placeholder: 'ENCODED_CONTENT',
  },
];

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

export function scanDocument(source: string): SafetyFinding[] {
  if (!source) return [];
  const lineStarts = buildLineStarts(source);
  const findings: SafetyFinding[] = [];
  const seen = new Set<string>();

  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rule.pattern.exec(source)) !== null) {
      const key = `${match.index}:${rule.type}:${match[0]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        id: `finding-${findings.length + 1}`,
        type: rule.type,
        severity: rule.severity,
        title: rule.title,
        detail: rule.detail,
        value: match[0],
        start: match.index,
        end: match.index + match[0].length,
        line: lineAt(lineStarts, match.index),
        placeholder: rule.placeholder,
        source: 'rule',
      });
      if (match[0].length === 0) rule.pattern.lastIndex += 1;
    }
  }

  return findings.sort((a, b) => a.start - b.start || b.end - a.end);
}

export function redactFindings(
  source: string,
  findings: SafetyFinding[],
  selectedIds: ReadonlySet<string>,
): string {
  const selected = findings
    .filter(finding => selectedIds.has(finding.id))
    .sort((a, b) => b.start - a.start);
  const counters = new Map<string, number>();
  let output = source;
  let nextBoundary = Number.POSITIVE_INFINITY;

  for (const finding of selected) {
    // Ignore a lower-position match that overlaps a range already replaced.
    if (finding.end > nextBoundary) continue;
    const count = (counters.get(finding.placeholder) ?? 0) + 1;
    counters.set(finding.placeholder, count);
    const replacement = finding.type === 'invisible-text'
      ? ''
      : `[${finding.placeholder}_${count}]`;
    output = output.slice(0, finding.start) + replacement + output.slice(finding.end);
    nextBoundary = finding.start;
  }
  return output;
}
