import React, { useState, useCallback, useEffect, useMemo, useRef, useDeferredValue } from 'react';
import { 
  Copy, Check, Trash2, FileText, ArrowRightLeft, Type, 
  Upload, Download, ExternalLink, Mail, Image as ImageIcon,
  PanelRightClose, PanelRightOpen, X, Link as LinkIcon,
  Wand2, Sparkles, FileOutput, Loader2, AlertCircle, Menu, Eye, Edit3, Columns,
  ShieldCheck, BookOpen, Bot, AlignLeft, CheckSquare, ScanSearch, Lock, Square, Search, Languages
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SeoContent } from './components/SeoContent';
import { SeoFooter } from './components/SeoFooter';
import { sizeBucket, trackEvent } from './lib/analytics';
import { convertDocument } from './lib/document/converter';
import { importDocument } from './lib/document/importer';
import { redactFindings, scanDocument } from './lib/document/scanner';
import {
  mergeSafetyFindings,
  modelEntitiesToFindings,
  PII_MODEL_DOWNLOAD_MB,
  type DeepScanRuntime,
  type DeepScanStatus,
  type DeepScanWorkerMessage,
} from './lib/document/pii';
import {
  createPdfPageRenderer,
  imageFileToOcrImage,
  ocrPageNumbers,
  type OcrRecognitionResult,
  type OcrWorkerMessage,
} from './lib/document/ocr';
import { OCR_LANGUAGES, type OcrLanguageCode } from './lib/document/language-options';
import {
  formatSemanticScore,
  SEMANTIC_MODEL_DOWNLOAD_MB,
  type SemanticMatch,
  type SemanticRuntime,
  type SemanticStatus,
  type SemanticWorkerMessage,
} from './lib/document/semantic';
import type { ConversionMode, SafetyFinding } from './lib/document/types';
import type { OcrSource } from './lib/document/types';

interface ExtractedAsset {
  type: 'link' | 'email' | 'image';
  value: string;
  label?: string;
}

const CONVERSION_MODES: Array<{ id: ConversionMode; label: string; description: string }> = [
  { id: 'plain', label: 'Plain', description: 'Maximum cleanup' },
  { id: 'readable', label: 'Readable', description: 'Preserve useful structure' },
  { id: 'ai', label: 'AI-ready', description: 'Safe structured context' },
];

