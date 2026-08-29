import type {
  ConversionOptions,
  ConversionResult,
  DocumentReference,
  ReferenceKind,
} from './types';

interface ReferenceDefinition {
  label: string;
  url: string;
  title?: string;
  line: number;
}

const REFERENCE_DEFINITION = /^\s{0,3}\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?\s*$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
const HORIZONTAL_RULE = /^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})(.*)$/;

function normalizeLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function cleanUrl(value: string): string {
  return value.replace(/^<|>$/g, '').trim();
}

function decodeEntities(value: string): string {
  const entities: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  };
  return value.replace(/&(#x?[\da-f]+|[a-z]+);/gi, (_, entity: string) => {
    if (entity[0] === '#') {
      const isHex = entity[1]?.toLowerCase() === 'x';
      const codePoint = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _;
    }
    return entities[entity.toLowerCase()] ?? _;
  });
}

function stripInlineFormatting(value: string): string {
  return decodeEntities(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<!--[^]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/(`+)(.*?)\1/g, '$2')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1')
    .replace(/\\([\\`*{}\[\]()#+\-.!_>])/g, '$1');
}

function tableToText(line: string): string {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map(cell => stripInlineFormatting(cell.trim()))
    .join('\t');
}

function addReference(
  references: Map<string, DocumentReference>,
  label: string,
  url: string,
  kind: ReferenceKind,
  sourceLine: number,
  firstSeen: number,
  title?: string,
  defined = false,
): DocumentReference {
  const normalizedUrl = cleanUrl(url);
  const key = `${kind}:${normalizedUrl}`;
  const existing = references.get(key);
  if (existing) {
    existing.used = true;
    existing.firstSeen = Math.min(existing.firstSeen, firstSeen);
    if (!existing.title && title) existing.title = title;
    return existing;
  }
  const reference: DocumentReference = {
    id: `ref-${references.size + 1}`,
    label: stripInlineFormatting(label) || normalizedUrl,
    url: normalizedUrl,
    title,
    kind,
    firstSeen,
    sourceLine,
    defined,
    used: true,
  };
  references.set(key, reference);
  return reference;
}

function processLinks(
  line: string,
  lineNumber: number,
  definitions: Map<string, ReferenceDefinition>,
  references: Map<string, DocumentReference>,
  broken: Set<string>,
): string {
  let cursor = 0;
  let output = '';
  let ordinal = lineNumber * 10_000;
  const linkPattern = /(!?)\[([^\]]*)\](?:\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?\s*\)|\[([^\]]*)\])/g;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(line)) !== null) {
    output += line.slice(cursor, match.index);
    const isImage = match[1] === '!';
    const label = match[2] || (isImage ? 'Image' : 'Link');
    let url = match[3] || match[4] || '';
    let title = match[5] || match[6] || match[7] || undefined;
    let defined = false;

    if (!url) {
      const requestedLabel = normalizeLabel(match[8] || label);
      const definition = definitions.get(requestedLabel);
      if (definition) {
        url = definition.url;
        title = title || definition.title;
        defined = true;
      } else {
        broken.add(match[8] || label);
        output += label;
        cursor = linkPattern.lastIndex;
        continue;
      }
    }

    addReference(
      references,
      label,
      url,
      isImage ? 'image' : 'link',
      lineNumber,
      ordinal++,
      title,
      defined,
    );
    output += label;
    cursor = linkPattern.lastIndex;
  }
  output += line.slice(cursor);

  // Resolve shortcut references only when a matching definition exists. This
  // avoids treating ordinary square-bracket prose as a link.
  return output.replace(/(?<!!)\[([^\]]+)\]/g, (whole, label: string, offset: number) => {
    const definition = definitions.get(normalizeLabel(label));
    if (!definition) return whole;
    addReference(
      references,
      label,
      definition.url,
      'link',
      lineNumber,
      lineNumber * 10_000 + offset,
      definition.title,
      true,
    );
    return label;
  });
}

