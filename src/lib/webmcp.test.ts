import assert from 'node:assert/strict';
import test from 'node:test';
import { convertDocument } from './document/converter';
import { summarizeAgentHandoff } from './document/handoff';
import { scanDocument } from './document/scanner';
import {
  createHandoffApprovalFingerprint,
  createWebMcpTools,
  extractDocumentAssets,
  registerWebMcpTools,
  WEBMCP_OUTPUT_BUDGET,
  WEBMCP_TEXT_CHUNK_MAX,
  WEBMCP_TOOL_COUNT,
  type WebMCPRuntime,
} from './webmcp-tools';

const executeOptions = () => ({ signal: new AbortController().signal });

function makeRuntime(markdown = '# Approved\n\nSafe document content.'): WebMCPRuntime {
  const conversionMode = 'ai' as const;
  const appendReferences = true;
  const conversion = convertDocument(markdown, { mode: conversionMode, appendReferences });
  const safetyFindings = scanDocument(markdown);
  const base = {
    markdown,
    conversionMode,
    appendReferences,
    safetyFindings,
    deepScanStatus: 'complete' as const,
    importWarnings: [] as string[],
    brokenReferences: conversion.brokenReferences,
  };
  const approvalFingerprint = createHandoffApprovalFingerprint(base);
  const runtime: WebMCPRuntime = {
    markdown,
    plainText: conversion.text,
    conversionMode,
    appendReferences,
    importedFileName: null,
    importWarnings: [],
    imageRedactionActive: false,
    imageOcrCoordinatesReady: false,
    imageRedactionSuggestionCount: 0,
    assets: extractDocumentAssets(markdown, conversion.references),
    references: conversion.references,
    brokenReferences: conversion.brokenReferences,
    safetyFindings,
    deepScanStatus: 'complete',
    handoffSummary: summarizeAgentHandoff({
      markdown,
      plainText: conversion.text,
      conversionMode,
      appendReferences,
      references: conversion.references,
      brokenReferences: conversion.brokenReferences,
      safetyFindings,
      deepScanStatus: 'complete',
      importWarnings: [],
      humanApprovalGranted: true,
    }),
    approvalFingerprint,
    approvedFingerprint: approvalFingerprint,
    handoffApproved: true,
    replaceMarkdown: () => undefined,
    setConversionMode: () => undefined,
    setAppendReferences: () => undefined,
    setApprovedFingerprint: value => { runtime.approvedFingerprint = value; },
    handleCopy: async () => true,
    handleExportText: () => undefined,
    runDeepPrivacyScan: async () => ({ status: 'complete', modelFindingCount: 0, runtime: 'wasm' }),
    handleClear: () => undefined,
    setShowAssets: () => undefined,
  };
  return runtime;
}

function tool(runtime: WebMCPRuntime, name: string): WebMCP.ModelContextTool {
  const found = createWebMcpTools(() => runtime, 'Sample').find(candidate => candidate.name === name);
  assert.ok(found, `Missing tool ${name}`);
  return found;
}

function executeTool(
  runtime: WebMCPRuntime,
  name: string,
  input: Record<string, unknown> = {},
  options = executeOptions(),
): Promise<unknown> {
  return Promise.resolve(tool(runtime, name).execute(input, options));
}

test('tool declarations are unique, concise, schema-backed, and correctly annotated', () => {
  const tools = createWebMcpTools(() => makeRuntime(), 'Sample');
  assert.equal(tools.length, WEBMCP_TOOL_COUNT);
  assert.equal(new Set(tools.map(item => item.name)).size, tools.length);
  for (const item of tools) {
    assert.match(item.name, /^[A-Za-z0-9_.-]{1,30}$/);
    assert.ok(item.title);
    assert.ok(item.description.length <= 500);
    assert.ok(item.inputSchema);
    assert.equal((item.inputSchema as { type?: string }).type, 'object');
    assert.equal(typeof item.annotations?.readOnlyHint, 'boolean');
    const properties = (item.inputSchema as { properties?: Record<string, { description?: string }> }).properties ?? {};
    for (const [parameterName, parameter] of Object.entries(properties)) {
      assert.ok(parameterName.length <= 30);
      assert.ok((parameter.description?.length ?? 0) <= 150);
    }
  }
  for (const name of ['get_converted_text', 'list_document_assets']) {
    assert.equal(tools.find(item => item.name === name)?.annotations?.untrustedContentHint, true);
  }
});

test('content-free state does not expose an imported filename', async () => {
  const runtime = makeRuntime();
  runtime.importedFileName = 'private-client-name-contract.docx';
  const state = await executeTool(runtime, 'get_document_state') as Record<string, unknown>;
  assert.equal(state.hasImportedFile, true);
  assert.equal('importedFileName' in state, false);
  assert.doesNotMatch(JSON.stringify(state), /private-client-name/);
});