export default function App() {
  const [markdown, setMarkdown] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showAssets, setShowAssets] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'both' | 'input' | 'output'>('both');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [conversionMode, setConversionMode] = useState<ConversionMode>('readable');
  const [appendReferences, setAppendReferences] = useState(true);
  const [selectedFindingIds, setSelectedFindingIds] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const [importedFileName, setImportedFileName] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [deepScanFindings, setDeepScanFindings] = useState<SafetyFinding[]>([]);
  const [deepScanStatus, setDeepScanStatus] = useState<DeepScanStatus>('idle');
  const [deepScanProgress, setDeepScanProgress] = useState<number | null>(null);
  const [deepScanError, setDeepScanError] = useState<string | null>(null);
  const [deepScanRuntime, setDeepScanRuntime] = useState<DeepScanRuntime | null>(null);
  const [deepModelReady, setDeepModelReady] = useState(false);
  const [ocrSource, setOcrSource] = useState<OcrSource | null>(null);
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'available' | 'running' | 'complete' | 'error'>('idle');
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const [ocrLanguage, setOcrLanguage] = useState<OcrLanguageCode>('eng');
  const [ocrDetectedLanguage, setOcrDetectedLanguage] = useState<string | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrCompletedPages, setOcrCompletedPages] = useState(0);
  const [ocrTotalPages, setOcrTotalPages] = useState(0);
  const [ocrMessage, setOcrMessage] = useState<string | null>(null);
  const [semanticMatches, setSemanticMatches] = useState<SemanticMatch[]>([]);
  const [semanticSegmentCount, setSemanticSegmentCount] = useState(0);
  const [semanticStatus, setSemanticStatus] = useState<SemanticStatus>('idle');
  const [semanticProgress, setSemanticProgress] = useState<number | null>(null);
  const [semanticError, setSemanticError] = useState<string | null>(null);
  const [semanticRuntime, setSemanticRuntime] = useState<SemanticRuntime | null>(null);
  const [semanticModelReady, setSemanticModelReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const deepWorkerRef = useRef<Worker | null>(null);
  const deepRequestIdRef = useRef(0);
  const deepSourceRef = useRef<{ requestId: number; text: string } | null>(null);
  const lastDeepScannedTextRef = useRef<string | null>(null);
  const markdownRef = useRef(markdown);
  const ocrWorkerRef = useRef<Worker | null>(null);
  const ocrRequestIdRef = useRef(0);
  const ocrResolversRef = useRef(new Map<number, { resolve: (result: OcrRecognitionResult) => void; reject: (error: Error) => void }>());
  const semanticWorkerRef = useRef<Worker | null>(null);
  const semanticRequestIdRef = useRef(0);
  const semanticSourceRef = useRef<{ requestId: number; text: string } | null>(null);
  const lastSemanticTextRef = useRef<string | null>(null);
  const deferredMarkdown = useDeferredValue(markdown);
  const conversion = useMemo(
    () => convertDocument(markdown, { mode: conversionMode, appendReferences }),
    [markdown, conversionMode, appendReferences],
  );
  const plainText = conversion.text;
  const quickSafetyFindings = useMemo(() => scanDocument(deferredMarkdown), [deferredMarkdown]);
  const safetyFindings = useMemo(
    () => mergeSafetyFindings(quickSafetyFindings, deepScanFindings),
    [quickSafetyFindings, deepScanFindings],
  );

  // Set document title & track page view invisibly on mount, handle query parameters
  useEffect(() => {
    document.title = "MarkDown Stripper - Free Online Markdown to Plain Text Converter";
    
    // Check URL parameters for prefilled text or sample presets
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const textParam = urlParams.get('text');
      const sampleParam = urlParams.get('sample');

      if (textParam) {
        setMarkdown(textParam);
      } else if (sampleParam) {
        if (sampleParam.toLowerCase() === 'chatgpt') {
          setMarkdown(`### ChatGPT Response Summary

Here is the breakdown of the requested architecture:

1. **Client-Side Core**: 100% browser-based Markdown stripping.
2. **Key Benefits**:
   - Zero latency processing
   - Complete data privacy (*no server uploads*)
   - Direct export to **Word (.docx)** and **Plain Text (.txt)**

> For more details, visit [MarkDown Stripper](https://markdown-stripper.site).`);
        } else if (sampleParam.toLowerCase() === 'readme') {
          setMarkdown(`# Project Title

A lightweight web application built with **React** and **Tailwind CSS**.

## Features
- [x] High-performance conversion
- [x] Instant clipboard copying
- [ ] Export to PDF

### Contact
Reach out at \`support@markdown-stripper.site\` or open an issue on [GitHub](https://github.com).`);
        }
      }
    } catch (e) {
      console.error('Failed to parse URL params:', e);
    }

    // Invisible background telemetry
    trackEvent('page_view', {}, true);
  }, []);

  // Debounce telemetry so conversion remains instant and typing does not cause
  // a network write per keystroke.
  useEffect(() => {
    if (plainText.trim().length <= 10) return;
    const timer = window.setTimeout(() => {
      trackEvent('convert_markdown', {
        feature: 'live_editor',
        variant: conversionMode,
        sizeBucket: sizeBucket(plainText.length),
        outcome: 'success',
      }, true);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [plainText, conversionMode]);

  // Extract links, images, and emails
  const assets = useMemo(() => {
    const found: ExtractedAsset[] = conversion.references.map(reference => ({
      type: reference.kind === 'image' ? 'image' : 'link',
      value: reference.url,
      label: reference.label,
    }));
    let match;

    // Bare URLs (approximation)
    const bareUrlRegex = /(?<!["'\(])(https?:\/\/[^\s\)\>]+)(?![^<]*>)/g;
    while ((match = bareUrlRegex.exec(markdown)) !== null) {
      if (!found.some(f => f.value === match![1])) {
        found.push({ type: 'link', value: match[1] });
      }
    }

    // Emails
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    while ((match = emailRegex.exec(markdown)) !== null) {
      found.push({ type: 'email', value: match[1] });
    }

    return found;
  }, [markdown, conversion.references]);

  const cancelDeepScan = useCallback(() => {
    deepWorkerRef.current?.terminate();
    deepWorkerRef.current = null;
    deepRequestIdRef.current += 1;
    deepSourceRef.current = null;
    setDeepScanStatus('idle');
    setDeepScanProgress(null);
    setDeepScanError(null);
    setDeepModelReady(false);
  }, []);

  const getDeepWorker = useCallback(() => {
    if (deepWorkerRef.current) return deepWorkerRef.current;
    const worker = new Worker(new URL('./lib/document/pii.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<DeepScanWorkerMessage>) => {
      const message = event.data;
      const active = deepSourceRef.current;
      if (!active || active.requestId !== message.requestId) return;

      if (message.type === 'loading') {
        setDeepScanStatus('loading');
        setDeepScanRuntime(message.runtime);
        setDeepScanProgress(message.progress ?? null);
        return;
      }
      if (message.type === 'ready') {
        setDeepModelReady(true);
        setDeepScanRuntime(message.runtime);
        setDeepScanStatus('scanning');
        setDeepScanProgress(0);
        return;
      }
      if (message.type === 'scanning') {
        setDeepScanStatus('scanning');
        setDeepScanProgress(message.progress);
        return;
      }
      if (message.type === 'complete') {
        const findings = modelEntitiesToFindings(active.text, message.entities);
        setDeepScanFindings(findings);
        setDeepScanRuntime(message.runtime);
        setDeepScanStatus('complete');
        setDeepScanProgress(100);
        setDeepScanError(null);
        setDeepModelReady(true);
        lastDeepScannedTextRef.current = active.text;
        deepSourceRef.current = null;
        setShowAssets(true);
        trackEvent('privacy_scan_complete', {
          feature: 'privacy_scan',
          sizeBucket: sizeBucket(active.text.length),
          outcome: 'success',
        });
        return;
      }

      console.error('Deep privacy scan error:', message.message);
      setDeepScanStatus('error');
      setDeepScanProgress(null);
      setDeepScanError('Could not run the deep local scan. Check your connection and available device memory, then retry.');
      deepSourceRef.current = null;
    };
    worker.onerror = (event) => {
      console.error('Deep privacy worker error:', event.message);
      setDeepScanStatus('error');
      setDeepScanProgress(null);
      setDeepScanError('The deep local scanner is not supported on this device or ran out of memory.');
      deepSourceRef.current = null;
      worker.terminate();
      deepWorkerRef.current = null;
      setDeepModelReady(false);
    };
    deepWorkerRef.current = worker;
    return worker;
  }, []);

  const getOcrWorker = useCallback(() => {
    if (ocrWorkerRef.current) return ocrWorkerRef.current;
    const worker = new Worker(new URL('./lib/document/ocr.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<OcrWorkerMessage>) => {
      const message = event.data;
      if (message.type === 'complete') {
        const resolver = ocrResolversRef.current.get(message.requestId);
        if (!resolver) return;
        ocrResolversRef.current.delete(message.requestId);
        resolver.resolve({ text: message.text, confidence: message.confidence });
      } else if (message.type === 'error') {
        const resolver = ocrResolversRef.current.get(message.requestId);
        if (!resolver) return;
        ocrResolversRef.current.delete(message.requestId);
        resolver.reject(new Error(message.message));
      } else {
        if (message.progress !== undefined) setOcrProgress(message.progress);
        if (message.message) setOcrMessage(message.message);
      }
    };
    worker.onerror = event => {
      const error = new Error(event.message || 'The local OCR worker stopped unexpectedly.');
      for (const resolver of ocrResolversRef.current.values()) resolver.reject(error);
      ocrResolversRef.current.clear();
      worker.terminate();
      ocrWorkerRef.current = null;
      setOcrStatus('error');
      setOcrError('Local OCR is not supported on this device or ran out of memory.');
    };
    ocrWorkerRef.current = worker;
    return worker;
  }, []);

  const cancelOcr = useCallback(() => {
    for (const resolver of ocrResolversRef.current.values()) resolver.reject(new Error('OCR cancelled.'));
    ocrResolversRef.current.clear();
    ocrWorkerRef.current?.terminate();
    ocrWorkerRef.current = null;
    setOcrStatus(ocrSource ? 'available' : 'idle');
    setOcrProgress(null);
    setOcrMessage(null);
  }, [ocrSource]);

  const recognizeOcrImage = useCallback((image: Blob, language: OcrLanguageCode): Promise<OcrRecognitionResult> => {
    const requestId = ocrRequestIdRef.current + 1;
    ocrRequestIdRef.current = requestId;
    return new Promise((resolve, reject) => {
      ocrResolversRef.current.set(requestId, { resolve, reject });
      getOcrWorker().postMessage({
        type: 'recognize',
        requestId,
        language,
        image,
      });
    });
  }, [getOcrWorker]);

  const handleRunOcr = useCallback(async () => {
    if (!ocrSource || ocrStatus === 'running') return;
    const source = ocrSource;
    const sourceText = markdown;
    const pageNumbers = ocrPageNumbers(source);
    const pageTexts = source.pageTexts ? [...source.pageTexts] : [''];
    setOcrStatus('running');
    setOcrError(null);
    setOcrMessage('Preparing local OCR…');
    setOcrProgress(0);
    setOcrCompletedPages(0);
    setOcrTotalPages(pageNumbers.length);

    let renderer: Awaited<ReturnType<typeof createPdfPageRenderer>> | null = null;
    try {
      if (source.kind === 'pdf') renderer = await createPdfPageRenderer(source.file);
      const warnings: string[] = [];
      for (let index = 0; index < pageNumbers.length; index += 1) {
        if (markdownRef.current !== sourceText) return;
        const pageNumber = pageNumbers[index];
        const image = source.kind === 'pdf'
          ? await renderer!.render(pageNumber)
          : await imageFileToOcrImage(source.file);
        if (markdownRef.current !== sourceText) return;
        const result = await recognizeOcrImage(image, ocrLanguage);
        if (result.text) pageTexts[pageNumber - 1] = result.text;
        if (result.confidence < 55) warnings.push(`Page ${pageNumber} OCR confidence was ${Math.round(result.confidence)}%; review its text.`);
        setOcrCompletedPages(index + 1);
        setOcrProgress(Math.round(((index + 1) / pageNumbers.length) * 100));
        setOcrMessage(`Page ${index + 1} of ${pageNumbers.length} complete`);
      }
      if (markdownRef.current !== sourceText) return;
      const extracted = pageTexts.filter(Boolean).join('\n\n').trim();
      setMarkdown(extracted);
      setImportWarnings(current => [...current.filter(warning => !/OCR confidence/.test(warning)), ...warnings]);
      setOcrSource(null);
      setOcrStatus('complete');
      setOcrProgress(100);
      setOcrMessage(`Extracted ${pageNumbers.length} page${pageNumbers.length === 1 ? '' : 's'} locally`);
      trackEvent('ocr_complete', {
        feature: 'ocr',
        variant: source.kind,
        sizeBucket: sizeBucket(source.file.size),
        outcome: 'success',
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'OCR cancelled.') return;
      console.error('OCR error:', error);
      setOcrStatus('error');
      setOcrError(error instanceof Error ? error.message : 'Local OCR failed. Try another image or PDF.');
      setOcrProgress(null);
      setOcrMessage(null);
    } finally {
      renderer?.destroy();
    }
  }, [markdown, ocrLanguage, ocrSource, ocrStatus, recognizeOcrImage]);

  const getSemanticWorker = useCallback(() => {
    if (semanticWorkerRef.current) return semanticWorkerRef.current;
    const worker = new Worker(new URL('./lib/document/semantic.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<SemanticWorkerMessage>) => {
      const message = event.data;
      const active = semanticSourceRef.current;
      if (!active || active.requestId !== message.requestId) return;
      if (message.type === 'loading') {
        setSemanticStatus('loading');
        setSemanticRuntime(message.runtime);
        setSemanticProgress(message.progress ?? null);
      } else if (message.type === 'analyzing') {
        setSemanticStatus('analyzing');
        setSemanticRuntime(message.runtime);
        setSemanticProgress(message.progress);
      } else if (message.type === 'complete') {
        setSemanticMatches(message.matches);
        setSemanticSegmentCount(message.segmentCount);
        setSemanticStatus('complete');
        setSemanticRuntime(message.runtime);
        setSemanticProgress(100);
        setSemanticError(null);
        setSemanticModelReady(true);
        lastSemanticTextRef.current = active.text;
        semanticSourceRef.current = null;
        setShowAssets(true);
        trackEvent('semantic_scan_complete', {
          feature: 'semantic_scan',
          sizeBucket: sizeBucket(active.text.length),
          outcome: 'success',
        });
      } else {
        console.error('Semantic analysis error:', message.message);
        setSemanticStatus('error');
        setSemanticProgress(null);
        setSemanticError('Could not analyze similar passages on this device. Please retry.');
        semanticSourceRef.current = null;
      }
    };
    worker.onerror = event => {
      console.error('Semantic worker error:', event.message);
      setSemanticStatus('error');
      setSemanticProgress(null);
      setSemanticError('Semantic analysis is not supported on this device or ran out of memory.');
      semanticSourceRef.current = null;
      worker.terminate();
      semanticWorkerRef.current = null;
      setSemanticModelReady(false);
    };
    semanticWorkerRef.current = worker;
    return worker;
  }, []);

  const cancelSemanticScan = useCallback(() => {
    semanticWorkerRef.current?.terminate();
    semanticWorkerRef.current = null;
    semanticRequestIdRef.current += 1;
    semanticSourceRef.current = null;
    setSemanticStatus('idle');
    setSemanticProgress(null);
    setSemanticError(null);
    setSemanticModelReady(false);
  }, []);

  const handleSemanticScan = useCallback(() => {
    if (!markdown.trim() || semanticStatus === 'loading' || semanticStatus === 'analyzing') return;
    const requestId = semanticRequestIdRef.current + 1;
    semanticRequestIdRef.current = requestId;
    semanticSourceRef.current = { requestId, text: markdown };
    setSemanticMatches([]);
    setSemanticStatus(semanticModelReady ? 'analyzing' : 'loading');
    setSemanticProgress(semanticModelReady ? 0 : null);
    setSemanticError(null);
    setShowAssets(true);
    getSemanticWorker().postMessage({ type: 'semantic', requestId, text: markdown });
  }, [getSemanticWorker, markdown, semanticModelReady, semanticStatus]);

  const handleDeepScan = useCallback(() => {
    if (!markdown.trim() || deepScanStatus === 'loading' || deepScanStatus === 'scanning') return;
    const requestId = deepRequestIdRef.current + 1;
    deepRequestIdRef.current = requestId;
    deepSourceRef.current = { requestId, text: markdown };
    setDeepScanFindings([]);
    setSelectedFindingIds(new Set());
    setDeepScanStatus(deepModelReady ? 'scanning' : 'loading');
    setDeepScanProgress(deepModelReady ? 0 : null);
    setDeepScanError(null);
    setShowAssets(true);
    getDeepWorker().postMessage({ type: 'scan', requestId, text: markdown });
  }, [deepModelReady, deepScanStatus, getDeepWorker, markdown]);

  // A finding's offsets are only valid for the exact text that was scanned.
  // Cancel in-flight work and discard stale model findings after an edit.
  useEffect(() => {
    markdownRef.current = markdown;
    const active = deepSourceRef.current;
    if (active && active.text !== markdown) cancelDeepScan();
    const semanticActive = semanticSourceRef.current;
    if (semanticActive && semanticActive.text !== markdown) cancelSemanticScan();
    if (lastDeepScannedTextRef.current !== null && lastDeepScannedTextRef.current !== markdown) {
      lastDeepScannedTextRef.current = null;
      setDeepScanFindings([]);
      setDeepScanStatus('idle');
      setDeepScanProgress(null);
      setDeepScanError(null);
      setSelectedFindingIds(new Set());
    }
    if (lastSemanticTextRef.current !== null && lastSemanticTextRef.current !== markdown) {
      lastSemanticTextRef.current = null;
      setSemanticMatches([]);
      setSemanticSegmentCount(0);
      setSemanticStatus('idle');
      setSemanticProgress(null);
      setSemanticError(null);
    }
  }, [cancelDeepScan, cancelSemanticScan, markdown]);

  useEffect(() => () => {
    deepWorkerRef.current?.terminate();
    semanticWorkerRef.current?.terminate();
    ocrWorkerRef.current?.terminate();
  }, []);

  const handleCopy = useCallback(async () => {
    if (!plainText) return;
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      trackEvent('copy_text', { feature: 'clipboard', sizeBucket: sizeBucket(plainText.length), outcome: 'success' });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy!', err);
    }
  }, [plainText]);

  const handleClear = () => {
    cancelDeepScan();
    cancelOcr();
    cancelSemanticScan();
    setMarkdown('');
    setDeepScanFindings([]);
    lastDeepScannedTextRef.current = null;
    setSelectedFindingIds(new Set());
    setImportedFileName(null);
    setImportWarnings([]);
    setOcrSource(null);
    setOcrStatus('idle');
    setOcrProgress(null);
    setOcrError(null);
    setOcrDetectedLanguage(null);
    setOcrCompletedPages(0);
    setOcrTotalPages(0);
    setOcrMessage(null);
    setSemanticMatches([]);
    setSemanticSegmentCount(0);
    setSemanticStatus('idle');
    setSemanticProgress(null);
    setSemanticError(null);
    setError(null);
  };

  const handleExportText = () => {
    if (!plainText) return;
    const blob = new Blob([plainText], { type: 'text/plain' });
    void import('file-saver').then(({ default: saveAs }) => saveAs(blob, 'converted-text.txt'));
    trackEvent('export_file', { feature: 'download', variant: 'txt', sizeBucket: sizeBucket(plainText.length), outcome: 'success' });
  };

  const handleExportDocx = async () => {
    if (!plainText) return;
    const [{ Document, Packer, Paragraph, TextRun }, { default: saveAs }] = await Promise.all([
      import('docx'),
      import('file-saver'),
    ]);
    const lines = plainText.split('\n');
    const doc = new Document({
      sections: [{
        properties: {},
        children: lines.map(line => new Paragraph({
          children: [new TextRun(line)],
        })),
      }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, 'converted-document.docx');
    trackEvent('export_file', { feature: 'download', variant: 'docx', sizeBucket: sizeBucket(plainText.length), outcome: 'success' });
  };

  const handleFileUpload = async (file: File) => {
    if (isImporting) return;
    cancelOcr();
    setIsImporting(true);
    setError(null);
    setImportWarnings([]);
    try {
      const imported = await importDocument(file);
      setMarkdown(imported.text);
      setImportedFileName(imported.fileName);
      setImportWarnings(imported.warnings);
      setOcrSource(imported.ocr ?? null);
      setOcrStatus(imported.ocr ? 'available' : 'idle');
      setOcrProgress(null);
      setOcrError(null);
      setOcrCompletedPages(0);
      setOcrTotalPages(imported.ocr?.pageNumbers?.length ?? 0);
      setOcrMessage(null);
      const { detectOcrLanguage } = await import('./lib/document/language');
      const language = detectOcrLanguage(imported.text);
      setOcrDetectedLanguage(imported.ocr
        ? `${language.detected ? 'Suggested' : 'Default'} ${language.label} · ${language.confidence} confidence`
        : null);
      setOcrLanguage(language.code);
      setSemanticMatches([]);
      setSemanticSegmentCount(0);
      setSemanticStatus('idle');
      setSelectedFindingIds(new Set());
      trackEvent('document_import', {
        feature: 'import',
        variant: imported.format,
        sizeBucket: sizeBucket(file.size),
        outcome: 'success',
      });
    } catch (err) {
      console.error('Import error:', err);
      setError(err instanceof Error ? err.message : 'Could not import this document.');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFileUpload(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const insertSample = () => {
    setMarkdown(`# Sample Markdown Document
    
This sample exercises common Markdown syntax and local document insights.

## Extractor Demo
- Email: contact@example.com
- Link: [Visit the project](https://markdown-stripper.site)
- Image: ![Logo](https://raw.githubusercontent.com/lucide-react/lucide/main/icons/file-text.svg)

## Lists & Highlights
- Feature A: **Instant conversion**
- Feature B: *Client-side privacy*
  - Sub-feature: Word & character counter

### Blockquotes & Code
> "Markdown is a lightweight markup language designed for formatting readability."

\`\`\`javascript
const result = convertDocument(text, { mode: 'readable' });
\`\`\`
`);
  };

  const toggleFinding = (id: string) => {
    setSelectedFindingIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFindings = () => {
    setSelectedFindingIds(new Set(safetyFindings.map(finding => finding.id)));
  };

  const handleRedactSelected = () => {
    if (!selectedFindingIds.size) return;
    setMarkdown(current => redactFindings(current, safetyFindings, selectedFindingIds));
    trackEvent('redact_findings', { feature: 'redaction', outcome: 'success' });
    setSelectedFindingIds(new Set());
  };

  const totalAssetsCount = assets.length + safetyFindings.length + conversion.brokenReferences.length;
  const isDeepScanning = deepScanStatus === 'loading' || deepScanStatus === 'scanning';
  const isSemanticScanning = semanticStatus === 'loading' || semanticStatus === 'analyzing';
  const modelFindingCount = safetyFindings.filter(finding => finding.source === 'local-ai').length;
  const safetyStatus = deferredMarkdown !== markdown
    ? 'Quick scan…'
    : deepScanStatus === 'loading'
      ? 'Loading deep scan…'
      : deepScanStatus === 'scanning'
        ? 'Deep scanning…'
        : safetyFindings.length
          ? `${safetyFindings.length} found`
          : 'Clear';

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans selection:bg-indigo-100 flex flex-col antialiased">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-6">
            <div className="flex items-center gap-2.5">
              <div className="bg-indigo-600 p-2 rounded-xl shadow-indigo-200 shadow-md">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-zinc-900 leading-tight">MarkDown Stripper</h1>
                <p className="text-[10px] text-zinc-400 font-medium hidden sm:block">Markdown to Plain Text Converter</p>
              </div>
            </div>

            <nav className="hidden lg:flex items-center gap-5 text-xs font-medium text-zinc-500 pl-4 border-l border-zinc-200">
              <a href="#features" className="hover:text-indigo-600 transition-colors">Features</a>
              <a href="#how-to-use" className="hover:text-indigo-600 transition-colors">How It Works</a>
              <a href="#syntax-reference" className="hover:text-indigo-600 transition-colors">Syntax Matrix</a>
              <a href="#use-cases" className="hover:text-indigo-600 transition-colors">Use Cases</a>
              <a href="#faq" className="hover:text-indigo-600 transition-colors">FAQ</a>
            </nav>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Sample & Upload Buttons (Desktop) */}
            <div className="hidden md:flex items-center gap-1 border-l pl-2 border-zinc-200">
              <button
                onClick={insertSample}
                className="text-xs font-medium text-zinc-600 hover:text-indigo-600 transition-colors px-2.5 py-2 rounded-lg hover:bg-zinc-100 min-h-[40px]"
              >
                Sample
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-indigo-600 transition-colors px-2.5 py-2 rounded-lg hover:bg-zinc-100 min-h-[40px] disabled:opacity-50"
              >
                {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                <span>{isImporting ? 'Importing' : 'Upload'}</span>
              </button>
            </div>

            {/* Insights & Assets Toggle */}
            <button
              onClick={() => setShowAssets(!showAssets)}
              className={`p-2.5 rounded-xl transition-all relative min-h-[44px] min-w-[44px] flex items-center justify-center ${
                showAssets ? 'bg-indigo-50 text-indigo-600' : 'text-zinc-600 hover:bg-zinc-100 active:bg-zinc-200'
              }`}
              title={showAssets ? "Hide Insights & Assets" : "Show Insights & Assets"}
              aria-label="Toggle Insights Drawer"
            >
              {showAssets ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
              {totalAssetsCount > 0 && !showAssets && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-indigo-600 rounded-full ring-2 ring-white" />
              )}
            </button>

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2.5 rounded-xl text-zinc-600 hover:bg-zinc-100 active:bg-zinc-200 lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Toggle navigation menu"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={(e) => e.target.files?.[0] && void handleFileUpload(e.target.files[0])}
              className="hidden" 
              accept=".md,.markdown,.txt,.html,.htm,.docx,.pdf,.png,.jpg,.jpeg,.webp,.bmp,.gif"
            />
          </div>
        </div>

        {/* Mobile Navigation Dropdown */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="lg:hidden border-t border-zinc-100 bg-white px-4 py-4 space-y-3 shadow-lg overflow-hidden"
            >
              <div className="grid grid-cols-1 gap-2 pb-3 border-b border-zinc-100">
                <button
                  onClick={() => {
                    insertSample();
                    setIsMobileMenuOpen(false);
                  }}
                  className="flex items-center justify-center gap-2 text-xs font-semibold bg-zinc-100 text-zinc-700 p-3 rounded-xl min-h-[44px] hover:bg-zinc-200 active:scale-98"
                >
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <span>Insert Sample</span>
                </button>
                <button
                  onClick={() => {
                    fileInputRef.current?.click();
                    setIsMobileMenuOpen(false);
                  }}
                  disabled={isImporting}
                  className="flex items-center justify-center gap-2 text-xs font-semibold bg-zinc-100 text-zinc-700 p-3 rounded-xl min-h-[44px] hover:bg-zinc-200 active:scale-98 disabled:opacity-50"
                >
                  {isImporting ? <Loader2 className="w-4 h-4 animate-spin text-zinc-600" /> : <Upload className="w-4 h-4 text-zinc-600" />}
                  <span>{isImporting ? 'Importing' : 'Upload File'}</span>
                </button>
                <button
                  onClick={() => {
                    handleClear();
                    setIsMobileMenuOpen(false);
                  }}
                  disabled={!markdown}
                  className="flex items-center justify-center gap-2 text-xs font-semibold bg-red-50 text-red-600 p-3 rounded-xl min-h-[44px] hover:bg-red-100 active:scale-98 disabled:opacity-40"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                  <span>Clear All</span>
                </button>
              </div>

              <div className="flex flex-col space-y-1 text-sm font-medium text-zinc-600 pt-1">
                <a 
                  href="#features" 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="py-2.5 px-3 rounded-lg hover:bg-zinc-50 hover:text-indigo-600 transition-colors"
                >
                  Features
                </a>
                <a 
                  href="#how-to-use" 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="py-2.5 px-3 rounded-lg hover:bg-zinc-50 hover:text-indigo-600 transition-colors"
                >
                  How It Works
                </a>
                <a 
                  href="#syntax-reference" 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="py-2.5 px-3 rounded-lg hover:bg-zinc-50 hover:text-indigo-600 transition-colors"
                >
                  Syntax Matrix
                </a>
                <a 
                  href="#use-cases" 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="py-2.5 px-3 rounded-lg hover:bg-zinc-50 hover:text-indigo-600 transition-colors"
                >
                  Use Cases
                </a>
                <a 
                  href="#faq" 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="py-2.5 px-3 rounded-lg hover:bg-zinc-50 hover:text-indigo-600 transition-colors"
                >
                  FAQ
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Main Workspace Area */}
      <div className="flex-1 relative">
        <main className={`transition-all duration-300 ease-in-out px-3 sm:px-6 lg:px-8 py-4 sm:py-8 ${showAssets ? 'lg:mr-96' : ''}`}>
          <div className="max-w-7xl mx-auto space-y-4">

            {/* Purpose-aware conversion controls */}
            <section className="bg-white border border-zinc-200 rounded-2xl p-2 sm:p-3 shadow-sm flex flex-col lg:flex-row lg:items-center gap-2 sm:gap-3">
              <div className="grid grid-cols-3 gap-1.5 flex-1" role="radiogroup" aria-label="Conversion mode">
                {CONVERSION_MODES.map(mode => {
                  const Icon = mode.id === 'plain' ? AlignLeft : mode.id === 'readable' ? BookOpen : Bot;
                  const active = conversionMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      role="radio"
                      aria-checked={active}
                      onClick={() => setConversionMode(mode.id)}
                      className={`min-h-[48px] sm:min-h-[54px] rounded-xl px-2 sm:px-4 flex items-center justify-center sm:justify-start gap-2.5 transition-all ${
                        active
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                          : 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-indigo-600'}`} />
                      <span className="text-left">
                        <span className="block text-xs sm:text-sm font-bold">{mode.label}</span>
                        <span className={`hidden sm:block text-[10px] mt-0.5 ${active ? 'text-indigo-100' : 'text-zinc-400'}`}>
                          {mode.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                role="checkbox"
                aria-checked={appendReferences}
                onClick={() => setAppendReferences(value => !value)}
                className={`min-h-[44px] px-3.5 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold transition-colors ${
                  appendReferences ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-50 text-zinc-500'
                }`}
              >
                <CheckSquare className="w-4 h-4" />
                References at bottom
                {conversion.references.length > 0 && (
                  <span className="bg-white/80 px-1.5 py-0.5 rounded-full text-[10px]">{conversion.references.length}</span>
                )}
              </button>
            </section>

            {(importedFileName || importWarnings.length > 0) && (
              <div className="bg-sky-50 border border-sky-100 rounded-xl px-3.5 py-2.5 text-xs text-sky-800 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                {importedFileName && <span className="font-bold truncate">Imported: {importedFileName}</span>}
                {importWarnings.length > 0 && <span className="text-sky-700">{importWarnings.join(' ')}</span>}
              </div>
            )}

            {ocrSource && (
              <section className="rounded-2xl border border-amber-200 bg-amber-50/70 px-3.5 py-3 sm:px-4 flex flex-col md:flex-row md:items-center gap-3" aria-live="polite">
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-white border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
                    <ScanSearch className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-amber-950">
                      {ocrSource.kind === 'pdf'
                        ? `${ocrSource.pageNumbers?.length ?? 0} scanned PDF page${(ocrSource.pageNumbers?.length ?? 0) === 1 ? '' : 's'} ready for OCR`
                        : 'Image ready for local OCR'}
                    </p>
                    <p className="text-[10px] text-amber-800/80 mt-0.5">
                      Extract printed text on this device. Nothing from the document is uploaded.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap md:justify-end">
                  <label className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-amber-900">
                    <Languages className="w-3.5 h-3.5" />
                    <span className="sr-only">OCR language</span>
                    <select
                      value={ocrLanguage}
                      onChange={event => setOcrLanguage(event.target.value as OcrLanguageCode)}
                      disabled={ocrStatus === 'running'}
                      className="bg-white border border-amber-200 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-amber-300"
                    >
                      {OCR_LANGUAGES.map(language => <option key={language.code} value={language.code}>{language.label}</option>)}
                    </select>
                  </label>
                  {ocrDetectedLanguage && <span className="text-[10px] text-amber-800">{ocrDetectedLanguage}</span>}
                  {ocrStatus === 'running' ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-amber-800 max-w-[150px] truncate">{ocrMessage ?? `Reading ${ocrCompletedPages}/${ocrTotalPages}`}</span>
                      <button onClick={cancelOcr} className="min-h-[36px] px-3 rounded-lg bg-white border border-amber-200 text-amber-900 text-[10px] font-bold hover:bg-amber-100">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button onClick={handleRunOcr} className="min-h-[36px] px-3.5 rounded-lg bg-amber-600 text-white text-[10px] font-bold hover:bg-amber-700 active:scale-[0.99]">
                      {ocrStatus === 'error' ? 'Retry OCR' : 'Extract text locally'}
                    </button>
                  )}
                </div>
                {ocrStatus === 'running' && (
                  <div className="w-full md:w-24 h-1.5 rounded-full bg-white border border-amber-200 overflow-hidden">
                    <div className="h-full rounded-full bg-amber-500 transition-[width] duration-300" style={{ width: `${ocrProgress ?? 4}%` }} />
                  </div>
                )}
                {ocrStatus === 'error' && <p className="text-[10px] text-red-700 w-full">{ocrError}</p>}
              </section>
            )}
            
            {/* Mobile View Switcher (Visible on small & medium screens < lg) */}
            <div className="lg:hidden flex items-center justify-between bg-zinc-200/70 p-1 rounded-xl gap-1 text-xs font-semibold text-zinc-600">
              <button
                onClick={() => setMobileTab('input')}
                className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all min-h-[38px] ${
                  mobileTab === 'input' ? 'bg-white text-zinc-900 shadow-sm font-bold' : 'hover:text-zinc-900'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                <span>Input</span>
              </button>
              <button
                onClick={() => setMobileTab('output')}
                className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all min-h-[38px] ${
                  mobileTab === 'output' ? 'bg-white text-zinc-900 shadow-sm font-bold' : 'hover:text-zinc-900'
                }`}
              >
                <Eye className="w-3.5 h-3.5 text-emerald-600" />
                <span>Output</span>
              </button>
              <button
                onClick={() => setMobileTab('both')}
                className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all min-h-[38px] ${
                  mobileTab === 'both' ? 'bg-white text-zinc-900 shadow-sm font-bold' : 'hover:text-zinc-900'
                }`}
              >
                <Columns className="w-3.5 h-3.5 text-zinc-500" />
                <span>Split</span>
              </button>
            </div>

            {/* Quick Actions Row (Mobile) */}
            <div className="flex sm:hidden items-center justify-between gap-2 overflow-x-auto pb-1 scrollbar-none">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={insertSample}
                  className="text-xs font-semibold bg-white border border-zinc-200 text-zinc-700 px-3 py-2 rounded-xl min-h-[40px] hover:bg-zinc-50 active:scale-95 whitespace-nowrap"
                >
                  Sample
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isImporting}
                  className="flex items-center gap-1 text-xs font-semibold bg-white border border-zinc-200 text-zinc-700 px-3 py-2 rounded-xl min-h-[40px] hover:bg-zinc-50 active:scale-95 whitespace-nowrap disabled:opacity-50"
                >
                  {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500" /> : <Upload className="w-3.5 h-3.5 text-zinc-500" />}
                  <span>{isImporting ? 'Importing' : 'Upload'}</span>
                </button>
              </div>

              {markdown && (
                <button
                  onClick={handleClear}
                  className="p-2 text-zinc-400 hover:text-red-600 rounded-xl min-h-[40px] min-w-[40px] flex items-center justify-center"
                  title="Clear Input"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Editor Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8 min-h-[480px]">
            
              {/* Input Section */}
              <section 
                className={`flex flex-col bg-white rounded-2xl border-2 transition-all duration-200 overflow-hidden relative ${
                  isDragging ? 'border-indigo-500 bg-indigo-50/10' : 'border-zinc-200 shadow-sm sm:shadow-md'
                } ${mobileTab === 'output' ? 'hidden lg:flex' : 'flex'}`}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
              >
                <div className="px-3 sm:px-4 py-3 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70">
                  <div className="flex items-center gap-2 text-zinc-700">
                    <Type className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-bold uppercase tracking-wider">Markdown Input</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {markdown && (
                      <button
                        onClick={handleClear}
                        className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all min-h-[36px] min-w-[36px] flex items-center justify-center"
                        title="Clear Input"
                        aria-label="Clear Input"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                
                {error && (
                  <div className="bg-red-50 border-b border-red-100 px-4 py-2.5 flex items-center gap-2 text-red-600 text-xs font-medium">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{error}</span>
                    <button onClick={() => setError(null)} className="ml-auto hover:text-red-800 uppercase text-[10px] font-bold py-1 px-2">Dismiss</button>
                  </div>
                )}

                <textarea
                  value={markdown}
                  onChange={(e) => setMarkdown(e.target.value)}
                  placeholder="Paste Markdown or drop MD, TXT, HTML, DOCX, PDF, or an image..."
                  className="flex-1 p-4 sm:p-6 resize-none focus:outline-none text-zinc-800 font-mono text-base sm:text-sm leading-relaxed placeholder:text-zinc-300 min-h-[300px] sm:min-h-[380px]"
                />
                
                {isDragging && (
                  <div className="absolute inset-0 bg-indigo-600/5 backdrop-blur-[1px] flex items-center justify-center pointer-events-none p-4">
                    <div className="bg-white px-6 py-4 rounded-2xl shadow-xl border border-indigo-100 flex items-center gap-3 scale-105 transition-transform">
                      <Upload className="w-6 h-6 text-indigo-600 animate-bounce" />
                      <span className="font-semibold text-indigo-900 text-sm">Drop Markdown, TXT, HTML, DOCX, PDF, or image</span>
                    </div>
                  </div>
                )}
              </section>

              {/* Output Section */}
              <section 
                className={`flex flex-col bg-white rounded-2xl border border-zinc-200 shadow-sm sm:shadow-md overflow-hidden relative ${
                  mobileTab === 'input' ? 'hidden lg:flex' : 'flex'
                }`}
              >
                <div className="px-3 sm:px-4 py-3 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70">
                  <div className="flex items-center gap-2 text-zinc-700">
                    <ArrowRightLeft className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold uppercase tracking-wider">
                      {conversionMode === 'plain' ? 'Plain Text' : conversionMode === 'readable' ? 'Readable Text' : 'AI-ready Context'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-2">
                    <div className="flex items-center bg-zinc-100 rounded-xl p-0.5">
                      <button
                        onClick={handleExportText}
                        disabled={!plainText}
                        className="p-2 rounded-lg text-zinc-500 hover:text-indigo-600 hover:bg-white transition-all disabled:opacity-30 disabled:hover:text-zinc-500 min-h-[36px] min-w-[36px] flex items-center justify-center"
                        title="Export to .TXT"
                        aria-label="Export plain text file"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleExportDocx}
                        disabled={!plainText}
                        className="p-2 rounded-lg text-zinc-500 hover:text-indigo-600 hover:bg-white transition-all disabled:opacity-30 disabled:hover:text-zinc-500 min-h-[36px] min-w-[36px] flex items-center justify-center"
                        title="Export to .DOCX (Word)"
                        aria-label="Export Microsoft Word document"
                      >
                        <FileOutput className="w-4 h-4" />
                      </button>
                    </div>

                    <button
                      onClick={handleCopy}
                      disabled={!plainText}
                      className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all min-h-[38px] active:scale-95 ${
                        copied 
                          ? 'bg-emerald-600 text-white shadow-emerald-100 shadow-md' 
                          : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100 shadow-md disabled:opacity-40 disabled:cursor-not-allowed'
                      }`}
                      aria-label="Copy plain text to clipboard"
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      <span>{copied ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <div className="flex-1 p-4 sm:p-6 overflow-auto bg-zinc-50/30 min-h-[300px] sm:min-h-[380px]">
                  {plainText ? (
                    <pre className="whitespace-pre-wrap font-sans text-sm sm:text-base leading-relaxed text-zinc-800 selection:bg-indigo-100">
                      {plainText}
                    </pre>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-300 gap-3 py-16 text-center">
                      <div className="w-12 h-12 rounded-full border-2 border-dashed border-zinc-200 flex items-center justify-center animate-pulse">
                        <ArrowRightLeft className="w-5 h-5 text-zinc-400" />
                      </div>
                      <p className="text-xs sm:text-sm font-medium text-zinc-400">Converted plain text appears here automatically</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </main>

        {/* Sidebar Drawer: Assets & Document Insights (Fully responsive modal on mobile) */}
        <AnimatePresence mode="wait">
          {showAssets && (
            <>
              {/* Mobile Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowAssets(false)}
                className="fixed inset-0 bg-zinc-900/40 backdrop-blur-xs z-40 lg:hidden"
              />

              <motion.aside
                initial={{ x: '100%', opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: '100%', opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                className="fixed lg:absolute right-0 top-0 bottom-0 w-full sm:w-96 max-w-full bg-white border-l border-zinc-200 shadow-2xl z-50 flex flex-col"
              >
                <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-indigo-100 shadow-lg">
                      <Wand2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-bold text-zinc-900 text-base leading-tight">Insights</h2>
                      <p className="text-[10px] uppercase font-bold text-zinc-400 tracking-widest">Safety & Sources</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowAssets(false)}
                    className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    aria-label="Close Insights Drawer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-6 space-y-6 scrollbar-thin scrollbar-thumb-zinc-200">
                  {/* Local safety and privacy scan */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        Safety & Privacy
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        safetyFindings.length ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                      }`}>
                        {safetyStatus}
                      </span>
                    </div>

                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3.5 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-white border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                          {isDeepScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanSearch className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-zinc-900">Deep local scan</span>
                            <span className="text-[9px] uppercase font-black tracking-wide bg-white text-indigo-600 px-1.5 py-0.5 rounded-md border border-indigo-100">
                              Optional
                            </span>
                          </div>
                          <p className="text-[10px] text-zinc-500 leading-relaxed mt-1">
                            Finds English names, addresses and identity details that exact pattern matching can miss.
                          </p>
                        </div>
                      </div>

                      {isDeepScanning && (
                        <div className="space-y-1.5" aria-live="polite">
                          <div className="h-1.5 rounded-full bg-white overflow-hidden border border-indigo-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={deepScanProgress ?? undefined}>
                            <div
                              className={`h-full bg-indigo-600 rounded-full transition-[width] duration-300 ${deepScanProgress === null ? 'w-1/3 animate-pulse' : ''}`}
                              style={deepScanProgress === null ? undefined : { width: `${deepScanProgress}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-2 text-[10px] text-indigo-700">
                            <span>
                              {deepScanStatus === 'loading'
                                ? deepScanProgress === null ? 'Preparing private model…' : `Downloading model… ${deepScanProgress}%`
                                : `Checking document… ${deepScanProgress ?? 0}%`}
                            </span>
                            <button onClick={cancelDeepScan} className="font-bold inline-flex items-center gap-1 hover:text-indigo-900 min-h-[28px] px-1">
                              <Square className="w-2.5 h-2.5 fill-current" /> Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {deepScanStatus === 'complete' && (
                        <div className="rounded-xl bg-white/80 border border-indigo-100 px-3 py-2 text-[10px] text-zinc-600 flex items-center justify-between gap-2">
                          <span>
                            <strong className="text-zinc-900">Deep scan complete.</strong>{' '}
                            {modelFindingCount ? `${modelFindingCount} additional finding${modelFindingCount === 1 ? '' : 's'}.` : 'No additional PII found.'}
                          </span>
                          <button onClick={handleDeepScan} className="font-bold text-indigo-600 hover:text-indigo-800 shrink-0 min-h-[28px]">Scan again</button>
                        </div>
                      )}

                      {deepScanStatus === 'error' && (
                        <div className="rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-[10px] text-red-700">
                          <p>{deepScanError}</p>
                          <button onClick={handleDeepScan} className="font-bold mt-1.5 min-h-[28px] hover:text-red-900">Retry deep scan</button>
                        </div>
                      )}

                      {!isDeepScanning && deepScanStatus !== 'complete' && deepScanStatus !== 'error' && (
                        <button
                          onClick={handleDeepScan}
                          disabled={!markdown.trim()}
                          className="w-full min-h-[40px] rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          {deepModelReady ? 'Run deep scan' : `Enable deep scan · ~${PII_MODEL_DOWNLOAD_MB} MB`}
                        </button>
                      )}

                      <div className="flex items-start gap-1.5 text-[9px] text-zinc-400 leading-relaxed">
                        <Lock className="w-3 h-3 shrink-0 mt-px text-emerald-600" />
                        <span>
                          Your document stays on this device. The model downloads once from Hugging Face and is cached by your browser.
                          {deepScanRuntime && ` Using ${deepScanRuntime === 'webgpu' ? 'WebGPU acceleration' : 'compatibility mode'}.`}
                        </span>
                      </div>
                    </div>

                    {safetyFindings.length > 0 ? (
                      <>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={selectAllFindings}
                            className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800"
                          >
                            Select all
                          </button>
                          {selectedFindingIds.size > 0 && (
                            <button
                              onClick={handleRedactSelected}
                              disabled={deferredMarkdown !== markdown}
                              className="ml-auto bg-zinc-900 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-wait"
                            >
                              Redact {selectedFindingIds.size}
                            </button>
                          )}
                        </div>
                        <div className="space-y-2">
                          {safetyFindings.map(finding => (
                            <label
                              key={finding.id}
                              className={`block border rounded-xl p-3 cursor-pointer transition-colors ${
                                selectedFindingIds.has(finding.id)
                                  ? 'border-indigo-300 bg-indigo-50/60'
                                  : finding.severity === 'high'
                                    ? 'border-red-200 bg-red-50/50'
                                    : 'border-zinc-200 bg-zinc-50/60'
                              }`}
                            >
                              <div className="flex items-start gap-2.5">
                                <input
                                  type="checkbox"
                                  checked={selectedFindingIds.has(finding.id)}
                                  onChange={() => toggleFinding(finding.id)}
                                  className="mt-0.5 accent-indigo-600"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-zinc-900">{finding.title}</span>
                                    <span className={`ml-auto uppercase text-[8px] font-black px-1.5 py-0.5 rounded ${
                                      finding.severity === 'high'
                                        ? 'bg-red-100 text-red-700'
                                        : finding.severity === 'medium'
                                          ? 'bg-amber-100 text-amber-700'
                                          : 'bg-zinc-200 text-zinc-600'
                                    }`}>
                                      {finding.severity}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-zinc-500 mt-1">Line {finding.line} · {finding.detail}</p>
                                  <div className="flex items-center gap-1.5 mt-1.5">
                                    <span className={`text-[8px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${
                                      finding.source === 'local-ai'
                                        ? 'bg-indigo-100 text-indigo-700'
                                        : 'bg-zinc-200 text-zinc-600'
                                    }`}>
                                      {finding.source === 'local-ai' ? 'Local AI' : 'Exact match'}
                                    </span>
                                    {finding.confidence !== undefined && (
                                      <span className="text-[9px] font-bold text-zinc-500">{Math.round(finding.confidence * 100)}% confidence</span>
                                    )}
                                  </div>
                                  <code className="block mt-1.5 text-[10px] text-zinc-700 bg-white/80 rounded px-2 py-1 truncate">
                                    {finding.value.replace(/\s+/g, ' ')}
                                  </code>
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                        <p className="text-[10px] text-zinc-400 leading-relaxed">
                          Exact rules and optional local AI can both miss context. Review findings before sharing; detection is not a security guarantee.
                        </p>
                      </>
                    ) : (
                      <div className="rounded-xl bg-emerald-50/60 border border-emerald-100 px-3 py-2.5 text-[11px] text-emerald-700">
                        No obvious secrets, private data, hidden text, or injection instructions detected locally.
                      </div>
                    )}
                  </div>

                  {/* Optional semantic structure insights */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                        <Search className="w-3.5 h-3.5 text-violet-600" />
                        Semantic Insights
                      </div>
                      {semanticStatus === 'complete' && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-violet-50 text-violet-700">
                          {semanticMatches.length ? `${semanticMatches.length} similar` : 'No duplicates'}
                        </span>
                      )}
                    </div>
                    <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-3.5 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-white border border-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                          {isSemanticScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-zinc-900">Find similar passages</span>
                            <span className="text-[9px] uppercase font-black tracking-wide bg-white text-violet-600 px-1.5 py-0.5 rounded-md border border-violet-100">Optional</span>
                          </div>
                          <p className="text-[10px] text-zinc-500 leading-relaxed mt-1">
                            Compare substantial paragraphs locally to spot repetition before you publish or study.
                          </p>
                        </div>
                      </div>

                      {isSemanticScanning && (
                        <div className="space-y-1.5" aria-live="polite">
                          <div className="h-1.5 rounded-full bg-white overflow-hidden border border-violet-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={semanticProgress ?? undefined}>
                            <div
                              className={`h-full bg-violet-600 rounded-full transition-[width] duration-300 ${semanticProgress === null ? 'w-1/3 animate-pulse' : ''}`}
                              style={semanticProgress === null ? undefined : { width: `${semanticProgress}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-2 text-[10px] text-violet-700">
                            <span>{semanticStatus === 'loading' ? semanticProgress === null ? 'Preparing local embeddings…' : `Downloading model… ${semanticProgress}%` : `Comparing passages… ${semanticProgress ?? 0}%`}</span>
                            <button onClick={cancelSemanticScan} className="font-bold inline-flex items-center gap-1 hover:text-violet-900 min-h-[28px] px-1"><Square className="w-2.5 h-2.5 fill-current" /> Cancel</button>
                          </div>
                        </div>
                      )}

                      {semanticStatus === 'complete' && (
                        semanticMatches.length > 0 ? (
                          <div className="space-y-2">
                            {semanticMatches.map(match => (
                              <div key={`${match.first.id}-${match.second.id}`} className="rounded-xl bg-white/80 border border-violet-100 px-3 py-2.5 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[9px] uppercase font-black tracking-wide text-violet-700">{formatSemanticScore(match.score)}</span>
                                  <span className="text-[9px] text-zinc-400">Paragraphs {match.first.id + 1} & {match.second.id + 1}</span>
                                </div>
                                <p className="text-[10px] text-zinc-600 leading-relaxed">{match.first.text.replace(/\s+/g, ' ').slice(0, 150)}{match.first.text.length > 150 ? '…' : ''}</p>
                                <p className="text-[10px] text-zinc-600 leading-relaxed border-t border-violet-50 pt-2">{match.second.text.replace(/\s+/g, ' ').slice(0, 150)}{match.second.text.length > 150 ? '…' : ''}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-xl bg-white/80 border border-violet-100 px-3 py-2 text-[10px] text-violet-700">
                            No likely duplicate passages found across {semanticSegmentCount} substantial paragraphs.
                          </div>
                        )
                      )}

                      {semanticStatus === 'error' && (
                        <div className="rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-[10px] text-red-700">
                          <p>{semanticError}</p>
                          <button onClick={handleSemanticScan} className="font-bold mt-1.5 min-h-[28px] hover:text-red-900">Retry analysis</button>
                        </div>
                      )}

                      {!isSemanticScanning && semanticStatus !== 'complete' && semanticStatus !== 'error' && (
                        <button
                          onClick={handleSemanticScan}
                          disabled={!markdown.trim()}
                          className="w-full min-h-[40px] rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          <Search className="w-3.5 h-3.5" />
                          {semanticModelReady ? 'Analyze similar passages' : `Enable semantic insights · ~${SEMANTIC_MODEL_DOWNLOAD_MB} MB`}
                        </button>
                      )}
                      <div className="flex items-start gap-1.5 text-[9px] text-zinc-400 leading-relaxed">
                        <Lock className="w-3 h-3 shrink-0 mt-px text-emerald-600" />
                        <span>Paragraph embeddings are computed inside this browser; document text is not uploaded. {semanticRuntime && `Using ${semanticRuntime === 'webgpu' ? 'WebGPU acceleration' : 'compatibility mode'}.`}</span>
                      </div>
                    </div>
                  </div>

                  {conversion.brokenReferences.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                        Broken References
                      </div>
                      <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-[11px] text-amber-800">
                        No definition found for: {conversion.brokenReferences.join(', ')}
                      </div>
                    </div>
                  )}

                  {assets.length === 0 && safetyFindings.length === 0 && conversion.brokenReferences.length === 0 ? (
                    <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
                      <div className="w-14 h-14 rounded-2xl bg-zinc-100 flex items-center justify-center mb-1">
                        <Sparkles className="w-6 h-6 text-zinc-400" />
                      </div>
                      <p className="text-sm font-semibold text-zinc-700">No assets detected yet</p>
                      <p className="text-xs text-zinc-400 max-w-[220px]">
                        Links, images, emails, and document insights will automatically populate here.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <AssetList title="Links" icon={<LinkIcon className="w-3.5 h-3.5" />} items={assets.filter(a => a.type === 'link')} />
                      <AssetList title="Images" icon={<ImageIcon className="w-3.5 h-3.5" />} items={assets.filter(a => a.type === 'image')} />
                      <AssetList title="Emails" icon={<Mail className="w-3.5 h-3.5" />} items={assets.filter(a => a.type === 'email')} />
                    </div>
                  )}
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Stats Bar (Responsive Wrapping) */}
      <div className="w-full border-t border-b border-zinc-200 bg-white z-20 shadow-[0_-1px_3px_rgba(0,0,0,0.02)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row gap-2 sm:gap-6 justify-between items-center text-zinc-500 text-[11px] font-medium">
          <div className="flex items-center gap-4 sm:gap-6">
            <span className="flex items-center gap-2 font-mono">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
              <span>Words: <strong className="text-zinc-800">{markdown.trim() ? markdown.trim().split(/\s+/).length : 0}</strong></span>
            </span>
            <span className="flex items-center gap-2 font-mono">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Characters: <strong className="text-zinc-800">{markdown.length}</strong></span>
            </span>
            {assets.length > 0 && (
              <span className="hidden xs:flex items-center gap-2 font-mono">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span>Assets: <strong className="text-zinc-800">{assets.length}</strong></span>
              </span>
            )}
          </div>
          <div className="text-zinc-400 text-[10px] text-center sm:text-right">
            <span>Powered by a <code className="bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-600 font-mono">local structured parser</code></span>
          </div>
        </div>
      </div>

      {/* SEO Content Section */}
      <SeoContent />

      {/* SEO Footer */}
      <SeoFooter />
    </div>
  );
}

function AssetList({ title, items, icon }: { title: string; items: ExtractedAsset[]; icon: React.ReactNode }) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider">
        <span className="text-indigo-600">{icon}</span>
        <span>{title}</span>
        <span className="text-[10px] bg-zinc-100 text-zinc-600 font-bold px-2 py-0.5 rounded-full ml-auto">
          {items.length}
        </span>
      </div>
      <div className="space-y-2">
        {items.map((asset, i) => (
          <div key={`${asset.value}-${i}`} className="flex items-center justify-between p-3 rounded-xl border border-zinc-200/80 bg-zinc-50/50 hover:bg-white hover:border-indigo-200 transition-all text-xs group">
            <div className="flex flex-col truncate pr-2">
              {asset.label && <span className="font-semibold text-zinc-800 truncate mb-0.5">{asset.label}</span>}
              <span className="text-zinc-500 truncate font-mono text-[11px]">{asset.value}</span>
            </div>
            <a 
              href={asset.type === 'email' ? `mailto:${asset.value}` : asset.value} 
              target="_blank" 
              rel="noopener noreferrer"
              className="p-2 bg-white border border-zinc-200 text-zinc-500 hover:text-indigo-600 hover:border-indigo-200 rounded-xl transition-all shrink-0 min-h-[36px] min-w-[36px] flex items-center justify-center shadow-2xs"
              aria-label={`Open ${title} link`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