function appendReferenceSection(text: string, references: DocumentReference[]): string {
  const links = references.filter(reference => reference.kind !== 'image');
  const images = references.filter(reference => reference.kind === 'image');
  const sections: string[] = [];

  if (links.length) {
    sections.push('References');
    links.forEach((reference, index) => {
      const title = reference.title ? ` — ${reference.title}` : '';
      sections.push(`${index + 1}. ${reference.label} — ${reference.url}${title}`);
    });
  }
  if (images.length) {
    if (sections.length) sections.push('');
    sections.push('Media');
    images.forEach((reference, index) => {
      const title = reference.title ? ` — ${reference.title}` : '';
      sections.push(`${index + 1}. ${reference.label} — ${reference.url}${title}`);
    });
  }
  return sections.length ? `${text.trimEnd()}\n\n${sections.join('\n')}` : text;
}

/**
 * Fast, allocation-conscious Markdown conversion. It deliberately parses
 * block structure linearly and resolves links in a second linear pass.
 */
export function convertDocument(source: string, options: ConversionOptions): ConversionResult {
  if (!source) return { text: '', references: [], brokenReferences: [] };

  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const definitions = new Map<string, ReferenceDefinition>();
  const definitionLines = new Set<number>();
  let definitionFence: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const fence = lines[index].match(FENCE);
    if (fence) {
      if (!definitionFence) definitionFence = fence[1][0];
      else if (fence[1][0] === definitionFence) definitionFence = null;
      continue;
    }
    if (definitionFence) continue;
    const match = lines[index].match(REFERENCE_DEFINITION);
    if (!match) continue;
    definitions.set(normalizeLabel(match[1]), {
      label: match[1],
      url: cleanUrl(match[2] || match[3]),
      title: match[4] || match[5] || match[6] || undefined,
      line: index + 1,
    });
    definitionLines.add(index);
  }

  const references = new Map<string, DocumentReference>();
  const broken = new Set<string>();
  const output: string[] = [];
  let activeFence: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    if (definitionLines.has(index)) continue;
    const original = lines[index];
    const lineNumber = index + 1;
    const fence = original.match(FENCE);

    if (fence) {
      if (!activeFence) {
        activeFence = fence[1][0];
        if (options.mode === 'ai') output.push(original.trimEnd());
      } else if (fence[1][0] === activeFence) {
        activeFence = null;
        if (options.mode === 'ai') output.push(original.trimEnd());
      } else {
        output.push(original);
      }
      continue;
    }

    if (activeFence) {
      output.push(options.mode === 'plain' ? original : original);
      continue;
    }

    if (TABLE_DIVIDER.test(original) || (HORIZONTAL_RULE.test(original) && options.mode !== 'ai')) {
      if (options.mode === 'ai' && TABLE_DIVIDER.test(original)) output.push(original.trimEnd());
      continue;
    }

    let line = processLinks(original, lineNumber, definitions, references, broken);

    if (options.mode === 'ai') {
      line = line
        .replace(/\s+$/g, '')
        .replace(/^\s{0,3}(#{1,6})\s+/, '$1 ');
      output.push(line);
      continue;
    }

    const heading = line.match(/^\s{0,3}#{1,6}\s+(.*?)(?:\s+#+)?\s*$/);
    if (heading) {
      const cleaned = stripInlineFormatting(heading[1]);
      if (output.length && output[output.length - 1] !== '') output.push('');
      output.push(cleaned);
      if (options.mode === 'readable') output.push('─'.repeat(Math.min(Math.max(cleaned.length, 3), 48)));
      output.push('');
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line)) {
      output.push(tableToText(line));
      continue;
    }

    line = line.replace(/^\s{0,3}>\s?/, options.mode === 'readable' ? '│ ' : '');

    const task = line.match(/^(\s*)[-+*]\s+\[([ xX])\]\s+(.*)$/);
    if (task) {
      line = options.mode === 'readable'
        ? `${task[1]}${task[2].toLowerCase() === 'x' ? '☑' : '☐'} ${task[3]}`
        : `${task[1]}${task[3]}`;
    } else if (options.mode === 'plain') {
      line = line.replace(/^\s*[-+*]\s+/, '').replace(/^\s*\d+[.)]\s+/, '');
    }

    line = stripInlineFormatting(line).replace(/[ \t]+$/g, '');
    output.push(line);
  }

  let text = output.join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const orderedReferences = [...references.values()].sort((a, b) => a.firstSeen - b.firstSeen);
  if (options.appendReferences) text = appendReferenceSection(text, orderedReferences);
  if (options.mode === 'ai' && text) {
    text = `<untrusted_document>\n${text}\n</untrusted_document>`;
  }

  return {
    text,
    references: orderedReferences,
    brokenReferences: [...broken],
  };
}
