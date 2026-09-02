import { convertDocument } from './document/converter';
import { summarizeAgentHandoff, type AgentHandoffSummary } from './document/handoff';
import { redactFindingsSafely, scanDocument } from './document/scanner';
import type { DeepScanRuntime, DeepScanStatus } from './document/pii';
import type { ConversionMode, DocumentReference, SafetyFinding } from './document/types';
import {
  isRecord,
  optionalIntegerInput,
  stringArrayInput,
  stringInput,
  toolError,
} from './webmcp';

export const WEBMCP_TOOL_COUNT = 14;
export const WEBMCP_TEXT_CHUNK_MAX = 1_000;
export const WEBMCP_OUTPUT_BUDGET = 1_400;
const WEBMCP_CURSOR_MAX = 500_000;
const WEBMCP_ITEM_VALUE_MAX = 180;
const WEBMCP_LABEL_MAX = 80;
const WEBMCP_FINDINGS_PAGE_MAX = 2;
const WEBMCP_ASSETS_PAGE_MAX = 2;

export interface ExtractedAsset {
  type: 'link' | 'email' | 'image';
  value: string;
  label?: string;
}

export interface DeepScanResult {
  status: 'complete';
  modelFindingCount: number;
  runtime: DeepScanRuntime;
}

export interface HandoffApprovalInput {
  markdown: string;
  conversionMode: ConversionMode;
  appendReferences: boolean;
  safetyFindings: SafetyFinding[];
  deepScanStatus: DeepScanStatus;
  importWarnings: string[];
  brokenReferences: string[];
}

export function createHandoffApprovalFingerprint(input: HandoffApprovalInput): string {
  // Keep the canonical snapshot itself so authorization uses exact equality,
  // rather than a non-cryptographic revision hash that could theoretically collide.
  return JSON.stringify({
    markdown: input.markdown,
    conversionMode: input.conversionMode,
    appendReferences: input.appendReferences,
    safetyFindingIds: input.safetyFindings.map(finding => finding.id),
    deepScanStatus: input.deepScanStatus,
    importWarnings: input.importWarnings,
    brokenReferences: input.brokenReferences,
  });
}

