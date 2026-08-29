import type { OcrSource } from './types';

export interface OcrRecognitionResult {
  text: string;
  confidence: number;
}

export type OcrWorkerMessage =
  | { type: 'loading' | 'recognizing'; requestId: number; progress?: number; message?: string }
  | { type: 'complete'; requestId: number; text: string; confidence: number }
  | { type: 'error'; requestId: number; message: string };

interface PdfPageRenderer {
  render(pageNumber: number): Promise<Blob>;
  destroy(): void;
}

function makeCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function canvasToBlob(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: 'image/png' });
  }
  return new Promise((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Your browser could not prepare an OCR image.'));
    }, 'image/png');
  });
}

export async function imageFileToOcrImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const maxDimension = 1800;
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = makeCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!context) throw new Error('Your browser could not create an OCR canvas.');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvasToBlob(canvas);
}

export async function createPdfPageRenderer(file: File): Promise<PdfPageRenderer> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
  const pdfDocument = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  return {
    async render(pageNumber: number): Promise<Blob> {
      const page = await pdfDocument.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(2, 1800 / Math.max(baseViewport.width, baseViewport.height));
      const viewport = page.getViewport({ scale: Math.max(0.5, scale) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Your browser could not create an OCR canvas.');
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const image = await canvasToBlob(canvas);
      page.cleanup();
      return image;
    },
    destroy() {
      void pdfDocument.destroy();
    },
  };
}

export function ocrPageNumbers(source: OcrSource): number[] {
  return source.pageNumbers?.length ? source.pageNumbers : [1];
}
