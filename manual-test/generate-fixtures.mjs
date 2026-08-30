import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import sharp from 'sharp';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';

const root = path.resolve('manual-test/fixtures');
await mkdir(root, { recursive: true });

function pdf(objects) {
  const chunks = ['%PDF-1.4\n'];
  const offsets = [0];
  let length = Buffer.byteLength(chunks[0]);
  objects.forEach((body, index) => {
    offsets[index + 1] = length;
    const value = `${index + 1} 0 obj\n${body}\nendobj\n`;
    chunks.push(value);
    length += Buffer.byteLength(value);
  });
  const xref = length;
  chunks.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (let index = 1; index <= objects.length; index += 1) chunks.push(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`);
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.from(chunks.join(''));
}

function selectablePdf() {
  const page1 = 'BT /F1 18 Tf 72 740 Td (Selectable PDF Import QA - Page 1) Tj 0 -32 Td /F1 12 Tf (The first page contains browser-readable text.) Tj 0 -22 Td (Reference PDF-2048 and qa.pdf@example.test) Tj ET';
  const page2 = 'BT /F1 18 Tf 72 740 Td (Selectable PDF Import QA - Page 2) Tj 0 -32 Td /F1 12 Tf (The second page confirms page ordering.) Tj 0 -22 Td (Complex layouts may produce an import warning.) Tj ET';
  return pdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(page1)} >>\nstream\n${page1}\nendstream`,
    `<< /Length ${Buffer.byteLength(page2)} >>\nstream\n${page2}\nendstream`,
  ]);
}

function scannedPdf(rgb, width, height) {
  const compressed = deflateSync(rgb);
  const header = Buffer.from('%PDF-1.4\n');
  const bodies = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`),
    Buffer.from('<< /Length 31 >>\nstream\nq 540 0 0 270 36 261 cm /Im0 Do Q\nendstream'),
    Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`), compressed, Buffer.from('\nendstream')]),
  ];
  const output = [header];
  const offsets = [0];
  let size = header.length;
  bodies.forEach((body, index) => {
    offsets[index + 1] = size;
    const start = Buffer.from(`${index + 1} 0 obj\n`);
    const end = Buffer.from('\nendobj\n');
    output.push(start, body, end);
    size += start.length + body.length + end.length;
  });
  const xref = size;
  let tail = `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= bodies.length; index += 1) tail += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  tail += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  output.push(Buffer.from(tail));
  return Buffer.concat(output);
}

function ocrSvg(lines) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="800"><rect width="100%" height="100%" fill="white"/><g fill="#111" font-family="Arial,DejaVu Sans,sans-serif" font-size="72" font-weight="600">${lines.map((line, index) => `<text x="70" y="${135 + index * 125}">${line}</text>`).join('')}</g></svg>`;
}

const english = sharp(Buffer.from(ocrSvg(['MARKDOWN STRIPPER OCR TEST', 'Invoice QA-2048', 'Total 127.45', 'Local browser recognition']))).png();
const englishPng = await english.toBuffer();
await writeFile(path.join(root, '09-ocr-english.png'), englishPng);
await writeFile(path.join(root, '10-ocr-french.png'), await sharp(Buffer.from(ocrSvg(['Bonjour équipe qualité', 'Test de confidentialité', 'Référence FR-731', 'Traitement local']))).png().toBuffer());

const raw = await sharp(englishPng).removeAlpha().raw().toBuffer({ resolveWithObject: true });
await writeFile(path.join(root, '11-scanned-image.pdf'), scannedPdf(raw.data, raw.info.width, raw.info.height));
await writeFile(path.join(root, '08-selectable-text.pdf'), selectablePdf());

const doc = new Document({ sections: [{ children: [
  new Paragraph({ text: 'DOCX Import QA', heading: HeadingLevel.HEADING_1 }),
  new Paragraph({ children: [new TextRun('This fictional Word document tests local DOCX import.')] }),
  new Paragraph({ text: 'First checklist item', bullet: { level: 0 } }),
  new Paragraph({ text: 'Second checklist item', bullet: { level: 0 } }),
  new Paragraph('Contact: qa.docx@example.test'),
  new Paragraph('Link: https://example.test/docx'),
] }] });
await writeFile(path.join(root, '07-import.docx'), await Packer.toBuffer(doc));

if (process.argv.includes('--oversized')) {
  await writeFile(path.join(root, '13-over-30mb.txt'), Buffer.alloc(31 * 1024 * 1024, 65));
  console.log('Created fixtures/13-over-30mb.txt; delete it after the limit test.');
}

console.log('Generated DOCX, PDF, scanned PDF, and OCR image fixtures.');