export function extractDocumentAssets(markdown: string, references: DocumentReference[]): ExtractedAsset[] {
  const found: ExtractedAsset[] = references.map(reference => ({
    type: reference.kind === 'image' ? 'image' : 'link',
    value: reference.url,
    label: reference.label,
  }));
  let match: RegExpExecArray | null;

  const bareUrlRegex = /(?<!["'\(])(https?:\/\/[^\s\)\>]+)(?![^<]*>)/g;
  while ((match = bareUrlRegex.exec(markdown)) !== null) {
    if (!found.some(asset => asset.value === match![1])) found.push({ type: 'link', value: match[1] });
  }

  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  while ((match = emailRegex.exec(markdown)) !== null) found.push({ type: 'email', value: match[1] });

  return found;
}

export interface WebMCPRuntime {
  markdown: string;
  plainText: string;
  conversionMode: ConversionMode;
  appendReferences: boolean;
  importedFileName: string | null;
  importWarnings: string[];
  imageRedactionActive: boolean;
  imageOcrCoordinatesReady: boolean;
  imageRedactionSuggestionCount: number;
  assets: ExtractedAsset[];
  references: DocumentReference[];
  brokenReferences: string[];
  safetyFindings: SafetyFinding[];
  deepScanStatus: DeepScanStatus;
  handoffSummary: AgentHandoffSummary;
  approvalFingerprint: string;
  approvedFingerprint: string | null;
  handoffApproved: boolean;
  replaceMarkdown: (value: string) => void;
  setConversionMode: (value: ConversionMode) => void;
  setAppendReferences: (value: boolean) => void;
  setApprovedFingerprint: (value: string | null) => void;
  handleCopy: () => Promise<boolean>;
  handleExportText: () => void;
  runDeepPrivacyScan: (signal?: AbortSignal) => Promise<DeepScanResult>;
  handleClear: () => void;
  setShowAssets: (value: boolean) => void;
}

function isConversionMode(value: unknown): value is ConversionMode {
  return value === 'plain' || value === 'readable' || value === 'ai';
}

function truncate(value: string, maxLength: number): { value: string; truncated: boolean } {
  return value.length <= maxLength
    ? { value, truncated: false }
    : { value: value.slice(0, maxLength), truncated: true };
}

function truncateJsonString(
  value: string,
  maxCharacters: number,
  maxSerializedCharacters: number,
): { value: string; truncated: boolean } {
  const characterBounded = truncate(value, maxCharacters);
  if (JSON.stringify(characterBounded.value).length <= maxSerializedCharacters) return characterBounded;

  let low = 0;
  let high = characterBounded.value.length;
  let bestEnd = 0;
  while (low <= high) {
    const middle = low + ((high - low) >>> 1);
    const candidateEnd = avoidSplitSurrogate(characterBounded.value, 0, middle);
    if (JSON.stringify(characterBounded.value.slice(0, candidateEnd)).length <= maxSerializedCharacters) {
      bestEnd = Math.max(bestEnd, candidateEnd);
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return { value: characterBounded.value.slice(0, bestEnd), truncated: true };
}

function avoidSplitSurrogate(value: string, cursor: number, end: number): number {
  if (end <= cursor || end >= value.length) return end;
  const previous = value.charCodeAt(end - 1);
  const next = value.charCodeAt(end);
  return previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff
    ? end - 1
    : end;
}

function requireRuntime(getRuntime: () => WebMCPRuntime | null): WebMCPRuntime {
  return getRuntime() ?? toolError('The editor is not ready.');
}

function invalidateApproval(runtime: WebMCPRuntime): void {
  runtime.approvedFingerprint = null;
  runtime.handoffApproved = false;
  runtime.setApprovedFingerprint(null);
}

function refreshRuntimeSummary(runtime: WebMCPRuntime): void {
  runtime.approvalFingerprint = createHandoffApprovalFingerprint(runtime);
  runtime.handoffApproved = runtime.approvedFingerprint === runtime.approvalFingerprint;
  runtime.handoffSummary = summarizeAgentHandoff({
    markdown: runtime.markdown,
    plainText: runtime.plainText,
    conversionMode: runtime.conversionMode,
    appendReferences: runtime.appendReferences,
    references: runtime.references,
    brokenReferences: runtime.brokenReferences,
    safetyFindings: runtime.safetyFindings,
    deepScanStatus: runtime.deepScanStatus,
    importWarnings: runtime.importWarnings,
    humanApprovalGranted: runtime.handoffApproved,
  });
}

function updateWebMcpConversion(runtime: WebMCPRuntime, mode: ConversionMode, appendReferences: boolean): void {
  const nextConversion = convertDocument(runtime.markdown, { mode, appendReferences });
  invalidateApproval(runtime);
  runtime.conversionMode = mode;
  runtime.appendReferences = appendReferences;
  runtime.plainText = nextConversion.text;
  runtime.references = nextConversion.references;
  runtime.brokenReferences = nextConversion.brokenReferences;
  refreshRuntimeSummary(runtime);
}

function syncWebMcpDocument(runtime: WebMCPRuntime, markdown: string): void {
  const nextConversion = convertDocument(markdown, {
    mode: runtime.conversionMode,
    appendReferences: runtime.appendReferences,
  });
  runtime.markdown = markdown;
  runtime.importedFileName = null;
  runtime.importWarnings = [];
  runtime.imageRedactionActive = false;
  runtime.imageOcrCoordinatesReady = false;
  runtime.imageRedactionSuggestionCount = 0;
  runtime.assets = extractDocumentAssets(markdown, nextConversion.references);
  runtime.safetyFindings = scanDocument(markdown);
  runtime.deepScanStatus = 'idle';
  invalidateApproval(runtime);
  runtime.plainText = nextConversion.text;
  runtime.references = nextConversion.references;
  runtime.brokenReferences = nextConversion.brokenReferences;
  refreshRuntimeSummary(runtime);
}

function requireApproved(runtime: WebMCPRuntime): void {
  if (!runtime.handoffApproved || runtime.approvedFingerprint !== runtime.approvalFingerprint) {
    toolError('Human approval is required in the Insights panel before document content can be returned to an agent.');
  }
}

function pageArguments(input: unknown, maxLimit: number): { cursor: number; limit: number } {
  if (!isRecord(input)) toolError('Input must be an object.');
  if (input.cursor !== undefined && optionalIntegerInput(input, 'cursor', 0, WEBMCP_CURSOR_MAX) === undefined) {
    toolError(`cursor must be an integer from 0 to ${WEBMCP_CURSOR_MAX}.`);
  }
  if (input.limit !== undefined && optionalIntegerInput(input, 'limit', 1, maxLimit) === undefined) {
    toolError(`limit must be an integer from 1 to ${maxLimit}.`);
  }
  return {
    cursor: optionalIntegerInput(input, 'cursor', 0, WEBMCP_CURSOR_MAX) ?? 0,
    limit: optionalIntegerInput(input, 'limit', 1, maxLimit) ?? maxLimit,
  };
}

export function createWebMcpTools(
  getRuntime: () => WebMCPRuntime | null,
  sampleMarkdown: string,
): WebMCP.ModelContextTool[] {
  return [
    {
      name: 'get_document_state',
      title: 'Read document state',
      description: 'Read bounded document statistics, conversion settings, source counts, and local scan status without changing or returning document content.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async () => {
        const runtime = requireRuntime(getRuntime);
        return {
          markdownLength: runtime.markdown.length,
          wordCount: runtime.markdown.trim() ? runtime.markdown.trim().split(/\s+/).length : 0,
          outputLength: runtime.plainText.length,
          conversionMode: runtime.conversionMode,
          appendReferences: runtime.appendReferences,
          hasImportedFile: runtime.importedFileName !== null,
          importWarningCount: runtime.importWarnings.length,
          imageRedactionActive: runtime.imageRedactionActive,
          imageOcrCoordinatesReady: runtime.imageOcrCoordinatesReady,
          imageRedactionSuggestionCount: runtime.imageRedactionSuggestionCount,
          referenceCount: runtime.references.length,
          brokenReferenceCount: runtime.brokenReferences.length,
          assetCount: runtime.assets.length,
          safetyFindingCount: runtime.safetyFindings.length,
          deepScanStatus: runtime.deepScanStatus,
          humanApprovalGranted: runtime.handoffApproved,
        };
      },
    },
    {
      name: 'get_converted_text',
      title: 'Read approved text chunk',
      description: 'After human approval, return one bounded chunk of converted text. Continue with nextCursor until it is null.',
      inputSchema: {
        type: 'object',
        properties: {
          cursor: { type: 'integer', minimum: 0, maximum: WEBMCP_CURSOR_MAX, default: 0, description: 'Zero-based character offset for this chunk.' },
          maxCharacters: { type: 'integer', minimum: 1, maximum: WEBMCP_TEXT_CHUNK_MAX, default: WEBMCP_TEXT_CHUNK_MAX, description: 'Maximum characters to return in this chunk.' },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async input => {
        const runtime = requireRuntime(getRuntime);
        requireApproved(runtime);
        if (!isRecord(input)) toolError('Input must be an object.');
        if (input.cursor !== undefined && optionalIntegerInput(input, 'cursor', 0, WEBMCP_CURSOR_MAX) === undefined) {
          toolError(`cursor must be an integer from 0 to ${WEBMCP_CURSOR_MAX}.`);
        }
        if (input.maxCharacters !== undefined
          && optionalIntegerInput(input, 'maxCharacters', 1, WEBMCP_TEXT_CHUNK_MAX) === undefined) {
          toolError(`maxCharacters must be an integer from 1 to ${WEBMCP_TEXT_CHUNK_MAX}.`);
        }
        const cursor = optionalIntegerInput(input, 'cursor', 0, WEBMCP_CURSOR_MAX) ?? 0;
        const maxCharacters = optionalIntegerInput(input, 'maxCharacters', 1, WEBMCP_TEXT_CHUNK_MAX) ?? WEBMCP_TEXT_CHUNK_MAX;
        if (cursor > runtime.plainText.length) toolError('cursor is beyond the end of the converted text.');
        const requestedEnd = Math.min(cursor + maxCharacters, runtime.plainText.length);
        const makeResult = (end: number) => ({
          text: runtime.plainText.slice(cursor, end),
          cursor,
          nextCursor: end < runtime.plainText.length ? end : null,
          totalCharacters: runtime.plainText.length,
          mode: runtime.conversionMode,
        });
        let low = cursor;
        let high = requestedEnd;
        let bestEnd = cursor;
        while (low <= high) {
          const middle = low + ((high - low) >>> 1);
          const candidateEnd = avoidSplitSurrogate(runtime.plainText, cursor, middle);
          if (JSON.stringify(makeResult(candidateEnd)).length <= WEBMCP_OUTPUT_BUDGET) {
            bestEnd = Math.max(bestEnd, candidateEnd);
            low = middle + 1;
          } else {
            high = middle - 1;
          }
        }
        if (bestEnd === cursor && cursor < runtime.plainText.length) {
          const firstCodePoint = runtime.plainText.codePointAt(cursor) ?? 0;
          bestEnd = cursor + (firstCodePoint > 0xffff ? 2 : 1);
        }
        return makeResult(bestEnd);
      },
    },
    {
      name: 'set_document_content',
      title: 'Replace document content',
      description: 'Replace the visible Markdown document with supplied text and reset derived scans and approval. The content remains in the browser.',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', maxLength: 200000, description: 'Markdown, plain text, or compatible source content.' },
        },
        required: ['text'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: async input => {
        const text = stringInput(input, 'text', 200_000);
        if (text === null) toolError('text is required and must be a string of at most 200000 characters.');
        const runtime = requireRuntime(getRuntime);
        runtime.replaceMarkdown(text);
        syncWebMcpDocument(runtime, text);
        return { updated: true, markdownLength: text.length, outputLength: runtime.plainText.length, safetyFindingCount: runtime.safetyFindings.length };
      },
    },
    {
      name: 'set_conversion_options',
      title: 'Set conversion options',
      description: 'Set Plain, Readable, or AI-ready conversion and whether extracted references are appended. This updates the visible output and resets approval.',
      inputSchema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['plain', 'readable', 'ai'], description: 'Conversion mode.' },
          appendReferences: { type: 'boolean', description: 'Whether to append references and media.' },
        },
        minProperties: 1,
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: async input => {
        if (!isRecord(input)) toolError('Provide mode and/or appendReferences.');
        const mode = input.mode;
        const append = input.appendReferences;
        if (mode === undefined && append === undefined) toolError('Provide mode and/or appendReferences.');
        if (mode !== undefined && !isConversionMode(mode)) toolError('mode must be plain, readable, or ai.');
        if (append !== undefined && typeof append !== 'boolean') toolError('appendReferences must be boolean.');
        const runtime = requireRuntime(getRuntime);
        const nextMode = isConversionMode(mode) ? mode : runtime.conversionMode;
        const nextAppendReferences = typeof append === 'boolean' ? append : runtime.appendReferences;
        if (mode !== undefined) runtime.setConversionMode(nextMode);
        if (append !== undefined) runtime.setAppendReferences(nextAppendReferences);
        updateWebMcpConversion(runtime, nextMode, nextAppendReferences);
        return { updated: true, conversionMode: nextMode, appendReferences: nextAppendReferences, approvalReset: true };
      },
    },
    {
      name: 'list_document_assets',
      title: 'List approved assets',
      description: 'After human approval, list a bounded page of links, images, emails, references, and broken references extracted from the document.',
      inputSchema: {
        type: 'object',
        properties: {
          cursor: { type: 'integer', minimum: 0, maximum: WEBMCP_CURSOR_MAX, default: 0, description: 'Zero-based item offset.' },
          limit: { type: 'integer', minimum: 1, maximum: WEBMCP_ASSETS_PAGE_MAX, default: WEBMCP_ASSETS_PAGE_MAX, description: 'Maximum items to return.' },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async input => {
        const runtime = requireRuntime(getRuntime);
        requireApproved(runtime);
        const { cursor, limit } = pageArguments(input, WEBMCP_ASSETS_PAGE_MAX);
        const items = [
          ...runtime.assets.map(asset => ({ category: 'asset' as const, type: asset.type, value: asset.value, label: asset.label })),
          ...runtime.references.map(reference => ({ category: 'reference' as const, type: reference.kind, value: reference.url, label: reference.label })),
          ...runtime.brokenReferences.map(value => ({ category: 'broken-reference' as const, type: 'reference' as const, value, label: undefined })),
        ];
        if (cursor > items.length) toolError('cursor is beyond the end of the asset list.');
        const end = Math.min(cursor + limit, items.length);
        const page = items.slice(cursor, end).map(item => {
          // Bound both source characters and JSON-escaped size. Control characters
          // can expand sixfold when the tool result is serialized for the model.
          const value = truncateJsonString(item.value, WEBMCP_ITEM_VALUE_MAX, 280);
          const label = item.label ? truncateJsonString(item.label, WEBMCP_LABEL_MAX, 100) : null;
          return {
            category: item.category,
            type: item.type,
            value: value.value,
            valueTruncated: value.truncated,
            label: label?.value,
            labelTruncated: label?.truncated ?? false,
          };
        });
        return { items: page, cursor, nextCursor: end < items.length ? end : null, totalItems: items.length };
      },
    },
    {
      name: 'get_safety_findings',
      title: 'Read privacy findings',
      description: 'Read a bounded page of content-free local privacy findings with stable IDs that can be reviewed and passed to the redaction tool.',
      inputSchema: {
        type: 'object',
        properties: {
          cursor: { type: 'integer', minimum: 0, maximum: WEBMCP_CURSOR_MAX, default: 0, description: 'Zero-based finding offset.' },
          limit: { type: 'integer', minimum: 1, maximum: WEBMCP_FINDINGS_PAGE_MAX, default: WEBMCP_FINDINGS_PAGE_MAX, description: 'Maximum findings to return.' },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async input => {
        const runtime = requireRuntime(getRuntime);
        const { cursor, limit } = pageArguments(input, WEBMCP_FINDINGS_PAGE_MAX);
        if (cursor > runtime.safetyFindings.length) toolError('cursor is beyond the end of the findings list.');
        const end = Math.min(cursor + limit, runtime.safetyFindings.length);
        const findings = runtime.safetyFindings.slice(cursor, end).map(finding => ({
          id: finding.id,
          type: finding.type,
          severity: finding.severity,
          title: truncate(finding.title, 100).value,
          detail: truncate(finding.detail, 180).value,
          line: finding.line,
          placeholder: truncate(finding.placeholder, 60).value,
          source: finding.source,
          confidence: finding.confidence,
        }));
        return { findings, cursor, nextCursor: end < runtime.safetyFindings.length ? end : null, totalFindings: runtime.safetyFindings.length };
      },
    },
    {
      name: 'get_handoff_readiness',
      title: 'Check agent handoff readiness',
      description: 'Return a content-free checklist for conversion, references, import warnings, privacy scans, and human approval.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async () => requireRuntime(getRuntime).handoffSummary,
    },
    {
      name: 'prepare_agent_handoff',
      title: 'Prepare agent handoff',
      description: 'Switch the visible document to AI-ready mode, optionally append references, and open local Insights. This does not return, upload, or redact content.',
      inputSchema: {
        type: 'object',
        properties: {
          appendReferences: { type: 'boolean', default: true, description: 'Append references and media to AI-ready output.' },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: async input => {
        if (!isRecord(input)) toolError('Input must be an object.');
        const append = input.appendReferences;
        if (append !== undefined && typeof append !== 'boolean') toolError('appendReferences must be boolean.');
        const runtime = requireRuntime(getRuntime);
        if (!runtime.markdown.trim()) toolError('Add document content before preparing an agent handoff.');
        runtime.setConversionMode('ai');
        const nextAppendReferences = typeof append === 'boolean' ? append : true;
        runtime.setAppendReferences(nextAppendReferences);
        updateWebMcpConversion(runtime, 'ai', nextAppendReferences);
        runtime.setShowAssets(true);
        return { updated: true, conversionMode: 'ai', appendReferences: nextAppendReferences, approvalReset: true, nextTool: 'get_handoff_readiness' };
      },
    },
    {
      name: 'run_deep_privacy_scan',
      title: 'Run deep privacy scan',
      description: 'Run the optional local AI privacy scan to completion. The operation stays in-browser and can be cancelled while it is running.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false },
      execute: async (_input, { signal }) => {
        const runtime = requireRuntime(getRuntime);
        if (!runtime.markdown.trim()) toolError('Add document content before running a privacy scan.');
        runtime.setShowAssets(true);
        const result = await runtime.runDeepPrivacyScan(signal);
        return { ...result, privacy: 'local-only', nextTool: 'get_handoff_readiness' };
      },
    },
    {
      name: 'redact_document_findings',
      title: 'Redact privacy findings',
      description: 'Replace explicitly reviewed finding IDs with placeholders in the visible document. This mutation resets scans and approval.',
      inputSchema: {
        type: 'object',
        properties: {
          findingIds: { type: 'array', items: { type: 'string', maxLength: 100 }, minItems: 1, maxItems: 100, description: 'Reviewed IDs from get_safety_findings.' },
        },
        required: ['findingIds'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: async input => {
        if (!isRecord(input)) toolError('Provide findingIds from get_safety_findings after reviewing them.');
        const runtime = requireRuntime(getRuntime);
        const selected = stringArrayInput(input, 'findingIds', 100, 100);
        if (selected === null || !selected.length) toolError('findingIds must be a non-empty array of at most 100 strings.');
        const known = new Set(runtime.safetyFindings.map(finding => finding.id));
        const unknown = selected.filter(id => !known.has(id));
        if (unknown.length) toolError(`Unknown finding ID: ${unknown[0]}`);
        const result = redactFindingsSafely(runtime.markdown, runtime.safetyFindings, new Set(selected));
        if (result.staleIds.length) toolError('The document changed after these findings were produced. Read the refreshed findings and try again.');
        runtime.replaceMarkdown(result.text);
        syncWebMcpDocument(runtime, result.text);
        return { redacted: result.redactedIds.length, overlapMerged: result.overlapMergedIds.length, updated: true, remainingFindingCount: runtime.safetyFindings.length, approvalReset: true };
      },
    },
    {
      name: 'copy_converted_text',
      title: 'Copy approved text',
      description: 'Copy the approved converted output to the clipboard using the same visible action as the human interface.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false },
      execute: async () => {
        const runtime = requireRuntime(getRuntime);
        if (!runtime.plainText) toolError('There is no converted output to copy.');
        requireApproved(runtime);
        const copied = await runtime.handleCopy();
        if (!copied) toolError('The browser did not allow clipboard access.');
        return { copied: true, characters: runtime.plainText.length };
      },
    },
    {
      name: 'download_converted_text',
      title: 'Download approved text',
      description: 'Download the approved converted output as a local text file using the same visible export action as the human interface.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false },
      execute: async () => {
        const runtime = requireRuntime(getRuntime);
        if (!runtime.plainText) toolError('There is no converted output to download.');
        requireApproved(runtime);
        runtime.handleExportText();
        return { downloadStarted: true, filename: 'converted-text.txt' };
      },
    },
    {
      name: 'clear_document',
      title: 'Clear document',
      description: 'Clear the visible document, imported-file state, scan results, approval, and conversion output.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false },
      execute: async () => {
        const runtime = requireRuntime(getRuntime);
        runtime.handleClear();
        syncWebMcpDocument(runtime, '');
        return { cleared: true, approvalReset: true };
      },
    },
    {
      name: 'insert_sample_document',
      title: 'Insert sample document',
      description: 'Insert the built-in sample document into the visible editor and reset scans and approval.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false },
      execute: async () => {
        const runtime = requireRuntime(getRuntime);
        runtime.replaceMarkdown(sampleMarkdown);
        syncWebMcpDocument(runtime, sampleMarkdown);
        return { inserted: true, markdownLength: sampleMarkdown.length, approvalReset: true };
      },
    },
  ];
}

export async function registerWebMcpTools(
  modelContext: WebMCP.ModelContext,
  tools: WebMCP.ModelContextTool[],
  controller: AbortController,
  onError: (toolName: string, error: unknown) => void = () => undefined,
): Promise<{ status: 'ready' | 'failed' | 'aborted'; count: number }> {
  const results = await Promise.all(tools.map(async tool => {
    try {
      await modelContext.registerTool(tool, { signal: controller.signal });
      return true;
    } catch (error) {
      if (!controller.signal.aborted) onError(tool.name, error);
      return false;
    }
  }));

  if (controller.signal.aborted) return { status: 'aborted', count: 0 };
  const registeredCount = results.filter(Boolean).length;
  if (registeredCount !== tools.length) {
    controller.abort();
    return { status: 'failed', count: 0 };
  }
  return { status: 'ready', count: registeredCount };
}
