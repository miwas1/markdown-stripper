import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Pencil,
  ScanSearch,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { trackEvent, sizeBucket } from '../lib/analytics';
import {
  collectRedactionRects,
  normalizeRect,
  redactedImageFileName,
  renderRedactedImage,
  type ImageRedactionSuggestion,
  type ImageVerificationResult,
  type NormalizedRect,
} from '../lib/document/image-redaction';
import type { DeepScanStatus } from '../lib/document/pii';

interface ImageRedactionWorkspaceProps {
  file: File;
  suggestions: ImageRedactionSuggestion[];
  ocrComplete: boolean;
  mappingStale: boolean;
  deepScanStatus: DeepScanStatus;
  onRunDeepScan: () => void;
  onVerify: (image: Blob, selectedOriginalValues: string[]) => Promise<ImageVerificationResult>;
}

type ExportStatus = 'idle' | 'exporting' | 'complete' | 'error';
type VerificationStatus = 'idle' | 'running' | 'complete' | 'error';

function rectStyle(rect: NormalizedRect): React.CSSProperties {
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${rect.height * 100}%`,
  };
}

export function ImageRedactionWorkspace({
  file,
  suggestions,
  ocrComplete,
  mappingStale,
  deepScanStatus,
  onRunDeepScan,
  onVerify,
}: ImageRedactionWorkspaceProps) {
  const [previewUrl, setPreviewUrl] = useState('');
  const [drawing, setDrawing] = useState(false);
  const [previewRedactions, setPreviewRedactions] = useState(false);
  const [manualRects, setManualRects] = useState<NormalizedRect[]>([]);
  const [draftRect, setDraftRect] = useState<NormalizedRect | null>(null);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<Set<string>>(new Set());
  const [exportStatus, setExportStatus] = useState<ExportStatus>('idle');
  const [exportError, setExportError] = useState<string | null>(null);
  const [lastExport, setLastExport] = useState<Blob | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>('idle');
  const [verification, setVerification] = useState<ImageVerificationResult | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const seenSuggestionIdsRef = useRef(new Set<string>());

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setDrawing(false);
    setPreviewRedactions(false);
    setManualRects([]);
    setDraftRect(null);
    setSelectedSuggestionIds(new Set());
    seenSuggestionIdsRef.current = new Set();
    setExportStatus('idle');
    setLastExport(null);
    setVerificationStatus('idle');
    setVerification(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const currentIds = new Set(suggestions.map(suggestion => suggestion.id));
    setSelectedSuggestionIds(current => {
      const next = new Set([...current].filter(id => currentIds.has(id)));
      for (const suggestion of suggestions) {
        if (!seenSuggestionIdsRef.current.has(suggestion.id)) next.add(suggestion.id);
      }
      return next;
    });
    for (const id of currentIds) seenSuggestionIdsRef.current.add(id);
  }, [suggestions]);

  useEffect(() => {
    if (!mappingStale) return;
    seenSuggestionIdsRef.current.clear();
    setSelectedSuggestionIds(new Set());
  }, [mappingStale]);

  const redactionRects = useMemo(
    () => collectRedactionRects(suggestions, selectedSuggestionIds, manualRects),
    [manualRects, selectedSuggestionIds, suggestions],
  );
  const selectedSuggestions = useMemo(
    () => suggestions.filter(suggestion => selectedSuggestionIds.has(suggestion.id)),
    [selectedSuggestionIds, suggestions],
  );
  const selectionSignature = useMemo(
    () => JSON.stringify({ suggestions: [...selectedSuggestionIds].sort(), manualRects }),
    [manualRects, selectedSuggestionIds],
  );

  useEffect(() => {
    setLastExport(null);
    setExportStatus('idle');
    setVerificationStatus('idle');
    setVerification(null);
    setVerificationError(null);
  }, [selectionSignature]);

  const pointFromEvent = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drawing) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    drawStartRef.current = point;
    setDraftRect({ x: point.x, y: point.y, width: 0, height: 0 });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drawing || !drawStartRef.current) return;
    const point = pointFromEvent(event);
    setDraftRect(normalizeRect({
      x: drawStartRef.current.x,
      y: drawStartRef.current.y,
      width: point.x - drawStartRef.current.x,
      height: point.y - drawStartRef.current.y,
    }));
  };

  const finishDrawing = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drawing || !drawStartRef.current) return;
    const point = pointFromEvent(event);
    const rect = normalizeRect({
      x: drawStartRef.current.x,
      y: drawStartRef.current.y,
      width: point.x - drawStartRef.current.x,
      height: point.y - drawStartRef.current.y,
    });
    drawStartRef.current = null;
    setDraftRect(null);
    if (rect.width >= 0.004 && rect.height >= 0.004) setManualRects(current => [...current, rect]);
  };

  const cancelDrawing = () => {
    drawStartRef.current = null;
    setDraftRect(null);
  };

  const toggleSuggestion = (id: string) => {
    setSelectedSuggestionIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = async () => {
    if (!redactionRects.length || exportStatus === 'exporting') return;
    setExportStatus('exporting');
    setExportError(null);
    try {
      const blob = await renderRedactedImage(file, redactionRects);
      const { default: saveAs } = await import('file-saver');
      saveAs(blob, redactedImageFileName(file.name));
      setLastExport(blob);
      setExportStatus('complete');
      trackEvent('export_file', {
        feature: 'download',
        variant: 'image',
        sizeBucket: sizeBucket(file.size),
        outcome: 'success',
      });
    } catch (error) {
      setExportStatus('error');
      setExportError(error instanceof Error ? error.message : 'Could not export the redacted image.');
      trackEvent('export_file', {
        feature: 'download',
        variant: 'image',
        sizeBucket: sizeBucket(file.size),
        outcome: 'error',
      });
    }
  };

  const handleVerify = async () => {
    if (!lastExport || verificationStatus === 'running') return;
    setVerificationStatus('running');
    setVerification(null);
    setVerificationError(null);
    try {
      const result = await onVerify(lastExport, selectedSuggestions.map(suggestion => suggestion.value));
      setVerification(result);
      setVerificationStatus('complete');
    } catch (error) {
      setVerificationStatus('error');
      setVerificationError(error instanceof Error ? error.message : 'Could not verify the redacted image.');
    }
  };

  const deepScanning = deepScanStatus === 'loading' || deepScanStatus === 'scanning';

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm" aria-labelledby="image-redaction-title">
      <div className="flex flex-col gap-3 border-b border-zinc-100 bg-zinc-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <h2 id="image-redaction-title" className="text-sm font-bold text-zinc-900">Image redaction</h2>
            <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-500">Draw boxes immediately or use local OCR suggestions. Export is flattened at the original resolution.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            data-track-button="image_draw_toggle"
            type="button"
            aria-pressed={drawing}
            onClick={() => setDrawing(value => !value)}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-colors ${drawing ? 'bg-red-600 text-white' : 'border border-zinc-200 bg-white text-zinc-700 hover:border-red-200 hover:text-red-700'}`}
          >
            <Pencil className="h-3.5 w-3.5" />
            {drawing ? 'Drawing boxes' : 'Draw manually'}
          </button>
          <button
            data-track-button="image_preview_toggle"
            type="button"
            aria-pressed={previewRedactions}
            onClick={() => setPreviewRedactions(value => !value)}
            disabled={!redactionRects.length}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 hover:border-zinc-300 disabled:opacity-40"
          >
            {previewRedactions ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {previewRedactions ? 'Review boxes' : 'Preview result'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 p-3 sm:p-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0">
          <div className={`overflow-auto rounded-xl border bg-[linear-gradient(45deg,#f4f4f5_25%,transparent_25%),linear-gradient(-45deg,#f4f4f5_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f4f4f5_75%),linear-gradient(-45deg,transparent_75%,#f4f4f5_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px] p-2 ${drawing ? 'border-red-300' : 'border-zinc-200'}`}>
            <div className="flex min-h-56 items-center justify-center">
              {previewUrl && (
                <div className="relative inline-block max-w-full select-none leading-none">
                  <img src={previewUrl} alt={`Redaction preview for ${file.name}`} draggable={false} className="block max-h-[70vh] max-w-full" />

                  {suggestions.flatMap(suggestion => suggestion.rects.map((rect, index) => {
                    const selected = selectedSuggestionIds.has(suggestion.id);
                    return (
                      <button
                        key={`${suggestion.id}-${index}`}
                        type="button"
                        aria-label={`${selected ? 'Exclude' : 'Include'} ${suggestion.title} redaction`}
                        aria-pressed={selected}
                        title={suggestion.title}
                        onClick={() => toggleSuggestion(suggestion.id)}
                        className={`absolute z-10 border-2 transition-colors ${previewRedactions && selected ? 'border-black bg-black' : selected ? 'border-red-600 bg-red-500/30' : 'border-amber-500 bg-amber-300/15 border-dashed'}`}
                        style={rectStyle(rect)}
                      />
                    );
                  }))}

                  {manualRects.map((rect, index) => (
                    <div
                      key={`manual-${index}`}
                      className={`pointer-events-none absolute z-10 border-2 ${previewRedactions ? 'border-black bg-black' : 'border-fuchsia-600 bg-fuchsia-500/30'}`}
                      style={rectStyle(rect)}
                    />
                  ))}

                  {draftRect && (
                    <div className="pointer-events-none absolute z-30 border-2 border-red-600 bg-red-500/20" style={rectStyle(draftRect)} />
                  )}

                  <div
                    role={drawing ? 'application' : undefined}
                    aria-label={drawing ? 'Image drawing surface. Drag to add a redaction rectangle.' : undefined}
                    className={`absolute inset-0 z-20 touch-none ${drawing ? 'cursor-crosshair' : 'pointer-events-none'}`}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={finishDrawing}
                    onPointerCancel={cancelDrawing}
                  />
                </div>
              )}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-500">
            <span>{drawing ? 'Drag across anything sensitive. Small padding around text is safer.' : 'Click a suggested box to include or exclude it.'}</span>
            <span className="inline-flex items-center gap-1 text-emerald-700"><Lock className="h-3 w-3" /> Image stays on this device</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Redactions</span>
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-zinc-700">{redactionRects.length} boxes</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
              <div className="rounded-lg bg-white p-2"><strong className="block text-sm text-zinc-900">{selectedSuggestions.length}</strong>suggested findings</div>
              <div className="rounded-lg bg-white p-2"><strong className="block text-sm text-zinc-900">{manualRects.length}</strong>manual boxes</div>
            </div>
          </div>

          {mappingStale && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] leading-relaxed text-amber-800">
              OCR text was edited, so automatic image boxes are hidden. Run OCR again to refresh their coordinates; manual boxes remain available.
            </div>
          )}

          {!ocrComplete && !mappingStale && (
            <div className="rounded-xl border border-sky-100 bg-sky-50 p-3 text-[10px] leading-relaxed text-sky-800">
              Manual redaction is ready now. Run local OCR above to add text-based privacy suggestions.
            </div>
          )}

          {ocrComplete && !mappingStale && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
              <div className="flex items-start gap-2">
                <ScanSearch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" />
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-indigo-950">{suggestions.length ? `${suggestions.length} privacy suggestion${suggestions.length === 1 ? '' : 's'}` : 'No mapped privacy findings'}</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-indigo-700">OCR suggests text only. Review the whole image and manually cover faces, signatures, plates, or anything it misses.</p>
                </div>
              </div>
              {deepScanStatus !== 'complete' && (
                <button
                  data-track-button="image_deep_scan"
                  type="button"
                  onClick={onRunDeepScan}
                  disabled={deepScanning}
                  className="mt-2.5 inline-flex min-h-[34px] w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 text-[10px] font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {deepScanning ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                  {deepScanning ? 'Deep scanning locally…' : 'Add deep local PII scan'}
                </button>
              )}
            </div>
          )}

          {suggestions.length > 0 && (
            <div className="max-h-44 space-y-1.5 overflow-auto pr-1" aria-label="Automatic image redaction suggestions">
              {suggestions.map(suggestion => {
                const selected = selectedSuggestionIds.has(suggestion.id);
                return (
                  <label key={suggestion.id} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-2.5 ${selected ? 'border-red-200 bg-red-50/60' : 'border-zinc-200 bg-white'}`}>
                    <input type="checkbox" checked={selected} onChange={() => toggleSuggestion(suggestion.id)} className="mt-0.5 accent-red-600" />
                    <span className="min-w-0 text-[10px] leading-relaxed text-zinc-600">
                      <strong className="block text-[11px] text-zinc-900">{suggestion.title}</strong>
                      {suggestion.rects.length} image box{suggestion.rects.length === 1 ? '' : 'es'} · {suggestion.severity} severity
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {manualRects.length > 0 && (
            <div className="rounded-xl border border-fuchsia-100 bg-fuchsia-50/50 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold text-fuchsia-900">Manual boxes are always included</span>
                <button
                  data-track-button="image_clear_manual"
                  type="button"
                  onClick={() => setManualRects([])}
                  className="inline-flex min-h-[30px] items-center gap-1 rounded-lg px-2 text-[10px] font-bold text-fuchsia-700 hover:bg-fuchsia-100"
                >
                  <Trash2 className="h-3 w-3" /> Clear
                </button>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {manualRects.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setManualRects(current => current.filter((__, candidate) => candidate !== index))}
                    className="rounded-md border border-fuchsia-200 bg-white px-2 py-1 text-[9px] font-bold text-fuchsia-800 hover:border-red-300 hover:text-red-700"
                    aria-label={`Remove manual redaction box ${index + 1}`}
                  >
                    Box {index + 1} ×
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            data-track-button="image_export"
            type="button"
            onClick={handleExport}
            disabled={!redactionRects.length || exportStatus === 'exporting'}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-3 text-xs font-bold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {exportStatus === 'exporting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exportStatus === 'exporting' ? 'Flattening original image…' : 'Export redacted PNG'}
          </button>
          <p className="text-[9px] leading-relaxed text-zinc-400">Solid black pixels are written into a new PNG. Re-encoding removes embedded image metadata such as EXIF and GPS fields.</p>

          {exportError && <p className="rounded-lg bg-red-50 p-2 text-[10px] text-red-700">{exportError}</p>}

          {lastExport && (
            <button
              data-track-button="image_verify"
              type="button"
              onClick={handleVerify}
              disabled={verificationStatus === 'running'}
              className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
            >
              {verificationStatus === 'running' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}
              {verificationStatus === 'running' ? 'Checking exported pixels…' : 'Verify exported image locally'}
            </button>
          )}

          {verificationStatus === 'complete' && verification && (
            <div className={`rounded-xl border p-3 text-[10px] leading-relaxed ${verification.remainingFindingCount === 0 && verification.selectedValuesStillVisible === 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`} aria-live="polite">
              <div className="flex items-start gap-2">
                {verification.remainingFindingCount === 0 && verification.selectedValuesStillVisible === 0
                  ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                <span>
                  <strong className="block text-[11px]">{verification.remainingFindingCount === 0 && verification.selectedValuesStillVisible === 0 ? 'Verification passed' : 'Review recommended'}</strong>
                  {verification.hasReadableText
                    ? `${verification.remainingFindingCount} privacy finding${verification.remainingFindingCount === 1 ? '' : 's'} remained in OCR text; ${verification.selectedValuesStillVisible} selected value${verification.selectedValuesStillVisible === 1 ? '' : 's'} appeared readable.`
                    : 'No readable text was recovered from the exported image.'}
                  {verification.remainingFindingTitles.length > 0 && (
                    <span className="mt-1 block">Detected categories: {verification.remainingFindingTitles.join(', ')}.</span>
                  )}
                </span>
              </div>
            </div>
          )}
          {verificationError && <p className="rounded-lg bg-red-50 p-2 text-[10px] text-red-700">{verificationError}</p>}
        </div>
      </div>
    </section>
  );
}