test('invalid tool input rejects instead of returning a successful error object', async () => {
  const runtime = makeRuntime();
  await assert.rejects(
    executeTool(runtime, 'set_conversion_options', { mode: 'invalid' }),
    /mode must be plain, readable, or ai/,
  );
  await assert.rejects(
    executeTool(runtime, 'set_document_content'),
    /text is required/,
  );
});

test('content reads require exact-snapshot approval and paginate bounded output', async () => {
  const runtime = makeRuntime(`Safe ${'content '.repeat(400)}`);
  runtime.approvedFingerprint = null;
  runtime.handoffApproved = false;
  await assert.rejects(
    executeTool(runtime, 'get_converted_text'),
    /Human approval is required/,
  );

  runtime.approvedFingerprint = runtime.approvalFingerprint;
  runtime.handoffApproved = true;
  const result = await executeTool(runtime, 'get_converted_text') as {
    text: string;
    nextCursor: number | null;
  };
  assert.ok(result.text.length <= WEBMCP_TEXT_CHUNK_MAX);
  assert.equal(result.nextCursor, WEBMCP_TEXT_CHUNK_MAX);
  assert.ok(JSON.stringify(result).length < 1_500);

  const next = await executeTool(
    runtime,
    'get_converted_text',
    { cursor: result.nextCursor, maxCharacters: 200 },
  ) as { text: string };
  assert.ok(next.text.length <= 200);
});

test('text pagination enforces its serialized budget for escape-heavy content', async () => {
  const runtime = makeRuntime(`Safe ${'\\\"\u0000\n'.repeat(500)}`);
  const result = await executeTool(runtime, 'get_converted_text') as { text: string; nextCursor: number | null };
  assert.ok(JSON.stringify(result).length <= WEBMCP_OUTPUT_BUDGET);
  assert.ok(result.text.length > 0);
  assert.notEqual(result.nextCursor, null);
});

test('asset and finding pages stay within the recommended response budget', async () => {
  const runtime = makeRuntime('Safe content');
  runtime.assets = Array.from({ length: 12 }, (_, index) => ({
    type: 'link' as const,
    value: `https://example.test/${index}/${'\\\"'.repeat(150)}`,
    label: `Label ${'\u0000'.repeat(120)}`,
  }));
  const assets = await executeTool(runtime, 'list_document_assets');
  assert.ok(JSON.stringify(assets).length <= WEBMCP_OUTPUT_BUDGET);
  assert.equal((assets as { items: unknown[] }).items.length, 2);

  const findingRuntime = makeRuntime('Email test@example.com and https://example.test');
  const findings = await executeTool(findingRuntime, 'get_safety_findings');
  assert.ok(JSON.stringify(findings).length <= WEBMCP_OUTPUT_BUDGET);
  assert.ok((findings as { findings: unknown[] }).findings.length <= 2);
});

test('document mutations synchronously invalidate approval', async () => {
  const runtime = makeRuntime();
  await executeTool(runtime, 'set_document_content', { text: '# Replacement' });
  assert.equal(runtime.handoffApproved, false);
  assert.equal(runtime.approvedFingerprint, null);
  await assert.rejects(
    executeTool(runtime, 'get_converted_text'),
    /Human approval is required/,
  );
});

test('deep scan tool stays pending and forwards execution cancellation', async () => {
  const runtime = makeRuntime();
  runtime.runDeepPrivacyScan = signal => new Promise((_resolve, reject) => {
    signal?.addEventListener('abort', () => {
      const error = new Error('cancelled');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  });
  const controller = new AbortController();
  const execution = executeTool(runtime, 'run_deep_privacy_scan', {}, { signal: controller.signal });
  controller.abort();
  await assert.rejects(execution, error => error instanceof Error && error.name === 'AbortError');
});

test('registration is atomic on partial failure', async () => {
  const runtime = makeRuntime();
  const tools = createWebMcpTools(() => runtime, 'Sample').slice(0, 2);
  let calls = 0;
  const modelContext = {
    registerTool: async () => {
      calls += 1;
      if (calls === 2) throw new Error('duplicate');
    },
  } as unknown as WebMCP.ModelContext;
  const controller = new AbortController();
  const errors: string[] = [];
  const result = await registerWebMcpTools(modelContext, tools, controller, name => errors.push(name));
  assert.deepEqual(result, { status: 'failed', count: 0 });
  assert.equal(controller.signal.aborted, true);
  assert.deepEqual(errors, [tools[1].name]);
});
