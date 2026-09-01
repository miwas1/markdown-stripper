import type { SafetyFinding, SafetySeverity } from './types';

export interface PixelBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrWordInput {
  text: string;
  confidence: number;
  bbox: PixelBox;
}

export interface MappedOcrWord extends OcrWordInput {
  start: number;
  end: number;
  line: number;
}

export interface NormalizedOcrWord extends Omit<MappedOcrWord, 'bbox'> {
  rect: NormalizedRect;
}

export interface ImageRedactionSuggestion {
  id: string;
  findingId: string;
  title: string;
  detail: string;
  severity: SafetySeverity;
  placeholder: string;
  value: string;
  rects: NormalizedRect[];
}

export interface ImageVerificationResult {
  remainingFindingCount: number;
  remainingFindingTitles: string[];
  selectedValuesStillVisible: number;
  confidence: number;
  hasReadableText: boolean;
}

export function buildMappedOcrText(lines: readonly (readonly OcrWordInput[])[]): {
  text: string;
  words: MappedOcrWord[];
} {
  let text = '';
  const words: MappedOcrWord[] = [];

  lines.forEach((lineWords, line) => {
    const visibleWords = lineWords.filter(word => word.text.trim());
    if (!visibleWords.length) return;
    if (text) text += '\n';
    visibleWords.forEach((word, index) => {
      if (index > 0) text += ' ';
      const value = word.text.trim();
      const start = text.length;
      text += value;
      words.push({ ...word, text: value, start, end: text.length, line });
    });
  });

  return { text, words };
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeOcrWords(
  words: readonly MappedOcrWord[],
  imageWidth: number,
  imageHeight: number,
): NormalizedOcrWord[] {
  if (imageWidth <= 0 || imageHeight <= 0) return [];
  return words.map(({ bbox, ...word }) => {
    const x0 = clamp(bbox.x0 / imageWidth);
    const y0 = clamp(bbox.y0 / imageHeight);
    const x1 = clamp(bbox.x1 / imageWidth);
    const y1 = clamp(bbox.y1 / imageHeight);
    return {
      ...word,
      rect: {
        x: x0,
        y: y0,
        width: Math.max(0, x1 - x0),
        height: Math.max(0, y1 - y0),
      },
    };
  }).filter(word => word.rect.width > 0 && word.rect.height > 0);
}

export function normalizeRect(rect: NormalizedRect): NormalizedRect {
  const x0 = clamp(Math.min(rect.x, rect.x + rect.width));
  const y0 = clamp(Math.min(rect.y, rect.y + rect.height));
  const x1 = clamp(Math.max(rect.x, rect.x + rect.width));
  const y1 = clamp(Math.max(rect.y, rect.y + rect.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function unionRects(rects: readonly NormalizedRect[]): NormalizedRect {
  const x0 = Math.min(...rects.map(rect => rect.x));
  const y0 = Math.min(...rects.map(rect => rect.y));
  const x1 = Math.max(...rects.map(rect => rect.x + rect.width));
  const y1 = Math.max(...rects.map(rect => rect.y + rect.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function paddedRect(rect: NormalizedRect, padding = 0.004): NormalizedRect {
  return normalizeRect({
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  });
}

export function findingsToImageSuggestions(
  findings: readonly SafetyFinding[],
  words: readonly NormalizedOcrWord[],
): ImageRedactionSuggestion[] {
  return findings.flatMap(finding => {
    const matchingWords = words.filter(word => word.start < finding.end && finding.start < word.end);
    if (!matchingWords.length) return [];
    const byLine = new Map<number, NormalizedRect[]>();
    for (const word of matchingWords) {
      const lineRects = byLine.get(word.line) ?? [];
      lineRects.push(word.rect);
      byLine.set(word.line, lineRects);
    }
    const rects = [...byLine.values()].map(lineRects => paddedRect(unionRects(lineRects)));
    return [{
      id: `image-${finding.id}`,
      findingId: finding.id,
      title: finding.title,
      detail: finding.detail,
      severity: finding.severity,
      placeholder: finding.placeholder,
      value: finding.value,
      rects,
    }];
  });
}

export function collectRedactionRects(
  suggestions: readonly ImageRedactionSuggestion[],
  selectedSuggestionIds: ReadonlySet<string>,
  manualRects: readonly NormalizedRect[],
): NormalizedRect[] {
  return [
    ...suggestions.filter(suggestion => selectedSuggestionIds.has(suggestion.id)).flatMap(suggestion => suggestion.rects),
    ...manualRects.map(normalizeRect),
  ].filter(rect => rect.width > 0 && rect.height > 0);
}

export function redactedImageFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').trim() || 'image';
  return `${base}-redacted.png`;
}

export function inspectVerificationText(
  text: string,
  findings: readonly SafetyFinding[],
  selectedOriginalValues: readonly string[],
  confidence: number,
): ImageVerificationResult {
  const comparable = (value: string) => value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
  const normalizedText = comparable(text);
  const selectedValuesStillVisible = selectedOriginalValues.filter(value => {
    const normalizedValue = comparable(value);
    return normalizedValue.length >= 3 && normalizedText.includes(normalizedValue);
  }).length;
  return {
    remainingFindingCount: findings.length,
    remainingFindingTitles: [...new Set(findings.map(finding => finding.title))].slice(0, 5),
    selectedValuesStillVisible,
    confidence,
    hasReadableText: Boolean(text.trim()),
  };
}

export async function renderRedactedImage(
  source: Blob,
  rects: readonly NormalizedRect[],
): Promise<Blob> {
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not prepare the redacted image.');
    context.drawImage(bitmap, 0, 0);
    context.fillStyle = '#000000';
    for (const candidate of rects) {
      const rect = normalizeRect(candidate);
      const x = Math.floor(rect.x * bitmap.width);
      const y = Math.floor(rect.y * bitmap.height);
      const right = Math.ceil((rect.x + rect.width) * bitmap.width);
      const bottom = Math.ceil((rect.y + rect.height) * bitmap.height);
      context.fillRect(x, y, Math.max(1, right - x), Math.max(1, bottom - y));
    }
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('Your browser could not encode the redacted image.'));
      }, 'image/png');
    });
  } finally {
    bitmap.close();
  }
}
