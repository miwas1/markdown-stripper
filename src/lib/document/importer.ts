import type { ImportedDocument } from './types';

const MAX_FILE_BYTES = 30 * 1024 * 1024;

function extensionOf(fileName: string): string {
  return fileName.toLowerCase().split('.').pop() ?? '';
}

function cleanText(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/\u0000/g, '');
}

function inlineHtml(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof Element)) return '';
  const content = [...node.childNodes].map(inlineHtml).join('');
  switch (node.tagName.toLowerCase()) {
    case 'strong': case 'b': return `**${content}**`;
    case 'em': case 'i': return `*${content}*`;
    case 'del': case 's': return `~~${content}~~`;
    case 'code': return `\`${content.replace(/`/g, '\\`')}\``;
    case 'a': return `[${content || node.getAttribute('href') || 'Link'}](${node.getAttribute('href') || ''})`;
    case 'img': return `![${node.getAttribute('alt') || 'Image'}](${node.getAttribute('src') || ''})`;
    case 'br': return '\n';
    default: return content;
  }
}

function blockHtml(node: Node, depth = 0): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.trim() ?? '';
  if (!(node instanceof Element)) return '';
  const tag = node.tagName.toLowerCase();

  if (/^h[1-6]$/.test(tag)) return `${'#'.repeat(Number(tag[1]))} ${inlineHtml(node).trim()}\n\n`;
  if (tag === 'p') return `${inlineHtml(node).trim()}\n\n`;
  if (tag === 'pre') return `\`\`\`\n${node.textContent ?? ''}\n\`\`\`\n\n`;
  if (tag === 'blockquote') {
    return `${[...node.childNodes].map(child => blockHtml(child, depth)).join('').trim().split('\n').map(line => `> ${line}`).join('\n')}\n\n`;
  }
  if (tag === 'ul' || tag === 'ol') {
    const ordered = tag === 'ol';
    return [...node.children].map((child, index) => {
      const prefix = ordered ? `${index + 1}.` : '-';
      const direct = [...child.childNodes]
        .filter(item => !(item instanceof Element && ['ul', 'ol'].includes(item.tagName.toLowerCase())))
        .map(inlineHtml).join('').trim();
      const nested = [...child.children]
        .filter(item => ['ul', 'ol'].includes(item.tagName.toLowerCase()))
        .map(item => blockHtml(item, depth + 1).trim().split('\n').map(line => `  ${line}`).join('\n'))
        .join('\n');
      return `${'  '.repeat(depth)}${prefix} ${direct}${nested ? `\n${nested}` : ''}`;
    }).join('\n') + '\n\n';
  }
  if (tag === 'table') {
    return [...node.querySelectorAll('tr')].map(row => {
      const cells = [...row.querySelectorAll(':scope > th, :scope > td')];
      return `| ${cells.map(cell => inlineHtml(cell).trim()).join(' | ')} |`;
    }).join('\n') + '\n\n';
  }
  if (tag === 'hr') return '---\n\n';
  if (['script', 'style', 'noscript'].includes(tag)) return '';
  return [...node.childNodes].map(child => blockHtml(child, depth)).join('');
}

export function htmlToMarkdown(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  return cleanText([...document.body.childNodes].map(node => blockHtml(node)).join(''))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function importDocx(file: File): Promise<ImportedDocument> {
  const mammoth = await import('mammoth');
  const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  return {
    text: htmlToMarkdown(result.value),
    fileName: file.name,
    format: 'docx',
    warnings: result.messages.map(message => message.message),
  };
}

async function importPdf(file: File): Promise<ImportedDocument> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pageTexts = Array.from({ length: document.numPages }, () => '');
  let emptyPages = 0;
  const emptyPageNumbers: number[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items
      .filter((item): item is typeof item & { str: string; transform: number[]; width: number } => 'str' in item)
      .map(item => ({ text: item.str, x: item.transform[4], y: item.transform[5], width: item.width }));
    if (!items.length) {
      emptyPages += 1;
      emptyPageNumbers.push(pageNumber);
      continue;
    }

    const rows = new Map<number, typeof items>();
    for (const item of items) {
      const rowKey = Math.round(item.y / 3) * 3;
      const row = rows.get(rowKey) ?? [];
      row.push(item);
      rows.set(rowKey, row);
    }
    const text = [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, row]) => row.sort((a, b) => a.x - b.x).map(item => item.text).join(' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n');
    pageTexts[pageNumber - 1] = text;
  }

  const warnings: string[] = [];
  if (emptyPages) warnings.push(`${emptyPages} page${emptyPages === 1 ? '' : 's'} contained no selectable text. Scanned PDFs need OCR.`);
  warnings.push('PDF columns and complex tables may not retain their original reading order.');
  return {
    text: pageTexts.filter(Boolean).join('\n\n'),
    fileName: file.name,
    format: 'pdf',
    warnings,
    ocr: emptyPageNumbers.length > 0
      ? { kind: 'pdf', file, pageTexts, pageNumbers: emptyPageNumbers }
      : undefined,
  };
}

export async function importDocument(file: File): Promise<ImportedDocument> {
  if (file.size > MAX_FILE_BYTES) throw new Error('This file is larger than the 30 MB local import limit.');
  const extension = extensionOf(file.name);
  if (extension === 'md' || extension === 'markdown') {
    return { text: cleanText(await file.text()), fileName: file.name, format: 'markdown', warnings: [] };
  }
  if (extension === 'txt') {
    return { text: cleanText(await file.text()), fileName: file.name, format: 'text', warnings: [] };
  }
  if (extension === 'html' || extension === 'htm') {
    return { text: htmlToMarkdown(await file.text()), fileName: file.name, format: 'html', warnings: [] };
  }
  if (extension === 'docx') return importDocx(file);
  if (extension === 'pdf') return importPdf(file);
  if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'].includes(extension)) {
    return {
      text: '',
      fileName: file.name,
      format: 'image',
      warnings: ['This image is ready for local OCR. No image data leaves your device.'],
      ocr: { kind: 'image', file, pageNumbers: [1] },
    };
  }
  throw new Error('Unsupported file type. Use Markdown, TXT, HTML, DOCX, PDF, PNG, JPG, or WEBP.');
}
